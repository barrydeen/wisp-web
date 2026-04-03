import { createSignal } from "solid-js";
import { normalizeURL } from "nostr-tools/utils";
import { getPool, setDynamicRelays } from "./pool";
import { INDEXER_RELAYS } from "./identity";
import { setBlossomServers, withClientTag } from "./settings";
import { fetchCachedMultiKind, putCached } from "./event-cache";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

const DEFAULT_MAJOR_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

const STORAGE_KEY = "wisp:relays";

// --- Load local-only settings ---

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    searchRelay: searchRelay(),
    majorRelays: majorRelays(),
  }));
}

const local = loadLocal();

// --- Signals ---

// Kind 10002: each entry { url, read, write }
const [relayList, setRelayList] = createSignal([]);

// Kind 10050: array of URL strings
const [dmRelayList, setDmRelayList] = createSignal([]);

// Kind 30002: array of { name, relays[] }
const [relaySets, setRelaySets] = createSignal([]);

// Local-only
const [searchRelay, setSearchRelaySignal] = createSignal(local.searchRelay || "");
const [majorRelays, setMajorRelaysSignal] = createSignal(local.majorRelays || [...DEFAULT_MAJOR_RELAYS]);
const [relayListLoaded, setRelayListLoaded] = createSignal(false);

// --- Derived accessors ---

export function getRelayList() {
  return relayList();
}

export function getInboxRelays() {
  return relayList().filter(e => e.read).map(e => e.url);
}

export function getOutboxRelays() {
  const out = relayList().filter(e => e.write).map(e => e.url);
  return out.length > 0 ? out : DEFAULT_RELAYS;
}

export function getDmRelayList() {
  return dmRelayList();
}

export function getSearchRelay() {
  return searchRelay();
}

export function getMajorRelays() {
  return majorRelays();
}

export function getRelaySets() {
  return relaySets();
}

export function isRelayListLoaded() {
  return relayListLoaded();
}

// --- Fetch from network ---

export async function fetchOwnRelayLists(pubkey) {
  const queryRelays = [...INDEXER_RELAYS, ...DEFAULT_RELAYS];

  const results = await fetchCachedMultiKind(
    [10002, 10050, 10063], pubkey, queryRelays, { maxWait: 5000 },
  );

  // Kind 10002
  const latestRelay = results[10002];
  if (latestRelay) {
    const entries = [];
    for (const tag of latestRelay.tags) {
      if (tag[0] !== "r" || !tag[1]) continue;
      try {
        const url = normalizeURL(tag[1]);
        const marker = tag[2];
        entries.push({
          url,
          read: !marker || marker === "read",
          write: !marker || marker === "write",
        });
      } catch { /* bad URL */ }
    }
    setRelayList(entries);
  }

  // Kind 10050
  const latestDm = results[10050];
  if (latestDm) {
    const relays = latestDm.tags
      .filter(t => t[0] === "relay" && t[1])
      .map(t => t[1]);
    setDmRelayList(relays);
  }

  // Kind 10063: Blossom server list
  const latestBlossom = results[10063];
  if (latestBlossom) {
    const servers = latestBlossom.tags
      .filter(t => t[0] === "server" && t[1])
      .map(t => t[1]);
    if (servers.length > 0) {
      setBlossomServers(servers);
    }
  }

  setRelayListLoaded(true);

  // Kind 30002: relay sets
  await fetchRelaySets(pubkey);
}

async function fetchRelaySets(pubkey) {
  const pool = getPool();
  const queryRelays = [...INDEXER_RELAYS, ...DEFAULT_RELAYS];

  const events = await pool.querySync(
    queryRelays,
    { kinds: [30002], authors: [pubkey] },
    { maxWait: 5000 },
  );

  // Each event is an addressable set keyed by d tag
  const sets = [];
  const seen = new Set();
  // Sort newest first so we keep the latest version of each d tag
  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
  for (const event of sorted) {
    const dTag = event.tags.find(t => t[0] === "d")?.[1] || "";
    if (seen.has(dTag)) continue;
    seen.add(dTag);
    const relays = event.tags
      .filter(t => t[0] === "relay" && t[1])
      .map(t => t[1]);
    if (relays.length > 0) {
      sets.push({ name: dTag, relays });
    }
  }
  setRelaySets(sets);
}

