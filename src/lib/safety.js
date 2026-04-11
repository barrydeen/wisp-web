import { createSignal } from "solid-js";
import { getPubkey } from "./identity";
import { getPool } from "./pool";
import { fetchCachedEvent } from "./event-cache";
import { INDEXER_RELAYS } from "./identity";
import { getOutboxRelays } from "./relays";
import { isUserBlocked } from "./blocks";

// Local fallback storage for mute lists (if not published to relays)
const MUTED_PUBKEYS_KEY = "wisp:muted:pubkeys";
const MUTED_WORDS_KEY = "wisp:muted:words";
const MUTE_LIST_LOADED_KEY = "wisp:mute:loaded";

// Signals for current mute state
const [mutedPubkeys, setMutedPubkeys] = createSignal([]);
const [mutedWords, setMutedWords] = createSignal([]);
const [muteListLoaded, setMuteListLoaded] = createSignal(false);
const [isPrivateMuteList, setIsPrivateMuteList] = createSignal(false);

// Load from localStorage
function loadLocalMuteState() {
  try {
    const storedPubkeys = localStorage.getItem(MUTED_PUBKEYS_KEY);
    const storedWords = localStorage.getItem(MUTED_WORDS_KEY);
    
    if (storedPubkeys) {
      setMutedPubkeys(JSON.parse(storedPubkeys));
    }
    if (storedWords) {
      setMutedWords(JSON.parse(storedWords));
    }
    const loadedState = localStorage.getItem(MUTE_LIST_LOADED_KEY);
    setMuteListLoaded(loadedState === "true");
  } catch {
    // Ignore parse errors
  }
}

// Save to localStorage
function saveLocalMuteState() {
  try {
    localStorage.setItem(MUTED_PUBKEYS_KEY, JSON.stringify(mutedPubkeys()));
    localStorage.setItem(MUTED_WORDS_KEY, JSON.stringify(mutedWords()));
    localStorage.setItem(MUTE_LIST_LOADED_KEY, JSON.stringify(muteListLoaded()));
  } catch {
    // Ignore save errors
  }
}

loadLocalMuteState();

// Escaping for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Check if a user is muted
export function isUserMuted(pubkey) {
  return mutedPubkeys().includes(pubkey);
}

// Check if content contains muted words
export function isContentMuted(content) {
  const text = (content || "").toLowerCase();
  const words = mutedWords();
  
  for (const word of words) {
    if (!word || word.trim() === "") continue;
    
    // Word boundary matching (case-insensitive)
    const cleanWord = word.trim();
    const regex = new RegExp(`\\b${escapeRegExp(cleanWord.toLowerCase())}\\b`, "i");
    if (regex.test(text)) {
      return true;
    }
  }
  
  return false;
}

// Check if an event should be filtered
export function shouldFilterEvent(event) {
  if (!event) return false;
  
  if (isUserBlocked(event.pubkey)) {
    return true;
  }
  
  if (mutedPubkeys().includes(event.pubkey)) {
    return true;
  }
  
  if (event.kind === 1 && isContentMuted(event.content)) {
    return true;
  }
  
  return false;
}

// Filter an array of events
export function filterEvents(events) {
  if (!Array.isArray(events)) return events;
  return events.filter(event => !shouldFilterEvent(event));
}

// Get current muted pubkeys
export function getMutedPubkeys() {
  return mutedPubkeys();
}

// Get current muted words
export function getMutedWords() {
  return mutedWords();
}

// Check if mute list is loaded from relays
export function isMuteListLoaded() {
  return muteListLoaded();
}

// Check if using private mute list
export function usingPrivateMuteList() {
  return isPrivateMuteList();
}

// Add a muted user
export async function addMutedUser(pubkey) {
  let cleanPubkey = pubkey.trim();
  // Try to parse npub format if provided
  if (cleanPubkey.startsWith("npub1")) {
    try {
      const { nip19 } = await import("nostr-tools");
      const decoded = nip19.decode(cleanPubkey);
      cleanPubkey = decoded.data;
    } catch {
      // If decode fails, use as-is (might be hex)
    }
  }
  
  const currentPubkeys = mutedPubkeys();
  if (currentPubkeys.includes(cleanPubkey)) return;
  
  const newPubkeys = [...currentPubkeys, cleanPubkey];
  setMutedPubkeys(newPubkeys);
  saveLocalMuteState();
  
  // Publish to relays if logged in
  await publishMuteList();
}

// Remove a muted user
export async function removeMutedUser(pubkey) {
  const currentPubkeys = mutedPubkeys();
  const newPubkeys = currentPubkeys.filter(pk => pk !== pubkey);
  setMutedPubkeys(newPubkeys);
  saveLocalMuteState();
  
  await publishMuteList();
}

// Add a muted word
export async function addMutedWord(word) {
  const trimmed = (word || "").trim();
  if (!trimmed) return;
  
  const currentWords = mutedWords();
  // Case-insensitive check
  const exists = currentWords.some(w => w.toLowerCase() === trimmed.toLowerCase());
  if (exists) return;
  
  const newWords = [...currentWords, trimmed];
  setMutedWords(newWords);
  saveLocalMuteState();
  
  await publishMuteList();
}

// Remove a muted word
export async function removeMutedWord(word) {
  const currentWords = mutedWords();
  const newWords = currentWords.filter(w => w !== word);
  setMutedWords(newWords);
  saveLocalMuteState();
  
  await publishMuteList();
}

