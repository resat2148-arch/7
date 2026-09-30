// Core game state + factory simulation.
'use strict';

const TICK = 0.05;          // fixed simulation step (s)
const GAP = 0.5;            // min spacing of items on a belt (tiles)
const SAVE_KEY = 'planetfall_factory_v1';

const G = {
  // world
  W: 0, H: 0, terr: null, shade: null, trees: null, nodes: [], nodeAt: null,
  slugs: [], crashes: [], slugAt: null, crashAt: null, revealed: null,
  seed: 1,
  // entities
  ents: new Map(), occ: null, nextId: 1,
  // progression
  inv: {}, unlockedB: new Set(), unlockedR: new Set(), milestones: new Set(), phase: 0, alts: new Set(),
  shards: 0, hardDrives: 0, mamChoice: null, coupons: 0, points: 0, pointsTotal: 0, couponsPrinted: 0,
  slugsTaken: new Set(), crashesOpened: new Set(), treesCut: new Set(),
  tracked: null, tutorial: 0, ach: new Set(), won: false,
  // runtime
  time: 0, playTime: 0, power: { cap: 15, demand: 0, factor: 1, load: 0 },
  stats: { delivered: {}, win: {}, flow: {}, winT: 0, slugs: 0 },
  overdriveUntil: 0, cooldowns: {},
  dirty: { fog: true, chunks: new Set(), ui: true },
  events: [],   // queued UI events (toasts, float texts)
};

function ent(id) { return G.ents.get(id); }
function idx(x, y) { return y * G.W + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < G.W && y < G.H; }
function entAt(x, y) {
  if (!inBounds(x, y)) return null;
  const id = G.occ[idx(x, y)];
  return id ? G.ents.get(id) : null;
}
function def(e) { return BUILDINGS[e.type]; }
function clockPow(c) { return Math.pow(c, 1.321928); }
function maxClock(e) { return 1 + 0.5 * (e.shardsUsed || 0); }
function shardsFree() {
  let used = 0;
  for (const e of G.ents.values()) used += e.shardsUsed || 0;
  return G.shards - used;
}
function emit(type, data) { G.events.push(Object.assign({ type }, data)); }

// ---------- World init ----------
function initWorld(seed) {
  G.seed = seed;
  const w = World.generate(seed);
  Object.assign(G, { W: w.W, H: w.H, terr: w.terr, shade: w.shade, trees: w.trees, nodes: w.nodes, nodeAt: w.nodeAt, slugs: w.slugs, crashes: w.crashes });
  G.occ = new Int32Array(G.W * G.H);
  G.revealed = new Uint8Array(G.W * G.H);
  G.slugAt = new Int16Array(G.W * G.H).fill(-1);
  G.crashAt = new Int16Array(G.W * G.H).fill(-1);
  G.slugs.forEach((s, i) => { G.slugAt[idx(s.x, s.y)] = i; });
  G.crashes.forEach((c, i) => { G.crashAt[idx(c.x, c.y)] = i; });
  G.cx = w.cx; G.cy = w.cy;
}

function newGame() {
  initWorld((Math.random() * 1e9) | 0);
  G.inv = Object.assign({}, START_INV);
  START_BUILDINGS.forEach(b => G.unlockedB.add(b));
  START_RECIPES.forEach(r => G.unlockedR.add(r));
  const hub = createEnt('hub', G.cx - 2, G.cy - 2, 0);
  placeEnt(hub);
}

// ---------- Entities ----------
function createEnt(type, x, y, dir) {
  const d = BUILDINGS[type];
  const e = { id: G.nextId++, type, kind: d.kind, x, y, dir: dir || 0, size: d.size, status: '', active: false, anim: Math.random() * 10 };
  switch (d.kind) {
    case 'belt': e.items = []; break;
    case 'splitter': e.buf = null; e.rr = 0; break;
    case 'junction': e.slots = [null, null, null, null]; break;
    case 'uploader': e.tokens = 2; break;
    case 'miner': e.out = 0; e.prog = 0; e.clock = 1; e.shardsUsed = 0; e.rr = 0; break;
    case 'machine': e.recipe = null; e.inb = {}; e.outb = {}; e.prog = 0; e.crafting = false; e.clock = 1; e.shardsUsed = 0; e.rr = 0; break;
    case 'gen': e.fuel = {}; e.burn = 0; break;
  }
  if (d.kind === 'machine') {
    // default to first unlocked recipe for this machine
    const rs = recipesFor(type);
    if (rs.length) e.recipe = rs[0];
  }
  return e;
}

function footprint(type, x, y) {
  const s = BUILDINGS[type].size, out = [];
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) out.push([x + i, y + j]);
  return out;
}

function perimeter(e) {
  if (e._per) return e._per;
  const s = e.size, out = [];
  for (let i = 0; i < s; i++) {
    out.push([e.x + s, e.y + i, 0]);
    out.push([e.x + i, e.y + s, 1]);
    out.push([e.x - 1, e.y + i, 2]);
    out.push([e.x + i, e.y - 1, 3]);
  }
  e._per = out;
  return out;
}

