/**
 * Breez SDK Spark integration — WASM wrapper.
 * Reference: Mobile SparkRepository.kt + Nip78.kt
 */
import { createSignal } from "solid-js";
import { getPool, getRelays, publishEvent } from "./pool";
import { getPubkey } from "./identity";
import { bytesToHex } from "@noble/hashes/utils.js";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const BREEZ_API_KEY = import.meta.env.VITE_BREEZ_API_KEY || "";

// Lazy-loaded SDK module (WASM is large, load on demand)
let sdkModule = null;
let sdk = null;
let eventListenerId = null;
let wasmInitialized = false;

let statusCallback = null;
let balanceCallback = null;
let paymentReceivedCallback = null;

export function onSparkStatus(cb) { statusCallback = cb; }
export function onSparkBalance(cb) { balanceCallback = cb; }
export function onSparkPaymentReceived(cb) { paymentReceivedCallback = cb; }

function emitStatus(msg) {
  if (statusCallback) statusCallback(msg);
}

// --- WASM + SDK Initialization ---

async function loadSdkModule() {
  if (sdkModule) return sdkModule;
  sdkModule = await import("@breeztech/breez-sdk-spark/web");
  return sdkModule;
}

export async function initSpark() {
  if (wasmInitialized) return;
  const mod = await loadSdkModule();
  // Use the default init which handles WASM loading internally.
  // In production builds, the WASM gets bundled as an asset.
  // In dev, optimizeDeps.exclude ensures the package is served from
  // node_modules directly so import.meta.url resolves correctly.
  await mod.default();
  wasmInitialized = true;
}

/**
 * Generate a new 12-word BIP39 mnemonic.
 */
export function newMnemonic() {
  return generateMnemonic(wordlist, 128);
}

/**
 * Validate a BIP39 mnemonic phrase.
 * @returns {string|null} Error message or null if valid.
 */
export function checkMnemonic(mnemonic) {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return "Recovery phrase must be 12, 15, 18, 21, or 24 words";
  }
  if (!validateMnemonic(mnemonic.trim().toLowerCase(), wordlist)) {
    return "Invalid recovery phrase";
  }
  return null;
}

/**
 * Connect to Spark wallet with a mnemonic.
 * @param {string} mnemonic - BIP39 mnemonic phrase
 */
export async function connectSpark(mnemonic) {
  await initSpark();
  const mod = sdkModule;

  emitStatus("Initializing Spark SDK...");

  const config = mod.defaultConfig("mainnet");
  if (BREEZ_API_KEY) config.apiKey = BREEZ_API_KEY;

  const seed = { type: "mnemonic", mnemonic };
  let builder = mod.SdkBuilder.new(config, seed);
  builder = await builder.withDefaultStorage("spark-data");

  emitStatus("Connecting...");
  sdk = await builder.build();

  // Register event listener
  const listener = {
    onEvent: (e) => {
      if (e.type === "synced") {
        emitStatus("Synced");
      } else if (e.type === "paymentSucceeded") {
        emitStatus("Payment succeeded");
        refreshBalance();
        if (e.payment && e.payment.paymentType === "receive") {
          const amountMsats = Number(e.payment.amount) * 1000;
          if (paymentReceivedCallback) paymentReceivedCallback(amountMsats);
        }
      } else if (e.type === "paymentFailed") {
        emitStatus("Payment failed");
      } else if (e.type === "paymentPending") {
        emitStatus("Payment pending");
      }
    },
  };
  eventListenerId = await sdk.addEventListener(listener);

  emitStatus("Connected to Spark");
  await refreshBalance();
}

export function isSparkConnected() {
  return !!sdk;
}

export async function disconnectSpark() {
  if (!sdk) return;
  try {
    if (eventListenerId) {
      await sdk.removeEventListener(eventListenerId);
    }
    await sdk.disconnect();
  } catch {
    // ignore cleanup errors
  }
  sdk = null;
  eventListenerId = null;
}

// --- Balance ---

