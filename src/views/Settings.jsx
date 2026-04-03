import { For, Show, createSignal, createMemo } from "solid-js";
import {
  getTheme, setTheme,
  getMode, setMode,
  getFont, setFont,
  getFontSize, setFontSize,
  themes, fonts, fontSizes,
  getBlossomServers, addBlossomServer, removeBlossomServer,
  getPowEnabled, setPowEnabled,
  getPowDifficulty, setPowDifficulty,
  getIncludeClientTag, setIncludeClientTag,
} from "../lib/settings";
import { publishBlossomServerList } from "../lib/blossom";
import { getLoginState } from "../lib/identity";
import {
  getRelayList, getDmRelayList, getSearchRelay, getMajorRelays,
  isRelayListLoaded,
  addRelay, removeRelay, toggleRelayRead, toggleRelayWrite,
  addDmRelay, removeDmRelay,
  setSearchRelayUrl,
  addMajorRelay, removeMajorRelay, resetMajorRelays,
  publishRelayList, publishDmRelayList,
} from "../lib/relays";

const themeList = Object.keys(themes);
const fontList = Object.entries(fonts);
const sizeList = Object.keys(fontSizes);

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
  const active = createMemo(() => getTheme() === props.name);
  const colors = createMemo(() => themes[props.name][getMode()]);

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
        border: active() ? `2px solid var(--w-accent)` : "2px solid var(--w-border-input)",
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
          const active = createMemo(() => props.value() === opt.value);
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
  const active = createMemo(() => getFont() === props.fontKey);

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

// --- Relay UI components ---

