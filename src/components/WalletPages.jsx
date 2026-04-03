import { Show, For, createSignal, createMemo, onCleanup, onMount } from "solid-js";
import {
  getWalletMode, getBalance, isWalletConnected, getStatusLines,
  navigateTo, navigateBack, navigateHome,
  connectNwcWallet, connectSparkWallet, disconnectWallet,
  fetchBalance, payInvoice, makeInvoice, listTransactions,
  prepareSend, sendPrepared,
} from "../lib/wallet";
import { backupToRelays, restoreFromRelays, newMnemonic, checkMnemonic, sparkGetLightningAddress, sparkCheckLightningAddressAvailable, sparkRegisterLightningAddress, sparkDeleteLightningAddress } from "../lib/spark";
import QRCode from "qrcode";
import { formatSats } from "../lib/utils";
import { getLoginState } from "../lib/identity";

// --- Shared styles ---

const s = {
  page: {
    padding: "24px 20px",
  },
  pageTitle: {
    "font-size": "18px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "margin-bottom": "16px",
    display: "flex",
    "align-items": "center",
    gap: "10px",
  },
  backBtn: {
    padding: "4px 8px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    cursor: "pointer",
    "font-size": "16px",
  },
  card: {
    padding: "16px",
    "border-radius": "10px",
    border: "1px solid var(--w-border-input)",
    "margin-bottom": "12px",
  },
  label: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-tertiary)",
    "margin-bottom": "6px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-primary)",
    "font-size": "14px",
    outline: "none",
    "box-sizing": "border-box",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-primary)",
    "font-size": "13px",
    "font-family": "'SF Mono', 'Fira Code', Consolas, monospace",
    outline: "none",
    resize: "vertical",
    "min-height": "80px",
    "box-sizing": "border-box",
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
    transition: "opacity 0.15s",
  },
  secondaryBtn: {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    cursor: "pointer",
    width: "100%",
  },
  dangerBtn: {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "1px solid #ef4444",
    background: "transparent",
    color: "#ef4444",
    "font-size": "14px",
    cursor: "pointer",
    width: "100%",
  },
  statusLog: {
    "font-size": "12px",
    color: "var(--w-text-muted)",
    "font-family": "'SF Mono', 'Fira Code', Consolas, monospace",
    "white-space": "pre-wrap",
    "max-height": "120px",
    overflow: "auto",
    "margin-top": "8px",
  },
  muted: {
    "font-size": "13px",
    color: "var(--w-text-muted)",
    "line-height": "1.5",
  },
  row: {
    display: "flex",
    gap: "10px",
  },
  error: {
    "font-size": "13px",
    color: "#ef4444",
    "margin-top": "8px",
  },
  success: {
    "font-size": "13px",
    color: "var(--w-success)",
    "margin-top": "8px",
  },
  mb: { "margin-bottom": "12px" },
  mb2: { "margin-bottom": "20px" },
};

function PageHeader(props) {
  return (
    <div style={s.pageTitle}>
      <Show when={props.back !== false}>
        <button style={s.backBtn} onClick={() => navigateBack()}>&#8592;</button>
      </Show>
      {props.title}
    </div>
  );
}

function StatusLog() {
  const lines = createMemo(() => getStatusLines());
  return (
    <Show when={lines().length > 0}>
      <div style={s.statusLog}>{lines().join("\n")}</div>
    </Show>
  );
}

// --- WalletHome ---

