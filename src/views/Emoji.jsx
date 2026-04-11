import { For, Show, createMemo } from "solid-js";
import { getQuickReactions, addQuickReaction, removeQuickReaction, resetQuickReactions, DEFAULT_QUICK_REACTIONS } from "../lib/settings";
import { getUserEmojis, getEmojiPacks } from "../lib/emojis";

const COMMON_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥", "🙏", "😍", "😢", "🤔", "💯", "🎉", "❤️‍🔥", "💀", "👀", "🫡"];

export default function Emoji() {
  const reactions = createMemo(() => getQuickReactions());
  const customEmojis = createMemo(() => getUserEmojis());
  const emojiPacks = createMemo(() => getEmojiPacks());

  const availableCommon = createMemo(() => {
    const current = new Set(reactions().filter((e) => typeof e === "string"));
    return COMMON_EMOJIS.filter((e) => !current.has(e));
  });

  const availableCustom = createMemo(() => {
    const currentShortcodes = new Set(
      reactions().filter((e) => typeof e !== "string").map((e) => e.shortcode),
    );
    return customEmojis().filter((e) => !currentShortcodes.has(e.shortcode));
  });

  const looseEmojis = createMemo(() => {
    const packShortcodes = new Set();
    for (const pack of emojiPacks()) {
      for (const e of pack.emojis) packShortcodes.add(e.shortcode);
    }
    return customEmojis().filter((e) => !packShortcodes.has(e.shortcode));
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Emoji</h2>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Quick Reactions</h3>
        <p style={styles.description}>
          Choose emojis for your quick reaction menu. Click the heart on any note to react.
        </p>

        <div style={styles.qrCurrentRow}>
          <For each={reactions()}>
            {(emoji, index) => (
              <div style={styles.qrReactionChip}>
                {typeof emoji === "string" ? (
                  <span style={styles.qrChipEmoji}>{emoji}</span>
                ) : (
                  <img src={emoji.url} alt={`:${emoji.shortcode}:`} style={styles.qrChipImg} />
                )}
                <button style={styles.qrRemoveBtn} onClick={() => removeQuickReaction(index())}>×</button>
              </div>
            )}
          </For>
        </div>

        <Show when={availableCommon().length > 0}>
          <p style={styles.qrSubLabel}>Add emoji</p>
          <div style={styles.qrAddRow}>
            <For each={availableCommon()}>
              {(emoji) => (
                <button style={styles.qrAddBtn} onClick={() => addQuickReaction(emoji)}>
                  {emoji}
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={availableCustom().length > 0}>
          <p style={styles.qrSubLabel}>Add from emoji packs</p>
          <div style={styles.qrAddRow}>
            <For each={availableCustom().slice(0, 30)}>
              {(emoji) => (
                <button
                  style={styles.qrAddBtn}
                  onClick={() => addQuickReaction({ shortcode: emoji.shortcode, url: emoji.url })}
                  title={`:${emoji.shortcode}:`}
                >
                  <img src={emoji.url} alt={`:${emoji.shortcode}:`} style={styles.qrChipImg} />
                </button>
              )}
            </For>
          </div>
        </Show>

        <button style={styles.qrResetBtn} onClick={resetQuickReactions}>
          Reset to defaults
        </button>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Emoji Packs</h3>
        <p style={styles.description}>
          Custom emojis from your emoji list (kind 10030). Type <code style={{ color: "var(--w-text-secondary)" }}>:</code> in any composer to search and insert.
        </p>

        <Show when={looseEmojis().length > 0}>
          <div style={styles.packCard}>
            <div style={styles.packHeader}>
              <span style={styles.packName}>Standalone Emojis</span>
              <span style={styles.packCount}>{looseEmojis().length}</span>
            </div>
            <div style={styles.emojiGrid}>
              <For each={looseEmojis()}>
                {(e) => (
                  <div style={styles.emojiItem} title={`:${e.shortcode}:`}>
                    <img src={e.url} alt={`:${e.shortcode}:`} style={styles.emojiImg} loading="lazy" />
                    <span style={styles.emojiLabel}>{e.shortcode}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <For each={emojiPacks()}>
          {(pack) => (
            <div style={styles.packCard}>
              <div style={styles.packHeader}>
                <span style={styles.packName}>{pack.name}</span>
                <span style={styles.packCount}>{pack.emojis.length} emojis</span>
              </div>
              <div style={styles.emojiGrid}>
                <For each={pack.emojis}>
                  {(e) => (
                    <div style={styles.emojiItem} title={`:${e.shortcode}:`}>
                      <img src={e.url} alt={`:${e.shortcode}:`} style={styles.emojiImg} loading="lazy" />
                      <span style={styles.emojiLabel}>{e.shortcode}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>

        <Show when={emojiPacks().length === 0 && looseEmojis().length === 0}>
          <p style={styles.emptyText}>No custom emojis found. Add emoji packs to your emoji list (kind 10030) from another client.</p>
        </Show>
      </div>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "650px",
  },
  header: {
    padding: "20px 20px 16px",
    "border-bottom": "1px solid var(--w-border-secondary)",
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
  section: {
    padding: "20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  sectionTitle: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-bottom": "12px",
    "text-transform": "uppercase",
    "letter-spacing": "0.04em",
  },
  description: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-bottom": "12px",
    "line-height": "1.4",
  },
  qrCurrentRow: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "8px",
    "margin-bottom": "12px",
  },
  qrReactionChip: {
    display: "flex",
    "align-items": "center",
    gap: "4px",
    padding: "6px 8px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-tertiary)",
  },
  qrChipEmoji: {
    "font-size": "20px",
    "line-height": 1,
  },
  qrChipImg: {
    width: "24px",
    height: "24px",
    "object-fit": "contain",
  },
  qrRemoveBtn: {
    background: "none",
    border: "none",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    "font-size": "16px",
    padding: "0 2px",
    "line-height": 1,
  },
  qrSubLabel: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "margin-bottom": "6px",
  },
  qrAddRow: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "4px",
    "margin-bottom": "12px",
  },
  qrAddBtn: {
    background: "none",
    border: "1px solid var(--w-border-subtle)",
    cursor: "pointer",
    padding: "6px",
    "border-radius": "8px",
    "font-size": "18px",
    "line-height": 1,
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    transition: "background 0.1s",
  },
  qrResetBtn: {
    background: "none",
    border: "1px solid var(--w-border-input)",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    padding: "6px 12px",
    "border-radius": "6px",
    "font-size": "12px",
    transition: "background 0.1s, color 0.1s",
  },
  packCard: {
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    padding: "12px",
    "margin-bottom": "12px",
  },
  packHeader: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    "margin-bottom": "10px",
  },
  packName: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
  },
  packCount: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
  },
  emojiGrid: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "8px",
  },
  emojiItem: {
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    gap: "4px",
    width: "56px",
  },
  emojiImg: {
    width: "32px",
    height: "32px",
    "object-fit": "contain",
  },
  emojiLabel: {
    "font-size": "10px",
    color: "var(--w-text-muted)",
    "text-align": "center",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
    "max-width": "56px",
  },
  emptyText: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "font-style": "italic",
  },
};