function RelayRow(props) {
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

function RelayAddForm(props) {
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

function PublishButton(props) {
  const [status, setStatus] = createSignal("idle");

  async function handlePublish() {
    setStatus("publishing");
    try {
      await props.onPublish();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      console.error("Publish failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const label = () => {
    switch (status()) {
      case "publishing": return "Publishing...";
      case "done": return "Published!";
      case "error": return "Failed";
      default: return props.label || "Publish";
    }
  };

  return (
    <button
      onClick={handlePublish}
      disabled={status() === "publishing"}
      style={{
        ...styles.publishBtn,
        opacity: status() === "publishing" ? 0.6 : 1,
        background: status() === "done" ? "var(--w-success)"
          : status() === "error" ? "var(--w-error)"
          : "var(--w-accent)",
      }}
    >
      {label()}
    </button>
  );
}

function RelayListSection() {
  const relays = createMemo(() => getRelayList());

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Inbox / Outbox Relays</h3>
      <p style={styles.relayDescription}>
        Relays you read from (inbox) and write to (outbox). Published as a kind 10002 event.
      </p>
      <Show when={relays().length > 0}>
        <div style={styles.relayListContainer}>
          <For each={relays()}>
            {(entry) => (
              <RelayRow
                url={entry.url}
                read={entry.read}
                write={entry.write}
                showToggles={true}
                onToggleRead={() => toggleRelayRead(entry.url)}
                onToggleWrite={() => toggleRelayWrite(entry.url)}
                onRemove={() => removeRelay(entry.url)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={relays().length === 0}>
        <p style={styles.emptyText}>No relays configured. Add relays below.</p>
      </Show>
      <RelayAddForm onAdd={(url) => addRelay(url, true, true)} />
      <PublishButton onPublish={publishRelayList} label="Publish Relay List" />
    </div>
  );
}

function DmRelaySection() {
  const relays = createMemo(() => getDmRelayList());

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>DM Relays</h3>
      <p style={styles.relayDescription}>
        Relays where you receive private messages. Published as a kind 10050 event.
      </p>
      <Show when={relays().length > 0}>
        <div style={styles.relayListContainer}>
          <For each={relays()}>
            {(url) => (
              <RelayRow
                url={url}
                showToggles={false}
                onRemove={() => removeDmRelay(url)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={relays().length === 0}>
        <p style={styles.emptyText}>No DM relays configured. Add relays below.</p>
      </Show>
      <RelayAddForm onAdd={addDmRelay} />
      <PublishButton onPublish={publishDmRelayList} label="Publish DM Relays" />
    </div>
  );
}

function SearchRelaySection() {
  const [value, setValue] = createSignal(getSearchRelay());

  function handleSave() {
    let url = value().trim();
    if (url && !url.startsWith("wss://") && !url.startsWith("ws://")) {
      url = "wss://" + url;
    }
    setSearchRelayUrl(url);
  }

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Search Relay</h3>
      <p style={styles.relayDescription}>
        NIP-50 relay for full-text search. Saved locally.
      </p>
      <input
        type="text"
        placeholder="wss://relay.nostr.band"
        aria-label="Search relay URL"
        value={value()}
        onInput={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
        style={{ ...styles.relayInput, "max-width": "400px" }}
      />
    </div>
  );
}

function MajorRelaysSection() {
  const relays = createMemo(() => getMajorRelays());

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Major Relays</h3>
      <p style={styles.relayDescription}>
        Well-known relays where relay lists are broadcast for discoverability by other clients. Saved locally.
      </p>
      <Show when={relays().length > 0}>
        <div style={styles.relayListContainer}>
          <For each={relays()}>
            {(url) => (
              <RelayRow
                url={url}
                showToggles={false}
                onRemove={() => removeMajorRelay(url)}
              />
            )}
          </For>
        </div>
      </Show>
      <RelayAddForm onAdd={addMajorRelay} />
      <button onClick={resetMajorRelays} style={styles.resetLink}>
        Reset to defaults
      </button>
    </div>
  );
}

function BlossomServersSection() {
  const servers = createMemo(() => getBlossomServers());

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Blossom Servers</h3>
      <p style={styles.relayDescription}>
        Servers for uploading media (images, video). Used for gallery notes and attachments. First server in the list is tried first.
      </p>
      <Show when={servers().length > 0}>
        <div style={styles.relayListContainer}>
          <For each={servers()}>
            {(url) => (
              <RelayRow
                url={url}
                showToggles={false}
                onRemove={() => removeBlossomServer(url)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={servers().length === 0}>
        <p style={styles.emptyText}>No blossom servers configured. The default (blossom.primal.net) will be used.</p>
      </Show>
      <RelayAddForm onAdd={(url) => {
        let normalized = url.trim();
        if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
          normalized = "https://" + normalized;
        }
        addBlossomServer(normalized);
      }} />
      <PublishButton onPublish={publishBlossomServerList} label="Publish Server List" />
    </div>
  );
}

function PowSettingsSection() {
  const enabled = () => getPowEnabled();
  const difficulty = () => getPowDifficulty();

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Proof of Work</h3>
      <p style={styles.relayDescription}>
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
  );
}

function ClientTagSection() {
  const enabled = () => getIncludeClientTag();

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Client Tag</h3>
      <p style={styles.relayDescription}>
        Include a tag identifying Wisp Web on published events. Other users may see which client you used.
      </p>
      <label style={styles.powToggle}>
        <input
          type="checkbox"
          checked={enabled()}
          onChange={(e) => setIncludeClientTag(e.target.checked)}
        />
        <span style={{ "font-size": "13px", color: "var(--w-text-secondary)" }}>
          Include client tag on events
        </span>
      </label>
    </div>
  );
}

// --- Main component ---

export default function Settings() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
      </div>

      {/* Appearance */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Theme</h3>
        <div style={styles.themeRow}>
          <For each={themeList}>
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

      {/* Typography */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Font</h3>
        <div style={styles.fontRow}>
          <For each={fontList}>
            {([key, stack]) => <FontOption fontKey={key} fontStack={stack} />}
          </For>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Font Size</h3>
        <SegmentedControl
          value={getFontSize}
          onChange={setFontSize}
          options={sizeList.map((s) => ({ value: s, label: sizeLabels[s] }))}
        />
      </div>

      {/* Relay Management - only when logged in */}
      <Show when={getLoginState() === "logged-in"}>
        <Show when={isRelayListLoaded()} fallback={
          <div style={styles.section}>
            <p style={styles.loadingText}>Loading relay lists...</p>
          </div>
        }>
          <RelayListSection />
          <DmRelaySection />
          <SearchRelaySection />
          <MajorRelaysSection />
          <BlossomServersSection />
          <PowSettingsSection />
          <ClientTagSection />
        </Show>
      </Show>
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
  relayDescription: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-bottom": "12px",
    "line-height": "1.4",
  },
  relayListContainer: {
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    overflow: "hidden",
    "margin-bottom": "12px",
  },
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
  publishBtn: {
    padding: "8px 16px",
    "border-radius": "8px",
    border: "none",
    "background-color": "var(--w-accent)",
    color: "var(--w-btn-text)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
    transition: "background 0.15s, opacity 0.15s",
  },
  emptyText: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-bottom": "12px",
    "font-style": "italic",
  },
  loadingText: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
  },
  resetLink: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "12px",
    cursor: "pointer",
    "text-decoration": "underline",
    "margin-top": "4px",
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
