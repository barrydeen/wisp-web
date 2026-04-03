/**
 * NWC (Nostr Wallet Connect) implementation — NIP-47 protocol.
 * Reference: Mobile NwcRepository.kt + Nip47.kt
 */
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from "nostr-tools/nip04";
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt, getConversationKey } from "nostr-tools/nip44";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// --- Connection state ---

let connection = null;
let nwcPool = null;
let nwcSub = null;
const pendingRequests = new Map(); // eventId → { resolve, reject, timer }

let statusCallback = null;

export function onNwcStatus(cb) {
  statusCallback = cb;
}

function emitStatus(msg) {
  if (statusCallback) statusCallback(msg);
}

// --- URI Parsing ---

/**
 * Parse NWC connection URI.
 * Handles nostr+walletconnect:// and nwc:// prefixes.
 */
export function parseNwcUri(uri) {
  try {
    let normalized = uri.trim().replace("nostr+walletconnect://", "nwc://");

    // Fix unencoded relay URLs in query string
    const qIdx = normalized.indexOf("?");
    if (qIdx >= 0) {
      const base = normalized.substring(0, qIdx + 1);
      const query = normalized.substring(qIdx + 1);
      const fixedQuery = query.replace(/relay=([^&]+)/g, (match, val) => {
        val = val.trim();
        if (!val.includes("%3A") && !val.includes("%2F") && !val.includes("%3a") && !val.includes("%2f")) {
          return "relay=" + encodeURIComponent(decodeURIComponent(val).trim());
        }
        return match;
      });
      normalized = base + fixedQuery;
    }

    const url = new URL(normalized);
    const pubkeyHex = url.hostname || url.pathname.replace("//", "");
    const relayUrl = url.searchParams.get("relay");
    const secretHex = url.searchParams.get("secret");
    const lud16 = url.searchParams.get("lud16") || null;

    if (!pubkeyHex || !relayUrl || !secretHex) return null;

    const clientSecretBytes = hexToBytes(secretHex);
    const clientPubkeyHex = getPublicKey(clientSecretBytes);

    return { walletServicePubkey: pubkeyHex, relayUrl, clientSecretHex: secretHex, clientSecretBytes, clientPubkeyHex, lud16 };
  } catch {
    return null;
  }
}

// --- Connection ---

/**
 * Connect to an NWC wallet service.
 */
export async function connectNwc(parsed) {
  disconnectNwc();

  // Always precompute both keys so we can encrypt/decrypt with either scheme
  const conversationKey = getConversationKey(parsed.clientSecretBytes, parsed.walletServicePubkey);

  connection = {
    ...parsed,
    encryption: "nip44", // default to NIP-44 (modern standard per NIP-47)
    conversationKey,
  };

  nwcPool = new SimplePool();

  emitStatus("Connecting to relay " + parsed.relayUrl + "...");

  // Negotiate encryption — may downgrade to NIP-04 if wallet only supports it
  await negotiateEncryption();

  emitStatus("Subscribing for responses...");

  // Subscribe for NWC response events (kind 23195) addressed to us.
  // Use authors filter (wallet service pubkey) to be more specific.
  nwcSub = nwcPool.subscribeMany(
    [parsed.relayUrl],
    { kinds: [23195], "#p": [parsed.clientPubkeyHex] },
    {
      onevent(event) {
        handleResponse(event);
      },
    }
  );

  // Give the subscription a moment to establish on the relay before we
  // start publishing requests — avoids a race where the relay hasn't
  // finished processing REQ before it receives our EVENT.
  await new Promise((r) => setTimeout(r, 300));

  emitStatus("Connected");
}

/**
 * Fetch wallet service info event (kind 13194) to determine encryption support.
 */
