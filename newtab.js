(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const $ = (s) => document.querySelector(s);

  const DEFAULTS = [
    { id: "steam",   name: "Steam",   url: "https://store.steampowered.com/", icon: "icons/steam.png" },
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/",        icon: "icons/youtube.svg" },
    { id: "roblox",  name: "Roblox",  url: "https://www.roblox.com/",         icon: "icons/roblox.svg" },
    { id: "discord", name: "Discord", url: "https://discord.com/app",         icon: "icons/discord.png" }
  ];

  // Magnification tuning
  const MAX_SCALE = 1.9, SIGMA = 74, EASE = 0.26;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const track = $("#track"), dock = $("#dock"), labelEl = $("#label");
  let shortcuts = [], cavaOn = false, themeName = "cyan", pointerX = null, dragId = null, raf = 0, editingId = null, menuId = null;

  /* ---------- storage ---------- */
  const save = () => api.storage.local.set({ shortcuts });
  async function load() {
    const { shortcuts: s, seedDiscord } = await api.storage.local.get(["shortcuts", "seedDiscord"]);
    shortcuts = Array.isArray(s) ? s : DEFAULTS.slice();
    if (!seedDiscord) { // add Discord once for people who already had a saved list
      if (!shortcuts.some((x) => x.id === "discord")) shortcuts.push(DEFAULTS.find((d) => d.id === "discord"));
      api.storage.local.set({ seedDiscord: true, shortcuts });
    }
    for (const sc of shortcuts) {
      if (sc.icon === "icons/steam.svg") sc.icon = "icons/steam.png";
      if (sc.icon === "icons/discord.svg") sc.icon = "icons/discord.png";
    }
  }

  /* ---------- helpers ---------- */
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function normalizeUrl(raw) {
    let v = raw.trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null; }
    catch (_) { return null; }
  }
  function letterTile(name) {
    const d = document.createElement("div");
    d.className = "letter"; d.textContent = (name.trim()[0] || "?").toUpperCase();
    return d;
  }
  function makeIcon(sc) {
    const wrap = document.createElement("div");
    wrap.className = "icon";
    const img = document.createElement("img");
    img.alt = ""; img.draggable = false;
    if (sc.icon) { img.src = sc.icon; if (sc.icon.endsWith(".png")) img.className = "mid"; }
    else { img.className = "pad"; try { img.src = new URL(sc.url).origin + "/favicon.ico"; } catch (_) {} }
    img.onerror = () => img.replaceWith(letterTile(sc.name));
    wrap.append(img);
    return wrap;
  }
  const SVG = {
    locker: "icons/droplet.png",
    cava: "icons/bars.png",
    theme: "icons/paint.png",
    add: "text:+"
  };
  function makeTool(id, label, svg, onClick) {
    const b = document.createElement("button");
    b.className = "item tool"; b.dataset.label = label; b.dataset.tool = id; b.type = "button";
    b.setAttribute("aria-label", label);
    const icon = document.createElement("div");
    icon.className = "icon";
    if (svg.startsWith("text:")) {
      const p = document.createElement("span");
      p.className = "plus"; p.textContent = svg.slice(5);
      icon.append(p);
    } else if (svg.startsWith("icons/")) {
      const im = document.createElement("img");
      im.src = svg; im.alt = ""; im.draggable = false; im.className = "glyph";
      icon.append(im);
    } else {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      icon.append(document.importNode(doc.documentElement, true));
    }
    b.append(icon);
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- render ---------- */
  function render() {
    track.textContent = "";
    for (const sc of shortcuts) {
      const a = document.createElement("a");
      a.className = "item"; a.href = sc.url; a.dataset.id = sc.id; a.dataset.label = sc.name;
      a.draggable = true; a.setAttribute("aria-label", sc.name);
      a.append(makeIcon(sc));
      track.append(a);
    }
    const sep = document.createElement("div"); sep.className = "sep"; track.append(sep);
    const lockerBtn = makeTool("locker", "Lockers", SVG.locker, toggleLocker);
    const cavaBtn = makeTool("cava", "", SVG.cava, () => setCava(!cavaOn));
    cavaBtn.classList.toggle("on", cavaOn);
    cavaBtn.dataset.label = cavaOn ? "Cava: on" : "Cava: off";
    const themeBtn = makeTool("theme", "Theme: " + curTheme().label, SVG.theme, openThemeMenu);
    track.append(lockerBtn, cavaBtn, themeBtn, makeTool("add", "Add shortcut", SVG.add, () => openEditor()));
    kick();
  }

  /* ---------- magnification loop ---------- */
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const els = [...track.children];
    if (!els.length) return;
    const base = els.map((e) => e.offsetWidth);
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    let moving = false, best = null, bestS = 1.12;

    els.forEach((el, i) => {
      let target = 1;
      if (!REDUCED && pointerX !== null && !dragId && !el.classList.contains("sep")) {
        const d = pointerX - (el.offsetLeft + base[i] / 2);
        target = 1 + (MAX_SCALE - 1) * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      }
      let s = el._s ?? 1;
      s += (target - s) * EASE;
      if (Math.abs(target - s) > 0.002) moving = true; else s = target;
      el._s = s;
      if (!el.classList.contains("sep") && s > bestS) { best = el; bestS = s; }
    });

    let total = gap * (els.length - 1);
    els.forEach((el, i) => (total += base[i] * el._s));
    const first = els[0], last = els[els.length - 1];
    const rest = last.offsetLeft + last.offsetWidth - first.offsetLeft;
    let x = first.offsetLeft - (total - rest) / 2;
    els.forEach((el, i) => {
      el.style.transform = `translate3d(${(x - el.offsetLeft).toFixed(2)}px,0,0) scale(${el._s.toFixed(4)})`;
      x += base[i] * el._s + gap;
    });

    // label above the most magnified icon
    if (best && best.dataset.label && pointerX !== null && !dragId) {
      const r = best.getBoundingClientRect();
      labelEl.textContent = best.dataset.label;
      labelEl.style.left = r.left + r.width / 2 + "px";
      labelEl.style.top = r.top - 10 + "px";
      labelEl.classList.add("show");
    } else labelEl.classList.remove("show");

    if (pointerX !== null || moving) kick();
  }

  dock.addEventListener("pointermove", (e) => { pointerX = e.clientX - track.getBoundingClientRect().left; kick(); });
  dock.addEventListener("pointerleave", () => { pointerX = null; kick(); });
  window.addEventListener("resize", kick);

  /* ---------- launching ---------- */
  // Paste a link anywhere on the page (outside the text boxes) to open it.
  document.addEventListener("paste", (e) => {
    if (e.target.closest("input, textarea, dialog")) return;
    const first = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim().split(/\s+/)[0];
    const url = normalizeUrl(first || "");
    if (!url) { toast("That doesn’t look like a link."); return; }
    toast("Opening " + new URL(url).hostname + "…");
    setTimeout(() => { location.href = url; }, 250);
  });

  function launch(sc, el) {
    el.classList.remove("launching"); void el.offsetWidth; el.classList.add("launching");
    setTimeout(() => el.classList.remove("launching"), 1100);
    setTimeout(() => { location.href = sc.url; }, REDUCED ? 0 : 640);
  }

  track.addEventListener("click", (e) => {
    const a = e.target.closest("a.item");
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey) return; // let the browser handle new-tab clicks
    e.preventDefault();
    const sc = shortcuts.find((s) => s.id === a.dataset.id);
    if (sc) launch(sc, a);
  });

  /* ---------- drag to rearrange ---------- */
  track.addEventListener("dragstart", (e) => {
    const a = e.target.closest("a.item"); if (!a) return;
    dragId = a.dataset.id; a.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", a.href);
    labelEl.classList.remove("show");
  });
  track.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const mx = e.clientX - track.getBoundingClientRect().left;
    pointerX = mx; kick();
    const dragEl = track.querySelector(`[data-id="${CSS.escape(dragId)}"]`);
    const others = [...track.querySelectorAll("a.item")].filter((el) => el !== dragEl);
    const ref = others.find((el) => el.offsetLeft + el.offsetWidth / 2 > mx);
    const anchor = ref || track.querySelector(".sep");
    if (dragEl.nextElementSibling !== anchor) track.insertBefore(dragEl, anchor);
  });
  track.addEventListener("drop", (e) => e.preventDefault());
  track.addEventListener("dragend", () => {
    const order = [...track.querySelectorAll("a.item")].map((el) => el.dataset.id);
    shortcuts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    dragId = null; save(); render();
  });

  /* ---------- context menu ---------- */
  const menu = $("#menu");
  track.addEventListener("contextmenu", (e) => {
    const a = e.target.closest("a.item"); if (!a) return;
    e.preventDefault(); menuId = a.dataset.id;
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(e.clientX, innerWidth - w - 8) + "px";
    menu.style.top = Math.max(8, e.clientY - h - 10) + "px";
    menu.querySelector("button").focus();
  });
  const closeMenu = () => { menu.hidden = true; };
  document.addEventListener("click", (e) => {
    const path = e.composedPath();
    if (!path.includes(menu)) menu.hidden = true;
    if (!path.includes(themeMenu) && !e.target.closest('[data-tool="theme"]')) themeMenu.hidden = true;
    if (!path.includes(panel) && !e.target.closest('[data-tool="locker"]') && !e.target.closest("dialog")) panel.hidden = true;
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
  menu.addEventListener("click", (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const sc = shortcuts.find((s) => s.id === menuId); closeMenu(); if (!sc) return;
    if (act === "remove") { shortcuts = shortcuts.filter((s) => s !== sc); save(); render(); toast(`Removed ${sc.name}.`); }
    if (act === "edit") openEditor(sc);
    if (act === "locker") addItem(curLocker(), { title: sc.name, url: sc.url, icon: sc.icon });
  });

  /* ---------- images ---------- */
  async function loadBitmap(file) {
    try {
      const bm = await createImageBitmap(file);
      return { src: bm, w: bm.width, h: bm.height, done() { if (bm.close) bm.close(); } };
    } catch (_) { // SVG and a few other formats
      const url = URL.createObjectURL(file), im = new Image();
      im.src = url; await im.decode();
      return { src: im, w: im.naturalWidth || 256, h: im.naturalHeight || 256, done() { URL.revokeObjectURL(url); } };
    }
  }
  async function iconFromFile(file) {
    const b = await loadBitmap(file), s = Math.min(b.w, b.h);
    const c = document.createElement("canvas"); c.width = c.height = 128;
    c.getContext("2d").drawImage(b.src, (b.w - s) / 2, (b.h - s) / 2, s, s, 0, 0, 128, 128);
    b.done();
    return c.toDataURL("image/png");
  }

  /* ---------- add / edit dialog ---------- */
  const dlg = $("#editor"), fName = $("#fName"), fUrl = $("#fUrl"), fErr = $("#fErr");
  const fIcon = $("#fIcon"), fReset = $("#fReset"), fResetWrap = $("#fResetWrap");
  function openEditor(sc) {
    editingId = sc ? sc.id : null;
    $("#editTitle").textContent = sc ? "Edit shortcut" : "Add shortcut";
    fName.value = sc ? sc.name : ""; fUrl.value = sc ? sc.url : ""; fErr.hidden = true;
    fIcon.value = ""; fReset.checked = false; fResetWrap.hidden = !(sc && sc.custom);
    dlg.showModal(); fName.focus();
  }
  $("#fCancel").addEventListener("click", () => dlg.close());
  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = normalizeUrl(fUrl.value);
    if (!url) { fErr.textContent = "Enter a valid website, like example.com."; fErr.hidden = false; return; }
    const name = fName.value.trim();
    let iconData = null;
    if (fIcon.files[0]) {
      try { iconData = await iconFromFile(fIcon.files[0]); }
      catch (_) { fErr.textContent = "Couldn’t read that image. Try a PNG, JPG or SVG."; fErr.hidden = false; return; }
    }
    let sc;
    if (editingId) {
      sc = shortcuts.find((s) => s.id === editingId);
      if (sc) {
        sc.name = name;
        if (sc.url !== url) { sc.url = url; if (!sc.custom && !DEFAULTS.some((d) => d.id === sc.id)) delete sc.icon; }
      }
    } else {
      sc = { id: "u" + Date.now().toString(36), name, url };
      shortcuts.push(sc);
    }
    if (sc) {
      if (iconData) { sc.icon = iconData; sc.custom = true; }
      else if (fReset.checked) {
        const d = DEFAULTS.find((x) => x.id === sc.id);
        if (d) sc.icon = d.icon; else delete sc.icon;
        delete sc.custom;
      }
    }
    save(); dlg.close(); render();
  });

  /* ---------- themes ---------- */
  let settings = { customThemes: [], wallpapers: {}, registry: {} };
  const themeMenu = $("#themeMenu"), wpFile = $("#wpFile");
  const curTheme = () => settings.registry[themeName] || settings.registry.cyan || { label: "Cyan" };
  function closeMenus() { menu.hidden = true; themeMenu.hidden = true; panel.hidden = true; }

  function paintTheme() {
    const t = gxApplyUi(curTheme()), u = t.ui;
    applyWallpaper(t);
    Cava.setColors(u.acc, u.bright);
    const b = track.querySelector('[data-tool="theme"]');
    if (b) b.dataset.label = "Theme: " + t.label;
    document.documentElement.classList.add("ready");
  }
  async function persist() {
    settings.registry = gxRegistry(settings);
    try {
      await api.storage.local.set({ customThemes: settings.customThemes, wallpapers: settings.wallpapers, theme: themeName });
    } catch (_) { toast("Couldn’t save. Browser storage may be full."); }
  }
  async function compressImage(file) {
    const b = await loadBitmap(file);
    const k = Math.min(1, 1920 / Math.max(b.w, b.h));
    const c = document.createElement("canvas");
    c.width = Math.round(b.w * k); c.height = Math.round(b.h * k);
    c.getContext("2d").drawImage(b.src, 0, 0, c.width, c.height);
    b.done();
    return c.toDataURL("image/jpeg", 0.85);
  }

  // Animated wallpapers (GIF / MP4 / WebM) live in IndexedDB as files. Pictures stay in storage.
  const openDb = () => new Promise((res, rej) => {
    const r = indexedDB.open("gx-optimizer", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("wp");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  async function idbRun(mode, fn) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction("wp", mode), req = fn(tx.objectStore("wp"));
      tx.oncomplete = () => { db.close(); res(req && req.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    });
  }
  const putBlob = (id, b) => idbRun("readwrite", (s) => s.put(b, id));
  const getBlob = (id) => idbRun("readonly", (s) => s.get(id));
  const delBlob = (id) => idbRun("readwrite", (s) => s.delete(id)).catch(() => {});
  const MAX_ANIMATED = 40 * 1024 * 1024;

  async function storeWallpaper(id, file) {
    const video = file.type.startsWith("video/"), gif = file.type === "image/gif";
    if (video || gif) {
      if (file.size > MAX_ANIMATED) throw new Error("big");
      await putBlob(id, file);
      settings.wallpapers[id] = (video ? "idb:video:" : "idb:gif:") + Date.now();
    } else {
      await delBlob(id);
      settings.wallpapers[id] = await compressImage(file);
    }
  }
  const wpError = (e) => toast(e && e.message === "big" ? "That file is over 40 MB. Try a shorter or smaller one." : "Couldn’t use that file.");

  let wpUrl = null, wpKey = "", wpToken = 0;
  async function applyWallpaper(t) {
    const u = t.ui, w = t.wallpaper || "", vid = $("#bgVideo");
    const glow = `radial-gradient(ellipse at 50% 30%, rgba(${u.accRgb},0.30), transparent 62%), radial-gradient(ellipse at 15% 100%, rgba(${u.accRgb},0.16), transparent 55%)`;
    if (!w.startsWith("idb:")) { // picture, built-in art or nothing
      wpKey = ""; wpToken++;
      if (wpUrl) { URL.revokeObjectURL(wpUrl); wpUrl = null; }
      vid.hidden = true; vid.removeAttribute("src");
      document.documentElement.classList.remove("animated");
      document.body.style.backgroundImage = w ? `url("${w}")` : glow;
      return;
    }
    const key = t.id + "|" + w;
    if (key === wpKey) return; // already showing this one, so don't restart the video
    wpKey = key; const token = ++wpToken;
    const blob = await getBlob(t.id).catch(() => null);
    if (token !== wpToken) return;
    if (!blob) { document.body.style.backgroundImage = glow; return; }
    if (wpUrl) URL.revokeObjectURL(wpUrl);
    wpUrl = URL.createObjectURL(blob);
    document.documentElement.classList.add("animated");
    if (w.startsWith("idb:video")) {
      document.body.style.backgroundImage = "none";
      vid.src = wpUrl; vid.hidden = false;
      if (REDUCED) vid.pause(); else vid.play().catch(() => {});
    } else {
      vid.hidden = true; vid.removeAttribute("src");
      document.body.style.backgroundImage = `url("${wpUrl}")`;
    }
  }
  document.addEventListener("visibilitychange", () => {
    const v = $("#bgVideo");
    if (v && !v.hidden && v.src) { if (document.hidden) v.pause(); else if (!REDUCED) v.play().catch(() => {}); }
  });

  function openThemeMenu() {
    if (!themeMenu.hidden) { themeMenu.hidden = true; return; }
    menu.hidden = true;
    themeMenu.textContent = "";
    const add = (label, fn, cls, dot, checked) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "menuitem"); if (cls) b.className = cls;
      if (dot) { const d = document.createElement("span"); d.className = "dot"; d.style.background = dot; b.append(d); }
      const s = document.createElement("span"); s.textContent = label; b.append(s);
      if (checked) { const k = document.createElement("span"); k.className = "check"; k.textContent = "✓"; b.append(k); }
      b.addEventListener("click", () => { closeMenus(); fn(); });
      themeMenu.append(b);
    };
    const line = () => { const d = document.createElement("div"); d.className = "line"; themeMenu.append(d); };
    for (const [id, t] of Object.entries(settings.registry))
      add(t.label, () => selectTheme(id), "", t.ui.acc, id === themeName);
    line();
    add("New theme…", () => openThemeEditor());
    add("Change wallpaper…", () => wpFile.click());
    add("Keyboard sound…", openSoundDialog);
    const t = curTheme();
    if (settings.wallpapers[themeName]) add(t.builtin ? "Reset wallpaper" : "Remove wallpaper", resetWallpaper);
    if (!t.builtin) { add("Edit theme…", () => openThemeEditor(t)); add("Delete theme", () => deleteTheme(t.id), "danger"); }

    themeMenu.hidden = false;
    const a = track.querySelector('[data-tool="theme"]').getBoundingClientRect();
    const w = themeMenu.offsetWidth, h = themeMenu.offsetHeight;
    themeMenu.style.left = Math.max(8, Math.min(a.left + a.width / 2 - w / 2, innerWidth - w - 8)) + "px";
    themeMenu.style.top = Math.max(8, a.top - h - 14) + "px";
    themeMenu.querySelector("button").focus();
  }

  function selectTheme(id) { themeName = id; paintTheme(); persist(); }
  async function resetWallpaper() { await delBlob(themeName); delete settings.wallpapers[themeName]; paintTheme(); await persist(); paintTheme(); toast("Wallpaper reset."); }
  async function deleteTheme(id) {
    settings.customThemes = settings.customThemes.filter((c) => c.id !== id);
    delete settings.wallpapers[id]; await delBlob(id);
    themeName = "cyan"; await persist(); paintTheme(); toast("Theme deleted.");
  }

  wpFile.addEventListener("change", async () => {
    const f = wpFile.files[0]; wpFile.value = "";
    if (!f) return;
    try {
      await storeWallpaper(themeName, f);
      await persist(); paintTheme(); toast("Wallpaper updated.");
    } catch (e) { wpError(e); }
  });

  // Theme editor
  const tDlg = $("#themeEditor"), tName = $("#tName"), tColor = $("#tColor"), tFile = $("#tFile"), tErr = $("#tErr");
  let editingTheme = null;
  function openThemeEditor(t) {
    editingTheme = t || null;
    $("#themeTitle").textContent = t ? "Edit theme" : "New theme";
    tName.value = t ? t.label : ""; tColor.value = t ? t.accent : "#a855f7"; tFile.value = ""; tErr.hidden = true;
    tDlg.showModal(); tName.focus();
  }
  $("#tCancel").addEventListener("click", () => tDlg.close());
  $("#themeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = tName.value.trim(), accent = tColor.value;
    if (!label) return;
    let id;
    if (editingTheme) {
      id = editingTheme.id;
      const c = settings.customThemes.find((x) => x.id === id);
      if (c) { c.label = label; c.accent = accent; }
    } else {
      id = "c_" + Date.now().toString(36);
      settings.customThemes.push({ id, label, accent });
    }
    if (tFile.files[0]) {
      try { await storeWallpaper(id, tFile.files[0]); }
      catch (e) { tErr.textContent = e && e.message === "big" ? "That file is over 40 MB." : "Couldn’t read that file. Try a JPG, PNG, GIF or MP4."; tErr.hidden = false; return; }
    }
    themeName = id;
    await persist(); tDlg.close(); paintTheme();
    toast(editingTheme ? "Theme saved." : `Theme “${label}” created.`);
  });

  api.storage.onChanged.addListener(async (c) => {
    if (c.theme || c.customThemes || c.wallpapers) {
      settings = await gxLoadSettings(); themeName = settings.theme; paintTheme();
    }
  });

  /* ---------- cava ---------- */
  function paintCava() {
    const b = track.querySelector('[data-tool="cava"]');
    if (b) { b.classList.toggle("on", cavaOn); b.dataset.label = cavaOn ? "Cava: on" : "Cava: off"; }
  }
  async function setCava(on, quiet) {
    if (on) {
      await Cava.start();
      cavaOn = true;
      if (!quiet) toast("Cava is on. It reacts to audio playing in your Firefox tabs.");
    } else { Cava.stop(); cavaOn = false; }
    paintCava();
    api.storage.local.set({ cava: cavaOn });
  }

  /* ---------- lockers (desks of saved links) ---------- */
  let lockers = [], lockerId = null;
  const panel = $("#lockerPanel");
  const curLocker = () => lockers.find((l) => l.id === lockerId) || lockers[0];
  const saveLockers = () => api.storage.local.set({ lockers, lockerId });
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const mk = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return u; } };

  function promptName(title, initial) {
    return new Promise((res) => {
      const d = $("#nameDlg"), i = $("#nameInput");
      let done = false;
      const finish = (v) => { if (done) return; done = true; d.close(); res(v); };
      $("#nameTitle").textContent = title; i.value = initial || "";
      $("#nameForm").onsubmit = (e) => { e.preventDefault(); finish(i.value.trim() || null); };
      $("#nameCancel").onclick = () => finish(null);
      d.onclose = () => finish(null);
      d.showModal(); i.focus(); i.select();
    });
  }
  function lockerIcon(it) {
    const w = mk("div", "li-icon"), img = document.createElement("img");
    img.alt = ""; img.draggable = false;
    if (it.icon) img.src = it.icon;
    else { try { img.src = new URL(it.url).origin + "/favicon.ico"; } catch (_) {} }
    img.onerror = () => img.replaceWith(letterTile(it.title || hostOf(it.url)));
    w.append(img);
    return w;
  }
  function addItem(L, it) {
    if (!L) return;
    if (L.items.some((x) => x.url === it.url)) { toast(`Already in ${L.name}.`); return; }
    if (L.items.length >= 50) { toast("This locker is full (50 links)."); return; }
    L.items.push({ id: newId("i"), title: (it.title || hostOf(it.url)).slice(0, 60), url: it.url, icon: it.icon });
    saveLockers(); if (!panel.hidden) renderLocker();
    toast(`Added to ${L.name}.`);
  }
  function openAll(L) {
    if (!L.items.length) { toast("This locker is empty."); return; }
    L.items.forEach((it, i) => api.tabs.create({ url: it.url, active: i === 0 }));
    panel.hidden = true;
  }
  async function saveOpenTabs(L) {
    const tabs = await api.tabs.query({ currentWindow: true });
    let n = 0;
    for (const t of tabs) {
      if (!/^https?:/i.test(t.url || "") || L.items.some((x) => x.url === t.url) || L.items.length >= 50) continue;
      L.items.push({ id: newId("i"), title: (t.title || hostOf(t.url)).slice(0, 60), url: t.url }); n++;
    }
    saveLockers(); renderLocker();
    toast(n ? `Saved ${n} tab${n > 1 ? "s" : ""} to ${L.name}.` : "No new tabs to save.");
  }
  async function newLocker() {
    const name = await promptName("New locker", "");
    if (!name) return;
    const L = { id: newId("l"), name, items: [] };
    lockers.push(L); lockerId = L.id; saveLockers(); renderLocker();
  }
  async function renameLocker(L) {
    const name = await promptName("Rename locker", L.name);
    if (name) { L.name = name; saveLockers(); renderLocker(); }
  }
  function deleteLocker(L) {
    if (!confirm(`Delete “${L.name}” and its list?`)) return;
    lockers = lockers.filter((x) => x !== L);
    if (!lockers.length) lockers = [{ id: "desk", name: "My Desk", items: [] }];
    lockerId = lockers[0].id; saveLockers(); renderLocker();
  }

  function renderLocker() {
    const L = curLocker();
    panel.textContent = "";
    panel.append(mk("h3", null, "Lockers"));

    const chips = mk("div", "lk-chips");
    for (const l of lockers) {
      const b = mk("button", "lk-chip" + (l === L ? " on" : ""), l.name); b.type = "button";
      b.addEventListener("click", () => { lockerId = l.id; saveLockers(); renderLocker(); });
      chips.append(b);
    }
    const nb = mk("button", "lk-chip lk-new", "+"); nb.type = "button"; nb.title = "New locker";
    nb.addEventListener("click", newLocker); chips.append(nb);
    panel.append(chips);

    const list = mk("ul", "lk-list");
    if (!L.items.length) list.append(mk("li", "lk-empty", "Empty. Paste a link below, add from your dock, or save your open tabs."));
    for (const it of L.items) {
      const li = mk("li", "lk-item"), open = mk("button", "lk-open"); open.type = "button";
      const tx = mk("span", "lk-text");
      tx.append(mk("span", "lk-title", it.title || hostOf(it.url)), mk("span", "lk-host", hostOf(it.url)));
      open.append(lockerIcon(it), tx);
      open.addEventListener("click", () => api.tabs.create({ url: it.url }));
      const x = mk("button", "lk-x", "×"); x.type = "button"; x.title = "Remove";
      x.addEventListener("click", () => { L.items = L.items.filter((i) => i.id !== it.id); saveLockers(); renderLocker(); });
      li.append(open, x); list.append(li);
    }
    panel.append(list);

    const input = mk("input", "lk-input");
    input.placeholder = "Paste a link and press Enter"; input.spellcheck = false; input.autocomplete = "off";
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const url = normalizeUrl(input.value.trim().split(/\s+/)[0] || "");
      if (!url) { toast("That doesn’t look like a link."); return; }
      addItem(L, { title: hostOf(url), url }); input.value = "";
    });
    panel.append(input);

    if (shortcuts.length) {
      panel.append(mk("p", "lk-sub", "Add from your dock"));
      const row = mk("div", "lk-dock");
      for (const sc of shortcuts) {
        const b = mk("button", "lk-mini"); b.type = "button"; b.title = sc.name;
        b.append(makeIcon(sc));
        b.addEventListener("click", () => addItem(L, { title: sc.name, url: sc.url, icon: sc.icon }));
        row.append(b);
      }
      panel.append(row);
    }

    const act = mk("div", "lk-actions");
    const btn = (t, fn, cls) => { const b = mk("button", cls || "", t); b.type = "button"; b.addEventListener("click", fn); act.append(b); };
    btn(`Open all (${L.items.length})`, () => openAll(L), "primary");
    btn("Save open tabs", () => saveOpenTabs(L));
    btn("Rename", () => renameLocker(L));
    btn("Delete", () => deleteLocker(L), "danger");
    panel.append(act);
  }

  function toggleLocker() {
    if (!panel.hidden) { panel.hidden = true; return; }
    menu.hidden = true; themeMenu.hidden = true;
    renderLocker(); panel.hidden = false;
    const a = track.querySelector('[data-tool="locker"]').getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight;
    panel.style.left = Math.max(8, Math.min(a.left + a.width / 2 - w / 2, innerWidth - w - 8)) + "px";
    panel.style.top = Math.max(8, a.top - h - 14) + "px";
  }

  /* ---------- keyboard sound ---------- */
  // Two built-in sounds are synthesised (nothing to download). "My own files" plays your recordings.
  let kbd = { mode: "off", vol: 0.6 }, kctx = null, kmaster = null, knoise = null, kcustom = [], kdecoding = false;
  const KCUSTOM = "kbd:custom";

  function audio() {
    if (!kctx) {
      kctx = new AudioContext();
      kmaster = kctx.createGain(); kmaster.connect(kctx.destination);
      knoise = kctx.createBuffer(1, kctx.sampleRate, kctx.sampleRate);
      const d = knoise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (kctx.state === "suspended") kctx.resume();
    kmaster.gain.value = kbd.vol;
    return kctx;
  }
  function env(ctx, t, gain, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(kmaster);
    return g;
  }
  function noise(ctx, t, type, freq, q, dur, gain) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    s.buffer = knoise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(env(ctx, t, gain, dur));
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }
  function tone(ctx, t, f0, f1, dur, gain) {
    const o = ctx.createOscillator();
    o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(env(ctx, t, gain, dur)); o.start(t); o.stop(t + dur + 0.02);
  }
  function synth(mode, up, wide) {
    const ctx = audio(), t = ctx.currentTime + 0.005, r = (0.92 + Math.random() * 0.16) * (wide ? 0.8 : 1);
    if (mode === "thock") {
      if (!up) {
        tone(ctx, t, 190 * r, 95 * r, 0.09, 0.55);
        noise(ctx, t, "lowpass", 1400 * r, 0.7, 0.06, 0.5);
        noise(ctx, t, "highpass", 3500, 0.7, 0.012, 0.12);
      } else {
        tone(ctx, t, 150 * r, 110 * r, 0.05, 0.15);
        noise(ctx, t, "highpass", 3000, 0.7, 0.01, 0.06);
      }
    } else if (!up) { // clicky
      noise(ctx, t, "bandpass", 2800 * r, 6, 0.05, 0.6);
      noise(ctx, t, "highpass", 5000, 0.7, 0.012, 0.5);
      noise(ctx, t + 0.016, "highpass", 4000, 0.7, 0.01, 0.35);
      tone(ctx, t, 260 * r, 120 * r, 0.05, 0.2);
    } else {
      noise(ctx, t, "highpass", 4500, 0.7, 0.01, 0.3);
      noise(ctx, t, "bandpass", 2400, 5, 0.03, 0.2);
    }
  }
  async function loadCustomSounds() {
    if (kdecoding) return; kdecoding = true;
    try {
      const blobs = (await getBlob(KCUSTOM)) || [], ctx = audio(); kcustom = [];
      for (const b of blobs) { try { kcustom.push(await ctx.decodeAudioData(await b.arrayBuffer())); } catch (_) {} }
    } catch (_) {}
    kdecoding = false;
  }
  function playKey(e, up) {
    if (kbd.mode === "off") return;
    if (kbd.mode === "custom") {
      if (up) return;
      if (!kcustom.length) { if (!kdecoding) loadCustomSounds(); return; }
      const ctx = audio(), s = ctx.createBufferSource();
      s.buffer = kcustom[Math.floor(Math.random() * kcustom.length)];
      s.playbackRate.value = 0.94 + Math.random() * 0.12;
      s.connect(kmaster); s.start();
      return;
    }
    synth(kbd.mode, up, ["Space", "Enter", "Backspace"].includes(e.code));
  }
  document.addEventListener("keydown", (e) => { if (!e.repeat && !e.isComposing) playKey(e, false); });
  document.addEventListener("keyup", (e) => { if (!e.isComposing) playKey(e, true); });

  const sDlg = $("#soundDlg"), kMode = $("#kMode"), kVol = $("#kVol"), kInfo = $("#kInfo");
  const saveKbd = () => api.storage.local.set({ kbd });
  async function kInfoText() {
    const n = ((await getBlob(KCUSTOM).catch(() => null)) || []).length;
    kInfo.textContent = n ? `${n} of your own sound file${n > 1 ? "s" : ""} loaded.` : "No files of your own yet. Pick short single key-press sounds.";
  }
  function openSoundDialog() {
    kMode.value = kbd.mode; kVol.value = Math.round(kbd.vol * 100);
    kInfoText(); sDlg.showModal();
  }
  kMode.addEventListener("change", () => { kbd.mode = kMode.value; saveKbd(); if (kbd.mode === "custom") loadCustomSounds(); });
  kVol.addEventListener("input", () => { kbd.vol = kVol.value / 100; saveKbd(); if (kmaster) kmaster.gain.value = kbd.vol; });
  $("#kTest").addEventListener("click", () => {
    if (kbd.mode === "off") { toast("Pick a sound first."); return; }
    let i = 0; const run = () => { playKey({ code: "KeyA" }, false); setTimeout(() => playKey({ code: "KeyA" }, true), 60); if (++i < 4) setTimeout(run, 140); };
    run();
  });
  $("#kFiles").addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, 12); e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 2 * 1024 * 1024)) { toast("Each sound must be under 2 MB. Use short clips."); return; }
    try {
      await putBlob(KCUSTOM, files);
      kbd.mode = "custom"; kMode.value = "custom"; saveKbd();
      kcustom = []; kdecoding = false; await loadCustomSounds();
      kInfoText(); toast(`Loaded ${files.length} sound${files.length > 1 ? "s" : ""}.`);
    } catch (_) { toast("Couldn’t save those files."); }
  });
  $("#kClear").addEventListener("click", async () => {
    await delBlob(KCUSTOM); kcustom = [];
    if (kbd.mode === "custom") { kbd.mode = "thock"; kMode.value = "thock"; saveKbd(); }
    kInfoText(); toast("Your sound files were removed.");
  });
  $("#soundForm").addEventListener("submit", (e) => { e.preventDefault(); sDlg.close(); });

  /* ---------- init ---------- */
  (async () => {
    settings = await gxLoadSettings(); themeName = settings.theme;
    await load();
    const st = await api.storage.local.get(["lockers", "lockerId", "kbd"]);
    lockers = Array.isArray(st.lockers) && st.lockers.length ? st.lockers : [{ id: "desk", name: "My Desk", items: [] }];
    lockerId = st.lockerId || lockers[0].id;
    if (st.kbd) kbd = Object.assign(kbd, st.kbd);
    render(); paintTheme();
    const { cava } = await api.storage.local.get("cava");
    if (cava) setCava(true, true);
  })();
})();
