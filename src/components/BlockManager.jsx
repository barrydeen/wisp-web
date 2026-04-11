import { createSignal, createEffect, For, Show } from "solid-js";
import { getProfile } from "../lib/profiles";
import { npubShort, avatarColor } from "../lib/utils";
import { isBlockListLoaded, getBlockedPubkeys, removeBlockedUser, isUserBlocked } from "../lib/blocks";
import { getPubkey } from "../lib/identity";

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

export function BlockManager() {
  const [inputValue, setInputValue] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const blockedPubkeys = createMemo(() => getBlockedPubkeys());
  const listLoaded = createMemo(() => isBlockListLoaded());

  function handleAdd() {
    const npub = inputValue().trim();
    if (!npub) return;
    
    setAdding(true);
    removeBlockedUser(npub).then(() => {
      setInputValue("");
      setAdding(false);
    }).catch(err => {
      console.error("Failed to block:", err);
      setAdding(false);
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Blocked Users</h2>
        <span style={styles.count}>{blockedPubkeys().length} blocked</span>
      </div>

      <Show when={!listLoaded()}>
        <p style={styles.loading}>Loading blocked users...</p>
      </Show>

      <Show when={listLoaded() && blockedPubkeys().length === 0}>
        <p style={styles.empty}>No users blocked yet.</p>
      </Show>

      <Show when={blockedPubkeys().length > 0 && listLoaded()}>
        <div style={styles.blockedList}>
          <For each={blockedPubkeys()}>
            {(pk) => <BlockedUserRow pubkey={pk} onUnblock={removeBlockedUser} />}
          </For>
        </div>
      </Show>

      <div style={styles.addSection}>
        <input
          type="text"
          placeholder="Enter npub orpubkey to block..."
          aria-label="User to block"
          value={inputValue()}
          onInput={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          style={styles.input}
        />
        <button
          onClick={handleAdd}
          disabled={adding() || !inputValue().trim()}
          style={styles.addBtn}
        >
          {adding() ? "Blocking..." : "Block User"}
        </button>
      </div>

      <div style={styles.help}>
        <p style={styles.helpText}>
          Blocked users' content will be completely hidden from your feed and profile.
        </p>
      </div>
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
  loading: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
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
    display: "flex",
    gap: "8px",
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
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
  },
  help: {
    padding: "16px 20px",
  },
  helpText: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "line-height": "1.5",
    margin: 0,
  },
};