function coveredNode(type, x, y) {
  const d = BUILDINGS[type];
  let best = null;
  for (const [tx, ty] of footprint(type, x, y)) {
    if (!inBounds(tx, ty)) continue;
    const ni = G.nodeAt[idx(tx, ty)];
    if (ni < 0) continue;
    const nd = G.nodes[ni];
    const want = d.oil ? nd.type === 'crude_oil' : d.geyser ? nd.type === 'geyser' : (nd.type !== 'crude_oil' && nd.type !== 'geyser');
    if (!want) continue;
    if (!best || PURITY[nd.purity].mult > PURITY[best.purity].mult) best = nd;
  }
  return best;
}

function placeEnt(e) {
  for (const [x, y] of footprint(e.type, e.x, e.y)) {
    const i = idx(x, y);
    G.occ[i] = e.id;
    if (G.trees[i]) { G.trees[i] = 0; G.treesCut.add(i); markChunk(x, y); addInv('leaves', 4); addInv('wood', 1); }
    if (G.slugAt[i] >= 0 && !G.slugsTaken.has(G.slugAt[i])) collectSlug(G.slugAt[i]);
  }
  if (e.kind === 'miner' || e.type === 'geothermal') e.node = coveredNode(e.type, e.x, e.y);
  G.ents.set(e.id, e);
  const d = def(e);
  reveal(e.x + e.size / 2, e.y + e.size / 2, d.reveal || 4);
  // neighbours' perimeter caches don't depend on others; nothing to invalidate
}

function removeEnt(e) {
  for (const [x, y] of footprint(e.type, e.x, e.y)) G.occ[idx(x, y)] = 0;
  G.ents.delete(e.id);
}

const LOGI = { belt: 1, splitter: 1, junction: 1 };

// Validation. Returns null if ok, or an error string key.
function checkPlace(type, x, y, opts) {
  const d = BUILDINGS[type];
  opts = opts || {};
  if (d.unique) for (const e of G.ents.values()) if (e.type === type) return 'unique';
  let nodeHit = false;
  for (const [tx, ty] of footprint(type, x, y)) {
    if (!inBounds(tx, ty)) return 'cantPlace';
    const i = idx(tx, ty);
    if (!G.revealed[i]) return 'fog';
    const t = G.terr[i];
    if (t === TERR.WATER || t === TERR.ROCK) return 'cantPlace';
    if (G.crashAt[i] >= 0 && !G.crashesOpened.has(G.crashAt[i])) return 'cantPlace';
    const o = G.occ[i];
    if (o) {
      const other = G.ents.get(o);
      if (!(opts.replaceLogi && LOGI[d.kind] && LOGI[other.kind])) return 'cantPlace';
    }
    if (G.nodeAt[i] >= 0) nodeHit = true;
  }
  if (d.kind === 'miner' || d.geyser) {
    if (!coveredNode(type, x, y)) return d.oil ? 'needOil' : d.geyser ? 'needGeyser' : 'needNode';
  } else if (nodeHit && !LOGI[d.kind]) return 'cantPlace';
  return null;
}

function canAfford(cost, mult) {
  mult = mult || 1;
  for (const k in cost) if ((G.inv[k] || 0) < cost[k] * mult) return false;
  return true;
}
function pay(cost, mult) { mult = mult || 1; for (const k in cost) G.inv[k] = (G.inv[k] || 0) - cost[k] * mult; }
function refund(cost) { for (const k in cost) G.inv[k] = (G.inv[k] || 0) + cost[k]; }
function addInv(k, n) { G.inv[k] = (G.inv[k] || 0) + n; }

// Build one building. Returns entity or null (error emitted).
function build(type, x, y, dir, quiet) {
  const d = BUILDINGS[type];
  const existing = entAt(x, y);
  // Belt over belt: re-orient / upgrade in place
  if (d.kind === 'belt' && existing && existing.kind === 'belt') {
    if (existing.type !== type) {
      if (!canAfford(d.cost)) { if (!quiet) emit('error', { key: 'notEnough' }); return null; }
      refund(def(existing).cost); pay(d.cost);
      existing.type = type;
    }
    existing.dir = dir;
    return existing;
  }
  const replace = LOGI[d.kind] && existing && LOGI[existing.kind] && d.size === 1;
  const err = checkPlace(type, x, y, { replaceLogi: replace });
  if (err) { if (!quiet) emit('error', { key: err }); return null; }
  if (!canAfford(d.cost)) { if (!quiet) emit('error', { key: 'notEnough' }); return null; }
  if (replace) deconstruct(existing, true);
  pay(d.cost);
  const e = createEnt(type, x, y, dir);
  placeEnt(e);
  G.dirty.ui = true;
  if (d.kind === 'belt') { if (!G.ach.has('first_belt')) unlockAch('first_belt'); }
  return e;
}

function deconstruct(e, quiet) {
  if (!e || e.kind === 'hub') return false;
  refund(def(e).cost);
  // return contents
  if (e.items) e.items.forEach(it => addInv(it.i, 1));
  if (e.buf) addInv(e.buf, 1);
  if (e.slots) e.slots.forEach(s => s && addInv(s, 1));
  if (e.inb) for (const k in e.inb) addInv(k, e.inb[k]);
  if (e.outb) for (const k in e.outb) addInv(k, e.outb[k]);
  if (e.fuel) for (const k in e.fuel) addInv(k, e.fuel[k]);
  if (e.kind === 'miner' && e.node && e.out) addInv(e.node.type, e.out);
  removeEnt(e);
  G.dirty.ui = true;
  if (!quiet) Sound.sfx.remove();
  return true;
}

