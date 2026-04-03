import { createSignal, createEffect, createRoot } from "solid-js";
import { getSatoshisAmountFromBolt11 } from "nostr-tools/nip57";
import { getPool } from "./pool";
import { getPubkey, INDEXER_RELAYS } from "./identity";
import { getInboxRelays, getOutboxRelays, getMajorRelays, dedupeRelays } from "./relays";
import { parseThreadParent } from "./thread";
import { getConversations, initDMs } from "./dms";

const MAX_FLAT_ITEMS = 500;
const LRU_CAPACITY = 2000;
const SUMMARY_WINDOW = 86400; // 24 hours

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

// --- State ---

const flatItems = new Map();
const seenEventIds = new Map(); // LRU
const myOwnEventIds = new Set();
const activeSubs = [];

let currentPubkey = null;
let lastReadTimestamp = 0;
let isViewing = false;
let dmDispose = null;
let dmSeenIds = null;

const [notifVersion, setNotifVersion] = createSignal(0);
const [hasUnread, setHasUnread] = createSignal(false);

let versionDirty = false;
function markDirty() {
  if (!versionDirty) {
    versionDirty = true;
    setTimeout(() => {
      versionDirty = false;
      setNotifVersion((v) => v + 1);
    }, 50);
  }
}

// --- LRU helpers ---

function lruHas(id) {
  if (!seenEventIds.has(id)) return false;
  // Move to end (most recent)
  seenEventIds.delete(id);
  seenEventIds.set(id, true);
  return true;
}

function lruAdd(id) {
  if (seenEventIds.has(id)) {
    seenEventIds.delete(id);
  }
  seenEventIds.set(id, true);
  if (seenEventIds.size > LRU_CAPACITY) {
    const oldest = seenEventIds.keys().next().value;
    seenEventIds.delete(oldest);
  }
}

// --- Zap parsing ---

function parseZapReceipt(event) {
  const bolt11 = event.tags.find((t) => t[0] === "bolt11")?.[1];
  if (!bolt11) return null;
  let sats;
  try {
    sats = getSatoshisAmountFromBolt11(bolt11);
  } catch {
    return null;
  }
  if (!sats || sats <= 0) return null;

  const descTag = event.tags.find((t) => t[0] === "description")?.[1];
  if (!descTag) return null;
  let zapRequest;
  try {
    zapRequest = JSON.parse(descTag);
  } catch {
    return null;
  }

  return {
    zapperPubkey: zapRequest.pubkey,
    sats,
    message: zapRequest.content || "",
  };
}

// --- Reaction emoji parsing ---

function parseReactionEmoji(event) {
  const content = (event.content || "").trim();
  const emoji = content === "" || content === "+" ? null : content;

  // NIP-30 custom emoji
  let emojiUrl = null;
  if (emoji && emoji.startsWith(":") && emoji.endsWith(":")) {
    const shortcode = emoji.slice(1, -1);
    const emojiTag = event.tags.find(
      (t) => t[0] === "emoji" && t[1] === shortcode && t[2],
    );
    if (emojiTag) emojiUrl = emojiTag[2];
  }

  return { emoji, emojiUrl };
}

// --- Ownership check ---

function getReferencedEventId(event) {
  const eTags = event.tags.filter((t) => t[0] === "e");
  if (eTags.length === 0) return null;
  return eTags[eTags.length - 1][1];
}

function isOwnEvent(refId) {
  return refId && myOwnEventIds.has(refId);
}

// --- Event categorization ---

function handleSelfNote(event) {
  myOwnEventIds.add(event.id);
}

function handleNotificationEvent(event) {
  if (!currentPubkey) return;
  if (event.pubkey === currentPubkey) return;
  if (lruHas(event.id)) return;
  lruAdd(event.id);

  if (event.kind === 7) {
    mergeReaction(event);
  } else if (event.kind === 9735) {
    mergeZap(event);
  } else if (event.kind === 6) {
    mergeRepost(event);
  } else if (event.kind === 1) {
    mergeKind1(event);
  }
}

