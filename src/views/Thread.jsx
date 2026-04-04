import { createSignal, createMemo, createEffect, onCleanup, For, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { getPool, getRelays, createSubscription, publishEvent } from "../lib/pool";
import { INDEXER_RELAYS, getPubkey, getLoginState } from "../lib/identity";
import { getOutboxRelays, dedupeRelays } from "../lib/relays";
import { uploadMedia } from "../lib/blossom";
import { NoteCard } from "../components/NoteCard";
import { EmojiPopup } from "../components/EmojiPopup";
import { fetchInboxRelays, buildThreadTree } from "../lib/thread";
import { searchEmojis, buildEmojiTagsFromContent } from "../lib/emojis";

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 12H5" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const PaperclipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function ReplyNode(props) {
  const children = createMemo(() => props.tree.get(props.event.id) || []);

  return (
    <div
      style={{
        "margin-left": props.depth > 0 ? "10px" : "0",
        "padding-left": props.depth > 0 ? "6px" : "0",
        "border-left": props.depth > 0 ? "2px solid var(--w-border-secondary)" : "none",
      }}
    >
      <NoteCard note={props.event} />
      <For each={children()}>
        {(child) => (
          <ReplyNode event={child} tree={props.tree} depth={props.depth + 1} />
        )}
      </For>
    </div>
  );
}