// Publish the mute list to relays (kind 10000)
export async function publishMuteList() {
  const pk = getPubkey();
  if (!pk) {
    // Fallback: save to localStorage if not logged in
    saveLocalMuteState();
    return;
  }
  
  try {
    // Build tags
    const tags = [];
    for (const pk of mutedPubkeys()) {
      tags.push(["p", pk]);
    }
    for (const word of mutedWords()) {
      tags.push(["word", word]);
    }
    
    // Create mute list event (public format - tags in plain view)
    const event = {
      kind: 10000,
      created_at: Math.floor(Date.now() / 1000),
      tags: tags,
      content: "", // Empty for public mute list
    };
    
    // Sign and publish using NIP-07
    const signed = await window.nostr.signEvent(event);
    const pool = getPool();
    const relays = pool.getRelays?.() || {};
    const relayUrls = Object.values(relays).map(r => r?.url).filter(Boolean);
    
    await Promise.allSettled(
      relayUrls.map((url) => pool.querySync(url, { ids: [event.id] })) // Ensure connection
    );
    
    // Actually publish
    if (relayUrls.length > 0) {
      await Promise.allSettled(
        relayUrls.map((url) => pool.publish(url, signed))
      );
    } else {
      // Fallback to default relays
      const defaults = ["wss://relay.damus.io", "wss://relay.primal.net"];
      await Promise.allSettled(
        defaults.map((url) => pool.publish(url, signed))
      );
    }
    
    setIsPrivateMuteList(false);
  } catch (err) {
    console.error("Failed to publish mute list:", err);
    // Fallback to localStorage
    saveLocalMuteState();
  }
}

// Fetch and load the mute list from relays
export async function fetchMuteList(forPubkey = null) {
  const pubkey = forPubkey || getPubkey();
  console.log(`[MuteList] Starting fetch for pubkey: ${pubkey}`);
  if (!pubkey) {
    console.log(`[MuteList] No pubkey available, aborting fetch`);
    return;
  }
  
  try {
    // Fetch kind 10000 event
    console.log(`[MuteList] Calling fetchCachedEvent for kind 10000`);
    const relays = [...getOutboxRelays(), ...INDEXER_RELAYS];
    console.log(`[MuteList] Querying relays:`, relays);
    const muteEvent = await fetchCachedEvent(10000, pubkey, relays, { maxWait: 5000 });
    
    if (!muteEvent) {
      console.log(`[MuteList] Event NOT found for pubkey: ${pubkey}`);
      setMuteListLoaded(true);
      return;
    }
    
    console.log(`[MuteList] Event FOUND - id: ${muteEvent.id}, created_at: ${muteEvent.created_at}, content length: ${muteEvent.content?.length || 0}`);
    
    let tags = [];
    
    // Try to decrypt content first (NIP-04)
    if (muteEvent.content) {
      try {
        const { nip04 } = await import("nostr-tools");
        console.log(`[MuteList] Attempting to decrypt content`);
        const decrypted = await nip04.decrypt(pubkey, pubkey, muteEvent.content);
        console.log(`[MuteList] Decryption SUCCESS - decrypted content: ${decrypted}`);
        tags = JSON.parse(decrypted);
        setIsPrivateMuteList(true);
      } catch (err) {
        console.log(`[MuteList] Decryption FAILED - ${err?.message || "unknown error"}, using event tags directly`);
        tags = muteEvent.tags || [];
        setIsPrivateMuteList(false);
      }
    } else {
      console.log(`[MuteList] No content to decrypt, using public event tags`);
      tags = muteEvent.tags || [];
      setIsPrivateMuteList(false);
    }
    
    console.log(`[MuteList] Parsed tags result - pubkeys count: ${tags.filter(t => t[0] === "p").length}, words count: ${tags.filter(t => t[0] === "word" || t[0] === "t").length}`);
    
    const pubkeys = [];
    const words = [];
    
    for (const tag of tags) {
      if (tag[0] === "p" && tag[1]) {
        pubkeys.push(tag[1]);
      } else if (tag[0] === "word" && tag[1]) {
        words.push(tag[1]);
      } else if (tag[0] === "t" && tag[1]) {
        words.push(`#${tag[1]}`);
      }
    }
    
    console.log(`[MuteList] Final result - ${pubkeys.length} muted pubkeys, ${words.length} muted words`);
    
    setMutedPubkeys(pubkeys);
    setMutedWords(words);
    setMuteListLoaded(true);
    saveLocalMuteState();
    
  } catch (err) {
    console.error(`[MuteList] ERROR: ${err?.message || "Unknown error"}`, err);
    loadLocalMuteState();
    setMuteListLoaded(true);
  }
}

// Initialize mute list fetching when user logs in
export async function initMuteList(onSuccess) {
  const pk = getPubkey();
  if (!pk) {
    loadLocalMuteState();
    if (onSuccess) onSuccess();
    return;
  }
  
  try {
    await fetchMuteList(pk);
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error("Mute list initialization error:", err);
    loadLocalMuteState();
    if (onSuccess) onSuccess();
  }
}

// Clear mute list state (for logout)
export function clearMuteList() {
  setMutedPubkeys([]);
  setMutedWords([]);
  setMuteListLoaded(false);
  setIsPrivateMuteList(false);
}

// Export state signals for use in components
export const getMutedPubkeysSignal = mutedPubkeys;
export const getMutedWordsSignal = mutedWords;
export const getMuteListLoadedSignal = muteListLoaded;
export const getPrivateMuteListSignal = isPrivateMuteList;
