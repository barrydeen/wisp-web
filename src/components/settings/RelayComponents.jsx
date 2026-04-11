import { createSignal, Show } from "solid-js";

export function RelayRow(props) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <div
      style={styles.relayRow}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={styles.relayUrl} title={props.url}>{props.url}</span>
      <Show when={props.showToggles}>
        <label style={styles.relayCheckbox}>
          <input
            type="checkbox"
            checked={props.read}
            onChange={() => props.onToggleRead?.()}
          />
          Read
        </label>
        <label style={styles.relayCheckbox}>
          <input
            type="checkbox"
            checked={props.write}
            onChange={() => props.onToggleWrite?.()}
          />
          Write
        </label>
      </Show>
      <button
        onClick={() => props.onRemove()}
        style={{
          ...styles.relayRemoveBtn,
          color: hovered() ? "var(--w-text-secondary)" : "var(--w-text-muted)",
        }}
      >
        remove
      </button>
    </div>
  );
}

export function RelayAddForm(props) {
  const [value, setValue] = createSignal("");

  function handleAdd() {
    let url = value().trim();
    if (!url) return;
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      url = "wss://" + url;
    }
    props.onAdd(url);
    setValue("");
  }

  return (
    <div style={styles.relayAddRow}>
      <input
        type="text"
        placeholder="wss://relay.example.com"
        aria-label="Relay URL"
        value={value()}
        onInput={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        style={styles.relayInput}
      />
      <button onClick={handleAdd} style={styles.relayAddBtn}>Add</button>
    </div>
  );
}

const styles = {
  relayRow: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    padding: "10px 12px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  relayUrl: {
    flex: 1,
    color: "var(--w-text-secondary)",
    "font-family": "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    "font-size": "12px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  relayCheckbox: {
    display: "flex",
    "align-items": "center",
    gap: "4px",
    "font-size": "12px",
    color: "var(--w-text-tertiary)",
    cursor: "pointer",
    "flex-shrink": 0,
    "user-select": "none",
  },
  relayRemoveBtn: {
    padding: "4px 8px",
    border: "none",
    background: "transparent",
    "font-size": "12px",
    cursor: "pointer",
    "flex-shrink": 0,
    transition: "color 0.1s",
  },
  relayAddRow: {
    display: "flex",
    gap: "8px",
    "margin-bottom": "12px",
  },
  relayInput: {
    flex: 1,
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    outline: "none",
  },
  relayAddBtn: {
    padding: "8px 14px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    "flex-shrink": 0,
    transition: "background 0.1s",
  },
};