// ---------- HUB upgrades ----------
function hubLevel() { return G.milestones.size; }
function hubStage() { let k = 0; HUB_STAGES.forEach((st, i) => { if (hubLevel() >= st.at) k = i; }); return k; }
function hubPower() { return BUILDINGS.hub.gen + HUB_MW_PER_LEVEL * hubLevel(); }

// ---------- Belt routing ----------
// Finds a belt route from tile a to tile b that avoids buildings, rocks, water and fog,
// preferring few turns. Clicking a building as start/end uses its whole footprint.
function routeBelt(a, b, rot) {
  if (a.x === b.x && a.y === b.y) {
    const ex = entAt(a.x, a.y);
    return [{ x: a.x, y: a.y, dir: ex && ex.kind === 'belt' ? ex.dir : rot }];
  }
  const tilesOf = (t) => {
    const e = entAt(t.x, t.y);
    return e && e.kind !== 'belt' ? footprint(e.type, e.x, e.y) : [[t.x, t.y]];
  };
  const starts = tilesOf(a), goals = tilesOf(b);
  const startEnt = entAt(a.x, a.y);
  const pad = 14;
  const x0 = Math.max(0, Math.min(a.x, b.x) - pad), y0 = Math.max(0, Math.min(a.y, b.y) - pad);
  const x1 = Math.min(G.W - 1, Math.max(a.x, b.x) + pad), y1 = Math.min(G.H - 1, Math.max(a.y, b.y) + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const N = bw * bh * 4;
  const dist = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const isGoal = new Uint8Array(bw * bh);
  for (const [gx, gy] of goals) if (gx >= x0 && gx <= x1 && gy >= y0 && gy <= y1) isGoal[(gy - y0) * bw + gx - x0] = 1;
  // binary heap of [cost, state]
  const hc = [], hs = [];
  const push = (c, st) => {
    let i = hc.length; hc.push(c); hs.push(st);
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; [hc[p], hc[i]] = [hc[i], hc[p]]; [hs[p], hs[i]] = [hs[i], hs[p]]; i = p; }
  };
  const pop = () => {
    const c = hc[0], st = hs[0];
    const lc = hc.pop(), ls = hs.pop();
    if (hc.length) {
      hc[0] = lc; hs[0] = ls;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < hc.length && hc[l] < hc[m]) m = l;
        if (r < hc.length && hc[r] < hc[m]) m = r;
        if (m === i) break;
        [hc[m], hc[i]] = [hc[i], hc[m]]; [hs[m], hs[i]] = [hs[i], hs[m]]; i = m;
      }
    }
    return [c, st];
  };
  const passable = (x, y, d) => {
    const i = idx(x, y);
    if (!G.revealed[i]) return false;
    const t = G.terr[i];
    if (t === TERR.WATER || t === TERR.ROCK) return false;
    if (G.crashAt[i] >= 0 && !G.crashesOpened.has(G.crashAt[i])) return false;
    const o = G.occ[i];
    if (!o) return true;
    const e = G.ents.get(o);
    return e.kind === 'belt' && e.dir === d; // may run along (and upgrade) a belt going the same way
  };
  for (const [sx, sy] of starts) {
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
    for (let d = 0; d < 4; d++) { const st = ((sy - y0) * bw + sx - x0) * 4 + d; dist[st] = 0; push(0, st); }
  }
  let found = -1;
  while (hc.length) {
    const [c, st] = pop();
    if (c > dist[st]) continue;
    const cell = st >> 2, d = st & 3;
    const cx = x0 + cell % bw, cy = y0 + ((cell / bw) | 0);
    if (isGoal[cell] && c > 0) { found = st; break; }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4 && c > 0) continue;
      const nx = cx + DX[nd], ny = cy + DY[nd];
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const ncell = (ny - y0) * bw + nx - x0;
      const ent2 = entAt(nx, ny);
      const inStart = startEnt && startEnt.kind !== 'belt' && ent2 === startEnt;
      if (inStart) continue;
      if (!isGoal[ncell] && !passable(nx, ny, nd)) continue;
      const nc = c + 10 + (nd !== d && c > 0 ? 4 : 0);
      const ns = ncell * 4 + nd;
      if (nc < dist[ns]) { dist[ns] = nc; prev[ns] = st; push(nc, ns); }
    }
  }
  if (found < 0) {
    // no route: straight L-shaped preview (shown red where blocked)
    const out = [];
    let x = a.x, y = a.y;
    while (x !== b.x || y !== b.y) {
      const d = x !== b.x ? (b.x > x ? 0 : 2) : (b.y > y ? 1 : 3);
      out.push({ x, y, dir: d });
      x += DX[d]; y += DY[d];
    }
    out.push({ x, y, dir: out[out.length - 1].dir });
    return out;
  }
  const cells = [];
  for (let st = found; st >= 0; st = prev[st]) cells.push(st);
  cells.reverse();
  const out = cells.map(st => {
    const cell = st >> 2;
    return { x: x0 + cell % bw, y: y0 + ((cell / bw) | 0), dir: st & 3 };
  });
  // each tile points to the next one; the last keeps the direction it was entered with
  for (let k = 0; k < out.length - 1; k++) out[k].dir = out[k + 1].dir;
  return out;
}

// ---------- Fog of war ----------
function reveal(cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(G.W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(G.H - 1, Math.ceil(cy + r));
  let changed = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r * r) {
      const i = idx(x, y);
      if (!G.revealed[i]) { G.revealed[i] = 1; changed = true; }
    }
  }
  if (changed) G.dirty.fog = true;
}

