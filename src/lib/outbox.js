import { createSignal } from "solid-js";
import { normalizeURL } from "nostr-tools/utils";
import { getPool } from "./pool";
import { INDEXER_RELAYS } from "./identity";
import { fetchCachedEvent, fetchCachedEvents } from "./event-cache";

const DEFAULT_WRITE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

const MAX_RELAYS_PER_AUTHOR = 3;
const MAX_TOTAL_RELAYS = 15;
const MAX_AUTHORS_PER_FILTER = 500;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Feed state — object with phase + progress details
const [feedEvents, setFeedEvents] = createSignal([]);
const [feedState, setFeedState] = createSignal({ phase: "idle" });

// Cache
let cachedFollows = null;
let cachedRelayMap = null;
let cachedForPubkey = null;
let cacheTimestamp = 0;

// Active subscription and abort handle
let activeSub = null;
let abortController = null;

export function getFollowFeedEvents() {
  return feedEvents();
}

export function getFollowFeedState() {
  return feedState();
}

export function getFollowSet() {
  return cachedFollows;
}

export async function initFollowFeed(pubkey) {
  // Tear down any previous run
  abortController?.abort();
  activeSub?.close();
  activeSub = null;

  abortController = new AbortController();
  const signal = abortController.signal;
  const pool = getPool();

  setFeedEvents([]);

  const cacheValid =
    cachedForPubkey === pubkey &&
    cachedFollows &&
    Date.now() - cacheTimestamp < CACHE_TTL;

  try {
    if (!cacheValid) {
      // Phase 1: Fetch follow list (kind 3)
      setFeedState({ phase: "loading-follows" });
      const latest = await fetchCachedEvent(
        3, pubkey, INDEXER_RELAYS, { maxWait: 5000, abort: signal },
      );
      if (signal.aborted) return;

      const followPubkeys = latest
        ? latest.tags.filter((t) => t[0] === "p").map((t) => t[1])
        : [];

      cachedFollows = new Set(followPubkeys);

      if (cachedFollows.size === 0) {
        cachedForPubkey = pubkey;
        cacheTimestamp = Date.now();
        cachedRelayMap = new Map();
        setFeedState({ phase: "ready", followCount: 0 });
        return;
      }

      // Phase 2: Fetch relay lists (kind 10002)
      const followCount = cachedFollows.size;
      setFeedState({ phase: "loading-relays", followCount });

      const relayEvents = await fetchCachedEvents(
        10002, [...cachedFollows], INDEXER_RELAYS,
        { maxWait: 8000, abort: signal },
      );
      if (signal.aborted) return;

      cachedRelayMap = parseRelayLists(relayEvents);
      cachedForPubkey = pubkey;
      cacheTimestamp = Date.now();
    }

    // Phase 3: Compute scoreboard and subscribe
    const followCount = cachedFollows.size;
    const scoreboard = computeScoreboard(cachedFollows, cachedRelayMap);
    const relayUrls = [...scoreboard.keys()];

    // Pre-warm relay connections (fire-and-forget)
    Promise.allSettled(relayUrls.map((url) => pool.ensureRelay(url)));

    // Build subscription requests, splitting >500 authors
    const requests = [];
    for (const [relay, authors] of scoreboard) {
      for (let i = 0; i < authors.length; i += MAX_AUTHORS_PER_FILTER) {
        const chunk = authors.slice(i, i + MAX_AUTHORS_PER_FILTER);
        requests.push({
          url: relay,
          filter: { kinds: [1], authors: chunk, limit: 100 },
        });
      }
    }

    setFeedState({
      phase: "loading-notes",
      followCount,
      relayListsFound: cachedRelayMap.size,
      relayCount: relayUrls.length,
    });

    activeSub = pool.subscribeMap(requests, {
      onevent(event) {
        // Skip replies — only show root notes (no "e" tags = not a reply)
        if (event.tags.some((t) => t[0] === "e")) return;
        // Attach author's write relays so NoteCard can include them in nevent links
        const writeRelays = cachedRelayMap?.get(event.pubkey);
        if (writeRelays) event._relayHints = writeRelays;
        setFeedEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          const next = [...prev, event]
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 500);
          return next;
        });
      },
      oneose() {
        setFeedState({
          phase: "ready",
          followCount,
          relayListsFound: cachedRelayMap.size,
          relayCount: relayUrls.length,
        });
      },
    });
  } catch (err) {
    if (signal.aborted) return;
    console.error("Follow feed error:", err);
    setFeedState({ phase: "ready" });
  }
}

