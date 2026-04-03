/**
 * Wallet abstraction layer — routes to NWC or Spark provider.
 * Reference: Mobile WalletProvider.kt + WalletModeRepository.kt + WalletViewModel.kt
 */
import { createSignal } from "solid-js";
import {
  parseNwcUri, connectNwc, disconnectNwc, isNwcConnected,
  nwcGetBalance, nwcPayInvoice, nwcMakeInvoice, nwcListTransactions,
  onNwcStatus,
} from "./nwc";
import {
  initSpark, connectSpark, disconnectSpark, isSparkConnected,
  sparkFetchBalance, sparkPayInvoice, sparkMakeInvoice, sparkListPayments,
  sparkPrepareSendPayment, sparkSendPrepared,
  saveMnemonic, getMnemonic, clearMnemonic, hasMnemonic,
  onSparkStatus, onSparkBalance, onSparkPaymentReceived,
} from "./spark";

// --- State signals ---

const [walletMode, setWalletMode] = createSignal("none"); // "none" | "nwc" | "spark"
const [balance, setBalance] = createSignal(null); // sats (null = unknown)
const [isConnected, setIsConnected] = createSignal(false);
const [statusLines, setStatusLines] = createSignal([]);
const [currentPage, setCurrentPage] = createSignal("home");

const pageStack = [];
let currentPubkey = null;

// Wire up status callbacks
function addStatus(msg) {
  setStatusLines((prev) => [...prev.slice(-19), msg]);
}

onNwcStatus(addStatus);
onSparkStatus(addStatus);

onSparkBalance((sats) => {
  setBalance(sats);
});

onSparkPaymentReceived(() => {
  // Refresh balance on incoming payment
  sparkFetchBalance().catch(() => {});
});

// --- Exports: State getters ---

export function getWalletMode() { return walletMode(); }
export function getBalance() { return balance(); }
export function getBalanceSats() { return balance(); }
export function isWalletConnected() { return isConnected(); }
export function getStatusLines() { return statusLines(); }

// --- Persistence ---

function storageKey(pubkey) { return `wisp:wallet:${pubkey}`; }