function markChunk(x, y) { G.dirty.chunks.add(((y >> 5) * 64) + (x >> 5)); }

// ---------- Recipes ----------
function recipesFor(type) {
  const out = [];
  for (const id in RECIPES) {
    const r = RECIPES[id];
    if (r.m !== type) continue;
    if (r.alt ? G.alts.has(id) : G.unlockedR.has(id)) out.push(id);
  }
  return out;
}
function handRecipes() {
  const out = [];
  for (const id in RECIPES) {
    const r = RECIPES[id];
    if (!r.hand && !r.alt) continue;
    if (r.alt ? (G.alts.has(id) && r.m !== 'foundry' && r.m !== 'manufacturer') : G.unlockedR.has(id)) out.push(id);
  }
  return out;
}
function inCap(r, k) { return r.in[k] * 2 + 2; }
function outCap(r, k) { return Math.max(r.out[k] * 3, 10); }

// ---------- Item transfer ----------
function deliver(item, n) {
  n = n || 1;
  addInv(item, n);
  G.stats.delivered[item] = (G.stats.delivered[item] || 0) + n;
  G.stats.win[item] = (G.stats.win[item] || 0) + n;
}

function sinkItem(item) {
  const v = ITEMS[item].value;
  G.points += v;
  G.pointsTotal += v;
  G.stats.sinkWin = (G.stats.sinkWin || 0) + v;
  let cost = couponCost();
  while (G.points >= cost) {
    G.points -= cost;
    G.coupons++;
    G.couponsPrinted++;
    emit('coupon', {});
    cost = couponCost();
  }
}
function couponCost() { return Math.round(1000 * (1 + G.couponsPrinted * 0.35)); }

// A belt bends when nothing feeds it from behind and exactly one belt feeds it from a side.
// Returns that world side, or -1 for a straight belt.
function beltCurve(e) {
  const back = (e.dir + 2) % 4;
  const b = entAt(e.x + DX[back], e.y + DY[back]);
  if (b && (b.kind !== 'belt' || b.dir === e.dir)) return -1;
  let side = -1;
  for (const s of [(e.dir + 1) % 4, (e.dir + 3) % 4]) {
    const nb = entAt(e.x + DX[s], e.y + DY[s]);
    if (nb && nb.kind === 'belt' && nb.dir === (s + 2) % 4) {
      if (side >= 0) return -1;
      side = s;
    }
  }
  return side;
}

// Attempt to insert an item into entity e travelling in direction d.
function accept(e, item, d) {
  switch (e.kind) {
    case 'belt': {
      if (d === (e.dir + 2) % 4) return false;
      const items = e.items;
      // straight entry, or the feeding side of a curve, starts at the belt's beginning
      const p = d === e.dir || beltCurve(e) === (d + 2) % 4 ? 0 : 0.5;
      // find insertion index (items sorted by p descending)
      let k = items.length;
      while (k > 0 && items[k - 1].p < p) k--;
      if (k > 0 && items[k - 1].p - p < GAP) return false;
      if (k < items.length && p - items[k].p < GAP) return false;
      items.splice(k, 0, { i: item, p });
      return true;
    }
    case 'splitter':
      if (d !== e.dir || e.buf) return false;
      e.buf = item; return true;
    case 'junction':
      if (e.slots[d]) return false;
      e.slots[d] = item; return true;
    case 'uploader':
      if (e.tokens < 1) return false;
      e.tokens -= 1; deliver(item); e.flash = 1; return true;
    case 'hub':
    case 'elevator':
      deliver(item); e.flash = 1; return true;
    case 'sink':
      sinkItem(item); e.flash = 1; return true;
    case 'machine': {
      const r = RECIPES[e.recipe];
      if (!r || !r.in[item]) return false;
      if ((e.inb[item] || 0) >= inCap(r, item)) return false;
      e.inb[item] = (e.inb[item] || 0) + 1;
      return true;
    }
    case 'gen': {
      const df = def(e);
      if (!df.fuels || !df.fuels[item]) return false;
      let tot = 0; for (const k in e.fuel) tot += e.fuel[k];
      if (tot >= df.fuelCap) return false;
      e.fuel[item] = (e.fuel[item] || 0) + 1;
      return true;
    }
  }
  return false;
}

const OUT_TARGET = { belt: 1, splitter: 1, junction: 1, uploader: 1, hub: 1, sink: 1, elevator: 1 };

// Producer pushes one item out through its perimeter. getItem() returns item id or null.
function pushOut(e, takeItem) {
  const per = perimeter(e);
  const n = per.length;
  let pushed = 0;
  for (let k = 0; k < n; k++) {
    const [x, y, d] = per[(e.rr + k) % n];
    const t = entAt(x, y);
    if (!t || !OUT_TARGET[t.kind]) continue;
    if ((t.kind === 'belt' || t.kind === 'splitter') && t.dir !== d) continue;
    const item = takeItem(false);
    if (!item) break;
    if (accept(t, item, d)) {
      takeItem(true);
      pushed++;
      e.rr = (e.rr + k + 1) % n;
      if (pushed >= 2) break;
    }
  }
  return pushed;
}

