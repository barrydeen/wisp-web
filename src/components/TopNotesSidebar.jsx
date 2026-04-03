import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { createOrderedSubscription } from "../lib/pool";
import { NoteCard } from "./NoteCard";

const METRICS = [
  { value: "likes", label: "Likes" },
  { value: "replies", label: "Replies" },
  { value: "reposts", label: "Reposts" },
  { value: "zaps", label: "Zaps" },
];

export function TopNotesSidebar(props) {
  const [metric, setMetric] = createSignal("likes");
  const [loading, setLoading] = createSignal(true);
  const [notes, setNotes] = createSignal([]);

  let currentCleanup = null;

  createEffect(() => {
    const pubkey = props.pubkey;
    const m = metric();
    if (!pubkey) return;

    const relay = `wss://feeds.nostrarchives.com/profiles/root/${m}`;

    if (currentCleanup) currentCleanup();
    setLoading(true);
    setNotes([]);

    const { events, cleanup } = createOrderedSubscription(
      { kinds: [1], authors: [pubkey], limit: 20 },
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
      <h3 style={styles.heading}>Top Notes</h3>

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

      <Show when={loading() && notes().length === 0}>
        <p style={styles.status}>Loading...</p>
      </Show>

      <Show when={!loading() && notes().length === 0}>
        <p style={styles.status}>No top notes found</p>
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
  pillRow: {
    display: "flex",
    gap: "4px",
    "flex-wrap": "wrap",
    "margin-bottom": "12px",
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
