import { For, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

export function EmojiPopup(props) {
  // props.candidates: signal accessor returning array of { shortcode, url }
  // props.onSelect: (candidate) => void
  // props.anchorRef: ref element to anchor the portal popup to
  // props.position: "portal" renders as a fixed portal below the anchor (escapes overflow)

  return (
    <Show when={props.candidates().length > 0}>
      {props.position === "portal"
        ? <PortalPopup candidates={props.candidates} onSelect={props.onSelect} anchorRef={props.anchorRef} />
        : <div style={styles.container} onMouseDown={(e) => e.preventDefault()}>
            <For each={props.candidates()}>
              {(candidate) => <EmojiRow candidate={candidate} onSelect={props.onSelect} />}
            </For>
          </div>
      }
    </Show>
  );
}

function PortalPopup(props) {
  const [rect, setRect] = createSignal({ bottom: 0, left: 0, width: 0 });

  function updateRect() {
    const el = props.anchorRef;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ bottom: r.bottom, left: r.left, width: r.width });
  }

  createEffect(() => {
    if (props.candidates().length > 0) updateRect();
  });

  createEffect(() => {
    if (props.candidates().length > 0) {
      window.addEventListener("scroll", updateRect, true);
      window.addEventListener("resize", updateRect);
      onCleanup(() => {
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
      });
    }
  });

  return (
    <Portal>
      <div onMouseDown={(e) => e.preventDefault()} style={{
        position: "fixed",
        top: rect().bottom + "px",
        left: rect().left + "px",
        width: rect().width + "px",
        "z-index": 200,
        background: "var(--w-bg-secondary)",
        border: "1px solid var(--w-border-subtle)",
        "border-radius": "0 0 8px 8px",
        padding: "4px 0",
        "box-shadow": "0 8px 24px var(--w-shadow)",
        "max-height": "240px",
        overflow: "auto",
      }}>
        <For each={props.candidates()}>
          {(candidate) => <EmojiRow candidate={candidate} onSelect={props.onSelect} />}
        </For>
      </div>
    </Portal>
  );
}

function EmojiRow(props) {
  const [hovered, setHovered] = createSignal(false);

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
      <img
        src={props.candidate.url}
        alt={`:${props.candidate.shortcode}:`}
        style={styles.emojiImg}
        loading="lazy"
      />
      <span style={styles.shortcode}>:{props.candidate.shortcode}:</span>
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
    "box-shadow": "0 4px 12px var(--w-shadow)",
    "max-height": "240px",
    overflow: "auto",
  },
  row: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    width: "100%",
    padding: "8px 12px",
    "min-height": "40px",
    border: "none",
    cursor: "pointer",
    "text-align": "left",
    transition: "background 0.1s",
  },
  emojiImg: {
    width: "24px",
    height: "24px",
    "object-fit": "contain",
    "flex-shrink": 0,
  },
  shortcode: {
    "font-size": "13px",
    color: "var(--w-text-secondary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
};