async function negotiateEncryption() {
  emitStatus("Fetching wallet info...");

  try {
    const infoEvent = await Promise.race([
      nwcPool.get(
        [connection.relayUrl],
        { kinds: [13194], authors: [connection.walletServicePubkey], limit: 1 }
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);

    if (infoEvent) {
      const encTag = infoEvent.tags.find((t) => t[0] === "encryption");
      if (encTag) {
        const schemes = encTag[1].split(" ").map((s) => s.trim().toLowerCase());
        // Only downgrade to NIP-04 if the wallet explicitly lists nip04 but NOT nip44_v2
        if (schemes.includes("nip44_v2")) {
          connection.encryption = "nip44";
        } else {
          connection.encryption = "nip04";
        }
      } else {
        // No encryption tag = legacy NIP-04 only (per spec)
        connection.encryption = "nip04";
      }
    }
    // If no info event found, keep the default (NIP-44)
  } catch {
    // Timeout — keep the default (NIP-44)
  }

  emitStatus("Encryption: " + (connection.encryption === "nip44" ? "NIP-44" : "NIP-04"));
}

function handleResponse(event) {
  if (!connection) return;
  try {
    const decrypted = decryptContent(event.content);
    const obj = JSON.parse(decrypted);

    // Match by "e" tag pointing to request event id
    const eTag = event.tags.find((t) => t[0] === "e");
    const requestId = eTag ? eTag[1] : null;

    if (requestId && pendingRequests.has(requestId)) {
      const { resolve, reject, timer } = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      if (timer) clearTimeout(timer);

      if (obj.error && obj.error !== null) {
        reject(new Error(`${obj.error.code || "UNKNOWN"}: ${obj.error.message || "Unknown error"}`));
      } else {
        resolve({ resultType: obj.result_type, result: obj.result || {} });
      }
    }
  } catch (e) {
    console.error("[NWC] handleResponse error:", e, "event:", event.id);
    emitStatus("Response error: " + e.message);
  }
}

// --- Encryption ---

function encryptContent(plaintext) {
  if (connection.encryption === "nip44") {
    return nip44Encrypt(plaintext, connection.conversationKey);
  } else {
    return nip04Encrypt(connection.clientSecretHex, connection.walletServicePubkey, plaintext);
  }
}

function decryptContent(ciphertext) {
  const looksLikeNip04 = ciphertext.includes("?iv=");

  if (looksLikeNip04) {
    try {
      return nip04Decrypt(connection.clientSecretHex, connection.walletServicePubkey, ciphertext);
    } catch {
      return nip44Decrypt(ciphertext, connection.conversationKey);
    }
  } else {
    try {
      if (connection.conversationKey) {
        return nip44Decrypt(ciphertext, connection.conversationKey);
      }
      return nip04Decrypt(connection.clientSecretHex, connection.walletServicePubkey, ciphertext);
    } catch {
      return nip04Decrypt(connection.clientSecretHex, connection.walletServicePubkey, ciphertext);
    }
  }
}

// --- Request/Response ---

async function sendNwcRequest(method, params, timeoutMs = 10000) {
  if (!connection || !nwcPool) throw new Error("NWC not connected");

  const content = JSON.stringify({ method, params });
  const encrypted = encryptContent(content);

  const tags = [["p", connection.walletServicePubkey]];
  if (connection.encryption === "nip44") {
    tags.push(["encryption", "nip44_v2"]);
  }

  const event = finalizeEvent(
    {
      kind: 23194,
      content: encrypted,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    },
    connection.clientSecretBytes
  );

  // Register pending before publishing so we don't miss the response
  const promise = new Promise((resolve, reject) => {
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        pendingRequests.delete(event.id);
        emitStatus("Request timed out (" + method + ")");
        reject(new Error("NWC request timed out: " + method));
      }, timeoutMs);
    }
    pendingRequests.set(event.id, { resolve, reject, timer });
  });

  // Publish the request and check relay acceptance
  const results = await Promise.allSettled(nwcPool.publish([connection.relayUrl], event));
  const published = results.some((r) => r.status === "fulfilled");
  if (!published) {
    pendingRequests.delete(event.id);
    const reasons = results.map((r) => r.status === "rejected" ? r.reason : r.value).join("; ");
    throw new Error("Failed to publish NWC request: " + reasons);
  }

  emitStatus("Request sent (" + method + "), waiting...");

  return promise;
}

// --- Method wrappers ---

export async function nwcGetBalance() {
  emitStatus("Fetching balance...");
  const { result } = await sendNwcRequest("get_balance", {});
  const bal = result.balance || 0;
  emitStatus("Balance: " + Math.floor(bal / 1000) + " sats");
  return bal; // msats
}

export async function nwcPayInvoice(bolt11) {
  // No timeout for payments — they can take minutes to settle
  const { result } = await sendNwcRequest("pay_invoice", { invoice: bolt11 }, 0);
  return result.preimage || "";
}

export async function nwcMakeInvoice(amountMsats, description) {
  const { result } = await sendNwcRequest("make_invoice", { amount: amountMsats, description });
  return { invoice: result.invoice || "", paymentHash: result.payment_hash || "" };
}

export async function nwcListTransactions(limit = 50, offset = 0) {
  const { result } = await sendNwcRequest("list_transactions", { limit, offset });
  return (result.transactions || []).map((tx) => ({
    type: tx.type || "outgoing",
    description: tx.description || null,
    paymentHash: tx.payment_hash || "",
    amount: tx.amount || 0,
    feesPaid: tx.fees_paid || 0,
    createdAt: tx.created_at || 0,
    settledAt: tx.settled_at || null,
  }));
}

// --- Lifecycle ---

export function isNwcConnected() {
  return !!connection && !!nwcPool;
}

export function disconnectNwc() {
  if (nwcSub) {
    nwcSub.close();
    nwcSub = null;
  }
  if (nwcPool) {
    nwcPool.close([connection?.relayUrl].filter(Boolean));
    nwcPool = null;
  }
  // Reject all pending requests
  for (const [id, { reject, timer }] of pendingRequests) {
    if (timer) clearTimeout(timer);
    reject(new Error("NWC disconnected"));
  }
  pendingRequests.clear();
  connection = null;
}