function ReplyCompose(props) {
  let textareaRef;
  let fileInputRef;

  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [mediaUploads, setMediaUploads] = createSignal([]);
  const [uploadProgress, setUploadProgress] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [emojiCandidates, setEmojiCandidates] = createSignal([]);
  let emojiStartIndex = null;

  function autoGrow() {
    if (textareaRef) {
      requestAnimationFrame(() => {
        textareaRef.style.height = "auto";
        const h = textareaRef.scrollHeight;
        textareaRef.style.height = h + "px";
      });
    }
  }

  function handleInput(e) {
    setDraft(e.target.value);
    autoGrow();
    detectEmojiQuery(e.target.value, e.target.selectionStart);
  }

  function detectEmojiQuery(text, cursorPos) {
    if (cursorPos === 0 || !text) {
      setEmojiCandidates([]);
      emojiStartIndex = null;
      return;
    }
    for (let i = cursorPos - 1; i >= 0; i--) {
      const c = text[i];
      if (c === ":") {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const between = text.substring(i + 1, cursorPos);
          if (between.includes(":")) break;
          if (between.length < 2) { setEmojiCandidates([]); emojiStartIndex = null; return; }
          emojiStartIndex = i;
          setEmojiCandidates(searchEmojis(between));
          return;
        }
        break;
      }
      if (!/[a-zA-Z0-9_-]/.test(c)) break;
    }
    setEmojiCandidates([]);
    emojiStartIndex = null;
  }

  function handleSelectEmoji(candidate) {
    if (emojiStartIndex === null) return;
    const text = draft();
    const cursor = textareaRef?.selectionStart || text.length;
    const inserted = ":" + candidate.shortcode + ":";
    const before = text.substring(0, emojiStartIndex);
    const after = cursor < text.length ? text.substring(cursor) : "";
    const newText = before + inserted + " " + after;
    const newCursor = before.length + inserted.length + 1;
    setDraft(newText);
    setEmojiCandidates([]);
    emojiStartIndex = null;
    if (textareaRef) {
      textareaRef.value = newText;
      textareaRef.selectionStart = newCursor;
      textareaRef.selectionEnd = newCursor;
      autoGrow();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReply(e);
    }
  }

  function triggerFileUpload() {
    if (fileInputRef) fileInputRef.click();
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = "";

    for (const file of files) {
      try {
        setUploadProgress(`Uploading ${file.name}...`);
        const result = await uploadMedia(file);
        setMediaUploads((prev) => [...prev, result]);
      } catch (err) {
        setError(`Upload failed: ${err.message}`);
      } finally {
        setUploadProgress(null);
      }
    }
  }

  function removeMedia(url) {
    setMediaUploads((prev) => prev.filter((m) => m.url !== url));
  }

  async function handleReply(e) {
    e.preventDefault();
    const text = draft().trim();
    const media = mediaUploads();
    if (!text && media.length === 0) return;
    if (sending()) return;

    setSending(true);
    setError(null);

    try {
      // Build content: text + media URLs appended
      let finalContent = text;
      for (const m of media) {
        finalContent += (finalContent ? "\n" : "") + m.url;
      }

      // Build tags
      const tags = [];
      const root = props.rootNote;

      // NIP-10: e-tag with "root" marker (direct reply to root)
      tags.push(["e", root.id, "", "root"]);

      // p-tag for root author
      tags.push(["p", root.pubkey]);

      // Include p-tags from root note (thread participants), deduped
      const seen = new Set([root.pubkey]);
      for (const tag of root.tags) {
        if (tag[0] === "p" && tag[1] && !seen.has(tag[1])) {
          seen.add(tag[1]);
          tags.push(["p", tag[1]]);
        }
      }

      // NIP-92 imeta tags for uploaded media
      for (const m of media) {
        const parts = ["imeta", `url ${m.url}`];
        if (m.mimeType) parts.push(`m ${m.mimeType}`);
        if (m.width && m.height) parts.push(`dim ${m.width}x${m.height}`);
        tags.push(parts);
      }

      // Custom emoji tags (NIP-30)
      tags.push(...buildEmojiTagsFromContent(finalContent));

      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: finalContent,
      };

      // Relay set: OP's inbox relays + our outbox relays
      const opInboxRelays = await fetchInboxRelays(root.pubkey);
      const ourOutboxRelays = getOutboxRelays();
      const relaySet = dedupeRelays([...opInboxRelays, ...ourOutboxRelays]);

      const signed = await publishEvent(eventTemplate, relaySet);

      // Optimistic rendering
      props.onPublished(signed);

      // Clear form
      setDraft("");
      setMediaUploads([]);
      if (textareaRef) {
        textareaRef.style.height = "auto";
      }
    } catch (err) {
      setError(err.message || "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={replyStyles.container}>
      <textarea
        ref={textareaRef}
        value={draft()}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Post your reply..."
        aria-label="Write your reply"
        style={replyStyles.textarea}
        rows={2}
      />

      {/* Emoji popup */}
      <div style={{ position: "relative" }}>
        <EmojiPopup candidates={emojiCandidates} onSelect={handleSelectEmoji} />
      </div>

      {/* Media previews */}
      <Show when={mediaUploads().length > 0}>
        <div style={replyStyles.mediaRow}>
          <For each={mediaUploads()}>
            {(media) => (
              <div style={replyStyles.mediaItem}>
                {media.mimeType?.startsWith("video/") ? (
                  <video src={media.url} alt="Upload preview" style={replyStyles.mediaThumbnail} muted />
                ) : (
                  <img src={media.url} alt="Upload preview" style={replyStyles.mediaThumbnail} loading="lazy" />
                )}
                <button onClick={() => removeMedia(media.url)} style={replyStyles.mediaRemoveBtn}>
                  <CloseIcon />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Upload progress */}
      <Show when={uploadProgress()}>
        <span style={replyStyles.progressText}>{uploadProgress()}</span>
      </Show>

      {/* Error */}
      <Show when={error()}>
        <div style={replyStyles.errorBanner}>{error()}</div>
      </Show>

      {/* Toolbar */}
      <div style={replyStyles.toolbar}>
        <button onClick={triggerFileUpload} style={replyStyles.attachBtn} title="Attach media">
          <PaperclipIcon />
        </button>
        <button
          onClick={handleReply}
          disabled={sending() || (!draft().trim() && mediaUploads().length === 0)}
          style={{
            ...replyStyles.replyBtn,
            opacity: sending() || (!draft().trim() && mediaUploads().length === 0) ? 0.5 : 1,
          }}
        >
          {sending() ? "Sending..." : "Reply"}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
}

export default function Thread() {
  const params = useParams();
  const navigate = useNavigate();

  const [rootNote, setRootNote] = createSignal(null);
  const [phase, setPhase] = createSignal("loading");
  let replySub = null;
  const [replyEvents, setReplyEvents] = createSignal([]);
  const [localReplies, setLocalReplies] = createSignal([]);

  const decoded = createMemo(() => {
    try {
      const result = nip19.decode(params.noteId);
      if (result.type === "nevent") {
        return { id: result.data.id, relays: result.data.relays || [] };
      }
      if (result.type === "note") {
        return { id: result.data, relays: [] };
      }
    } catch {
      // invalid encoding
    }
    return null;
  });

  createEffect(() => {
    const d = decoded();
    if (!d) {
      setPhase("not-found");
      return;
    }

    // Reset state
    setRootNote(null);
    setReplyEvents([]);
    setLocalReplies([]);
    replySub?.cleanup();
    replySub = null;
    setPhase("loading");

    const pool = getPool();
    const noteId = d.id;
    const hintRelays = d.relays.length > 0 ? d.relays : null;

    (async () => {
      // Fetch root note
      const fetchRelays = hintRelays || getRelays();
      let root = await pool.get(fetchRelays, { ids: [noteId] }, { maxWait: 5000 });

      if (!root) {
        // Try indexer relays as fallback
        root = await pool.get(INDEXER_RELAYS, { ids: [noteId] }, { maxWait: 5000 });
      }

      if (!root) {
        setPhase("not-found");
        return;
      }

      setRootNote(root);

      // Fetch inbox relays for root note author
      const inboxRelays = await fetchInboxRelays(root.pubkey);

      // Subscribe to replies
      const sub = createSubscription(
        { kinds: [1], "#e": [noteId] },
        { relays: inboxRelays, limit: 500 },
      );

      replySub = sub;

      // Merge subscription events with locally injected replies
      createEffect(() => {
        const subEvents = sub.events();
        const locals = localReplies();
        const merged = [...locals];
        for (const e of subEvents) {
          if (!merged.some((m) => m.id === e.id)) {
            merged.push(e);
          }
        }
        setReplyEvents(merged);
      });

      setPhase("ready");
    })();
  });

  onCleanup(() => {
    replySub?.cleanup();
  });

  const threadTree = createMemo(() => {
    const root = rootNote();
    const replies = replyEvents();
    if (!root) return new Map();
    return buildThreadTree(root.id, replies, getPubkey());
  });

  const replyCount = createMemo(() => {
    let count = 0;
    for (const [, children] of threadTree()) {
      count += children.length;
    }
    return count;
  });

  const topLevelReplies = createMemo(() => {
    const root = rootNote();
    if (!root) return [];
    return threadTree().get(root.id) || [];
  });

  function handleReplyPublished(signedEvent) {
    setLocalReplies((prev) => [...prev, signedEvent]);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <h2 style={styles.title}>Thread</h2>
      </div>

      <Show when={phase() === "loading"}>
        <p style={styles.status}>Loading thread...</p>
      </Show>

      <Show when={phase() === "not-found"}>
        <p style={styles.status}>Note not found.</p>
      </Show>

      <Show when={rootNote()}>
        <NoteCard note={rootNote()} />

        <Show when={getLoginState() === "logged-in"}>
          <ReplyCompose rootNote={rootNote()} onPublished={handleReplyPublished} />
        </Show>

        <div style={styles.repliesHeader}>
          <span style={styles.repliesTitle}>Replies</span>
          <span style={styles.repliesCount}>{replyCount()}</span>
        </div>

        <Show when={replyCount() === 0 && phase() === "ready"}>
          <p style={styles.status}>No replies yet.</p>
        </Show>

        <For each={topLevelReplies()}>
          {(reply) => (
            <ReplyNode event={reply} tree={threadTree()} depth={1} />
          )}
        </For>
      </Show>
    </div>
  );
}

const replyStyles = {
  container: {
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  textarea: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "15px",
    "line-height": "1.5",
    resize: "none",
    outline: "none",
    "font-family": "inherit",
    padding: 0,
    "min-height": "40px",
    "box-sizing": "border-box",
  },
  mediaRow: {
    display: "flex",
    gap: "8px",
    "margin-top": "8px",
    "flex-wrap": "wrap",
  },
  mediaItem: {
    position: "relative",
    "border-radius": "8px",
    overflow: "hidden",
    width: "60px",
    height: "60px",
  },
  mediaThumbnail: {
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    display: "block",
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: "2px",
    right: "2px",
    background: "var(--w-overlay-btn)",
    border: "none",
    color: "var(--w-text-primary)",
    cursor: "pointer",
    "border-radius": "50%",
    width: "20px",
    height: "20px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: 0,
  },
  progressText: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "margin-top": "6px",
    display: "block",
  },
  errorBanner: {
    "margin-top": "8px",
    padding: "8px 12px",
    "border-radius": "8px",
    background: "var(--w-error-subtle)",
    border: "1px solid var(--w-error-border)",
    color: "var(--w-error)",
    "font-size": "13px",
  },
  toolbar: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    "margin-top": "8px",
  },
  attachBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "6px",
    "border-radius": "6px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    color: "var(--w-text-muted)",
    transition: "color 0.15s",
  },
  replyBtn: {
    padding: "8px 20px",
    "border-radius": "20px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
};

const styles = {
  container: {
    "max-width": "650px",
  },
  header: {
    padding: "16px 20px",
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
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--w-text-secondary)",
    padding: "4px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "border-radius": "50%",
    transition: "color 0.15s",
  },
  title: {
    "font-size": "18px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
  },
  repliesHeader: {
    padding: "12px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    "border-top": "1px solid var(--w-border-secondary)",
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
  },
  repliesTitle: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
  },
  repliesCount: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
  },
  status: {
    padding: "48px 20px",
    "text-align": "center",
    color: "var(--w-text-muted)",
  },
};
