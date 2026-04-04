import { createSignal } from "solid-js";
import { getPool, getRelays, publishEvent } from "./pool";
import { getPubkey, INDEXER_RELAYS } from "./identity";
import { fetchCachedEvent } from "./event-cache";
import { buildEmojiTagsFromContent } from "./emojis";

const STREAM_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://nos.lol",
];

// --- Reactive state ---
const [rawStreams, setRawStreams] = createSignal([]);
let discoverySub = null;

// --- Stream parsing ---

export function parseLiveStream(event) {
  const tags = event.tags;
  const getTag = (name) => tags.find((t) => t[0] === name)?.[1];

  const participants = tags
    .filter((t) => t[0] === "p" && t.length >= 2)
    .map((t) => ({ pubkey: t[1], relay: t[2] || "", role: t[3] || "" }));

  const host = participants.find(
    (p) => p.role.toLowerCase() === "host",
  );

  // Relay hints from relays/r/relay tags
  const relayHints = tags
    .filter((t) => (t[0] === "relays" || t[0] === "r" || t[0] === "relay"))
    .flatMap((t) => t.slice(1))
    .filter((url) => url && url.startsWith("wss://"));

  const dTag = getTag("d") || "";

  return {
    pubkey: event.pubkey,
    streamerPubkey: host?.pubkey || event.pubkey,
    dTag,
    title: getTag("title") || "Untitled Stream",
    summary: getTag("summary") || "",
    image: getTag("image"),
    status: getTag("status") || "ended",
    streamingUrl: getTag("streaming"),
    starts: getTag("starts"),
    ends: getTag("ends"),
    participants,
    relayHints,
    aTag: `30311:${event.pubkey}:${dTag}`,
    raw: event,
  };
}

// --- Discovery ---

export function getLiveStreams() {
  return rawStreams().filter((s) => s.status === "live");
}

export function initStreamDiscovery() {
  if (discoverySub) return;

  const pool = getPool();
  discoverySub = pool.subscribeMany(
    STREAM_RELAYS,
    { kinds: [30311], limit: 50 },
    {
      onevent(event) {
        setRawStreams((prev) => {
          const parsed = parseLiveStream(event);
          // Replaceable by pubkey+dTag — keep the newest
          const key = `${event.pubkey}:${parsed.dTag}`;
          const filtered = prev.filter(
            (s) => `${s.pubkey}:${s.dTag}` !== key,
          );
          return [...filtered, parsed].sort(
            (a, b) => b.raw.created_at - a.raw.created_at,
          );
        });
      },
    },
  );
}

export function cleanupStreamDiscovery() {
  if (discoverySub) {
    discoverySub.close();
    discoverySub = null;
  }
}

// --- Chat relay resolution ---

export async function resolveChatRelays(stream, naddrRelayHints = []) {
  const seen = new Set();
  const result = [];

  function add(url) {
    if (url && url.startsWith("wss://") && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  // Priority 1: naddr relay hints from navigation
  naddrRelayHints.forEach(add);

  // Priority 2: Activity relay hints from 30311 event
  stream.relayHints.forEach(add);

  // Priority 3 & 4: Streamer's inbox/outbox relays (kind 10002)
  try {
    const discoveryRelays = [...INDEXER_RELAYS, ...getRelays()];
    const relayList = await fetchCachedEvent(
      10002, stream.streamerPubkey, discoveryRelays,
    );

    if (relayList) {
      // Inbox (read) relays first
      relayList.tags
        .filter((t) => t[0] === "r" && t[1] && (t[2] === "read" || !t[2]))
        .forEach((t) => add(t[1]));
      // Then outbox (write) relays
      relayList.tags
        .filter((t) => t[0] === "r" && t[1] && t[2] === "write")
        .forEach((t) => add(t[1]));
    }
  } catch {
    // relay list fetch failed — continue with what we have
  }

  // Priority 5: Fallback to default relays
  if (result.length === 0) {
    getRelays().forEach(add);
  }

  return result.slice(0, 10);
}

// --- Chat subscription ---

export function createChatSubscription(stream, chatRelays) {
  const aTagValue = stream.aTag;
  const [chatMessages, setChatMessages] = createSignal([]);
  const [reactions, setReactions] = createSignal([]);
  const [zapReceipts, setZapReceipts] = createSignal([]);

  const pool = getPool();

  const handler = {
    onevent(event) {
      if (event.kind === 1311) {
        setChatMessages((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event].sort(
            (a, b) => a.created_at - b.created_at,
          );
        });
      } else if (event.kind === 7) {
        setReactions((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event];
        });
      } else if (event.kind === 9735) {
        setZapReceipts((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event];
        });
      }
    },
  };

  const sub1 = pool.subscribeMany(chatRelays, { kinds: [1311], "#a": [aTagValue] }, handler);
  const sub2 = pool.subscribeMany(chatRelays, { kinds: [7], "#a": [aTagValue] }, handler);
  const sub3 = pool.subscribeMany(chatRelays, { kinds: [9735], "#a": [aTagValue] }, handler);

  return {
    chatMessages,
    reactions,
    zapReceipts,
    cleanup: () => { sub1.close(); sub2.close(); sub3.close(); },
  };
}

// --- Send chat message (kind 1311) ---

export async function sendChatMessage(stream, content, replyTo, chatRelays) {
  const tags = [
    ["a", stream.aTag, stream.relayHints[0] || "", "root"],
    ["p", stream.streamerPubkey],
  ];

  if (replyTo) {
    tags.push(["e", replyTo.id, "", "reply"]);
    // Also tag the reply target's author
    if (replyTo.pubkey !== stream.streamerPubkey) {
      tags.push(["p", replyTo.pubkey]);
    }
  }

  // Custom emoji tags (NIP-30)
  tags.push(...buildEmojiTagsFromContent(content));

  return publishEvent(
    {
      kind: 1311,
      content,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    },
    chatRelays,
  );
}

// --- Send reaction (kind 7) ---

export async function sendReaction(stream, messageEvent, chatRelays) {
  return publishEvent(
    {
      kind: 7,
      content: "+",
      tags: [
        ["e", messageEvent.id],
        ["p", messageEvent.pubkey],
        ["a", stream.aTag],
        ["k", "1311"],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    chatRelays,
  );
}
