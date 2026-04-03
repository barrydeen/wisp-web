import { createMemo, createSignal, createEffect, Show, onCleanup } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { nip19 } from "nostr-tools";
import { getProfile } from "../lib/profiles";
import { formatTime, npubShort, avatarColor, formatNip05, extractClientTag, formatSats } from "../lib/utils";
import { RichContent } from "./RichContent";
import { ZapDialog } from "./ZapDialog";
import { getLoginState } from "../lib/identity";
import { isZapping } from "../lib/zap";
import { getReplyCount, getRepostCount, getReactionCount, getZapSats, hasUserReacted, hasUserReposted } from "../lib/engagement";

// --- SVG Icon factories (must return fresh DOM nodes per instance) ---

const ReplyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const RepostIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const LikeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ZapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const EllipsisIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

// --- ActionButton sub-component ---

function ActionButton(props) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      style={{
        ...styles.actionBtn,
        color: props.active ? props.hoverColor : hovered() ? props.hoverColor : "var(--w-text-muted)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); props.onClick?.(e); }}
    >
      {props.icon()}
      <span style={styles.actionCount}>{props.count || ""}</span>
    </button>
  );
}

// --- NoteCard ---

export function NoteCard(props) {
  const navigate = useNavigate();
  const profile = createMemo(() => getProfile(props.note.pubkey));
  const color = createMemo(() => avatarColor(props.note.pubkey));
  const time = createMemo(() => formatTime(props.note.created_at));

  const displayName = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.note.pubkey);
  });

  const avatar = createMemo(() => profile()?.picture);

  const nip05Display = createMemo(() => {
    const p = profile();
    return p?.nip05 ? formatNip05(p.nip05) : null;
  });

  const clientName = createMemo(() => extractClientTag(props.note.tags));

  const nevent = createMemo(() => {
    try {
      return nip19.neventEncode({
        id: props.note.id,
        author: props.note.pubkey,
        relays: props.note._relayHints?.slice(0, 3) || [],
      });
    } catch {
      return null;
    }
  });

  // Menu state
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef;

  function toggleMenu(e) {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }

  // Click-outside to close menu
  createEffect(() => {
    if (menuOpen()) {
      const handler = (e) => {
        if (menuRef && !menuRef.contains(e.target)) {
          setMenuOpen(false);
        }
      };
      document.addEventListener("click", handler);
      onCleanup(() => document.removeEventListener("click", handler));
    }
  });

  // Menu actions
  function handleShare() {
    const ne = nevent();
    if (ne) navigator.clipboard.writeText(`https://njump.me/${ne}`);
    setMenuOpen(false);
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(props.note, null, 2));
    setMenuOpen(false);
  }

  function handleCopyId() {
    const ne = nevent();
    if (ne) navigator.clipboard.writeText(ne);
    setMenuOpen(false);
  }

  function handleCardClick() {
    const ne = nevent();
    if (ne) navigate(`/thread/${ne}`);
  }

  // Dropdown item hover
  const [hoveredItem, setHoveredItem] = createSignal(null);

  // Zap dialog
  const [showZap, setShowZap] = createSignal(false);

  const recipientLud16 = createMemo(() => {
    const p = profile();
    return p?.lud16 || null;
  });

  function handleZapClick() {
    if (getLoginState() !== "logged-in") return;
    setShowZap(true);
  }

  // Engagement counts
  const replyCount = createMemo(() => getReplyCount(props.note.id));
  const repostCount = createMemo(() => getRepostCount(props.note.id));
  const reactionCount = createMemo(() => getReactionCount(props.note.id));
  const zapAmount = createMemo(() => getZapSats(props.note.id));
  const zapDisplay = createMemo(() => {
    if (isZapping(props.note.id)) return "...";
    const sats = zapAmount();
    return sats > 0 ? formatSats(sats) : "";
  });

  // Viewport visibility detection
  let cardRef;
  createEffect(() => {
    if (!cardRef || !props.onVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          props.onVisible(props.note);
          observer.unobserve(cardRef);
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(cardRef);
    onCleanup(() => observer.disconnect());
  });

  return (
    <article ref={cardRef} style={{ ...styles.card, cursor: "pointer" }} onClick={handleCardClick}>
      <A href={`/profile/${props.note.pubkey}`} style={styles.avatarCol} onClick={(e) => e.stopPropagation()}>
        {avatar() ? (
          <img src={avatar()} style={styles.avatarImg} loading="lazy" />
        ) : (
          <div style={{ ...styles.avatarFallback, "background-color": color() }}>
            {props.note.pubkey.slice(0, 2).toUpperCase()}
          </div>
        )}
      </A>
      <div style={styles.body}>
        {/* Header: meta + menu */}
        <div style={styles.header}>
          <div style={styles.meta}>
            <A href={`/profile/${props.note.pubkey}`} style={styles.author} onClick={(e) => e.stopPropagation()}>
              {displayName()}
            </A>
            <Show when={clientName()}>
              <span style={styles.clientTag}>via {clientName()}</span>
            </Show>
            <Show when={nip05Display()}>
              <span style={styles.nip05}>{nip05Display()}</span>
            </Show>
            <span style={styles.dot}>&middot;</span>
            <span style={styles.time}>{time()}</span>
          </div>
          <div style={styles.menuWrapper} onClick={(e) => e.stopPropagation()}>
            <button onClick={toggleMenu} style={styles.menuBtn}>
              <EllipsisIcon />
            </button>
            <Show when={menuOpen()}>
              <div ref={menuRef} style={styles.dropdown}>
                <button
                  style={{
                    ...styles.dropdownItem,
                    background: hoveredItem() === "share" ? "var(--w-bg-hover)" : "none",
                  }}
                  onMouseEnter={() => setHoveredItem("share")}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={handleShare}
                >
                  Share
                </button>
                <button
                  style={{
                    ...styles.dropdownItem,
                    background: hoveredItem() === "json" ? "var(--w-bg-hover)" : "none",
                  }}
                  onMouseEnter={() => setHoveredItem("json")}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={handleCopyJson}
                >
                  Copy note JSON
                </button>
                <button
                  style={{
                    ...styles.dropdownItem,
                    background: hoveredItem() === "id" ? "var(--w-bg-hover)" : "none",
                  }}
                  onMouseEnter={() => setHoveredItem("id")}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={handleCopyId}
                >
                  Copy note ID
                </button>
              </div>
            </Show>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <RichContent content={props.note.content} tags={props.note.tags} />
        </div>

        {/* Action bar */}
        <div style={styles.actionBar}>
          <ActionButton icon={ReplyIcon} count={replyCount()} hoverColor="#1d9bf0" />
          <ActionButton icon={RepostIcon} count={repostCount()} hoverColor="#00ba7c" active={hasUserReposted(props.note.id)} />
          <ActionButton icon={LikeIcon} count={reactionCount()} hoverColor="#f91880" active={hasUserReacted(props.note.id)} />
          <ActionButton
            icon={ZapIcon}
            count={zapDisplay()}
            hoverColor="#f7931a"
            onClick={handleZapClick}
          />
        </div>

        <ZapDialog
          isOpen={showZap()}
          onClose={() => setShowZap(false)}
          recipientPubkey={props.note.pubkey}
          recipientName={displayName()}
          recipientLud16={recipientLud16()}
          eventId={props.note.id}
          eventKind={props.note.kind || 1}
          eventTags={props.note.tags}
        />
      </div>
    </article>
  );
}

