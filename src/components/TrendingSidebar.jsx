import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { createOrderedSubscription } from "../lib/pool";
import { NoteCard } from "./NoteCard";

const METRICS = [
  { value: "reactions", label: "Likes" },
  { value: "replies", label: "Replies" },
  { value: "reposts", label: "Reposts" },
  { value: "zaps", label: "Zaps" },
];

const TIMEFRAMES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];

export function TrendingSidebar() {
  const [metric, setMetric] = createSignal("reactions");
  const [timeframe, setTimeframe] = createSignal("today");
  const [loading, setLoading] = createSignal(true);
  const [notes, setNotes] = createSignal([]);

  let currentCleanup = null;

  createEffect(() => {
    const m = metric();
    const t = timeframe();
    const relay = `wss://feeds.nostrarchives.com/notes/trending/${m}/${t}`;

    if (currentCleanup) currentCleanup();
    setLoading(true);
    setNotes([]);

    const { events, cleanup } = createOrderedSubscription(
      { kinds: [1], limit: 20 },
      { relays: [relay], limit: 20 }
    );

    currentCleanup = cleanup;

    createEffect(() => {
      const evts = events();
      setNotes(evts);
      if (evts.length > 0) {
        setLoading(false);
      }
    });

    onCleanup(() => {
      cleanup();
      currentCleanup = null;
    });

    const timer = setTimeout(() => setLoading(false), 8000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Trending</h3>

      <div style={styles.selectorGroup}>
        <div style={styles.pillRow}>
          <For each={METRICS}>
            {(m) => (
              <button
                style={{
                  ...styles.pill,
                  ...(metric() === m.value ? styles.pillActive : {}),
                }}
                onClick={() => setMetric(m.value)}
              >
                {m.label}
              </button>
            )}
          </For>
        </div>
        <div style={styles.pillRow}>
          <For each={TIMEFRAMES}>
            {(t) => (
              <button
                style={{
                  ...styles.pill,
                  ...(timeframe() === t.value ? styles.pillActive : {}),
                }}
                onClick={() => setTimeframe(t.value)}
              >
                {t.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={loading() && notes().length === 0}>
        <p style={styles.status}>Loading...</p>
      </Show>

      <Show when={!loading() && notes().length === 0}>
        <p style={styles.status}>No trending notes found</p>
      </Show>

      <div style={styles.noteList}>
        <For each={notes()}>
          {(note) => <NoteCard note={note} compact />}
        </For>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "0 16px",
  },
  heading: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "margin-bottom": "12px",
  },
  selectorGroup: {
    display: "flex",
    "flex-direction": "column",
    gap: "6px",
    "margin-bottom": "12px",
  },
  pillRow: {
    display: "flex",
    gap: "4px",
    "flex-wrap": "wrap",
  },
  pill: {
    padding: "4px 10px",
    "border-radius": "6px",
    border: "1px solid var(--w-border)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-tertiary)",
    "font-size": "12px",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
  },
  pillActive: {
    background: "var(--w-accent-subtle)",
    color: "var(--w-accent)",
    "border-color": "var(--w-accent)",
  },
  status: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    padding: "20px 0",
    "text-align": "center",
  },
  noteList: {
    display: "flex",
    "flex-direction": "column",
  },
};
