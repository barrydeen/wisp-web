import { For, Show, createSignal } from "solid-js";
import { avatarColor, npubShort } from "../lib/utils";

export function MentionPopup(props) {
  // props.candidates: signal accessor returning array
  // props.onSelect: (candidate) => void

  return (
    <Show when={props.candidates().length > 0}>
      <div style={styles.container}>
        <For each={props.candidates()}>
          {(candidate) => <MentionRow candidate={candidate} onSelect={props.onSelect} />}
        </For>
      </div>
    </Show>
  );
}

function MentionRow(props) {
  const [hovered, setHovered] = createSignal(false);
  const color = () => avatarColor(props.candidate.pubkey);

  return (
    <button
      style={{
        ...styles.row,
        background: hovered() ? "var(--w-bg-hover)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => props.onSelect(props.candidate)}
    >
      {props.candidate.picture ? (
        <img src={props.candidate.picture} style={styles.avatar} loading="lazy" />
      ) : (
        <div style={{ ...styles.avatarFallback, "background-color": color() }}>
          {props.candidate.pubkey.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={styles.info}>
        <span style={styles.name}>
          {props.candidate.displayName || npubShort(props.candidate.pubkey)}
        </span>
        <Show when={props.candidate.name && props.candidate.name !== props.candidate.displayName}>
          <span style={styles.username}>@{props.candidate.name}</span>
        </Show>
      </div>
      <Show when={props.candidate.isContact}>
        <span style={styles.badge}>following</span>
      </Show>
    </button>
  );
}

const styles = {
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    background: "var(--w-bg-secondary)",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "8px",
    padding: "4px 0",
    "z-index": 20,
    "box-shadow": "0 4px 12px rgba(0,0,0,0.5)",
    "max-height": "240px",
    overflow: "auto",
  },
  row: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    width: "100%",
    padding: "8px 12px",
    border: "none",
    cursor: "pointer",
    "text-align": "left",
    transition: "background 0.1s",
  },
  avatar: {
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
  info: {
    flex: 1,
    "min-width": 0,
    display: "flex",
    "flex-direction": "column",
    gap: "1px",
  },
  name: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  username: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  badge: {
    "font-size": "11px",
    color: "var(--w-accent)",
    "flex-shrink": 0,
    padding: "2px 8px",
    "border-radius": "10px",
    border: "1px solid var(--w-accent-subtle)",
    background: "var(--w-accent-subtle)",
  },
};
