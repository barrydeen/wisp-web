import { For } from "solid-js";
import {
  getTheme, setTheme,
  getMode, setMode,
  getFont, setFont,
  getFontSize, setFontSize,
  themes, fonts, fontSizes,
} from "../lib/settings";

const fontLabels = {
  inter: "Inter",
  system: "System",
  mono: "Mono",
  serif: "Serif",
  humanist: "Humanist",
};

const sizeLabels = {
  small: "Small",
  default: "Default",
  large: "Large",
  "x-large": "X-Large",
};

function ThemeCard(props) {
  const active = () => getTheme() === props.name;
  const colors = () => themes[props.name][getMode()];

  return (
    <button
      onClick={() => setTheme(props.name)}
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "10px",
        padding: "16px 20px",
        "border-radius": "10px",
        border: active() ? "2px solid var(--w-accent)" : "2px solid var(--w-border-input)",
        background: colors()["--w-bg-primary"],
        cursor: "pointer",
        "min-width": "120px",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", gap: "6px" }}>
        <div style={{ width: "18px", height: "18px", "border-radius": "50%", background: colors()["--w-bg-secondary"] }} />
        <div style={{ width: "18px", height: "18px", "border-radius": "50%", background: colors()["--w-accent"] }} />
        <div style={{ width: "18px", height: "18px", "border-radius": "50%", background: colors()["--w-text-primary"] }} />
        <div style={{ width: "18px", height: "18px", "border-radius": "50%", background: colors()["--w-text-tertiary"] }} />
      </div>
      <span style={{
        "font-size": "13px",
        "font-weight": 600,
        color: colors()["--w-text-primary"],
        "text-transform": "capitalize",
      }}>
        {props.name}
      </span>
    </button>
  );
}

function SegmentedControl(props) {
  return (
    <div style={{
      display: "flex",
      gap: "0",
      "border-radius": "8px",
      border: "1px solid var(--w-border-input)",
      overflow: "hidden",
      "width": "fit-content",
    }}>
      <For each={props.options}>
        {(opt) => {
          const active = () => props.value() === opt.value;
          return (
            <button
              onClick={() => props.onChange(opt.value)}
              style={{
                padding: "8px 16px",
                border: "none",
                "border-right": "1px solid var(--w-border-input)",
                background: active() ? "var(--w-btn-bg)" : "transparent",
                color: active() ? "var(--w-btn-text)" : "var(--w-text-tertiary)",
                "font-size": "13px",
                "font-weight": active() ? 600 : 400,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}

function FontOption(props) {
  const active = () => getFont() === props.fontKey;

  return (
    <button
      onClick={() => setFont(props.fontKey)}
      style={{
        padding: "10px 16px",
        "border-radius": "8px",
        border: active() ? "2px solid var(--w-accent)" : "2px solid var(--w-border-input)",
        background: "transparent",
        color: "var(--w-text-secondary)",
        "font-size": "14px",
        "font-family": props.fontStack,
        cursor: "pointer",
        transition: "border-color 0.15s",
        "white-space": "nowrap",
      }}
    >
      {fontLabels[props.fontKey]}
    </button>
  );
}

export default function Interface() {
  const themeList = () => Object.keys(themes);
  const fontList = () => Object.entries(fonts);
  const sizeList = () => Object.keys(fontSizes);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Interface</h2>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Theme</h3>
        <div style={styles.themeRow}>
          <For each={themeList()}>
            {(name) => <ThemeCard name={name} />}
          </For>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Mode</h3>
        <SegmentedControl
          value={getMode}
          onChange={setMode}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Font</h3>
        <div style={styles.fontRow}>
          <For each={fontList()}>
            {([key, stack]) => <FontOption fontKey={key} fontStack={stack} />}
          </For>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Font Size</h3>
        <SegmentedControl
          value={getFontSize}
          onChange={setFontSize}
          options={sizeList().map((s) => ({ value: s, label: sizeLabels[s] }))}
        />
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
  themeRow: {
    display: "flex",
    gap: "10px",
    "flex-wrap": "wrap",
  },
  fontRow: {
    display: "flex",
    gap: "8px",
    "flex-wrap": "wrap",
  },
};