// ---------- Simulation tick ----------
function simTick(dt) {
  G.time += dt;
  const ents = G.ents;

  // --- Power ---
  let cap = 0, demand = 0;
  for (const e of ents.values()) {
    const d = BUILDINGS[e.type];
    if (e.kind === 'hub') cap += hubPower();
    else if (e.kind === 'gen') {
      if (d.geyser) { e.hasFuel = !!e.node; }
      else {
        if (e.burn <= 0) takeFuel(e);
        e.hasFuel = e.burn > 0;
      }
      if (e.hasFuel) cap += d.gen;
    } else if (d.power) {
      if (e.kind === 'radar' || e.kind === 'sink') { e.active = true; demand += d.power; }
      else if (e.active) demand += d.power * clockPow(e.clock || 1);
    }
  }
  const factor = demand <= cap ? 1 : (cap > 0 ? cap / demand : 0);
  const load = cap > 0 ? Math.min(1, demand / cap) : 0;
  G.power.cap = cap; G.power.demand = demand; G.power.factor = factor; G.power.load = load;

  // --- Producers ---
  for (const e of ents.values()) {
    switch (e.kind) {
      case 'gen': tickGen(e, dt, load); break;
      case 'miner': tickMiner(e, dt, factor); break;
      case 'machine': tickMachine(e, dt, factor); break;
      case 'uploader': e.tokens = Math.min(2, e.tokens + def(e).rate / 60 * dt); break;
    }
    if (e.flash) e.flash = Math.max(0, e.flash - dt * 3);
  }

  // --- Logistics ---
  for (const e of ents.values()) {
    if (e.kind === 'belt') tickBelt(e, dt);
    else if (e.kind === 'splitter') tickSplitter(e);
    else if (e.kind === 'junction') tickJunction(e);
  }

  // --- Flow statistics (10s windows) ---
  G.stats.winT += dt;
  if (G.stats.winT >= 10) {
    const f = G.stats.flow;
    const keys = new Set(Object.keys(f).concat(Object.keys(G.stats.win)));
    for (const k of keys) {
      const rate = (G.stats.win[k] || 0) * 6;
      f[k] = f[k] == null ? rate : f[k] * 0.6 + rate * 0.4;
      if (f[k] < 0.05) delete f[k];
    }
    G.stats.sinkRate = (G.stats.sinkRate || 0) * 0.6 + (G.stats.sinkWin || 0) * 6 * 0.4;
    G.stats.win = {}; G.stats.sinkWin = 0;
    G.stats.winT = 0;
  }
}

function takeFuel(e) {
  const d = def(e);
  for (const k in d.fuels) {
    if (e.fuel[k] > 0) { e.fuel[k]--; e.burn += d.fuels[k]; e.burnItem = k; return true; }
  }
  return false;
}

function tickGen(e, dt, load) {
  const d = def(e);
  e.anim += dt * (e.hasFuel ? 1 : 0);
  if (d.geyser) { e.status = e.node ? 'working' : 'nonode'; e.active = !!e.node; return; }
  if (e.burn > 0) {
    e.burn -= dt * load;
    e.status = 'working'; e.active = true;
  } else {
    e.status = 'nofuel'; e.active = false;
  }
}

function tickMiner(e, dt, factor) {
  if (!e.node) { e.status = 'nonode'; e.active = false; return; }
  const d = def(e);
  const cap = 10;
  if (e.out < cap) {
    const rate = d.rate * PURITY[e.node.purity].mult / 60 * e.clock;
    e.prog += rate * dt * factor;
    while (e.prog >= 1 && e.out < cap) { e.out++; e.prog -= 1; }
    e.active = true;
    e.status = factor < 1 ? 'nopower' : 'working';
    e.anim += dt * e.clock * factor;
  } else {
    e.active = false;
    e.status = 'blocked';
  }
  if (e.out > 0) {
    const item = e.node.type;
    pushOut(e, (take) => {
      if (e.out <= 0) return null;
      if (take) e.out--;
      return item;
    });
  }
}

function tickMachine(e, dt, factor) {
  const r = RECIPES[e.recipe];
  if (!r) { e.status = 'norecipe'; e.active = false; return; }
  let guard = 0;
  let budget = dt * e.clock * factor;
  while (guard++ < 4) {
    if (!e.crafting) {
      let ok = true;
      for (const k in r.in) if ((e.inb[k] || 0) < r.in[k]) { ok = false; e.status = 'idle'; break; }
      if (ok) for (const k in r.out) if ((e.outb[k] || 0) + r.out[k] > outCap(r, k)) { ok = false; e.status = 'blocked'; break; }
      if (!ok) { e.active = false; break; }
      for (const k in r.in) e.inb[k] -= r.in[k];
      e.crafting = true;
    }
    e.active = true;
    e.status = factor < 1 ? 'nopower' : 'working';
    const need = r.t - e.prog;
    if (budget >= need) {
      budget -= need;
      e.prog = 0;
      e.crafting = false;
      for (const k in r.out) e.outb[k] = (e.outb[k] || 0) + r.out[k];
      e.made = (e.made || 0) + 1;
    } else {
      e.prog += budget;
      break;
    }
  }
  if (e.active) e.anim += dt * e.clock * factor;
  // push outputs
  const keys = Object.keys(e.outb);
  if (keys.length) {
    let ki = 0;
    pushOut(e, (take) => {
      for (let j = 0; j < keys.length; j++) {
        const k = keys[(ki + j) % keys.length];
        if (e.outb[k] > 0) {
          if (take) { e.outb[k]--; ki = (ki + j + 1) % keys.length; }
          return k;
        }
      }
      return null;
    });
  }
}

