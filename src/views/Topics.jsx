import { createSignal, createMemo, createEffect, onCleanup, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { getLoginState } from "../lib/identity";
import {
  getInterestSets,
  isInterestSetsLoaded,
  createInterestSet,
  deleteInterestSet,
  addHashtagToSet,
  removeHashtagFromSet,
} from "../lib/interests";

export default function Topics() {
  const navigate = useNavigate();
  const loggedIn = createMemo(() => getLoginState() === "logged-in");
  const sets = createMemo(() => getInterestSets());
  const loaded = createMemo(() => isInterestSetsLoaded());

  // Create set form
  const [newSetName, setNewSetName] = createSignal("");

  async function handleCreateSet(e) {
    e.preventDefault();
    const name = newSetName().trim();
    if (!name) return;
    await createInterestSet(name);
    setNewSetName("");
  }

  // Expanded set tracking
  const [expandedSet, setExpandedSet] = createSignal(null);

  // Add hashtag inputs per set
  const [addTagInputs, setAddTagInputs] = createSignal({});

  function getAddTagInput(dTag) {
    return addTagInputs()[dTag] || "";
  }

  function setAddTagInput(dTag, value) {
    setAddTagInputs(prev => ({ ...prev, [dTag]: value }));
  }

  async function handleAddTag(e, dTag) {
    e.preventDefault();
    const raw = getAddTagInput(dTag).trim().replace(/^#/, "");
    if (!raw) return;
    await addHashtagToSet(dTag, raw);
    setAddTagInput(dTag, "");
  }

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = createSignal(null);

  async function handleDelete(dTag) {
    await deleteInterestSet(dTag);
    setConfirmDelete(null);
    if (expandedSet() === dTag) setExpandedSet(null);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Topics</span>
      </div>

      <Show when={!loggedIn()}>
        <p style={styles.empty}>Log in to manage your topic sets.</p>
      </Show>

      <Show when={loggedIn()}>
        <div style={styles.createSection}>
          <form onSubmit={handleCreateSet} style={styles.createForm}>
            <input
              type="text"
              placeholder="New set name..."
              aria-label="New interest set name"
              value={newSetName()}
              onInput={(e) => setNewSetName(e.target.value)}
              style={styles.createInput}
            />
            <button type="submit" style={styles.createBtn} disabled={!newSetName().trim()}>
              Create
            </button>
          </form>
        </div>

        <Show when={!loaded()}>
          <p style={styles.empty}>Loading interest sets...</p>
        </Show>

        <Show when={loaded() && sets().length === 0}>
          <p style={styles.empty}>No interest sets yet. Create one to organize hashtags you follow.</p>
        </Show>

        <div style={styles.setList}>
          <For each={sets()}>
            {(set) => {
              const isExpanded = createMemo(() => expandedSet() === set.dTag);
              const hashtagArray = createMemo(() => [...set.hashtags].sort());

              return (
                <div style={styles.setCard}>
                  <div style={styles.setHeader}>
                    <button
                      onClick={() => setExpandedSet(isExpanded() ? null : set.dTag)}
                      style={styles.setExpandBtn}
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        style={{ transform: isExpanded() ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <A href={`/topics/set/${set.dTag}`} style={styles.setName}>
                      {set.name}
                    </A>
                    <span style={styles.setCount}>{set.hashtags.size} tags</span>
                    <Show when={confirmDelete() === set.dTag}
                      fallback={
                        <button
                          onClick={() => setConfirmDelete(set.dTag)}
                          style={styles.deleteBtn}
                          aria-label="Delete set"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      }
                    >
                      <button onClick={() => handleDelete(set.dTag)} style={styles.confirmDeleteBtn}>
                        Delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)} style={styles.cancelDeleteBtn}>
                        Cancel
                      </button>
                    </Show>
                  </div>

                  <Show when={isExpanded()}>
                    <div style={styles.setBody}>
                      <div style={styles.tagPills}>
                        <For each={hashtagArray()}>
                          {(tag) => (
                            <span style={styles.tagPill}>
                              <A href={`/hashtag/${encodeURIComponent(tag)}`} style={styles.tagLink}>
                                #{tag}
                              </A>
                              <button
                                onClick={() => removeHashtagFromSet(set.dTag, tag)}
                                style={styles.tagRemoveBtn}
                                aria-label={`Remove #${tag}`}
                              >
                                &times;
                              </button>
                            </span>
                          )}
                        </For>
                      </div>

                      <form onSubmit={(e) => handleAddTag(e, set.dTag)} style={styles.addTagForm}>
                        <input
                          type="text"
                          placeholder="Add hashtag..."
                          aria-label="Add hashtag to set"
                          value={getAddTagInput(set.dTag)}
                          onInput={(e) => setAddTagInput(set.dTag, e.target.value)}
                          style={styles.addTagInput}
                        />
                        <button type="submit" style={styles.addTagBtn}>Add</button>
                      </form>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

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
  title: {
    "font-size": "16px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
  },
  createSection: {
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  createForm: {
    display: "flex",
    gap: "8px",
  },
  createInput: {
    flex: 1,
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    outline: "none",
  },
  createBtn: {
    padding: "8px 16px",
    "border-radius": "8px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
  },
  empty: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
  setList: {
    display: "flex",
    "flex-direction": "column",
  },
  setCard: {
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  setHeader: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    padding: "12px 20px",
  },
  setExpandBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "24px",
    height: "24px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    "flex-shrink": 0,
  },
  setName: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "text-decoration": "none",
    flex: 1,
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  setCount: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  deleteBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "28px",
    height: "28px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    "border-radius": "6px",
    "flex-shrink": 0,
  },
  confirmDeleteBtn: {
    padding: "4px 10px",
    "border-radius": "6px",
    border: "none",
    background: "var(--w-error)",
    color: "var(--w-btn-text)",
    "font-size": "12px",
    "font-weight": 600,
    cursor: "pointer",
    "flex-shrink": 0,
  },
  cancelDeleteBtn: {
    padding: "4px 10px",
    "border-radius": "6px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "12px",
    cursor: "pointer",
    "flex-shrink": 0,
  },
  setBody: {
    padding: "0 20px 16px 52px",
    display: "flex",
    "flex-direction": "column",
    gap: "10px",
  },
  tagPills: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "6px",
  },
  tagPill: {
    display: "inline-flex",
    "align-items": "center",
    gap: "4px",
    padding: "4px 10px",
    "border-radius": "16px",
    border: "1px solid var(--w-border)",
    background: "var(--w-bg-secondary)",
    "font-size": "13px",
  },
  tagLink: {
    color: "var(--w-accent)",
    "text-decoration": "none",
  },
  tagRemoveBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "16px",
    height: "16px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    "font-size": "14px",
    "line-height": 1,
    padding: 0,
  },
  addTagForm: {
    display: "flex",
    gap: "6px",
  },
  addTagInput: {
    flex: 1,
    padding: "6px 10px",
    "border-radius": "6px",
    border: "1px solid var(--w-border-input)",
    background: "var(--w-bg-secondary)",
    color: "var(--w-text-primary)",
    "font-size": "13px",
    outline: "none",
  },
  addTagBtn: {
    padding: "6px 12px",
    "border-radius": "6px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
  },
};