export function WalletHome() {
  const connected = createMemo(() => isWalletConnected());
  const mode = createMemo(() => getWalletMode());
  const bal = createMemo(() => getBalance());
  const loggedIn = createMemo(() => getLoginState() === "logged-in");
  const [refreshing, setRefreshing] = createSignal(false);

  async function handleRefresh() {
    setRefreshing(true);
    try { await fetchBalance(); } catch {}
    setRefreshing(false);
  }

  return (
    <div style={s.page}>
      <PageHeader title="Wallet" back={false} />

      <Show when={!loggedIn()}>
        <p style={s.muted}>Log in to set up a wallet.</p>
      </Show>

      <Show when={loggedIn() && !connected()}>
        <div style={{ ...s.card, "text-align": "center", padding: "32px 20px" }}>
          <div style={{ "font-size": "40px", "margin-bottom": "12px" }}>&#9889;</div>
          <p style={{ "font-size": "15px", color: "var(--w-text-secondary)", "margin-bottom": "20px" }}>
            Set up a wallet to send and receive Lightning payments and zap notes.
          </p>
          <button style={s.primaryBtn} onClick={() => navigateTo("mode-selection")}>
            Set Up Wallet
          </button>
        </div>
      </Show>

      <Show when={loggedIn() && connected()}>
        {/* Balance */}
        <div style={{ ...s.card, "text-align": "center", padding: "24px 20px" }}>
          <div style={{ "font-size": "12px", color: "var(--w-text-muted)", "margin-bottom": "4px", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>
            Balance
          </div>
          <div style={{ "font-size": "32px", "font-weight": 700, color: "var(--w-text-primary)" }}>
            {bal() !== null ? formatSats(bal()) : "..."}
            <span style={{ "font-size": "14px", "font-weight": 400, color: "var(--w-text-muted)", "margin-left": "6px" }}>sats</span>
          </div>
          <button
            style={{ ...s.backBtn, "margin-top": "4px", "font-size": "12px" }}
            onClick={handleRefresh}
            disabled={refreshing()}
          >
            {refreshing() ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Send / Receive */}
        <div style={{ ...s.row, ...s.mb }}>
          <button style={{ ...s.primaryBtn, flex: 1 }} onClick={() => navigateTo("send-input")}>
            Send
          </button>
          <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => navigateTo("receive-amount")}>
            Receive
          </button>
        </div>

        {/* Quick links */}
        <button style={{ ...s.secondaryBtn, ...s.mb }} onClick={() => navigateTo("transactions")}>
          Transaction History
        </button>
        <button style={{ ...s.secondaryBtn, ...s.mb }} onClick={() => navigateTo("settings")}>
          Wallet Settings
        </button>

        <div style={{ "font-size": "12px", color: "var(--w-text-muted)", "text-align": "center", "margin-top": "8px" }}>
          {mode() === "nwc" ? "Connected via NWC" : "Spark Wallet"}
        </div>
      </Show>
    </div>
  );
}

// --- ModeSelection ---

export function ModeSelection() {
  return (
    <div style={s.page}>
      <PageHeader title="Choose Wallet Type" />

      <button
        style={{ ...s.card, width: "100%", cursor: "pointer", "text-align": "left", border: "1px solid var(--w-border-input)", background: "transparent" }}
        onClick={() => navigateTo("spark-setup")}
      >
        <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)", "margin-bottom": "6px" }}>
          &#9889; Spark Wallet
        </div>
        <div style={s.muted}>
          Self-custodial Lightning wallet powered by Breez SDK. Create a new wallet or restore from a recovery phrase.
        </div>
      </button>

      <button
        style={{ ...s.card, width: "100%", cursor: "pointer", "text-align": "left", border: "1px solid var(--w-border-input)", background: "transparent" }}
        onClick={() => navigateTo("nwc-setup")}
      >
        <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)", "margin-bottom": "6px" }}>
          &#128279; Nostr Wallet Connect
        </div>
        <div style={s.muted}>
          Connect an external wallet using NWC (NIP-47). Works with Alby, Mutiny, NWC Hub, and other compatible wallets.
        </div>
      </button>
    </div>
  );
}

// --- NwcSetup ---

export function NwcSetup() {
  const [uri, setUri] = createSignal("");
  const [connecting, setConnecting] = createSignal(false);
  const [error, setError] = createSignal(null);

  async function handleConnect() {
    const val = uri().trim();
    if (!val) return;
    setConnecting(true);
    setError(null);
    try {
      await connectNwcWallet(val);
      navigateHome();
    } catch (e) {
      setError(e.message);
    }
    setConnecting(false);
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setUri(text);
    } catch {}
  }

  return (
    <div style={s.page}>
      <PageHeader title="Connect NWC Wallet" />

      <label style={s.label}>Connection URI</label>
      <textarea
        style={s.textarea}
        placeholder="nostr+walletconnect://..."
        value={uri()}
        onInput={(e) => setUri(e.target.value)}
      />
      <div style={{ ...s.row, "margin-top": "8px", ...s.mb2 }}>
        <button style={{ ...s.secondaryBtn, flex: "none", width: "auto", padding: "8px 14px" }} onClick={handlePaste}>
          Paste
        </button>
      </div>

      <button
        style={{ ...s.primaryBtn, opacity: connecting() ? 0.6 : 1 }}
        onClick={handleConnect}
        disabled={connecting() || !uri().trim()}
      >
        {connecting() ? "Connecting..." : "Connect"}
      </button>

      <Show when={error()}>
        <div style={s.error}>{error()}</div>
      </Show>

      <StatusLog />

      <div style={{ ...s.muted, "margin-top": "20px" }}>
        <strong>Where to get an NWC URI:</strong><br />
        Alby, Mutiny Wallet, NWC Hub, or any NIP-47 compatible wallet. Look for "Nostr Wallet Connect" in your wallet's settings.
      </div>
    </div>
  );
}

