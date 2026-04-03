// NIP-13 Proof of Work mining Web Worker
// Uses @noble/hashes for synchronous SHA-256 (much faster in tight loops than crypto.subtle)

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

function countLeadingZeroBits(hexStr) {
  let bits = 0;
  for (const c of hexStr) {
    const nibble = parseInt(c, 16);
    if (nibble === 0) {
      bits += 4;
    } else {
      if (nibble < 2) bits += 3;
      else if (nibble < 4) bits += 2;
      else if (nibble < 8) bits += 1;
      break;
    }
  }
  return bits;
}

function serializeEvent(pubkey, createdAt, kind, tags, content) {
  return JSON.stringify([0, pubkey, createdAt, kind, tags, content]);
}

let cancelled = false;

self.onmessage = function (e) {
  const msg = e.data;

  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }

  if (msg.type === "mine") {
    cancelled = false;
    const { pubkey, kind, content, tags, difficulty, createdAt } = msg;

    // Clone tags and append nonce tag placeholder
    const workingTags = tags.map((t) => [...t]);
    const nonceTag = ["nonce", "0", String(difficulty)];
    workingTags.push(nonceTag);
    const nonceIndex = workingTags.length - 1;

    const encoder = new TextEncoder();

    for (let nonce = 0; ; nonce++) {
      if (cancelled) {
        self.postMessage({ type: "cancelled" });
        return;
      }

      workingTags[nonceIndex][1] = String(nonce);
      const serialized = serializeEvent(
        pubkey,
        createdAt,
        kind,
        workingTags,
        content,
      );
      const hashBytes = sha256(encoder.encode(serialized));
      const hashHex = bytesToHex(hashBytes);
      const zeroBits = countLeadingZeroBits(hashHex);

      if (zeroBits >= difficulty) {
        self.postMessage({
          type: "done",
          id: hashHex,
          tags: workingTags,
          createdAt,
          nonce,
        });
        return;
      }

      if (nonce % 10000 === 0 && nonce > 0) {
        self.postMessage({ type: "progress", attempts: nonce });
      }
    }
  }
};
