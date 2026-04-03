import { createSignal, createMemo, createEffect, Show, For, onCleanup } from "solid-js";
import { getLoginState } from "../lib/identity";
import { formatSats } from "../lib/utils";
import {
  getNotifications,
  getNotificationSummary,
  setNotificationsViewing,
  markNotificationsRead,
} from "../lib/notifications";
import { NotificationRow } from "../components/NotificationRow";

const ALL_TYPES = ["reply", "reaction", "zap", "repost", "quote", "mention", "dm"];

const TYPE_LABELS = {
  reply: "Replies",
  reaction: "Reactions",
  zap: "Zaps",
  repost: "Reposts",
  quote: "Quotes",
  mention: "Mentions",
  dm: "DMs",
};

export default function Notifications() {
  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  createEffect(() => {
    if (loggedIn()) {
      setNotificationsViewing(true);
      markNotificationsRead();
    }
  });

  onCleanup(() => setNotificationsViewing(false));

  const [enabledTypes, setEnabledTypes] = createSignal(new Set(ALL_TYPES));

  const notifications = createMemo(() => {
    const all = getNotifications();
    const enabled = enabledTypes();
    if (enabled.size === ALL_TYPES.length) return all;
    return all.filter((n) => enabled.has(n.type));
  });

  const summary = createMemo(() => getNotificationSummary());

  function toggleType(type) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Notifications</h2>
        <Show when={notifications().length > 0}>
          <span style={styles.count}>{notifications().length}</span>
        </Show>
      </div>

      <Show when={!loggedIn()}>
        <p style={styles.empty}>Log in to see notifications.</p>
      </Show>

      <Show when={loggedIn()}>
        <SummaryBar summary={summary()} />
        <FilterBar enabled={enabledTypes()} onToggle={toggleType} />

        <Show when={notifications().length === 0}>
          <p style={styles.empty}>No notifications yet.</p>
        </Show>

        <For each={notifications()}>
          {(item) => <NotificationRow item={item} />}
        </For>
      </Show>
    </div>
  );
}

// --- Summary Bar ---

function SummaryBar(props) {
  const chips = createMemo(() => {
    const s = props.summary;
    const items = [];
    if (s.replyCount > 0) items.push({ icon: ReplyChipIcon, label: s.replyCount });
    if (s.reactionCount > 0) items.push({ icon: HeartChipIcon, label: s.reactionCount });
    if (s.zapSatsTotal > 0) items.push({ icon: ZapChipIcon, label: formatSats(s.zapSatsTotal) + " sats" });
    if (s.repostCount > 0) items.push({ icon: RepostChipIcon, label: s.repostCount });
    if (s.mentionCount + s.quoteCount > 0) items.push({ icon: MentionChipIcon, label: s.mentionCount + s.quoteCount });
    if (s.dmCount > 0) items.push({ icon: DmChipIcon, label: s.dmCount });
    return items;
  });

  return (
    <Show when={chips().length > 0}>
      <div style={styles.summaryBar}>
        <span style={styles.summaryLabel}>24h</span>
        <For each={chips()}>
          {(chip) => (
            <div style={styles.chip}>
              {chip.icon()}
              <span>{chip.label}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

// --- Filter Bar ---

function FilterBar(props) {
  const allEnabled = createMemo(() => props.enabled.size === ALL_TYPES.length);

  return (
    <div style={styles.filterBar}>
      <For each={ALL_TYPES}>
        {(type) => {
          const active = () => props.enabled.has(type);
          return (
            <button
              style={{
                ...styles.filterPill,
                background: active() ? "var(--w-accent-subtle)" : "transparent",
                color: active() ? "var(--w-text-secondary)" : "var(--w-text-muted)",
                "border-color": active() ? "var(--w-accent-subtle)" : "var(--w-border)",
              }}
              aria-label={`Filter ${TYPE_LABELS[type]}`}
              onClick={() => props.onToggle(type)}
            >
              {TYPE_LABELS[type]}
            </button>
          );
        }}
      </For>
    </div>
  );
}

// --- Chip Icons (12px) ---

const chipIconStyle = { width: "14px", height: "14px", "flex-shrink": "0" };

const ReplyChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const HeartChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ZapChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const RepostChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const MentionChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);

const DmChipIcon = () => (
  <svg {...chipIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

// --- Styles ---

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
    gap: "12px",
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
  summaryBar: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "overflow-x": "auto",
    "flex-wrap": "nowrap",
  },
  summaryLabel: {
    "font-size": "12px",
    "font-weight": 600,
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  chip: {
    display: "inline-flex",
    "align-items": "center",
    gap: "5px",
    padding: "4px 10px",
    "border-radius": "16px",
    background: "var(--w-bg-secondary)",
    "font-size": "12px",
    color: "var(--w-text-tertiary)",
    "white-space": "nowrap",
    "flex-shrink": 0,
  },
  filterBar: {
    display: "flex",
    gap: "6px",
    padding: "10px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "overflow-x": "auto",
    "flex-wrap": "nowrap",
  },
  filterPill: {
    padding: "5px 12px",
    "border-radius": "16px",
    border: "1px solid",
    "font-size": "12px",
    "font-weight": 500,
    cursor: "pointer",
    "white-space": "nowrap",
    "flex-shrink": 0,
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
  },
};
