import { createSignal } from "solid-js";
import { getPool, publishEvent } from "./pool";
import { getOutboxRelays } from "./relays";
import { getPubkey } from "./identity";
import { withClientTag } from "./settings";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

// --- State signals ---

const [interestSets, setInterestSets] = createSignal([]);
const [interestSetsLoaded, setInterestSetsLoaded] = createSignal(false);

// --- Accessors ---

export function getInterestSets() {
  return interestSets();
}

export function isInterestSetsLoaded() {
  return interestSetsLoaded();
}

export function isFollowingHashtag(tag) {
  const lower = tag.toLowerCase();
  return interestSets().some(s => s.hashtags.has(lower));
}

export function findSetsContaining(tag) {
  const lower = tag.toLowerCase();
  return interestSets().filter(s => s.hashtags.has(lower));
}

// --- Fetch from network ---

export async function fetchInterestSets(pubkey) {
  const pool = getPool();
  const relays = getOutboxRelays();
  const queryRelays = relays.length > 0 ? relays : DEFAULT_RELAYS;

  const events = await pool.querySync(
    queryRelays,
    { kinds: [30015], authors: [pubkey] },
    { maxWait: 5000 },
  );

  const sets = [];
  const seen = new Set();
  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);

  for (const event of sorted) {
    const dTag = event.tags.find(t => t[0] === "d")?.[1] || "";
    if (seen.has(dTag)) continue;
    seen.add(dTag);

    const hashtags = new Set();
    let title = null;
    for (const tag of event.tags) {
      if (tag.length < 2) continue;
      if (tag[0] === "t") hashtags.add(tag[1].toLowerCase());
      if (tag[0] === "title") title = tag[1];
    }

    sets.push({
      dTag,
      name: title || dTag,
      hashtags,
      createdAt: event.created_at,
    });
  }

  setInterestSets(sets);
  setInterestSetsLoaded(true);
}

// --- Tag builder ---

function buildInterestSetTags(dTag, hashtags, title) {
  const tags = [["d", dTag]];
  if (title) tags.push(["title", title]);
  for (const t of hashtags) {
    tags.push(["t", t.toLowerCase()]);
  }
  return tags;
}

function getPublishRelays() {
  const relays = getOutboxRelays();
  return relays.length > 0 ? relays : DEFAULT_RELAYS;
}

// --- CRUD functions ---

export async function createInterestSet(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const dTag = trimmed.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

  const tags = buildInterestSetTags(dTag, [], trimmed);
  await publishEvent({
    kind: 30015,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  }, getPublishRelays());

  // Optimistic update
  setInterestSets(prev => [
    ...prev,
    { dTag, name: trimmed, hashtags: new Set(), createdAt: Math.floor(Date.now() / 1000) },
  ]);
}

export async function renameInterestSet(dTag, newName) {
  const existing = interestSets().find(s => s.dTag === dTag);
  if (!existing) return;

  const tags = buildInterestSetTags(dTag, existing.hashtags, newName.trim());
  await publishEvent({
    kind: 30015,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  }, getPublishRelays());

  setInterestSets(prev => prev.map(s =>
    s.dTag === dTag ? { ...s, name: newName.trim() } : s
  ));
}

export async function deleteInterestSet(dTag) {
  const pk = getPubkey();
  if (!pk) return;

  await publishEvent({
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["a", `30015:${pk}:${dTag}`]],
    content: "",
  }, getPublishRelays());

  setInterestSets(prev => prev.filter(s => s.dTag !== dTag));
}

export async function addHashtagToSet(dTag, hashtag) {
  const existing = interestSets().find(s => s.dTag === dTag);
  if (!existing) return;

  const lower = hashtag.toLowerCase();
  const newHashtags = new Set(existing.hashtags);
  newHashtags.add(lower);

  const tags = buildInterestSetTags(dTag, newHashtags, existing.name !== dTag ? existing.name : null);
  await publishEvent({
    kind: 30015,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  }, getPublishRelays());

  setInterestSets(prev => prev.map(s =>
    s.dTag === dTag ? { ...s, hashtags: newHashtags } : s
  ));
}

export async function removeHashtagFromSet(dTag, hashtag) {
  const existing = interestSets().find(s => s.dTag === dTag);
  if (!existing) return;

  const lower = hashtag.toLowerCase();
  const newHashtags = new Set(existing.hashtags);
  newHashtags.delete(lower);

  const tags = buildInterestSetTags(dTag, newHashtags, existing.name !== dTag ? existing.name : null);
  await publishEvent({
    kind: 30015,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  }, getPublishRelays());

  setInterestSets(prev => prev.map(s =>
    s.dTag === dTag ? { ...s, hashtags: newHashtags } : s
  ));
}

// --- Cleanup ---

export function clearInterestState() {
  setInterestSets([]);
  setInterestSetsLoaded(false);
}
