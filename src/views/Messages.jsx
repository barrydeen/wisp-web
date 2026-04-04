import { createSignal, createMemo, createEffect, Show, For, onCleanup } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { getPubkey, getLoginState } from "../lib/identity";
import { getProfile } from "../lib/profiles";
import { formatTime, npubShort, avatarColor } from "../lib/utils";
import {
  initDMs,
  cleanupDMs,
  getConversations,
  getConversationMessages,
  fetchRelayList,
  getRelayConfig,
  sendDM,
} from "../lib/dms";
import { EmojiPopup } from "../components/EmojiPopup";
import { RichContent } from "../components/RichContent";
import { searchEmojis } from "../lib/emojis";

export default function Messages() {
  const params = useParams();

  return (
    <Show when={params.pubkey} fallback={<ConversationList />}>
      <ConversationView pubkey={params.pubkey} />
    </Show>
  );
}

function ConversationList() {
  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  createEffect(() => {
    if (loggedIn()) {
      initDMs();
    }
  });

  onCleanup(() => cleanupDMs());

  const conversations = createMemo(() => (loggedIn() ? getConversations() : []));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Messages</h2>
        <span style={styles.count}>{conversations().length} conversations</span>
      </div>
      <Show when={!loggedIn()}>
        <p style={styles.empty}>Log in to view your messages.</p>
      </Show>
      <Show when={loggedIn() && conversations().length === 0}>
        <p style={styles.empty}>Loading messages...</p>
      </Show>
      <For each={conversations()}>
        {(conv) => <ConversationCard conv={conv} />}
      </For>
    </div>
  );
}

function ConversationCard(props) {
  const profile = createMemo(() => getProfile(props.conv.pubkey));
  const color = createMemo(() => avatarColor(props.conv.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.conv.pubkey);
  });
  const avatar = createMemo(() => profile()?.picture);
  const lastMsg = createMemo(() => props.conv.lastMessage);
  const preview = createMemo(() => {
    const msg = lastMsg();
    if (!msg) return "";
    const myPk = getPubkey();
    const prefix = msg.sender === myPk ? "You: " : "";
    const text = msg.content.length > 60 ? msg.content.slice(0, 60) + "..." : msg.content;
    return prefix + text;
  });

  return (
    <A href={`/messages/${props.conv.pubkey}`} style={styles.convCard}>
      <Show
        when={avatar()}
        fallback={
          <div style={{ ...styles.avatarFallback, "background-color": color() }}>
            {props.conv.pubkey.slice(0, 2).toUpperCase()}
          </div>
        }
      >
        <img src={avatar()} alt="" style={styles.avatarImg} />
      </Show>
      <div style={styles.convBody}>
        <div style={styles.convTop}>
          <span style={styles.convName}>{name()}</span>
          <Show when={lastMsg()}>
            <span style={styles.convTime}>{formatTime(lastMsg().created_at)}</span>
          </Show>
        </div>
        <div style={styles.convPreview}>{preview()}</div>
      </div>
    </A>
  );
}

