import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { npubShort, avatarColor } from "../lib/utils";
import { getBlockedPubkeys, getMutedWords, isBlockListLoaded, removeBlockedUser, removeMutedWord, addBlockedUser, addMutedWord, getBlockedPubkeysSignal, getMutedWordsSignal, getBlockListLoadedSignal, fetchBlocklist, loadLocalBlockState } from "../lib/blocklist";
import { getProfile } from "../lib/profiles";

export default function Safety() {
  const [blockInput, setBlockInput] = createSignal("");
  const [wordInput, setWordInput] = createSignal("");
  const [status, setStatus] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  const blockedPubkeys = getBlockedPubkeysSignal;
  const mutedWords = getMutedWordsSignal;
  const listLoaded = getBlockListLoadedSignal;

  console.log("[Safety] Initializing Safety view");

  createEffect(() => {
    console.log("[Safety] listLoaded signal changed:", listLoaded());
    if (listLoaded()) {
      console.log("[Safety] Block list is loaded");
      setLoading(false);
    }
  });

  createEffect(() => {
    console.log("[Safety] blockedPubkeys changed:", blockedPubkeys().length, "items");
  });

  createEffect(() => {
    console.log("[Safety] mutedWords changed:", mutedWords().length, "items");
  });

  createEffect(() => {
    const pk = localStorage.getItem("wisp:pubkey");
    if (pk && !listLoaded()) {
      console.log("[Safety] User logged in, fetching blocklist...");
      fetchBlocklist(pk)
        .then(() => {
          console.log("[Safety] fetchBlocklist completed");
        })
        .catch(err => {
          console.error("[Safety] fetchBlocklist failed:", err);
        });
    } else if (!pk) {
      console.log("[Safety] No user logged in, loading local block state");
      loadLocalBlockState();
    }
  });

  async function handleAddBlocked() {
    const npub = blockInput().trim();
    if (!npub) return;

    setStatus("saving");
    try {
      await addBlockedUser(npub);
      setBlockInput("");
      setStatus(null);
    } catch (err) {
      console.error("Failed to block:", err);
      setStatus("error");
    }
  }

  async function handleAddMutedWords() {
    const text = wordInput().trim();
    if (!text) return;

    const words = text.split(",").map(w => w.trim()).filter(w => w.length > 0);
    if (words.length === 0) return;

    setStatus("saving");
    try {
      for (const word of words) {
        await addMutedWord(word);
      }
      setWordInput("");
      setStatus(null);
    } catch (err) {
      console.error("Failed to mute words:", err);
      setStatus("error");
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Safety</h2>
        <Show when={status === "saving"}>
          <span style={styles.saving}>Saving...</span>
        </Show>
        <Show when={status === "error"}>
          <span style={styles.error}>Failed to save</span>
        </Show>
      </div>

      <Show when={!listLoaded() && loading()}>
        <p style={styles.empty}>Loading safety settings...</p>
      </Show>

      <Show when={listLoaded()}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Blocked Users</h3>
          <p style={styles.desc}>Blocked users' content will be completely hidden from your feed and profile.</p>

          <div style={styles.inputSection}>
            <input
              type="text"
              placeholder="Enter npub to block..."
              aria-label="User to block"
              value={blockInput()}
              onInput={(e) => setBlockInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBlocked(); } }}
              style={styles.input}
            />
            <button
              onClick={handleAddBlocked}
              disabled={!blockInput().trim() || status === "saving"}
              style={{
                ...styles.addBtn,
                opacity: !blockInput().trim() || status === "saving" ? 0.5 : 1,
              }}
            >
              Block User
            </button>
          </div>

          <Show when={blockedPubkeys().length === 0}>
            <p style={styles.emptyList}>No users blocked yet.</p>
          </Show>

          <Show when={blockedPubkeys().length > 0}>
            <div style={styles.list}>
              <For each={blockedPubkeys()}>
                {(pk) => <BlockedUserRow pubkey={pk} onUnblock={removeBlockedUser} />}
              </For>
            </div>
          </Show>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Muted Words</h3>
          <p style={styles.desc}>Muted words will be filtered from notes. Separate multiple words with commas.</p>

          <div style={styles.inputSection}>
            <input
              type="text"
              placeholder="Enter words to mute (comma-separated)..."
              aria-label="Words to mute"
              value={wordInput()}
              onInput={(e) => setWordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddMutedWords(); } }}
              style={styles.input}
            />
            <button
              onClick={handleAddMutedWords}
              disabled={!wordInput().trim() || status === "saving"}
              style={{
                ...styles.addBtn,
                opacity: !wordInput().trim() || status === "saving" ? 0.5 : 1,
              }}
            >
              Mute Words
            </button>
          </div>

          <Show when={mutedWords().length === 0}>
            <p style={styles.emptyList}>No words muted yet.</p>
          </Show>

          <Show when={mutedWords().length > 0}>
            <div style={styles.list}>
              <For each={mutedWords()}>
                {(word) => <MutedWordRow word={word} onUnmute={removeMutedWord} />}
              </For>
            </div>
          </Show>
        </div>
      </Show>
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
      <button
        onClick={() => props.onUnblock(props.pubkey)}
        style={styles.removeBtn}
      >
        Remove
      </button>
    </div>
  );
}

function MutedWordRow(props) {
  return (
    <div style={styles.row}>
      <div style={styles.wordBadge}>
        {props.word}
      </div>
      <button
        onClick={() => props.onUnmute(props.word)}
        style={styles.removeBtn}
      >
        Remove
      </button>
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
  saving: {
    "font-size": "13px",
    color: "var(--w-accent)",
    "animation": "pulse 1.5s infinite",
  },
  error: {
    "font-size": "13px",
    color: "var(--w-error)",
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  section: {
    padding: "20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  sectionTitle: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-bottom": "8px",
    "text-transform": "uppercase",
    "letter-spacing": "0.04em",
  },
  desc: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "line-height": "1.5",
    "margin-bottom": "16px",
  },
  inputSection: {
    display: "flex",
    gap: "8px",
    "margin-bottom": "16px",
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
  emptyList: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "text-align": "center",
    padding: "20px",
  },
  list: {
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    overflow: "hidden",
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
  wordBadge: {
    "font-size": "14px",
    color: "var(--w-text-primary)",
    padding: "4px 10px",
    background: "var(--w-bg-tertiary)",
    "border-radius": "12px",
    "flex-shrink": 0,
  },
  removeBtn: {
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    "border-radius": "6px",
    transition: "background 0.1s, color 0.1s",
  },
};
