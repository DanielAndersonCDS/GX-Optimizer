// GX Optimizer Cava feeder. Idle unless the new tab visualizer is switched on.
// It taps the <video>/<audio> element that is playing in this page, never the
// microphone, and sends only 72 numbers per frame to the extension.
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const BANDS = 72;
  let on = false, timer = 0, actx = null, analyser = null, data = null, node = null, cur = null, lastTry = 0;

  function playing() {
    for (const e of document.querySelectorAll("video,audio"))
      if (!e.paused && !e.ended && e.readyState > 2 && !e.muted && e.volume > 0) return e;
    return null;
  }
  function detach() {
    try { if (node) node.disconnect(); } catch (_) {}
    if (actx) actx.close().catch(() => {});
    node = actx = analyser = data = cur = null;
  }
  function attach(el) {
    detach();
    try {
      const st = el.captureStream ? el.captureStream() : el.mozCaptureStream();
      if (!st.getAudioTracks().length) return;
      actx = new AudioContext();
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.6;
      node = actx.createMediaStreamSource(st);
      node.connect(analyser); // not connected to speakers, so playback is untouched
      data = new Uint8Array(analyser.frequencyBinCount);
      cur = el;
      actx.resume().catch(() => {});
    } catch (_) { detach(); }
  }
  function bands() {
    analyser.getByteFrequencyData(data);
    const nyq = actx.sampleRate / 2, binHz = nyq / data.length, lo = 50, hi = Math.min(12000, nyq);
    const out = new Array(BANDS);
    for (let i = 0; i < BANDS; i++) {
      const f0 = lo * Math.pow(hi / lo, i / BANDS), f1 = lo * Math.pow(hi / lo, (i + 1) / BANDS);
      const a = Math.floor(f0 / binHz), b = Math.max(a + 1, Math.ceil(f1 / binHz));
      let m = 0;
      for (let k = a; k < b && k < data.length; k++) m = Math.max(m, data[k]);
      out[i] = Math.round(Math.pow(m / 255, 1.6) * (1 + (i / BANDS) * 0.5) * 100) / 100;
    }
    return out;
  }
  function tick() {
    if (!on) return;
    const el = playing();
    if (!el) { if (cur) detach(); return; }
    if (el !== cur) {
      const now = Date.now();
      if (now - lastTry < 1500) return;
      lastTry = now; attach(el);
      if (!analyser) return;
    }
    api.runtime.sendMessage({ type: "cavaFrame", bands: bands() })
      .then((r) => { if (!r) setOn(false); }) // nobody is displaying the visualizer
      .catch(() => setOn(false));
  }
  function setOn(v) {
    on = v; clearInterval(timer); timer = 0;
    if (v) timer = setInterval(tick, 33); else detach();
  }

  api.storage.local.get("cavaListening").then((r) => setOn(!!r.cavaListening));
  api.storage.onChanged.addListener((c) => { if (c.cavaListening) setOn(!!c.cavaListening.newValue); });
})();
