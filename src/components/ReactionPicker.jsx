import { Show, For, createEffect, onCleanup, createMemo } from "solid-js";
import { getQuickReactions } from "../lib/settings";

export function ReactionPicker(props) {
  let ref;

  // Close on click outside
  createEffect(() => {
    if (!props.isOpen) return;
    const handler = (e) => {
      if (ref && !ref.contains(e.target)) {
        props.onClose();
      }
    };
    // Delay to avoid closing from the same click that opened
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    onCleanup(() => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    });
  });

  const quickReactions = createMemo(() => getQuickReactions());

  function handleQuickReact(emoji) {
    if (typeof emoji === "string") {
      props.onSelect(emoji, null);
    } else {
      props.onSelect(emoji.shortcode, emoji.url);
    }
  }

  return (
    <Show when={props.isOpen}>
      <div ref={ref} style={styles.container} onClick={(e) => e.stopPropagation()}>
        <div style={styles.quickGrid}>
          <For each={quickReactions()}>
            {(emoji) => (
              <button style={styles.quickBtn} onClick={() => handleQuickReact(emoji)}>
                {typeof emoji === "string" ? (
                  <span style={styles.emoji}>{emoji}</span>
                ) : (
                  <img src={emoji.url} alt={`:${emoji.shortcode}:`} style={styles.customImg} />
                )}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

const styles = {
  container: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    "margin-bottom": "6px",
    background: "var(--w-bg-secondary)",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    padding: "6px",
    "box-shadow": "0 4px 12px var(--w-shadow)",
    "z-index": 20,
    width: "210px",
  },
  quickGrid: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "2px",
  },
  quickBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "6px",
    "border-radius": "8px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    transition: "background 0.1s",
    width: "36px",
    height: "36px",
  },
  emoji: {
    "font-size": "20px",
    "line-height": 1,
  },
  customImg: {
    width: "24px",
    height: "24px",
    "object-fit": "contain",
  },
};
