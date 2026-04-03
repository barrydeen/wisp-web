import { createSignal } from "solid-js";
import { getPool } from "./pool";
import { clearCache } from "./event-cache";

export const INDEXER_RELAYS = [
  "wss://indexer.coracle.social",
  "wss://indexer.nostrarchives.com",
];

const stored = localStorage.getItem("wisp:pubkey");
const [pubkey, setPubkey] = createSignal(stored || null);
const [userProfile, setUserProfile] = createSignal(null);
const [loginState, setLoginState] = createSignal(stored ? "logged-in" : "logged-out");

export function getPubkey() {
  return pubkey();
}

export function getUserProfile() {
  return userProfile();
}

export function getLoginState() {
  return loginState();
}

export function hasExtension() {
  return !!window.nostr;
}

export async function login() {
  if (!window.nostr) {
    throw new Error("No Nostr extension found. Install nos2x, Alby, or another NIP-07 extension.");
  }

  setLoginState("logging-in");

  try {
    const pk = await window.nostr.getPublicKey();
    setPubkey(pk);
    setLoginState("logged-in");
    localStorage.setItem("wisp:pubkey", pk);
    fetchUserProfile(pk);

    // Start outbox pipeline immediately so feed data flows before user navigates
    import("./outbox").then(({ initFollowFeed }) => initFollowFeed(pk));
    import("./relays").then(({ fetchOwnRelayLists }) => fetchOwnRelayLists(pk));
    import("./wallet").then(({ initWallet }) => initWallet(pk));

    return pk;
  } catch (err) {
    setLoginState("logged-out");
    throw err;
  }
}

export function logout() {
  setPubkey(null);
  setUserProfile(null);
  setLoginState("logged-out");
  localStorage.removeItem("wisp:pubkey");

  clearCache();
  import("./outbox").then(({ clearFollowFeed }) => clearFollowFeed());
  import("./relays").then(({ clearRelayState }) => clearRelayState());
  import("./wallet").then(({ clearWallet }) => clearWallet());
}

// Restore session on page load
if (stored) {
  fetchUserProfile(stored);
  import("./outbox").then(({ initFollowFeed }) => initFollowFeed(stored));
  import("./relays").then(({ fetchOwnRelayLists }) => fetchOwnRelayLists(stored));
  import("./wallet").then(({ initWallet }) => initWallet(stored));
}

function fetchUserProfile(pk) {
  const pool = getPool();

  pool.subscribeMany(INDEXER_RELAYS, { kinds: [0], authors: [pk] }, {
    onevent(event) {
      try {
        const meta = JSON.parse(event.content);
        const existing = userProfile();
        if (!existing || (existing._created_at || 0) < event.created_at) {
          meta._created_at = event.created_at;
          setUserProfile(meta);
        }
      } catch {
        // bad metadata
      }
    },
  });
}