function tickBelt(e, dt) {
  const items = e.items;
  if (!items.length) return;
  const sp = BUILDINGS[e.type].speed * dt;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const limit = k === 0 ? 1 : items[k - 1].p - GAP;
    const np = it.p + sp;
    it.p = np > limit ? Math.max(it.p, limit) : np;
  }
  const front = items[0];
  if (front.p >= 1) {
    const t = entAt(e.x + DX[e.dir], e.y + DY[e.dir]);
    if (t && accept(t, front.i, e.dir)) items.shift();
    else front.p = 1;
  }
}

function tickSplitter(e) {
  if (!e.buf) return;
  const dirs = [e.dir, (e.dir + 3) % 4, (e.dir + 1) % 4];
  for (let k = 0; k < 3; k++) {
    const d = dirs[(e.rr + k) % 3];
    const t = entAt(e.x + DX[d], e.y + DY[d]);
    if (!t) continue;
    if (t.kind === 'belt' && t.dir === (d + 2) % 4) continue;
    if (accept(t, e.buf, d)) { e.buf = null; e.rr = (e.rr + k + 1) % 3; return; }
  }
}

function tickJunction(e) {
  for (let d = 0; d < 4; d++) {
    const it = e.slots[d];
    if (!it) continue;
    const t = entAt(e.x + DX[d], e.y + DY[d]);
    if (t && accept(t, it, d)) e.slots[d] = null;
  }
}

// ---------- Player actions ----------
function handMine(x, y) {
  const ni = G.nodeAt[idx(x, y)];
  if (ni < 0) return false;
  const nd = G.nodes[ni];
  if (nd.type === 'crude_oil' || nd.type === 'geyser') return false;
  const amt = nd.purity === 'pure' ? 2 : 1;
  addInv(nd.type, amt);
  emit('float', { x: x + 0.5, y: y + 0.2, text: '+' + amt, item: nd.type });
  Sound.sfx.mine();
  return true;
}

function harvestTree(x, y) {
  const i = idx(x, y);
  if (!G.trees[i]) return false;
  G.trees[i] = 0;
  G.treesCut.add(i);
  markChunk(x, y);
  addInv('leaves', 8); addInv('wood', 2);
  emit('float', { x: x + 0.5, y: y + 0.2, text: '+8', item: 'leaves' });
  Sound.sfx.chop();
  return true;
}

function collectSlug(i) {
  if (G.slugsTaken.has(i)) return false;
  G.slugsTaken.add(i);
  const s = G.slugs[i];
  const v = [1, 2, 5][s.kind];
  G.shards += v;
  G.stats.slugs = (G.stats.slugs || 0) + 1;
  emit('float', { x: s.x + 0.5, y: s.y, text: T('gotShards', v), color: '#7fd4ff' });
  emit('toast', { text: '💎 ' + T('gotShards', v) });
  Sound.sfx.collect();
  G.dirty.ui = true;
  return true;
}

function openCrash(i) {
  if (G.crashesOpened.has(i)) return false;
  const c = G.crashes[i];
  if (!canAfford(c.cost)) { emit('error', { key: 'notEnough' }); return false; }
  pay(c.cost);
  G.crashesOpened.add(i);
  G.hardDrives++;
  emit('float', { x: c.x + 0.5, y: c.y, text: T('gotHardDrive'), color: '#ffd166' });
  emit('toast', { text: '💾 ' + T('gotHardDrive') });
  Sound.sfx.collect();
  G.dirty.ui = true;
  return true;
}

function handCraft(id) {
  const r = RECIPES[id];
  if (!canAfford(r.in)) return false;
  pay(r.in);
  for (const k in r.out) addInv(k, r.out[k]);
  Sound.sfx.craft();
  return true;
}
function handCraftTime(id) { return Math.min(2.5, Math.max(0.35, RECIPES[id].t / 5)); }

// ---------- Progression ----------
function tier0Done() { return MILESTONES.filter(m => m.tier === 0).every(m => G.milestones.has(m.id)); }
function milestoneState(m) {
  if (G.milestones.has(m.id)) return 'done';
  if (m.tier === 0) {
    const prev = MILESTONES.filter(o => o.tier === 0);
    const i = prev.indexOf(m);
    if (i > 0 && !G.milestones.has(prev[i - 1].id)) return 'locked';
    return 'open';
  }
  if (!tier0Done()) return 'locked';
  if (G.phase < TIER_PHASE[m.tier]) return 'locked';
  return 'open';
}

function completeMilestone(id) {
  const m = MILESTONES.find(o => o.id === id);
  if (!m || milestoneState(m) !== 'open') return false;
  if (!canAfford(m.cost)) { emit('error', { key: 'notEnough' }); return false; }
  pay(m.cost);
  G.milestones.add(id);
  m.b.forEach(b => G.unlockedB.add(b));
  m.r.forEach(r => G.unlockedR.add(r));
  if (m.shards) G.shards += m.shards;
  if (G.tracked === id) G.tracked = null;
  emit('milestone', { name: L(m.name), m });
  G.dirty.ui = true;
  if (!G.ach.has('first_milestone')) unlockAch('first_milestone');
  if (G.milestones.size >= 10) unlockAch('milestones_10');
  return true;
}

