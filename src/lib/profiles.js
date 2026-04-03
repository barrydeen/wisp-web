import { createSignal } from "solid-js";
import { getPool, getRelays } from "./pool";

// In-memory profile cache: pubkey -> {name, picture, about, ...}
const profileCache = new Map();
const pendingRequests = new Set();
const [profileVersion, setProfileVersion] = createSignal(0);

// Batch fetch profiles — collects pubkeys and fetches in one request
let batchTimeout = null;
let batchQueue = new Set();

function flushBatch() {
  const pubkeys = [...batchQueue];
  batchQueue = new Set();
  batchTimeout = null;

  const pool = getPool();
  const relays = getRelays();

  pool.subscribeMany(relays, { kinds: [0], authors: pubkeys }, {
    onevent(event) {
      try {
        const meta = JSON.parse(event.content);
        const existing = profileCache.get(event.pubkey);
        if (!existing || existing._created_at < event.created_at) {
          meta._created_at = event.created_at;
          profileCache.set(event.pubkey, meta);
          setProfileVersion((v) => v + 1);
        }
      } catch {
        // bad metadata
      }
    },
  });
}

export function requestProfile(pubkey) {
  if (profileCache.has(pubkey) || pendingRequests.has(pubkey)) return;
  pendingRequests.add(pubkey);
  batchQueue.add(pubkey);

  if (!batchTimeout) {
    batchTimeout = setTimeout(flushBatch, 150);
  }
}

export function getProfile(pubkey) {
  // Access the version signal so components re-render when profiles load
  profileVersion();
  requestProfile(pubkey);
  return profileCache.get(pubkey);
}

export function getProfileCache() {
  profileVersion();
  return profileCache;
}
