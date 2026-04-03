import { SimplePool } from "nostr-tools/pool";
import { createSignal } from "solid-js";
import { withClientTag } from "./settings";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

const pool = new SimplePool();

let dynamicRelays = null;

export function setDynamicRelays(fn) {
  dynamicRelays = fn;
}

export function getPool() {
  return pool;
}

export function getRelays() {
  if (dynamicRelays) {
    const relays = dynamicRelays();
    if (relays && relays.length > 0) return relays;
  }
  return DEFAULT_RELAYS;
}

// Subscribe to events with a signal-based API
export function createSubscription(filters, opts = {}) {
  const [events, setEvents] = createSignal([]);
  const relays = opts.relays || DEFAULT_RELAYS;
  const maxEvents = opts.limit || 500;

  const sub = pool.subscribeMany(relays, filters, {
    onevent(event) {
      setEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        const next = [...prev, event]
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, maxEvents);
        return next;
      });
    },
    oneose() {
      // end of stored events — stream continues for new events
    },
  });

  function cleanup() {
    sub.close();
  }

  return { events, cleanup };
}

// Subscribe preserving relay delivery order (for pre-ranked feeds)
export function createOrderedSubscription(filters, opts = {}) {
  const [events, setEvents] = createSignal([]);
  const relays = opts.relays || DEFAULT_RELAYS;
  const maxEvents = opts.limit || 500;

  const sub = pool.subscribeMany(relays, filters, {
    onevent(event) {
      setEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [...prev, event].slice(0, maxEvents);
      });
    },
    oneose() {},
  });

  return { events, cleanup: () => sub.close() };
}

// Sign an event via NIP-07 and publish to relays
export async function publishEvent(eventTemplate, relays) {
  if (!window.nostr) throw new Error("No Nostr extension found");
  const template = {
    ...eventTemplate,
    tags: withClientTag(eventTemplate.tags || []),
  };
  const signed = await window.nostr.signEvent(template);
  await Promise.allSettled(pool.publish(relays || DEFAULT_RELAYS, signed));
  return signed;
}