function submitPhase() {
  const p = PHASES[G.phase];
  if (!p) return false;
  if (!elevatorBuilt()) return false;
  if (!canAfford(p.cost)) { emit('error', { key: 'notEnough' }); return false; }
  pay(p.cost);
  G.phase++;
  emit('phase', { n: G.phase, final: !!p.final });
  if (G.phase >= 1) unlockAch('phase_1');
  if (G.phase >= 3) unlockAch('phase_3');
  if (p.final) { G.won = true; unlockAch('win'); }
  G.dirty.ui = true;
  return true;
}
function elevatorBuilt() { for (const e of G.ents.values()) if (e.type === 'space_elevator') return true; return false; }

// Suggested goal: tracked milestone, else first open milestone, else elevator phase
function currentGoal() {
  if (G.tracked) {
    const m = MILESTONES.find(o => o.id === G.tracked);
    if (m && milestoneState(m) === 'open') return { type: 'milestone', m, cost: m.cost, name: L(m.name) };
  }
  const open = MILESTONES.filter(m => milestoneState(m) === 'open');
  if (open.length) {
    // prefer the one closest to completion
    let best = open[0], bestScore = -1;
    for (const m of open) {
      let s = 0, c = 0;
      for (const k in m.cost) { s += Math.min(1, (G.inv[k] || 0) / m.cost[k]); c++; }
      s /= c;
      if (m.tier === 0) s += 10;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return { type: 'milestone', m: best, cost: best.cost, name: L(best.name) };
  }
  const p = PHASES[G.phase];
  if (p) return { type: 'phase', cost: p.cost, name: T('elevator') + ' – ' + T('phase') + ' ' + (G.phase + 1) };
  return null;
}

// ---------- MAM / alternate recipes ----------
function altOptions() {
  if (G.mamChoice) return G.mamChoice;
  const pool = Object.keys(RECIPES).filter(id => RECIPES[id].alt && !G.alts.has(id));
  const out = [];
  while (out.length < 2 && pool.length) out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  G.mamChoice = out;
  return out;
}
function chooseAlt(id) {
  if (G.hardDrives <= 0) return false;
  const opts = altOptions();
  if (opts.length && !opts.includes(id)) return false;
  G.hardDrives--;
  if (id) G.alts.add(id); else G.shards += 3;
  G.mamChoice = null;
  unlockAch('hard_drive');
  G.dirty.ui = true;
  return true;
}

// ---------- Achievements ----------
function unlockAch(id) {
  if (G.ach.has(id)) return;
  G.ach.add(id);
  const a = ACHIEVEMENTS.find(o => o.id === id);
  if (a) emit('ach', { name: L(a.name) });
}
function checkAchievements() {
  let belts = 0, prod = 0;
  for (const e of G.ents.values()) {
    if (e.kind === 'belt') belts++;
    else if (e.kind === 'machine' || e.kind === 'miner') prod++;
    if (e.clock > 1) unlockAch('overclock');
  }
  if (belts >= 200) unlockAch('belts_200');
  if (prod >= 50) unlockAch('machines_50');
  if ((G.stats.delivered.iron_plate || 0) >= 1000) unlockAch('plates_1000');
  if ((G.stats.slugs || 0) >= 10) unlockAch('slugs_10');
  if (G.power.cap >= 500) unlockAch('power_500');
  if (G.pointsTotal >= 100000) unlockAch('sink_100k');
  const dl = G.stats.delivered;
  if ((dl.television || 0) >= 1) unlockAch('first_tv');
  if ((dl.smartphone || 0) >= 1) unlockAch('first_phone');
  if (['television', 'smartphone', 'laptop', 'game_console'].reduce((t, k) => t + (dl[k] || 0), 0) >= 100) unlockAch('gadgets_100');
}

// ---------- Tutorial ----------
function tutorialCheck() {
  if (G.tutorial >= TUTORIAL.length) return;
  const step = TUTORIAL[G.tutorial].id;
  let done = false;
  const all = [...G.ents.values()];
  switch (step) {
    case 'miner': done = all.some(e => e.kind === 'miner' && e.node && e.node.type === 'iron_ore'); break;
    case 'smelter': done = all.some(e => e.type === 'smelter'); break;
    case 'belt': done = all.some(e => e.type === 'smelter' && ((e.inb.iron_ore || 0) > 0 || e.made > 0 || e.crafting)); break;
    case 'constructor': done = all.some(e => e.type === 'constructor' && ((e.inb.iron_ingot || 0) > 0 || e.made > 0 || e.crafting)); break;
    case 'hub': done = (G.stats.delivered.iron_plate || 0) > 0 || (G.stats.delivered.iron_rod || 0) > 0; break;
    case 'milestone': done = G.milestones.has('m0_1'); break;
    case 'rods': done = (G.stats.delivered.iron_rod || 0) > 0 || G.milestones.has('m0_2'); break;
    case 'hub2': done = G.milestones.has('m0_2'); break;
    case 'power': done = all.some(e => e.kind === 'gen' && (e.burn > 0 || Object.values(e.fuel || {}).some(v => v > 0))); break;
  }
  if (done) {
    G.tutorial++;
    G.dirty.ui = true;
    Sound.sfx.collect();
    if (G.tutorial >= TUTORIAL.length) emit('toast', { text: '🎉 ' + T('tutorialDone') });
  }
}

// ---------- Save / Load ----------
function rle(arr) {
  const out = [];
  let cur = arr[0], run = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === cur) run++;
    else { out.push(cur, run); cur = arr[i]; run = 1; }
  }
  out.push(cur, run);
  return out;
}
function unrle(data, target) {
  let p = 0;
  for (let i = 0; i < data.length; i += 2) { target.fill(data[i], p, p + data[i + 1]); p += data[i + 1]; }
}