function mergeReaction(event) {
  const refId = getReferencedEventId(event);
  if (!isOwnEvent(refId)) return;

  const { emoji, emojiUrl } = parseReactionEmoji(event);
  const dedupKey = `reaction:${refId}:${event.pubkey}:${emoji || "heart"}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "reaction",
    actorPubkey: event.pubkey,
    referencedEventId: refId,
    timestamp: event.created_at,
    emoji,
    emojiUrl,
  });
  onNewItem(event.created_at);
}

function mergeZap(event) {
  const refId = getReferencedEventId(event);
  if (!isOwnEvent(refId)) return;

  const zap = parseZapReceipt(event);
  if (!zap) return;

  const dedupKey = `zap:${event.id}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "zap",
    actorPubkey: zap.zapperPubkey,
    referencedEventId: refId,
    timestamp: event.created_at,
    zapSats: zap.sats,
    zapMessage: zap.message,
  });
  onNewItem(event.created_at);
}

function mergeRepost(event) {
  const refId = getReferencedEventId(event);
  if (!isOwnEvent(refId)) return;

  const dedupKey = `repost:${refId}:${event.pubkey}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "repost",
    actorPubkey: event.pubkey,
    referencedEventId: refId,
    timestamp: event.created_at,
  });
  onNewItem(event.created_at);
}

function mergeKind1(event) {
  // Check for quote (q-tag)
  const qTag = event.tags.find((t) => t[0] === "q")?.[1];
  if (qTag && isOwnEvent(qTag)) {
    mergeQuote(event, qTag);
    return;
  }

  // Check for reply (e-tag thread parent)
  const thread = parseThreadParent(event);
  if (thread) {
    // It's a reply — check if it's replying to our event
    if (isOwnEvent(thread.replyId)) {
      mergeReply(event, thread.replyId);
      return;
    }
    if (isOwnEvent(thread.rootId)) {
      mergeReply(event, thread.rootId);
      return;
    }
  }

  // Otherwise it's a mention (p-tagged us but not replying to our event)
  mergeMention(event);
}

function mergeQuote(event, refId) {
  const dedupKey = `quote:${event.id}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "quote",
    actorPubkey: event.pubkey,
    referencedEventId: refId,
    timestamp: event.created_at,
    quoteEventId: event.id,
  });
  onNewItem(event.created_at);
}

