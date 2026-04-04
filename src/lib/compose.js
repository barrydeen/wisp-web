import { createSignal } from "solid-js";
import { nip19 } from "nostr-tools";
import { buildEmojiTagsFromContent } from "./emojis";
import { uploadMedia } from "./blossom";
import { buildPictureTags, buildVideoTags, detectMediaKind, mimeFromUrl } from "./nip68";
import { buildPollTags } from "./nip88";
import { publishEvent } from "./pool";
import { getOutboxRelays } from "./relays";
import { getPubkey } from "./identity";
import { getPowEnabled, getPowDifficulty } from "./settings";
import { startMining, cancelMining, getMiningStatus } from "./pow";

// --- Signals ---

const [composerOpen, setComposerOpen] = createSignal(false);
const [content, setContent] = createSignal("");
const [publishing, setPublishing] = createSignal(false);
const [error, setError] = createSignal(null);

// Media
const [uploadedMedia, setUploadedMedia] = createSignal([]);
// Each: { url, mimeType, width, height }
const [uploadProgress, setUploadProgress] = createSignal(null);

// Mentions (set by Composer component)
const [mentionCandidates, setMentionCandidates] = createSignal([]);

// Emojis (set by Composer component)
const [emojiCandidates, setEmojiCandidates] = createSignal([]);

// Hashtags
const [hashtags, setHashtags] = createSignal([]);

// Toggles
const [explicit, setExplicit] = createSignal(false);
const [galleryMode, setGalleryMode] = createSignal(false);
const [pollEnabled, setPollEnabled] = createSignal(false);
const [pollOptions, setPollOptions] = createSignal(["", ""]);
const [pollType, setPollType] = createSignal("singlechoice");

// Countdown
const [countdownSeconds, setCountdownSeconds] = createSignal(null);
let countdownTimer = null;
let onCountdownComplete = null;

// --- Exports: Read state ---

export {
  composerOpen,
  content,
  setContent,
  publishing,
  error,
  uploadedMedia,
  uploadProgress,
  mentionCandidates,
  setMentionCandidates,
  emojiCandidates,
  setEmojiCandidates,
  hashtags,
  explicit,
  galleryMode,
  pollEnabled,
  pollOptions,
  pollType,
  countdownSeconds,
};

export { getMiningStatus };

// --- Actions ---

export function openComposer() {
  setComposerOpen(true);
}

export function closeComposer() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
    setCountdownSeconds(null);
    onCountdownComplete = null;
  }
  setComposerOpen(false);
}

export function clearComposer() {
  setContent("");
  setPublishing(false);
  setError(null);
  setUploadedMedia([]);
  setUploadProgress(null);
  setMentionCandidates([]);
  setEmojiCandidates([]);
  setHashtags([]);
  setExplicit(false);
  setGalleryMode(false);
  setPollEnabled(false);
  setPollOptions(["", ""]);
  setPollType("singlechoice");
  setCountdownSeconds(null);
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  onCountdownComplete = null;
}

// --- Content update + hashtag detection ---

export function updateContent(text) {
  setContent(text);
  detectHashtags(text);
}

const HASHTAG_REGEX = /(?:^|(?<=\s))#([a-zA-Z0-9_]+)/g;

function detectHashtags(text) {
  const seen = new Set();
  const matches = [];
  for (const match of text.matchAll(HASHTAG_REGEX)) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      matches.push(tag);
    }
  }
  setHashtags(matches);
}

// --- Toggles ---

export function toggleExplicit() {
  setExplicit((v) => !v);
}

export function toggleGalleryMode() {
  setGalleryMode((v) => {
    const next = !v;
    if (next) setPollEnabled(false); // mutually exclusive
    return next;
  });
}

export function togglePoll() {
  setPollEnabled((v) => {
    const next = !v;
    if (next) setGalleryMode(false); // mutually exclusive
    return next;
  });
}

export function togglePollType() {
  setPollType((v) =>
    v === "singlechoice" ? "multiplechoice" : "singlechoice",
  );
}

export function updatePollOption(index, text) {
  setPollOptions((prev) => {
    const next = [...prev];
    next[index] = text;
    return next;
  });
}

export function addPollOption() {
  setPollOptions((prev) => {
    if (prev.length >= 10) return prev;
    return [...prev, ""];
  });
}

export function removePollOption(index) {
  setPollOptions((prev) => {
    if (prev.length <= 2) return prev;
    return prev.filter((_, i) => i !== index);
  });
}

// --- Media upload ---

export async function uploadFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  setError(null);
  let uploaded = 0;

  for (const file of files) {
    setUploadProgress(`Uploading ${uploaded + 1}/${files.length}...`);
    try {
      const result = await uploadMedia(file);
      setUploadedMedia((prev) => [...prev, result]);
      uploaded++;
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
      break;
    }
  }

  setUploadProgress(null);
}

