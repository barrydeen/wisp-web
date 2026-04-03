import { createMemo, For, Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { parseContent, parseImetaTags, buildEmojiMap } from "../lib/content";
import { getProfile } from "../lib/profiles";
import { npubShort } from "../lib/utils";
import { EmbeddedNote } from "./EmbeddedNote";

function isInline(seg) {
  return (
    seg.type === "text" ||
    seg.type === "hashtag" ||
    seg.type === "nostr-profile" ||
    seg.type === "custom-emoji" ||
    seg.type === "inline-link"
  );
}

/** Group consecutive inline segments into runs, keeping block segments separate */
function groupSegments(segments) {
  const groups = [];
  let currentInline = null;

  for (const seg of segments) {
    if (isInline(seg)) {
      if (!currentInline) {
        currentInline = { type: "inline-group", segments: [] };
      }
      currentInline.segments.push(seg);
    } else {
      if (currentInline) {
        groups.push(currentInline);
        currentInline = null;
      }
      groups.push(seg);
    }
  }
  if (currentInline) groups.push(currentInline);

  return groups;
}

// --- Inline segment renderers ---

function TextSegment(props) {
  return <>{props.text}</>;
}

function InlineLinkSegment(props) {
  // Truncate display URL
  let display;
  try {
    const u = new URL(props.url);
    display = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    if (display.length > 50) display = display.substring(0, 47) + "...";
  } catch {
    display = props.url.length > 50 ? props.url.substring(0, 47) + "..." : props.url;
  }

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      style={styles.link}
      onClick={(e) => e.stopPropagation()}
    >
      {display}
    </a>
  );
}

function HashtagSegment(props) {
  return <span style={styles.hashtag}>#{props.tag}</span>;
}

function ProfileMention(props) {
  const profile = createMemo(() => getProfile(props.pubkey));
  const displayName = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || npubShort(props.pubkey);
  });

  return (
    <A
      href={`/profile/${props.pubkey}`}
      style={styles.mention}
      onClick={(e) => e.stopPropagation()}
    >
      @{displayName()}
    </A>
  );
}

function CustomEmojiSegment(props) {
  return (
    <img
      src={props.url}
      alt={`:${props.shortcode}:`}
      title={`:${props.shortcode}:`}
      style={styles.customEmoji}
      loading="lazy"
    />
  );
}

// --- Block segment renderers ---

function ImageSegment(props) {
  return (
    <div style={styles.mediaBlock}>
      <img
        src={props.url}
        style={styles.image}
        loading="lazy"
        onClick={(e) => {
          e.stopPropagation();
          window.open(props.url, "_blank");
        }}
      />
    </div>
  );
}