function mergeReply(event, refId) {
  const dedupKey = `reply:${event.id}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "reply",
    actorPubkey: event.pubkey,
    referencedEventId: refId,
    timestamp: event.created_at,
    replyEventId: event.id,
  });
  onNewItem(event.created_at);
}

function mergeMention(event) {
  const dedupKey = `mention:${event.id}`;
  if (flatItems.has(dedupKey)) return;

  flatItems.set(dedupKey, {
    id: dedupKey,
    type: "mention",
    actorPubkey: event.pubkey,
    referencedEventId: event.id,
    timestamp: event.created_at,
  });
  onNewItem(event.created_at);
}

function onNewItem(timestamp) {
  if (isViewing) {
    updateLastRead(timestamp);
  } else if (timestamp > lastReadTimestamp) {
    setHasUnread(true);
  }
  markDirty();
}

// --- Read state ---

function loadLastRead(pubkey) {
  try {
    const val = localStorage.getItem(`wisp:notif:lastRead:${pubkey}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

function updateLastRead(timestamp) {
  if (timestamp > lastReadTimestamp) {
    lastReadTimestamp = timestamp;
    if (currentPubkey) {
      localStorage.setItem(`wisp:notif:lastRead:${currentPubkey}`, String(lastReadTimestamp));
    }
  }
}

// --- Getters (reactive) ---

export function getNotifications() {
  notifVersion();
  return [...flatItems.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_FLAT_ITEMS);
}

export function getNotificationSummary() {
  notifVersion();
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - SUMMARY_WINDOW;
  let replyCount = 0, reactionCount = 0, zapCount = 0, zapSatsTotal = 0,
    repostCount = 0, mentionCount = 0, quoteCount = 0, dmCount = 0;

  for (const item of flatItems.values()) {
    if (item.timestamp < cutoff) continue;
    switch (item.type) {
      case "reply": replyCount++; break;
      case "reaction": reactionCount++; break;
      case "zap": zapCount++; zapSatsTotal += item.zapSats || 0; break;
      case "repost": repostCount++; break;
      case "mention": mentionCount++; break;
      case "quote": quoteCount++; break;
      case "dm": dmCount++; break;
    }
  }

  return { replyCount, reactionCount, zapCount, zapSatsTotal, repostCount, mentionCount, quoteCount, dmCount };
}

export function getHasUnread() {
  return hasUnread();
}

// --- Lifecycle ---

export function initNotifications(pubkey) {
  if (currentPubkey === pubkey) return;
  clearNotifications();

  currentPubkey = pubkey;
  lastReadTimestamp = loadLastRead(pubkey);

  const pool = getPool();

  // Build relay lists
  const inbox = getInboxRelays();
  const major = getMajorRelays();
  const outbox = getOutboxRelays();

  const notifRelays = dedupeRelays([
    ...(inbox.length > 0 ? inbox : DEFAULT_RELAYS),
    ...major,
    ...INDEXER_RELAYS,
  ]);

  const selfRelays = dedupeRelays([
    ...outbox,
    ...INDEXER_RELAYS,
  ]);

  // 1. Self-notes subscription (for ownership verification)
  const selfSub = pool.subscribeMany(selfRelays, {
    kinds: [1],
    authors: [pubkey],
    limit: 200,
  }, {
    onevent: handleSelfNote,
  });
  activeSubs.push(selfSub);

  // 2. Main notification subscription (slight delay for self-notes to populate)
  setTimeout(() => {
    if (currentPubkey !== pubkey) return;
    const mainSub = pool.subscribeMany(notifRelays, {
      kinds: [1, 6, 7, 9735],
      "#p": [pubkey],
      limit: 300,
    }, {
      onevent: handleNotificationEvent,
    });
    activeSubs.push(mainSub);
  }, 1500);

  // 3. DM observation — init DMs, then watch conversations reactively
  initDMs();
  dmSeenIds = new Set();
  dmDispose = createRoot((dispose) => {
    createEffect(() => {
      const convos = getConversations();
      for (const conv of convos) {
        for (const msg of conv.messages) {
          if (msg.sender === currentPubkey) continue;
          if (dmSeenIds.has(msg.id)) continue;
          dmSeenIds.add(msg.id);

          const dedupKey = `dm:${msg.id}`;
          if (flatItems.has(dedupKey)) continue;

          flatItems.set(dedupKey, {
            id: dedupKey,
            type: "dm",
            actorPubkey: msg.sender,
            referencedEventId: msg.id,
            timestamp: msg.created_at,
          });
          onNewItem(msg.created_at);
        }
      }
    });
    return dispose;
  });
}

export function markNotificationsRead() {
  const now = Math.floor(Date.now() / 1000);
  let maxTs = now;
  for (const item of flatItems.values()) {
    if (item.timestamp > maxTs) maxTs = item.timestamp;
  }
  lastReadTimestamp = maxTs;
  if (currentPubkey) {
    localStorage.setItem(`wisp:notif:lastRead:${currentPubkey}`, String(lastReadTimestamp));
  }
  setHasUnread(false);
}

export function setNotificationsViewing(viewing) {
  isViewing = viewing;
  if (viewing) {
    markNotificationsRead();
  }
}

export function clearNotifications() {
  for (const sub of activeSubs) {
    try { sub.close(); } catch { /* already closed */ }
  }
  activeSubs.length = 0;

  if (dmDispose) {
    dmDispose();
    dmDispose = null;
  }
  dmSeenIds = null;

  flatItems.clear();
  seenEventIds.clear();
  myOwnEventIds.clear();
  currentPubkey = null;
  lastReadTimestamp = 0;
  isViewing = false;

  setNotifVersion(0);
  setHasUnread(false);
}
