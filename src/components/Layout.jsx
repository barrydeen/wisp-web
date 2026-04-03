import { A, useLocation, useMatch } from "@solidjs/router";
import { Show, Switch, Match, createMemo } from "solid-js";
import { TrendingSidebar } from "./TrendingSidebar";
import { TopNotesSidebar } from "./TopNotesSidebar";
import {
  getPubkey,
  getUserProfile,
  getLoginState,
  hasExtension,
  login,
  logout,
} from "../lib/identity";
import { avatarColor, npubShort } from "../lib/utils";
import { Composer } from "./Composer";
import { openComposer } from "../lib/compose";
import { getHasUnread } from "../lib/notifications";
import logoUrl from "../assets/wisp-logo.svg";

export function Layout(props) {
  const profile = createMemo(() => getUserProfile());
  const state = createMemo(() => getLoginState());
  const pk = createMemo(() => getPubkey());
  const color = createMemo(() => pk() ? avatarColor(pk()) : "var(--w-text-muted)");

  const location = useLocation();
  const matchProfile = useMatch(() => "/profile/:pubkey");

  const isFeedRoute = createMemo(() => {
    const path = location.pathname;
    return path === "/" || path.startsWith("/relay/");
  });

  const profilePubkey = createMemo(() => {
    const m = matchProfile();
    return m ? m.params.pubkey : null;
  });

  const displayName = createMemo(() => {
    const p = profile();
    return p?.display_name || p?.name || (pk() ? npubShort(pk()) : null);
  });

  const avatar = createMemo(() => profile()?.picture);

  async function handleLogin() {
    try {
      await login();
    } catch (err) {
      console.error("Login failed:", err.message);
    }
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .wisp-layout {
            flex-direction: column !important;
          }
          .wisp-nav {
            width: 100% !important;
            height: auto !important;
            flex-direction: row !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            top: auto !important;
            z-index: 100;
            border-right: none !important;
            border-top: 1px solid var(--w-border) !important;
            padding: 0 !important;
            justify-content: center !important;
            background: var(--w-bg-primary) !important;
            gap: 0 !important;
          }
          .wisp-nav-links {
            flex-direction: row !important;
            overflow-x: auto;
            justify-content: space-around !important;
            width: 100% !important;
            gap: 0 !important;
          }
          .wisp-nav-links a {
            font-size: 11px !important;
            padding: 10px 6px !important;
            text-align: center;
            white-space: nowrap;
          }
          .wisp-logo,
          .wisp-user-section,
          .wisp-new-note,
          .wisp-logout,
          .wisp-spacer,
          .wisp-login-btn {
            display: none !important;
          }
          .wisp-main {
            padding-bottom: 60px !important;
          }
          .wisp-right-sidebar {
            display: none !important;
          }
        }
        @media (max-width: 1000px) {
          .wisp-right-sidebar {
            display: none !important;
          }
        }
      `}</style>
      <div style={styles.container} class="wisp-layout">
        <nav style={styles.nav} class="wisp-nav">
          <A href="/" style={styles.logo} class="wisp-logo">
            <img src={logoUrl} style={styles.logoImg} alt="" />
            wisp
          </A>

          <div style={styles.links} class="wisp-nav-links">
            <A href="/" style={styles.link} activeClass="active">feed</A>
            <A href="/chat" style={styles.link} activeClass="active">chat</A>
            <A href="/streams" style={styles.link} activeClass="active">streams</A>
            <A href="/groups" style={styles.link} activeClass="active">groups</A>
            <div style={styles.notifLinkWrap}>
              <A href="/notifications" style={styles.link} activeClass="active">notifications</A>
              <Show when={getHasUnread()}>
                <div style={styles.unreadDot} />
              </Show>
            </div>
            <A href="/messages" style={styles.link} activeClass="active">messages</A>
            <A href="/wallet" style={styles.link} activeClass="active">wallet</A>
            <A href="/settings" style={styles.link} activeClass="active">settings</A>
          </div>

          <Show when={state() === "logged-in"}>
            <button onClick={openComposer} style={styles.newNoteBtn} class="wisp-new-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Note
            </button>
          </Show>

          <div style={styles.spacer} class="wisp-spacer" />

          <Show
            when={state() === "logged-in"}
            fallback={
              <button
                onClick={handleLogin}
                disabled={state() === "logging-in"}
                style={styles.loginBtn}
                class="wisp-login-btn"
              >
                {state() === "logging-in" ? "Connecting..." : "Log in"}
              </button>
            }
          >
            <div style={styles.userSection} class="wisp-user-section">
              <A href={`/profile/${pk()}`} style={styles.userLink}>
                <Show
                  when={avatar()}
                  fallback={
                    <div style={{ ...styles.avatarFallback, "background-color": color() }}>
                      {pk()?.slice(0, 2).toUpperCase()}
                    </div>
                  }
                >
                  <img src={avatar()} style={styles.avatarImg} alt={displayName() || "Your avatar"} />
                </Show>
                <div style={styles.userInfo}>
                  <span style={styles.userName}>{displayName()}</span>
                </div>
              </A>
              <button onClick={logout} style={styles.logoutBtn} aria-label="Log out" class="wisp-logout">
                Log out
              </button>
            </div>
          </Show>
        </nav>
        <main style={styles.main} class="wisp-main">
          {props.children}
        </main>
        <aside style={styles.rightSidebar} class="wisp-right-sidebar">
          <Switch>
            <Match when={isFeedRoute()}>
              <TrendingSidebar />
            </Match>
            <Match when={profilePubkey()}>
              <TopNotesSidebar pubkey={profilePubkey()} />
            </Match>
          </Switch>
        </aside>
        <Composer />
      </div>
    </>
  );
}

const styles = {
  container: {
    display: "flex",
    "min-height": "100vh",
    "max-width": "1200px",
    margin: "0 auto",
  },
  nav: {
    width: "200px",
    "flex-shrink": 0,
    padding: "20px",
    "border-right": "1px solid var(--w-border)",
    display: "flex",
    "flex-direction": "column",
    gap: "24px",
    position: "sticky",
    top: 0,
    height: "100vh",
  },
  logo: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    "font-size": "22px",
    "font-weight": 700,
    "letter-spacing": "-0.03em",
    color: "var(--w-text-primary)",
  },
  logoImg: {
    width: "26px",
    height: "26px",
  },
  links: {
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
  },
  link: {
    padding: "8px 12px",
    "border-radius": "8px",
    "font-size": "15px",
    color: "var(--w-text-tertiary)",
    transition: "background 0.15s, color 0.15s",
  },
  notifLinkWrap: {
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "7px",
    height: "7px",
    "border-radius": "50%",
    background: "var(--w-live)",
  },
  newNoteBtn: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "8px",
    padding: "10px 12px",
    "border-radius": "10px",
    border: "none",
    background: "var(--w-btn-bg)",
    color: "var(--w-btn-text)",
    "font-size": "14px",
    "font-weight": 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
    "margin-top": "8px",
  },
  spacer: {
    flex: 1,
  },
  loginBtn: {
    padding: "10px 12px",
    "border-radius": "8px",
    border: "1px solid var(--w-border-input)",
    background: "transparent",
    color: "var(--w-text-secondary)",
    "font-size": "14px",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },
  userSection: {
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
  },
  userLink: {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    padding: "8px",
    "border-radius": "8px",
    transition: "background 0.15s",
  },
  avatarImg: {
    width: "34px",
    height: "34px",
    "border-radius": "50%",
    "object-fit": "cover",
    "flex-shrink": 0,
  },
  avatarFallback: {
    width: "34px",
    height: "34px",
    "border-radius": "50%",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "12px",
    "font-weight": 700,
    color: "var(--w-text-primary)",
    "flex-shrink": 0,
  },
  userInfo: {
    "min-width": 0,
  },
  userName: {
    "font-size": "13px",
    "font-weight": 600,
    color: "var(--w-text-secondary)",
    display: "block",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  logoutBtn: {
    padding: "6px 12px",
    "border-radius": "6px",
    border: "none",
    background: "transparent",
    color: "var(--w-text-muted)",
    "font-size": "12px",
    cursor: "pointer",
    "text-align": "left",
  },
  main: {
    flex: 1,
    "min-width": 0,
  },
  rightSidebar: {
    width: "320px",
    "flex-shrink": 0,
    position: "sticky",
    top: 0,
    height: "100vh",
    "overflow-y": "auto",
    "scrollbar-width": "none",
    "border-left": "1px solid var(--w-border)",
    padding: "16px 0",
  },
};
