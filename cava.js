// Cava-style visualizer: log-spaced bars with gravity falloff.
// Input comes from audio playing in Firefox tabs (see content.js). No microphone.
window.Cava = (() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const canvas = document.getElementById("cava");
  const ctx = canvas.getContext("2d");
  let acc = "34,211,238", bright = "103,232,249";
  let mode = "off", raf = 0, bars = [], fall = [];
  const feeds = new Map(); // "tab:frame" -> { t, bands }

  function resize() {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  const barCount = () => Math.max(24, Math.min(72, Math.floor(innerWidth / 22)));

  // Receives frames from tabs. Replying tells them someone is watching.
  function onFrame(msg, sender) {
    if (!msg || msg.type !== "cavaFrame") return;
    const key = (sender.tab ? sender.tab.id : 0) + ":" + (sender.frameId || 0);
    feeds.set(key, { t: performance.now(), bands: msg.bands });
    return Promise.resolve({ ok: true });
  }

  function sample(n) {
    const now = performance.now(), out = new Array(n).fill(0);
    for (const [k, f] of feeds) {
      if (now - f.t > 2000) { feeds.delete(k); continue; }
      if (now - f.t > 250) continue;
      const B = f.bands.length;
      for (let i = 0; i < n; i++) {
        const p = (i / Math.max(1, n - 1)) * (B - 1), a = Math.floor(p), b = Math.min(B - 1, a + 1);
        out[i] = Math.max(out[i], f.bands[a] + (f.bands[b] - f.bands[a]) * (p - a));
      }
    }
    return out;
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    const W = innerWidth, H = innerHeight, n = barCount();
    if (bars.length !== n) { bars = new Array(n).fill(0); fall = new Array(n).fill(0); }
    const vals = sample(n);
    ctx.clearRect(0, 0, W, H);
    const maxH = H * 0.42, gap = 5, bw = Math.max(4, (W * 0.92) / n - gap);
    const x0 = (W - n * (bw + gap) + gap) / 2;
    const g = ctx.createLinearGradient(0, H, 0, H - maxH);
    g.addColorStop(0, `rgba(${acc},0.55)`);
    g.addColorStop(0.6, `rgba(${acc},0.22)`);
    g.addColorStop(1, `rgba(${bright},0)`);
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, vals[i]);
      if (v >= bars[i]) { bars[i] = v; fall[i] = 0; }
      else { fall[i] += 0.0035; bars[i] = Math.max(v, bars[i] - fall[i]); } // gravity
      const h = Math.max(3, bars[i] * maxH), x = x0 + i * (bw + gap);
      ctx.beginPath();
      ctx.roundRect(x, H - h, bw, h + 6, [bw / 2, bw / 2, 0, 0]);
      ctx.fill();
    }
  }

  // The timestamp changes on every start so tabs that backed off wake up again.
  const flag = (v) => api.storage.local.set({ cavaListening: v }).catch(() => {});

  async function start() {
    stop();
    api.runtime.onMessage.addListener(onFrame);
    mode = "tabs";
    await flag(Date.now());
    raf = requestAnimationFrame(draw);
    return mode;
  }
  function stop() {
    if (mode === "off") return;
    cancelAnimationFrame(raf); raf = 0; mode = "off";
    api.runtime.onMessage.removeListener(onFrame);
    flag(0);
    feeds.clear(); bars = []; fall = [];
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  addEventListener("pagehide", () => { if (mode !== "off") flag(0); });

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
  function setColors(accHex, brightHex) { acc = hex(accHex); bright = hex(brightHex); }

  return { start, stop, setColors, get mode() { return mode; } };
})();
