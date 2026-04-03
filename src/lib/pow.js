import { createSignal } from "solid-js";

let worker = null;
let resolvePromise = null;
let rejectPromise = null;

const [miningStatus, setMiningStatus] = createSignal({
  phase: "idle",
  attempts: 0,
  difficulty: 0,
});

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/pow-worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (err) => {
      setMiningStatus({ phase: "failed", attempts: 0, difficulty: 0 });
      if (rejectPromise) {
        rejectPromise(new Error(err.message || "PoW worker error"));
        resolvePromise = null;
        rejectPromise = null;
      }
    };
  }
  return worker;
}

function handleWorkerMessage(e) {
  const msg = e.data;

  if (msg.type === "progress") {
    setMiningStatus((prev) => ({ ...prev, phase: "mining", attempts: msg.attempts }));
  } else if (msg.type === "done") {
    setMiningStatus({
      phase: "done",
      attempts: msg.nonce,
      difficulty: miningStatus().difficulty,
    });
    if (resolvePromise) {
      resolvePromise({
        id: msg.id,
        tags: msg.tags,
        createdAt: msg.createdAt,
      });
      resolvePromise = null;
      rejectPromise = null;
    }
  } else if (msg.type === "cancelled") {
    setMiningStatus({ phase: "idle", attempts: 0, difficulty: 0 });
    if (rejectPromise) {
      rejectPromise(new Error("Mining cancelled"));
      resolvePromise = null;
      rejectPromise = null;
    }
  }
}

// Start mining. Returns a promise that resolves with { id, tags, createdAt }.
export function startMining(pubkey, kind, content, tags, difficulty) {
  const createdAt = Math.floor(Date.now() / 1000);

  setMiningStatus({ phase: "mining", attempts: 0, difficulty });

  const w = getWorker();
  w.postMessage({
    type: "mine",
    pubkey,
    kind,
    content,
    tags,
    difficulty,
    createdAt,
  });

  return new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
}

export function cancelMining() {
  if (worker) {
    worker.postMessage({ type: "cancel" });
  }
}

export function getMiningStatus() {
  return miningStatus();
}
