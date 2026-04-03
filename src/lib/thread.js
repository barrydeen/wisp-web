import { normalizeURL } from "nostr-tools/utils";
import { getRelays } from "./pool";
import { INDEXER_RELAYS } from "./identity";
import { fetchCachedEvent } from "./event-cache";

/**
 * Fetch inbox (read) relays for a pubkey from their kind 10002 relay list.
 * Falls back to default relays if none found.
 */
export async function fetchInboxRelays(pubkey) {
  const latest = await fetchCachedEvent(10002, pubkey, INDEXER_RELAYS);

  if (!latest) return getRelays();

  const readRelays = [];
  for (const tag of latest.tags) {
    if (tag[0] !== "r") continue;
    const url = tag[1];
    const marker = tag[2];
    // No marker = both read+write. "read" = read only. "write" = skip.
    if (!marker || marker === "read") {
      try {
        readRelays.push(normalizeURL(url));
      } catch {
        // bad URL
      }
    }
  }

  return readRelays.length > 0 ? readRelays : getRelays();
}

/**
 * Parse e-tags from a reply event to determine its root and direct parent.
 * Handles both NIP-10 marked tags and legacy positional interpretation.
 */
export function parseThreadParent(event) {
  const eTags = event.tags.filter((t) => t[0] === "e");
  if (eTags.length === 0) return null;

  // Look for marked tags
  const rootTag = eTags.find((t) => t[3] === "root");
  const replyTag = eTags.find((t) => t[3] === "reply");

  if (rootTag) {
    const rootId = rootTag[1];
    // If only root marker (no reply), this is a direct reply to root
    const replyId = replyTag ? replyTag[1] : rootId;
    return { rootId, replyId };
  }

  // Legacy fallback: positional interpretation
  // First e-tag = root, last e-tag = reply parent
  const rootId = eTags[0][1];
  const replyId = eTags[eTags.length - 1][1];
  return { rootId, replyId };
}

/**
 * Build a thread tree from a flat array of reply events.
 * Returns Map<parentId, Event[]> sorted by created_at ascending.
 */
export function buildThreadTree(rootId, replies, ownPubkey = null) {
  const tree = new Map();
  const replyIds = new Set(replies.map((r) => r.id));

  for (const reply of replies) {
    const parsed = parseThreadParent(reply);
    if (!parsed) continue;

    // Skip events from a different thread
    if (parsed.rootId !== rootId) continue;

    // If the direct parent isn't in our set, place under root
    let parentId = parsed.replyId;
    if (parentId !== rootId && !replyIds.has(parentId)) {
      parentId = rootId;
    }

    if (!tree.has(parentId)) tree.set(parentId, []);
    tree.get(parentId).push(reply);
  }

  // Sort each group: own replies first, then chronologically (oldest first)
  for (const [, children] of tree) {
    children.sort((a, b) => {
      if (ownPubkey) {
        const aOwn = a.pubkey === ownPubkey;
        const bOwn = b.pubkey === ownPubkey;
        if (aOwn && !bOwn) return -1;
        if (!aOwn && bOwn) return 1;
      }
      return a.created_at - b.created_at;
    });
  }

  return tree;
}