async function refreshBalance() {
  try {
    if (!sdk) return;
    const info = await sdk.getInfo({});
    const balanceSats = info.balanceSats;
    if (balanceCallback) balanceCallback(balanceSats);
  } catch (e) {
    emitStatus("Balance refresh failed: " + e.message);
  }
}

export async function sparkFetchBalance() {
  if (!sdk) throw new Error("Spark not connected");
  const info = await sdk.getInfo({});
  const balanceSats = info.balanceSats;
  if (balanceCallback) balanceCallback(balanceSats);
  return balanceSats;
}

// --- Send ---

export async function sparkPayInvoice(bolt11) {
  if (!sdk) throw new Error("Spark not connected");
  emitStatus("Preparing payment...");

  const prepareResponse = await sdk.prepareSendPayment({ paymentRequest: bolt11 });

  emitStatus("Sending payment...");
  const sendResponse = await sdk.sendPayment({
    prepareResponse,
    options: { type: "bolt11Invoice", preferSpark: false, completionTimeoutSecs: 30 },
  });

  emitStatus("Payment sent");
  return sendResponse.payment.id;
}

/** Prepare a payment and return fee estimate + prepare data for two-step flow. */
export async function sparkPrepareSendPayment(bolt11) {
  if (!sdk) throw new Error("Spark not connected");
  const prepareResponse = await sdk.prepareSendPayment({ paymentRequest: bolt11 });

  let feeSats = null;
  const method = prepareResponse.paymentMethod;
  if (method.type === "bolt11Invoice") {
    feeSats = (method.sparkTransferFeeSats || 0) + (method.lightningFeeSats || 0);
  } else if (method.type === "sparkAddress" || method.type === "sparkInvoice") {
    feeSats = Number(method.fee) || 0;
  }

  return { feeSats, prepareResponse };
}

/** Send using a previously prepared response. */
export async function sparkSendPrepared(prepareResponse) {
  if (!sdk) throw new Error("Spark not connected");
  emitStatus("Sending payment...");
  const sendResponse = await sdk.sendPayment({
    prepareResponse,
    options: { type: "bolt11Invoice", preferSpark: false, completionTimeoutSecs: 30 },
  });
  emitStatus("Payment sent");
  return sendResponse.payment.id;
}

// --- Receive ---

export async function sparkMakeInvoice(amountSats, description) {
  if (!sdk) throw new Error("Spark not connected");
  emitStatus("Creating invoice...");

  const response = await sdk.receivePayment({
    paymentMethod: {
      type: "bolt11Invoice",
      description: description || "Wisp wallet",
      amountSats,
      expirySecs: 3600,
    },
  });

  emitStatus("Invoice created");
  return response.paymentRequest;
}

// --- Transactions ---

export async function sparkListPayments(limit = 50, offset = 0) {
  if (!sdk) throw new Error("Spark not connected");
  const response = await sdk.listPayments({
    limit,
    offset,
    sortAscending: false,
  });

  return response.payments.map((p) => ({
    id: p.id,
    type: p.paymentType === "send" ? "outgoing" : "incoming",
    amount: Number(p.amount),
    fees: Number(p.fees),
    description: p.details?.description || null,
    timestamp: p.timestamp,
    status: p.status,
    method: p.method,
  }));
}

// --- Parse ---

export async function sparkParse(input) {
  if (!sdk) throw new Error("Spark not connected");
  return sdk.parse(input);
}

// --- Lightning Address ---

export async function sparkGetLightningAddress() {
  if (!sdk) return null;
  try {
    const info = await sdk.getLightningAddress();
    return info?.lightningAddress || null;
  } catch {
    return null;
  }
}

export async function sparkCheckLightningAddressAvailable(username) {
  if (!sdk) throw new Error("Spark not connected");
  return sdk.checkLightningAddressAvailable({ username });
}

export async function sparkRegisterLightningAddress(username, description) {
  if (!sdk) throw new Error("Spark not connected");
  const info = await sdk.registerLightningAddress({
    username,
    description: description || "Wisp wallet",
  });
  return info.lightningAddress;
}

