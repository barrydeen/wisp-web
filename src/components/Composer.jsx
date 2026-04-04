import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { nip19 } from "nostr-tools";
import { MentionPopup } from "./MentionPopup";
import { EmojiPopup } from "./EmojiPopup";
import { searchContacts } from "../lib/contacts";
import { searchEmojis } from "../lib/emojis";
import { npubShort } from "../lib/utils";
import {
  composerOpen,
  closeComposer,
  content,
  setContent,
  updateContent,
  publishing,
  error,
  uploadedMedia,
  uploadProgress,
  mentionCandidates,
  setMentionCandidates,
  emojiCandidates,
  setEmojiCandidates,
  hashtags,
  explicit,
  galleryMode,
  pollEnabled,
  pollOptions,
  pollType,
  countdownSeconds,
  getMiningStatus,
  toggleExplicit,
  toggleGalleryMode,
  togglePoll,
  togglePollType,
  updatePollOption,
  addPollOption,
  removePollOption,
  uploadFiles,
  removeMedia,
  initiatePublish,
  cancelCountdown,
  publishNow,
} from "../lib/compose";

// --- SVG Icons ---

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const WarningIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const PaperclipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// --- Toggle button sub-component ---

function ToggleBtn(props) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={props.title}
      style={{
        ...styles.toggleBtn,
        color: props.active
          ? props.activeColor || "var(--w-accent)"
          : hovered()
            ? "var(--w-text-secondary)"
            : "var(--w-text-muted)",
        background: props.active ? "var(--w-accent-subtle)" : "transparent",
      }}
    >
      {props.icon()}
    </button>
  );
}

// --- Editor helpers ---

function serializeNode(el) {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeName === "BR") {
      result += "\n";
    } else if (node.nodeName === "IMG" && node.dataset.shortcode) {
      result += ":" + node.dataset.shortcode + ":";
    } else if (node.nodeName === "SPAN" && node.dataset.pubkey) {
      const nprofile = nip19.nprofileEncode({ pubkey: node.dataset.pubkey });
      result += "nostr:" + nprofile;
    } else if (node.nodeName === "DIV" || node.nodeName === "P") {
      if (result.length > 0 && !result.endsWith("\n")) result += "\n";
      result += serializeNode(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      result += serializeNode(node);
    }
  }
  return result;
}

function detectTrigger(editorEl, triggerChar, minQueryLen, charFilter) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  if (!editorEl.contains(node)) return null;

  const text = node.textContent;
  const offset = sel.anchorOffset;

  for (let i = offset - 1; i >= 0; i--) {
    if (text[i] === triggerChar) {
      if (i === 0 || /\s/.test(text[i - 1])) {
        const query = text.substring(i + 1, offset);
        if (triggerChar === ":" && query.includes(":")) return null;
        if (query.length < minQueryLen) return null;
        return { query, node, start: i, end: offset };
      }
      return null;
    }
    if (/\s/.test(text[i])) return null;
    if (charFilter && !charFilter.test(text[i])) return null;
  }
  return null;
}

