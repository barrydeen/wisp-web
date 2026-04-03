import { createSignal, For, Show, onCleanup, createMemo, createEffect } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { createSubscription } from "../lib/pool";
import { getLoginState } from "../lib/identity";
import { getFollowFeedEvents, getFollowFeedState } from "../lib/outbox";
import { NoteCard } from "../components/NoteCard";
import { getLiveStreams, initStreamDiscovery, cleanupStreamDiscovery } from "../lib/streams";
import { getProfile } from "../lib/profiles";
import { avatarColor, npubShort } from "../lib/utils";
import { getRelaySets, getRelayList } from "../lib/relays";
import { subscribeEngagement, clearEngagement } from "../lib/engagement";

function ProgressStep(props) {
  const icon = createMemo(() => {
    if (props.done) return "\u2713";
    if (props.active) return "\u25CF";
    return "\u25CB";
  });

  const color = createMemo(() => {
    if (props.done) return "var(--w-success)";
    if (props.active) return "var(--w-text-primary)";
    return "var(--w-text-muted)";
  });

  return (
    <div style={{ display: "flex", "align-items": "center", gap: "10px", padding: "6px 0" }}>
      <span style={{
        "font-size": "12px",
        width: "16px",
        "text-align": "center",
        color: color(),
        "flex-shrink": 0,
      }}>
        {icon()}
      </span>
      <span style={{
        "font-size": "14px",
        color: color(),
        flex: 1,
      }}>
        {props.label}
      </span>
      <Show when={props.detail}>
        <span style={{ "font-size": "13px", color: "var(--w-text-muted)" }}>{props.detail}</span>
      </Show>
    </div>
  );
}

function LoadingProgress() {
  const state = createMemo(() => getFollowFeedState());
  const phase = createMemo(() => state().phase);

  const phaseOrder = ["loading-follows", "loading-relays", "loading-notes"];

  const isDone = (p) => {
    const current = phaseOrder.indexOf(phase());
    const target = phaseOrder.indexOf(p);
    return target >= 0 && current > target;
  };

  const followDetail = createMemo(() => {
    const s = state();
    if (s.followCount) return `${s.followCount} follows`;
    return null;
  });

  const relayDetail = createMemo(() => {
    const s = state();
    if (s.relayListsFound) return `${s.relayListsFound}/${s.followCount} found`;
    return null;
  });

  const noteDetail = createMemo(() => {
    const s = state();
    if (s.relayCount) return `${s.relayCount} relays`;
    return null;
  });

  return (
    <div style={progressStyles.container}>
      <p style={progressStyles.title}>Loading your feed</p>
      <div style={progressStyles.steps}>
        <ProgressStep
          label="Fetch follow list"
          active={phase() === "loading-follows"}
          done={isDone("loading-follows")}
          detail={followDetail()}
        />
        <ProgressStep
          label="Fetch relay lists"
          active={phase() === "loading-relays"}
          done={isDone("loading-relays")}
          detail={relayDetail()}
        />
        <ProgressStep
          label="Fetch notes"
          active={phase() === "loading-notes"}
          done={isDone("loading-notes")}
          detail={noteDetail()}
        />
      </div>
    </div>
  );
}

const progressStyles = {
  container: {
    padding: "48px 20px",
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
  },
  title: {
    "font-size": "15px",
    color: "var(--w-text-tertiary)",
    "margin-bottom": "20px",
  },
  steps: {
    width: "260px",
  },
};