// --- SparkSetup ---

export function SparkSetup() {
  const [mode, setMode] = createSignal("choose"); // "choose" | "create" | "restore"
  const [mnemonic, setMnemonic] = createSignal("");
  const [generatedMnemonic, setGeneratedMnemonic] = createSignal(null);
  const [connecting, setConnecting] = createSignal(false);
  const [error, setError] = createSignal(null);

  function handleStartCreate() {
    const phrase = newMnemonic();
    setGeneratedMnemonic(phrase);
    setMode("create");
  }

  async function handleCreate() {
    const phrase = generatedMnemonic();
    if (!phrase) return;
    setConnecting(true);
    setError(null);
    try {
      await connectSparkWallet(phrase);
      navigateHome();
    } catch (e) {
      setError(e.message);
    }
    setConnecting(false);
  }

  async function handleRestore() {
    const phrase = mnemonic().trim();
    if (!phrase) {
      setError("Please enter your recovery phrase.");
      return;
    }
    const validationError = checkMnemonic(phrase);
    if (validationError) {
      setError(validationError);
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await connectSparkWallet(phrase);
      navigateHome();
    } catch (e) {
      setError(e.message);
    }
    setConnecting(false);
  }

  const generatedWords = createMemo(() => generatedMnemonic()?.split(/\s+/) || []);

  return (
    <div style={s.page}>
      <PageHeader title="Spark Wallet" />

      <Show when={mode() === "choose"}>
        <button
          style={{ ...s.card, width: "100%", cursor: "pointer", "text-align": "left", border: "1px solid var(--w-border-input)", background: "transparent" }}
          onClick={handleStartCreate}
        >
          <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)", "margin-bottom": "4px" }}>
            Create New Wallet
          </div>
          <div style={s.muted}>Generate a new recovery phrase and set up a fresh wallet.</div>
        </button>

        <button
          style={{ ...s.card, width: "100%", cursor: "pointer", "text-align": "left", border: "1px solid var(--w-border-input)", background: "transparent" }}
          onClick={() => setMode("restore")}
        >
          <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)", "margin-bottom": "4px" }}>
            Restore Wallet
          </div>
          <div style={s.muted}>Restore from a recovery phrase.</div>
        </button>

        <button
          style={{ ...s.secondaryBtn, "margin-top": "4px" }}
          onClick={() => navigateTo("restore-from-relay")}
        >
          Restore from Relay Backup
        </button>
      </Show>

      {/* Create: show generated mnemonic for user to back up */}
      <Show when={mode() === "create"}>
        <p style={{ ...s.muted, ...s.mb }}>
          Write down these 12 words in order. This is your wallet recovery phrase — store it safely.
        </p>

        <div style={{ ...s.card, background: "var(--w-bg-secondary)", ...s.mb }}>
          <div style={{
            display: "grid",
            "grid-template-columns": "repeat(3, 1fr)",
            gap: "8px",
          }}>
            <For each={generatedWords()}>
              {(word, i) => (
                <div style={{
                  padding: "6px 8px",
                  "border-radius": "6px",
                  border: "1px solid var(--w-border-secondary)",
                  "font-size": "13px",
                  color: "var(--w-text-primary)",
                }}>
                  <span style={{ color: "var(--w-text-muted)", "margin-right": "4px" }}>{i() + 1}.</span>
                  {word}
                </div>
              )}
            </For>
          </div>
        </div>

        <button
          style={{ ...s.primaryBtn, opacity: connecting() ? 0.6 : 1 }}
          onClick={handleCreate}
          disabled={connecting()}
        >
          {connecting() ? "Connecting..." : "I've backed it up - Create Wallet"}
        </button>

        <Show when={error()}>
          <div style={s.error}>{error()}</div>
        </Show>
        <StatusLog />

        <button style={{ ...s.secondaryBtn, "margin-top": "12px" }} onClick={() => { setGeneratedMnemonic(null); setMode("choose"); }}>
          Back
        </button>
      </Show>

      {/* Restore: enter existing mnemonic */}
      <Show when={mode() === "restore"}>
        <label style={s.label}>Recovery Phrase</label>
        <textarea
          style={{ ...s.textarea, ...s.mb2 }}
          placeholder="Enter 12 or 24 word recovery phrase..."
          value={mnemonic()}
          onInput={(e) => setMnemonic(e.target.value)}
          rows={3}
        />

        <button
          style={{ ...s.primaryBtn, opacity: connecting() ? 0.6 : 1 }}
          onClick={handleRestore}
          disabled={connecting()}
        >
          {connecting() ? "Connecting..." : "Restore Wallet"}
        </button>

        <Show when={error()}>
          <div style={s.error}>{error()}</div>
        </Show>
        <StatusLog />

        <button style={{ ...s.secondaryBtn, "margin-top": "12px" }} onClick={() => setMode("choose")}>
          Back
        </button>
      </Show>
    </div>
  );
}