export function clearFollowFeed() {
  abortController?.abort();
  activeSub?.close();
  activeSub = null;
  abortController = null;
  setFeedEvents([]);
  setFeedState({ phase: "idle" });
}

// Parse kind 10002 events into Map<pubkey, string[]> of write relays.
// Only keeps relays from the most recent event per pubkey.
function parseRelayLists(events) {
  const relayMap = new Map();
  const latestCreatedAt = new Map();

  for (const event of events) {
    const prev = latestCreatedAt.get(event.pubkey) || 0;
    if (event.created_at < prev) continue;
    latestCreatedAt.set(event.pubkey, event.created_at);

    const writeRelays = [];
    for (const tag of event.tags) {
      if (tag[0] !== "r") continue;
      const url = tag[1];
      const marker = tag[2];
      // No marker = both read+write. "write" = write. "read" = skip.
      if (!marker || marker === "write") {
        try {
          writeRelays.push(normalizeURL(url));
        } catch {
          // bad URL
        }
      }
    }
    if (writeRelays.length > 0) {
      relayMap.set(event.pubkey, writeRelays);
    }
  }

  return relayMap;
}

// Greedy set-cover: assign up to 3 relays per author, minimize total relays.
function computeScoreboard(follows, relayMap) {
  const defaultNormalized = DEFAULT_WRITE_RELAYS.map(normalizeURL);

  // Step 1: candidate write relays per pubkey
  const candidates = new Map();
  for (const pk of follows) {
    const relays = relayMap.get(pk);
    candidates.set(pk, relays && relays.length > 0 ? relays : defaultNormalized);
  }

  // Step 2: inverted index — relay -> set of pubkeys
  const invertedIndex = new Map();
  for (const [pk, relays] of candidates) {
    for (const relay of relays) {
      if (!invertedIndex.has(relay)) invertedIndex.set(relay, new Set());
      invertedIndex.get(relay).add(pk);
    }
  }

  // Step 3: greedy selection
  const assignments = new Map(); // pubkey -> Set<relay>
  for (const pk of follows) {
    assignments.set(pk, new Set());
  }

  const selectedRelays = new Map(); // relay -> Set<pubkey>

  while (selectedRelays.size < MAX_TOTAL_RELAYS) {
    let bestRelay = null;
    let bestScore = 0;

    for (const [relay, pubkeys] of invertedIndex) {
      let score = 0;
      for (const pk of pubkeys) {
        if (assignments.get(pk).size < MAX_RELAYS_PER_AUTHOR && !assignments.get(pk).has(relay)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestRelay = relay;
      }
    }

    if (bestScore === 0) break;

    if (!selectedRelays.has(bestRelay)) {
      selectedRelays.set(bestRelay, new Set());
    }

    for (const pk of invertedIndex.get(bestRelay)) {
      if (assignments.get(pk).size < MAX_RELAYS_PER_AUTHOR && !assignments.get(pk).has(bestRelay)) {
        assignments.get(pk).add(bestRelay);
        selectedRelays.get(bestRelay).add(pk);
      }
    }
  }

  // Convert to Map<relay, pubkey[]>
  const result = new Map();
  for (const [relay, pubkeys] of selectedRelays) {
    if (pubkeys.size > 0) {
      result.set(relay, [...pubkeys]);
    }
  }
  return result;
}
