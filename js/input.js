// Mouse / touch / keyboard input.
'use strict';

const Input = {
  keys: new Set(),
  pointers: new Map(),
  down: null,
  pinch: null,
  mouse: { x: 0, y: 0, in: false },

  init(canvas) {
    canvas.addEventListener('pointerdown', (ev) => this.onDown(ev));
    window.addEventListener('pointermove', (ev) => this.onMove(ev));
    window.addEventListener('pointerup', (ev) => this.onUp(ev));
    window.addEventListener('pointercancel', (ev) => this.onUp(ev, true));
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); this.zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });
    canvas.addEventListener('pointerleave', () => { this.mouse.in = false; UI.hover = null; UI.hideTip(); });
    window.addEventListener('keydown', (ev) => this.onKey(ev, true));
    window.addEventListener('keyup', (ev) => this.onKey(ev, false));
    window.addEventListener('blur', () => this.keys.clear());
  },

  zoomAt(sx, sy, f) {
    const cam = R.cam;
    const before = R.screenToWorld(sx, sy);
    cam.z = Math.min(2.5, Math.max(0.3, cam.z * f));
    const after = R.screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    this.clampCam();
  },

  clampCam() {
    const cam = R.cam;
    cam.x = Math.max(0, Math.min(G.W * TILE, cam.x));
    cam.y = Math.max(0, Math.min(G.H * TILE, cam.y));
  },

  onDown(ev) {
    Sound.ensure();
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { ev.target.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, z: R.cam.z };
      UI.beltPath = null;
      this.down = null;
      return;
    }
    if (this.pointers.size > 2) return;
    const tile = R.screenToTile(ev.clientX, ev.clientY);
    const base = { sx: ev.clientX, sy: ev.clientY, camx: R.cam.x, camy: R.cam.y, moved: false, button: ev.button, tile, last: tile };
    if (ev.button === 1 || ev.button === 2 || this.keys.has(' ')) { this.down = Object.assign(base, { mode: 'pan' }); return; }
    const d = UI.tool && UI.tool !== 'decon' ? BUILDINGS[UI.tool] : null;
    if (d && d.kind === 'belt') {
      this.down = Object.assign(base, { mode: 'belt' });
    } else if (UI.tool === 'decon') {
      this.down = Object.assign(base, { mode: 'decon' });
      this.deconAt(tile);
    } else {
      this.down = Object.assign(base, { mode: 'maybe' });
    }
  },

  onMove(ev) {
    if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    this.mouse.x = ev.clientX; this.mouse.y = ev.clientY;
    const overCanvas = ev.target && ev.target.id === 'game';
    this.mouse.in = overCanvas || !!this.down;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const cam = R.cam;
      const before = R.screenToWorld(this.pinch.cx, this.pinch.cy);
      cam.z = Math.min(2.5, Math.max(0.3, this.pinch.z * d / this.pinch.d));
      const after = R.screenToWorld(cx, cy);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
      this.pinch.cx = cx; this.pinch.cy = cy;
      this.clampCam();
      return;
    }
    if (!this.mouse.in) { if (UI.tipKind === 'world') UI.hideTip(); return; }
    const tile = R.screenToTile(ev.clientX, ev.clientY);
    UI.hover = tile;
    const dn = this.down;
    if (dn) {
      if (Math.hypot(ev.clientX - dn.sx, ev.clientY - dn.sy) > 6) dn.moved = true;
      if (dn.mode === 'pan' || (dn.mode === 'maybe' && dn.moved) || (dn.mode === 'belt' && dn.moved && UI.beltStart)) {
        R.cam.x = dn.camx - (ev.clientX - dn.sx) / R.cam.z;
        R.cam.y = dn.camy - (ev.clientY - dn.sy) / R.cam.z;
        this.clampCam();
        UI.hideTip();
      } else if (dn.mode === 'belt') {
        if (dn.moved && !UI.beltStart) this.updateRoute(dn.tile, tile);
      } else if (dn.mode === 'decon') {
        if (tile.x !== dn.last.x || tile.y !== dn.last.y) { this.deconAt(tile); dn.last = tile; }
      }
      return;
    }
    if (UI.beltStart) this.updateRoute(UI.beltStart, tile);
    if (!UI.tool && overCanvas) UI.showWorldTip(UI.worldTip(tile), ev.clientX, ev.clientY);
    else UI.hideTip();
  },

  onUp(ev, cancel) {
    this.pointers.delete(ev.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      this.down = null;
      return;
    }
    const dn = this.down;
    this.down = null;
    if (!dn || cancel) { UI.beltPath = null; UI.beltStart = null; return; }
    if (dn.mode === 'belt') this.beltClick(dn, R.screenToTile(ev.clientX, ev.clientY));
    else if (dn.mode === 'maybe' && !dn.moved) this.click(dn.tile);
    else if (dn.mode === 'pan' && dn.button === 2 && !dn.moved) {
      if (UI.beltStart) { UI.beltStart = null; UI.beltPath = null; }
      else if (UI.tool) UI.selectTool(null);
      else if (UI.selected) { UI.selected = null; UI.renderInspect(true); }
    }
  },

  // Belt tool: click the start, click the end (or drag). The belt is routed around obstacles.
  beltClick(dn, tile) {
    if (dn.moved && !UI.beltStart) {
      this.commitBelt(routeBelt(dn.tile, tile, UI.rot));
      return;
    }
    if (dn.moved) return; // panned while choosing the end point
    if (!UI.beltStart) {
      UI.beltStart = dn.tile;
      this.updateRoute(dn.tile, dn.tile, true);
      Sound.sfx.click();
      return;
    }
    const path = routeBelt(UI.beltStart, dn.tile, UI.rot);
    UI.beltStart = null;
    this.commitBelt(path);
  },

  updateRoute(a, b, force) {
    const key = a.x + ',' + a.y + '>' + b.x + ',' + b.y + ':' + UI.rot;
    if (!force && key === this._routeKey) return;
    this._routeKey = key;
    UI.beltPath = routeBelt(a, b, UI.rot);
    Sound.sfx.belt();
  },

  commitBelt(path) {
    UI.beltPath = null;
    this._routeKey = null;
    if (!path) return;
    let placed = 0, poor = false, lastErr = null;
    for (let k = 0; k < path.length; k++) {
      const p = path[k];
      const ex = entAt(p.x, p.y);
      if (ex && ex.kind !== 'belt') continue;
      // ending on an existing belt merges into it: keep its direction
      if (ex && k === path.length - 1 && path.length > 1) continue;
      if (!ex) {
        const err = checkPlace(UI.tool, p.x, p.y);
        if (err) { lastErr = err; continue; }
        if (!canAfford(BUILDINGS[UI.tool].cost)) { poor = true; continue; }
      }
      if (build(UI.tool, p.x, p.y, p.dir, true)) placed++;
    }
    if (placed) Sound.sfx.place();
    if (poor) { UI.toast(T('notEnough'), 'bad'); Sound.sfx.error(); }
    else if (!placed && lastErr) { UI.toast(T(lastErr), 'bad'); Sound.sfx.error(); }
    G.dirty.ui = true;
  },

  deconAt(tile) {
    const e = entAt(tile.x, tile.y);
    if (e && e.kind !== 'hub') {
      deconstruct(e);
      R.burst(tile.x * TILE + 16, tile.y * TILE + 16, 6, 'dust');
    }
  },

  click(tile) {
    if (!inBounds(tile.x, tile.y)) return;
    if (UI.tool && UI.tool !== 'decon') {
      const o = UI.placeOrigin(UI.tool, tile);
      const e = build(UI.tool, o.x, o.y, UI.rot);
      if (e) {
        if (UI.copyRecipe && e.kind === 'machine' && RECIPES[UI.copyRecipe] && RECIPES[UI.copyRecipe].m === e.type && recipesFor(e.type).includes(UI.copyRecipe)) e.recipe = UI.copyRecipe;
        Sound.sfx.place();
        const s = e.size * TILE;
        R.burst(e.x * TILE + s / 2, e.y * TILE + s / 2, 12, 'dust');
        UI.updateToolAfford();
        if (!canAfford(BUILDINGS[UI.tool].cost)) { /* keep tool but hint */ }
      }
      return;
    }
    const i = idx(tile.x, tile.y);
    const e = entAt(tile.x, tile.y);
    if (e) {
      if (e.kind === 'hub' || e.kind === 'elevator') { UI.openPanel(e.kind === 'hub' ? 'hub' : 'elevator'); Sound.sfx.click(); return; }
      UI.selected = e.id;
      UI.selNode = null;
      UI.renderInspect(true);
      Sound.sfx.click();
      return;
    }
    const ni = G.revealed[i] ? G.nodeAt[i] : -1;
    if (ni >= 0 && UI.selNode === ni) {
      // second click on the selected node mines it by hand
      if (handMine(tile.x, tile.y)) R.burst(tile.x * TILE + 16, tile.y * TILE + 16, 5, 'dust');
      UI.renderInspect(true);
      return;
    }
    if (UI.selected || UI.selNode != null) { UI.selected = null; UI.selNode = null; UI.renderInspect(true); }
    if (!G.revealed[i]) return;
    if (ni >= 0) { UI.selNode = ni; UI.renderInspect(true); Sound.sfx.click(); return; }
    const sl = G.slugAt[i];
    if (sl >= 0 && !G.slugsTaken.has(sl)) { collectSlug(sl); R.burst(tile.x * TILE + 16, tile.y * TILE + 16, 16); return; }
    const cr = G.crashAt[i];
    if (cr >= 0 && !G.crashesOpened.has(cr)) { UI.crashModal(cr); return; }
    if (harvestTree(tile.x, tile.y)) { R.burst(tile.x * TILE + 16, tile.y * TILE + 10, 8, 'dust'); return; }
  },

  onKey(ev, down) {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (!down) { this.keys.delete(k); return; }
    const panKeys = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (panKeys.includes(k)) { this.keys.add(k); if (k === ' ' || k.startsWith('Arrow')) ev.preventDefault(); return; }
    if (ev.repeat) return;
    switch (k) {
      case 'r': UI.rotate(); break;
      case 'q': if (UI.hover) UI.pipette(UI.hover); break;
      case 'x': UI.selectTool(UI.tool === 'decon' ? null : 'decon'); break;
      case 'Delete': { const e = ent(UI.selected); if (e && deconstruct(e)) { UI.selected = null; UI.renderInspect(true); } break; }
      case 'Escape':
        if (UI.beltPath || UI.beltStart) { UI.beltPath = null; UI.beltStart = null; }
        else if ($('#modal').classList.contains('show')) UI.closeModal();
        else if (UI.tool) UI.selectTool(null);
        else if (UI.panel) UI.openPanel(null);
        else if (UI.selected || UI.selNode != null) { UI.selected = null; UI.selNode = null; UI.renderInspect(true); }
        else UI.openPanel('settings');
        break;
      case 'h': UI.action('open', 'hub'); break;
      case 'e': if (G.unlockedB.has('space_elevator')) UI.action('open', 'elevator'); break;
      case 'i': case 'Tab': ev.preventDefault(); UI.action('open', 'inv'); break;
      case 'm': UI.action('open', 'mam'); break;
      case 'k': UI.action('open', 'shop'); break;
      case 'j': UI.action('open', 'ach'); break;
      default:
        if (/^[1-9]$/.test(k)) {
          const list = UI.toolList();
          const t = list[parseInt(k, 10) - 1];
          if (t) UI.selectTool(t);
        }
    }
  },

  frame(dt) {
    const sp = 700 * dt / R.cam.z;
    const K = this.keys;
    if (K.has('w') || K.has('ArrowUp')) R.cam.y -= sp;
    if (K.has('s') || K.has('ArrowDown')) R.cam.y += sp;
    if (K.has('a') || K.has('ArrowLeft')) R.cam.x -= sp;
    if (K.has('d') || K.has('ArrowRight')) R.cam.x += sp;
    if (K.size) this.clampCam();
  },
};
