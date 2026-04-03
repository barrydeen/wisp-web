import { createSignal } from "solid-js";

// --- Theme definitions: themes[name][mode] → CSS variable map ---

const themes = {
  zinc: {
    dark: {
      "--w-bg-primary": "#0a0a0a",
      "--w-bg-secondary": "#161616",
      "--w-bg-tertiary": "#111",
      "--w-bg-hover": "#222",
      "--w-border": "#1a1a1a",
      "--w-border-secondary": "#141414",
      "--w-border-input": "#333",
      "--w-border-subtle": "#2a2a2a",
      "--w-text-primary": "#fff",
      "--w-text-secondary": "#ccc",
      "--w-text-tertiary": "#888",
      "--w-text-muted": "#555",
      "--w-accent": "#2a5a8a",
      "--w-accent-subtle": "#1a3a5c",
      "--w-success": "#44aa99",
      "--w-btn-bg": "#fff",
      "--w-btn-text": "#000",
    },
    light: {
      "--w-bg-primary": "#ffffff",
      "--w-bg-secondary": "#f5f5f5",
      "--w-bg-tertiary": "#ebebeb",
      "--w-bg-hover": "#e0e0e0",
      "--w-border": "#e0e0e0",
      "--w-border-secondary": "#eaeaea",
      "--w-border-input": "#ccc",
      "--w-border-subtle": "#ddd",
      "--w-text-primary": "#111",
      "--w-text-secondary": "#333",
      "--w-text-tertiary": "#666",
      "--w-text-muted": "#999",
      "--w-accent": "#2a5a8a",
      "--w-accent-subtle": "#d0e4f5",
      "--w-success": "#2e8b72",
      "--w-btn-bg": "#111",
      "--w-btn-text": "#fff",
    },
  },
  ocean: {
    dark: {
      "--w-bg-primary": "#080c10",
      "--w-bg-secondary": "#0f1920",
      "--w-bg-tertiary": "#0c1418",
      "--w-bg-hover": "#162530",
      "--w-border": "#152028",
      "--w-border-secondary": "#101a22",
      "--w-border-input": "#1e3a4a",
      "--w-border-subtle": "#1a3040",
      "--w-text-primary": "#e8f0f5",
      "--w-text-secondary": "#b0c8d8",
      "--w-text-tertiary": "#6a8a9a",
      "--w-text-muted": "#3d5a6a",
      "--w-accent": "#1a8a8a",
      "--w-accent-subtle": "#0f3a4a",
      "--w-success": "#2aaa88",
      "--w-btn-bg": "#e8f0f5",
      "--w-btn-text": "#080c10",
    },
    light: {
      "--w-bg-primary": "#f5f9fc",
      "--w-bg-secondary": "#e8f0f5",
      "--w-bg-tertiary": "#dce8f0",
      "--w-bg-hover": "#d0dfe8",
      "--w-border": "#c8d8e4",
      "--w-border-secondary": "#d8e6ef",
      "--w-border-input": "#a0b8c8",
      "--w-border-subtle": "#b8ccda",
      "--w-text-primary": "#0a1a24",
      "--w-text-secondary": "#2a4050",
      "--w-text-tertiary": "#4a7080",
      "--w-text-muted": "#7a9aaa",
      "--w-accent": "#1a8a8a",
      "--w-accent-subtle": "#c0e8e8",
      "--w-success": "#1a7a62",
      "--w-btn-bg": "#0a1a24",
      "--w-btn-text": "#f5f9fc",
    },
  },
  iris: {
    dark: {
      "--w-bg-primary": "#0c0a10",
      "--w-bg-secondary": "#161222",
      "--w-bg-tertiary": "#110e18",
      "--w-bg-hover": "#221e30",
      "--w-border": "#1a1628",
      "--w-border-secondary": "#141020",
      "--w-border-input": "#2e2848",
      "--w-border-subtle": "#282240",
      "--w-text-primary": "#f0ecf5",
      "--w-text-secondary": "#c8b8e0",
      "--w-text-tertiary": "#8070a0",
      "--w-text-muted": "#504868",
      "--w-accent": "#7a52c9",
      "--w-accent-subtle": "#2a1a5c",
      "--w-success": "#44aa99",
      "--w-btn-bg": "#f0ecf5",
      "--w-btn-text": "#0c0a10",
    },
    light: {
      "--w-bg-primary": "#faf8ff",
      "--w-bg-secondary": "#f0ecf8",
      "--w-bg-tertiary": "#e6e0f2",
      "--w-bg-hover": "#dcd4ec",
      "--w-border": "#d4cce4",
      "--w-border-secondary": "#e2daef",
      "--w-border-input": "#b0a0cc",
      "--w-border-subtle": "#c4b8da",
      "--w-text-primary": "#1a1028",
      "--w-text-secondary": "#3a2860",
      "--w-text-tertiary": "#6a5898",
      "--w-text-muted": "#9888b8",
      "--w-accent": "#7a52c9",
      "--w-accent-subtle": "#ddd0f5",
      "--w-success": "#2e8b72",
      "--w-btn-bg": "#1a1028",
      "--w-btn-text": "#faf8ff",
    },
  },
  ember: {
    dark: {
      "--w-bg-primary": "#0a0a0a",
      "--w-bg-secondary": "#141010",
      "--w-bg-tertiary": "#110e0c",
      "--w-bg-hover": "#1e1610",
      "--w-border": "#1a1410",
      "--w-border-secondary": "#141010",
      "--w-border-input": "#332818",
      "--w-border-subtle": "#2a2015",
      "--w-text-primary": "#fff",
      "--w-text-secondary": "#ccb8a0",
      "--w-text-tertiary": "#8a7060",
      "--w-text-muted": "#5a4838",
      "--w-accent": "#E97941",
      "--w-accent-subtle": "#3a2010",
      "--w-success": "#44aa99",
      "--w-btn-bg": "#fff",
      "--w-btn-text": "#000",
    },
    light: {
      "--w-bg-primary": "#fffaf5",
      "--w-bg-secondary": "#f5ece0",
      "--w-bg-tertiary": "#ebe0d2",
      "--w-bg-hover": "#e0d4c4",
      "--w-border": "#ddd0c0",
      "--w-border-secondary": "#e8dcd0",
      "--w-border-input": "#c0a888",
      "--w-border-subtle": "#d0c0a8",
      "--w-text-primary": "#1a1008",
      "--w-text-secondary": "#3a2810",
      "--w-text-tertiary": "#7a6040",
      "--w-text-muted": "#a08860",
      "--w-accent": "#E97941",
      "--w-accent-subtle": "#f5dcc8",
      "--w-success": "#2e8b72",
      "--w-btn-bg": "#1a1008",
      "--w-btn-text": "#fffaf5",
    },
  },
};

