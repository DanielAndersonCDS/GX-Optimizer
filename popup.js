const api = typeof browser !== "undefined" ? browser : chrome;
const $ = (s) => document.querySelector(s);
let current = "cyan", reg = {};

function paintThemes() {
  gxApplyUi(reg[current] || reg.cyan);
  document.querySelectorAll("#themes button").forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.name === current)));
}
function buildThemes() {
  const wrap = $("#themes");
  for (const name of Object.keys(reg)) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.name = name; b.setAttribute("role", "radio");
    const dot = document.createElement("span");
    dot.className = "dot"; dot.style.background = reg[name].ui.acc;
    b.append(dot, reg[name].label);
    b.addEventListener("click", () => { current = name; api.storage.local.set({ theme: name }); paintThemes(); });
    wrap.append(b);
  }
}
async function buildLockers() {
  const { lockers } = await api.storage.local.get("lockers");
  const wrap = $("#lockers");
  const list = Array.isArray(lockers) ? lockers.filter((l) => l.items && l.items.length) : [];
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "hint"; p.textContent = "No saved links yet. Open the new tab page and use the droplet button.";
    wrap.replaceWith(p);
    return;
  }
  for (const l of list) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = `${l.name} (${l.items.length})`;
    b.addEventListener("click", () => l.items.forEach((it, i) => api.tabs.create({ url: it.url, active: i === 0 })));
    wrap.append(b);
  }
}
async function init() {
  const s = await gxLoadSettings();
  reg = s.registry; current = s.theme; buildThemes();
  $("#browserTheme").checked = s.applyBrowser; paintThemes();
  buildLockers();
}
$("#browserTheme").addEventListener("change", (e) => api.storage.local.set({ applyBrowser: e.target.checked }));
init();
