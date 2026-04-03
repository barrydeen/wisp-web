import { createSignal, For, Show, onCleanup, createMemo } from "solid-js";
import { useParams } from "@solidjs/router";
import { createSubscription } from "../lib/pool";
import { getProfile } from "../lib/profiles";
import { formatTime, npubShort, avatarColor } from "../lib/utils";

export default function Chat() {
  const params = useParams();

  // NIP-28: kind 42 = channel messages, kind 40 = channel creation
  // If no channelId, show channel list; otherwise show the channel
  return (
    <Show when={params.channelId} fallback={<ChannelList />}>
      <ChannelView channelId={params.channelId} />
    </Show>
  );
}

function ChannelList() {
  const { events, cleanup } = createSubscription({ kinds: [40], limit: 30 });
  onCleanup(cleanup);

  const channels = createMemo(() =>
    events().map((e) => {
      try {
        const meta = JSON.parse(e.content);
        return { id: e.id, name: meta.name, about: meta.about, pubkey: e.pubkey };
      } catch {
        return { id: e.id, name: "Unnamed", about: "", pubkey: e.pubkey };
      }
    })
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Chat Rooms</h2>
        <span style={styles.count}>{channels().length} channels</span>
      </div>
      <Show when={channels().length === 0}>
        <p style={styles.empty}>Looking for channels...</p>
      </Show>
      <For each={channels()}>
        {(ch) => (
          <a href={`/chat/${ch.id}`} style={styles.channelCard}>
            <span style={styles.channelName}># {ch.name}</span>
            <Show when={ch.about}>
              <span style={styles.channelAbout}>{ch.about}</span>
            </Show>
          </a>
        )}
      </For>
    </div>
  );
}

function ChannelView(props) {
  const { events, cleanup } = createSubscription(
    { kinds: [42], "#e": [props.channelId], limit: 100 },
  );
  onCleanup(cleanup);

  // Reverse so oldest is at top, newest at bottom
  const messages = createMemo(() => [...events()].reverse());

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Channel</h2>
        <span style={styles.count}>{messages().length} messages</span>
      </div>
      <div style={styles.messages}>
        <For each={messages()}>
          {(msg) => <ChatMessage msg={msg} />}
        </For>
      </div>
    </div>
  );
}

function ChatMessage(props) {
  const profile = createMemo(() => getProfile(props.msg.pubkey));
  const color = createMemo(() => avatarColor(props.msg.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.msg.pubkey);
  });

  return (
    <div style={styles.msg}>
      <div style={{ ...styles.msgDot, "background-color": color() }} />
      <div>
        <span style={styles.msgAuthor}>{name()}</span>
        <span style={styles.msgTime}>{formatTime(props.msg.created_at)}</span>
        <div style={styles.msgContent}>{props.msg.content}</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "650px",
    width: "100%",
    padding: "0 16px",
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
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  channelCard: {
    display: "block",
    padding: "14px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    transition: "background 0.1s",
    cursor: "pointer",
  },
  channelName: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
  },
  channelAbout: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-top": "4px",
    display: "block",
  },
  messages: {
    padding: "8px 0",
  },
  msg: {
    display: "flex",
    gap: "10px",
    padding: "8px 20px",
    "align-items": "flex-start",
  },
  msgDot: {
    width: "8px",
    height: "8px",
    "border-radius": "50%",
    "margin-top": "6px",
    "flex-shrink": 0,
  },
  msgAuthor: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-right": "8px",
  },
  msgTime: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
  },
  msgContent: {
    "font-size": "14px",
    color: "var(--w-text-secondary)",
    "line-height": 1.45,
    "margin-top": "2px",
  },
};