const fonts = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  humanist: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, sans-serif",
};

const fontSizes = {
  small: 0.9,
  default: 1.0,
  large: 1.1,
  "x-large": 1.2,
};

// --- Helpers ---

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.substring(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.substring(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// --- Load saved settings ---

const STORAGE_KEY = "wisp:settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

const saved = loadSettings();

// --- Signals ---

const [theme, setThemeSignal] = createSignal(saved.theme || "ember");
const [mode, setModeSignal] = createSignal(saved.mode || "dark");
const [font, setFontSignal] = createSignal(saved.font || "inter");
const [fontSize, setFontSizeSignal] = createSignal(saved.fontSize || "default");

// Blossom servers
const [blossomServers, setBlossomServersSignal] = createSignal(
  saved.blossomServers || ["https://blossom.primal.net"]
);

// Proof of Work
const [powEnabled, setPowEnabledSignal] = createSignal(saved.powEnabled || false);
const [powDifficulty, setPowDifficultySignal] = createSignal(saved.powDifficulty || 16);

// Client tag
const CLIENT_TAG_VALUE = "Wisp Web";
const [includeClientTag, setIncludeClientTagSignal] = createSignal(
  saved.includeClientTag !== undefined ? saved.includeClientTag : true
);

// --- Persist + apply on change ---

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    theme: theme(),
    mode: mode(),
    font: font(),
    fontSize: fontSize(),
    blossomServers: blossomServers(),
    powEnabled: powEnabled(),
    powDifficulty: powDifficulty(),
    includeClientTag: includeClientTag(),
  }));
}

