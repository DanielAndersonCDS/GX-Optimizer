// Shared by the background script, new tab page and popup.
const GX_THEMES = {
  cyan: {
    label: "Cyan", wallpaper: "icons/wallpaper-cyan.jpg",
    ui: { acc: "#22d3ee", accRgb: "34,211,238", bright: "#67e8f9", deep: "#0ea5c6", deeper: "#0b6a86",
      ink: "#05080d", panelRgb: "8,14,22", lineSolid: "#12303a", text: "#e6faff", muted: "#9fd5e3",
      field: "#060b11", iconBg: "#0d1620", toolBg: "rgba(14,24,34,0.9)", toolbar: "#0b131c",
      btn: "#0f1a24", hover: "#12303a", active: "#16505f", highlight: "#0e7490", tabText: "#7fb7c9",
      frameInactive: "#070b11", fieldText: "#d7f6ff" }
  },
  red: {
    label: "Red", wallpaper: "icons/wallpaper-red.jpg",
    ui: { acc: "#ff2a3d", accRgb: "255,42,61", bright: "#ff6b78", deep: "#d4132a", deeper: "#7d0a18",
      ink: "#0a0506", panelRgb: "20,8,10", lineSolid: "#3a1218", text: "#ffeaec", muted: "#e0a3aa",
      field: "#0c0607", iconBg: "#1a0c0e", toolBg: "rgba(30,12,15,0.9)", toolbar: "#150a0c",
      btn: "#1d0d10", hover: "#3a1218", active: "#5f1a24", highlight: "#a1121f", tabText: "#c98a92",
      frameInactive: "#0d0607", fieldText: "#ffd9dd" }
  },
  green: {
    label: "Green", wallpaper: "icons/wallpaper-green.jpg",
    ui: { acc: "#3cf03c", accRgb: "60,240,60", bright: "#86ff7a", deep: "#16b81f", deeper: "#0b6a14",
      ink: "#040a05", panelRgb: "8,20,10", lineSolid: "#123a18", text: "#eaffee", muted: "#a3dcab",
      field: "#060c07", iconBg: "#0d1a0f", toolBg: "rgba(14,32,18,0.9)", toolbar: "#0a140b",
      btn: "#0e1d10", hover: "#123a18", active: "#1b5f24", highlight: "#12a124", tabText: "#8fc99a",
      frameInactive: "#060d07", fieldText: "#d9ffe0" }
  }
};
const GX_ORDER = ["cyan", "red", "green"];

function gxBrowserColors(u) {
  return {
    frame: u.ink, frame_inactive: u.frameInactive,
    tab_background_text: u.tabText, tab_selected: u.btn, tab_text: u.text,
    tab_line: u.acc, tab_loading: u.acc,
    toolbar: u.toolbar, toolbar_text: u.text,
    toolbar_field: u.field, toolbar_field_text: u.fieldText, toolbar_field_border: u.lineSolid,
    toolbar_field_focus: u.ink, toolbar_field_text_focus: "#ffffff", toolbar_field_border_focus: u.acc,
    toolbar_field_highlight: u.highlight, toolbar_field_highlight_text: "#ffffff",
    toolbar_top_separator: u.lineSolid, toolbar_bottom_separator: u.lineSolid,
    icons: u.bright, icons_attention: u.acc,
    button_background_hover: u.hover, button_background_active: u.active,
    popup: u.toolbar, popup_text: u.text, popup_border: u.lineSolid,
    popup_highlight: u.highlight, popup_highlight_text: "#ffffff",
    sidebar: u.ink, sidebar_text: u.fieldText, sidebar_border: u.lineSolid,
    sidebar_highlight: u.highlight, sidebar_highlight_text: "#ffffff",
    ntp_background: u.ink, ntp_text: u.text, bookmark_text: u.fieldText
  };
}

// Sets the CSS variables the pages use. Returns the theme object.
function gxApplyUi(t) {
  const u = t.ui, s = document.documentElement.style;
  const map = { "--cyan": u.acc, "--acc-rgb": u.accRgb, "--cyan-soft": u.bright, "--deep": u.deep,
    "--deeper": u.deeper, "--ink": u.ink, "--panel-rgb": u.panelRgb, "--line-solid": u.lineSolid,
    "--text": u.text, "--muted": u.muted, "--field": u.field, "--icon-bg": u.iconBg,
    "--tool-bg": u.toolBg, "--toolbar": u.toolbar, "--btn": u.btn, "--hover": u.hover };
  for (const k in map) s.setProperty(k, map[k]);
  return t;
}

// Reads saved settings, migrating the old boolean "cyan" key.
async function gxLoadSettings() {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const s = await api.storage.local.get(["theme", "applyBrowser", "cyan", "customThemes", "wallpapers"]);
  const out = {
    customThemes: Array.isArray(s.customThemes) ? s.customThemes : [],
    wallpapers: s.wallpapers && typeof s.wallpapers === "object" ? s.wallpapers : {},
    applyBrowser: s.applyBrowser === undefined ? s.cyan !== false : !!s.applyBrowser
  };
  out.registry = gxRegistry(out);
  out.theme = out.registry[s.theme] ? s.theme : "cyan";
  return out;
}

/* ---------- Custom themes: derive a full palette from one accent colour ---------- */
function gxHexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function gxHslRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return t.map((v) => Math.round((v + m) * 255));
}
const gxToHex = (a) => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");

function gxDerive(accent) {
  accent = /^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : "#a855f7";
  const [h, s0, l0] = gxHexToHsl(accent);
  const sd = Math.min(s0, 0.45); // keep the dark surfaces tinted but not loud
  const X = (s, l) => gxToHex(gxHslRgb(h, s, Math.max(0, Math.min(1, l))));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  const toolbar = X(sd, 0.07);
  return {
    acc: accent, accRgb: rgb(accent), bright: X(s0, Math.min(0.8, l0 + 0.15)),
    deep: X(s0, Math.max(0.2, l0 - 0.14)), deeper: X(s0, Math.max(0.12, l0 - 0.28)),
    ink: X(sd, 0.03), panelRgb: rgb(X(sd, 0.07)), lineSolid: X(sd, 0.16),
    text: X(Math.min(s0, 0.9), 0.95), muted: X(sd, 0.74), field: X(sd, 0.04), iconBg: X(sd, 0.08),
    toolBg: "rgba(" + rgb(X(sd, 0.1)) + ",0.9)", toolbar, btn: X(sd, 0.1), hover: X(sd, 0.16),
    active: X(sd, 0.24), highlight: X(s0, 0.3), tabText: X(sd, 0.66),
    frameInactive: X(sd, 0.04), fieldText: X(Math.min(s0, 0.8), 0.92)
  };
}

// Built-in + custom themes, with any wallpaper overrides applied.
function gxRegistry(settings) {
  const reg = {};
  for (const k of Object.keys(GX_THEMES)) reg[k] = { id: k, builtin: true, label: GX_THEMES[k].label, wallpaper: GX_THEMES[k].wallpaper, ui: GX_THEMES[k].ui };
  for (const c of settings.customThemes || [])
    reg[c.id] = { id: c.id, builtin: false, label: c.label, accent: c.accent, wallpaper: null, ui: gxDerive(c.accent) };
  for (const id of Object.keys(reg)) if (settings.wallpapers && settings.wallpapers[id]) reg[id].wallpaper = settings.wallpapers[id];
  return reg;
}
