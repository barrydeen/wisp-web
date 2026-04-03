import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  For,
  Show,
} from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { getSatoshisAmountFromBolt11 } from "nostr-tools/nip57";
import Hls from "hls.js";
import {
  getLiveStreams,
  initStreamDiscovery,
  cleanupStreamDiscovery,
  parseLiveStream,
  resolveChatRelays,
  createChatSubscription,
  sendChatMessage,
  sendReaction,
} from "../lib/streams";
import { getPool, getRelays, createSubscription } from "../lib/pool";
import { getProfile } from "../lib/profiles";
import { getPubkey, getLoginState } from "../lib/identity";
import { formatTime, npubShort, avatarColor, formatSats } from "../lib/utils";

export default function Streams() {
  const params = useParams();

  return (
    <Show when={params.naddr} fallback={<StreamList />}>
      <StreamView naddr={params.naddr} />
    </Show>
  );
}

// --- Stream List (Discovery) ---

function StreamList() {
  const navigate = useNavigate();

  createEffect(() => {
    initStreamDiscovery();
  });
  onCleanup(cleanupStreamDiscovery);

  const streams = createMemo(() => getLiveStreams());

  function openStream(stream) {
    try {
      const naddr = nip19.naddrEncode({
        kind: 30311,
        pubkey: stream.pubkey,
        identifier: stream.dTag,
        relays: stream.relayHints.slice(0, 3),
      });
      navigate(`/streams/${naddr}`);
    } catch {
      // encoding failed
    }
  }

  return (
    <div style={listStyles.container}>
      <div style={listStyles.header}>
        <h2 style={listStyles.title}>Live Streams</h2>
        <span style={listStyles.count}>{streams().length} live</span>
      </div>
      <Show when={streams().length === 0}>
        <p style={listStyles.empty}>Looking for live streams...</p>
      </Show>
      <For each={streams()}>
        {(stream) => (
          <StreamCard stream={stream} onClick={() => openStream(stream)} />
        )}
      </For>
    </div>
  );
}

