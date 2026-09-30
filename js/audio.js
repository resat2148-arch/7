// Tiny synthesized sound effects via WebAudio (no asset files).
'use strict';

const Sound = (() => {
  let ctx = null, master = null;
  let muted = false;
  const last = {};

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function tone(freq, dur, type, vol, slide, delay) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // Rate-limit identical sounds
  function limited(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  const sfx = {
    click() { if (limited('click', 40)) tone(660, 0.05, 'square', 0.08); },
    place() { if (limited('place', 50)) { tone(220, 0.08, 'square', 0.15, 0.6); noise(0.06, 0.15, 800); } },
    belt() { if (limited('belt', 35)) tone(440 + Math.random() * 80, 0.04, 'triangle', 0.08); },
    remove() { if (limited('remove', 50)) { tone(300, 0.12, 'sawtooth', 0.1, 0.4); } },
    error() { if (limited('error', 200)) { tone(160, 0.15, 'square', 0.12); tone(120, 0.18, 'square', 0.1, 1, 0.08); } },
    mine() { if (limited('mine', 60)) { noise(0.07, 0.35, 2000 + Math.random() * 800); tone(900, 0.03, 'square', 0.05); } },
    chop() { if (limited('chop', 60)) { noise(0.1, 0.35, 500); } },
    craft() { if (limited('craft', 80)) tone(880, 0.06, 'triangle', 0.1, 1.5); },
    collect() { tone(660, 0.08, 'sine', 0.2); tone(990, 0.1, 'sine', 0.2, 1, 0.07); tone(1320, 0.14, 'sine', 0.18, 1, 0.14); },
    milestone() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, 1, i * 0.1));
      tone(1568, 0.5, 'sine', 0.12, 1, 0.42);
    },
    phase() {
      [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.1, 1, i * 0.12));
      noise(1.2, 0.15, 300);
    },
    coupon() { tone(1200, 0.06, 'square', 0.08); tone(1600, 0.08, 'square', 0.08, 1, 0.06); },
  };

  return {
    ensure,
    sfx,
    get muted() { return muted; },
    setMuted(m) { muted = m; },
  };
})();
