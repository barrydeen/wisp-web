import { For, Show, createMemo } from "solid-js";
import { getPowEnabled, setPowEnabled, getPowDifficulty, setPowDifficulty, getIncludeClientTag, setIncludeClientTag } from "../lib/settings";

export default function ProofOfWork() {
  const enabled = () => getPowEnabled();
  const difficulty = () => getPowDifficulty();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Proof of Work</h2>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Proof of Work</h3>
        <p style={styles.description}>
          Mining proof of work on notes proves computational effort. Higher difficulty takes longer but demonstrates more work.
        </p>
        <label style={styles.powToggle}>
          <input
            type="checkbox"
            checked={enabled()}
            onChange={(e) => setPowEnabled(e.target.checked)}
          />
          <span style={{ "font-size": "13px", color: "var(--w-text-secondary)" }}>
            Enable Proof of Work on notes
          </span>
        </label>
        <Show when={enabled()}>
          <div style={styles.powDifficultyRow}>
            <label style={{ "font-size": "13px", color: "var(--w-text-tertiary)" }}>
              Difficulty (bits):
            </label>
            <input
              type="range"
              min={8}
              max={32}
              aria-label="Proof of work difficulty"
              value={difficulty()}
              onInput={(e) => setPowDifficulty(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={styles.powDifficultyValue}>{difficulty()}</span>
          </div>
        </Show>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Client Tag</h3>
        <p style={styles.description}>
          Include a tag identifying Wisp Web on published events. Other users may see which client you used.
        </p>
        <label style={styles.powToggle}>
          <input
            type="checkbox"
            checked={getIncludeClientTag()}
            onChange={(e) => setIncludeClientTag(e.target.checked)}
          />
          <span style={{ "font-size": "13px", color: "var(--w-text-secondary)" }}>
            Include client tag on events
          </span>
        </label>
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
  powToggle: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    cursor: "pointer",
    "user-select": "none",
    "margin-bottom": "12px",
  },
  powDifficultyRow: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
  },
  powDifficultyValue: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    "min-width": "24px",
    "text-align": "center",
  },
};
