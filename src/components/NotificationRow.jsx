import { createMemo, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { getProfile } from "../lib/profiles";
import { formatTime, npubShort, avatarColor, formatSats } from "../lib/utils";

// --- SVG Icons ---

const HeartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ZapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const RepostIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const ReplyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const QuoteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
  </svg>
);

const MentionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);

const EnvelopeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

// --- Type config ---

const TYPE_CONFIG = {
  reaction: { icon: HeartIcon, color: "#f91880" },
  zap: { icon: ZapIcon, color: "#f7931a" },
  repost: { icon: RepostIcon, color: "#00ba7c" },
  reply: { icon: ReplyIcon, color: "#1d9bf0" },
  quote: { icon: QuoteIcon, color: "#1d9bf0" },
  mention: { icon: MentionIcon, color: "var(--w-text-muted)" },
  dm: { icon: EnvelopeIcon, color: "var(--w-text-muted)" },
};

function getActionText(item) {
  switch (item.type) {
    case "reaction":
      if (!item.emoji) return "liked";
      return `reacted ${item.emoji}`;
    case "zap":
      return `zapped ${formatSats(item.zapSats)} sats`;
    case "repost":
      return "reposted";
    case "reply":
      return "replied";
    case "quote":
      return "quoted";
    case "mention":
      return "mentioned you";
    case "dm":
      return "sent you a message";
    default:
      return "";
  }
}

// --- Component ---

export function NotificationRow(props) {
  const navigate = useNavigate();
  const [hovered, setHovered] = createSignal(false);

  const profile = createMemo(() => getProfile(props.item.actorPubkey));
  const color = createMemo(() => avatarColor(props.item.actorPubkey));

  const displayName = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.item.actorPubkey);
  });

  const avatar = createMemo(() => profile()?.picture);
  const actionText = createMemo(() => getActionText(props.item));
  const time = createMemo(() => formatTime(props.item.timestamp));

  const config = createMemo(() => TYPE_CONFIG[props.item.type] || TYPE_CONFIG.mention);

  function navigateToNote(eventId) {
    if (!eventId) return;
    try {
      const ne = nip19.neventEncode({ id: eventId });
      navigate(`/thread/${ne}`);
    } catch {
      // bad encode
    }
  }

  function handleClick() {
    switch (props.item.type) {
      case "reply":
        navigateToNote(props.item.replyEventId);
        break;
      case "quote":
        navigateToNote(props.item.quoteEventId);
        break;
      case "dm":
        navigate(`/messages/${props.item.actorPubkey}`);
        break;
      default:
        navigateToNote(props.item.referencedEventId);
    }
  }

  return (
    <div
      style={{
        ...styles.row,
        background: hovered() ? "var(--w-bg-hover)" : "transparent",
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Type icon */}
      <div style={{ ...styles.typeIcon, color: config().color }}>
        {config().icon()}
        {props.item.type === "reaction" && props.item.emojiUrl ? (
          <img src={props.item.emojiUrl} style={styles.customEmoji} loading="lazy" />
        ) : null}
      </div>

      {/* Avatar */}
      {avatar() ? (
        <img src={avatar()} style={styles.avatarImg} loading="lazy" />
      ) : (
        <div style={{ ...styles.avatarFallback, "background-color": color() }}>
          {props.item.actorPubkey.slice(0, 2).toUpperCase()}
        </div>
      )}

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.textLine}>
          <span style={styles.name}>{displayName()}</span>
          <span style={styles.action}>{actionText()}</span>
        </div>
        {props.item.type === "zap" && props.item.zapMessage ? (
          <div style={styles.zapMessage}>"{props.item.zapMessage}"</div>
        ) : null}
      </div>

      {/* Timestamp */}
      <span style={styles.time}>{time()}</span>
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    padding: "14px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  typeIcon: {
    "flex-shrink": 0,
    width: "20px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    position: "relative",
  },
  customEmoji: {
    width: "18px",
    height: "18px",
    position: "absolute",
    top: 0,
    left: 0,
  },
  avatarImg: {
    width: "32px",
    height: "32px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  avatarFallback: {
    width: "32px",
    height: "32px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "11px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  body: {
    flex: 1,
    "min-width": 0,
  },
  textLine: {
    display: "flex",
    "align-items": "baseline",
    gap: "6px",
    "flex-wrap": "wrap",
  },
  name: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    "white-space": "nowrap",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "max-width": "180px",
  },
  action: {
    "font-size": "14px",
    color: "var(--w-text-muted)",
    "white-space": "nowrap",
  },
  zapMessage: {
    "font-size": "13px",
    color: "var(--w-text-tertiary)",
    "margin-top": "2px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  time: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "white-space": "nowrap",
    "flex-shrink": 0,
  },
};
