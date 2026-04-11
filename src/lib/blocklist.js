import { createSignal, createEffect } from "solid-js";
import { getPubkey } from "./identity";
import { getPool } from "./pool";
import { fetchCachedEvent } from "./event-cache";
import { INDEXER_RELAYS } from "./identity";
import { getOutboxRelays, getMajorRelays, dedupeRelays } from "./relays";

const BLOCKED_PUBKEYS_KEY = "wisp:blocked:pubkeys";
const MUTED_WORDS_KEY = "wisp:muted:words";
const BLOCK_LIST_LOADED_KEY = "wisp:block:loaded";
const BLOCK_LIST_TIMESTAMP = "wisp:block:timestamp";

const [blockedPubkeys, setBlockedPubkeys] = createSignal([]);
const [mutedWords, setMutedWords] = createSignal([]);
const [blockListLoaded, setBlockListLoaded] = createSignal(false);

function loadLocalBlockState() {
  try {
    const storedPubkeys = localStorage.getItem(BLOCKED_PUBKEYS_KEY);
    if (storedPubkeys) {
      setBlockedPubkeys(JSON.parse(storedPubkeys));
    }
    const storedWords = localStorage.getItem(MUTED_WORDS_KEY);
    if (storedWords) {
      setMutedWords(JSON.parse(storedWords));
    }
    const loadedState = localStorage.getItem(BLOCK_LIST_LOADED_KEY);
    setBlockListLoaded(loadedState === "true");
  } catch {}
}

function saveLocalBlockState() {
  try {
    localStorage.setItem(BLOCKED_PUBKEYS_KEY, JSON.stringify(blockedPubkeys()));
    localStorage.setItem(MUTED_WORDS_KEY, JSON.stringify(mutedWords()));
    localStorage.setItem(BLOCK_LIST_LOADED_KEY, JSON.stringify(blockListLoaded()));
  } catch {}
}

function saveBlockStateWithTimestamp() {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    localStorage.setItem(BLOCKED_PUBKEYS_KEY, JSON.stringify(blockedPubkeys()));
    localStorage.setItem(MUTED_WORDS_KEY, JSON.stringify(mutedWords()));
    localStorage.setItem(BLOCK_LIST_TIMESTAMP, JSON.stringify(timestamp));
    localStorage.setItem(BLOCK_LIST_LOADED_KEY, JSON.stringify(blockListLoaded()));
  } catch {}
}

loadLocalBlockState();

export function isUserBlocked(pubkey) {
  return blockedPubkeys().includes(pubkey);
}

export function isWordMuted(word) {
  const cleanWord = (word || "").trim().toLowerCase();
  return mutedWords().some(w => w.toLowerCase() === cleanWord);
}

export function getBlockedPubkeys() {
  return blockedPubkeys();
}

export function getMutedWords() {
  return mutedWords();
}

export function isBlockListLoaded() {
  return blockListLoaded();
}

export function normalizePubkey(npub) {
  let cleanPubkey = npub.trim();
  if (cleanPubkey.startsWith("npub1")) {
    try {
      const { nip19 } = require("nostr-tools");
      const decoded = nip19.decode(cleanPubkey);
      cleanPubkey = decoded.data;
    } catch {}
  }
  return cleanPubkey;
}

export async function addBlockedUser(pubkey) {
  let cleanPubkey = normalizePubkey(pubkey);
  
  const currentPubkeys = blockedPubkeys();
  if (currentPubkeys.includes(cleanPubkey)) return;
  
  const newPubkeys = [...currentPubkeys, cleanPubkey];
  setBlockedPubkeys(newPubkeys);
  saveBlockStateWithTimestamp();
  await publishBlocklist();
}

export async function removeBlockedUser(pubkey) {
  const currentPubkeys = blockedPubkeys();
  const newPubkeys = currentPubkeys.filter(pk => pk !== pubkey);
  setBlockedPubkeys(newPubkeys);
  saveBlockStateWithTimestamp();
  await publishBlocklist();
}

export async function addMutedWord(word) {
  const trimmed = (word || "").trim();
  if (!trimmed) return;
  
  const currentWords = mutedWords();
  const exists = currentWords.some(w => w.toLowerCase() === trimmed.toLowerCase());
  if (exists) return;
  
  const newWords = [...currentWords, trimmed];
  setMutedWords(newWords);
  saveBlockStateWithTimestamp();
  await publishBlocklist();
}

export async function removeMutedWord(word) {
  const currentWords = mutedWords();
  const newWords = currentWords.filter(w => w !== word);
  setMutedWords(newWords);
  saveBlockStateWithTimestamp();
  await publishBlocklist();
}

// Debounce to prevent spamming relays
let lastPublishTime = 0;
const PUBLISH_DEBOUNCE = 3000; // 3 seconds minimum

