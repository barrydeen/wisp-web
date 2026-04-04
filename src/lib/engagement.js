import { createSignal } from "solid-js";
import { normalizeURL } from "nostr-tools/utils";
import { getSatoshisAmountFromBolt11 } from "nostr-tools/nip57";
import { getPool } from "./pool";
import { getPubkey, INDEXER_RELAYS } from "./identity";
import { getCached, fetchCachedEvents } from "./event-cache";

const MAX_ETAGS_PER_FILTER = 150;
const MAX_INBOX_RELAYS_PER_AUTHOR = 3;
const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

// --- Engagement counts per event ID ---

const replyCounts = new Map();
const repostCounts = new Map();
const reactionCounts = new Map();
const zapSats = new Map();

// Dedup sets (by engagement event ID, not target event ID)
const countedReplyIds = new Set();
const countedRepostIds = new Set();
const countedReactionIds = new Set();
const countedZapIds = new Set();

// Current user's own engagement
const userReacted = new Map();
const userReposted = new Map();

// Tracks which note IDs already have engagement subscriptions
const engagedEventIds = new Set();

// Active subscription closers
const activeSubClosers = [];

// Version signal for reactivity
const [engagementVersion, setEngagementVersion] = createSignal(0);

let dirtyFrame = null;
function markDirty() {
  if (!dirtyFrame) {
    dirtyFrame = requestAnimationFrame(() => {
      dirtyFrame = null;
      setEngagementVersion((v) => v + 1);
    });
  }
}

// --- Getter functions (read engagementVersion for reactivity) ---

export function getReplyCount(eventId) {
  engagementVersion();
  return replyCounts.get(eventId) || 0;
}

export function getRepostCount(eventId) {
  engagementVersion();
  return repostCounts.get(eventId) || 0;
}

export function getReactionCount(eventId) {
  engagementVersion();
  return reactionCounts.get(eventId) || 0;
}

export function getZapSats(eventId) {
  engagementVersion();
  return zapSats.get(eventId) || 0;
}

export function hasUserReacted(eventId) {
  engagementVersion();
  return !!userReacted.get(eventId);
}

export function getUserReaction(eventId) {
  engagementVersion();
  return userReacted.get(eventId) || null;
}

export function hasUserReposted(eventId) {
  engagementVersion();
  return userReposted.get(eventId) || false;
}

// --- Event processing ---

function processEngagementEvent(event) {
  const myPubkey = getPubkey();

  if (event.kind === 1) {
    // Reply — find the parent event via "e" tag
    if (countedReplyIds.has(event.id)) return;
    const eTag = event.tags.find((t) => t[0] === "e")?.[1];
    if (!eTag || !engagedEventIds.has(eTag)) return;
    countedReplyIds.add(event.id);
    replyCounts.set(eTag, (replyCounts.get(eTag) || 0) + 1);
    markDirty();
  } else if (event.kind === 6) {
    // Repost
    if (countedRepostIds.has(event.id)) return;
    const eTag = event.tags.find((t) => t[0] === "e")?.[1];
    if (!eTag || !engagedEventIds.has(eTag)) return;
    countedRepostIds.add(event.id);
    repostCounts.set(eTag, (repostCounts.get(eTag) || 0) + 1);
    if (myPubkey && event.pubkey === myPubkey) userReposted.set(eTag, true);
    markDirty();
  } else if (event.kind === 7) {
    // Reaction — use the last "e" tag as target
    if (countedReactionIds.has(event.id)) return;
    const eTags = event.tags.filter((t) => t[0] === "e");
    const target = eTags[eTags.length - 1]?.[1];
    if (!target || !engagedEventIds.has(target)) return;
    countedReactionIds.add(event.id);
    reactionCounts.set(target, (reactionCounts.get(target) || 0) + 1);
    if (myPubkey && event.pubkey === myPubkey) {
      const emojiTag = event.tags.find((t) => t[0] === "emoji" && t[1] && t[2]);
      userReacted.set(target, {
        content: event.content,
        url: emojiTag ? emojiTag[2] : null,
      });
    }
    markDirty();
  } else if (event.kind === 9735) {
    // Zap receipt
    if (countedZapIds.has(event.id)) return;
    const eTag = event.tags.find((t) => t[0] === "e")?.[1];
    if (!eTag || !engagedEventIds.has(eTag)) return;
    const bolt11 = event.tags.find((t) => t[0] === "bolt11")?.[1];
    if (!bolt11) return;
    let sats;
    try {
      sats = getSatoshisAmountFromBolt11(bolt11);
    } catch {
      return;
    }
    countedZapIds.add(event.id);
    zapSats.set(eTag, (zapSats.get(eTag) || 0) + sats);
    markDirty();
  }
}

