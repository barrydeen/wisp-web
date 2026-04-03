import { createSignal } from "solid-js";
import { nip19 } from "nostr-tools";
import { getPool } from "./pool";
import { INDEXER_RELAYS } from "./identity";

const MAX_IDS_PER_FILTER = 150;

// note event ID -> nostr event object
const noteCache = new Map();
const pendingRequests = new Set();
const [noteVersion, setNoteVersion] = createSignal(0);

// Batch queue: Map<noteId, Set<relayUrl>>
let batchQueue = new Map();
let batchTimeout = null;

// Coalesced version bumping (same pattern as engagement.js)
let versionDirty = false;
function markDirty() {
  if (!versionDirty) {
    versionDirty = true;
    setTimeout(() => {
      versionDirty = false;
      setNoteVersion((v) => v + 1);
    }, 50);
  }
}

function handleNoteEvent(event) {
  if (noteCache.has(event.id)) return;
  noteCache.set(event.id, event);
  markDirty();
}

function flushBatch() {
  const queue = batchQueue;
  batchQueue = new Map();
  batchTimeout = null;

  if (queue.size === 0) return;

  const pool = getPool();

  // Group IDs by relay
  const relayToIds = new Map();
  const allIds = [];

  for (const [noteId, relaySet] of queue) {
    allIds.push(noteId);
    for (const relay of relaySet) {
      if (!relayToIds.has(relay)) relayToIds.set(relay, []);
      relayToIds.get(relay).push(noteId);
    }
  }

  // Per-relay subscriptions (chunked)
  for (const [relay, ids] of relayToIds) {
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += MAX_IDS_PER_FILTER) {
      const chunk = unique.slice(i, i + MAX_IDS_PER_FILTER);
      pool.subscribeMany([relay], { ids: chunk }, {
        onevent: handleNoteEvent,
      });
    }
  }

  // Indexer fallback for all IDs
  for (let i = 0; i < allIds.length; i += MAX_IDS_PER_FILTER) {
    const chunk = allIds.slice(i, i + MAX_IDS_PER_FILTER);
    pool.subscribeMany(INDEXER_RELAYS, { ids: chunk }, {
      onevent: handleNoteEvent,
    });
  }
}

export function requestNote(id, relays = []) {
  if (noteCache.has(id) || pendingRequests.has(id)) return;
  pendingRequests.add(id);

  if (!batchQueue.has(id)) {
    batchQueue.set(id, new Set());
  }
  const relaySet = batchQueue.get(id);
  for (const r of relays) {
    relaySet.add(r);
  }

  if (!batchTimeout) {
    batchTimeout = setTimeout(flushBatch, 150);
  }
}

export function getNote(id) {
  noteVersion();
  requestNote(id);
  return noteCache.get(id) || null;
}

// Regex for nostr:note1... and nostr:nevent1... URIs
const nostrNoteRegex = /nostr:(note1[a-z0-9]+|nevent1[a-z0-9]+)/gi;

export function extractReferencedNoteIds(note) {
  const refs = new Map(); // id -> Set<relay>

  function addRef(id, relays = []) {
    if (!refs.has(id)) refs.set(id, new Set());
    const set = refs.get(id);
    for (const r of relays) set.add(r);
  }

  // Scan content for nostr:note1.../nostr:nevent1... URIs
  if (note.content) {
    for (const match of note.content.matchAll(nostrNoteRegex)) {
      try {
        const decoded = nip19.decode(match[1]);
        if (decoded.type === "note") {
          addRef(decoded.data);
        } else if (decoded.type === "nevent") {
          addRef(decoded.data.id, decoded.data.relays || []);
        }
      } catch {
        // invalid bech32
      }
    }
  }

  // Extract q tags: ["q", "<event-id>", "<relay-url>?"]
  if (note.tags) {
    for (const tag of note.tags) {
      if (tag[0] === "q" && tag[1]) {
        addRef(tag[1], tag[2] ? [tag[2]] : []);
      }
    }
  }

  return [...refs.entries()].map(([id, relaySet]) => ({
    id,
    relays: [...relaySet],
  }));
}
