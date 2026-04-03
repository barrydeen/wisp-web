import { nip19 } from "nostr-tools";

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const videoExtensions = new Set(["mp4", "mov", "webm"]);
const audioExtensions = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac"]);

const imageMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const videoMimeTypes = ["video/mp4", "video/quicktime", "video/webm"];
const audioMimeTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/flac", "audio/aac"];

// Port of RichContent.kt:235 — single combined regex for all content types
const combinedRegex = new RegExp(
  // 1. nostr: URIs (nostr:note1..., nostr:npub1..., etc.)
  `nostr:(note1|nevent1|npub1|nprofile1|naddr1)[a-z0-9]+` +
  // 2. Bare npub (npub1 + 58 chars, not preceded/followed by word char)
  `|(?<!\\w)(npub1[a-z0-9]{58})(?!\\w|\\.[a-zA-Z])` +
  // 3. HTTP/HTTPS/WSS URLs
  `|(?:https?|wss?)://\\S+` +
  // 4. Bare domain names with known TLDs
  `|(?<!\\w)((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+(?:com|net|org|io|dev|app|pro|ai|co|me|info|xyz|cc|tv|to|gg|sh|im|is|it|rs|ly|site|online|store|tech|cloud|social|world|earth|space|lol|wtf|family|life|art|design|blog|news|live|video|media|chat|games|money|finance|agency|studio|build|run|codes|systems|network|zone|pub|blue|limo|fyi|wiki|page|link|click|exchange|markets|fun|club|today)(?:/\\S*)?)(?!\\w)` +
  // 5. Hashtags
  `|(?<!\\w)#([a-zA-Z0-9_][a-zA-Z0-9_-]*)` +
  // 6. Bare bech32 references (note1, nevent1, nprofile1, naddr1)
  `|(?<!\\w)((?:note1|nevent1|nprofile1|naddr1)[a-z0-9]{10,})(?!\\w)`,
  "gi"
);

const emojiShortcodeRegex = /:([a-zA-Z0-9_-]+):/g;
const bolt11Regex = /(?:lightning:)?(lnbc|lntb|lnbcrt)[0-9a-z]{50,}/gi;
const blossomPathRegex = /^\/[0-9a-f]{64}$/i;

function classifyByMime(mime) {
  if (imageMimeTypes.some((m) => mime.startsWith(m))) return "image";
  if (videoMimeTypes.some((m) => mime.startsWith(m))) return "video";
  if (audioMimeTypes.some((m) => mime.startsWith(m))) return "audio";
  return null;
}

function isBlossomUrl(url) {
  try {
    const path = new URL(url).pathname;
    return blossomPathRegex.test(path);
  } catch {
    return false;
  }
}

function isStandaloneUrl(content, matchStart, matchEnd) {
  // Look back: only whitespace between previous newline (or start) and match start
  const before = content.substring(0, matchStart);
  const lineStart = before.lastIndexOf("\n") + 1;
  const prefix = before.substring(lineStart);
  if (prefix.trim() !== "") return false;

  // Look forward: only whitespace between match end and next newline (or end)
  const after = content.substring(matchEnd);
  const lineEnd = after.indexOf("\n");
  const suffix = lineEnd === -1 ? after : after.substring(0, lineEnd);
  if (suffix.trim() !== "") return false;

  return true;
}

function getExtension(url) {
  try {
    const path = new URL(url).pathname;
    const dot = path.lastIndexOf(".");
    if (dot === -1) return "";
    return path.substring(dot + 1).toLowerCase();
  } catch {
    return "";
  }
}

function classifyUrl(url, content, matchStart, matchEnd, imetaMap) {
  const isWebSocket = url.startsWith("wss://") || url.startsWith("ws://");
  const imetaMime = imetaMap[url] ? classifyByMime(imetaMap[url]) : null;
  const ext = getExtension(url);

  if (imetaMime === "image") return { type: "image", url };
  if (imetaMime === "video") return { type: "video", url };
  if (imetaMime === "audio") return { type: "audio", url };
  if (imageExtensions.has(ext)) return { type: "image", url };
  if (videoExtensions.has(ext)) return { type: "video", url };
  if (audioExtensions.has(ext)) return { type: "audio", url };

  // NIP-29 group invite: wss://relay.example.com'groupid
  if (isWebSocket && url.includes("'")) {
    const parts = url.split("'");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { type: "group-invite", relay: parts[0], groupId: parts[1] };
    }
    return { type: "inline-link", url };
  }

  if (isWebSocket) return { type: "inline-link", url };
  if (isBlossomUrl(url)) return { type: "inline-link", url }; // could detect media later
  if (isStandaloneUrl(content, matchStart, matchEnd)) return { type: "link", url };
  return { type: "inline-link", url };
}