// --- Mutation functions (local only) ---

export function addRelay(url, read = true, write = true) {
  try {
    const normalized = normalizeURL(url);
    setRelayList(prev => {
      if (prev.some(e => e.url === normalized)) return prev;
      return [...prev, { url: normalized, read, write }];
    });
  } catch { /* bad URL */ }
}

export function removeRelay(url) {
  setRelayList(prev => prev.filter(e => e.url !== url));
}

export function toggleRelayRead(url) {
  setRelayList(prev => prev.map(e =>
    e.url === url ? { ...e, read: !e.read } : e,
  ));
}

export function toggleRelayWrite(url) {
  setRelayList(prev => prev.map(e =>
    e.url === url ? { ...e, write: !e.write } : e,
  ));
}

export function addDmRelay(url) {
  try {
    const normalized = normalizeURL(url);
    setDmRelayList(prev => {
      if (prev.includes(normalized)) return prev;
      return [...prev, normalized];
    });
  } catch { /* bad URL */ }
}

export function removeDmRelay(url) {
  setDmRelayList(prev => prev.filter(r => r !== url));
}

export function setSearchRelayUrl(url) {
  setSearchRelaySignal(url);
  saveLocal();
}

export function addMajorRelay(url) {
  try {
    const normalized = normalizeURL(url);
    setMajorRelaysSignal(prev => {
      if (prev.includes(normalized)) return prev;
      return [...prev, normalized];
    });
    saveLocal();
  } catch { /* bad URL */ }
}

export function removeMajorRelay(url) {
  setMajorRelaysSignal(prev => prev.filter(r => r !== url));
  saveLocal();
}

export function resetMajorRelays() {
  setMajorRelaysSignal([...DEFAULT_MAJOR_RELAYS]);
  saveLocal();
}

// --- Publish functions ---

export function dedupeRelays(urls) {
  const seen = new Set();
  return urls.filter(u => {
    try {
      const n = normalizeURL(u);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    } catch { return false; }
  });
}

function getBroadcastRelays() {
  return dedupeRelays([
    ...getOutboxRelays(),
    ...INDEXER_RELAYS,
    ...getMajorRelays(),
  ]);
}

export async function publishRelayList() {
  if (!window.nostr) throw new Error("No Nostr extension found");

  const tags = relayList()
    .filter(e => e.read || e.write)
    .map(entry => {
      if (entry.read && entry.write) return ["r", entry.url];
      if (entry.read) return ["r", entry.url, "read"];
      return ["r", entry.url, "write"];
    });

  const signed = await window.nostr.signEvent({
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags: withClientTag(tags),
    content: "",
  });

  const pool = getPool();
  await Promise.allSettled(pool.publish(getBroadcastRelays(), signed));
  putCached(signed);
  return signed;
}

export async function publishDmRelayList() {
  if (!window.nostr) throw new Error("No Nostr extension found");

  const tags = dmRelayList().map(url => ["relay", url]);

  const signed = await window.nostr.signEvent({
    kind: 10050,
    created_at: Math.floor(Date.now() / 1000),
    tags: withClientTag(tags),
    content: "",
  });

  const pool = getPool();
  await Promise.allSettled(pool.publish(getBroadcastRelays(), signed));
  putCached(signed);
  return signed;
}

// --- Cleanup ---

export function clearRelayState() {
  setRelayList([]);
  setDmRelayList([]);
  setRelaySets([]);
  setRelayListLoaded(false);
}

// --- Register dynamic relays with pool.js ---

setDynamicRelays(() => getOutboxRelays());
