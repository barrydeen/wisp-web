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
    return path === "/" || path.startsWith("/relay/") || path.startsWith("/hashtag/") || path.startsWith("/topics/set/");
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
            <A href="/" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>
              Feeds
            </A>
            <A href="/streams" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              Streams
            </A>
            <A href="/groups" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Chat Rooms
            </A>
            <A href="/topics" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
              Topics
            </A>
            <div style={styles.notifLinkWrap}>
              <A href="/notifications" style={styles.link} activeClass="active">
                <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                Notifications
              </A>
              <Show when={getHasUnread()}>
                <div style={styles.unreadDot} />
              </Show>
            </div>
            <A href="/messages" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              Messages
            </A>
            <A href="/wallet" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              Wallet
            </A>
            <A href="/settings" style={styles.link} activeClass="active">
              <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              Settings
            </A>
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
    display: "flex",
    "align-items": "center",
    gap: "10px",
    padding: "8px 12px",
    "border-radius": "8px",
    "font-size": "15px",
    color: "var(--w-text-tertiary)",
    transition: "background 0.15s, color 0.15s",
  },
  navIcon: {
    width: "18px",
    height: "18px",
    "flex-shrink": 0,
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