function FeedTypeSelector(props) {
  const [open, setOpen] = createSignal(false);
  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  const options = createMemo(() => {
    const list = [];
    if (loggedIn()) list.push({ value: "following", label: "Following" });
    list.push({ value: "global", label: "Global" });
    list.push({ value: "relay", label: "Relay" });
    return list;
  });

  const currentLabel = createMemo(() =>
    options().find(o => o.value === props.value)?.label || props.value
  );

  function select(value) {
    setOpen(false);
    props.onChange(value);
  }

  // Close on click outside
  let ref;
  createEffect(() => {
    if (!open()) return;
    function handler(e) {
      if (ref && !ref.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", handler, true);
    onCleanup(() => document.removeEventListener("click", handler, true));
  });

  return (
    <div ref={el => ref = el} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open())} style={selectorStyles.button}>
        {currentLabel()}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Show when={open()}>
        <div style={selectorStyles.menu}>
          <For each={options()}>
            {(opt) => (
              <button
                onClick={() => select(opt.value)}
                style={{
                  ...selectorStyles.menuItem,
                  color: opt.value === props.value ? "var(--w-text-primary)" : "var(--w-text-tertiary)",
                  "font-weight": opt.value === props.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function RelayPicker(props) {
  const [inputValue, setInputValue] = createSignal("");
  const loggedIn = createMemo(() => getLoginState() === "logged-in");
  const sets = createMemo(() => getRelaySets());
  const relayList = createMemo(() => getRelayList());
  const [expandedSet, setExpandedSet] = createSignal(null);

  function connectToRelay(url) {
    let normalized = url.trim();
    if (!normalized) return;
    if (!normalized.startsWith("wss://") && !normalized.startsWith("ws://")) {
      normalized = "wss://" + normalized;
    }
    props.onSelect(normalized);
  }

  function handleSubmit(e) {
    e.preventDefault();
    connectToRelay(inputValue());
    setInputValue("");
  }

  // Fallback: show relays from kind 10002 if no relay sets
  const fallbackRelays = createMemo(() => {
    if (sets().length > 0) return [];
    if (!loggedIn()) return [];
    return relayList().map(e => e.url);
  });

  return (
    <div style={relayPickerStyles.container}>
      <form onSubmit={handleSubmit} style={relayPickerStyles.form}>
        <input
          type="text"
          placeholder="wss://relay.example.com"
          value={inputValue()}
          onInput={(e) => setInputValue(e.target.value)}
          style={relayPickerStyles.input}
        />
        <button type="submit" style={relayPickerStyles.goBtn}>Go</button>
      </form>

      <Show when={sets().length > 0}>
        <div style={relayPickerStyles.section}>
          <span style={relayPickerStyles.sectionLabel}>Relay sets</span>
          <div style={relayPickerStyles.pills}>
            <For each={sets()}>
              {(set) => (
                <div>
                  <button
                    onClick={() => setExpandedSet(expandedSet() === set.name ? null : set.name)}
                    style={{
                      ...relayPickerStyles.pill,
                      background: expandedSet() === set.name ? "var(--w-bg-hover)" : "var(--w-bg-secondary)",
                    }}
                  >
                    {set.name || "unnamed"}
                  </button>
                  <Show when={expandedSet() === set.name}>
                    <div style={relayPickerStyles.setRelays}>
                      <For each={set.relays}>
                        {(url) => (
                          <button
                            onClick={() => connectToRelay(url)}
                            style={relayPickerStyles.relayBtn}
                          >
                            {url.replace("wss://", "")}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={fallbackRelays().length > 0}>
        <div style={relayPickerStyles.section}>
          <span style={relayPickerStyles.sectionLabel}>Your relays</span>
          <div style={relayPickerStyles.pills}>
            <For each={fallbackRelays()}>
              {(url) => (
                <button
                  onClick={() => connectToRelay(url)}
                  style={relayPickerStyles.pill}
                >
                  {url.replace("wss://", "")}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default function Feed() {
  const params = useParams();
  const navigate = useNavigate();
  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  const [selectedRelay, setSelectedRelay] = createSignal(
    params.relayHost ? `wss://${params.relayHost}` : null
  );

  // Sync route param changes to selectedRelay
  createEffect(() => {
    if (params.relayHost) {
      setSelectedRelay(`wss://${params.relayHost}`);
    }
  });

  // Track if user explicitly chose relay mode without a relay selected yet
  const [relayModeActive, setRelayModeActive] = createSignal(false);

  function handleFeedTypeChangeWrapped(type) {
    if (type === "relay") {
      setRelayModeActive(true);
      const relay = selectedRelay();
      if (relay) {
        navigate(`/relay/${relay.replace("wss://", "").replace("ws://", "")}`);
      }
    } else {
      setRelayModeActive(false);
      setSelectedRelay(null);
      navigate("/");
    }
  }

  const effectiveFeedType = createMemo(() => {
    if (params.relayHost) return "relay";
    if (relayModeActive()) return "relay";
    return loggedIn() ? "following" : "global";
  });

  function handleRelaySelect(url) {
    setSelectedRelay(url);
    const host = url.replace("wss://", "").replace("ws://", "");
    navigate(`/relay/${host}`);
  }

  // Global feed — only active in global mode
  const globalSub = createMemo((prev) => {
    if (effectiveFeedType() !== "global") {
      prev?.cleanup();
      return null;
    }
    return createSubscription({ kinds: [1], limit: 50 });
  }, null);

  // Relay feed — only active in relay mode with a selected relay
  const relaySub = createMemo((prev) => {
    prev?.cleanup();
    if (effectiveFeedType() !== "relay") return null;
    const url = selectedRelay();
    if (!url) return null;
    return createSubscription({ kinds: [1], limit: 50 }, { relays: [url] });
  }, null);

  onCleanup(() => {
    globalSub()?.cleanup();
    relaySub()?.cleanup();
    clearEngagement();
  });

  // Clear engagement when feed type changes
  createEffect(() => {
    effectiveFeedType();
    clearEngagement();
  });

  // Viewport-based engagement batching (300ms debounce)
  let visibleBatch = [];
  let engageBatchTimeout = null;

  function handleNoteVisible(note) {
    visibleBatch.push(note);
    if (!engageBatchTimeout) {
      engageBatchTimeout = setTimeout(() => {
        const batch = visibleBatch;
        visibleBatch = [];
        engageBatchTimeout = null;
        subscribeEngagement(batch);
      }, 300);
    }
  }

  const events = createMemo(() => {
    const type = effectiveFeedType();
    if (type === "following") return getFollowFeedEvents();
    if (type === "relay") return relaySub()?.events() || [];
    return globalSub()?.events() || [];
  });

  const showProgress = createMemo(() => {
    if (effectiveFeedType() !== "following") return false;
    const phase = getFollowFeedState().phase;
    return events().length === 0 && phase !== "ready" && phase !== "idle";
  });

  const showEmpty = createMemo(() => {
    const type = effectiveFeedType();
    if (type === "following") {
      const state = getFollowFeedState();
      return events().length === 0 && state.phase === "ready";
    }
    if (type === "relay") {
      return selectedRelay() && events().length === 0;
    }
    return events().length === 0;
  });

  const emptyMessage = createMemo(() => {
    const type = effectiveFeedType();
    if (type === "following") {
      const state = getFollowFeedState();
      if (state.followCount === 0) return "You're not following anyone yet.";
      return "No notes found.";
    }
    if (type === "relay") return "No notes found. The relay may be unavailable.";
    return "Connecting to relays...";
  });

  const showRelayPicker = createMemo(() =>
    effectiveFeedType() === "relay" && !selectedRelay()
  );

  const relayDisplayName = createMemo(() => {
    const url = selectedRelay();
    if (!url) return null;
    return url.replace("wss://", "").replace("ws://", "");
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <FeedTypeSelector value={effectiveFeedType()} onChange={handleFeedTypeChangeWrapped} />
        <Show when={effectiveFeedType() === "relay" && relayDisplayName()}>
          <span style={styles.relayName}>{relayDisplayName()}</span>
        </Show>
        <span style={styles.count}>{events().length} notes</span>
      </div>
      <Show when={effectiveFeedType() !== "relay"}>
        <LiveStreamBar />
      </Show>
      <Show when={showRelayPicker()}>
        <RelayPicker onSelect={handleRelaySelect} />
      </Show>
      <Show when={showProgress()}>
        <LoadingProgress />
      </Show>
      <Show when={showEmpty()}>
        <p style={styles.empty}>{emptyMessage()}</p>
      </Show>
      <For each={events()}>
        {(note) => <NoteCard note={note} onVisible={handleNoteVisible} />}
      </For>
    </div>
  );
}

function LiveStreamBar() {
  const navigate = useNavigate();

  createEffect(() => {
    initStreamDiscovery();
  });
  onCleanup(cleanupStreamDiscovery);

  const streams = createMemo(() => getLiveStreams());

  function openStream(stream) {
    try {
      const naddr = nip19.naddrEncode({
        kind: 30311,
        pubkey: stream.pubkey,
        identifier: stream.dTag,
        relays: stream.relayHints.slice(0, 3),
      });
      navigate(`/streams/${naddr}`);
    } catch {}
  }

  return (
    <Show when={streams().length > 0}>
      <div style={pillStyles.bar}>
        <span style={pillStyles.liveLabel}>LIVE</span>
        <For each={streams()}>
          {(stream) => <StreamPill stream={stream} onClick={() => openStream(stream)} />}
        </For>
      </div>
    </Show>
  );
}

function StreamPill(props) {
  const profile = createMemo(() => getProfile(props.stream.streamerPubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.stream.streamerPubkey);
  });
  const avatar = createMemo(() => profile()?.picture);
  const color = createMemo(() => avatarColor(props.stream.streamerPubkey));
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      style={{
        ...pillStyles.pill,
        background: hovered() ? "var(--w-bg-hover)" : "var(--w-bg-secondary)",
      }}
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {avatar() ? (
        <img src={avatar()} style={pillStyles.pillAvatar} loading="lazy" />
      ) : (
        <div style={{ ...pillStyles.pillAvatarFallback, "background-color": color() }}>
          {props.stream.streamerPubkey.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span style={pillStyles.pillName}>{props.stream.title || name()}</span>
    </button>
  );
}

const pillStyles = {
  bar: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "overflow-x": "auto",
    "white-space": "nowrap",
    "flex-shrink": 0,
  },
  liveLabel: {
    display: "inline-block",
    padding: "4px 10px",
    "border-radius": "6px",
    "font-size": "11px",
    "font-weight": 700,
    "letter-spacing": "0.5px",
    background: "#e53e3e",
    color: "#fff",
    "flex-shrink": 0,
  },
  pill: {
    display: "inline-flex",
    "align-items": "center",
    gap: "8px",
    padding: "4px 14px 4px 4px",
    "border-radius": "24px",
    border: "1px solid var(--w-border)",
    cursor: "pointer",
    transition: "background 0.1s",
    "flex-shrink": 0,
  },
  pillAvatar: {
    width: "28px",
    height: "28px",
    "border-radius": "50%",
    "object-fit": "cover",
  },
  pillAvatarFallback: {
    width: "28px",
    height: "28px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "10px",
    "font-weight": 700,
    color: "#fff",
  },
  pillName: {
    "font-size": "13px",
    "font-weight": 500,
    color: "var(--w-text-secondary)",
    "max-width": "150px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
  },
};

const selectorStyles = {
  button: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    padding: "6px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border)",
    background: "transparent",
    color: "var(--w-text-primary)",
    "font-size": "16px",
    "font-weight": 700,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  menu: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    "min-width": "150px",
    background: "var(--w-bg-secondary)",
    border: "1px solid var(--w-border)",
    "border-radius": "10px",
    padding: "4px",
    "z-index": 20,
    "box-shadow": "0 4px 12px rgba(0,0,0,0.15)",
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    border: "none",
    background: "transparent",
    "border-radius": "6px",
    "font-size": "14px",
    cursor: "pointer",
    "text-align": "left",
    transition: "background 0.1s",
  },
};

const relayPickerStyles = {
  container: {
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  form: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    outline: "none",
  },
  goBtn: {
    padding: "8px 16px",
    "border-radius": "8px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
  },
  section: {
    "margin-top": "12px",
  },
  sectionLabel: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "text-transform": "uppercase",
    "letter-spacing": "0.5px",
    "margin-bottom": "8px",
    display: "block",
  },
  pills: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "6px",
  },
  pill: {
    padding: "6px 14px",
    "border-radius": "20px",
    border: "1px solid var(--w-border)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  setRelays: {
    display: "flex",
    "flex-direction": "column",
    gap: "2px",
    "margin-top": "4px",
    "margin-bottom": "4px",
    "padding-left": "8px",
  },
  relayBtn: {
    padding: "4px 10px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-tertiary)",
    "font-size": "13px",
    cursor: "pointer",
    "text-align": "left",
    "border-radius": "4px",
    transition: "background 0.1s, color 0.1s",
  },
};

const styles = {
  container: {
    "max-width": "650px",
  },
  header: {
    padding: "20px 20px 16px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    display: "flex",
    "align-items": "center",
    gap: "12px",
    position: "sticky",
    top: 0,
    "background-color": "var(--w-bg-overlay)",
    "backdrop-filter": "blur(12px)",
    "z-index": 5,
  },
  relayName: {
    "font-size": "14px",
    color: "var(--w-text-tertiary)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  count: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-left": "auto",
    "flex-shrink": 0,
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
};
