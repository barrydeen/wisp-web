// NIP-68 (Kind 20 - Pictures) and NIP-71 (Kind 21/22 - Video) tag builders

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v"]);

// Build imeta tags for a picture gallery (kind 20)
// media: [{ url, mimeType?, dim? }] where dim = "WxH"
export function buildPictureTags(media) {
  return media.map(entry => {
    const parts = ["imeta", `url ${entry.url}`];
    if (entry.mimeType) parts.push(`m ${entry.mimeType}`);
    if (entry.dim) parts.push(`dim ${entry.dim}`);
    if (entry.blurhash) parts.push(`blurhash ${entry.blurhash}`);
    if (entry.hash) parts.push(`x ${entry.hash}`);
    if (entry.alt) parts.push(`alt ${entry.alt}`);
    return parts;
  });
}

// Build imeta tags for video notes (kind 21/22)
// media: [{ url, mimeType?, dim?, duration?, thumbnail? }]
export function buildVideoTags(media) {
  return media.map(entry => {
    const parts = ["imeta", `url ${entry.url}`];
    if (entry.mimeType) parts.push(`m ${entry.mimeType}`);
    if (entry.dim) parts.push(`dim ${entry.dim}`);
    if (entry.thumbnail) parts.push(`image ${entry.thumbnail}`);
    if (entry.duration) parts.push(`duration ${entry.duration}`);
    if (entry.blurhash) parts.push(`blurhash ${entry.blurhash}`);
    if (entry.hash) parts.push(`x ${entry.hash}`);
    return parts;
  });
}

// Determine the event kind based on uploaded media
// Returns 20 (picture), 21 (horizontal video), or 22 (vertical video)
export function detectMediaKind(mediaItems) {
  const hasVideo = mediaItems.some(item => {
    const ext = item.url.split(".").pop()?.toLowerCase().split("?")[0];
    return VIDEO_EXTENSIONS.has(ext);
  });

  if (hasVideo) {
    const video = mediaItems[0];
    if (video.width && video.height) {
      return video.height > video.width ? 22 : 21;
    }
    return 21; // default horizontal
  }

  return 20; // pictures
}

// Get MIME type from file extension
export function mimeFromUrl(url) {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0];
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/mp4",
  };
  return map[ext] || null;
}
