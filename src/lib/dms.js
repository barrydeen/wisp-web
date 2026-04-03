import { createSignal, createMemo } from "solid-js";
import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";
import { getPool, getRelays } from "./pool";
import { getPubkey, INDEXER_RELAYS } from "./identity";
import { fetchCachedMultiKind } from "./event-cache";

const TWO_DAYS = 2 * 24 * 60 * 60;

// --- Reactive state ---
const [messages, setMessages] = createSignal([]);
const relayCache = new Map(); // pubkey -> { dmRelays: [], inboxRelays: [] }
let activeSub = null;

// --- AUTH helper ---
function createAuthCallback() {
  return async (evt) => await window.nostr.signEvent(evt);
}

// --- Relay discovery ---

// Fetch kind 10050 (DM relays) or fallback to kind 10002 (inbox relays)
export async function fetchRelayList(pubkey) {
  if (relayCache.has(pubkey)) return relayCache.get(pubkey);

  const discoveryRelays = [...INDEXER_RELAYS, ...getRelays()];
  const result = { dmRelays: [], inboxRelays: [] };

  const events = await fetchCachedMultiKind(
    [10050, 10002], pubkey, discoveryRelays, { maxWait: 5000 },
  );

  const dmEvent = events[10050];
  if (dmEvent) {
    const relays = dmEvent.tags
      .filter((t) => t[0] === "relay" && t[1])
      .map((t) => t[1]);
    if (relays.length > 0) result.dmRelays = relays;
  }

  const relayEvent = events[10002];
  if (relayEvent) {
    const relays = relayEvent.tags
      .filter((t) => t[0] === "r" && t[1] && (t[2] === "read" || !t[2]))
      .map((t) => t[1]);
    if (relays.length > 0) result.inboxRelays = relays;
  }

  relayCache.set(pubkey, result);
  return result;
}

// Get the relays to use for fetching/publishing DMs for a pubkey
export async function getDMRelays(pubkey) {
  const config = await fetchRelayList(pubkey);
  if (config.dmRelays.length > 0) return config.dmRelays;
  if (config.inboxRelays.length > 0) return config.inboxRelays;
  return ["wss://relay.damus.io", "wss://relay.primal.net"];
}

// --- Relay config accessor (sync, from cache) ---
export function getRelayConfig(pubkey) {
  return relayCache.get(pubkey) || null;
}

// --- Decryption ---

async function decryptGiftWrap(wrap) {
  try {
    // Layer 1: decrypt gift wrap → seal
    const sealJson = await window.nostr.nip44.decrypt(wrap.pubkey, wrap.content);
    const seal = JSON.parse(sealJson);

    if (seal.kind !== 13) return null;

    // Layer 2: decrypt seal → rumor (kind 14)
    const rumorJson = await window.nostr.nip44.decrypt(seal.pubkey, seal.content);
    const rumor = JSON.parse(rumorJson);

    // Verify sender identity
    if (seal.pubkey !== rumor.pubkey) return null;
    if (rumor.kind !== 14) return null;

    return {
      id: rumor.id,
      content: rumor.content,
      sender: rumor.pubkey,
      created_at: rumor.created_at,
      tags: rumor.tags || [],
      wrapId: wrap.id,
    };
  } catch (err) {
    console.warn("Failed to decrypt gift wrap:", err);
    return null;
  }
}

// --- Conversation helpers ---

function getCounterparty(msg) {
  const myPk = getPubkey();
  if (msg.sender === myPk) {
    // We sent this — counterparty is in p tags
    const pTag = msg.tags.find((t) => t[0] === "p" && t[1] !== myPk);
    return pTag ? pTag[1] : null;
  }
  return msg.sender;
}

export function getConversations() {
  const myPk = getPubkey();
  if (!myPk) return [];

  const msgs = messages();
  const convMap = new Map();

  for (const msg of msgs) {
    const counterparty = getCounterparty(msg);
    if (!counterparty) continue;

    if (!convMap.has(counterparty)) {
      convMap.set(counterparty, { pubkey: counterparty, messages: [], lastMessage: null });
    }
    const conv = convMap.get(counterparty);
    conv.messages.push(msg);
  }

  // Set last message and sort conversations by latest message
  const convos = Array.from(convMap.values());
  for (const conv of convos) {
    conv.messages.sort((a, b) => a.created_at - b.created_at);
    conv.lastMessage = conv.messages[conv.messages.length - 1];
  }
  convos.sort((a, b) => b.lastMessage.created_at - a.lastMessage.created_at);

  return convos;
}

export function getConversationMessages(pubkey) {
  const myPk = getPubkey();
  if (!myPk) return [];

  return messages()
    .filter((msg) => {
      const counterparty = getCounterparty(msg);
      return counterparty === pubkey;
    })
    .sort((a, b) => a.created_at - b.created_at);
}

// --- Subscription management ---

export async function initDMs() {
  const myPk = getPubkey();
  if (!myPk || activeSub) return;

  const relays = await getDMRelays(myPk);

  const pool = getPool();
  const seenIds = new Set();

  activeSub = pool.subscribeMany(
    relays,
    { kinds: [1059], "#p": [myPk] },
    {
      onevent(wrap) {
        if (seenIds.has(wrap.id)) return;
        seenIds.add(wrap.id);

        decryptGiftWrap(wrap).then((msg) => {
          if (!msg) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        });
      },
      oneose() {},
      onauth: createAuthCallback(),
    },
  );
}

export function cleanupDMs() {
  if (activeSub) {
    activeSub.close();
    activeSub = null;
  }
  setMessages([]);
  relayCache.clear();
}

// --- Sending ---

export async function sendDM(recipientPubkey, content) {
  const myPk = getPubkey();
  if (!myPk || !content.trim()) return;

  // 1. Build unsigned kind 14 rumor
  const rumor = {
    kind: 14,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["p", recipientPubkey]],
    content: content.trim(),
    pubkey: myPk,
  };
  rumor.id = getEventHash(rumor);

  // 2. Encrypt rumor into seal
  const encryptedRumor = await window.nostr.nip44.encrypt(
    recipientPubkey,
    JSON.stringify(rumor),
  );

  // 3. Build and sign kind 13 seal
  const sealTemplate = {
    kind: 13,
    created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * TWO_DAYS),
    tags: [],
    content: encryptedRumor,
  };
  const seal = await window.nostr.signEvent(sealTemplate);

  // 4. Wrap for recipient and self
  const pool = getPool();
  const targets = [
    { pubkey: recipientPubkey, relays: await getDMRelays(recipientPubkey) },
    { pubkey: myPk, relays: await getDMRelays(myPk) },
  ];

  for (const target of targets) {
    const throwawayKey = generateSecretKey();
    const conversationKey = nip44.v2.utils.getConversationKey(throwawayKey, target.pubkey);
    const encryptedSeal = nip44.v2.encrypt(JSON.stringify(seal), conversationKey);

    const wrap = finalizeEvent(
      {
        kind: 1059,
        created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * TWO_DAYS),
        tags: [["p", target.pubkey]],
        content: encryptedSeal,
      },
      throwawayKey,
    );

    // Publish with auth
    pool.publish(target.relays, wrap, { onauth: createAuthCallback() });
  }

  // Add to local state immediately
  setMessages((prev) => [
    ...prev,
    {
      id: rumor.id,
      content: rumor.content,
      sender: myPk,
      created_at: rumor.created_at,
      tags: rumor.tags,
      wrapId: null,
    },
  ]);
}
