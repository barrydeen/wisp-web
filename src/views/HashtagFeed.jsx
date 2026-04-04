import { createSignal, createMemo, createEffect, onCleanup, For, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { createSubscription } from "../lib/pool";
import { getLoginState } from "../lib/identity";
import { NoteCard } from "../components/NoteCard";
import { subscribeEngagement, clearEngagement } from "../lib/engagement";
import { extractReferencedNoteIds, requestNote } from "../lib/notes";
import {
  getInterestSets,
  isFollowingHashtag,
  findSetsContaining,
  addHashtagToSet,
  removeHashtagFromSet,
  createInterestSet,
} from "../lib/interests";

const SEARCH_RELAY = "wss://search.nostrarchives.com";

function InterestSetPickerDialog(props) {
  let ref;

  createEffect(() => {
    if (!props.open) return;
    function handler(e) {
      if (ref && !ref.contains(e.target)) props.onClose();
    }
    document.addEventListener("click", handler, true);
    onCleanup(() => document.removeEventListener("click", handler, true));
  });

  return (
    <Show when={props.open}>
      <div style={pickerStyles.overlay}>
        <div ref={el => ref = el} style={pickerStyles.dialog}>
          <p style={pickerStyles.title}>Add #{props.hashtag} to set</p>
          <For each={props.sets}>
            {(set) => (
              <button
                style={pickerStyles.setBtn}
                onClick={() => {
                  props.onSelect(set.dTag);
                  props.onClose();
                }}
              >
                <span style={pickerStyles.setName}>{set.name}</span>
                <span style={pickerStyles.setCount}>{set.hashtags.size} tags</span>
              </button>
            )}
          </For>
          <button style={pickerStyles.cancelBtn} onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </Show>
  );
}

export default function HashtagFeed() {
  const params = useParams();
  const navigate = useNavigate();
  const loggedIn = createMemo(() => getLoginState() === "logged-in");

  // Determine which hashtags to query
  const hashtags = createMemo(() => {
    if (params.tag) return [decodeURIComponent(params.tag).toLowerCase()];
    if (params.dTag) {
      const set = getInterestSets().find(s => s.dTag === params.dTag);
      return set ? [...set.hashtags] : [];
    }
    return [];
  });

  // Determine display title
  const title = createMemo(() => {
    if (params.tag) return `#${decodeURIComponent(params.tag)}`;
    if (params.dTag) {
      const set = getInterestSets().find(s => s.dTag === params.dTag);
      return set?.name || params.dTag;
    }
    return "Hashtag Feed";
  });

  // Single-tag mode flag (for follow button)
  const singleTag = createMemo(() => params.tag ? decodeURIComponent(params.tag).toLowerCase() : null);

  // Create subscription reactively
  const hashtagSub = createMemo((prev) => {
    prev?.cleanup();
    const tags = hashtags();
    if (tags.length === 0) return null;
    return createSubscription(
      { kinds: [1], "#t": tags, limit: 100 },
      { relays: [SEARCH_RELAY] }
    );
  }, null);

  onCleanup(() => {
    hashtagSub()?.cleanup();
    clearEngagement();
  });

  // Clear engagement when hashtags change
  createEffect(() => {
    hashtags();
    clearEngagement();
  });

  const events = createMemo(() => hashtagSub()?.events() || []);

  // Viewport-based engagement batching
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

    const refs = extractReferencedNoteIds(note);
    for (const ref of refs) {
      requestNote(ref.id, ref.relays);
    }
  }

  // Follow/unfollow logic
  const [showPicker, setShowPicker] = createSignal(false);
  const isFollowed = createMemo(() => singleTag() ? isFollowingHashtag(singleTag()) : false);

  async function handleFollow() {
    const tag = singleTag();
    if (!tag) return;

    const sets = getInterestSets();
    const containing = findSetsContaining(tag);

    if (containing.length > 0) {
      // Unfollow from all containing sets
      for (const set of containing) {
        await removeHashtagFromSet(set.dTag, tag);
      }
    } else if (sets.length === 0) {
      // Create default set and add
      await createInterestSet("Interests");
      await addHashtagToSet("interests", tag);
    } else if (sets.length === 1) {
      // Add to the only set
      await addHashtagToSet(sets[0].dTag, tag);
    } else {
      // Show picker
      setShowPicker(true);
    }
  }

  async function handlePickerSelect(dTag) {
    const tag = singleTag();
    if (tag) await addHashtagToSet(dTag, tag);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn} aria-label="Go back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={styles.title}>{title()}</span>
        <span style={styles.count}>{events().length} notes</span>
        <Show when={loggedIn() && singleTag()}>
          <button onClick={handleFollow} style={styles.followBtn} aria-label={isFollowed() ? "Unfollow hashtag" : "Follow hashtag"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isFollowed() ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </Show>
      </div>

      <Show when={hashtags().length === 0}>
        <p style={styles.empty}>No hashtags to display.</p>
      </Show>

      <Show when={hashtags().length > 0 && events().length === 0}>
        <p style={styles.empty}>Loading notes...</p>
      </Show>

      <For each={events()}>
        {(note) => <NoteCard note={note} onVisible={handleNoteVisible} />}
      </For>

      <InterestSetPickerDialog
        open={showPicker()}
        hashtag={singleTag()}
        sets={getInterestSets()}
        onSelect={handlePickerSelect}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}

const pickerStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--w-overlay)",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "z-index": 50,
  },
  dialog: {
    background: "var(--w-bg-secondary)",
    border: "1px solid var(--w-border)",
    "border-radius": "12px",
    padding: "20px",
    "min-width": "260px",
    "max-width": "360px",
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
  },
  title: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "margin-bottom": "4px",
  },
  setBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "10px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border)",
    background: "var(--w-bg-primary)",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  setName: {
    "font-weight": 500,
  },
  setCount: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
  },
  cancelBtn: {
    padding: "8px 12px",
    "border-radius": "8px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "13px",
    cursor: "pointer",
    "margin-top": "4px",
  },
};

const styles = {
  container: {
    "max-width": "650px",
    width: "100%",
    padding: "0 16px",
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
  backBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "32px",
    height: "32px",
    "border-radius": "8px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-tertiary)",
    cursor: "pointer",
    "flex-shrink": 0,
  },
  title: {
    "font-size": "16px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
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
  followBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "32px",
    height: "32px",
    "border-radius": "8px",
    border: "none",
    background: "transparent",
    color: "var(--w-accent)",
    cursor: "pointer",
    "flex-shrink": 0,
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
};