function ConversationView(props) {
  const loggedIn = createMemo(() => getLoginState() === "logged-in");
  const myPk = createMemo(() => getPubkey());
  const profile = createMemo(() => getProfile(props.pubkey));
  const color = createMemo(() => avatarColor(props.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.pubkey);
  });

  const msgs = createMemo(() => getConversationMessages(props.pubkey));

  // Fetch relay config for both parties
  const [myRelays, setMyRelays] = createSignal(null);
  const [theirRelays, setTheirRelays] = createSignal(null);

  createEffect(() => {
    if (loggedIn()) {
      initDMs();
      const pk = myPk();
      if (pk) fetchRelayList(pk).then(setMyRelays);
      fetchRelayList(props.pubkey).then(setTheirRelays);
    }
  });

  onCleanup(() => cleanupDMs());

  // Send form state
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [emojiCandidates, setEmojiCandidates] = createSignal([]);
  let emojiStartIndex = null;
  let textareaRef;

  function detectEmojiQuery(text, cursorPos) {
    if (cursorPos === 0 || !text) {
      setEmojiCandidates([]);
      emojiStartIndex = null;
      return;
    }
    for (let i = cursorPos - 1; i >= 0; i--) {
      const c = text[i];
      if (c === ":") {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const between = text.substring(i + 1, cursorPos);
          if (between.includes(":")) break;
          if (between.length < 2) { setEmojiCandidates([]); emojiStartIndex = null; return; }
          emojiStartIndex = i;
          setEmojiCandidates(searchEmojis(between));
          return;
        }
        break;
      }
      if (!/[a-zA-Z0-9_-]/.test(c)) break;
    }
    setEmojiCandidates([]);
    emojiStartIndex = null;
  }

  function handleInputWithEmoji(e) {
    setDraft(e.target.value);
    detectEmojiQuery(e.target.value, e.target.selectionStart);
  }

  function handleSelectEmoji(candidate) {
    if (emojiStartIndex === null) return;
    const text = draft();
    const cursor = textareaRef?.selectionStart || text.length;
    const inserted = ":" + candidate.shortcode + ":";
    const before = text.substring(0, emojiStartIndex);
    const after = cursor < text.length ? text.substring(cursor) : "";
    const newText = before + inserted + " " + after;
    const newCursor = before.length + inserted.length + 1;
    setDraft(newText);
    setEmojiCandidates([]);
    emojiStartIndex = null;
    if (textareaRef) {
      textareaRef.value = newText;
      textareaRef.selectionStart = newCursor;
      textareaRef.selectionEnd = newCursor;
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = draft().trim();
    if (!text || sending()) return;
    setSending(true);
    try {
      await sendDM(props.pubkey, text);
      setDraft("");
    } catch (err) {
      console.error("Failed to send DM:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <A href="/messages" style={styles.backLink}>← back</A>
        <div style={styles.headerProfile}>
          <div style={{ ...styles.headerDot, "background-color": color() }} />
          <h2 style={styles.title}>{name()}</h2>
        </div>
        <span style={styles.count}>{msgs().length} messages</span>
      </div>

      {/* Relay config */}
      <RelayConfigPanel myRelays={myRelays()} theirRelays={theirRelays()} theirName={name()} />

      {/* Messages */}
      <div style={styles.messageList}>
        <For each={msgs()}>
          {(msg) => <MessageBubble msg={msg} myPk={myPk()} />}
        </For>
        <Show when={msgs().length === 0 && loggedIn()}>
          <p style={styles.empty}>No messages yet.</p>
        </Show>
      </div>

      {/* Send form */}
      <Show when={loggedIn()}>
        <form onSubmit={handleSend} style={styles.sendForm}>
          <div style={{ flex: 1, position: "relative" }}>
            <textarea
              ref={textareaRef}
              value={draft()}
              onInput={handleInputWithEmoji}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              aria-label="Type a message"
              style={styles.sendInput}
              rows="1"
            />
            <EmojiPopup candidates={emojiCandidates} onSelect={handleSelectEmoji} />
          </div>
          <button
            type="submit"
            disabled={sending() || !draft().trim()}
            style={styles.sendBtn}
          >
            {sending() ? "..." : "Send"}
          </button>
        </form>
      </Show>
    </div>
  );
}

function RelayConfigPanel(props) {
  function formatRelays(config, type) {
    if (!config) return "loading...";
    const relays = type === "dm" ? config.dmRelays : config.inboxRelays;
    const dmRelays = config.dmRelays || [];
    const inboxRelays = config.inboxRelays || [];

    if (dmRelays.length > 0) {
      return dmRelays.map((r) => r.replace("wss://", "")).join(", ") + " (DM relays)";
    }
    if (inboxRelays.length > 0) {
      return inboxRelays.map((r) => r.replace("wss://", "")).join(", ") + " (inbox relays)";
    }
    return "default relays";
  }

  return (
    <div style={styles.relayPanel}>
      <div style={styles.relayRow}>
        <span style={styles.relayLabel}>Your relays:</span>
        <span style={styles.relayValue}>{formatRelays(props.myRelays)}</span>
      </div>
      <div style={styles.relayRow}>
        <span style={styles.relayLabel}>{props.theirName}'s relays:</span>
        <span style={styles.relayValue}>{formatRelays(props.theirRelays)}</span>
      </div>
    </div>
  );
}

function MessageBubble(props) {
  const isMine = createMemo(() => props.msg.sender === props.myPk);

  return (
    <div style={{ ...styles.bubble, ...(isMine() ? styles.bubbleMine : styles.bubbleTheirs) }}>
      <div style={styles.bubbleContent}>
        <RichContent content={props.msg.content} tags={props.msg.tags || []} />
      </div>
      <div style={styles.bubbleTime}>{formatTime(props.msg.created_at)}</div>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "650px",
    display: "flex",
    "flex-direction": "column",
    height: "100vh",
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
    gap: "12px",
  },
  headerProfile: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    flex: 1,
  },
  headerDot: {
    width: "10px",
    height: "10px",
    "border-radius": "50%",
    "flex-shrink": 0,
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
  backLink: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  convCard: {
    display: "flex",
    gap: "12px",
    padding: "14px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "align-items": "center",
    transition: "background 0.1s",
    cursor: "pointer",
  },
  avatarImg: {
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
    "font-size": "12px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  convBody: {
    flex: 1,
    "min-width": 0,
  },
  convTop: {
    display: "flex",
    "justify-content": "space-between",
    "align-items": "center",
  },
  convName: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  convTime: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
    "margin-left": "8px",
  },
  convPreview: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-top": "2px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  relayPanel: {
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "background-color": "var(--w-bg-secondary)",
  },
  relayRow: {
    display: "flex",
    gap: "8px",
    "align-items": "baseline",
    "margin-bottom": "4px",
    "font-size": "12px",
  },
  relayLabel: {
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  relayValue: {
    color: "var(--w-text-tertiary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  messageList: {
    flex: 1,
    "overflow-y": "auto",
    padding: "12px 20px",
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
  },
  bubble: {
    "max-width": "75%",
    padding: "10px 14px",
    "border-radius": "12px",
    "word-break": "break-word",
    "white-space": "pre-wrap",
  },
  bubbleMine: {
    "align-self": "flex-end",
    "background-color": "var(--w-accent-subtle)",
    color: "var(--w-text-secondary)",
  },
  bubbleTheirs: {
    "align-self": "flex-start",
    "background-color": "var(--w-bg-secondary)",
    color: "var(--w-text-secondary)",
  },
  bubbleContent: {
    "font-size": "14px",
    "line-height": 1.45,
  },
  bubbleTime: {
    "font-size": "11px",
    color: "var(--w-text-muted)",
    "margin-top": "4px",
    "text-align": "right",
  },
  sendForm: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px",
    "border-top": "1px solid var(--w-border-secondary)",
    "background-color": "var(--w-bg-overlay-heavy)",
  },
  sendInput: {
    flex: 1,
    padding: "10px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    "font-family": "inherit",
    resize: "none",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 16px",
    "border-radius": "8px",
    border: "none",
    "background-color": "var(--w-accent)",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    cursor: "pointer",
    "flex-shrink": 0,
  },
};