function applySettings() {
  const t = theme();
  const m = mode();
  const vars = themes[t]?.[m] || themes.zinc.dark;
  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  // Computed overlay vars from bg-primary
  const bg = vars["--w-bg-primary"];
  root.style.setProperty("--w-bg-overlay", hexToRgba(bg, 0.9));
  root.style.setProperty("--w-bg-overlay-heavy", hexToRgba(bg, 0.95));

  // Semantic tokens (mode-dependent, theme-independent)
  const isDark = m === "dark";
  root.style.setProperty("--w-error", isDark ? "#ef4444" : "#dc2626");
  root.style.setProperty("--w-error-subtle", isDark ? "rgba(239,68,68,0.1)" : "rgba(220,38,38,0.08)");
  root.style.setProperty("--w-error-border", isDark ? "rgba(239,68,68,0.2)" : "rgba(220,38,38,0.2)");
  root.style.setProperty("--w-overlay", isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)");
  root.style.setProperty("--w-overlay-btn", isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.5)");
  root.style.setProperty("--w-shadow", isDark ? "0 4px 12px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.15)");

  // Social action colors (platform conventions, theme-independent)
  root.style.setProperty("--w-action-reply", "#1d9bf0");
  root.style.setProperty("--w-action-repost", "#00ba7c");
  root.style.setProperty("--w-action-like", "#f91880");
  root.style.setProperty("--w-action-zap", "#f7931a");
  root.style.setProperty("--w-live", "#e53e3e");

  // Font
  const fontStack = fonts[font()] || fonts.inter;
  root.style.setProperty("--w-font-family", fontStack);
  document.body.style.fontFamily = fontStack;

  // Font size via zoom
  const zoom = fontSizes[fontSize()] || 1.0;
  root.style.zoom = zoom;

  // Mode attribute for potential CSS selectors
  root.setAttribute("data-mode", m);
}

export function getTheme() { return theme(); }
export function setTheme(name) {
  if (themes[name]) {
    setThemeSignal(name);
    saveSettings();
    applySettings();
  }
}

export function getMode() { return mode(); }
export function setMode(m) {
  if (m === "dark" || m === "light") {
    setModeSignal(m);
    saveSettings();
    applySettings();
  }
}

export function getFont() { return font(); }
export function setFont(f) {
  if (fonts[f]) {
    setFontSignal(f);
    saveSettings();
    applySettings();
  }
}

export function getFontSize() { return fontSize(); }
export function setFontSize(s) {
  if (fontSizes[s] !== undefined) {
    setFontSizeSignal(s);
    saveSettings();
    applySettings();
  }
}

// --- Blossom server accessors ---

export function getBlossomServers() { return blossomServers(); }
export function setBlossomServers(list) {
  setBlossomServersSignal(list);
  saveSettings();
}
export function addBlossomServer(url) {
  setBlossomServersSignal(prev => {
    if (prev.includes(url)) return prev;
    return [...prev, url];
  });
  saveSettings();
}
export function removeBlossomServer(url) {
  setBlossomServersSignal(prev => prev.filter(s => s !== url));
  saveSettings();
}

// --- PoW accessors ---

export function getPowEnabled() { return powEnabled(); }
export function setPowEnabled(val) {
  setPowEnabledSignal(!!val);
  saveSettings();
}
export function getPowDifficulty() { return powDifficulty(); }
export function setPowDifficulty(n) {
  const clamped = Math.max(8, Math.min(32, Math.floor(n)));
  setPowDifficultySignal(clamped);
  saveSettings();
}

// --- Client tag accessors ---

export function getIncludeClientTag() { return includeClientTag(); }
export function setIncludeClientTag(val) {
  setIncludeClientTagSignal(!!val);
  saveSettings();
}

export function withClientTag(tags) {
  if (includeClientTag()) {
    return [...tags, ["client", CLIENT_TAG_VALUE]];
  }
  return tags;
}

// Expose theme data for Settings UI
export { themes, fonts, fontSizes };

// Apply immediately on module load
applySettings();