const styles = {
  card: {
    display: "flex",
    gap: "12px",
    padding: "16px 20px",
    "border-bottom": "1px solid var(--w-border-secondary)",
    transition: "background 0.1s",
  },
  avatarCol: {
    "flex-shrink": 0,
  },
  avatarImg: {
    width: "42px",
    height: "42px",
    "border-radius": "50%",
    "object-fit": "cover",
  },
  avatarFallback: {
    width: "42px",
    height: "42px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "13px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
  },
  body: {
    flex: 1,
    "min-width": 0,
  },
  header: {
    display: "flex",
    "align-items": "flex-start",
    "justify-content": "space-between",
    "margin-bottom": "4px",
  },
  meta: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    flex: 1,
    "min-width": 0,
    overflow: "hidden",
  },
  author: {
    "font-size": "14px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    "white-space": "nowrap",
  },
  nip05: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  dot: {
    color: "var(--w-text-muted)",
    "flex-shrink": 0,
  },
  time: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "white-space": "nowrap",
    "flex-shrink": 0,
  },
  content: {
    "font-size": "15px",
    "line-height": 1.55,
    "word-break": "break-word",
    "white-space": "pre-wrap",
    color: "var(--w-text-secondary)",
  },
  actionBar: {
    display: "flex",
    "justify-content": "space-between",
    "max-width": "400px",
    "margin-top": "12px",
  },
  actionBtn: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 0",
    "font-size": "13px",
    transition: "color 0.15s",
  },
  actionCount: {
    "font-size": "13px",
  },
  clientTag: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "white-space": "nowrap",
  },
  menuWrapper: {
    position: "relative",
    "flex-shrink": 0,
  },
  menuBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--w-text-muted)",
    padding: "4px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    transition: "color 0.15s, background 0.15s",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    right: 0,
    "min-width": "180px",
    background: "var(--w-bg-secondary)",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "8px",
    padding: "4px 0",
    "z-index": 10,
    "box-shadow": "0 4px 12px rgba(0,0,0,0.5)",
  },
  dropdownItem: {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    border: "none",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    "text-align": "left",
    transition: "background 0.1s",
  },
};
