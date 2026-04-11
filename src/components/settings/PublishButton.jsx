import { createSignal, Show } from "solid-js";

export function PublishButton(props) {
  const [status, setStatus] = createSignal("idle");

  async function handlePublish() {
    setStatus("publishing");
    try {
      await props.onPublish();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      console.error("Publish failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const label = () => {
    switch (status()) {
      case "publishing": return "Publishing...";
      case "done": return "Published!";
      case "error": return "Failed";
      default: return props.label || "Publish";
    }
  };

  return (
    <button
      onClick={handlePublish}
      disabled={status() === "publishing"}
      style={{
        ...styles.publishBtn,
        opacity: status() === "publishing" ? 0.6 : 1,
        background: status() === "done" ? "var(--w-success)"
          : status() === "error" ? "var(--w-error)"
          : "var(--w-accent)",
      }}
    >
      {label()}
    </button>
  );
}

const styles = {
  publishBtn: {
    padding: "8px 16px",
    "border-radius": "8px",
    border: "none",
    "background-color": "var(--w-accent)",
    color: "var(--w-btn-text)",
    "font-size": "13px",
    "font-weight": 600,
    cursor: "pointer",
    transition: "background 0.15s, opacity 0.15s",
  },
};