function VideoSegment(props) {
  return (
    <div style={styles.mediaBlock}>
      <video
        src={props.url}
        controls
        preload="metadata"
        style={styles.video}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function AudioSegment(props) {
  return (
    <div style={styles.mediaBlock}>
      <audio
        src={props.url}
        controls
        preload="metadata"
        style={styles.audio}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function LinkSegment(props) {
  let display;
  try {
    const u = new URL(props.url);
    display = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    if (display.length > 60) display = display.substring(0, 57) + "...";
  } catch {
    display = props.url;
  }

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      style={styles.linkCard}
      onClick={(e) => e.stopPropagation()}
    >
      <span style={styles.linkCardUrl}>{display}</span>
    </a>
  );
}

function LightningInvoiceSegment(props) {
  const [copied, setCopied] = createSignal(false);

  function handleCopy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(props.invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={styles.invoiceCard} onClick={(e) => e.stopPropagation()}>
      <div style={styles.invoiceHeader}>
        <span style={styles.invoiceIcon}>&#9889;</span>
        <span style={styles.invoiceLabel}>Lightning Invoice</span>
      </div>
      <div style={styles.invoiceBody}>
        <code style={styles.invoiceCode}>
          {props.invoice.substring(0, 30)}...
        </code>
        <button style={styles.invoiceCopyBtn} onClick={handleCopy}>
          {copied() ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function NostrAddrSegment(props) {
  return (
    <div style={styles.addrCard}>
      <span style={styles.addrLabel}>Nostr Reference</span>
      <span style={styles.addrDetail}>
        {props.identifier ? `d:${props.identifier}` : ""}
        {props.kind != null ? ` kind:${props.kind}` : ""}
      </span>
    </div>
  );
}

function GroupInviteSegment(props) {
  return (
    <div style={styles.groupCard}>
      <span style={styles.groupLabel}>Group Invite</span>
      <span style={styles.groupRelay}>{props.relay}</span>
      <span style={styles.groupId}>{props.groupId}</span>
    </div>
  );
}

// --- Inline group renderer ---

function InlineGroup(props) {
  return (
    <span>
      <For each={props.segments}>
        {(seg) => {
          switch (seg.type) {
            case "text":
              return <TextSegment text={seg.text} />;
            case "inline-link":
              return <InlineLinkSegment url={seg.url} />;
            case "hashtag":
              return <HashtagSegment tag={seg.tag} />;
            case "nostr-profile":
              return <ProfileMention pubkey={seg.pubkey} />;
            case "custom-emoji":
              return <CustomEmojiSegment shortcode={seg.shortcode} url={seg.url} />;
            default:
              return null;
          }
        }}
      </For>
    </span>
  );
}

// --- Main component ---

export function RichContent(props) {
  const emojiMap = createMemo(() => buildEmojiMap(props.tags));
  const imetaMap = createMemo(() => parseImetaTags(props.tags));

  const groups = createMemo(() => {
    const segments = parseContent(props.content || "", emojiMap(), imetaMap());
    return groupSegments(segments);
  });

  return (
    <For each={groups()}>
      {(group) => {
        if (group.type === "inline-group") {
          return <InlineGroup segments={group.segments} />;
        }

        switch (group.type) {
          case "image":
            return <ImageSegment url={group.url} />;
          case "video":
            return <VideoSegment url={group.url} />;
          case "audio":
            return <AudioSegment url={group.url} />;
          case "link":
            return <LinkSegment url={group.url} />;
          case "nostr-note":
            return <EmbeddedNote id={group.id} relays={group.relays} />;
          case "nostr-addr":
            return (
              <NostrAddrSegment
                identifier={group.identifier}
                pubkey={group.pubkey}
                kind={group.kind}
              />
            );
          case "lightning-invoice":
            return <LightningInvoiceSegment invoice={group.invoice} />;
          case "group-invite":
            return <GroupInviteSegment relay={group.relay} groupId={group.groupId} />;
          default:
            return null;
        }
      }}
    </For>
  );
}

// --- Styles ---

const styles = {
  // Inline styles
  link: {
    color: "var(--w-accent)",
    "text-decoration": "none",
    "word-break": "break-all",
  },
  hashtag: {
    color: "var(--w-accent)",
  },
  mention: {
    color: "var(--w-accent)",
    "text-decoration": "none",
    "font-weight": 500,
  },
  customEmoji: {
    height: "1.2em",
    "vertical-align": "middle",
    margin: "0 1px",
  },

  // Media blocks
  mediaBlock: {
    margin: "8px 0",
  },
  image: {
    "max-width": "100%",
    "max-height": "500px",
    "border-radius": "12px",
    cursor: "pointer",
    display: "block",
  },
  video: {
    "max-width": "100%",
    "max-height": "500px",
    "border-radius": "12px",
    display: "block",
  },
  audio: {
    width: "100%",
    "max-width": "400px",
  },

  // Link card (standalone URL)
  linkCard: {
    display: "block",
    margin: "8px 0",
    padding: "10px 14px",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    color: "var(--w-accent)",
    "text-decoration": "none",
    "font-size": "14px",
    "word-break": "break-all",
    transition: "background 0.1s",
  },
  linkCardUrl: {
    "font-size": "14px",
  },

  // Lightning invoice
  invoiceCard: {
    margin: "8px 0",
    padding: "12px",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    background: "var(--w-bg-primary)",
  },
  invoiceHeader: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    "margin-bottom": "8px",
  },
  invoiceIcon: {
    "font-size": "16px",
  },
  invoiceLabel: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
  },
  invoiceBody: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
  },
  invoiceCode: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    flex: 1,
    overflow: "hidden",
  },
  invoiceCopyBtn: {
    background: "var(--w-accent)",
    color: "#fff",
    border: "none",
    "border-radius": "6px",
    padding: "4px 12px",
    "font-size": "12px",
    cursor: "pointer",
    "flex-shrink": 0,
  },

  // Nostr addressable reference
  addrCard: {
    margin: "8px 0",
    padding: "10px 14px",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
  },
  addrLabel: {
    "font-size": "12px",
    "font-weight": 600,
    color: "var(--w-text-muted)",
  },
  addrDetail: {
    "font-size": "13px",
    color: "var(--w-text-secondary)",
  },

  // Group invite
  groupCard: {
    margin: "8px 0",
    padding: "10px 14px",
    border: "1px solid var(--w-border-subtle)",
    "border-radius": "12px",
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
  },
  groupLabel: {
    "font-size": "12px",
    "font-weight": 600,
    color: "var(--w-text-muted)",
  },
  groupRelay: {
    "font-size": "13px",
    color: "var(--w-text-secondary)",
  },
  groupId: {
    "font-size": "13px",
    color: "var(--w-accent)",
  },
};