export function removeMedia(url) {
  setUploadedMedia((prev) => prev.filter((m) => m.url !== url));
}

// --- Nostr reference extraction (for p-tags) ---

const NOSTR_URI_REGEX = /nostr:(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+)/g;

function extractMentionedPubkeys(text) {
  const pubkeys = new Set();
  for (const match of text.matchAll(NOSTR_URI_REGEX)) {
    try {
      const decoded = nip19.decode(match[1]);
      if (decoded.type === "npub") pubkeys.add(decoded.data);
      if (decoded.type === "nprofile") pubkeys.add(decoded.data.pubkey);
    } catch {
      // invalid bech32
    }
  }
  return pubkeys;
}

// --- Countdown ---

function startCountdown(onComplete) {
  setCountdownSeconds(10);
  onCountdownComplete = onComplete;
  countdownTimer = setInterval(() => {
    setCountdownSeconds((prev) => {
      if (prev <= 1) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        setCountdownSeconds(null);
        if (onCountdownComplete) onCountdownComplete();
        onCountdownComplete = null;
        return null;
      }
      return prev - 1;
    });
  }, 1000);
}

export function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  setCountdownSeconds(null);
  onCountdownComplete = null;
}

export function publishNow() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  setCountdownSeconds(null);
  if (onCountdownComplete) {
    const fn = onCountdownComplete;
    onCountdownComplete = null;
    fn();
  }
}

// --- Publish ---

export function initiatePublish() {
  const text = content().trim();
  const media = uploadedMedia();
  const isGallery = galleryMode();
  const isPoll = pollEnabled();

  // Validate
  if (!isGallery && !text && !isPoll) {
    setError("Write something first");
    return;
  }
  if (isGallery && media.length === 0) {
    setError("Add at least one image or video");
    return;
  }
  if (isPoll) {
    const nonBlank = pollOptions().filter((o) => o.trim());
    if (nonBlank.length < 2) {
      setError("Add at least 2 poll options");
      return;
    }
  }

  setError(null);
  startCountdown(executePublish);
}

async function executePublish() {
  const pubkey = getPubkey();
  if (!pubkey) {
    setError("Not logged in");
    return;
  }

  setPublishing(true);
  setError(null);

  try {
    const text = content().trim();
    const media = uploadedMedia();
    const isGallery = galleryMode();
    const isPoll = pollEnabled();
    const tags = [];

    // Content warning
    if (explicit()) {
      tags.push(["content-warning", ""]);
    }

    // Extract mention p-tags
    const mentionedPubkeys = extractMentionedPubkeys(text);
    for (const pk of mentionedPubkeys) {
      tags.push(["p", pk]);
    }

    // Hashtag t-tags
    for (const ht of hashtags()) {
      tags.push(["t", ht]);
    }

    // Custom emoji tags (NIP-30)
    tags.push(...buildEmojiTagsFromContent(text));

    // Determine kind and add type-specific tags
    let kind = 1;

    if (isGallery && media.length > 0) {
      kind = detectMediaKind(media);
      const mediaTags =
        kind === 20
          ? buildPictureTags(
              media.map((m) => ({
                url: m.url,
                mimeType: m.mimeType || mimeFromUrl(m.url),
                dim:
                  m.width && m.height ? `${m.width}x${m.height}` : undefined,
              })),
            )
          : buildVideoTags(
              media.map((m) => ({
                url: m.url,
                mimeType: m.mimeType || mimeFromUrl(m.url),
                dim:
                  m.width && m.height ? `${m.width}x${m.height}` : undefined,
              })),
            );
      tags.push(...mediaTags);
    } else if (isPoll) {
      kind = 1068;
      const nonBlank = pollOptions()
        .map((o, i) => ({ id: String(i), label: o.trim() }))
        .filter((o) => o.label);
      tags.push(...buildPollTags(nonBlank, pollType()));
    }

    const finalContent = text;
    const relays = getOutboxRelays();

    if (getPowEnabled()) {
      // Mine PoW then sign
      const difficulty = getPowDifficulty();
      const mined = await startMining(
        pubkey,
        kind,
        finalContent,
        tags,
        difficulty,
      );

      // Sign the mined event via NIP-07
      const eventTemplate = {
        kind,
        created_at: mined.createdAt,
        tags: mined.tags,
        content: finalContent,
      };
      await publishEvent(eventTemplate, relays);
    } else {
      // Standard publish
      const eventTemplate = {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: finalContent,
      };
      await publishEvent(eventTemplate, relays);
    }

    // Success — clear and close
    clearComposer();
    setComposerOpen(false);
  } catch (err) {
    setError(err.message || "Publish failed");
  } finally {
    setPublishing(false);
  }
}
