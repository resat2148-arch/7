// Boot, main loop, minimap, event dispatch, autosave, offline progress.
'use strict';

const Minimap = {
  cv: null, ctx: null, base: null,
  init() {
    this.cv = $('#minimap');
    this.cv.width = G.W; this.cv.height = G.H;
    this.ctx = this.cv.getContext('2d');
    const img = this.ctx.createImageData(G.W, G.H);
    for (let i = 0; i < G.W * G.H; i++) {
      const t = G.terr[i];
      const c = t === TERR.WATER ? [30, 90, 135] : t === TERR.SAND ? [190, 170, 115] : t === TERR.ROCK ? [100, 104, 112] : t === TERR.MOSS ? [70, 115, 60] : [50, 108, 80];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    this.base = img;
    const jump = (ev) => {
      const r = this.cv.getBoundingClientRect();
      R.cam.x = (ev.clientX - r.left) / r.width * G.W * TILE;
      R.cam.y = (ev.clientY - r.top) / r.height * G.H * TILE;
      Input.clampCam();
    };
    let drag = false;
    this.cv.addEventListener('pointerdown', (ev) => { drag = true; jump(ev); ev.stopPropagation(); });
    window.addEventListener('pointermove', (ev) => { if (drag) jump(ev); });
    window.addEventListener('pointerup', () => { drag = false; });
  },
  draw() {
    const img = new ImageData(new Uint8ClampedArray(this.base.data), G.W, G.H);
    const d = img.data;
    for (let i = 0; i < G.W * G.H; i++) {
      if (!G.revealed[i]) { d[i * 4] = 12; d[i * 4 + 1] = 16; d[i * 4 + 2] = 24; continue; }
      if (G.trees[i]) { d[i * 4] *= 0.7; d[i * 4 + 1] *= 0.8; d[i * 4 + 2] *= 0.7; }
      const ni = G.nodeAt[i];
      if (ni >= 0) {
        const c = NODE_TYPES[G.nodes[ni].type].color;
        const n = parseInt(c.slice(1), 16);
        d[i * 4] = n >> 16; d[i * 4 + 1] = (n >> 8) & 255; d[i * 4 + 2] = n & 255;
      }
      if (G.occ[i]) {
        const e = G.ents.get(G.occ[i]);
        if (e.kind === 'belt') { d[i * 4] = 200; d[i * 4 + 1] = 200; d[i * 4 + 2] = 210; }
        else { d[i * 4] = 255; d[i * 4 + 1] = 154; d[i * 4 + 2] = 60; }
      }
    }
    G.slugs.forEach((s, i) => { if (!G.slugsTaken.has(i) && G.revealed[idx(s.x, s.y)]) d.set([90, 200, 255, 255], idx(s.x, s.y) * 4); });
    if (G.rival && G.rival.discovered) for (const st of G.rival.structs) for (let j = 0; j < st.size; j++) for (let i = 0; i < st.size; i++) d.set([255, 60, 60, 255], idx(st.x + i, st.y + j) * 4);
    for (const u of G.units) { const x = Math.floor(u.x), y = Math.floor(u.y); if (inBounds(x, y)) d.set(u.team === 'p' ? [80, 180, 255, 255] : [255, 40, 40, 255], idx(x, y) * 4); }
    G.crashes.forEach((c, i) => { if (!G.crashesOpened.has(i) && G.revealed[idx(c.x, c.y)]) d.set([255, 70, 70, 255], idx(c.x, c.y) * 4); });
    this.ctx.putImageData(img, 0, 0);
    // camera rect
    const tl = R.screenToWorld(0, 0), br = R.screenToWorld(R.w, R.h);
    this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 1;
    this.ctx.strokeRect(tl.x / TILE, tl.y / TILE, (br.x - tl.x) / TILE, (br.y - tl.y) / TILE);
  },
};

function resetState() {
  G.ents = new Map(); G.nextId = 1;
  G.inv = {}; G.unlockedB = new Set(); G.unlockedR = new Set(); G.milestones = new Set(); G.phase = 0; G.alts = new Set();
  G.shards = 0; G.hardDrives = 0; G.mamChoice = null; G.coupons = 0; G.points = 0; G.pointsTotal = 0; G.couponsPrinted = 0;
  G.slugsTaken = new Set(); G.crashesOpened = new Set(); G.treesCut = new Set();
  G.tracked = null; G.tutorial = 0; G.ach = new Set(); G.won = false;
  G.credits = 0; G.creditsTotal = 0; G.demand = {}; G.orders = []; G.hot = null; G.ordersDone = 0; G.itemsSold = 0;
}

const Main = {
  last: 0, acc: 0, uiT: 0, saveT: 0, achT: 0, miniT: 0, paused: false, unlockCount: 0,

  async boot() {
    await SDK.init();
    SDK.loadingStart();
    R.init($('#game'));
    let offline = null;
    const saved = SDK.load(SAVE_KEY);
    if (saved) {
      try {
        const s = deserialize(saved);
        offline = this.computeOffline(s);
      } catch (e) {
        console.warn('Save could not be loaded, starting new game', e);
        SDK.save(SAVE_KEY + '_bak', saved);
        resetState();
        newGame();
      }
    } else newGame();
    R.cam.x = G.cx * TILE; R.cam.y = G.cy * TILE; R.cam.z = window.innerWidth < 700 ? 0.8 : 1.1;
    UI.init();
    Input.init($('#game'));
    Minimap.init();
    ensureOrders();
    this.unlockCount = G.unlockedB.size;
    SDK.onAdStart = () => { this.paused = true; this._wasMuted = Sound.muted; Sound.setMuted(true); };
    SDK.onAdEnd = () => { this.paused = false; Sound.setMuted(!!this._wasMuted); };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (!window.__noSave) saveGame(); SDK.gameplayStop(); }
      else if (!UI.panel) SDK.gameplayStart();
    });
    window.addEventListener('beforeunload', () => { if (!window.__noSave) saveGame(); });
    $('#loading').classList.add('hide');
    setTimeout(() => $('#loading').remove(), 600);
    SDK.loadingStop();
    SDK.gameplayStart();
    if (offline) UI.offlineModal(offline.gains, offline.secs);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  computeOffline(s) {
    const secs = (Date.now() - (s.t || Date.now())) / 1000;
    if (secs < 120) return null;
    const cap = Math.min(secs, 4 * 3600);
    const gains = {};
    let any = false;
    for (const k in G.stats.flow) {
      const n = Math.floor(G.stats.flow[k] / 60 * cap * 0.5);
      if (n >= 1) { gains[k] = n; any = true; }
    }
    const c = Math.floor((G.stats.creditRate || 0) / 60 * cap * 0.5);
    if (c >= 1) { gains.credits = c; any = true; }
    return any ? { gains, secs } : null;
  },

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      const speed = G.overdriveUntil > G.time ? 2 : 1;
      this.acc += dt * speed;
      let steps = 0;
      while (this.acc >= TICK && steps < 12) { simTick(TICK); this.acc -= TICK; steps++; }
      if (steps >= 12) this.acc = 0;
      G.playTime += dt;
    }
    Input.frame(dt);
    UI.frame(dt);
    R.updateParticles(dt);
    this.processEvents();

    this.uiT += dt;
    if (this.uiT > 0.3) {
      this.uiT = 0;
      if (G.unlockedB.size !== this.unlockCount) { this.unlockCount = G.unlockedB.size; UI.refreshToolbar(); }
      UI.update(G.dirty.ui);
      G.dirty.ui = false;
      tutorialCheck();
    }
    this.achT += dt;
    if (this.achT > 2) { this.achT = 0; checkAchievements(); }
    this.miniT += dt;
    if (this.miniT > 0.5) { this.miniT = 0; Minimap.draw(); }
    this.saveT += dt;
    if (this.saveT > 30) { this.saveT = 0; if (!window.__noSave) saveGame(); }

    R.draw(now / 1000, UI);
    requestAnimationFrame((t) => this.loop(t));
  },

  processEvents() {
    const evs = G.events;
    if (!evs.length) return;
    G.events = [];
    for (const ev of evs) {
      switch (ev.type) {
        case 'error': UI.toast(T(ev.key), 'bad'); Sound.sfx.error(); break;
        case 'float': R.addFloat(ev.x * TILE, ev.y * TILE, ev.text, ev.color, ev.item); break;
        case 'toast': UI.toast(ev.text); break;
        case 'coupon': Sound.sfx.coupon(); UI.toast('🎟 +1 ' + T('coupons'), 'good'); break;
        case 'raid':
          Sound.sfx.alarm();
          UI.toast(`⚔ ${T('raidStarted', L(RIVAL.name))}${G.autoDefend ? ' · 🛡 ' + T('defendersOut') : ''}`, 'bad');
          break;
        case 'battleEnd': {
          const b = ev.b;
          if (ev.kind === 'raid') UI.toast(`${ev.repelled ? '🛡 ' + T('raidRepelled') : '⚔ ' + T('raidOver')} · ☠ ${b.kills} · 💰 +${fmt(b.loot)}${b.damaged ? ' · 🔧 ' + b.damaged : ''}${b.stolen ? ' · -' + fmt(b.stolen) + ' 💰' : ''}`, ev.repelled ? 'good' : 'bad');
          else UI.toast(`⚔ ${T('attackOver')} · 🏚 ${b.destroyed || 0} · ☠ ${b.kills} · 💰 +${fmt(b.loot)}`, 'good');
          if (ev.repelled || ev.kind === 'attack') SDK.happytime();
          break;
        }
        case 'hqDown':
          Sound.sfx.phase(); this.confetti(); SDK.happytime();
          UI.modal(`<h2 class="victory">🏴 ${T('hqDownTitle')}</h2><p>${T('hqDownText', fmt(ev.loot))}</p><div class="modal-btns"><button class="btn primary" data-act="modal-close">${T('continue')}</button></div>`);
          break;
        case 'rivalFound':
          Sound.sfx.alarm();
          UI.toast(`☠ ${T('rivalFoundToast', L(RIVAL.name))}`, 'bad');
          break;
        case 'order': Sound.sfx.coupon(); UI.toast(`📦 ${T('orderDone')} 💰 +${fmt(ev.reward)}${ev.coupon ? ' · 🎟 +1' : ''}`, 'good'); break;
        case 'ach': UI.toast('🏆 ' + T('achUnlocked', ev.name), 'ach'); Sound.sfx.collect(); break;
        case 'milestone': {
          Sound.sfx.milestone();
          UI.toast('✅ ' + T('milestoneDone', ev.name), 'big');
          const un = UI.unlockIcons(ev.m);
          if (un) UI.toast('🔓 ' + T('newUnlock') + '<div class="unlocks">' + un + '</div>', 'good');
          SDK.happytime();
          this.confetti();
          this.hubUpgradeFx();
          saveGame();
          break;
        }
        case 'phase': {
          Sound.sfx.phase();
          SDK.happytime();
          this.confetti();
          saveGame();
          if (ev.final) {
            UI.modal(`<h2 class="victory">🚀 ${T('victory')}</h2><p>${T('victoryText')}</p><div class="modal-btns"><button class="btn primary" data-act="modal-close">${T('continue')}</button></div>`);
          } else {
            const tiers = PHASES[ev.n - 1].tiers.map(t => L(TIER_NAMES[t])).join(', ');
            UI.modal(`<h2>🚀 ${T('phaseDone', ev.n)}</h2><p>${T('unlocks')}: <b>${tiers}</b></p><div class="modal-btns"><button class="btn primary" data-act="modal-close">${T('continue')}</button></div>`);
          }
          UI._afterModal = () => SDK.midgame();
          break;
        }
      }
    }
  },

  // HUB grows a module each milestone: play the upgrade effect and announce what was added
  hubUpgradeFx() {
    R.hubFx = performance.now() / 1000;
    const lv = hubLevel();
    const hub = [...G.ents.values()].find(e => e.kind === 'hub');
    if (hub) R.addFloat((hub.x + 2) * TILE, hub.y * TILE - 10, `HUB Lv ${lv}  +${HUB_MW_PER_LEVEL} MW`, '#ffd23f');
    const mod = HUB_MODULES.find(m => m.at === lv);
    const stage = HUB_STAGES.find(st => st.at === lv && st.at > 0);
    const parts = [];
    if (stage) parts.push(`<b>${L(stage.name)}</b>`);
    if (mod) parts.push(L(mod.name));
    UI.toast(`🏗 ${T('hubUpgraded', lv)}${parts.length ? ': ' + parts.join(' · ') : ''} (+${HUB_MW_PER_LEVEL} MW)`, 'good');
  },

  confetti() {
    const hub = [...G.ents.values()].find(e => e.kind === 'hub');
    const x = hub ? (hub.x + 2) * TILE : R.cam.x, y = hub ? (hub.y + 2) * TILE : R.cam.y;
    for (let i = 0; i < 40; i++) R.spawn('spark', x, y);
    const c = $('#confetti');
    c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
  },
};

window.addEventListener('load', () => { Main.boot(); });
