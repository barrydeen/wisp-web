/**
 * Zap sender — orchestrates the NIP-57 zap flow.
 * Reference: Mobile ZapSender.kt + SocialActionManager.kt
 */
import { createSignal } from "solid-js";
import { makeZapRequest } from "nostr-tools/nip57";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { normalizeURL } from "nostr-tools/utils";
import { resolveLud16, fetchZapInvoice } from "./lnurl";
import { payInvoice, isWalletConnected } from "./wallet";
import { getRelays, getPool } from "./pool";
import { getOutboxRelays, getInboxRelays } from "./relays";
import { INDEXER_RELAYS, getPubkey } from "./identity";

// --- In-flight zap tracking ---

const [zapInFlight, setZapInFlight] = createSignal({}); // { [eventId]: { status, amountSats } }

export function getZapInFlight(eventId) {
  return zapInFlight()[eventId] || null;
}

export function isZapping(eventId) {
  return !!zapInFlight()[eventId];
}

function setZapStatus(eventId, status, amountSats) {
  setZapInFlight((prev) => ({ ...prev, [eventId]: { status, amountSats } }));
}

function clearZapStatus(eventId) {
  setZapInFlight((prev) => {
    const next = { ...prev };
    delete next[eventId];
    return next;
  });
}

// Default zap amount presets (sats)
export const ZAP_PRESETS = [21, 100, 500, 1000, 5000];

/**
 * Send a zap to a note/event.
 *
 * @param {object} opts
 * @param {string} opts.recipientLud16 - Lightning address of recipient
 * @param {string} opts.recipientPubkey - Hex pubkey of recipient
 * @param {string} [opts.eventId] - Event ID being zapped (null for profile zaps)
 * @param {number} [opts.eventKind] - Kind of the event being zapped
 * @param {object[]} [opts.eventTags] - Tags of the event being zapped
 * @param {number} opts.amountSats - Amount in satoshis
 * @param {string} [opts.message] - Optional zap message
 * @param {boolean} [opts.isAnonymous] - Use throwaway keypair
 * @param {string[]} [opts.relayHints] - Extra relay URLs
 * @returns {Promise<void>}
 */
export async function sendZap(opts) {
  const {
    recipientLud16,
    recipientPubkey,
    eventId,
    eventKind,
    eventTags,
    amountSats,
    message = "",
    isAnonymous = false,
    relayHints = [],
  } = opts;

  if (!isWalletConnected()) throw new Error("No wallet connected");
  if (!recipientLud16) throw new Error("Recipient has no lightning address");

  const trackId = eventId || recipientPubkey;
  setZapStatus(trackId, "resolving", amountSats);

  try {
    // Step 1: Resolve LNURL
    const lnurlData = await resolveLud16(recipientLud16);

    const amountMsats = amountSats * 1000;
    if (amountMsats < lnurlData.minSendable) {
      throw new Error(`Minimum amount is ${Math.ceil(lnurlData.minSendable / 1000)} sats`);
    }
    if (amountMsats > lnurlData.maxSendable) {
      throw new Error(`Maximum amount is ${Math.floor(lnurlData.maxSendable / 1000)} sats`);
    }
    if (!lnurlData.allowsNostr) {
      throw new Error("Recipient's lightning address does not support Nostr zaps");
    }

    setZapStatus(trackId, "building", amountSats);

    // Step 2: Build zap request (kind 9734)
    // Relays: recipient's inbox (so they see the receipt) + our outbox (so the
    // LNURL provider can find it) + any extra hints, deduped, capped at 5.
    const recipientInbox = await fetchRecipientInboxRelays(recipientPubkey);
    const ourOutbox = getOutboxRelays();
    const zapRelays = dedupeUrls([...relayHints, ...recipientInbox, ...ourOutbox]).slice(0, 5);
    // Fallback if nothing resolved
    if (zapRelays.length === 0) zapRelays.push(...getRelays().slice(0, 3));

    const zapRequestParams = {
      pubkey: recipientPubkey,
      amount: amountMsats,
      relays: zapRelays,
      comment: message,
    };

    // If zapping an event, include it
    if (eventId) {
      zapRequestParams.event = {
        id: eventId,
        pubkey: recipientPubkey,
        kind: eventKind || 1,
        tags: eventTags || [],
      };
    }

    const zapRequestTemplate = makeZapRequest(zapRequestParams);

    // Step 3: Sign the zap request
    let signedZapRequest;
    if (isAnonymous) {
      // Use throwaway keypair
      const sk = generateSecretKey();
      signedZapRequest = finalizeEvent(zapRequestTemplate, sk);
    } else {
      // Sign via NIP-07 extension
      if (!window.nostr) throw new Error("No Nostr extension found");
      signedZapRequest = await window.nostr.signEvent(zapRequestTemplate);
    }

    setZapStatus(trackId, "fetching-invoice", amountSats);

    // Step 4: Fetch invoice from LNURL callback
    const zapRequestJson = JSON.stringify(signedZapRequest);
    const bolt11 = await fetchZapInvoice(lnurlData.callback, amountMsats, zapRequestJson);

    setZapStatus(trackId, "paying", amountSats);

    // Step 5: Pay the invoice
    await payInvoice(bolt11);

    setZapStatus(trackId, "success", amountSats);

    // Clear after a brief success display
    setTimeout(() => clearZapStatus(trackId), 2000);

  } catch (e) {
    setZapStatus(trackId, "error", amountSats);
    setTimeout(() => clearZapStatus(trackId), 3000);
    throw e;
  }
}

/**
 * Send a zap to a profile (no event).
 */
export async function sendZapToProfile(opts) {
  return sendZap({ ...opts, eventId: null, eventKind: null, eventTags: null });
}

// --- Helpers ---

function dedupeUrls(urls) {
  const seen = new Set();
  return urls.filter((u) => {
    if (!u) return false;
    try {
      const n = normalizeURL(u);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    } catch { return false; }
  });
}

/**
 * Fetch a pubkey's inbox (read) relays from their kind 10002 relay list.
 */
async function fetchRecipientInboxRelays(pubkey) {
  try {
    const pool = getPool();
    const event = await pool.get(
      [...INDEXER_RELAYS, ...getRelays()],
      { kinds: [10002], authors: [pubkey] },
    );
    if (!event) return [];
    const readRelays = [];
    for (const tag of event.tags) {
      if (tag[0] !== "r" || !tag[1]) continue;
      const marker = tag[2];
      // No marker = both read+write; "read" = read only
      if (!marker || marker === "read") {
        readRelays.push(tag[1]);
      }
    }
    return readRelays;
  } catch {
    return [];
  }
}
