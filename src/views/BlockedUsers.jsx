import { createSignal, createEffect, createMemo, For, Show } from "solid-js";
import { getPubkey, getLoginState } from "../lib/identity";
import { getProfile } from "../lib/profiles";
import { npubShort, avatarColor } from "../lib/utils";
import {
  isBlockListLoaded,
  getBlockedPubkeys,
 removeBlockedUser,
  isUserBlocked,
  addBlockedUser,
} from "../lib/blocks";
import { searchContacts } from "../lib/contacts";

export default function BlockedUsers() {
  const [inputValue, setInputValue] = createSignal("");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const blockedPubkeys = createMemo(() => getBlockedPubkeys());
  const listLoaded = createMemo(() => isBlockListLoaded());

  function handleAdd(e) {
    e.preventDefault();
    const npub = inputValue().trim();
    if (!npub) return;
    
    addBlockedUser(npub).then(() => {
      setInputValue("");
      setSearchQuery("");
      setSuggestions([]);
    }).catch(err => {
      console.error("Failed to block:", err);
    });
  }

  function handleSearch(query) {
    setSearchQuery(query);
    if (query.length > 0) {
      const results = searchContacts(query);
      setSuggestions(results);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Blocked Users</h2>
        <span style={styles.count}>{blockedPubkeys().length} blocked</span>
      </div>

      <Show when={!listLoaded()}>
        <p style={styles.empty}>Loading blocked users...</p>
      </Show>

      <Show when={listLoaded() && blockedPubkeys().length === 0}>
        <p style={styles.empty}>No users blocked yet.</p>
      </Show>

      <Show when={listLoaded() && blockedPubkeys().length > 0}>
        <div style={styles.blockedList}>
          <For each={blockedPubkeys()}>
            {(pk) => <BlockedUserRow pubkey={pk} onUnblock={removeBlockedUser} />}
          </For>
        </div>
      </Show>

      <div style={styles.addSection}>
        <h3 style={styles.addTitle}>Block a new user</h3>
        <form onSubmit={handleAdd} style={styles.addForm}>
          <input
            type="text"
            placeholder="Enter npub or search contacts..."
            aria-label="User to block"
            value={searchQuery()}
            onInput={(e) => handleSearch(e.target.value)}
            style={styles.input}
          />
          <button
            type="submit"
            disabled={!searchQuery().trim()}
            style={styles.addBtn}
          >
            Block
          </button>
        </form>

        <Show when={showSuggestions() && suggestions().length > 0}>
          <div style={styles.suggestions}>
            <For each={suggestions()}>
              {(user) => {
                const isAlreadyBlocked = createMemo(() => isUserBlocked(user.pubkey));
                return (
                  <Show when={!isAlreadyBlocked()}>
                    <button
                      onClick={() => {
                        addBlockedUser(user.pubkey);
                        setInputValue("");
                        setSearchQuery("");
                        setShowSuggestions(false);
                      }}
                      style={styles.suggestionItem}
                    >
                      <Show
                        when={user.picture}
                        fallback={
                          <div style={{ ...styles.suggestAvatarFallback, "background-color": avatarColor(user.pubkey) }}>
                            {user.pubkey.slice(0, 2).toUpperCase()}
                          </div>
                        }
                      >
                        <img src={user.picture} style={styles.suggestAvatar} loading="lazy" alt="" />
                      </Show>
                      <div style={styles.suggestInfo}>
                        <span style={styles.suggestName}>
                          {user.displayName || npubShort(user.pubkey)}
                        </span>
                        <span style={styles.suggestNpub}>{npubShort(user.pubkey)}</span>
                      </div>
                    </button>
                  </Show>
                );
              }}
            </For>
          </div>
        </Show>

        <p style={styles.helpText}>
          Blocked users' content will be completely hidden from your feed and profile.
        </p>
      </div>
    </div>
  );
}

function BlockedUserRow(props) {
  const profile = createMemo(() => getProfile(props.pubkey));
  const color = createMemo(() => avatarColor(props.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.pubkey);
  });
  const isSelf = createMemo(() => props.pubkey === getPubkey());

  return (
    <div style={styles.row}>
      <Show
        when={profile()?.picture}
        fallback={
          <div style={{ ...styles.avatarFallback, "background-color": color() }}>
            {props.pubkey.slice(0, 2).toUpperCase()}
          </div>
        }
      >
        <img src={profile().picture} style={styles.avatar} loading="lazy" alt="" />
      </Show>
      <div style={styles.info}>
        <span style={styles.name}>{name()}</span>
        <span style={styles.npub}>{npubShort(props.pubkey)}</span>
      </div>
      <Show when={!isSelf()}>
        <button
          onClick={() => props.onUnblock(props.pubkey)}
          style={styles.unblockBtn}
        >
          Unblock
        </button>
      </Show>
      <Show when={isSelf()}>
        <span style={styles.selfLabel}>You</span>
      </Show>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "650px",
  },
  header: {
    padding: "20px 20px 16px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    position: "sticky",
    top: 0,
    "background-color": "var(--w-bg-overlay)",
    "backdrop-filter": "blur(12px)",
    "z-index": 5,
  },
  title: {
    "font-size": "18px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
  },
  count: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  blockedList: {
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    overflow: "hidden",
    "margin-bottom": "16px",
  },
  row: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  avatar: {
    width: "40px",
    height: "40px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  avatarFallback: {
    width: "40px",
    height: "40px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "13px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  info: {
    flex: 1,
    "min-width": 0,
  },
  name: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
  },
  npub: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "font-family": "monospace",
    display: "block",
    "margin-top": "2px",
  },
  unblockBtn: {
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    "border-radius": "6px",
    transition: "background 0.1s, color 0.1s",
  },
  selfLabel: {
    "font-size": "11px",
    color: "var(--w-text-muted)",
    "text-transform": "uppercase",
    "letter-spacing": "0.5px",
    padding: "4px 8px",
    background: "var(--w-bg-tertiary)",
    "border-radius": "4px",
  },
  addSection: {
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  addTitle: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-bottom": "12px",
    "text-transform": "uppercase",
    "letter-spacing": "0.5px",
  },
  addForm: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    outline: "none",
  },
  addBtn: {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "none",
    background: "var(--w-accent)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    transition: "background 0.15s, opacity 0.15s",
    "white-space": "nowrap",
    "flex-shrink": 0,
  },
  suggestions: {
    "margin-top": "12px",
    "max-height": "300px",
    "overflow-y": "auto",
  },
  suggestionItem: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    padding: "10px 14px",
    width: "100%",
    border: "none",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-secondary)",
    cursor: "pointer",
    "border-radius": "8px",
    "margin-bottom": "4px",
    "text-align": "left",
    transition: "background 0.1s",
  },
  suggestAvatar: {
    width: "36px",
    height: "36px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  suggestAvatarFallback: {
    width: "36px",
    height: "36px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "12px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  suggestInfo: {
    flex: 1,
    "min-width": 0,
  },
  suggestName: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
  },
  suggestNpub: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "font-family": "monospace",
    display: "block",
    "margin-top": "2px",
  },
  helpText: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "line-height": "1.5",
    "margin-top": "16px",
  },
};