// --- SparkBackup ---

export function SparkBackup() {
  const [mnemonic, setMnemonicLocal] = createSignal(null);
  const [backing, setBacking] = createSignal(false);
  const [backupDone, setBackupDone] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [copied, setCopied] = createSignal(false);

  // Load mnemonic from localStorage
  import("../lib/identity").then(({ getPubkey }) => {
    import("../lib/spark").then(({ getMnemonic }) => {
      const pk = getPubkey();
      if (pk) setMnemonicLocal(getMnemonic(pk));
    });
  });

  async function handleBackup() {
    if (!mnemonic()) return;
    setBacking(true);
    setError(null);
    try {
      await backupToRelays(mnemonic());
      setBackupDone(true);
    } catch (e) {
      setError(e.message);
    }
    setBacking(false);
  }

  function handleCopy() {
    if (!mnemonic()) return;
    navigator.clipboard.writeText(mnemonic());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const words = createMemo(() => mnemonic()?.split(/\s+/) || []);

  return (
    <div style={s.page}>
      <PageHeader title="Recovery Phrase" />

      <Show when={mnemonic()} fallback={<p style={s.muted}>No recovery phrase found.</p>}>
        <div style={{ ...s.card, background: "var(--w-bg-secondary)" }}>
          <div style={{
            display: "grid",
            "grid-template-columns": "repeat(3, 1fr)",
            gap: "8px",
          }}>
            <For each={words()}>
              {(word, i) => (
                <div style={{
                  padding: "6px 8px",
                  "border-radius": "6px",
                  border: "1px solid var(--w-border-secondary)",
                  "font-size": "13px",
                  color: "var(--w-text-primary)",
                }}>
                  <span style={{ color: "var(--w-text-muted)", "margin-right": "4px" }}>{i() + 1}.</span>
                  {word}
                </div>
              )}
            </For>
          </div>
        </div>

        <div style={{ ...s.row, ...s.mb }}>
          <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={handleCopy}>
            {copied() ? "Copied!" : "Copy Phrase"}
          </button>
          <button
            style={{ ...s.primaryBtn, flex: 1, opacity: backing() ? 0.6 : 1 }}
            onClick={handleBackup}
            disabled={backing() || backupDone()}
          >
            {backupDone() ? "Backed Up" : backing() ? "Backing up..." : "Back Up to Relays"}
          </button>
        </div>

        <Show when={error()}><div style={s.error}>{error()}</div></Show>
        <Show when={backupDone()}><div style={s.success}>Mnemonic backed up to relays (NIP-78, encrypted).</div></Show>

        <p style={s.muted}>
          Write down these words in order and store them safely. Anyone with this phrase can access your wallet.
        </p>
      </Show>
    </div>
  );
}

// --- SendInput ---

export function SendInput() {
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal(null);
  const [preparing, setPreparing] = createSignal(false);

  async function handleNext() {
    const val = input().trim();
    if (!val) return;
    setPreparing(true);
    setError(null);

    try {
      // Store input for SendConfirm to use
      sessionStorage.setItem("wisp:send:input", val);

      // Try to prepare (Spark gets fee estimate, NWC skips)
      const { feeSats, prepareResponse } = await prepareSend(val);
      if (prepareResponse) {
        sessionStorage.setItem("wisp:send:feeSats", feeSats?.toString() || "");
        // Store the prepare response reference in memory
        window.__wispPrepareResponse = prepareResponse;
      }
      navigateTo("send-confirm");
    } catch (e) {
      setError(e.message);
    }
    setPreparing(false);
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
    } catch {}
  }

  return (
    <div style={s.page}>
      <PageHeader title="Send Payment" />

      <label style={s.label}>Lightning Invoice or Address</label>
      <textarea
        style={{ ...s.textarea, ...s.mb }}
        placeholder="Paste a BOLT11 invoice or lightning address..."
        value={input()}
        onInput={(e) => setInput(e.target.value)}
      />

      <div style={{ ...s.row, ...s.mb2 }}>
        <button style={{ ...s.secondaryBtn, flex: "none", width: "auto", padding: "8px 14px" }} onClick={handlePaste}>
          Paste
        </button>
      </div>

      <button
        style={{ ...s.primaryBtn, opacity: preparing() ? 0.6 : 1 }}
        onClick={handleNext}
        disabled={preparing() || !input().trim()}
      >
        {preparing() ? "Preparing..." : "Next"}
      </button>

      <Show when={error()}><div style={s.error}>{error()}</div></Show>
    </div>
  );
}

