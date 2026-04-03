import { nip19 } from "nostr-tools";

export function formatTime(ts) {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function npubShort(pubkey) {
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 12) + "..." + npub.slice(-4);
  } catch {
    return pubkey.slice(0, 8) + "...";
  }
}

export function avatarColor(pubkey) {
  let hash = 0;
  for (let i = 0; i < 8; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 50%, 50%)`;
}

export function formatNip05(nip05) {
  if (!nip05 || typeof nip05 !== "string") return null;
  return nip05.startsWith("_@") ? nip05.slice(2) : nip05;
}

export function extractClientTag(tags) {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((t) => t[0] === "client");
  return tag ? tag[1] : null;
}

export function formatSats(sats) {
  if (sats >= 1_000_000) return (sats / 1_000_000).toFixed(1) + "M";
  if (sats >= 1_000) return (sats / 1_000).toFixed(1) + "k";
  return String(sats);
}