function StreamCard(props) {
  const profile = createMemo(() => getProfile(props.stream.streamerPubkey));
  const name = createMemo(() => {
    const p = profile();
    return (
      p?.display_name || p?.name || npubShort(props.stream.streamerPubkey)
    );
  });
  const avatar = createMemo(() => profile()?.picture);
  const color = createMemo(() => avatarColor(props.stream.streamerPubkey));
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      style={{
        ...listStyles.card,
        background: hovered() ? "var(--w-bg-hover)" : "transparent",
      }}
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Show when={props.stream.image}>
        <img
          src={props.stream.image}
          style={listStyles.cardImage}
          loading="lazy"
        />
      </Show>
      <div style={listStyles.cardBody}>
        <div style={listStyles.cardMeta}>
          {avatar() ? (
            <img src={avatar()} style={listStyles.cardAvatar} loading="lazy" />
          ) : (
            <div
              style={{
                ...listStyles.cardAvatarFallback,
                "background-color": color(),
              }}
            >
              {props.stream.streamerPubkey.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <span style={listStyles.cardName}>{name()}</span>
            <span style={listStyles.liveBadge}>LIVE</span>
          </div>
        </div>
        <span style={listStyles.cardTitle}>{props.stream.title}</span>
        <Show when={props.stream.summary}>
          <span style={listStyles.cardSummary}>{props.stream.summary}</span>
        </Show>
      </div>
    </button>
  );
}

// --- Stream View ---

function StreamView(props) {
  const [stream, setStream] = createSignal(null);
  const [chatRelays, setChatRelays] = createSignal([]);
  const [chatSub, setChatSub] = createSignal(null);
  const [messageText, setMessageText] = createSignal("");
  const [sending, setSending] = createSignal(false);

  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  // Decode naddr
  const decoded = createMemo(() => {
    try {
      const result = nip19.decode(props.naddr);
      if (result.type === "naddr") return result.data;
    } catch {}
    return null;
  });

  // Subscribe to the stream's kind 30311 event
  const streamSub = createMemo(() => {
    const d = decoded();
    if (!d) return null;
    return createSubscription(
      { kinds: [30311], authors: [d.pubkey], "#d": [d.identifier] },
      { relays: d.relays?.length ? [...d.relays, ...getRelays()] : undefined },
    );
  });

  onCleanup(() => streamSub()?.cleanup());

  // Parse stream event when it arrives
  createEffect(() => {
    const sub = streamSub();
    if (!sub) return;
    const events = sub.events();
    if (events.length > 0) {
      setStream(parseLiveStream(events[0]));
    }
  });

  // Resolve chat relays + open chat subscription when stream is available
  createEffect(async () => {
    const s = stream();
    if (!s) return;

    const d = decoded();
    const naddrHints = d?.relays || [];
    const relays = await resolveChatRelays(s, naddrHints);
    setChatRelays(relays);

    // Close previous chat sub if any
    chatSub()?.cleanup();

    const sub = createChatSubscription(s, relays);
    setChatSub(sub);
  });

  onCleanup(() => chatSub()?.cleanup());

  // Computed signals from chat subscription
  const chatMessages = createMemo(() => chatSub()?.chatMessages() || []);
  const reactions = createMemo(() => chatSub()?.reactions() || []);
  const zapReceipts = createMemo(() => chatSub()?.zapReceipts() || []);

  // Reaction counts per message: { [messageId]: count }
  const reactionCounts = createMemo(() => {
    const counts = {};
    for (const r of reactions()) {
      const eTag = r.tags.find((t) => t[0] === "e")?.[1];
      if (eTag) counts[eTag] = (counts[eTag] || 0) + 1;
    }
    return counts;
  });

  // User's reactions: Set of message IDs
  const userReactions = createMemo(() => {
    const pk = getPubkey();
    if (!pk) return new Set();
    const set = new Set();
    for (const r of reactions()) {
      if (r.pubkey === pk) {
        const eTag = r.tags.find((t) => t[0] === "e")?.[1];
        if (eTag) set.add(eTag);
      }
    }
    return set;
  });

  // Zap total for stream
  const streamZapTotal = createMemo(() => {
    let total = 0;
    for (const receipt of zapReceipts()) {
      const bolt11Tag = receipt.tags.find((t) => t[0] === "bolt11")?.[1];
      if (bolt11Tag) {
        try {
          total += getSatoshisAmountFromBolt11(bolt11Tag);
        } catch {}
      }
    }
    return total;
  });

  // Zap amounts per message
  const messageZapAmounts = createMemo(() => {
    const amounts = {};
    for (const receipt of zapReceipts()) {
      const eTag = receipt.tags.find((t) => t[0] === "e")?.[1];
      const bolt11Tag = receipt.tags.find((t) => t[0] === "bolt11")?.[1];
      if (eTag && bolt11Tag) {
        try {
          amounts[eTag] = (amounts[eTag] || 0) + getSatoshisAmountFromBolt11(bolt11Tag);
        } catch {}
      }
    }
    return amounts;
  });

  // Send chat message
  async function handleSend() {
    const s = stream();
    const text = messageText().trim();
    if (!s || !text || sending()) return;

    setSending(true);
    try {
      await sendChatMessage(s, text, null, chatRelays());
      setMessageText("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Like a message
  async function handleLike(msg) {
    const s = stream();
    if (!s || !loggedIn()) return;
    try {
      await sendReaction(s, msg, chatRelays());
    } catch (err) {
      console.error("Failed to send reaction:", err);
    }
  }

  return (
    <div style={viewStyles.container}>
      <Show when={stream()} fallback={<p style={viewStyles.loading}>Loading stream...</p>}>
        {(s) => (
          <>
            <VideoPlayer streamingUrl={s().streamingUrl} image={s().image} />
            <StreamInfoBar stream={s()} zapTotal={streamZapTotal()} />
            <ChatArea
              messages={chatMessages()}
              reactionCounts={reactionCounts()}
              userReactions={userReactions()}
              messageZapAmounts={messageZapAmounts()}
              onLike={handleLike}
              loggedIn={loggedIn()}
            />
            <Show when={loggedIn()}>
              <div style={viewStyles.inputBar}>
                <input
                  type="text"
                  placeholder="Chat..."
                  value={messageText()}
                  onInput={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending()}
                  style={viewStyles.input}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText().trim() || sending()}
                  style={{
                    ...viewStyles.sendBtn,
                    opacity: !messageText().trim() || sending() ? 0.4 : 1,
                  }}
                >
                  {sending() ? "..." : "Send"}
                </button>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

// --- Video Player ---

function VideoPlayer(props) {
  let videoRef;
  let hlsInstance = null;

  createEffect(() => {
    const url = props.streamingUrl;
    if (!url || !videoRef) return;

    // Cleanup previous instance
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      videoRef.src = url;
    } else if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(videoRef);
      hlsInstance = hls;
    }
  });

  onCleanup(() => {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  });

  return (
    <Show
      when={props.streamingUrl}
      fallback={
        <Show when={props.image}>
          <img src={props.image} style={viewStyles.thumbnail} loading="lazy" />
        </Show>
      }
    >
      <video
        ref={videoRef}
        controls
        autoplay
        style={viewStyles.video}
      />
    </Show>
  );
}

// --- Stream Info Bar ---

function StreamInfoBar(props) {
  const profile = createMemo(() => getProfile(props.stream.streamerPubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.stream.streamerPubkey);
  });
  const avatar = createMemo(() => profile()?.picture);
  const color = createMemo(() => avatarColor(props.stream.streamerPubkey));

  return (
    <div style={viewStyles.infoBar}>
      <div style={viewStyles.infoLeft}>
        <Show when={props.stream.status === "live"}>
          <span style={viewStyles.liveBadge}>LIVE</span>
        </Show>
        {avatar() ? (
          <img src={avatar()} style={viewStyles.infoAvatar} loading="lazy" />
        ) : (
          <div
            style={{
              ...viewStyles.infoAvatarFallback,
              "background-color": color(),
            }}
          >
            {props.stream.streamerPubkey.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span style={viewStyles.infoName}>{name()}</span>
      </div>
      <div style={viewStyles.infoRight}>
        <Show when={props.zapTotal > 0}>
          <span style={viewStyles.zapTotal}>
            <ZapIcon size={14} /> {formatSats(props.zapTotal)}
          </span>
        </Show>
        <button style={viewStyles.zapStreamBtn} disabled title="Wallet coming soon">
          <ZapIcon size={16} /> Zap
        </button>
      </div>
    </div>
  );
}

// --- Chat Area ---

function ChatArea(props) {
  let chatRef;

  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    const _len = props.messages.length;
    if (!chatRef) return;
    // Only auto-scroll if near bottom
    const atBottom =
      chatRef.scrollHeight - chatRef.scrollTop - chatRef.clientHeight < 100;
    if (atBottom) {
      requestAnimationFrame(() => {
        chatRef.scrollTop = chatRef.scrollHeight;
      });
    }
  });

  return (
    <div ref={chatRef} style={viewStyles.chatArea}>
      <Show when={props.messages.length === 0}>
        <p style={viewStyles.chatEmpty}>No chat messages yet</p>
      </Show>
      <For each={props.messages}>
        {(msg) => (
          <ChatMessage
            msg={msg}
            reactionCount={props.reactionCounts[msg.id] || 0}
            hasReacted={props.userReactions.has(msg.id)}
            zapAmount={props.messageZapAmounts[msg.id] || 0}
            onLike={() => props.onLike(msg)}
            loggedIn={props.loggedIn}
          />
        )}
      </For>
    </div>
  );
}

// --- Chat Message ---

function ChatMessage(props) {
  const profile = createMemo(() => getProfile(props.msg.pubkey));
  const color = createMemo(() => avatarColor(props.msg.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.msg.pubkey);
  });

  return (
    <div style={viewStyles.msg}>
      <div style={{ ...viewStyles.msgDot, "background-color": color() }} />
      <div style={viewStyles.msgBody}>
        <div style={viewStyles.msgHeader}>
          <span style={viewStyles.msgAuthor}>{name()}</span>
          <span style={viewStyles.msgTime}>
            {formatTime(props.msg.created_at)}
          </span>
        </div>
        <div style={viewStyles.msgContent}>{props.msg.content}</div>
        <div style={viewStyles.msgActions}>
          <button
            style={{
              ...viewStyles.msgActionBtn,
              color: props.hasReacted
                ? "#f91880"
                : "var(--w-text-muted)",
            }}
            onClick={props.onLike}
            disabled={!props.loggedIn}
            title={props.loggedIn ? "Like" : "Log in to like"}
          >
            <LikeIcon size={14} />
            <Show when={props.reactionCount > 0}>
              <span style={viewStyles.msgActionCount}>
                {props.reactionCount}
              </span>
            </Show>
          </button>
          <button
            style={viewStyles.msgActionBtn}
            disabled
            title="Wallet coming soon"
          >
            <ZapIcon size={14} />
            <Show when={props.zapAmount > 0}>
              <span style={viewStyles.msgActionCount}>
                {formatSats(props.zapAmount)}
              </span>
            </Show>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Icons ---

function LikeIcon(props) {
  const s = props.size || 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ZapIcon(props) {
  const s = props.size || 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// --- Styles ---

const listStyles = {
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
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  card: {
    display: "block",
    width: "100%",
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    border: "none",
    cursor: "pointer",
    "text-align": "left",
    transition: "background 0.1s",
  },
  cardImage: {
    width: "100%",
    "max-height": "200px",
    "object-fit": "cover",
    "border-radius": "8px",
    "margin-bottom": "12px",
  },
  cardBody: {
    display: "flex",
    "flex-direction": "column",
    gap: "6px",
  },
  cardMeta: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
  },
  cardAvatar: {
    width: "36px",
    height: "36px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  cardAvatarFallback: {
    width: "36px",
    height: "36px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "12px",
    "font-weight": 700,
    color: "#fff",
    "flex-shrink": 0,
  },
  cardName: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "margin-right": "8px",
  },
  liveBadge: {
    display: "inline-block",
    padding: "2px 8px",
    "border-radius": "4px",
    "font-size": "11px",
    "font-weight": 700,
    "letter-spacing": "0.5px",
    background: "#e53e3e",
    color: "#fff",
  },
  cardTitle: {
    "font-size": "15px",
    "font-weight": 500,
    color: "var(--w-text-secondary)",
  },
  cardSummary: {
    "font-size": "13px",
    color: "var(--w-text-tertiary)",
    "line-height": 1.4,
  },
};

const viewStyles = {
  container: {
    "max-width": "800px",
    display: "flex",
    "flex-direction": "column",
    height: "100vh",
  },
  loading: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  video: {
    width: "100%",
    "max-height": "450px",
    background: "#000",
    "flex-shrink": 0,
  },
  thumbnail: {
    width: "100%",
    "max-height": "300px",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  infoBar: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "flex-shrink": 0,
  },
  infoLeft: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    flex: 1,
    "min-width": 0,
  },
  infoAvatar: {
    width: "32px",
    height: "32px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  infoAvatarFallback: {
    width: "32px",
    height: "32px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "11px",
    "font-weight": 700,
    color: "#fff",
    "flex-shrink": 0,
  },
  infoName: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  infoRight: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    "flex-shrink": 0,
  },
  zapTotal: {
    display: "flex",
    "align-items": "center",
    gap: "4px",
    "font-size": "13px",
    "font-weight": 600,
    color: "#f7931a",
  },
  zapStreamBtn: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    padding: "6px 14px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "13px",
    cursor: "not-allowed",
    opacity: 0.5,
  },
  liveBadge: {
    display: "inline-block",
    padding: "2px 8px",
    "border-radius": "4px",
    "font-size": "11px",
    "font-weight": 700,
    "letter-spacing": "0.5px",
    background: "#e53e3e",
    color: "#fff",
    "flex-shrink": 0,
  },
  chatArea: {
    flex: 1,
    "overflow-y": "auto",
    padding: "8px 0",
  },
  chatEmpty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  msg: {
    display: "flex",
    gap: "10px",
    padding: "6px 20px",
    "align-items": "flex-start",
  },
  msgDot: {
    width: "8px",
    height: "8px",
    "border-radius": "50%",
    "margin-top": "6px",
    "flex-shrink": 0,
  },
  msgBody: {
    flex: 1,
    "min-width": 0,
  },
  msgHeader: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
  },
  msgAuthor: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
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
    "word-break": "break-word",
    "white-space": "pre-wrap",
  },
  msgActions: {
    display: "flex",
    gap: "16px",
    "margin-top": "4px",
  },
  msgActionBtn: {
    display: "flex",
    "align-items": "center",
    gap: "4px",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 0",
    "font-size": "12px",
    color: "var(--w-text-muted)",
    transition: "color 0.15s",
  },
  msgActionCount: {
    "font-size": "12px",
  },
  inputBar: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px",
    "border-top": "1px solid var(--w-border-secondary)",
    "flex-shrink": 0,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-tertiary)",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 18px",
    "border-radius": "8px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    "flex-shrink": 0,
    transition: "opacity 0.15s",
  },
};
