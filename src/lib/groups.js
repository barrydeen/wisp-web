import { getPool, getRelays } from "./pool";
import { withClientTag } from "./settings";
import { getPubkey, INDEXER_RELAYS } from "./identity";
import {
  parseGroupCode,
  encodeGroupReference,
  parseGroupMetadataEvent,
  parseGroupAdminsEvent,
  parseGroupMembersEvent,
} from "nostr-tools/nip29";
import { normalizeURL } from "nostr-tools/utils";
import { fetchCachedEvent, putCached } from "./event-cache";

export { parseGroupCode, encodeGroupReference, normalizeURL };

// --- Publishing helpers ---

async function signAndPublish(relayUrl, eventTemplate) {
  if (!window.nostr) throw new Error("No Nostr extension found");
  const template = {
    ...eventTemplate,
    tags: withClientTag(eventTemplate.tags || []),
  };
  const signed = await window.nostr.signEvent(template);
  const pool = getPool();
  await Promise.allSettled(pool.publish([relayUrl], signed));
  return signed;
}

export async function sendGroupMessage(relayUrl, groupId, content) {
  return signAndPublish(relayUrl, {
    kind: 9,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", groupId]],
    content,
  });
}

export async function sendJoinRequest(relayUrl, groupId) {
  return signAndPublish(relayUrl, {
    kind: 9021,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", groupId]],
    content: "",
  });
}

export async function sendLeaveRequest(relayUrl, groupId) {
  return signAndPublish(relayUrl, {
    kind: 9022,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", groupId]],
    content: "",
  });
}

export async function sendCreateGroup(relayUrl, name, about, picture) {
  const groupId = Math.random().toString(36).slice(2, 10);
  const tags = [["h", groupId]];
  if (name) tags.push(["name", name]);
  if (about) tags.push(["about", about]);
  if (picture) tags.push(["picture", picture]);

  await signAndPublish(relayUrl, {
    kind: 9007,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  });
  return groupId;
}

// --- Kind 10009 group list management ---

async function fetchCurrentGroupList() {
  const pubkey = getPubkey();
  if (!pubkey) return null;

  return fetchCachedEvent(10009, pubkey, [...getRelays(), ...INDEXER_RELAYS]);
}

function parseGroupListTags(event) {
  if (!event) return [];
  return event.tags
    .filter((t) => t[0] === "group" && t[1] && t[2])
    .map((t) => ({ id: t[1], relay: t[2] }));
}

export async function loadUserGroups() {
  const event = await fetchCurrentGroupList();
  return parseGroupListTags(event);
}

async function publishGroupList(groups) {
  const tags = groups.map((g) => ["group", g.id, g.relay]);
  const relays = [...getRelays(), ...INDEXER_RELAYS];

  if (!window.nostr) throw new Error("No Nostr extension found");
  const signed = await window.nostr.signEvent({
    kind: 10009,
    created_at: Math.floor(Date.now() / 1000),
    tags: withClientTag(tags),
    content: "",
  });

  const pool = getPool();
  await Promise.allSettled(pool.publish(relays, signed));
  putCached(signed);
  return signed;
}

export async function addToGroupList(groupId, relayUrl) {
  const current = await loadUserGroups();
  if (current.some((g) => g.id === groupId && g.relay === relayUrl)) return;
  await publishGroupList([...current, { id: groupId, relay: relayUrl }]);
}

export async function removeFromGroupList(groupId, relayUrl) {
  const current = await loadUserGroups();
  const filtered = current.filter(
    (g) => !(g.id === groupId && g.relay === relayUrl),
  );
  await publishGroupList(filtered);
}

// --- Metadata parsing helpers ---

export function parseMetadata(events) {
  const metaEvent = events.find((e) => e.kind === 39000);
  const adminsEvent = events.find((e) => e.kind === 39001);
  const membersEvent = events.find((e) => e.kind === 39002);

  let metadata = null;
  let admins = [];
  let members = [];

  try {
    if (metaEvent) metadata = parseGroupMetadataEvent(metaEvent);
  } catch {}
  try {
    if (adminsEvent) admins = parseGroupAdminsEvent(adminsEvent);
  } catch {}
  try {
    if (membersEvent) members = parseGroupMembersEvent(membersEvent);
  } catch {}

  return { metadata, admins, members };
}