// --- SendConfirm ---

export function SendConfirm() {
  const [paying, setPaying] = createSignal(false);
  const [error, setError] = createSignal(null);
  const input = sessionStorage.getItem("wisp:send:input") || "";
  const feeSats = sessionStorage.getItem("wisp:send:feeSats");

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const prepareResponse = window.__wispPrepareResponse;
      let result;
      if (prepareResponse) {
        result = await sendPrepared(prepareResponse);
      } else {
        result = await payInvoice(input);
      }
      sessionStorage.setItem("wisp:send:result", "success");
      sessionStorage.setItem("wisp:send:resultId", result || "");
      window.__wispPrepareResponse = null;
      navigateTo("send-result");
    } catch (e) {
      setError(e.message);
    }
    setPaying(false);
  }

  return (
    <div style={s.page}>
      <PageHeader title="Confirm Payment" />

      <div style={s.card}>
        <div style={{ "font-size": "13px", color: "var(--w-text-muted)", "margin-bottom": "8px" }}>Invoice / Address</div>
        <div style={{
          "font-size": "12px",
          color: "var(--w-text-secondary)",
          "font-family": "'SF Mono', 'Fira Code', Consolas, monospace",
          "word-break": "break-all",
          "max-height": "80px",
          overflow: "auto",
        }}>
          {input}
        </div>
        <Show when={feeSats}>
          <div style={{ "margin-top": "12px", "font-size": "13px", color: "var(--w-text-tertiary)" }}>
            Estimated fee: ~{feeSats} sats
          </div>
        </Show>
      </div>

      <button
        style={{ ...s.primaryBtn, opacity: paying() ? 0.6 : 1 }}
        onClick={handlePay}
        disabled={paying()}
      >
        {paying() ? "Paying..." : "Pay"}
      </button>

      <Show when={error()}><div style={s.error}>{error()}</div></Show>
      <StatusLog />
    </div>
  );
}

// --- Sending ---

export function Sending() {
  return (
    <div style={s.page}>
      <PageHeader title="Sending..." back={false} />
      <div style={{ "text-align": "center", padding: "40px 0" }}>
        <div style={{ "font-size": "32px", "margin-bottom": "12px" }}>&#9889;</div>
        <p style={s.muted}>Payment in progress...</p>
        <StatusLog />
      </div>
    </div>
  );
}

// --- SendResult ---

export function SendResult() {
  const result = sessionStorage.getItem("wisp:send:result") || "unknown";

  return (
    <div style={s.page}>
      <PageHeader title={result === "success" ? "Payment Sent" : "Payment Failed"} back={false} />
      <div style={{ "text-align": "center", padding: "40px 0" }}>
        <div style={{ "font-size": "48px", "margin-bottom": "12px" }}>
          {result === "success" ? "\u2713" : "\u2717"}
        </div>
        <p style={{ "font-size": "15px", color: result === "success" ? "var(--w-success)" : "#ef4444" }}>
          {result === "success" ? "Payment sent successfully." : "Payment failed."}
        </p>
      </div>
      <button style={s.primaryBtn} onClick={navigateHome}>
        Done
      </button>
    </div>
  );
}

