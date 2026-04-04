import { publishEvent } from "./pool";
import { getOutboxRelays, dedupeRelays } from "./relays";
import { resolveInboxRelays, optimisticReaction, optimisticRepost } from "./engagement";

async function getTargetRelays(authorPubkey) {
  const inboxMap = await resolveInboxRelays([authorPubkey]);
  const authorInbox = inboxMap.get(authorPubkey) || [];
  const myOutbox = getOutboxRelays();
  return dedupeRelays([...authorInbox, ...myOutbox]);
}

export async function sendReaction(note, emoji, emojiUrl) {
  const tags = [
    ["e", note.id],
    ["p", note.pubkey],
  ];

  let content = emoji;

  // Custom emoji — content is :shortcode:, add emoji tag
  if (emojiUrl) {
    const shortcode = emoji.replace(/^:|:$/g, "");
    content = `:${shortcode}:`;
    tags.push(["emoji", shortcode, emojiUrl]);
  }

  const relays = await getTargetRelays(note.pubkey);

  optimisticReaction(note.id, content, emojiUrl);

  await publishEvent(
    { kind: 7, content, tags, created_at: Math.floor(Date.now() / 1000) },
    relays,
  );
}

export async function sendRepost(note) {
  const tags = [
    ["e", note.id],
    ["p", note.pubkey],
  ];

  const relays = await getTargetRelays(note.pubkey);

  optimisticRepost(note.id);

  await publishEvent(
    { kind: 6, content: JSON.stringify(note), tags, created_at: Math.floor(Date.now() / 1000) },
    relays,
  );
}
