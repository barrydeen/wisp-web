import { createSignal, createEffect, onCleanup, Show, createMemo } from "solid-js";
import { getNote, requestNote } from "../lib/notes";
import { NoteCard } from "./NoteCard";

export function EmbeddedNote(props) {
  const [timedOut, setTimedOut] = createSignal(false);

  const event = createMemo(() => {
    requestNote(props.id, props.relays || []);
    return getNote(props.id);
  });

  // Show "not found" after 8s if still null
  createEffect(() => {
    if (event()) return;
    const t = setTimeout(() => setTimedOut(true), 8000);
    onCleanup(() => clearTimeout(t));
  });

  return (
    <div style={styles.wrapper} onClick={(e) => e.stopPropagation()}>
      <Show when={!event() && !timedOut()}>
        <div style={styles.loading}>Loading note...</div>
      </Show>
      <Show when={timedOut() && !event()}>
        <div style={styles.loading}>Note not found</div>
      </Show>
      <Show when={event()}>
        <NoteCard note={event()} embedded />
      </Show>
    </div>
  );
}

const styles = {
  wrapper: {
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    margin: "8px 0",
    overflow: "hidden",
  },
  loading: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    padding: "16px",
  },
};
