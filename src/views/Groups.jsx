import { createSignal, createMemo, createEffect, For, Show, onCleanup } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { createSubscription } from "../lib/pool";
import { getProfile } from "../lib/profiles";
import { getPubkey, getLoginState } from "../lib/identity";
import { formatTime, npubShort, avatarColor } from "../lib/utils";
import {
  parseGroupCode,
  encodeGroupReference,
  normalizeURL,
  sendGroupMessage,
  sendJoinRequest,
  sendLeaveRequest,
  sendCreateGroup,
  loadUserGroups,
  addToGroupList,
  removeFromGroupList,
  parseMetadata,
} from "../lib/groups";

export default function Groups() {
  const params = useParams();

  return (
    <Show when={params.groupCode} fallback={<GroupList />}>
      <GroupView groupCode={params.groupCode} />
    </Show>
  );
}

// --- Group List (discovery + user's groups) ---

function GroupList() {
  const navigate = useNavigate();
  const [userGroups, setUserGroups] = createSignal([]);
  const [inviteCode, setInviteCode] = createSignal("");
  const [relayInput, setRelayInput] = createSignal("");
  const [browseRelay, setBrowseRelay] = createSignal(null);
  const [showCreate, setShowCreate] = createSignal(false);

  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  // Load user's joined groups on login
  createEffect(() => {
    if (getPubkey()) {
      loadUserGroups().then(setUserGroups).catch(() => {});
    }
  });

  function handleInvite(e) {
    e.preventDefault();
    const code = inviteCode().trim();
    if (!code) return;
    navigate(`/groups/${code}`);
  }

  function handleBrowse(relayUrl) {
    const url = relayUrl || relayInput().trim();
    if (!url) return;
    try {
      const normalized = normalizeURL(url);
      setBrowseRelay(normalized);
    } catch {
      // invalid URL
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Groups</h2>
      </div>

      {/* Join by invite link */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Join a Group</h3>
        <form onSubmit={handleInvite} style={styles.inputRow}>
          <input
            type="text"
            placeholder="relay.com'group_id"
            value={inviteCode()}
            onInput={(e) => setInviteCode(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.btn}>Go</button>
        </form>
      </div>

      {/* User's groups */}
      <Show when={loggedIn() && userGroups().length > 0}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Your Groups</h3>
          <For each={userGroups()}>
            {(g) => {
              const code = encodeGroupReference({ host: g.relay, id: g.id });
              return (
                <a href={`/groups/${code}`} style={styles.groupCard}>
                  <span style={styles.groupName}>{g.id}</span>
                  <span style={styles.groupRelay}>{g.relay}</span>
                </a>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Create group */}
      <Show when={loggedIn()}>
        <div style={styles.section}>
          <button onClick={() => setShowCreate(!showCreate())} style={styles.btnOutline}>
            {showCreate() ? "Cancel" : "Create Group"}
          </button>
          <Show when={showCreate()}>
            <CreateGroupForm />
          </Show>
        </div>
      </Show>

      {/* Discover groups on a relay */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Discover Groups</h3>
        <div style={styles.inputRow}>
          <input
            type="text"
            placeholder="wss://relay.example.com"
            value={relayInput()}
            onInput={(e) => setRelayInput(e.target.value)}
            style={styles.input}
          />
          <button onClick={() => handleBrowse()} style={styles.btn}>Browse</button>
        </div>
        <div style={styles.quickRelays}>
          <button onClick={() => handleBrowse("wss://groups.fiatjaf.com")} style={styles.relayTag}>
            groups.fiatjaf.com
          </button>
          <button onClick={() => handleBrowse("wss://relay.groups.nip29.com")} style={styles.relayTag}>
            relay.groups.nip29.com
          </button>
        </div>
        <Show when={browseRelay()}>
          <RelayGroupBrowser relayUrl={browseRelay()} />
        </Show>
      </div>
    </div>
  );
}

function RelayGroupBrowser(props) {
  const { events, cleanup } = createSubscription(
    { kinds: [39000], limit: 50 },
    { relays: [props.relayUrl] },
  );
  onCleanup(cleanup);

  const groups = createMemo(() =>
    events().map((e) => {
      const dTag = e.tags.find((t) => t[0] === "d");
      const nameTag = e.tags.find((t) => t[0] === "name");
      const aboutTag = e.tags.find((t) => t[0] === "about");
      const pictureTag = e.tags.find((t) => t[0] === "picture");
      const isOpen = e.tags.some((t) => t[0] === "open");
      const isPublic = e.tags.some((t) => t[0] === "public");

      const host = props.relayUrl.replace(/^wss?:\/\//, "");
      const code = `${host}'${dTag?.[1] || ""}`;

      return {
        id: dTag?.[1] || "",
        name: nameTag?.[1] || dTag?.[1] || "Unnamed",
        about: aboutTag?.[1] || "",
        picture: pictureTag?.[1],
        isOpen,
        isPublic,
        code,
      };
    }),
  );

  return (
    <div style={{ "margin-top": "12px" }}>
      <Show
        when={groups().length > 0}
        fallback={<p style={styles.empty}>Searching for groups...</p>}
      >
        <For each={groups()}>
          {(g) => (
            <a href={`/groups/${g.code}`} style={styles.groupCard}>
              <div style={styles.groupCardTop}>
                <Show when={g.picture}>
                  <img src={g.picture} style={styles.groupPic} loading="lazy" />
                </Show>
                <div>
                  <span style={styles.groupName}>{g.name}</span>
                  <div style={styles.groupFlags}>
                    <Show when={g.isPublic}>
                      <span style={styles.flag}>public</span>
                    </Show>
                    <Show when={g.isOpen}>
                      <span style={styles.flag}>open</span>
                    </Show>
                  </div>
                </div>
              </div>
              <Show when={g.about}>
                <span style={styles.groupAbout}>{g.about}</span>
              </Show>
            </a>
          )}
        </For>
      </Show>
    </div>
  );
}

// --- Create Group Form ---

function CreateGroupForm() {
  const [relay, setRelay] = createSignal("");
  const [name, setName] = createSignal("");
  const [about, setAbout] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const navigate = useNavigate();

  async function handleCreate(e) {
    e.preventDefault();
    const relayUrl = relay().trim();
    if (!relayUrl || !name().trim()) return;

    setSending(true);
    try {
      const normalized = normalizeURL(relayUrl);
      const groupId = await sendCreateGroup(normalized, name().trim(), about().trim());
      const host = normalized.replace(/^wss?:\/\//, "");
      await addToGroupList(groupId, normalized);
      navigate(`/groups/${host}'${groupId}`);
    } catch (err) {
      console.error("Create group failed:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleCreate} style={styles.createForm}>
      <input
        type="text"
        placeholder="wss://relay.example.com"
        value={relay()}
        onInput={(e) => setRelay(e.target.value)}
        style={styles.input}
      />
      <input
        type="text"
        placeholder="Group name"
        value={name()}
        onInput={(e) => setName(e.target.value)}
        style={styles.input}
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={about()}
        onInput={(e) => setAbout(e.target.value)}
        style={styles.input}
      />
      <button type="submit" disabled={sending()} style={styles.btn}>
        {sending() ? "Creating..." : "Create"}
      </button>
    </form>
  );
}

// --- Group View (chat room) ---

function GroupView(props) {
  const parsed = createMemo(() => parseGroupCode(props.groupCode));
  const relayUrl = createMemo(() => {
    const p = parsed();
    if (!p) return null;
    try {
      return normalizeURL(p.host);
    } catch {
      return null;
    }
  });
  const groupId = createMemo(() => parsed()?.id);

  return (
    <Show when={relayUrl() && groupId()} fallback={
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Invalid Group</h2>
        </div>
        <p style={styles.empty}>Could not parse group code: {props.groupCode}</p>
      </div>
    }>
      <GroupRoom relayUrl={relayUrl()} groupId={groupId()} groupCode={props.groupCode} />
    </Show>
  );
}

function GroupRoom(props) {
  const [msgInput, setMsgInput] = createSignal("");
  const [sending, setSending] = createSignal(false);

  const loggedIn = createMemo(() => getLoginState() === "logged-in");
  const myPubkey = createMemo(() => getPubkey());

  // Subscribe to messages
  const { events: msgEvents, cleanup: msgCleanup } = createSubscription(
    { kinds: [9], "#h": [props.groupId], limit: 200 },
    { relays: [props.relayUrl] },
  );
  onCleanup(msgCleanup);

  // Subscribe to metadata
  const { events: metaEvents, cleanup: metaCleanup } = createSubscription(
    { kinds: [39000, 39001, 39002], "#d": [props.groupId] },
    { relays: [props.relayUrl] },
  );
  onCleanup(metaCleanup);

  const groupInfo = createMemo(() => parseMetadata(metaEvents()));
  const groupName = createMemo(() => groupInfo().metadata?.name || props.groupId);
  const groupAbout = createMemo(() => groupInfo().metadata?.about || "");
  const groupPicture = createMemo(() => groupInfo().metadata?.picture);
  const memberCount = createMemo(() => groupInfo().members.length);
  const isMember = createMemo(() => {
    const pk = myPubkey();
    if (!pk) return false;
    return groupInfo().members.some((m) => m.pubkey === pk) ||
           groupInfo().admins.some((a) => a.pubkey === pk);
  });

  // Reverse so oldest at top
  const messages = createMemo(() => [...msgEvents()].reverse());

  async function handleSend(e) {
    e.preventDefault();
    const content = msgInput().trim();
    if (!content) return;

    setSending(true);
    try {
      await sendGroupMessage(props.relayUrl, props.groupId, content);
      setMsgInput("");
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleJoin() {
    try {
      await sendJoinRequest(props.relayUrl, props.groupId);
      await addToGroupList(props.groupId, props.relayUrl);
    } catch (err) {
      console.error("Join failed:", err);
    }
  }

  async function handleLeave() {
    try {
      await sendLeaveRequest(props.relayUrl, props.groupId);
      await removeFromGroupList(props.groupId, props.relayUrl);
    } catch (err) {
      console.error("Leave failed:", err);
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.groupHeader}>
        <div style={styles.groupHeaderTop}>
          <div style={styles.groupHeaderInfo}>
            <Show when={groupPicture()}>
              <img src={groupPicture()} style={styles.groupHeaderPic} loading="lazy" />
            </Show>
            <div>
              <h2 style={styles.title}>{groupName()}</h2>
              <span style={styles.count}>
                {memberCount()} members · {messages().length} messages
              </span>
            </div>
          </div>
          <Show when={loggedIn()}>
            <Show
              when={isMember()}
              fallback={
                <button onClick={handleJoin} style={styles.btn}>Join</button>
              }
            >
              <button onClick={handleLeave} style={styles.btnOutline}>Leave</button>
            </Show>
          </Show>
        </div>
        <Show when={groupAbout()}>
          <p style={styles.groupHeaderAbout}>{groupAbout()}</p>
        </Show>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        <Show when={messages().length === 0}>
          <p style={styles.empty}>No messages yet</p>
        </Show>
        <For each={messages()}>
          {(msg) => <GroupMessage msg={msg} />}
        </For>
      </div>

      {/* Input */}
      <Show when={loggedIn()}>
        <form onSubmit={handleSend} style={styles.inputBar}>
          <input
            type="text"
            placeholder="Send a message..."
            value={msgInput()}
            onInput={(e) => setMsgInput(e.target.value)}
            disabled={sending()}
            style={styles.msgInput}
          />
          <button type="submit" disabled={sending() || !msgInput().trim()} style={styles.sendBtn}>
            Send
          </button>
        </form>
      </Show>
    </div>
  );
}

function GroupMessage(props) {
  const profile = createMemo(() => getProfile(props.msg.pubkey));
  const color = createMemo(() => avatarColor(props.msg.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.msg.pubkey);
  });

  return (
    <div style={styles.msg}>
      <div style={{ ...styles.msgDot, "background-color": color() }} />
      <div>
        <span style={styles.msgAuthor}>{name()}</span>
        <span style={styles.msgTime}>{formatTime(props.msg.created_at)}</span>
        <div style={styles.msgContent}>{props.msg.content}</div>
      </div>
    </div>
  );
}

// --- Styles ---

const styles = {
  container: {
    "max-width": "650px",
    display: "flex",
    "flex-direction": "column",
    height: "100vh",
  },
  header: {
    padding: "20px 20px 16px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
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
  count: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  section: {
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  sectionTitle: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-bottom": "10px",
    "text-transform": "uppercase",
    "letter-spacing": "0.04em",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    "border-radius": "6px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-tertiary)",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    outline: "none",
  },
  btn: {
    padding: "8px 16px",
    "border-radius": "6px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
    "white-space": "nowrap",
  },
  btnOutline: {
    padding: "8px 16px",
    "border-radius": "6px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
    "white-space": "nowrap",
  },
  quickRelays: {
    display: "flex",
    gap: "6px",
    "margin-top": "8px",
    "flex-wrap": "wrap",
  },
  relayTag: {
    padding: "4px 10px",
    "border-radius": "12px",
    border: "1px solid var(--w-border-subtle)",
    background: "transparent",
    color: "var(--w-text-tertiary)",
    "font-size": "12px",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },
  groupCard: {
    display: "block",
    padding: "12px 0",
    "border-bottom": "1px solid var(--w-border)",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  groupCardTop: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
  },
  groupPic: {
    width: "36px",
    height: "36px",
    "border-radius": "8px",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  groupName: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
  },
  groupRelay: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    display: "block",
    "margin-top": "2px",
  },
  groupAbout: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-top": "4px",
    display: "block",
  },
  groupFlags: {
    display: "flex",
    gap: "6px",
    "margin-top": "2px",
  },
  flag: {
    "font-size": "11px",
    color: "var(--w-text-muted)",
    padding: "1px 6px",
    "border-radius": "4px",
    border: "1px solid var(--w-border-subtle)",
  },
  createForm: {
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
    "margin-top": "10px",
  },
  // Group view styles
  groupHeader: {
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    position: "sticky",
    top: 0,
    "background-color": "var(--w-bg-overlay)",
    "backdrop-filter": "blur(12px)",
    "z-index": 5,
  },
  groupHeaderTop: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "12px",
  },
  groupHeaderInfo: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    "min-width": 0,
  },
  groupHeaderPic: {
    width: "42px",
    height: "42px",
    "border-radius": "10px",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  groupHeaderAbout: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "margin-top": "8px",
    "line-height": 1.4,
  },
  messages: {
    flex: 1,
    "overflow-y": "auto",
    padding: "8px 0",
  },
  msg: {
    display: "flex",
    gap: "10px",
    padding: "8px 20px",
    "align-items": "flex-start",
  },
  msgDot: {
    width: "8px",
    height: "8px",
    "border-radius": "50%",
    "margin-top": "6px",
    "flex-shrink": 0,
  },
  msgAuthor: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-right": "8px",
  },
  msgTime: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
  },
  msgContent: {
    "font-size": "14px",
    color: "var(--w-text-secondary)",
    "line-height": 1.45,
    "margin-top": "2px",
    "white-space": "pre-wrap",
    "word-break": "break-word",
  },
  inputBar: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px",
    "border-top": "1px solid var(--w-border-secondary)",
    "background-color": "var(--w-bg-overlay-heavy)",
    position: "sticky",
    bottom: 0,
  },
  msgInput: {
    flex: 1,
    padding: "10px 14px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-subtle)",
    background: "var(--w-bg-tertiary)",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
  },
};
