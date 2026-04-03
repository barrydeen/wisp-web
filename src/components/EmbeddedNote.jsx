import { createSignal, createEffect, onCleanup, Show, createMemo } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { getPool, getRelays } from "../lib/pool";
import { getProfile } from "../lib/profiles";
import { formatTime, npubShort, avatarColor } from "../lib/utils";

export function EmbeddedNote(props) {
  const [event, setEvent] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const navigate = useNavigate();

  createEffect(() => {
    const id = props.id;
    if (!id) return;

    setLoading(true);
    const relays = props.relays?.length > 0 ? props.relays : getRelays();
    const pool = getPool();

    const sub = pool.subscribeMany(relays, [{ ids: [id], limit: 1 }], {
      onevent(ev) {
        setEvent(ev);
        setLoading(false);
      },
      oneose() {
        setLoading(false);
      },
    });

    onCleanup(() => sub.close());
  });

  const profile = createMemo(() => {
    const ev = event();
    return ev ? getProfile(ev.pubkey) : null;
  });

  const displayName = createMemo(() => {
    const ev = event();
    if (!ev) return "";
    const p = profile();
    return p?.display_name || p?.name || npubShort(ev.pubkey);
  });

  const avatar = createMemo(() => profile()?.picture);
  const color = createMemo(() => {
    const ev = event();
    return ev ? avatarColor(ev.pubkey) : "#666";
  });
  const time = createMemo(() => {
    const ev = event();
    return ev ? formatTime(ev.created_at) : "";
  });

  function handleClick(e) {
    e.stopPropagation();
    const ev = event();
    if (!ev) return;
    try {
      const ne = nip19.neventEncode({ id: ev.id, author: ev.pubkey });
      navigate(`/thread/${ne}`);
    } catch {
      // ignore
    }
  }

  return (
    <div style={styles.container} onClick={handleClick}>
      <Show when={loading()}>
        <div style={styles.loading}>Loading note...</div>
      </Show>
      <Show when={!loading() && !event()}>
        <div style={styles.loading}>Note not found</div>
      </Show>
      <Show when={event()}>
        <div style={styles.header}>
          {avatar() ? (
            <img src={avatar()} style={styles.avatarImg} loading="lazy" />
          ) : (
            <div style={{ ...styles.avatarFallback, "background-color": color() }}>
              {event().pubkey.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span style={styles.name}>{displayName()}</span>
          <span style={styles.dot}>&middot;</span>
          <span style={styles.time}>{time()}</span>
        </div>
        <div style={styles.content}>
          {event().content.length > 300
            ? event().content.substring(0, 300) + "..."
            : event().content}
        </div>
      </Show>
    </div>
  );
}

const styles = {
  container: {
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    padding: "12px",
    margin: "8px 0",
    cursor: "pointer",
    transition: "background 0.1s",
    background: "var(--w-bg-primary)",
  },
  header: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    "margin-bottom": "6px",
  },
  avatarImg: {
    width: "20px",
    height: "20px",
    "border-radius": "50%",
    "object-fit": "cover",
  },
  avatarFallback: {
    width: "20px",
    height: "20px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "9px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
  },
  name: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
  },
  dot: {
    color: "var(--w-text-muted)",
    "font-size": "12px",
  },
  time: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
  },
  content: {
    "font-size": "14px",
    "line-height": 1.45,
    color: "var(--w-text-secondary)",
    "white-space": "pre-wrap",
    "word-break": "break-word",
  },
  loading: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    padding: "8px 0",
  },
};