function decodeNostr(token) {
  try {
    const input = token.startsWith("nostr:") ? token.substring(6) : token;
    const decoded = nip19.decode(input);
    switch (decoded.type) {
      case "note":
        return { type: "nostr-note", id: decoded.data, relays: [] };
      case "nevent":
        return { type: "nostr-note", id: decoded.data.id, relays: decoded.data.relays || [] };
      case "npub":
        return { type: "nostr-profile", pubkey: decoded.data, relays: [] };
      case "nprofile":
        return { type: "nostr-profile", pubkey: decoded.data.pubkey, relays: decoded.data.relays || [] };
      case "naddr":
        return {
          type: "nostr-addr",
          identifier: decoded.data.identifier,
          pubkey: decoded.data.pubkey,
          kind: decoded.data.kind,
          relays: decoded.data.relays || [],
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function splitTextForEmojis(text, emojiMap) {
  const segments = [];
  let lastEnd = 0;
  const regex = new RegExp(emojiShortcodeRegex.source, "g");

  for (const match of text.matchAll(regex)) {
    const shortcode = match[1];
    const url = emojiMap[shortcode];
    if (!url) continue;

    if (match.index > lastEnd) {
      segments.push({ type: "text", text: text.substring(lastEnd, match.index) });
    }
    segments.push({ type: "custom-emoji", shortcode, url });
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < text.length) {
    segments.push({ type: "text", text: text.substring(lastEnd) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

function splitTextForInvoices(text) {
  const segments = [];
  let lastEnd = 0;
  const regex = new RegExp(bolt11Regex.source, "gi");

  for (const match of text.matchAll(regex)) {
    if (match.index > lastEnd) {
      segments.push({ type: "text", text: text.substring(lastEnd, match.index) });
    }
    segments.push({ type: "lightning-invoice", invoice: match[0] });
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < text.length) {
    segments.push({ type: "text", text: text.substring(lastEnd) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

export function parseContent(content, emojiMap = {}, imetaMap = {}) {
  const trimmed = content.replace(/[\n\r]+$/, "");
  const segments = [];
  let lastEnd = 0;

  // Reset regex state
  const regex = new RegExp(combinedRegex.source, combinedRegex.flags);

  for (const match of trimmed.matchAll(regex)) {
    if (match.index > lastEnd) {
      segments.push({ type: "text", text: trimmed.substring(lastEnd, match.index) });
    }

    const token = match[0];
    const hashtagCapture = match[4];
    const bareDomainCapture = match[3];
    const bareNpubCapture = match[2];
    const bareBech32Capture = match[5];

    if (hashtagCapture && token.startsWith("#")) {
      // Hashtag
      segments.push({ type: "hashtag", tag: hashtagCapture });
    } else if (bareNpubCapture) {
      // Bare npub
      const decoded = decodeNostr(bareNpubCapture);
      if (decoded) segments.push(decoded);
      else segments.push({ type: "text", text: token });
    } else if (bareDomainCapture && !token.startsWith("http")) {
      // Bare domain name — prepend https://
      const url = "https://" + bareDomainCapture;
      segments.push(classifyUrl(url, trimmed, match.index, match.index + match[0].length, imetaMap));
    } else if (token.startsWith("nostr:")) {
      // Nostr URI
      const decoded = decodeNostr(token);
      if (decoded) segments.push(decoded);
      else segments.push({ type: "text", text: token });
    } else if (bareBech32Capture) {
      // Bare bech32 (note1, nevent1, nprofile1, naddr1 without nostr: prefix)
      const decoded = decodeNostr(bareBech32Capture);
      if (decoded) segments.push(decoded);
      else segments.push({ type: "text", text: token });
    } else {
      // URL — trim trailing punctuation
      const url = token.replace(/[.,)\];:!?]+$/, "");
      const trimmedChars = token.length - url.length;

      segments.push(classifyUrl(url, trimmed, match.index, match.index + url.length, imetaMap));

      // Add trimmed punctuation back as text
      if (trimmedChars > 0) {
        lastEnd = match.index + url.length;
        segments.push({ type: "text", text: token.substring(url.length) });
      }
    }

    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < trimmed.length) {
    segments.push({ type: "text", text: trimmed.substring(lastEnd) });
  }

  // Second pass: split text segments for custom emoji
  let afterEmoji = segments;
  if (Object.keys(emojiMap).length > 0) {
    afterEmoji = [];
    for (const seg of segments) {
      if (seg.type === "text") {
        afterEmoji.push(...splitTextForEmojis(seg.text, emojiMap));
      } else {
        afterEmoji.push(seg);
      }
    }
  }

  // Third pass: detect lightning invoices in text segments
  const result = [];
  for (const seg of afterEmoji) {
    if (seg.type === "text") {
      result.push(...splitTextForInvoices(seg.text));
    } else {
      result.push(seg);
    }
  }

  return result;
}

/** Parse NIP-92 imeta tags: ["imeta", "url https://...", "m image/png", ...] */
export function parseImetaTags(tags) {
  const map = {};
  if (!Array.isArray(tags)) return map;
  for (const tag of tags) {
    if (tag[0] !== "imeta" || tag.length < 2) continue;
    let url = null;
    let mime = null;
    for (let i = 1; i < tag.length; i++) {
      if (tag[i].startsWith("url ")) url = tag[i].substring(4);
      else if (tag[i].startsWith("m ")) mime = tag[i].substring(2);
    }
    if (url && mime) map[url] = mime;
  }
  return map;
}

/** Build shortcode->URL map from NIP-30 emoji tags: ["emoji", "shortcode", "url"] */
export function buildEmojiMap(tags) {
  const map = {};
  if (!Array.isArray(tags)) return map;
  for (const tag of tags) {
    if (tag[0] === "emoji" && tag[1] && tag[2]) {
      map[tag[1]] = tag[2];
    }
  }
  return map;
}