export async function publishBlocklist() {
  const pk = getPubkey();
  if (!pk) {
    saveLocalBlockState();
    return;
  }
  
  // Debounce: ensure minimum time between publishes
  const now = Date.now();
  const timeSinceLast = now - lastPublishTime;
  if (timeSinceLast < PUBLISH_DEBOUNCE) {
    await new Promise(resolve => setTimeout(resolve, PUBLISH_DEBOUNCE - timeSinceLast));
  }
  lastPublishTime = Date.now();
  
  try {
    const content = JSON.stringify({ 
      pubkeys: blockedPubkeys(),
      words: mutedWords()
    });
    
    const encrypted = await window.nostr.nip44.encrypt(pk, content);
    
    const event = {
      kind: 10000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["purpose", "blocking"]],
      content: encrypted,
    };
    
    const signed = await window.nostr.signEvent(event);
    
    const pool = getPool();
    const broadcastRelays = dedupeRelays([
      ...getOutboxRelays(),
      ...INDEXER_RELAYS,
      ...getMajorRelays(),
    ]);
    console.log("[blocklist] Publishing to outbox relays:", broadcastRelays);
    
    await Promise.allSettled(
      pool.publish(broadcastRelays, signed)
    );
    
    const { invalidate } = await import("./event-cache");
    invalidate(10000, pk);
  } catch (err) {
    console.error("Failed to publish blocklist:", err);
    saveLocalBlockState();
  }
}

export async function fetchBlocklist(forPubkey = null) {
  const pubkey = forPubkey || getPubkey();
  if (!pubkey) {
    console.log("[blocklist] No pubkey, loading local block state");
    loadLocalBlockState();
    setBlockListLoaded(true);
    return;
  }
  
  console.log("[blocklist] Fetching blocklist for pubkey:", pubkey);
  
  try {
    const relays = [...getOutboxRelays(), ...INDEXER_RELAYS];
    console.log("[blocklist] Using relays:", relays);
    const blockEvent = await fetchCachedEvent(10000, pubkey, relays, { maxWait: 5000 });
    console.log("[blocklist] fetchCachedEvent returned:", blockEvent ? "event found" : "no event");
    
    let decryptedContent = "";
    
    if (blockEvent && blockEvent.content) {
      console.log("[blocklist] Attempting NIP-44 decryption...");
      let decrypted = false;
      
      try {
        const result = await window.nostr.nip44.decrypt(blockEvent.pubkey, blockEvent.content);
        decryptedContent = result;
        decrypted = true;
        console.log("[blocklist] NIP-44 decryption successful, content:", decryptedContent);
      } catch (err) {
        console.log("[blocklist] NIP-44 decryption failed, trying fallback:", err.message);
        
        try {
          const { nip04 } = await import("nostr-tools");
          decryptedContent = await nip04.decrypt(blockEvent.pubkey, pubkey, blockEvent.content);
          decrypted = true;
          console.log("[blocklist] NIP-04 fallback decryption successful, content:", decryptedContent);
        } catch (err2) {
          console.log("[blocklist] NIP-04 fallback also failed:", err2.message);
        }
      }
      
      if (!decrypted) {
        console.log("[blocklist] Assuming content is unencrypted JSON");
        decryptedContent = blockEvent.content;
      }
    } else {
      console.log("[blocklist] No blockEvent or content found");
    }
    
    let data = null;
    console.log("[blocklist] Attempting to parse decrypted content:", decryptedContent.substring(0, 100) + "...");
    try {
      data = JSON.parse(decryptedContent);
      console.log("[blocklist] JSON parsing successful, data:", data);
    } catch (err) {
      console.error("[blocklist] JSON parsing failed:", err);
    }
    
    let pubkeys = [];
    let words = [];
    
    console.log("[blocklist] Final data object:", data);
    console.log("[blocklist] Data is array:", Array.isArray(data));
    
    if (data && Array.isArray(data)) {
      console.log("[blocklist] Detected tags array format, processing...");
      const tempPubkeys = [];
      const tempWords = [];
      for (const tag of data) {
        if (Array.isArray(tag) && tag[0] === "p" && tag[1]) {
          tempPubkeys.push(tag[1]);
        } else if (Array.isArray(tag) && tag[0] === "word" && tag[1]) {
          tempWords.push(tag[1]);
        }
      }
      pubkeys = tempPubkeys;
      words = tempWords;
      console.log("[blocklist] Parsed from tags: pubkeys=", pubkeys, "words=", words);
    } else if (data && Array.isArray(data.pubkeys)) {
      pubkeys = data.pubkeys;
      console.log("[blocklist] Loaded pubkeys from object format:", pubkeys);
    }
    if (data && Array.isArray(data.words)) {
      words = data.words;
      console.log("[blocklist] Loaded muted words from object format:", words);
    }
    
    setBlockedPubkeys(pubkeys);
    setMutedWords(words);
    setBlockListLoaded(true);
    console.log("[blocklist] Block list loaded successfully, loading saved state");
    saveLocalBlockState();
  } catch (err) {
    console.error("[blocklist] Blocklist fetch failed:", err);
    loadLocalBlockState();
    setBlockListLoaded(true);
  }
}

export async function initBlocklist(onSuccess) {
  const pk = getPubkey();
  if (!pk) {
    loadLocalBlockState();
    if (onSuccess) onSuccess();
    return;
  }
  
  try {
    await fetchBlocklist(pk);
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error("Blocklist initialization error:", err);
    loadLocalBlockState();
    if (onSuccess) onSuccess();
  }
}

export function clearBlockState() {
  setBlockedPubkeys([]);
  setMutedWords([]);
  setBlockListLoaded(false);
}

export const getBlockedPubkeysSignal = blockedPubkeys;
export const getMutedWordsSignal = mutedWords;
export const getBlockListLoadedSignal = blockListLoaded;
export { loadLocalBlockState };