// --- Inbox relay resolution ---

function parseReadRelays(event) {
  const relays = [];
  for (const tag of event.tags) {
    if (tag[0] !== "r" || !tag[1]) continue;
    const marker = tag[2];
    if (!marker || marker === "read") {
      try {
        relays.push(normalizeURL(tag[1]));
      } catch { /* bad URL */ }
    }
  }
  return relays;
}

export async function resolveInboxRelays(pubkeys) {
  const result = new Map();
  const uncached = [];

  for (const pk of pubkeys) {
    const cached = getCached(10002, pk);
    if (cached === undefined) {
      uncached.push(pk);
    } else if (cached) {
      const relays = parseReadRelays(cached);
      if (relays.length > 0) result.set(pk, relays.slice(0, MAX_INBOX_RELAYS_PER_AUTHOR));
    }
    // cached === null means known miss, skip
  }

  if (uncached.length > 0) {
    const events = await fetchCachedEvents(10002, uncached, INDEXER_RELAYS, { maxWait: 5000 });
    for (const event of events) {
      const relays = parseReadRelays(event);
      if (relays.length > 0) result.set(event.pubkey, relays.slice(0, MAX_INBOX_RELAYS_PER_AUTHOR));
    }
  }

  return result;
}

// --- Subscription management ---

export async function subscribeEngagement(events) {
  const newEvents = events.filter((e) => !engagedEventIds.has(e.id));
  if (newEvents.length === 0) return;

  // Mark as engaged before async work
  for (const e of newEvents) engagedEventIds.add(e.id);

  // Group by author
  const byAuthor = new Map();
  for (const e of newEvents) {
    if (!byAuthor.has(e.pubkey)) byAuthor.set(e.pubkey, []);
    byAuthor.get(e.pubkey).push(e.id);
  }

  const inboxMap = await resolveInboxRelays([...byAuthor.keys()]);

  // Build relay -> eventIds mapping
  const relayToEventIds = new Map();
  const fallbackEventIds = [];

  for (const [pubkey, eventIds] of byAuthor) {
    const inboxRelays = inboxMap.get(pubkey);
    if (inboxRelays && inboxRelays.length > 0) {
      for (const relay of inboxRelays) {
        if (!relayToEventIds.has(relay)) relayToEventIds.set(relay, []);
        relayToEventIds.get(relay).push(...eventIds);
      }
    } else {
      fallbackEventIds.push(...eventIds);
    }
  }

  const pool = getPool();
  const allEventIds = newEvents.map((e) => e.id);

  // Subscribe per inbox relay
  for (const [relay, eventIds] of relayToEventIds) {
    const unique = [...new Set(eventIds)];
    for (let i = 0; i < unique.length; i += MAX_ETAGS_PER_FILTER) {
      const chunk = unique.slice(i, i + MAX_ETAGS_PER_FILTER);
      const sub = pool.subscribeMany([relay], { kinds: [1, 6, 7, 9735], "#e": chunk, limit: 500 }, {
        onevent: processEngagementEvent,
      });
      activeSubClosers.push(sub);
    }
  }

  // Safety net: indexer relays get all event IDs (catches engagement for authors without known relay lists)
  for (let i = 0; i < allEventIds.length; i += MAX_ETAGS_PER_FILTER) {
    const chunk = allEventIds.slice(i, i + MAX_ETAGS_PER_FILTER);
    const sub = pool.subscribeMany(INDEXER_RELAYS, { kinds: [1, 6, 7, 9735], "#e": chunk, limit: 500 }, {
      onevent: processEngagementEvent,
    });
    activeSubClosers.push(sub);
  }
}

// --- Optimistic updates ---

export function optimisticReaction(eventId, content, url) {
  reactionCounts.set(eventId, (reactionCounts.get(eventId) || 0) + 1);
  userReacted.set(eventId, { content, url: url || null });
  markDirty();
}

export function optimisticRepost(eventId) {
  repostCounts.set(eventId, (repostCounts.get(eventId) || 0) + 1);
  userReposted.set(eventId, true);
  markDirty();
}

// --- Cleanup ---

export function clearEngagement() {
  for (const sub of activeSubClosers) {
    try { sub.close(); } catch { /* already closed */ }
  }
  activeSubClosers.length = 0;
  replyCounts.clear();
  repostCounts.clear();
  reactionCounts.clear();
  zapSats.clear();
  countedReplyIds.clear();
  countedRepostIds.clear();
  countedReactionIds.clear();
  countedZapIds.clear();
  userReacted.clear();
  userReposted.clear();
  engagedEventIds.clear();
  setEngagementVersion(0);
}