export async function sparkDeleteLightningAddress() {
  if (!sdk) throw new Error("Spark not connected");
  await sdk.deleteLightningAddress();
}

// --- Mnemonic Persistence ---

function mnemonicKey(pubkey) {
  return `wisp:spark:${pubkey}`;
}

export function saveMnemonic(pubkey, mnemonic) {
  localStorage.setItem(mnemonicKey(pubkey), mnemonic);
}

export function getMnemonic(pubkey) {
  return localStorage.getItem(mnemonicKey(pubkey));
}

export function clearMnemonic(pubkey) {
  localStorage.removeItem(mnemonicKey(pubkey));
}

export function hasMnemonic(pubkey) {
  return !!localStorage.getItem(mnemonicKey(pubkey));
}

// --- NIP-78 Relay Backup ---

function normalizeMnemonic(mnemonic) {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

async function computeWalletId(mnemonic) {
  const normalized = normalizeMnemonic(mnemonic);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToHex(hashArray).substring(0, 16);
}

/**
 * Backup mnemonic to relays as a NIP-78 event (kind 30078).
 * Mnemonic is NIP-44 encrypted to the user's own pubkey.
 */
export async function backupToRelays(mnemonic) {
  const normalized = normalizeMnemonic(mnemonic);
  const walletId = await computeWalletId(normalized);
  const dTag = `spark-wallet-backup:${walletId}`;

  // NIP-44 encrypt to self — need NIP-07 extension support
  if (!window.nostr?.nip44?.encrypt) {
    throw new Error("NIP-44 encryption not supported by your Nostr extension");
  }

  const pubkey = getPubkey();
  const encrypted = await window.nostr.nip44.encrypt(pubkey, normalized);

  const event = await publishEvent(
    {
      kind: 30078,
      content: encrypted,
      tags: [
        ["d", dTag],
        ["client", "wisp"],
        ["encryption", "nip44"],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    getRelays()
  );

  return event;
}

/**
 * Restore mnemonic from relay backup.
 * Queries relays for kind 30078 events authored by current user.
 * @returns {Promise<Array<{walletId: string, mnemonic: string}>>} Found backups
 */
export async function restoreFromRelays() {
  const pubkey = getPubkey();
  if (!pubkey) throw new Error("Not logged in");

  if (!window.nostr?.nip44?.decrypt) {
    throw new Error("NIP-44 decryption not supported by your Nostr extension");
  }

  const pool = getPool();
  const relays = getRelays();

  const events = await pool.querySync(relays, {
    kinds: [30078],
    authors: [pubkey],
  });

  // Filter to spark wallet backups
  const backupEvents = events.filter((e) => {
    const dTag = e.tags.find((t) => t[0] === "d");
    return dTag && dTag[1] && dTag[1].startsWith("spark-wallet-backup:");
  });

  const backups = [];
  for (const event of backupEvents) {
    // Skip deleted backups
    if (!event.content || event.tags.some((t) => t[0] === "deleted" && t[1] === "true")) continue;

    try {
      const decrypted = await window.nostr.nip44.decrypt(event.pubkey, event.content);
      const words = decrypted.trim().split(/\s+/);
      if ([12, 15, 18, 21, 24].includes(words.length)) {
        const dTag = event.tags.find((t) => t[0] === "d");
        const walletId = dTag[1].replace("spark-wallet-backup:", "");
        backups.push({ walletId, mnemonic: decrypted.trim() });
      }
    } catch {
      // Decryption failed — skip
    }
  }

  return backups;
}

/**
 * Delete a wallet backup from relays.
 */
export async function deleteBackupFromRelays(walletId) {
  const dTag = `spark-wallet-backup:${walletId}`;

  await publishEvent(
    {
      kind: 30078,
      content: "",
      tags: [
        ["d", dTag],
        ["deleted", "true"],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    getRelays()
  );
}
