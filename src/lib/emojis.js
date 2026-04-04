/**
 * Custom emoji data layer (NIP-30 + NIP-51 kind 10030 / kind 30030).
 *
 * Fetches the logged-in user's emoji list and any referenced emoji packs,
 * merges them into a flat array, and provides search + tag-building helpers.
 */
import { createSignal } from "solid-js";
import { fetchCachedEvent } from "./event-cache";
import { getPool } from "./pool";
import { getOutboxRelays } from "./relays";

const MAX_PACKS = 20;
const SHORTCODE_REGEX = /:([a-zA-Z0-9_-]+):/g;

// --- Signals ---

const [userEmojis, setUserEmojis] = createSignal([]);
// Each entry: { shortcode: string, url: string }

// Emoji packs for display in Settings
// Each: { aTag, name, emojis: [{ shortcode, url }] }
const [emojiPacks, setEmojiPacks] = createSignal([]);

// Module-level cache for kind 30030 packs (keyed by "30030:pubkey:d-tag")
const packCache = new Map();

// --- Fetch ---

export async function fetchUserEmojiList(pubkey) {
  const relays = getOutboxRelays();
  const event = await fetchCachedEvent(10030, pubkey, relays);
  if (!event) {
    setUserEmojis([]);
    setEmojiPacks([]);
    return;
  }

  const emojis = [];
  const seen = new Set();
  const packRefs = [];

  for (const tag of event.tags) {
    if (tag[0] === "emoji" && tag[1] && tag[2]) {
      if (!seen.has(tag[1])) {
        seen.add(tag[1]);
        emojis.push({ shortcode: tag[1], url: tag[2] });
      }
    } else if (tag[0] === "a" && tag[1]?.startsWith("30030:")) {
      packRefs.push(tag[1]);
    }
  }

  // Fetch referenced emoji packs (limit to MAX_PACKS)
  const refs = packRefs.slice(0, MAX_PACKS);
  const packs = [];
  if (refs.length > 0) {
    const fetchedPacks = await fetchEmojiPacks(refs, relays);
    for (const pack of fetchedPacks) {
      packs.push(pack);
      for (const e of pack.emojis) {
        if (!seen.has(e.shortcode)) {
          seen.add(e.shortcode);
          emojis.push(e);
        }
      }
    }
  }

  setUserEmojis(emojis);
  setEmojiPacks(packs);
}

async function fetchEmojiPacks(aTagValues, relays) {
  const pool = getPool();
  const packs = [];

  // Parse a-tag values and group by what's already cached
  const toFetch = [];
  for (const aVal of aTagValues) {
    if (packCache.has(aVal)) {
      packs.push(packCache.get(aVal));
      continue;
    }
    const parts = aVal.split(":");
    if (parts.length >= 3) {
      toFetch.push({ aVal, pubkey: parts[1], dTag: parts.slice(2).join(":") });
    }
  }

  // Fetch uncached packs in parallel
  const results = await Promise.allSettled(
    toFetch.map(({ pubkey, dTag }) =>
      pool.querySync(
        relays,
        { kinds: [30030], authors: [pubkey], "#d": [dTag] },
        { maxWait: 5000 },
      ),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const packEmojis = [];
    let name = toFetch[i].dTag;
    if (results[i].status === "fulfilled") {
      const events = results[i].value;
      // Keep newest event
      const latest = events.reduce(
        (best, e) => (!best || e.created_at > best.created_at ? e : best),
        null,
      );
      if (latest) {
        // Use title tag if present, otherwise d-tag
        const titleTag = latest.tags.find((t) => t[0] === "title" && t[1]);
        if (titleTag) name = titleTag[1];
        for (const tag of latest.tags) {
          if (tag[0] === "emoji" && tag[1] && tag[2]) {
            packEmojis.push({ shortcode: tag[1], url: tag[2] });
          }
        }
      }
    }
    const pack = { aTag: toFetch[i].aVal, name, emojis: packEmojis };
    packCache.set(toFetch[i].aVal, pack);
    packs.push(pack);
  }

  return packs;
}

// --- Query ---

export function getUserEmojis() {
  return userEmojis();
}

export function getEmojiPacks() {
  return emojiPacks();
}

export function searchEmojis(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const results = [];
  for (const e of userEmojis()) {
    if (e.shortcode.toLowerCase().includes(q)) {
      results.push(e);
      if (results.length >= 8) break;
    }
  }
  return results;
}

export function getEmojiUrl(shortcode) {
  for (const e of userEmojis()) {
    if (e.shortcode === shortcode) return e.url;
  }
  return null;
}

// --- Tag building ---

export function buildEmojiTagsFromContent(content) {
  const tags = [];
  const seen = new Set();
  const regex = new RegExp(SHORTCODE_REGEX.source, "g");

  for (const match of content.matchAll(regex)) {
    const shortcode = match[1];
    if (seen.has(shortcode)) continue;
    seen.add(shortcode);
    const url = getEmojiUrl(shortcode);
    if (url) {
      tags.push(["emoji", shortcode, url]);
    }
  }
  return tags;
}

// --- Cleanup ---

export function clearEmojiState() {
  setUserEmojis([]);
  setEmojiPacks([]);
  packCache.clear();
}