function loadWalletState(pubkey) {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveWalletState(pubkey, state) {
  localStorage.setItem(storageKey(pubkey), JSON.stringify(state));
}

function clearWalletState(pubkey) {
  localStorage.removeItem(storageKey(pubkey));
}

// --- Lifecycle ---

/**
 * Initialize wallet from saved state. Called on login / session restore.
 */
export async function initWallet(pubkey) {
  currentPubkey = pubkey;
  const saved = loadWalletState(pubkey);
  if (!saved || saved.mode === "none") {
    setWalletMode("none");
    setBalance(null);
    setIsConnected(false);
    return;
  }

  setWalletMode(saved.mode);

  try {
    if (saved.mode === "nwc" && saved.nwcUri) {
      addStatus("Reconnecting NWC wallet...");
      const parsed = parseNwcUri(saved.nwcUri);
      if (parsed) {
        await connectNwc(parsed);
        setIsConnected(true);
        // Fetch initial balance
        try {
          const msats = await nwcGetBalance();
          setBalance(Math.floor(msats / 1000));
        } catch (e) {
          addStatus("Balance fetch failed: " + e.message);
        }
      }
    } else if (saved.mode === "spark") {
      const mnemonic = getMnemonic(pubkey);
      if (mnemonic) {
        addStatus("Reconnecting Spark wallet...");
        await connectSpark(mnemonic);
        setIsConnected(true);
      }
    }
  } catch (e) {
    addStatus("Reconnect failed: " + e.message);
    setIsConnected(false);
  }
}

/**
 * Clear wallet state. Called on logout.
 */
export function clearWallet() {
  disconnectActiveProvider();
  setWalletMode("none");
  setBalance(null);
  setIsConnected(false);
  setStatusLines([]);
  navigateHome();
  currentPubkey = null;
}

function disconnectActiveProvider() {
  const mode = walletMode();
  if (mode === "nwc") disconnectNwc();
  else if (mode === "spark") disconnectSpark();
}

// --- Setup ---

/**
 * Connect an NWC wallet.
 * @param {string} uri - NWC connection URI
 */
export async function connectNwcWallet(uri) {
  const parsed = parseNwcUri(uri);
  if (!parsed) throw new Error("Invalid NWC connection URI");

  disconnectActiveProvider();
  setStatusLines([]);

  await connectNwc(parsed);
  setWalletMode("nwc");
  setIsConnected(true);

  if (currentPubkey) {
    saveWalletState(currentPubkey, { mode: "nwc", nwcUri: uri });
  }

  // Fetch initial balance
  try {
    const msats = await nwcGetBalance();
    setBalance(Math.floor(msats / 1000));
  } catch (e) {
    addStatus("Balance fetch failed: " + e.message);
  }
}

/**
 * Connect a Spark wallet.
 * @param {string} mnemonic - BIP39 mnemonic
 */
export async function connectSparkWallet(mnemonic) {
  disconnectActiveProvider();
  setStatusLines([]);

  await connectSpark(mnemonic);
  setWalletMode("spark");
  setIsConnected(true);

  if (currentPubkey) {
    saveMnemonic(currentPubkey, mnemonic);
    saveWalletState(currentPubkey, { mode: "spark" });
  }
}

/**
 * Disconnect and remove wallet.
 */
export function disconnectWallet() {
  disconnectActiveProvider();
  if (currentPubkey) {
    const mode = walletMode();
    if (mode === "spark") clearMnemonic(currentPubkey);
    clearWalletState(currentPubkey);
  }
  setWalletMode("none");
  setBalance(null);
  setIsConnected(false);
  setStatusLines([]);
  navigateHome();
}

// --- Wallet Operations ---

export async function fetchBalance() {
  const mode = walletMode();
  if (mode === "nwc") {
    const msats = await nwcGetBalance();
    const sats = Math.floor(msats / 1000);
    setBalance(sats);
    return sats;
  } else if (mode === "spark") {
    const sats = await sparkFetchBalance();
    setBalance(sats);
    return sats;
  }
  throw new Error("No wallet connected");
}

export async function payInvoice(bolt11) {
  const mode = walletMode();
  if (mode === "nwc") {
    return nwcPayInvoice(bolt11);
  } else if (mode === "spark") {
    return sparkPayInvoice(bolt11);
  }
  throw new Error("No wallet connected");
}

export async function makeInvoice(amountSats, description) {
  const mode = walletMode();
  if (mode === "nwc") {
    const { invoice } = await nwcMakeInvoice(amountSats * 1000, description);
    return invoice;
  } else if (mode === "spark") {
    return sparkMakeInvoice(amountSats, description);
  }
  throw new Error("No wallet connected");
}

/**
 * List transactions in a normalized format.
 * @returns {Promise<Array<{id: string, type: string, amount: number, fees: number, description: string|null, timestamp: number}>>}
 */
export async function listTransactions(limit = 50, offset = 0) {
  const mode = walletMode();
  if (mode === "nwc") {
    const txs = await nwcListTransactions(limit, offset);
    return txs.map((tx) => ({
      id: tx.paymentHash,
      type: tx.type,
      amount: Math.floor(tx.amount / 1000), // msats → sats
      fees: Math.floor(tx.feesPaid / 1000),
      description: tx.description,
      timestamp: tx.createdAt,
    }));
  } else if (mode === "spark") {
    return sparkListPayments(limit, offset);
  }
  throw new Error("No wallet connected");
}

/**
 * Prepare a bolt11 payment (Spark two-step flow). Returns fee estimate.
 * For NWC, returns null fees (no prepare step).
 */
export async function prepareSend(bolt11) {
  const mode = walletMode();
  if (mode === "spark") {
    return sparkPrepareSendPayment(bolt11);
  }
  return { feeSats: null, prepareResponse: null };
}

/**
 * Send a previously prepared payment (Spark only).
 */
export async function sendPrepared(prepareResponse) {
  if (walletMode() === "spark" && prepareResponse) {
    return sparkSendPrepared(prepareResponse);
  }
  throw new Error("Prepared send only available for Spark");
}

// --- Page Navigation ---

export function getCurrentPage() { return currentPage(); }

export function navigateTo(page) {
  pageStack.push(currentPage());
  setCurrentPage(page);
}

export function navigateBack() {
  if (pageStack.length > 0) {
    setCurrentPage(pageStack.pop());
  } else {
    setCurrentPage("home");
  }
}

export function navigateHome() {
  pageStack.length = 0;
  setCurrentPage("home");
}