function serialize() {
  const ents = [];
  for (const e of G.ents.values()) {
    const o = { t: e.type, x: e.x, y: e.y, d: e.dir };
    if (e.items && e.items.length) o.it = e.items.map(i => [i.i, Math.round(i.p * 100) / 100]);
    if (e.recipe) o.r = e.recipe;
    if (e.clock && e.clock !== 1) o.c = e.clock;
    if (e.shardsUsed) o.s = e.shardsUsed;
    if (e.inb && Object.keys(e.inb).length) o.ib = e.inb;
    if (e.outb && Object.keys(e.outb).length) o.ob = e.outb;
    if (e.prog) o.p = Math.round(e.prog * 100) / 100;
    if (e.crafting) o.cr = 1;
    if (e.out) o.o = e.out;
    if (e.fuel && Object.keys(e.fuel).length) o.f = e.fuel;
    if (e.burn > 0) o.b = Math.round(e.burn * 10) / 10;
    if (e.buf) o.bf = e.buf;
    if (e.slots && e.slots.some(Boolean)) o.sl = e.slots;
    if (e.made) o.m = e.made;
    ents.push(o);
  }
  return JSON.stringify({
    v: 1, t: Date.now(), seed: G.seed, pt: Math.round(G.playTime),
    inv: G.inv, ub: [...G.unlockedB], ur: [...G.unlockedR], ms: [...G.milestones], ph: G.phase, alts: [...G.alts],
    sh: G.shards, hd: G.hardDrives, mc: G.mamChoice, cp: G.coupons, pts: G.points, ptt: G.pointsTotal, cpp: G.couponsPrinted,
    sl: [...G.slugsTaken], cr: [...G.crashesOpened], tc: [...G.treesCut],
    tr: G.tracked, tu: G.tutorial, ach: [...G.ach], won: G.won,
    st: { d: G.stats.delivered, f: G.stats.flow, s: G.stats.slugs, sr: G.stats.sinkRate || 0 },
    rev: rle(G.revealed), ents, cd: G.cooldowns,
    lang: I18N.lang, mute: Sound.muted,
  });
}

function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.v !== 1) throw new Error('bad save');
  initWorld(s.seed);
  G.inv = s.inv || {};
  G.unlockedB = new Set(s.ub); G.unlockedR = new Set(s.ur); G.milestones = new Set(s.ms);
  G.phase = s.ph || 0; G.alts = new Set(s.alts || []);
  G.shards = s.sh || 0; G.hardDrives = s.hd || 0; G.mamChoice = s.mc || null;
  G.coupons = s.cp || 0; G.points = s.pts || 0; G.pointsTotal = s.ptt || 0; G.couponsPrinted = s.cpp || 0;
  G.slugsTaken = new Set(s.sl || []); G.crashesOpened = new Set(s.cr || []);
  G.treesCut = new Set(s.tc || []);
  G.treesCut.forEach(i => { G.trees[i] = 0; });
  G.tracked = s.tr || null; G.tutorial = s.tu || 0; G.ach = new Set(s.ach || []); G.won = !!s.won;
  G.playTime = s.pt || 0;
  G.cooldowns = s.cd || {};
  if (s.st) { G.stats.delivered = s.st.d || {}; G.stats.flow = s.st.f || {}; G.stats.slugs = s.st.s || 0; G.stats.sinkRate = s.st.sr || 0; }
  // forget items that were removed from the game
  const known = (o) => { if (o) for (const k in o) if (!ITEMS[k]) delete o[k]; return o; };
  known(G.inv); known(G.stats.delivered); known(G.stats.flow);
  unrle(s.rev, G.revealed);
  for (const o of s.ents) {
    if (!BUILDINGS[o.t]) continue;
    const e = createEnt(o.t, o.x, o.y, o.d);
    if (o.it) e.items = o.it.filter(a => ITEMS[a[0]]).map(a => ({ i: a[0], p: a[1] }));
    if (o.r !== undefined) e.recipe = RECIPES[o.r] ? o.r : null;
    if (o.c) e.clock = o.c;
    if (o.s) e.shardsUsed = o.s;
    if (o.ib) e.inb = known(o.ib);
    if (o.ob) e.outb = known(o.ob);
    if (o.p) e.prog = o.p;
    if (o.cr) e.crafting = true;
    if (o.o) e.out = o.o;
    if (o.f) e.fuel = known(o.f);
    if (o.b) e.burn = o.b;
    if (o.bf && ITEMS[o.bf]) e.buf = o.bf;
    if (o.sl) e.slots = o.sl.map(v => (v && ITEMS[v] ? v : null));
    if (o.m) e.made = o.m;
    placeEnt(e);
  }
  if (s.lang) I18N.lang = s.lang;
  if (s.mute) Sound.setMuted(true);
  G.dirty.fog = true;
  return s;
}

function saveGame() {
  try { SDK.save(SAVE_KEY, serialize()); return true; } catch (e) { console.warn('save failed', e); return false; }
}
