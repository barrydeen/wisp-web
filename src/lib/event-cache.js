/**
 * Central cache for replaceable Nostr events (kinds 0, 3, 10002, 10009, 10050, 10063).
 *
 * Prevents redundant indexer-relay queries by caching the latest event
 * per (kind, pubkey) pair with a 1-hour TTL.
 */
import { getPool } from "./pool";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_AUTHORS_PER_FILTER = 500;
const STORAGE_KEY = "wisp:event-cache";

// Map<string, { event: Event|null, fetchedAt: number }>
const cache = new Map();

// Hydrate from localStorage on module load (only real events, not misses)
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    const now = Date.now();
    for (const k in data) {
      const entry = data[k];
      if (entry.event && now - entry.fetchedAt < CACHE_TTL) {
        cache.set(k, entry);
      }
    }
  }
} catch { /* ignore corrupt data */ }

let persistTimer = null;
function schedulePersist() {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const data = {};
      for (const [k, entry] of cache) {
        if (entry.event) data[k] = entry; // only persist real events, not misses
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* localStorage full */ }
  }, 2000);
}

function key(kind, pubkey) {
  return `${kind}:${pubkey}`;
}

/** Return cached event, null (cached miss), or undefined (not in cache / expired). */
export function getCached(kind, pubkey) {
  const entry = cache.get(key(kind, pubkey));
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL) {
    cache.delete(key(kind, pubkey));
    return undefined;
  }
  return entry.event;
}

/** Store an event (keeps the newest by created_at). */
export function putCached(event) {
  if (!event || event.kind == null || !event.pubkey) return;
  const k = key(event.kind, event.pubkey);
  const existing = cache.get(k);
  if (existing?.event && existing.event.created_at >= event.created_at) return;
  cache.set(k, { event, fetchedAt: Date.now() });
  schedulePersist();
}

/** Record that we queried but found nothing for this (kind, pubkey). */
export function putMiss(kind, pubkey) {
  const k = key(kind, pubkey);
  if (cache.get(k)?.event) return; // don't overwrite real data
  cache.set(k, { event: null, fetchedAt: Date.now() });
  schedulePersist();
}

export function invalidate(kind, pubkey) {
  cache.delete(key(kind, pubkey));
  schedulePersist();
}

export function clearCache() {
  cache.clear();
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// Network helpers — cache-first, fall through to relay query on miss
// ---------------------------------------------------------------------------

/** Fetch a single replaceable event, checking cache first. */
export async function fetchCachedEvent(kind, pubkey, relays, opts = {}) {
  const cached = getCached(kind, pubkey);
  if (cached !== undefined) return cached;

  const pool = getPool();
  const events = await pool.querySync(
    relays,
    { kinds: [kind], authors: [pubkey] },
    {
      maxWait: opts.maxWait || 5000,
      ...(opts.abort ? { abort: opts.abort } : {}),
    },
  );

  const latest = events.reduce(
    (best, e) => (!best || e.created_at > best.created_at ? e : best),
    null,
  );

  if (latest) putCached(latest);
  else putMiss(kind, pubkey);

  return latest;
}

/**
 * Fetch replaceable events for many pubkeys (single kind), checking cache
 * first. Automatically batches uncached pubkeys into groups of 500.
 * Returns all found events (cached + newly fetched).
 */
export async function fetchCachedEvents(kind, pubkeys, relays, opts = {}) {
  const results = [];
  const uncached = [];

  for (const pk of pubkeys) {
    const cached = getCached(kind, pk);
    if (cached !== undefined) {
      if (cached) results.push(cached);
      // cached === null means known miss — skip
    } else {
      uncached.push(pk);
    }
  }

  if (uncached.length === 0) return results;

  const pool = getPool();
  const batches = [];
  for (let i = 0; i < uncached.length; i += MAX_AUTHORS_PER_FILTER) {
    batches.push(uncached.slice(i, i + MAX_AUTHORS_PER_FILTER));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      pool.querySync(relays, { kinds: [kind], authors: batch }, {
        maxWait: opts.maxWait || 8000,
        ...(opts.abort ? { abort: opts.abort } : {}),
      }),
    ),
  );

  const allEvents = batchResults.flat();

  // Cache every event (putCached keeps newest per pubkey)
  for (const event of allEvents) putCached(event);

  // Mark misses
  const fetched = new Set(allEvents.map((e) => e.pubkey));
  for (const pk of uncached) {
    if (!fetched.has(pk)) putMiss(kind, pk);
  }

  // Collect latest per uncached pubkey
  for (const pk of uncached) {
    const c = getCached(kind, pk);
    if (c) results.push(c);
  }

  return results;
}

/**
 * Fetch multiple kinds for a single author in one query, caching each kind
 * individually. Returns { [kind]: event | null }.
 */
export async function fetchCachedMultiKind(kinds, pubkey, relays, opts = {}) {
  const results = {};
  const needed = [];

  for (const kind of kinds) {
    const cached = getCached(kind, pubkey);
    if (cached !== undefined) {
      results[kind] = cached;
    } else {
      needed.push(kind);
    }
  }

  if (needed.length > 0) {
    const pool = getPool();
    const events = await pool.querySync(
      relays,
      { kinds: needed, authors: [pubkey] },
      { maxWait: opts.maxWait || 5000 },
    );

    for (const kind of needed) {
      const kindEvents = events.filter((e) => e.kind === kind);
      const latest = kindEvents.reduce(
        (best, e) => (!best || e.created_at > best.created_at ? e : best),
        null,
      );
      if (latest) putCached(latest);
      else putMiss(kind, pubkey);
      results[kind] = latest;
    }
  }

  return results;
}
