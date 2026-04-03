import { Show, For, createSignal, createMemo, onCleanup } from "solid-js";
import { isWalletConnected, getBalance } from "../lib/wallet";
import { sendZap, ZAP_PRESETS, isZapping, getZapInFlight } from "../lib/zap";
import { formatSats } from "../lib/utils";
import { useNavigate } from "@solidjs/router";

/**
 * Zap amount picker modal.
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   recipientPubkey: string
 *   recipientName: string
 *   recipientLud16: string
 *   eventId: string | null
 *   eventKind: number
 *   eventTags: string[][]
 */
export function ZapDialog(props) {
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = createSignal(ZAP_PRESETS[0]);
  const [isCustom, setIsCustom] = createSignal(false);
  const [customAmount, setCustomAmount] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [isAnonymous, setIsAnonymous] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [success, setSuccess] = createSignal(false);

  const connected = createMemo(() => isWalletConnected());
  const bal = createMemo(() => getBalance());

  const amount = createMemo(() => {
    if (isCustom()) {
      const n = parseInt(customAmount(), 10);
      return n > 0 ? n : 0;
    }
    return selectedPreset();
  });

  function reset() {
    setSelectedPreset(ZAP_PRESETS[0]);
    setIsCustom(false);
    setCustomAmount("");
    setMessage("");
    setIsAnonymous(false);
    setSending(false);
    setError(null);
    setSuccess(false);
  }

  function handleClose() {
    reset();
    props.onClose();
  }

  async function handleZap() {
    if (!amount() || amount() <= 0) return;
    setSending(true);
    setError(null);
    try {
      await sendZap({
        recipientLud16: props.recipientLud16,
        recipientPubkey: props.recipientPubkey,
        eventId: props.eventId,
        eventKind: props.eventKind,
        eventTags: props.eventTags,
        amountSats: amount(),
        message: message(),
        isAnonymous: isAnonymous(),
      });
      setSuccess(true);
      setTimeout(() => handleClose(), 1500);
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  }

  // Close on escape
  function onKey(e) {
    if (e.key === "Escape") handleClose();
  }

  return (
    <Show when={props.isOpen}>
      <div style={styles.overlay} onClick={handleClose} onKeyDown={onKey}>
        <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
          {/* Not connected state */}
          <Show when={!connected()}>
            <div style={{ "text-align": "center", padding: "20px 0" }}>
              <div style={{ "font-size": "32px", "margin-bottom": "12px" }}>&#9889;</div>
              <p style={{ "font-size": "14px", color: "var(--w-text-secondary)", "margin-bottom": "16px" }}>
                Connect a wallet to send zaps.
              </p>
              <button style={styles.primaryBtn} onClick={() => { handleClose(); navigate("/wallet"); }}>
                Set Up Wallet
              </button>
            </div>
          </Show>

          {/* Connected state */}
          <Show when={connected()}>
            {/* Header */}
            <div style={styles.header}>
              <span style={{ color: "#f7931a", "font-size": "18px" }}>&#9889;</span>
              <span>Zap {props.recipientName || "user"}</span>
              <button style={styles.closeBtn} onClick={handleClose}>&times;</button>
            </div>

            {/* Balance */}
            <Show when={bal() !== null}>
              <div style={styles.balanceRow}>
                Balance: {formatSats(bal())} sats
              </div>
            </Show>

            {/* Success */}
            <Show when={success()}>
              <div style={{ "text-align": "center", padding: "20px 0" }}>
                <div style={{ "font-size": "32px", "margin-bottom": "8px", color: "var(--w-success)" }}>{"\u2713"}</div>
                <div style={{ "font-size": "15px", color: "var(--w-success)" }}>
                  Zapped {formatSats(amount())} sats!
                </div>
              </div>
            </Show>

            <Show when={!success()}>
              {/* Amount display */}
              <div style={styles.amountDisplay}>
                {formatSats(amount())} <span style={{ "font-size": "14px", color: "var(--w-text-muted)" }}>sats</span>
              </div>

              {/* Preset chips */}
              <div style={styles.presetRow}>
                <For each={ZAP_PRESETS}>
                  {(preset) => (
                    <button
                      style={{
                        ...styles.presetChip,
                        ...((!isCustom() && selectedPreset() === preset) ? styles.presetChipActive : {}),
                      }}
                      onClick={() => { setIsCustom(false); setSelectedPreset(preset); }}
                    >
                      {formatSats(preset)}
                    </button>
                  )}
                </For>
                <button
                  style={{
                    ...styles.presetChip,
                    ...(isCustom() ? styles.presetChipActive : {}),
                  }}
                  onClick={() => setIsCustom(true)}
                >
                  Custom
                </button>
              </div>

              {/* Custom amount input */}
              <Show when={isCustom()}>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="Enter amount in sats"
                  value={customAmount()}
                  onInput={(e) => setCustomAmount(e.target.value)}
                  min="1"
                />
              </Show>

              {/* Message */}
              <input
                style={{ ...styles.input, "margin-top": "8px" }}
                type="text"
                placeholder="Add a message (optional)"
                value={message()}
                onInput={(e) => setMessage(e.target.value)}
              />

              {/* Anonymous toggle */}
              <label style={styles.toggle}>
                <input
                  type="checkbox"
                  checked={isAnonymous()}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <span style={{ "font-size": "13px", color: "var(--w-text-secondary)" }}>Send anonymously</span>
              </label>

              {/* Error */}
              <Show when={error()}>
                <div style={{ "font-size": "13px", color: "#ef4444", "margin-top": "8px" }}>{error()}</div>
              </Show>

              {/* Zap button */}
              <button
                style={{
                  ...styles.zapBtn,
                  opacity: (sending() || !amount()) ? 0.6 : 1,
                }}
                onClick={handleZap}
                disabled={sending() || !amount()}
              >
                {sending() ? "Zapping..." : `Zap ${formatSats(amount())} sats`}
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "z-index": 1000,
  },
  dialog: {
    background: "var(--w-bg-primary)",
    "border-radius": "12px",
    border: "1px solid var(--w-border)",
    padding: "20px",
    width: "360px",
    "max-width": "90vw",
    "max-height": "85vh",
    overflow: "auto",
  },
  header: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    "font-size": "16px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "margin-bottom": "12px",
  },
  closeBtn: {
    "margin-left": "auto",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "20px",
    cursor: "pointer",
    padding: "0 4px",
  },
  balanceRow: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "margin-bottom": "12px",
  },
  amountDisplay: {
    "text-align": "center",
    "font-size": "28px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "margin-bottom": "12px",
  },
  presetRow: {
    display: "flex",
    gap: "6px",
    "flex-wrap": "wrap",
    "margin-bottom": "12px",
  },
  presetChip: {
    padding: "6px 12px",
    "border-radius": "16px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "13px",
    cursor: "pointer",
    transition: "all 0.1s",
  },
  presetChipActive: {
    background: "#f7931a",
    "border-color": "#f7931a",
    color: "#fff",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-primary)",
    "font-size": "13px",
    outline: "none",
    "box-sizing": "border-box",
  },
  toggle: {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    "margin-top": "10px",
    cursor: "pointer",
    "user-select": "none",
  },
  zapBtn: {
    width: "100%",
    padding: "10px",
    "border-radius": "8px",
    border: "none",
    background: "#f7931a",
    color: "#fff",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    "margin-top": "14px",
    transition: "opacity 0.15s",
  },
  primaryBtn: {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "none",
    "background-color": "var(--w-accent)",
    color: "#fff",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    width: "100%",
  },
};