// --- ReceiveAmount ---

export function ReceiveAmount() {
  const [amount, setAmount] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal(null);

  async function handleCreate() {
    const sats = parseInt(amount(), 10);
    if (!sats || sats <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const invoice = await makeInvoice(sats, description().trim());
      sessionStorage.setItem("wisp:receive:invoice", invoice);
      sessionStorage.setItem("wisp:receive:amount", sats.toString());
      navigateTo("receive-invoice");
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  }

  return (
    <div style={s.page}>
      <PageHeader title="Receive Payment" />

      <label style={s.label}>Amount (sats)</label>
      <input
        style={{ ...s.input, ...s.mb }}
        type="number"
        placeholder="0"
        value={amount()}
        onInput={(e) => setAmount(e.target.value)}
        min="1"
      />

      <label style={s.label}>Description (optional)</label>
      <input
        style={{ ...s.input, ...s.mb2 }}
        type="text"
        placeholder="What is this payment for?"
        value={description()}
        onInput={(e) => setDescription(e.target.value)}
      />

      <button
        style={{ ...s.primaryBtn, opacity: creating() ? 0.6 : 1 }}
        onClick={handleCreate}
        disabled={creating()}
      >
        {creating() ? "Creating..." : "Create Invoice"}
      </button>

      <Show when={error()}><div style={s.error}>{error()}</div></Show>
      <StatusLog />
    </div>
  );
}

// --- ReceiveInvoice ---

export function ReceiveInvoice() {
  const invoice = sessionStorage.getItem("wisp:receive:invoice") || "";
  const amount = sessionStorage.getItem("wisp:receive:amount") || "";
  const [copied, setCopied] = createSignal(false);
  const [qrDataUrl, setQrDataUrl] = createSignal(null);

  onMount(async () => {
    if (invoice) {
      try {
        const url = await QRCode.toDataURL(invoice.toUpperCase(), {
          width: 280,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        setQrDataUrl(url);
      } catch {}
    }
  });

  function handleCopy() {
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={s.page}>
      <PageHeader title="Invoice Created" />

      <div style={{ ...s.card, "text-align": "center" }}>
        <div style={{ "font-size": "24px", "font-weight": 700, color: "var(--w-text-primary)", "margin-bottom": "12px" }}>
          {formatSats(parseInt(amount, 10))} sats
        </div>
        <Show when={qrDataUrl()}>
          <img
            src={qrDataUrl()}
            alt="Lightning invoice QR code"
            style={{ width: "280px", height: "280px", "border-radius": "8px", "image-rendering": "pixelated" }}
          />
        </Show>
      </div>

      <div style={s.card}>
        <div style={{ "font-size": "12px", color: "var(--w-text-muted)", "margin-bottom": "6px" }}>Lightning Invoice</div>
        <div style={{
          "font-size": "11px",
          color: "var(--w-text-secondary)",
          "font-family": "'SF Mono', 'Fira Code', Consolas, monospace",
          "word-break": "break-all",
          "max-height": "100px",
          overflow: "auto",
        }}>
          {invoice}
        </div>
      </div>

      <button style={{ ...s.primaryBtn, ...s.mb }} onClick={handleCopy}>
        {copied() ? "Copied!" : "Copy Invoice"}
      </button>

      <button style={s.secondaryBtn} onClick={navigateHome}>
        Done
      </button>
    </div>
  );
}

// --- ReceiveSuccess ---

export function ReceiveSuccess() {
  return (
    <div style={s.page}>
      <PageHeader title="Payment Received" back={false} />
      <div style={{ "text-align": "center", padding: "40px 0" }}>
        <div style={{ "font-size": "48px", "margin-bottom": "12px" }}>{"\u2713"}</div>
        <p style={{ "font-size": "15px", color: "var(--w-success)" }}>Payment received!</p>
      </div>
      <button style={s.primaryBtn} onClick={navigateHome}>Done</button>
    </div>
  );
}

// --- Transactions ---

export function Transactions() {
  const [txs, setTxs] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);

  (async () => {
    try {
      const list = await listTransactions(50, 0);
      setTxs(list);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  })();

  return (
    <div style={s.page}>
      <PageHeader title="Transactions" />

      <Show when={loading()}>
        <p style={s.muted}>Loading transactions...</p>
      </Show>

      <Show when={error()}>
        <div style={s.error}>{error()}</div>
      </Show>

      <Show when={!loading() && txs().length === 0 && !error()}>
        <p style={s.muted}>No transactions yet.</p>
      </Show>

      <For each={txs()}>
        {(tx) => (
          <div style={{
            display: "flex",
            "align-items": "center",
            gap: "12px",
            padding: "12px 0",
            "border-bottom": "1px solid var(--w-border-secondary)",
          }}>
            <div style={{
              width: "32px",
              height: "32px",
              "border-radius": "50%",
              background: tx.type === "incoming" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "font-size": "14px",
              "flex-shrink": 0,
            }}>
              {tx.type === "incoming" ? "\u2193" : "\u2191"}
            </div>
            <div style={{ flex: 1, "min-width": 0 }}>
              <div style={{ "font-size": "14px", color: "var(--w-text-primary)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                {tx.description || (tx.type === "incoming" ? "Received" : "Sent")}
              </div>
              <div style={{ "font-size": "12px", color: "var(--w-text-muted)" }}>
                {tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : ""}
              </div>
            </div>
            <div style={{
              "font-size": "14px",
              "font-weight": 600,
              color: tx.type === "incoming" ? "var(--w-success)" : "var(--w-text-primary)",
              "flex-shrink": 0,
            }}>
              {tx.type === "incoming" ? "+" : "-"}{formatSats(tx.amount)} sats
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

// --- WalletSettings ---

export function WalletSettings() {
  const mode = createMemo(() => getWalletMode());
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  function handleDisconnect() {
    disconnectWallet();
    navigateHome();
  }

  return (
    <div style={s.page}>
      <PageHeader title="Wallet Settings" />

      <div style={s.card}>
        <div style={{ "font-size": "13px", color: "var(--w-text-muted)", "margin-bottom": "4px" }}>Wallet Type</div>
        <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)" }}>
          {mode() === "nwc" ? "Nostr Wallet Connect" : mode() === "spark" ? "Spark Wallet" : "None"}
        </div>
      </div>

      <Show when={mode() === "spark"}>
        <LightningAddressSection />

        <button style={{ ...s.secondaryBtn, ...s.mb }} onClick={() => navigateTo("spark-backup")}>
          View Recovery Phrase
        </button>
        <button style={{ ...s.secondaryBtn, ...s.mb }} onClick={async () => {
          try {
            const { getPubkey } = await import("../lib/identity");
            const { getMnemonic } = await import("../lib/spark");
            const pk = getPubkey();
            if (pk) {
              const m = getMnemonic(pk);
              if (m) await backupToRelays(m);
            }
          } catch {}
        }}>
          Back Up to Relays
        </button>
      </Show>

      <Show when={!confirmDelete()}>
        <button style={{ ...s.dangerBtn, "margin-top": "20px" }} onClick={() => setConfirmDelete(true)}>
          Disconnect Wallet
        </button>
      </Show>

      <Show when={confirmDelete()}>
        <div style={{ ...s.card, "border-color": "#ef4444", "margin-top": "20px" }}>
          <p style={{ "font-size": "14px", color: "#ef4444", "margin-bottom": "12px" }}>
            Are you sure? This will remove the wallet connection{mode() === "spark" ? " and your local recovery phrase" : ""}.
          </p>
          <div style={s.row}>
            <button style={{ ...s.dangerBtn, flex: 1 }} onClick={handleDisconnect}>
              Yes, Disconnect
            </button>
            <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

// --- LightningAddressSection ---

function LightningAddressSection() {
  const [currentAddress, setCurrentAddress] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [username, setUsername] = createSignal("");
  const [checking, setChecking] = createSignal(false);
  const [available, setAvailable] = createSignal(null);
  const [registering, setRegistering] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [success, setSuccess] = createSignal(null);

  // Fetch current lightning address on mount
  (async () => {
    try {
      const addr = await sparkGetLightningAddress();
      setCurrentAddress(addr);
    } catch {}
    setLoading(false);
  })();

  async function handleCheck() {
    const name = username().trim();
    if (!name) return;
    setChecking(true);
    setError(null);
    setAvailable(null);
    try {
      const isAvailable = await sparkCheckLightningAddressAvailable(name);
      setAvailable(isAvailable);
      if (!isAvailable) setError("Username is not available.");
    } catch (e) {
      setError(e.message);
    }
    setChecking(false);
  }

  async function handleRegister() {
    const name = username().trim();
    if (!name) return;
    setRegistering(true);
    setError(null);
    setSuccess(null);
    try {
      const addr = await sparkRegisterLightningAddress(name);
      setCurrentAddress(addr);
      setSuccess("Lightning address registered!");
      setUsername("");
      setAvailable(null);
    } catch (e) {
      setError(e.message);
    }
    setRegistering(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await sparkDeleteLightningAddress();
      setCurrentAddress(null);
      setSuccess("Lightning address removed.");
    } catch (e) {
      setError(e.message);
    }
    setDeleting(false);
  }

  return (
    <div style={{ ...s.card, ...s.mb }}>
      <div style={{ "font-size": "13px", color: "var(--w-text-muted)", "margin-bottom": "8px" }}>Lightning Address</div>

      <Show when={loading()}>
        <p style={s.muted}>Loading...</p>
      </Show>

      <Show when={!loading() && currentAddress()}>
        <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--w-text-primary)", "margin-bottom": "8px" }}>
          {currentAddress()}
        </div>
        <button
          style={{ ...s.dangerBtn, padding: "6px 12px", "font-size": "12px", width: "auto" }}
          onClick={handleDelete}
          disabled={deleting()}
        >
          {deleting() ? "Removing..." : "Remove Address"}
        </button>
      </Show>

      <Show when={!loading() && !currentAddress()}>
        <p style={{ ...s.muted, ...s.mb }}>
          Register a lightning address to receive payments easily.
        </p>
        <div style={{ display: "flex", gap: "8px", "align-items": "center", ...s.mb }}>
          <input
            style={{ ...s.input, flex: 1, width: "auto", "min-width": 0 }}
            type="text"
            placeholder="username"
            value={username()}
            onInput={(e) => { setUsername(e.target.value); setAvailable(null); setError(null); }}
          />
          <button
            style={{ padding: "10px 14px", "border-radius": "8px", border: "1px solid var(--w-border-input)", background: "transparent", color: "var(--w-text-secondary)", "font-size": "14px", cursor: "pointer", "flex-shrink": 0, "white-space": "nowrap" }}
            onClick={handleCheck}
            disabled={checking() || !username().trim()}
          >
            {checking() ? "..." : "Check"}
          </button>
        </div>

        <Show when={available() === true}>
          <button
            style={{ ...s.primaryBtn, opacity: registering() ? 0.6 : 1 }}
            onClick={handleRegister}
            disabled={registering()}
          >
            {registering() ? "Registering..." : `Register ${username().trim()}`}
          </button>
        </Show>
      </Show>

      <Show when={error()}><div style={s.error}>{error()}</div></Show>
      <Show when={success()}><div style={s.success}>{success()}</div></Show>
    </div>
  );
}

// --- RestoreFromRelay ---

export function RestoreFromRelay() {
  const [backups, setBackups] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);
  const [restoring, setRestoring] = createSignal(false);

  (async () => {
    try {
      const found = await restoreFromRelays();
      setBackups(found);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  })();

  async function handleRestore(backup) {
    setRestoring(true);
    setError(null);
    try {
      await connectSparkWallet(backup.mnemonic);
      navigateHome();
    } catch (e) {
      setError(e.message);
    }
    setRestoring(false);
  }

  return (
    <div style={s.page}>
      <PageHeader title="Restore from Relay" />

      <Show when={loading()}>
        <p style={s.muted}>Searching relays for wallet backups...</p>
      </Show>

      <Show when={!loading() && backups().length === 0 && !error()}>
        <p style={s.muted}>No wallet backups found on your relays.</p>
      </Show>

      <Show when={error()}>
        <div style={s.error}>{error()}</div>
      </Show>

      <Show when={backups().length > 0}>
        <For each={backups()}>
          {(backup) => (
            <div style={{ ...s.card, display: "flex", "align-items": "center", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ "font-size": "14px", color: "var(--w-text-primary)", "font-weight": 600 }}>
                  Wallet {backup.walletId.substring(0, 8)}...
                </div>
                <div style={{ "font-size": "12px", color: "var(--w-text-muted)" }}>
                  {backup.mnemonic.split(" ").slice(0, 3).join(" ")}...
                </div>
              </div>
              <button
                style={{ ...s.primaryBtn, width: "auto", padding: "8px 16px" }}
                onClick={() => handleRestore(backup)}
                disabled={restoring()}
              >
                {restoring() ? "..." : "Restore"}
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
