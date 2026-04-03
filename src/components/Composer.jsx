import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { MentionPopup } from "./MentionPopup";
import {
  composerOpen,
  closeComposer,
  content,
  updateContent,
  publishing,
  error,
  uploadedMedia,
  uploadProgress,
  mentionCandidates,
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
  selectMention,
  dismissMentions,
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

// --- Main Composer ---

export function Composer() {
  let textareaRef;
  let fileInputRef;

  // Auto-grow textarea
  function autoGrow() {
    if (textareaRef) {
      requestAnimationFrame(() => {
        textareaRef.style.height = "auto";
        const h = textareaRef.scrollHeight;
        textareaRef.style.height = h + "px";
      });
    }
  }

  // Handle text input
  function handleInput(e) {
    updateContent(e.target.value, e.target.selectionStart);
    autoGrow();
  }

  // Track cursor on click/keyup too
  function handleCursorChange(e) {
    updateContent(content(), e.target.selectionStart);
  }

  // Handle mention selection — need to update textarea value + cursor
  function handleSelectMention(candidate) {
    const result = selectMention(candidate);
    if (result && textareaRef) {
      textareaRef.value = result.text;
      textareaRef.selectionStart = result.cursor;
      textareaRef.selectionEnd = result.cursor;
      autoGrow();
    }
  }

  // File upload trigger
  function triggerFileUpload() {
    if (fileInputRef) fileInputRef.click();
  }

  function handleFileChange(e) {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = ""; // reset so same file can be re-selected
    }
  }

  // Close on Escape
  createEffect(() => {
    if (composerOpen()) {
      const handler = (e) => {
        if (e.key === "Escape") {
          closeComposer();
        }
      };
      document.addEventListener("keydown", handler);
      onCleanup(() => document.removeEventListener("keydown", handler));
    }
  });

  // Focus textarea when opened
  createEffect(() => {
    if (composerOpen() && textareaRef) {
      setTimeout(() => textareaRef.focus(), 50);
    }
  });

  // Click outside overlay to close
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      closeComposer();
    }
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
      <style>{`textarea:focus-visible, input:focus-visible { outline: 2px solid var(--w-accent) !important; outline-offset: -1px; }`}</style>
      <div style={styles.overlay} onClick={handleOverlayClick}>
        <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="composer-title">
          {/* Header */}
          <div style={styles.header}>
            <h3 id="composer-title" style={styles.title}>New Note</h3>
            <button onClick={closeComposer} style={styles.closeBtn} aria-label="Close composer">
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          <div style={styles.body}>
            <textarea
              ref={textareaRef}
              value={content()}
              onInput={handleInput}
              onClick={handleCursorChange}
              onKeyUp={handleCursorChange}
              placeholder="What's on your mind?"
              aria-label="Compose your note"
              style={styles.textarea}
              rows={3}
            />

            {/* Mention popup */}
            <div style={{ position: "relative" }}>
              <MentionPopup
                candidates={mentionCandidates}
                onSelect={handleSelectMention}
              />
            </div>

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
                onClick={() => {}} // PoW is toggled in settings, just shows state here
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
    "min-height": "80px",
    "box-sizing": "border-box",
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
