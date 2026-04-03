import { createSignal, createMemo, For, Show, onCleanup } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { createSubscription, getRelays } from "../lib/pool";
import { getProfile, requestProfile } from "../lib/profiles";
import { npubShort, avatarColor } from "../lib/utils";
import { NoteCard } from "../components/NoteCard";
import { INDEXER_RELAYS } from "../lib/identity";
import { fetchCachedEvent } from "../lib/event-cache";

const TABS = ["Notes", "Replies", "Relays", "Groups", "Follows"];

function TabBar(props) {
  return (
    <div style={styles.tabBar}>
      <For each={TABS}>
        {(tab) => {
          const isActive = () => props.active() === tab;
          return (
            <button
              onClick={() => props.onChange(tab)}
              style={{
                ...styles.tab,
                color: isActive() ? "var(--w-text-primary)" : "var(--w-text-muted)",
                "border-bottom": isActive()
                  ? "2px solid var(--w-accent)"
                  : "2px solid transparent",
                "font-weight": isActive() ? 600 : 400,
              }}
            >
              {tab}
            </button>
          );
        }}
      </For>
    </div>
  );
}

function RelaysTab(props) {
  const [relays, setRelays] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  fetchCachedEvent(10002, props.pubkey, [...INDEXER_RELAYS, ...getRelays()])
    .then((latest) => {
      if (latest) {
        const entries = [];
        for (const tag of latest.tags) {
          if (tag[0] !== "r" || !tag[1]) continue;
          const marker = tag[2];
          entries.push({
            url: tag[1],
            read: !marker || marker === "read",
            write: !marker || marker === "write",
          });
        }
        setRelays(entries);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

  return (
    <Show when={!loading()} fallback={<p style={styles.emptyText}>Loading relays...</p>}>
      <Show when={relays().length > 0} fallback={<p style={styles.emptyText}>No relay list published</p>}>
        <div style={styles.relayList}>
          <For each={relays()}>
            {(entry) => (
              <div style={styles.relayRow}>
                <span style={styles.relayUrl}>{entry.url}</span>
                <Show when={entry.read && entry.write}>
                  <span style={styles.relayBadge}>read & write</span>
                </Show>
                <Show when={entry.read && !entry.write}>
                  <span style={styles.relayBadge}>read</span>
                </Show>
                <Show when={!entry.read && entry.write}>
                  <span style={styles.relayBadge}>write</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

function GroupsTab(props) {
  const [groups, setGroups] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  fetchCachedEvent(10009, props.pubkey, [...INDEXER_RELAYS, ...getRelays()])
    .then((latest) => {
      if (latest) {
        const parsed = latest.tags
          .filter((t) => t[0] === "group" && t[1] && t[2])
          .map((t) => ({ id: t[1], relay: t[2] }));
        setGroups(parsed);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

  return (
    <Show when={!loading()} fallback={<p style={styles.emptyText}>Loading groups...</p>}>
      <Show when={groups().length > 0} fallback={<p style={styles.emptyText}>No groups joined</p>}>
        <For each={groups()}>
          {(g) => {
            const host = g.relay.replace(/^wss?:\/\//, "");
            const code = `${host}'${g.id}`;
            return (
              <A href={`/groups/${code}`} style={styles.groupRow}>
                <span style={styles.groupId}>{g.id}</span>
                <span style={styles.groupRelay}>{g.relay}</span>
              </A>
            );
          }}
        </For>
      </Show>
    </Show>
  );
}

function FollowRow(props) {
  requestProfile(props.pubkey);
  const profile = createMemo(() => getProfile(props.pubkey));
  const color = createMemo(() => avatarColor(props.pubkey));
  const name = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.pubkey);
  });

  return (
    <A href={`/profile/${props.pubkey}`} style={styles.followRow}>
      <Show
        when={profile()?.picture}
        fallback={
          <div style={{ ...styles.followAvatarFallback, "background-color": color() }}>
            {props.pubkey.slice(0, 2).toUpperCase()}
          </div>
        }
      >
        <img src={profile().picture} style={styles.followAvatar} loading="lazy" />
      </Show>
      <div style={styles.followInfo}>
        <span style={styles.followName}>{name()}</span>
        <span style={styles.followNpub}>{npubShort(props.pubkey)}</span>
      </div>
    </A>
  );
}

function FollowsTab(props) {
  const [follows, setFollows] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  fetchCachedEvent(3, props.pubkey, [...INDEXER_RELAYS, ...getRelays()])
    .then((latest) => {
      if (latest) {
        const pubkeys = latest.tags
          .filter((t) => t[0] === "p" && t[1])
          .map((t) => t[1]);
        setFollows(pubkeys);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

  return (
    <Show when={!loading()} fallback={<p style={styles.emptyText}>Loading follows...</p>}>
      <Show when={follows().length > 0} fallback={<p style={styles.emptyText}>Not following anyone</p>}>
        <div style={styles.followCount}>{follows().length} following</div>
        <For each={follows()}>
          {(pk) => <FollowRow pubkey={pk} />}
        </For>
      </Show>
    </Show>
  );
}

export default function Profile() {
  const params = useParams();
  const [activeTab, setActiveTab] = createSignal("Notes");

  const profile = createMemo(() => getProfile(params.pubkey));
  const color = createMemo(() => avatarColor(params.pubkey));

  const displayName = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(params.pubkey);
  });

  const { events, cleanup } = createSubscription(
    { kinds: [1], authors: [params.pubkey], limit: 50 },
  );
  onCleanup(cleanup);

  const rootNotes = createMemo(() =>
    events().filter((e) => !e.tags.some((t) => t[0] === "e"))
  );
  const replies = createMemo(() =>
    events().filter((e) => e.tags.some((t) => t[0] === "e"))
  );

  return (
    <div style={styles.container}>
      <div style={styles.profileHeader}>
        <Show
          when={profile()?.picture}
          fallback={
            <div style={{ ...styles.avatarFallback, "background-color": color() }}>
              {params.pubkey.slice(0, 2).toUpperCase()}
            </div>
          }
        >
          <img src={profile().picture} style={styles.avatar} />
        </Show>
        <div>
          <h2 style={styles.name}>{displayName()}</h2>
          <p style={styles.npub}>{npubShort(params.pubkey)}</p>
          <Show when={profile()?.about}>
            <p style={styles.about}>{profile().about}</p>
          </Show>
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <Show when={activeTab() === "Notes"}>
        <For each={rootNotes()} fallback={<p style={styles.emptyText}>No notes yet</p>}>
          {(note) => <NoteCard note={note} />}
        </For>
      </Show>

      <Show when={activeTab() === "Replies"}>
        <For each={replies()} fallback={<p style={styles.emptyText}>No replies yet</p>}>
          {(note) => <NoteCard note={note} />}
        </For>
      </Show>

      <Show when={activeTab() === "Relays"}>
        <RelaysTab pubkey={params.pubkey} />
      </Show>

      <Show when={activeTab() === "Groups"}>
        <GroupsTab pubkey={params.pubkey} />
      </Show>

      <Show when={activeTab() === "Follows"}>
        <FollowsTab pubkey={params.pubkey} />
      </Show>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "650px",
  },
  profileHeader: {
    padding: "24px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    display: "flex",
    gap: "16px",
    "align-items": "center",
  },
  avatar: {
    width: "64px",
    height: "64px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  avatarFallback: {
    width: "64px",
    height: "64px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "20px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  name: {
    "font-size": "20px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    margin: 0,
  },
  npub: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "font-family": "monospace",
    margin: "4px 0 0",
  },
  about: {
    "font-size": "14px",
    color: "var(--w-text-tertiary)",
    "margin-top": "8px",
    "line-height": 1.4,
  },
  tabBar: {
    display: "flex",
    "border-bottom": "1px solid var(--w-border-secondary)",
    padding: "0 20px",
  },
  tab: {
    padding: "12px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    "font-size": "14px",
    transition: "color 0.15s, border-color 0.15s",
    "white-space": "nowrap",
  },
  emptyText: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
    "font-size": "14px",
  },
  relayList: {
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    overflow: "hidden",
    margin: "16px 20px",
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
    "font-size": "13px",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  relayBadge: {
    "font-size": "11px",
    color: "var(--w-text-muted)",
    padding: "2px 8px",
    "border-radius": "4px",
    border: "1px solid var(--w-border-subtle)",
    "flex-shrink": 0,
  },
  groupRow: {
    display: "flex",
    "flex-direction": "column",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "text-decoration": "none",
  },
  groupId: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
  },
  groupRelay: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "margin-top": "2px",
  },
  followCount: {
    padding: "12px 20px",
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  followRow: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "text-decoration": "none",
  },
  followAvatar: {
    width: "40px",
    height: "40px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  followAvatarFallback: {
    width: "40px",
    height: "40px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "13px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  followInfo: {
    "min-width": 0,
  },
  followName: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
  },
  followNpub: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "font-family": "monospace",
    display: "block",
    "margin-top": "2px",
  },
};
