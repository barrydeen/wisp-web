import { createSignal } from "solid-js";
import { getPubkey } from "./identity";
import { getPool } from "./pool";
import { fetchCachedEvent } from "./event-cache";
import { INDEXER_RELAYS } from "./identity";
import { getOutboxRelays } from "./relays";

const BLOCKED_PUBKEYS_KEY = "wisp:blocked:pubkeys";
const BLOCK_LIST_LOADED_KEY = "wisp:block:loaded";

const [blockedPubkeys, setBlockedPubkeys] = createSignal([]);
const [blockListLoaded, setBlockListLoaded] = createSignal(false);

function loadLocalBlockState() {
  try {
    const storedPubkeys = localStorage.getItem(BLOCKED_PUBKEYS_KEY);
    if (storedPubkeys) {
      setBlockedPubkeys(JSON.parse(storedPubkeys));
    }
    const loadedState = localStorage.getItem(BLOCK_LIST_LOADED_KEY);
    setBlockListLoaded(loadedState === "true");
  } catch {}
}

function saveLocalBlockState() {
  try {
    localStorage.setItem(BLOCKED_PUBKEYS_KEY, JSON.stringify(blockedPubkeys()));
    localStorage.setItem(BLOCK_LIST_LOADED_KEY, JSON.stringify(blockListLoaded()));
  } catch {}
}

loadLocalBlockState();

export function isUserBlocked(pubkey) {
  return blockedPubkeys().includes(pubkey);
}

export function getBlockedPubkeys() {
  return blockedPubkeys();
}

export function isBlockListLoaded() {
  return blockListLoaded();
}

export async function addBlockedUser(pubkey) {
  let cleanPubkey = pubkey.trim();
  if (cleanPubkey.startsWith("npub1")) {
    try {
      const { nip19 } = await import("nostr-tools");
      const decoded = nip19.decode(cleanPubkey);
      cleanPubkey = decoded.data;
    } catch {}
  }
  
  const currentPubkeys = blockedPubkeys();
  if (currentPubkeys.includes(cleanPubkey)) return;
  
  const newPubkeys = [...currentPubkeys, cleanPubkey];
  setBlockedPubkeys(newPubkeys);
  saveLocalBlockState();
  await publishBlockList();
}

export async function removeBlockedUser(pubkey) {
  const currentPubkeys = blockedPubkeys();
  const newPubkeys = currentPubkeys.filter(pk => pk !== pubkey);
  setBlockedPubkeys(newPubkeys);
  saveLocalBlockState();
  await publishBlockList();
}

export async function publishBlockList() {
  const pk = getPubkey();
  if (!pk) {
    saveLocalBlockState();
    return;
  }
  
  try {
    const content = JSON.stringify({ pubkeys: blockedPubkeys() });
    const encrypted = await window.nostr.nip44.encrypt(pk, content);
    
    const event = {
      kind: 10000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["purpose", "blocking"]],
      content: encrypted,
    };
    
    const signed = await window.nostr.signEvent(event);
    const pool = getPool();
    const relays = pool.getRelays?.() || {};
    const relayUrls = Object.values(relays).map(r => r?.url).filter(Boolean);
    
    await Promise.allSettled(
      relayUrls.map((url) => pool.querySync(url, { ids: [event.id] }))
    );
    
    if (relayUrls.length > 0) {
      await Promise.allSettled(relayUrls.map((url) => pool.publish(url, signed)));
    } else {
      const defaults = ["wss://relay.damus.io", "wss://relay.primal.net"];
      await Promise.allSettled(defaults.map((url) => pool.publish(url, signed)));
    }
  } catch (err) {
    console.error("Failed to publish block list:", err);
    saveLocalBlockState();
  }
}

export async function fetchBlockList(forPubkey = null) {
  const pubkey = forPubkey || getPubkey();
  if (!pubkey) return;
  
  console.log(`[BlockList] Starting fetch for pubkey: ${pubkey}`);
  
  try {
    const relays = [...getOutboxRelays(), ...INDEXER_RELAYS];
    console.log(`[BlockList] Querying relays:`, relays);
    const blockEvent = await fetchCachedEvent(10000, pubkey, relays, { maxWait: 5000 }).catch(err => {
      console.error(`[BlockList] Network error fetching event:`, err);
      return null;
    });
    
    if (!blockEvent) {
      console.log(`[BlockList] No event found for pubkey: ${pubkey}`);
      setBlockListLoaded(true);
      return;
    }
    
    console.log(`[BlockList] Event found - id: ${blockEvent.id}, created_at: ${blockEvent.created_at}, content length: ${blockEvent.content?.length || 0}`);
    console.log(`[BlockList] Content preview: ${blockEvent.content?.substring(0, 100)}...`);
    
    let decryptedContent = "";
    
    if (blockEvent.content) {
      let decrypted = false;
      
      try {
        const result = await window.nostr.nip44.decrypt(blockEvent.pubkey, blockEvent.content);
        decryptedContent = result;
        decrypted = true;
        console.log(`[BlockList] NIP-44 decryption successful`);
        console.log(`[BlockList] Decrypted content:`, result);
      } catch (err) {
        console.log(`[BlockList] NIP-44 decryption failed:`, err.message);
      }
      
      if (!decrypted) {
        try {
          const { nip04 } = await import("nostr-tools");
          decryptedContent = await nip04.decrypt(blockEvent.pubkey, pubkey, blockEvent.content);
          console.log(`[BlockList] NIP-04 decryption successful`);
          decrypted = true;
        } catch (err) {
          console.log(`[BlockList] NIP-04 decryption failed:`, err.message);
        }
      }
      
      if (!decrypted) {
        console.log(`[BlockList] Assuming content is unencrypted JSON`);
        decryptedContent = blockEvent.content;
      }
    } else {
      console.log(`[BlockList] No content in event`);
      setBlockListLoaded(true);
      return;
    }
    
    let data = null;
    try {
      data = JSON.parse(decryptedContent);
      console.log(`[BlockList] Decrypted data structure:`, data);
    } catch (err) {
      console.error(`[BlockList] JSON parsing failed:`, err);
    }
    
    let pubkeys = [];
    if (Array.isArray(data)) {
      pubkeys = data.filter(item => Array.isArray(item) && item[0] === "p").map(item => item[1]);
    } else if (data && Array.isArray(data.pubkeys)) {
      pubkeys = data.pubkeys;
    }
    setBlockedPubkeys(pubkeys);
    setBlockListLoaded(true);
    saveLocalBlockState();
    
  } catch (err) {
    console.error(`[BlockList] Fetch failed:`, err);
    loadLocalBlockState();
    setBlockListLoaded(true);
  }
}

export async function initBlockList(onSuccess) {
  const pk = getPubkey();
  if (!pk) {
    loadLocalBlockState();
    if (onSuccess) onSuccess();
    return;
  }
  
  try {
    await fetchBlockList(pk);
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error("Block list initialization error:", err);
    loadLocalBlockState();
    if (onSuccess) onSuccess();
  }
}

export function clearBlockState() {
  setBlockedPubkeys([]);
  setBlockListLoaded(false);
}

export const getBlockedPubkeysSignal = blockedPubkeys;
export const getBlockListLoadedSignal = blockListLoaded;
