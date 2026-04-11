import { A, useMatch } from "@solidjs/router";
import { Show, createMemo, createSignal } from "solid-js";

export function SettingsSidebar() {
  const [expanded, setExpanded] = createSignal(null);

  const settingsMatch = useMatch(() => "/settings*");

  const isActive = (path) => {
    const match = settingsMatch();
    if (!match) return false;
    return match.pathname.startsWith(path);
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Settings</h3>

      <nav style={styles.nav}>
        <A
          href="/settings/interface"
          style={styles.link}
          activeClass="active"
          onClick={() => setExpanded(null)}
        >
          Interface
        </A>
        <A
          href="/settings/relays"
          style={styles.link}
          activeClass="active"
          onClick={() => setExpanded(null)}
        >
          Relays
        </A>
        <A
          href="/settings/emoji"
          style={styles.link}
          activeClass="active"
          onClick={() => setExpanded(null)}
        >
          Emoji
        </A>
        <A
          href="/settings/safety"
          style={styles.link}
          activeClass="active"
          onClick={() => setExpanded(null)}
        >
          Safety
        </A>
        <A
          href="/settings/pow"
          style={styles.link}
          activeClass="active"
          onClick={() => setExpanded(null)}
        >
          Proof of Work
        </A>
      </nav>
    </div>
  );
}

const styles = {
  container: {
    padding: "0 16px",
  },
  heading: {
    "font-size": "15px",
    "font-weight": 600,
    color: "var(--w-text-primary)",
    "margin-bottom": "12px",
  },
  nav: {
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
  },
  link: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    padding: "8px 12px",
    "border-radius": "8px",
    "font-size": "15px",
    color: "var(--w-text-tertiary)",
    transition: "background 0.15s, color 0.15s",
  },
};