function replaceRange(node, start, end, newElements) {
  const text = node.textContent;
  const before = text.substring(0, start);
  const after = text.substring(end);

  node.textContent = before;
  const afterNode = document.createTextNode(" " + after);
  const parent = node.parentNode;

  // Insert new elements + afterNode after the text node
  let insertBefore = node.nextSibling;
  for (const el of newElements) {
    parent.insertBefore(el, insertBefore);
    insertBefore = el.nextSibling;
  }
  parent.insertBefore(afterNode, insertBefore);

  // Place cursor after the space in afterNode
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(afterNode, 1);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// --- Main Composer ---

export function Composer() {
  let editorRef;
  let modalRef;
  let fileInputRef;

  // Detection state
  let currentMentionDetection = null;
  let currentEmojiDetection = null;
  const [popupPos, setPopupPos] = createSignal(null);

  function serializeEditor() {
    if (!editorRef) return "";
    return serializeNode(editorRef);
  }

  function syncContent() {
    updateContent(serializeEditor());
  }

  function getCursorRect(det) {
    try {
      const range = document.createRange();
      range.setStart(det.node, det.start);
      range.setEnd(det.node, det.start);
      return range.getBoundingClientRect();
    } catch {
      return null;
    }
  }

  // Handle input — sync content, detect triggers
  function handleInput() {
    syncContent();

    // Detect @mentions
    const mention = detectTrigger(editorRef, "@", 0, null);
    if (mention) {
      currentMentionDetection = mention;
      const candidates = searchContacts(mention.query);
      setMentionCandidates(candidates);
      setEmojiCandidates([]);
      currentEmojiDetection = null;
      if (candidates.length > 0) {
        const rect = getCursorRect(mention);
        if (rect) setPopupPos({ top: rect.bottom + 4, left: rect.left });
      }
      return;
    }
    currentMentionDetection = null;

    // Detect :emoji:
    const emoji = detectTrigger(editorRef, ":", 2, /[a-zA-Z0-9_-]/);
    if (emoji) {
      currentEmojiDetection = emoji;
      const candidates = searchEmojis(emoji.query);
      setEmojiCandidates(candidates);
      if (candidates.length > 0) {
        setMentionCandidates([]);
        currentMentionDetection = null;
        const rect = getCursorRect(emoji);
        if (rect) setPopupPos({ top: rect.bottom + 4, left: rect.left });
      }
      return;
    }
    currentEmojiDetection = null;

    setMentionCandidates([]);
    setEmojiCandidates([]);
    setPopupPos(null);
  }

  // Also detect on cursor movement
  function handleKeyUp(e) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      handleInput();
    }
  }

  function handleClick() {
    handleInput();
  }

  // Insert mention span
  function handleSelectMention(candidate) {
    const det = currentMentionDetection;
    if (!det) return;

    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.pubkey = candidate.pubkey;
    span.textContent = "@" + (candidate.displayName || candidate.name || npubShort(candidate.pubkey));
    span.className = "wisp-mention";

    replaceRange(det.node, det.start, det.end, [span]);

    currentMentionDetection = null;
    setMentionCandidates([]);
    setPopupPos(null);
    syncContent();
    editorRef.focus();
  }

  // Insert emoji img
  function handleSelectEmoji(candidate) {
    const det = currentEmojiDetection;
    if (!det) return;

    const img = document.createElement("img");
    img.src = candidate.url;
    img.alt = ":" + candidate.shortcode + ":";
    img.dataset.shortcode = candidate.shortcode;
    img.className = "wisp-emoji";

    replaceRange(det.node, det.start, det.end, [img]);

    currentEmojiDetection = null;
    setEmojiCandidates([]);
    setPopupPos(null);
    syncContent();
    editorRef.focus();
  }

  // Strip HTML on paste
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  // File upload trigger
  function triggerFileUpload() {
    if (fileInputRef) fileInputRef.click();
  }

  function handleFileChange(e) {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  }

  // Close on Escape
  createEffect(() => {
    if (composerOpen()) {
      const handler = (e) => {
        if (e.key === "Escape") closeComposer();
      };
      document.addEventListener("keydown", handler);
      onCleanup(() => document.removeEventListener("keydown", handler));
    }
  });

  // Focus editor when opened
  createEffect(() => {
    if (composerOpen() && editorRef) {
      setTimeout(() => editorRef.focus(), 50);
    }
  });

  // Click outside overlay to close
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) closeComposer();
  }

  const canPublish = () => {
    if (publishing()) return false;
    if (countdownSeconds() !== null) return false;
    if (galleryMode()) return uploadedMedia().length > 0;
    if (pollEnabled()) {
      return pollOptions().filter((o) => o.trim()).length >= 2;
    }
    return content().trim().length > 0;
  };

  const miningStatus = () => getMiningStatus();
  const isMining = () => miningStatus().phase === "mining";

  return (
    <Show when={composerOpen()}>
      <style>{`
        input:focus-visible { outline: 2px solid var(--w-accent) !important; outline-offset: -1px; }
        .wisp-editor:empty::before {
          content: "What's on your mind?";
          color: var(--w-text-muted);
          pointer-events: none;
        }
        .wisp-editor:focus { outline: none; }
        .wisp-editor .wisp-mention {
          color: var(--w-accent);
          background: var(--w-accent-subtle);
          padding: 1px 4px;
          border-radius: 4px;
          font-size: 14px;
          user-select: none;
        }
        .wisp-editor .wisp-emoji {
          width: 20px;
          height: 20px;
          vertical-align: middle;
          display: inline;
          margin: 0 1px;
        }
      `}</style>
      <div style={styles.overlay} onClick={handleOverlayClick}>
        <div ref={modalRef} style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="composer-title">
          {/* Header */}
          <div style={styles.header}>
            <h3 id="composer-title" style={styles.title}>New Note</h3>
            <button onClick={closeComposer} style={styles.closeBtn} aria-label="Close composer">
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          <div style={styles.body}>
            <div
              ref={editorRef}
              contentEditable={true}
              class="wisp-editor"
              onInput={handleInput}
              onKeyUp={handleKeyUp}
              onClick={handleClick}
              onPaste={handlePaste}
              role="textbox"
              aria-label="Compose your note"
              aria-multiline="true"
              style={styles.editor}
            />

            {/* Mention & emoji popups — positioned at cursor via portal */}
            <Show when={popupPos()}>
              <Portal>
                <div onMouseDown={(e) => e.preventDefault()} style={{
                  position: "fixed",
                  top: popupPos().top + "px",
                  left: Math.max(8, Math.min(popupPos().left, window.innerWidth - 320)) + "px",
                  width: "300px",
                  "z-index": 200,
                }}>
                  <MentionPopup
                    candidates={mentionCandidates}
                    onSelect={handleSelectMention}
                  />
                  <EmojiPopup
                    candidates={emojiCandidates}
                    onSelect={handleSelectEmoji}
                  />
                </div>
              </Portal>
            </Show>

            {/* Gallery media grid */}
            <Show when={galleryMode()}>
              <div style={styles.mediaSection}>
                <Show when={uploadedMedia().length > 0}>
                  <div style={styles.mediaGrid}>
                    <For each={uploadedMedia()}>
                      {(media) => (
                        <div style={styles.mediaItem}>
                          {media.mimeType?.startsWith("video/") ? (
                            <video src={media.url} style={styles.mediaThumbnail} muted />
                          ) : (
                            <img src={media.url} style={styles.mediaThumbnail} loading="lazy" />
                          )}
                          <button
                            onClick={() => removeMedia(media.url)}
                            style={styles.mediaRemoveBtn}
                          >
                            <CloseIcon />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <button onClick={triggerFileUpload} style={styles.uploadBtn}>
                  <PlusIcon /> Add media
                </button>
                <Show when={uploadProgress()}>
                  <span style={styles.progressText}>{uploadProgress()}</span>
                </Show>
              </div>
            </Show>

            {/* Poll options */}
            <Show when={pollEnabled()}>
              <div style={styles.pollSection}>
                <div style={styles.pollTypeRow}>
                  <button
                    onClick={togglePollType}
                    style={{
                      ...styles.pollTypeBtn,
                      background: pollType() === "singlechoice" ? "var(--w-accent-subtle)" : "transparent",
                      color: pollType() === "singlechoice" ? "var(--w-accent)" : "var(--w-text-muted)",
                    }}
                  >
                    Single choice
                  </button>
                  <button
                    onClick={togglePollType}
                    style={{
                      ...styles.pollTypeBtn,
                      background: pollType() === "multiplechoice" ? "var(--w-accent-subtle)" : "transparent",
                      color: pollType() === "multiplechoice" ? "var(--w-accent)" : "var(--w-text-muted)",
                    }}
                  >
                    Multiple choice
                  </button>
                </div>
                <For each={pollOptions()}>
                  {(opt, i) => (
                    <div style={styles.pollOptionRow}>
                      <span style={styles.pollOptionMarker}>
                        {pollType() === "singlechoice" ? "\u25CB" : "\u25A1"}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onInput={(e) => updatePollOption(i(), e.target.value)}
                        placeholder={`Option ${i() + 1}`}
                        aria-label={"Poll option " + (i() + 1)}
                        style={styles.pollOptionInput}
                      />
                      <Show when={pollOptions().length > 2}>
                        <button
                          onClick={() => removePollOption(i())}
                          style={styles.pollRemoveBtn}
                        >
                          <TrashIcon />
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={pollOptions().length < 10}>
                  <button onClick={addPollOption} style={styles.addOptionBtn}>
                    <PlusIcon /> Add option
                  </button>
                </Show>
              </div>
            </Show>

            {/* Hashtag chips */}
            <Show when={hashtags().length > 0}>
              <div style={styles.hashtagRow}>
                <For each={hashtags()}>
                  {(tag) => (
                    <span style={styles.hashtagChip}>#{tag}</span>
                  )}
                </For>
              </div>
            </Show>

            {/* NSFW banner */}
            <Show when={explicit()}>
              <div style={styles.nsfwBanner}>Content marked as NSFW</div>
            </Show>

            {/* Mining status */}
            <Show when={isMining()}>
              <div style={styles.miningBanner}>
                Mining PoW... {miningStatus().attempts.toLocaleString()} attempts
              </div>
            </Show>

            {/* Error */}
            <Show when={error()}>
              <div style={styles.errorBanner}>{error()}</div>
            </Show>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <div style={styles.footerLeft}>
              <ToggleBtn
                icon={ImageIcon}
                onClick={toggleGalleryMode}
                active={galleryMode()}
                title="Gallery mode"
              />
              <ToggleBtn
                icon={ChartIcon}
                onClick={togglePoll}
                active={pollEnabled()}
                title="Poll"
              />
              <ToggleBtn
                icon={WarningIcon}
                onClick={toggleExplicit}
                active={explicit()}
                activeColor="var(--w-error)"
                title="Mark as NSFW"
              />
              <ToggleBtn
                icon={ShieldIcon}
                onClick={() => {}}
                active={false}
                title="Proof of Work (configure in Settings)"
              />
              <button onClick={triggerFileUpload} style={styles.toggleBtn} title="Attach media" aria-label="Attach media">
                <PaperclipIcon />
              </button>
            </div>

            <div style={styles.footerRight}>
              <Show
                when={countdownSeconds() !== null}
                fallback={
                  <button
                    onClick={initiatePublish}
                    disabled={!canPublish() || isMining()}
                    style={{
                      ...styles.publishBtn,
                      opacity: canPublish() && !isMining() ? 1 : 0.5,
                    }}
                  >
                    {isMining() ? "Mining..." : "Publish"}
                  </button>
                }
              >
                <div style={styles.countdownRow}>
                  <span style={styles.countdownText}>{countdownSeconds()}s</span>
                  <button onClick={cancelCountdown} style={styles.undoBtn}>
                    Undo
                  </button>
                  <button onClick={publishNow} style={styles.postNowBtn}>
                    Post Now
                  </button>
                </div>
              </Show>
            </div>
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
      </div>
    </Show>
  );
}

// --- Styles ---

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--w-overlay)",
    "backdrop-filter": "blur(4px)",
    display: "flex",
    "align-items": "flex-start",
    "justify-content": "center",
    "padding-top": "10vh",
    "z-index": 100,
  },
  modal: {
    background: "var(--w-bg-primary)",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "16px",
    width: "100%",
    "max-width": "580px",
    "max-height": "80vh",
    display: "flex",
    "flex-direction": "column",
    "box-shadow": "0 8px 32px var(--w-shadow)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "16px 20px 12px",
    "border-bottom": "1px solid var(--w-border-secondary)",
  },
  title: {
    "font-size": "16px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    padding: "4px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    transition: "color 0.15s",
  },
  body: {
    padding: "16px 20px",
    flex: 1,
    "overflow-y": "auto",
  },
  editor: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "15px",
    "line-height": "1.5",
    outline: "none",
    "font-family": "inherit",
    padding: 0,
    "min-height": "140px",
    "white-space": "pre-wrap",
    "word-break": "break-word",
    "overflow-wrap": "break-word",
  },
  // Media section
  mediaSection: {
    "margin-top": "12px",
    "padding-top": "12px",
    "border-top": "1px solid var(--w-border-secondary)",
  },
  mediaGrid: {
    display: "grid",
    "grid-template-columns": "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "8px",
    "margin-bottom": "10px",
  },
  mediaItem: {
    position: "relative",
    "border-radius": "8px",
    overflow: "hidden",
    "aspect-ratio": "1",
  },
  mediaThumbnail: {
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    display: "block",
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: "4px",
    right: "4px",
    background: "var(--w-overlay-btn)",
    border: "none",
    color: "var(--w-text-primary)",
    cursor: "pointer",
    "border-radius": "50%",
    width: "24px",
    height: "24px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: 0,
  },
  uploadBtn: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    padding: "8px 14px",
    "border-radius": "8px",
    border: "1px dashed var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-tertiary)",
    "font-size": "13px",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },
  progressText: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "margin-top": "6px",
    display: "block",
  },
  // Poll section
  pollSection: {
    "margin-top": "12px",
    "padding-top": "12px",
    "border-top": "1px solid var(--w-border-secondary)",
  },
  pollTypeRow: {
    display: "flex",
    gap: "0",
    "margin-bottom": "10px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    overflow: "hidden",
    width: "fit-content",
  },
  pollTypeBtn: {
    padding: "6px 14px",
    border: "none",
    "font-size": "12px",
    "font-weight": 500,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  },
  pollOptionRow: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    "margin-bottom": "6px",
  },
  pollOptionMarker: {
    "font-size": "16px",
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
    width: "20px",
    "text-align": "center",
  },
  pollOptionInput: {
    flex: 1,
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    outline: "none",
  },
  pollRemoveBtn: {
    background: "none",
    border: "none",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    padding: "4px",
    "flex-shrink": 0,
    display: "flex",
    "align-items": "center",
  },
  addOptionBtn: {
    display: "flex",
    "align-items": "center",
    gap: "4px",
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    color: "var(--w-accent)",
    "font-size": "12px",
    cursor: "pointer",
    "margin-top": "4px",
  },
  // Hashtags
  hashtagRow: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "6px",
    "margin-top": "12px",
  },
  hashtagChip: {
    "font-size": "12px",
    color: "var(--w-accent)",
    background: "var(--w-accent-subtle)",
    padding: "3px 10px",
    "border-radius": "12px",
  },
  // Banners
  nsfwBanner: {
    "margin-top": "10px",
    padding: "8px 12px",
    "border-radius": "8px",
    background: "var(--w-error-subtle)",
    border: "1px solid var(--w-error-border)",
    color: "var(--w-error)",
    "font-size": "12px",
  },
  miningBanner: {
    "margin-top": "10px",
    padding: "8px 12px",
    "border-radius": "8px",
    background: "var(--w-accent-subtle)",
    color: "var(--w-accent)",
    "font-size": "12px",
  },
  errorBanner: {
    "margin-top": "10px",
    padding: "8px 12px",
    "border-radius": "8px",
    background: "var(--w-error-subtle)",
    border: "1px solid var(--w-error-border)",
    color: "var(--w-error)",
    "font-size": "13px",
  },
  // Footer
  footer: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "12px 20px",
    "border-top": "1px solid var(--w-border-secondary)",
  },
  footerLeft: {
    display: "flex",
    gap: "4px",
  },
  footerRight: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "6px",
    "border-radius": "6px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    color: "var(--w-text-muted)",
    transition: "color 0.15s, background 0.15s",
  },
  publishBtn: {
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
  // Countdown
  countdownRow: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
  },
  countdownText: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    "min-width": "28px",
    "text-align": "center",
  },
  undoBtn: {
    padding: "6px 14px",
    "border-radius": "20px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  postNowBtn: {
    padding: "6px 14px",
    "border-radius": "20px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
  },
};
