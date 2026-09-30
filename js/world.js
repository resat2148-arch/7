// Procedural planet generation (deterministic from a seed).
'use strict';

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const TERR = { GRASS: 0, SAND: 1, WATER: 2, ROCK: 3, MOSS: 4 };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const sm = t => t * t * (3 - 2 * t);
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = vals[perm[X + perm[Y]]], b = vals[perm[X + 1 + perm[Y]]];
    const c = vals[perm[X + perm[Y + 1]]], d = vals[perm[X + 1 + perm[Y + 1]]];
    const u = sm(xf), w = sm(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  return function fbm(x, y, oct) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < (oct || 4); i++) { s += v(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

const World = {
  W: 160,
  H: 160,

  generate(seed) {
    const W = this.W, H = this.H;
    const rnd = mulberry32(seed * 7919 + 13);
    const nWater = makeNoise(seed + 1), nRock = makeNoise(seed + 2), nTree = makeNoise(seed + 3), nMoss = makeNoise(seed + 4);
    const terr = new Uint8Array(W * H);
    const shade = new Uint8Array(W * H);
    const trees = new Uint8Array(W * H);
    const cx = W >> 1, cy = H >> 1;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = Math.hypot(x - cx, y - cy);
        const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
        let w = nWater(x / 30, y / 30, 4);
        if (edge < 6) w += (6 - edge) * 0.06;
        const safe = d < 15;
        let t = TERR.GRASS;
        if (!safe && w > 0.66) t = TERR.WATER;
        else if (!safe && w > 0.615) t = TERR.SAND;
        else {
          const r = nRock(x / 8, y / 8, 3);
          if (!safe && d > 18 && r > 0.72) t = TERR.ROCK;
          else if (nMoss(x / 14, y / 14, 3) > 0.58) t = TERR.MOSS;
        }
        terr[i] = t;
        shade[i] = (nMoss(x / 3, y / 3, 2) * 255) | 0;
        if ((t === TERR.GRASS || t === TERR.MOSS) && d > 11) {
          const f = nTree(x / 16, y / 16, 3);
          if ((f > 0.56 && rnd() < 0.55) || rnd() < 0.025) trees[i] = 1 + ((rnd() * 3) | 0);
        }
      }
    }

    const nodes = [];
    const nodeAt = new Int16Array(W * H).fill(-1);
    const free = (x, y, minGap) => {
      if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) return false;
      const t = terr[y * W + x];
      if (t === TERR.WATER || t === TERR.ROCK) return false;
      if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) return false;
      for (const nd of nodes) if (Math.abs(nd.x - x) < minGap && Math.abs(nd.y - y) < minGap) return false;
      return true;
    };
    const addNode = (type, x, y, purity) => {
      const i = y * W + x;
      terr[i] = type === 'crude_oil' ? TERR.SAND : (terr[i] === TERR.SAND ? TERR.SAND : TERR.GRASS);
      trees[i] = 0;
      // clear a little space around nodes so miners fit
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const j = (y + oy) * W + x + ox;
        trees[j] = 0;
        if (terr[j] === TERR.ROCK || terr[j] === TERR.WATER) terr[j] = TERR.GRASS;
      }
      nodeAt[i] = nodes.length;
      nodes.push({ x, y, type, purity });
    };
    const pickPurity = (d, bias) => {
      const r = rnd() + (d / 160) * 0.35 + (bias || 0);
      return r > 1.0 ? 'pure' : r > 0.4 ? 'normal' : 'impure';
    };
    const place = (type, count, dMin, dMax, purity) => {
      let placed = 0, tries = 0;
      while (placed < count && tries++ < 4000) {
        const a = rnd() * Math.PI * 2, d = dMin + rnd() * (dMax - dMin);
        const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
        if (!free(x, y, 3)) continue;
        addNode(type, x, y, purity || pickPurity(d));
        placed++;
      }
    };
    // Guaranteed starter nodes near the HUB
    place('iron_ore', 1, 6, 9, 'pure');
    place('iron_ore', 2, 7, 12, 'normal');
    place('copper_ore', 2, 8, 13, 'normal');
    place('limestone', 2, 9, 14, 'normal');
    place('coal', 2, 15, 24, 'normal');
    // Scatter
    place('iron_ore', 22, 14, 78);
    place('copper_ore', 18, 14, 78);
    place('limestone', 18, 14, 78);
    place('coal', 16, 20, 78);
    place('caterium_ore', 10, 30, 78);
    place('crude_oil', 9, 32, 78);
    place('geyser', 7, 28, 78);

    // Power slugs
    const slugs = [];
    let tries = 0;
    while (slugs.length < 48 && tries++ < 5000) {
      const a = rnd() * Math.PI * 2, d = 10 + rnd() * 70;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!free(x, y, 2) || trees[y * W + x]) continue;
      if (slugs.some(s => s.x === x && s.y === y)) continue;
      const kind = d > 50 && rnd() < 0.35 ? 2 : d > 25 && rnd() < 0.45 ? 1 : 0;
      slugs.push({ x, y, kind });
    }

    // Crash sites with hard drives
    const crashes = [];
    tries = 0;
    while (crashes.length < 16 && tries++ < 5000) {
      const a = rnd() * Math.PI * 2, d = 20 + rnd() * 58;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!free(x, y, 4)) continue;
      if (crashes.some(c => Math.abs(c.x - x) < 10 && Math.abs(c.y - y) < 10)) continue;
      const cost = d < 32 ? { iron_plate: 30, wire: 20 }
        : d < 45 ? { cable: 40, rip: 5 }
        : d < 60 ? { rotor: 10, modular_frame: 5 }
        : { steel_beam: 40, steel_pipe: 40 };
      crashes.push({ x, y, cost });
      trees[y * W + x] = 0;
      if (terr[y * W + x] === TERR.ROCK || terr[y * W + x] === TERR.WATER) terr[y * W + x] = TERR.GRASS;
    }

    // Raw quartz (added later): separate RNG so older saves keep the same slugs and crash sites
    const qrnd = mulberry32(seed * 104729 + 71);
    let qn = 0; tries = 0;
    while (qn < 12 && tries++ < 4000) {
      const a = qrnd() * Math.PI * 2, d = 26 + qrnd() * 52;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!free(x, y, 3)) continue;
      if (slugs.some(sl => Math.abs(sl.x - x) < 2 && Math.abs(sl.y - y) < 2)) continue;
      if (crashes.some(c => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 3)) continue;
      const r = qrnd() + d / 400;
      addNode('raw_quartz', x, y, r > 0.85 ? 'pure' : r > 0.35 ? 'normal' : 'impure');
      qn++;
    }

    return { W, H, terr, shade, trees, nodes, nodeAt, slugs, crashes, cx, cy };
  },
};
