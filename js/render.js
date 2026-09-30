// Canvas renderer: terrain chunks, resources, buildings, belts, items, fog, effects.
'use strict';

const TILE = 32;
const CHUNK = 32;          // tiles per terrain chunk
const CPX = 16;            // pixels per tile inside terrain chunk canvases

const BELT_COLORS = { 1: '#ffb347', 2: '#6fc3ff', 3: '#c08cff', 4: '#6dffa0' };
const STATUS_COLORS = { working: '#5ad17a', idle: '#ffcc4d', blocked: '#ff8a3c', norecipe: '#8a94a3', nopower: '#ff5a5a', nofuel: '#ff5a5a', nonode: '#ff5a5a' };

const R = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  cam: { x: 0, y: 0, z: 1 },
  chunks: new Map(),
  fogCanvas: null,
  particles: [],
  floats: [],
  sprites: {},

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.buildSprites();
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
  },

  screenToWorld(sx, sy) {
    const c = this.cam;
    return { x: (sx - this.w / 2) / c.z + c.x, y: (sy - this.h / 2) / c.z + c.y };
  },
  screenToTile(sx, sy) {
    const p = this.screenToWorld(sx, sy);
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  },
  worldToScreen(wx, wy) {
    const c = this.cam;
    return { x: (wx - c.x) * c.z + this.w / 2, y: (wy - c.y) * c.z + this.h / 2 };
  },

  // ---------- Sprites ----------
  buildSprites() {
    const mk = (size, fn) => { const c = document.createElement('canvas'); c.width = c.height = size; fn(c.getContext('2d'), size); return c; };
    // Trees (3 variants)
    const treeCols = [['#2f8f4e', '#46b565', '#1f5f36'], ['#2a9d8f', '#48c9b0', '#1b6b61'], ['#b0508f', '#e07ac0', '#6e2d5a']];
    this.sprites.trees = treeCols.map((col, v) => mk(64, (c, s) => {
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(36, 50, 22, 9, 0, 0, 7); c.fill();
      c.fillStyle = '#5a3a22'; c.fillRect(29, 34, 6, 18);
      if (v === 1) {
        c.fillStyle = col[2]; c.beginPath(); c.moveTo(32, 4); c.lineTo(52, 42); c.lineTo(12, 42); c.fill();
        c.fillStyle = col[0]; c.beginPath(); c.moveTo(32, 8); c.lineTo(48, 38); c.lineTo(16, 38); c.fill();
        c.fillStyle = col[1]; c.beginPath(); c.moveTo(32, 10); c.lineTo(40, 26); c.lineTo(26, 30); c.fill();
      } else if (v === 2) {
        c.fillStyle = col[2]; c.beginPath(); c.arc(32, 24, 18, 0, 7); c.fill();
        c.fillStyle = col[0]; c.beginPath(); c.arc(32, 22, 16, 0, 7); c.fill();
        c.fillStyle = col[1]; c.beginPath(); c.arc(26, 17, 6, 0, 7); c.fill();
        c.fillStyle = '#ffe6f5'; [[38, 18], [30, 30], [40, 28]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); });
      } else {
        c.fillStyle = col[2]; c.beginPath(); c.arc(24, 28, 14, 0, 7); c.arc(40, 28, 14, 0, 7); c.arc(32, 18, 15, 0, 7); c.fill();
        c.fillStyle = col[0]; c.beginPath(); c.arc(24, 26, 12, 0, 7); c.arc(40, 26, 12, 0, 7); c.arc(32, 16, 13, 0, 7); c.fill();
        c.fillStyle = col[1]; c.beginPath(); c.arc(28, 12, 6, 0, 7); c.fill();
      }
    }));
  },

  // ---------- Terrain ----------
  terrainColor(t, sh, x, y) {
    const v = (sh - 128) / 128;
    switch (t) {
      case TERR.WATER: return [28 + v * 8, 88 + v * 14, 130 + v * 18];
      case TERR.SAND: return [196 + v * 14, 174 + v * 12, 118 + v * 10];
      case TERR.MOSS: return [72 + v * 12, 118 + v * 14, 60 + v * 10];
      default: return [52 + v * 10, 112 + v * 16, 82 + v * 12];
    }
  },

  renderChunk(cx, cy) {
    const key = cy * 64 + cx;
    let c = this.chunks.get(key);
    if (!c) { c = document.createElement('canvas'); c.width = c.height = CHUNK * CPX; this.chunks.set(key, c); }
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(CHUNK * CPX, CHUNK * CPX);
    const d = img.data;
    const W = G.W;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
        if (x >= G.W || y >= G.H) continue;
        const i = y * W + x;
        let t = G.terr[i];
        const base = t === TERR.ROCK ? TERR.GRASS : t;
        const col = this.terrainColor(base, G.shade[i], x, y);
        // neighbour info for shorelines
        const wN = y > 0 && G.terr[i - W] === TERR.WATER, wS = y < G.H - 1 && G.terr[i + W] === TERR.WATER;
        const wW = x > 0 && G.terr[i - 1] === TERR.WATER, wE = x < W - 1 && G.terr[i + 1] === TERR.WATER;
        let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
        for (let py = 0; py < CPX; py++) {
          for (let px = 0; px < CPX; px++) {
            h = (h ^ (h >>> 13)) * 1274126177 | 0;
            const r = ((h >>> 8) & 255) / 255;
            let m = 1 + (r - 0.5) * 0.08;
            if (base === TERR.GRASS || base === TERR.MOSS) { if (r > 0.94) m = 1.18; else if (r < 0.05) m = 0.82; }
            let cr = col[0] * m, cg = col[1] * m, cb = col[2] * m;
            if (base === TERR.WATER) {
              const wave = Math.sin((x * CPX + px) * 0.35 + (y * CPX + py) * 0.2) > 0.93;
              if (wave) { cr += 30; cg += 40; cb += 40; }
              const e = 3;
              if (G.terr[i] === TERR.WATER && ((!wN && y > 0 && py < e) || (!wS && py >= CPX - e) || (!wW && px < e) || (!wE && px >= CPX - e))) { cr += 40; cg += 50; cb += 40; }
            } else if ((wN && py < 2) || (wS && py >= CPX - 2) || (wW && px < 2) || (wE && px >= CPX - 2)) {
              cr = 210; cg = 196; cb = 150;
            }
            const o = ((ty * CPX + py) * CHUNK * CPX + tx * CPX + px) * 4;
            d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // rocks on top
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
      if (x >= G.W || y >= G.H) continue;
      if (G.terr[y * W + x] !== TERR.ROCK) continue;
      const px = tx * CPX, py = ty * CPX;
      const s = (G.shade[y * W + x] % 5) / 10;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px + 9, py + 12, 8, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgb(${95 + s * 40},${98 + s * 40},${108 + s * 40})`;
      ctx.beginPath(); ctx.moveTo(px + 1, py + 12); ctx.lineTo(px + 3, py + 4 + s * 4); ctx.lineTo(px + 8, py + 1); ctx.lineTo(px + 14, py + 4);
      ctx.lineTo(px + 15, py + 12); ctx.lineTo(px + 9, py + 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(px + 3, py + 5); ctx.lineTo(px + 8, py + 2); ctx.lineTo(px + 10, py + 7); ctx.lineTo(px + 5, py + 9); ctx.fill();
    }
    return c;
  },

  getChunk(cx, cy) {
    const key = cy * 64 + cx;
    if (G.dirty.chunks.has(key)) { G.dirty.chunks.delete(key); }
    return this.chunks.get(key) || this.renderChunk(cx, cy);
  },

  updateFog() {
    if (!this.fogCanvas) {
      this.fogSmall = document.createElement('canvas'); this.fogSmall.width = G.W; this.fogSmall.height = G.H;
      this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = G.W * 4; this.fogCanvas.height = G.H * 4;
    }
    const ctx = this.fogSmall.getContext('2d');
    const img = ctx.createImageData(G.W, G.H);
    const d = img.data;
    for (let i = 0; i < G.W * G.H; i++) {
      d[i * 4] = 10; d[i * 4 + 1] = 14; d[i * 4 + 2] = 22;
      d[i * 4 + 3] = G.revealed[i] ? 0 : 228;
    }
    ctx.putImageData(img, 0, 0);
    const big = this.fogCanvas.getContext('2d');
    big.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
    big.filter = 'blur(3px)';
    big.imageSmoothingEnabled = true;
    big.drawImage(this.fogSmall, 0, 0, this.fogCanvas.width, this.fogCanvas.height);
    big.filter = 'none';
    G.dirty.fog = false;
  },

  // ---------- Frame ----------
  draw(t, ui) {
    const ctx = this.ctx, cam = this.cam, z = cam.z;
    if (G.dirty.fog) this.updateFog();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = z * this.dpr;
    ctx.setTransform(s, 0, 0, s, (this.w / 2 - cam.x * z) * this.dpr, (this.h / 2 - cam.y * z) * this.dpr);

    const tl = this.screenToWorld(0, 0), br = this.screenToWorld(this.w, this.h);
    const x0 = Math.max(0, Math.floor(tl.x / TILE) - 1), y0 = Math.max(0, Math.floor(tl.y / TILE) - 1);
    const x1 = Math.min(G.W - 1, Math.ceil(br.x / TILE) + 1), y1 = Math.min(G.H - 1, Math.ceil(br.y / TILE) + 1);
    this.view = { x0, y0, x1, y1 };

    // terrain
    ctx.imageSmoothingEnabled = true;
    // rebuild dirty chunks
    for (const key of G.dirty.chunks) { this.chunks.delete(key); }
    G.dirty.chunks.clear();
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const c = this.getChunk(cx, cy);
        ctx.drawImage(c, cx * CHUNK * TILE, cy * CHUNK * TILE, CHUNK * TILE, CHUNK * TILE);
      }
    }

    // grid when building
    if (ui.tool && z > 0.55) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * TILE, y0 * TILE); ctx.lineTo(x * TILE, (y1 + 1) * TILE); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * TILE, y * TILE); ctx.lineTo((x1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }

    // resource nodes, crash sites, slugs
    for (const nd of G.nodes) {
      if (nd.x < x0 || nd.x > x1 || nd.y < y0 || nd.y > y1) continue;
      this.drawNode(ctx, nd, t);
    }
    G.crashes.forEach((c, i) => {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) return;
      this.drawCrash(ctx, c, G.crashesOpened.has(i), t);
    });

    // entities: belts first
    const ents = [];
    for (const e of G.ents.values()) {
      if (e.x + e.size < x0 || e.x > x1 || e.y + e.size < y0 || e.y > y1) continue;
      ents.push(e);
    }
    const lod = z < 0.45;
    for (const e of ents) if (e.kind === 'belt') this.drawBelt(ctx, e, t, lod);
    for (const e of ents) if (e.kind === 'splitter' || e.kind === 'junction') this.drawLogi(ctx, e, t);
    if (!lod) for (const e of ents) if (e.kind === 'belt') this.drawBeltItems(ctx, e);
    for (const e of ents) if (!LOGI[e.kind]) this.drawBuilding(ctx, e, t, false);

    // trees (above ground, below fog)
    const trees = this.sprites.trees;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = G.trees[y * G.W + x];
        if (!v) continue;
        const sway = Math.sin(t * 1.3 + x * 0.7 + y * 0.3) * 1.2;
        ctx.drawImage(trees[v - 1], x * TILE - 8 + sway, y * TILE - 18, TILE + 16, TILE + 16);
      }
    }

    G.slugs.forEach((sl, i) => {
      if (G.slugsTaken.has(i)) return;
      if (sl.x < x0 || sl.x > x1 || sl.y < y0 || sl.y > y1) return;
      this.drawSlug(ctx, sl, t);
    });

    // particles
    this.drawParticles(ctx, t);

    // fog
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, 0, 0, G.W * TILE, G.H * TILE);
    // map border
    ctx.strokeStyle = 'rgba(255,154,60,0.35)'; ctx.lineWidth = 3 / z;
    ctx.strokeRect(0, 0, G.W * TILE, G.H * TILE);

    // overlays (ghosts, selection)
    ui.drawOverlay(ctx, t);

    // floating texts
    this.drawFloats(ctx);
  },

  // ---------- Resource visuals ----------
  drawNode(ctx, nd, t) {
    const px = nd.x * TILE, py = nd.y * TILE, cx = px + TILE / 2, cy = py + TILE / 2;
    const nt = NODE_TYPES[nd.type];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 4, 17, 11, 0, 0, 7); ctx.fill();
    if (nd.type === 'crude_oil') {
      ctx.fillStyle = '#120b18'; ctx.beginPath(); ctx.ellipse(cx, cy, 15, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(176,124,255,0.35)'; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 3, 6 + Math.sin(t * 2) * 1.5, 3, 0, 0, 7); ctx.fill();
    } else if (nd.type === 'geyser') {
      ctx.fillStyle = '#4a545e'; ctx.beginPath(); ctx.ellipse(cx, cy, 15, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#20262c'; ctx.beginPath(); ctx.ellipse(cx, cy, 7, 5, 0, 0, 7); ctx.fill();
      if (Math.random() < 0.08) this.spawn('steam', cx, cy - 4);
    } else {
      // crystal cluster on a dark ore patch
      const col = nt.color, hi = Icons.shade(col, 0.35), lo = Icons.shade(col, -0.35);
      ctx.fillStyle = Icons.shade(col, -0.6);
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, 16, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = Icons.shade(col, -0.3);
      [[-9, 6], [9, 7], [-2, 10], [11, 0]].forEach(([ox, oy]) => { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 3, 0, 7); ctx.fill(); });
      const spikes = [[-8, 2, 8, 15], [0, -2, 9, 20], [8, 3, 8, 14], [-3, 6, 6, 10], [5, 7, 5, 9]];
      for (const [ox, oy, w, h] of spikes) {
        ctx.fillStyle = lo;
        ctx.beginPath(); ctx.moveTo(cx + ox - w / 2, cy + oy + 4); ctx.lineTo(cx + ox, cy + oy - h + 4); ctx.lineTo(cx + ox + w / 2, cy + oy + 4); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(cx + ox - w / 2, cy + oy + 4); ctx.lineTo(cx + ox, cy + oy - h + 4); ctx.lineTo(cx + ox, cy + oy + 4); ctx.fill();
        ctx.fillStyle = hi;
        ctx.fillRect(cx + ox - 1, cy + oy - h + 7, 1.5, h * 0.4);
      }
    }
    // purity ring
    if (this.cam.z > 0.5) {
      ctx.strokeStyle = PURITY[nd.purity].color;
      ctx.globalAlpha = 0.55 + Math.sin(t * 2 + nd.x) * 0.15;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 16, 12, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  drawSlug(ctx, s, t) {
    const cx = s.x * TILE + TILE / 2, cy = s.y * TILE + TILE / 2 + Math.sin(t * 2 + s.x) * 2;
    const col = ['#58c8ff', '#ffd23f', '#c77dff'][s.kind];
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(cx, cy, 7, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 2, 0, 7); ctx.fill();
  },

  drawCrash(ctx, c, opened, t) {
    const px = c.x * TILE, py = c.y * TILE, cx = px + 16, cy = py + 16;
    ctx.fillStyle = 'rgba(40,30,20,0.5)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 4, 22, 14, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.4);
    ctx.fillStyle = opened ? '#6b717a' : '#d9dde2';
    Icons.rr(ctx, -11, -9, 22, 18, 4); ctx.fill();
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(-11, -2, 22, 4);
    ctx.fillStyle = opened ? '#333' : '#4fb3ff'; ctx.fillRect(-4, -7, 8, 4);
    ctx.restore();
    if (!opened) {
      const a = 0.5 + Math.sin(t * 5) * 0.5;
      ctx.fillStyle = `rgba(255,80,80,${a})`;
      ctx.beginPath(); ctx.arc(cx + 8, cy - 12, 3, 0, 7); ctx.fill();
      if (Math.random() < 0.05) this.spawn('smoke', cx, cy - 6);
    }
  },

  // ---------- Belts ----------
  // curve: world side the belt is fed from when it bends (-1 = straight, undefined = compute)
  drawBelt(ctx, e, t, lod, curve) {
    const px = e.x * TILE, py = e.y * TILE;
    const tier = BUILDINGS[e.type].tier;
    if (curve === undefined) curve = e.id ? beltCurve(e) : -1;
    ctx.save();
    ctx.translate(px + 16, py + 16);
    ctx.rotate(e.dir * Math.PI / 2);
    if (curve >= 0) {
      this.drawBeltCurve(ctx, e, t, lod, tier, curve === (e.dir + 3) % 4 ? -1 : 1);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#23272e';
    ctx.fillRect(-16, -12, 32, 24);
    if (lod) { ctx.fillStyle = BELT_COLORS[tier]; ctx.fillRect(-16, -2, 32, 4); ctx.restore(); return; }
    ctx.fillStyle = '#353b44';
    ctx.fillRect(-16, -9, 32, 18);
    // moving chevrons
    const sp = BUILDINGS[e.type].speed;
    const off = ((t * sp * 32) % 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = -1; k < 2; k++) {
      const x = -16 + off + k * 16;
      if (x < -18 || x > 14) continue;
      ctx.moveTo(x, -6); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 6);
    }
    ctx.stroke();
    ctx.fillStyle = BELT_COLORS[tier];
    ctx.fillRect(-16, -12, 32, 3);
    ctx.fillRect(-16, 9, 32, 3);
    ctx.restore();
  },

  // Quarter-circle belt in the local frame (exit towards +x). sgn -1: fed from the top edge, +1: from the bottom edge.
  drawBeltCurve(ctx, e, t, lod, tier, sgn) {
    const cy = 16 * sgn;          // pivot corner is (16, cy)
    const a0 = Math.PI, a1 = Math.PI + sgn * Math.PI / 2;
    const ring = (r0, r1, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(16, cy, r1, a0, a1, sgn < 0);
      ctx.arc(16, cy, r0, a1, a0, sgn > 0);
      ctx.closePath();
      ctx.fill();
    };
    ring(4, 28, '#23272e');
    if (lod) { ring(14, 18, BELT_COLORS[tier]); return; }
    ring(7, 25, '#353b44');
    // moving chevrons along the arc
    const sp = BUILDINGS[e.type].speed;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      const f = ((t * sp * 32 / 25) + k * 0.5) % 1;
      const a = a0 + sgn * f * Math.PI / 2;
      const x = 16 + Math.cos(a) * 16, y = cy + Math.sin(a) * 16;
      const tx = Math.sin(a) * -sgn, ty = Math.cos(a) * sgn; // tangent (direction of travel)
      const nx = -ty, ny = tx;
      ctx.beginPath();
      ctx.moveTo(x - tx * 3 + nx * 5, y - ty * 3 + ny * 5);
      ctx.lineTo(x + tx * 2, y + ty * 2);
      ctx.lineTo(x - tx * 3 - nx * 5, y - ty * 3 - ny * 5);
      ctx.stroke();
    }
    ring(4, 7, BELT_COLORS[tier]);
    ring(25, 28, BELT_COLORS[tier]);
  },

  drawBeltItems(ctx, e) {
    const cx = e.x * TILE + 16, cy = e.y * TILE + 16;
    const size = this.cam.z > 1.5 ? 48 : 32;
    const curve = beltCurve(e);
    const ca = Math.cos(e.dir * Math.PI / 2), sa = Math.sin(e.dir * Math.PI / 2);
    for (const it of e.items) {
      let x, y;
      if (curve >= 0) {
        const sgn = curve === (e.dir + 3) % 4 ? -1 : 1;
        const a = Math.PI + sgn * it.p * Math.PI / 2;
        const lx = 16 + Math.cos(a) * 16, ly = 16 * sgn + Math.sin(a) * 16;
        x = cx + lx * ca - ly * sa; y = cy + lx * sa + ly * ca;
      } else {
        const off = (it.p - 0.5) * TILE;
        x = cx + DX[e.dir] * off; y = cy + DY[e.dir] * off;
      }
      ctx.drawImage(Icons.get(it.i, size), x - 10, y - 10, 20, 20);
    }
  },

  drawLogi(ctx, e, t) {
    const px = e.x * TILE, py = e.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 2, py + 3, 30, 30);
    ctx.fillStyle = '#434a55'; Icons.rr(ctx, px + 1, py + 1, 30, 30, 5); ctx.fill();
    ctx.fillStyle = '#2b3038'; Icons.rr(ctx, px + 4, py + 4, 24, 24, 4); ctx.fill();
    ctx.save(); ctx.translate(px + 16, py + 16);
    if (e.kind === 'splitter') {
      ctx.rotate(e.dir * Math.PI / 2);
      ctx.fillStyle = '#ff9a3c';
      const arrow = (a) => { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(11, 0); ctx.lineTo(4, 4); ctx.fill(); ctx.fillRect(-2, -1.5, 8, 3); ctx.restore(); };
      arrow(0); arrow(-Math.PI / 2); arrow(Math.PI / 2);
      if (e.buf) ctx.drawImage(Icons.get(e.buf, 32), -8, -8, 16, 16);
    } else {
      ctx.fillStyle = '#6fc3ff';
      ctx.fillRect(-11, -2, 22, 4); ctx.fillRect(-2, -11, 4, 22);
      const it = e.slots.find(Boolean);
      if (it) ctx.drawImage(Icons.get(it, 32), -8, -8, 16, 16);
    }
    ctx.restore();
  },

  // ---------- Buildings ----------
  drawBuilding(ctx, e, t, ghost) {
    const d = BUILDINGS[e.type];
    const s = d.size * TILE;
    const px = e.x * TILE, py = e.y * TILE;
    const working = e.status === 'working' || e.status === 'nopower';
    const anim = e.anim || 0;
    if (!ghost) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      Icons.rr(ctx, px + 3, py + 5, s - 2, s - 2, 6); ctx.fill();
    }
    switch (d.kind) {
      case 'hub': return this.drawHub(ctx, px, py, s, t);
      case 'elevator': return this.drawElevator(ctx, px, py, s, t);
      case 'miner': return this.drawMiner(ctx, e, px, py, s, anim, working);
      case 'uploader': return this.drawUploader(ctx, e, px, py, t);
      case 'radar': return this.drawRadar(ctx, px, py, s, t, working);
      case 'sink': return this.drawSink(ctx, e, px, py, s, t);
      case 'gen': return this.drawGen(ctx, e, px, py, s, t, working);
    }
    // generic machine
    const accent = { smelter: '#ff7b2e', constructor: '#ff9a3c', assembler: '#ffc23c', foundry: '#ff5a3c', refinery: '#b07cff', manufacturer: '#4fb3ff' }[e.type] || '#ff9a3c';
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 6); ctx.fill();
    ctx.fillStyle = '#4b5462'; Icons.rr(ctx, px + 5, py + 5, s - 10, s - 10, 5); ctx.fill();
    ctx.fillStyle = accent; ctx.fillRect(px + 5, py + 5, s - 10, 4);
    ctx.fillStyle = '#2a2f37'; ctx.fillRect(px + 5, py + s - 10, s - 10, 5);
    // hazard corners
    ctx.fillStyle = accent;
    [[px + 2, py + 2], [px + s - 8, py + 2], [px + 2, py + s - 8], [px + s - 8, py + s - 8]].forEach(([x, y]) => ctx.fillRect(x, y, 6, 6));
    const cx = px + s / 2, cy = py + s / 2;
    // type-specific details
    if (e.type === 'smelter' || e.type === 'foundry') {
      const glow = working ? 0.6 + Math.sin(t * 8 + e.id) * 0.25 : 0.15;
      const n = e.type === 'foundry' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const fx = n === 1 ? cx : px + s * (k ? 0.72 : 0.28);
        ctx.fillStyle = `rgba(255,${120 + k * 30},40,${glow})`;
        ctx.beginPath(); ctx.arc(fx, py + s - 14, s * 0.13, Math.PI, 0); ctx.fill();
      }
      if (working && Math.random() < 0.06) this.spawn('smoke', px + s - 10, py + 6);
    } else if (e.type === 'refinery') {
      ctx.fillStyle = '#6a4a9a';
      ctx.beginPath(); ctx.arc(px + s * 0.25, py + s * 0.3, s * 0.13, 0, 7); ctx.arc(px + s * 0.75, py + s * 0.3, s * 0.13, 0, 7); ctx.fill();
      if (working && Math.random() < 0.05) this.spawn('steam', px + s * 0.75, py + 8);
    } else if (e.type === 'manufacturer' || e.type === 'assembler') {
      // robotic arms
      ctx.strokeStyle = '#8a94a3'; ctx.lineWidth = 3;
      const a = working ? Math.sin(anim * 4) * 0.6 : 0;
      for (const side of [-1, 1]) {
        const bx = cx + side * s * 0.3, by = py + s * 0.3;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - side * Math.cos(a) * s * 0.18, by + Math.abs(Math.sin(a)) * s * 0.12 + s * 0.08); ctx.stroke();
      }
    } else {
      // constructor gear
      ctx.save(); ctx.translate(px + s - 12, py + 14); ctx.rotate(anim * 2);
      ctx.fillStyle = '#8a94a3';
      for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.fillRect(-1.5, -7, 3, 4); }
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a2f37'; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill();
      ctx.restore();
    }
    // recipe icon, with the machine's emblem as a badge; without a recipe the emblem fills the centre
    if (e.recipe) {
      const out = recipeMainOut(e.recipe);
      const is = Math.min(s * 0.5, 40);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, is * 0.62, 0, 7); ctx.fill();
      ctx.drawImage(Icons.get(out, 48), cx - is / 2, cy - is / 2, is, is);
      this.drawEmblem(ctx, e.type, px + 13, py + s - 17, 7.5);
    } else {
      this.drawEmblem(ctx, e.type, cx, cy, s * 0.3);
    }
    // progress bar
    if (e.crafting && RECIPES[e.recipe]) {
      const f = e.prog / RECIPES[e.recipe].t;
      ctx.fillStyle = '#1b1f25'; ctx.fillRect(px + 8, py + s - 9, s - 16, 3);
      ctx.fillStyle = accent; ctx.fillRect(px + 8, py + s - 9, (s - 16) * f, 3);
    }
    if (!ghost) this.drawLed(ctx, e, px + 9, py + 13);
    if (e.clock > 1.001) this.drawOC(ctx, px + s - 10, py + s - 16);
  },

  // Symbol that identifies a production machine: flame, hammer, gears, crucible, flask, factory
  drawEmblem(ctx, type, cx, cy, r) {
    const accent = { smelter: '#ff7b2e', constructor: '#ff9a3c', assembler: '#ffc23c', foundry: '#ff5a3c', refinery: '#b07cff', manufacturer: '#4fb3ff' }[type] || '#ff9a3c';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#1b1f25';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.scale(r / 10, r / 10);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (type) {
      case 'smelter': {
        ctx.fillStyle = '#ff7b2e';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.bezierCurveTo(6, -1, 6, 6, 0, 6.5); ctx.bezierCurveTo(-6, 6, -6, -1, 0, -7); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.bezierCurveTo(3, 2, 3, 5.5, 0, 5.5); ctx.bezierCurveTo(-3, 5.5, -3, 2, 0, -1); ctx.fill();
        break;
      }
      case 'constructor': {
        // hammer over a plate
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-6, 4, 12, 2.5);
        ctx.save(); ctx.rotate(-0.7);
        ctx.fillStyle = '#c98a4b'; ctx.fillRect(-1, -2, 2, 10);
        ctx.fillStyle = '#ff9a3c'; ctx.fillRect(-4.5, -6, 9, 4.5);
        ctx.restore();
        break;
      }
      case 'assembler': {
        const gear = (x, y, rr, n, col) => {
          ctx.fillStyle = col;
          ctx.save(); ctx.translate(x, y);
          for (let k = 0; k < n; k++) { ctx.rotate(Math.PI * 2 / n); ctx.fillRect(-1.1, -rr - 1.6, 2.2, 2.2); }
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill();
          ctx.fillStyle = '#1b1f25'; ctx.beginPath(); ctx.arc(0, 0, rr * 0.4, 0, 7); ctx.fill();
          ctx.restore();
        };
        gear(-2.5, -1.5, 3.6, 8, '#ffc23c');
        gear(3.5, 3.2, 2.6, 6, '#9aa3ad');
        break;
      }
      case 'foundry': {
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(4, -5); ctx.lineTo(2.5, 3); ctx.lineTo(-4.5, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff5a3c'; ctx.fillRect(-5.2, -4.2, 8.4, 2.4);
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(4.5, 5.5, 1.8, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(3.5, -4.5); ctx.quadraticCurveTo(6.5, -3, 4.8, 3.8); ctx.lineTo(4.2, 3.8); ctx.quadraticCurveTo(5, -2, 3.5, -3.5); ctx.fill();
        break;
      }
      case 'refinery': {
        ctx.fillStyle = '#d9dde2';
        ctx.beginPath(); ctx.moveTo(-1.8, -7); ctx.lineTo(1.8, -7); ctx.lineTo(1.8, -2); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.lineTo(-1.8, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b07cff';
        ctx.beginPath(); ctx.moveTo(-3.8, 1.5); ctx.lineTo(3.8, 1.5); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
        break;
      }
      case 'manufacturer': {
        ctx.fillStyle = '#4fb3ff';
        ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-7, -1); ctx.lineTo(-3, -4); ctx.lineTo(-3, -1); ctx.lineTo(1, -4); ctx.lineTo(1, -1); ctx.lineTo(5, -4); ctx.lineTo(5, -7); ctx.lineTo(7, -7); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b1f25'; [-4.5, -0.5, 3.5].forEach(x => ctx.fillRect(x, 1.5, 2, 2));
        break;
      }
    }
    ctx.restore();
  },

  drawLed(ctx, e, x, y) {
    const c = STATUS_COLORS[e.status] || '#8a94a3';
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
  },
  drawOC(ctx, x, y) {
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.fill();
  },

  drawHub(ctx, px, py, s, t) {
    ctx.fillStyle = '#2f353f'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 10); ctx.fill();
    ctx.fillStyle = '#ff9a3c'; Icons.rr(ctx, px + 8, py + 8, s - 16, s - 16, 8); ctx.fill();
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 14, py + 14, s - 28, s - 28, 6); ctx.fill();
    // stripes
    ctx.save(); ctx.beginPath(); ctx.rect(px + 2, py + s - 14, s - 4, 8); ctx.clip();
    for (let k = -2; k < s / 8; k++) { ctx.fillStyle = k % 2 ? '#1b1f25' : '#ffcf3c'; ctx.beginPath(); ctx.moveTo(px + k * 8, py + s - 6); ctx.lineTo(px + k * 8 + 8, py + s - 14); ctx.lineTo(px + k * 8 + 16, py + s - 14); ctx.lineTo(px + k * 8 + 8, py + s - 6); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HUB', px + s / 2, py + s / 2 - 4);
    // antenna light
    ctx.fillStyle = `rgba(90,209,122,${0.5 + Math.sin(t * 3) * 0.5})`;
    ctx.beginPath(); ctx.arc(px + s - 16, py + 16, 4, 0, 7); ctx.fill();
  },

  drawElevator(ctx, px, py, s, t) {
    const cx = px + s / 2, cy = py + s / 2;
    ctx.fillStyle = '#2a2f37'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 12); ctx.fill();
    ctx.fillStyle = '#ff9a3c';
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + t * 0.2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * s * 0.36, cy + Math.sin(a) * s * 0.36, 5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#d9dde2'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#4b5462'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.22, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 0.2);
    g.addColorStop(0, 'rgba(160,220,255,0.95)'); g.addColorStop(1, 'rgba(79,179,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, 7); ctx.fill();
    // phase pips
    for (let k = 0; k < PHASES.length; k++) {
      ctx.fillStyle = k < G.phase ? '#5ad17a' : '#1b1f25';
      ctx.fillRect(px + 14 + k * 14, py + s - 14, 10, 6);
    }
  },

  drawMiner(ctx, e, px, py, s, anim, working) {
    const d = BUILDINGS[e.type];
    const col = e.type === 'oil_extractor' ? '#6a4a9a' : ({ miner1: '#ff9a3c', miner2: '#4fb3ff', miner3: '#c77dff' }[e.type]);
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 6); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(px + 2, py + 2, s - 4, 5); ctx.fillRect(px + 2, py + s - 7, s - 4, 5);
    const cx = px + s / 2, cy = py + s / 2;
    ctx.save(); ctx.translate(cx, cy);
    if (e.type === 'oil_extractor') {
      const k = working ? Math.sin(anim * 3) : 0;
      ctx.fillStyle = '#20252c'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(-s * 0.32, -3 + k * 4, s * 0.64, 6);
    } else {
      ctx.rotate(anim * 6);
      ctx.fillStyle = '#20252c'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#9aa3ad';
      for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.28, -5); ctx.lineTo(s * 0.28, 5); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
    }
    ctx.restore();
    if (e.node) ctx.drawImage(Icons.get(e.node.type, 32), px + s - 20, py + 8, 14, 14);
    if (working && Math.random() < 0.04 && e.type !== 'oil_extractor') this.spawn('dust', cx, cy);
    this.drawLed(ctx, e, px + 9, py + 13);
    if (e.clock > 1.001) this.drawOC(ctx, px + s - 10, py + s - 16);
    void d;
  },

  drawUploader(ctx, e, px, py, t) {
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 1, py + 1, 30, 30, 5); ctx.fill();
    const g = ctx.createRadialGradient(px + 16, py + 16, 1, px + 16, py + 16, 12);
    const a = 0.5 + (e.flash || 0) * 0.5;
    g.addColorStop(0, `rgba(160,230,255,${a})`); g.addColorStop(1, 'rgba(79,179,255,0.1)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px + 16, py + 16, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4fb3ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px + 16, py + 16, 8, t * 3, t * 3 + 4); ctx.stroke();
  },

  drawRadar(ctx, px, py, s, t, working) {
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 6); ctx.fill();
    ctx.save(); ctx.translate(px + s / 2, py + s / 2); ctx.rotate(t * (working ? 1.5 : 0));
    ctx.fillStyle = '#d9dde2'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.38, s * 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(-2, -2, s * 0.38, 4);
    ctx.restore();
  },

  drawSink(ctx, e, px, py, s, t) {
    const cx = px + s / 2, cy = py + s / 2;
    ctx.fillStyle = '#2f2a45'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 10); ctx.fill();
    ctx.fillStyle = '#ff5ad1'; ctx.fillRect(px + 2, py + 2, s - 4, 5);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${150 + k * 40},${90 + k * 30},255,${0.8 - k * 0.2})`;
      ctx.lineWidth = 4 - k;
      ctx.beginPath(); ctx.arc(cx, cy, s * (0.32 - k * 0.08), t * (2 + k) + k, t * (2 + k) + k + 4.2); ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.3 + (e.flash || 0) * 0.6})`;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
  },

  drawGen(ctx, e, px, py, s, t, working) {
    const d = BUILDINGS[e.type];
    const col = { biomass_burner: '#5dbb4f', coal_gen: '#8a8aa0', fuel_gen: '#e2742b', geothermal: '#6fc3ff' }[e.type];
    ctx.fillStyle = '#3a414c'; Icons.rr(ctx, px + 2, py + 2, s - 4, s - 4, 6); ctx.fill();
    ctx.fillStyle = '#4b5462'; Icons.rr(ctx, px + 6, py + 6, s - 12, s - 12, 5); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(px + 6, py + 6, s - 12, 4);
    // chimneys
    const n = d.size >= 3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const cx = n === 1 ? px + s * 0.66 : px + s * (0.35 + k * 0.32), cy = py + s * 0.4;
      ctx.fillStyle = '#20252c'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.13, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      if (working && Math.random() < 0.12) this.spawn(e.type === 'geothermal' ? 'steam' : 'smoke', cx, cy);
    }
    // bolt icon
    ctx.fillStyle = working ? '#ffd23f' : '#5a616b';
    const bx = px + s * 0.3, by = py + s * 0.68;
    ctx.beginPath(); ctx.moveTo(bx + 2, by - 8); ctx.lineTo(bx - 4, by + 1); ctx.lineTo(bx, by + 1); ctx.lineTo(bx - 2, by + 8); ctx.lineTo(bx + 5, by - 1); ctx.lineTo(bx + 1, by - 1); ctx.fill();
    // fuel gauge
    if (d.fuels) {
      let tot = 0; for (const k in e.fuel || {}) tot += e.fuel[k];
      const f = Math.min(1, tot / d.fuelCap);
      ctx.fillStyle = '#1b1f25'; ctx.fillRect(px + s * 0.5, py + s - 14, s * 0.4, 5);
      ctx.fillStyle = f > 0.1 ? col : '#ff5a5a'; ctx.fillRect(px + s * 0.5, py + s - 14, s * 0.4 * f, 5);
    }
    this.drawLed(ctx, e, px + 11, py + 16);
  },

  // ---------- Effects ----------
  spawn(kind, x, y) {
    if (this.particles.length > 400) return;
    const p = { kind, x, y, vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 10, life: 1, r: 3 + Math.random() * 3 };
    if (kind === 'dust') { p.vy = (Math.random() - 0.5) * 20; p.vx = (Math.random() - 0.5) * 20; p.r = 2; }
    if (kind === 'spark') { p.vx = (Math.random() - 0.5) * 80; p.vy = (Math.random() - 0.5) * 80; p.r = 2; }
    this.particles.push(p);
  },
  burst(x, y, n, kind) { for (let i = 0; i < n; i++) this.spawn(kind || 'spark', x, y); },

  updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt * (p.kind === 'spark' ? 1.8 : 0.6);
      p.r += dt * (p.kind === 'smoke' || p.kind === 'steam' ? 6 : 0);
      if (p.life <= 0) ps.splice(i, 1);
    }
    const fs = this.floats;
    for (let i = fs.length - 1; i >= 0; i--) {
      fs[i].life -= dt * 0.8; fs[i].y -= dt * 20;
      if (fs[i].life <= 0) fs.splice(i, 1);
    }
  },

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life) * (p.kind === 'smoke' ? 0.35 : p.kind === 'steam' ? 0.45 : 0.9);
      ctx.fillStyle = p.kind === 'smoke' ? '#555b66' : p.kind === 'steam' ? '#e8f6ff' : p.kind === 'dust' ? '#b59a7a' : '#ffd23f';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  addFloat(wx, wy, text, color, item) { this.floats.push({ x: wx, y: wy, text, color: color || '#fff', item, life: 1 }); },

  drawFloats(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const tx = f.item ? f.x + 8 : f.x;
      ctx.strokeText(f.text, tx, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, tx, f.y);
      if (f.item) ctx.drawImage(Icons.get(f.item, 32), f.x - 22, f.y - 8, 16, 16);
    }
    ctx.globalAlpha = 1;
  },

  // Building icon for UI buttons
  buildingIcon(type) {
    // Map, not {}: a plain object would return Object.prototype.constructor for 'constructor'
    this._bicons = this._bicons || new Map();
    if (this._bicons.has(type)) return this._bicons.get(type);
    const d = BUILDINGS[type];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const scale = 64 / (Math.max(d.size, 1) * TILE);
    ctx.scale(scale, scale);
    const e = { type, kind: d.kind, x: 0, y: 0, dir: 0, size: d.size, status: 'working', anim: 0.3, items: [], slots: [null, null, null, null], fuel: {}, id: 1 };
    if (d.kind === 'machine') e.recipe = null;
    const savedRand = Math.random;
    Math.random = () => 1; // no particles
    if (d.kind === 'belt') this.drawBelt(ctx, e, 0, false);
    else if (LOGI[d.kind]) this.drawLogi(ctx, e, 0);
    else this.drawBuilding(ctx, e, 0, true);
    Math.random = savedRand;
    const url = c.toDataURL();
    this._bicons.set(type, url);
    return url;
  },
};
