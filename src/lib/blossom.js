import { getBlossomServers, withClientTag } from "./settings";

const DEFAULT_SERVER = "https://blossom.primal.net";

// Compute SHA-256 hex of an ArrayBuffer
async function sha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Create Blossom auth header (kind 24242) for upload
async function createBlossomAuth(sha256hex) {
  if (!window.nostr) throw new Error("No Nostr extension found");

  const expiration = Math.floor(Date.now() / 1000) + 300;
  const template = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "upload"],
      ["x", sha256hex],
      ["expiration", String(expiration)],
    ],
    content: "Upload",
  };

  const signed = await window.nostr.signEvent(template);
  const base64 = btoa(JSON.stringify(signed));
  return "Nostr " + base64;
}

// Try uploading to a single server, returns { url } or throws
async function tryUpload(server, file, authHeader) {
  const baseUrl = server.replace(/\/+$/, "");

  // Try /media first (strips EXIF)
  try {
    const resp = await fetch(`${baseUrl}/media`, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (resp.ok) {
      const data = await resp.json();
      return { url: data.url };
    }
    if (resp.status !== 404) {
      throw new Error(`Upload failed: ${resp.status}`);
    }
  } catch (err) {
    if (err.message.startsWith("Upload failed")) throw err;
    // 404 or network error on /media — fall back to /upload
  }

  // Fall back to /upload
  const resp = await fetch(`${baseUrl}/upload`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status}`);
  }

  const data = await resp.json();
  return { url: data.url };
}

// Get image dimensions from a File
export function getImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

// Get video dimensions from a File
export function getVideoDimensions(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

// Main upload function: uploads a File to the user's blossom servers
// Returns { url, mimeType, width, height }
export async function uploadMedia(file) {
  const buffer = await file.arrayBuffer();
  const hash = await sha256Hex(buffer);
  const authHeader = await createBlossomAuth(hash);

  // Build server list: user config + default fallback
  const userServers = getBlossomServers();
  const servers = [...userServers];
  if (!servers.includes(DEFAULT_SERVER)) {
    servers.push(DEFAULT_SERVER);
  }

  let lastError;
  for (const server of servers) {
    try {
      const result = await tryUpload(server, file, authHeader);

      // Get dimensions
      let width = null;
      let height = null;
      if (file.type.startsWith("image/")) {
        const dims = await getImageDimensions(file);
        if (dims) {
          width = dims.width;
          height = dims.height;
        }
      } else if (file.type.startsWith("video/")) {
        const dims = await getVideoDimensions(file);
        if (dims) {
          width = dims.width;
          height = dims.height;
        }
      }

      return {
        url: result.url,
        mimeType: file.type || null,
        width,
        height,
      };
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All blossom servers failed");
}

// Publish kind 10063 blossom server list
export async function publishBlossomServerList() {
  if (!window.nostr) throw new Error("No Nostr extension found");

  const servers = getBlossomServers();
  const tags = servers.map((url) => ["server", url]);

  const signed = await window.nostr.signEvent({
    kind: 10063,
    created_at: Math.floor(Date.now() / 1000),
    tags: withClientTag(tags),
    content: "",
  });

  const { getPool } = await import("./pool");
  const { getOutboxRelays } = await import("./relays");
  const { INDEXER_RELAYS } = await import("./identity");

  const relays = [...new Set([...getOutboxRelays(), ...INDEXER_RELAYS])];
  const pool = getPool();
  await Promise.allSettled(pool.publish(relays, signed));
  return signed;
}
