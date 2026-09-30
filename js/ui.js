// DOM user interface + canvas overlays (ghosts, selection).
'use strict';

function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  if (a >= 100 || Number.isInteger(n)) return String(Math.floor(n));
  return n.toFixed(1).replace(/\.0$/, '');
}
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}
const $ = (s) => document.querySelector(s);

const OVERDRIVE_TIME = 180, OVERDRIVE_CD = 300, SUPPLY_CD = 240;

const UI = {
  tool: null,          // building type or 'decon'
  rot: 0,
  cat: 'logistics',
  hover: null,         // tile {x,y}
  selected: null,      // entity id
  panel: null,
  beltPath: null,
  copyRecipe: null,
  crafting: null,      // {id, t}
  lastHTML: {},
  tipIdx: 0,
  holdInspect: false,

  init() {
    this.buildStatic();
    this.bind();
    this.refreshToolbar();
    this.update(true);
    setInterval(() => { this.tipIdx++; }, 12000);
  },

  buildStatic() {
    $('#sidebar').innerHTML = [
      ['hub', '🏠', 'H'], ['elevator', '🚀', 'E'], ['inv', '📦', 'I'], ['mam', '💾', 'M'], ['shop', '🎟', 'K'], ['ach', '🏆', 'J'],
    ].map(([p, ic, k]) => `<button class="side-btn" data-act="open" data-arg="${p}" title=""><span class="side-ico">${ic}</span><span class="side-key">${k}</span><span class="badge" id="badge-${p}"></span></button>`).join('');
    this.applyTitles();
  },

  applyTitles() {
    const titles = { hub: T('milestones'), elevator: T('elevator'), inv: T('inventory'), mam: T('mam'), shop: T('shop'), ach: T('achievements') };
    document.querySelectorAll('.side-btn').forEach(b => { b.title = titles[b.dataset.arg]; });
    $('#btnSettings').title = T('settings');
    $('#loadingText').textContent = T('loading');
  },

  bind() {
    document.body.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-act]');
      if (!a) return;
      Sound.ensure();
      this.action(a.dataset.act, a.dataset.arg, a);
    });
    // hand craft hold
    document.body.addEventListener('pointerdown', (ev) => {
      const c = ev.target.closest('[data-craft]');
      if (c) { this.crafting = { id: c.dataset.craft, t: 0 }; ev.preventDefault(); }
      if (ev.target.closest('#inspect')) this.holdInspect = true;
      // don't swap DOM under a pressed button (the click would be lost)
      if (ev.target.id !== 'game') this.holdUI = true;
    });
    window.addEventListener('pointerup', () => {
      this.crafting = null; this.holdInspect = false;
      setTimeout(() => { this.holdUI = false; }, 0);
    });
    document.body.addEventListener('input', (ev) => {
      const s = ev.target.closest('[data-clock]');
      if (!s) return;
      const e = ent(this.selected);
      if (!e) return;
      const v = Math.min(parseFloat(s.value) / 100, maxClock(e));
      e.clock = Math.max(0.01, v);
      s.value = Math.round(e.clock * 100);
      const lbl = $('#clockLabel'); if (lbl) lbl.textContent = Math.round(e.clock * 100) + '%';
    });
    $('#cats').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (!b) return;
      this.cat = b.dataset.cat;
      Sound.sfx.click();
      this.refreshToolbar();
    });
    $('#tools').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tool]');
      if (!b) return;
      Sound.ensure();
      this.selectTool(b.dataset.tool);
    });
    $('#tools').addEventListener('pointerover', (ev) => {
      const b = ev.target.closest('[data-tool]');
      if (b) this.showToolTip(b.dataset.tool, b);
    });
    $('#tools').addEventListener('pointerout', () => this.hideTip());
  },

  // ---------- Actions ----------
  action(act, arg, el) {
    switch (act) {
      case 'open': this.openPanel(this.panel === arg ? null : arg); Sound.sfx.click(); break;
      case 'close': this.openPanel(null); break;
      case 'close-inspect': this.selected = null; this.renderInspect(); break;
      case 'ms-complete':
        if (completeMilestone(arg)) this.renderPanel(true);
        break;
      case 'ms-track': G.tracked = G.tracked === arg ? null : arg; Sound.sfx.click(); this.renderPanel(true); this.renderGoal(true); break;
      case 'goal-complete': {
        if (arg) { completeMilestone(arg); break; }
        const g = currentGoal();
        if (g && g.type === 'milestone') completeMilestone(g.m.id);
        else if (g && g.type === 'phase') { if (!elevatorBuilt()) this.toast(T('buildElevatorFirst'), 'bad'); else submitPhase(); }
        break;
      }
      case 'phase-submit': submitPhase(); this.renderPanel(true); break;
      case 'alt-choose': if (chooseAlt(arg || null)) { Sound.sfx.milestone(); this.toast('💾 ' + T('altUnlocked') + ': ' + (arg ? recipeName(arg) : '+3 💎'), 'good'); this.renderPanel(true); } break;
      case 'shop-buy': this.shopBuy(arg); break;
      case 'ad-overdrive': this.adOverdrive(); break;
      case 'ad-supply': this.adSupply(); break;
      case 'set-recipe': {
        const e = ent(this.selected);
        if (e && e.kind === 'machine' && e.recipe !== arg) {
          // return buffered inputs/outputs to storage
          for (const k in e.inb) addInv(k, e.inb[k]);
          for (const k in e.outb) addInv(k, e.outb[k]);
          if (e.crafting && RECIPES[e.recipe]) refund(RECIPES[e.recipe].in);
          e.inb = {}; e.outb = {}; e.crafting = false; e.prog = 0; e.recipe = arg;
          Sound.sfx.click();
          this.renderInspect(true);
        }
        break;
      }
      case 'take-output': {
        const e = ent(this.selected);
        if (!e) break;
        if (e.outb) { for (const k in e.outb) { addInv(k, e.outb[k]); } e.outb = {}; }
        if (e.kind === 'miner' && e.out) { addInv(e.node.type, e.out); e.out = 0; }
        Sound.sfx.collect(); this.renderInspect(true);
        break;
      }
      case 'add-fuel': {
        const e = ent(this.selected);
        if (!e) break;
        const d = def(e);
        let tot = 0; for (const k in e.fuel) tot += e.fuel[k];
        const n = Math.min(G.inv[arg] || 0, d.fuelCap - tot);
        if (n > 0) { G.inv[arg] -= n; e.fuel[arg] = (e.fuel[arg] || 0) + n; Sound.sfx.craft(); }
        else this.toast(T('notEnough'), 'bad');
        this.renderInspect(true);
        break;
      }
      case 'shard': {
        const e = ent(this.selected);
        if (!e) break;
        const want = parseInt(arg, 10);
        const cur = e.shardsUsed || 0;
        const target = want === cur ? want - 1 : want;
        if (target > cur && shardsFree() < target - cur) { this.toast(T('noShards'), 'bad'); break; }
        e.shardsUsed = Math.max(0, target);
        if (target > cur) e.clock = maxClock(e);
        e.clock = Math.min(e.clock, maxClock(e));
        Sound.sfx.click();
        this.renderInspect(true);
        break;
      }
      case 'decon': {
        const e = ent(this.selected);
        if (e && deconstruct(e)) { this.selected = null; this.renderInspect(true); }
        break;
      }
      case 'crash-open': if (openCrash(parseInt(arg, 10))) this.closeModal(); break;
      case 'modal-close': this.closeModal(); break;
      case 'offline-collect': this.collectOffline(1); break;
      case 'offline-x2': SDK.rewarded(ok => this.collectOffline(ok ? 2 : 1)); break;
      case 'lang': I18N.lang = arg; this.applyTitles(); this.refreshToolbar(); this.update(true); this.renderPanel(true); break;
      case 'mute': Sound.setMuted(!Sound.muted); this.renderPanel(true); break;
      case 'save': if (saveGame()) this.toast('💾 ' + T('saved'), 'good'); break;
      case 'reset':
        this.modal(`<h2>🗑 ${T('resetGame')}</h2><p>${T('resetConfirm')}</p>
          <div class="modal-btns"><button class="btn danger" data-act="reset-yes">${T('resetGame')}</button><button class="btn" data-act="modal-close">${T('close')}</button></div>`);
        break;
      case 'reset-yes': SDK.remove(SAVE_KEY); window.__noSave = true; location.reload(); break;
      case 'skip-tut': G.tutorial = TUTORIAL.length; this.renderGoal(true); break;
      case 'decon-tool': this.selectTool(this.tool === 'decon' ? null : 'decon'); break;
      case 'rotate': this.rotate(); break;
      case 'cancel': this.selectTool(null); break;
      case 'settings': this.openPanel(this.panel === 'settings' ? null : 'settings'); break;
    }
  },

  selectTool(t) {
    if (t && t !== 'decon' && this.tool === t) t = null;
    this.tool = t;
    this.beltPath = null;
    this.beltStart = null;
    if (t && BUILDINGS[t] && BUILDINGS[t].kind === 'belt' && (this.beltHints = (this.beltHints || 0) + 1) <= 3) this.toast('🛤 ' + T('beltHint'));
    if (t !== null && t !== this.copiedFor) this.copyRecipe = null;
    if (t) { this.selected = null; this.renderInspect(true); }
    Sound.sfx.click();
    this.refreshToolbar();
  },
  rotate() { this.rot = (this.rot + 1) % 4; Sound.sfx.click(); },

  pipette(tile) {
    const e = entAt(tile.x, tile.y);
    if (!e || e.kind === 'hub' || !G.unlockedB.has(e.type)) return;
    this.tool = e.type; this.rot = e.dir; this.copyRecipe = e.recipe || null; this.copiedFor = e.type;
    this.cat = BUILDINGS[e.type].cat;
    this.refreshToolbar();
    Sound.sfx.click();
  },

  // ---------- Toolbar ----------
  refreshToolbar() {
    $('#cats').innerHTML = CATEGORIES.map(c => {
      const any = Object.keys(BUILDINGS).some(b => BUILDINGS[b].cat === c && G.unlockedB.has(b));
      if (!any) return '';
      return `<button class="cat ${this.cat === c ? 'on' : ''}" data-cat="${c}">${T('cat_' + c)}</button>`;
    }).join('') + `<button class="cat decon ${this.tool === 'decon' ? 'on' : ''}" data-act="decon-tool">✖ ${T('deconstruct')} <kbd>X</kbd></button>`;
    const list = this.toolList();
    $('#tools').innerHTML = list.map((b, i) => {
      const afford = canAfford(BUILDINGS[b].cost);
      return `<button class="tool ${this.tool === b ? 'on' : ''} ${afford ? '' : 'poor'}" data-tool="${b}">
        <img src="${R.buildingIcon(b)}" alt=""><span class="key">${i + 1}</span></button>`;
    }).join('');
    $('#mobileCtl').classList.toggle('show', !!this.tool);
  },
  toolList() { return Object.keys(BUILDINGS).filter(b => BUILDINGS[b].cat === this.cat && G.unlockedB.has(b)); },

  updateToolAfford() {
    document.querySelectorAll('#tools [data-tool]').forEach(b => {
      b.classList.toggle('poor', !canAfford(BUILDINGS[b.dataset.tool].cost));
    });
  },

  costHTML(cost, mult) {
    mult = mult || 1;
    return Object.keys(cost).map(k => {
      const need = cost[k] * mult, have = G.inv[k] || 0;
      return `<span class="cost ${have >= need ? 'ok' : 'no'}">${Icons.img(k)}${fmt(need)}</span>`;
    }).join('');
  },

  showToolTip(b, el) {
    const d = BUILDINGS[b];
    const r = el.getBoundingClientRect();
    const tip = $('#tooltip');
    let extra = '';
    if (d.power) extra += `<div class="muted">⚡ ${d.power} MW</div>`;
    if (d.gen) extra += `<div class="good">⚡ +${d.gen} MW</div>`;
    tip.innerHTML = `<b>${L(d.name)}</b><div class="muted">${L(d.desc)}</div>${extra}<div class="costs">${this.costHTML(d.cost)}</div>`;
    tip.style.display = 'block';
    this.tipKind = 'tool';
    tip.style.left = Math.min(window.innerWidth - 270, Math.max(8, r.left + r.width / 2 - 130)) + 'px';
    tip.style.top = '';
    tip.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  },
  showWorldTip(html, sx, sy) {
    const tip = $('#tooltip');
    if (!html) { this.hideTip(); return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    this.tipKind = 'world';
    tip.style.bottom = '';
    tip.style.left = Math.min(window.innerWidth - 270, sx + 16) + 'px';
    tip.style.top = Math.min(window.innerHeight - 120, sy + 16) + 'px';
  },
  hideTip() { $('#tooltip').style.display = 'none'; this.tipKind = null; },

  // ---------- Periodic update ----------
  update(force) {
    const p = G.power;
    const ratio = p.cap > 0 ? p.demand / p.cap : 1;
    $('#powerText').textContent = `${fmt(p.demand)} / ${fmt(p.cap)} MW`;
    const bar = $('#powerBar');
    bar.style.width = Math.min(100, ratio * 100) + '%';
    bar.style.background = ratio > 1 ? '#ff5a5a' : ratio > 0.85 ? '#ffcc4d' : '#5ad17a';
    $('#lowpower').textContent = '⚠ ' + T('lowPower');
    $('#lowpower').classList.toggle('show', p.factor < 0.999);
    $('#shardsText').textContent = `${shardsFree()}/${G.shards}`;
    $('#shardsPill').title = T('shards');
    $('#couponText').textContent = G.coupons;
    $('#couponPill').title = T('coupons');
    // overdrive button
    const now = Date.now() / 1000;
    const ob = $('#btnOverdrive');
    if (G.overdriveUntil > G.time) { ob.textContent = `⏩ ${T('overdriveActive')} ${fmtTime((G.overdriveUntil - G.time) / 2)}`; ob.className = 'btn-ad active'; }
    else if ((G.cooldowns.overdrive || 0) > now) { ob.textContent = `⏩ ${T('cooldown', fmtTime(G.cooldowns.overdrive - now))}`; ob.className = 'btn-ad cd'; }
    else { ob.textContent = window.innerWidth < 600 ? '⏩ x2 📺' : `⏩ ${T('overdrive')} x2 📺`; ob.className = 'btn-ad'; }
    ob.title = T('overdriveDesc');
    // badges
    const canMs = MILESTONES.some(m => milestoneState(m) === 'open' && canAfford(m.cost));
    this.badge('hub', canMs ? '!' : '');
    const ph = PHASES[G.phase];
    this.badge('elevator', ph && elevatorBuilt() && canAfford(ph.cost) ? '!' : '');
    this.badge('mam', G.hardDrives ? String(G.hardDrives) : '');
    this.badge('shop', G.coupons ? String(G.coupons) : '');
    document.querySelector('[data-arg="elevator"].side-btn').style.display = G.unlockedB.has('space_elevator') ? '' : 'none';
    document.querySelector('[data-arg="shop"].side-btn').style.display = G.unlockedB.has('sink') || G.coupons ? '' : 'none';
    this.updateToolAfford();
    this.renderGoal(force);
    this.renderPanel(force);
    if (!this.holdInspect) this.renderInspect(force);
  },
  badge(p, v) { const b = $('#badge-' + p); if (b) { b.textContent = v; b.style.display = v ? '' : 'none'; } },

  setHTML(el, key, html, force) {
    if (!force && (this.holdUI || this.lastHTML[key] === html)) return;
    this.lastHTML[key] = html;
    el.innerHTML = html;
  },

  // ---------- Goal card ----------
  renderGoal(force) {
    const el = $('#goal');
    let html = '';
    if (G.tutorial < TUTORIAL.length) {
      const st = TUTORIAL[G.tutorial];
      html = `<div class="goal-head">🎯 ${T('goal')} <span class="muted">${G.tutorial + 1}/${TUTORIAL.length}</span><a class="skip" data-act="skip-tut">${T('skipTutorial')}</a></div>
        <div class="goal-text">${L(st.text)}</div>`;
      const m = st.ms && MILESTONES.find(o => o.id === st.ms);
      if (m && !G.milestones.has(m.id)) {
        const g = this.goalRows(m.cost);
        html += `<div class="goal-name small">${L(m.name)}</div>${g.rows}
          <button class="btn ${g.all ? 'primary pulse' : ''}" data-act="goal-complete" data-arg="${m.id}" ${g.all ? '' : 'disabled'}>${T('complete')}</button>`;
      }
    } else {
      const g = currentGoal();
      if (g) {
        const r = this.goalRows(g.cost);
        const blocked = g.type === 'phase' && !elevatorBuilt();
        const ok = r.all && !blocked;
        html = `<div class="goal-head">🎯 ${T('goal')}${G.tracked ? ' 📌' : ''}</div><div class="goal-name">${g.name}</div>${r.rows}
          ${blocked ? `<div class="muted small">${T('buildElevatorFirst')}</div>` : ''}
          <button class="btn ${ok ? 'primary pulse' : ''}" data-act="goal-complete" data-arg="${g.type === 'milestone' ? g.m.id : ''}" ${ok ? '' : 'disabled'}>${T('complete')}</button>`;
      } else {
        html = `<div class="goal-head">🏆 ${T('victory')}</div>`;
      }
    }
    const tips = STR.tips[I18N.lang] || STR.tips.en;
    html += `<div class="tip">${tips[this.tipIdx % tips.length]}</div>`;
    this.setHTML(el, 'goal', html, force);
  },

  // Progress bars for a cost, with a "how to get it" line under items nothing is producing yet
  goalRows(cost) {
    let all = true, hints = 0;
    const rows = Object.keys(cost).map(k => {
      const have = G.inv[k] || 0, need = cost[k];
      if (have < need) all = false;
      const rate = G.stats.flow[k];
      let row = `<div class="goal-row" title="${L(ITEMS[k].name)}">${Icons.img(k)}<div class="gbar"><div style="width:${Math.min(1, have / need) * 100}%"></div><span>${fmt(Math.min(have, need))} / ${fmt(need)}</span></div><span class="rate">${rate ? '+' + fmt(rate) + T('perMin') : ''}</span></div>`;
      if (have < need && !rate && hints < 3) {
        hints++;
        row += `<div class="hint">💡 <b>${L(ITEMS[k].name)}:</b> ${this.itemHint(k)}</div>`;
      }
      return row;
    }).join('');
    return { rows, all };
  },

  itemHint(k) {
    if (k === 'leaves' || k === 'wood') return T('hint_tree');
    if (NODE_TYPES[k]) return T('hint_mine', L(ITEMS[k].name));
    const ids = Object.keys(RECIPES).filter(id => RECIPES[id].out[k] && (RECIPES[id].alt ? G.alts.has(id) : G.unlockedR.has(id)));
    if (!ids.length) return T('hint_locked');
    const id = ids.find(i => !RECIPES[i].alt) || ids[0];
    const r = RECIPES[id];
    const ins = Object.keys(r.in).map(i => L(ITEMS[i].name)).join(' + ');
    if (!G.unlockedB.has(r.m)) return T('hint_hand', recipeName(id), ins);
    return T('hint_recipe', L(BUILDINGS[r.m].name), recipeName(id), ins) + ', ' + T('hint_belt');
  },

  // ---------- Panels ----------
  openPanel(p) {
    this.panel = p;
    if (p && this.selected) { this.selected = null; this.renderInspect(true); }
    $('#panel').classList.toggle('show', !!p);
    if (p) this.renderPanel(true);
    if (p) SDK.gameplayStop(); else SDK.gameplayStart();
  },

  renderPanel(force) {
    if (!this.panel) return;
    const titles = { hub: T('milestones'), elevator: T('elevator'), inv: T('inventory'), mam: T('mam'), shop: T('shop'), ach: T('achievements'), settings: T('settings') };
    $('#panelTitle').textContent = titles[this.panel];
    let html = '';
    switch (this.panel) {
      case 'hub': html = this.hubHTML(); break;
      case 'elevator': html = this.elevatorHTML(); break;
      case 'inv': html = this.invHTML(); break;
      case 'mam': html = this.mamHTML(); break;
      case 'shop': html = this.shopHTML(); break;
      case 'ach': html = this.achHTML(); break;
      case 'settings': html = this.settingsHTML(); break;
    }
    this.setHTML($('#panelBody'), 'panel', html, force);
  },

  unlockIcons(m) {
    const b = m.b.map(x => `<span class="unl" title="${L(BUILDINGS[x].name)}"><img src="${R.buildingIcon(x)}" alt="">${L(BUILDINGS[x].name)}</span>`).join('');
    const r = m.r.map(x => `<span class="unl" title="${recipeName(x)}">${Icons.img(recipeMainOut(x))}${recipeName(x)}</span>`).join('');
    const s = m.shards ? `<span class="unl">💎 +${m.shards}</span>` : '';
    return b + r + s;
  },

  hubHTML() {
    let html = `<p class="muted">${T('hubDesc')}</p>`;
    for (let tier = 0; tier < TIER_PHASE.length; tier++) {
      const ms = MILESTONES.filter(m => m.tier === tier);
      if (!ms.length) continue;
      const locked = tier > 0 && (!tier0Done() || G.phase < TIER_PHASE[tier]);
      const lockText = tier > 0 && !tier0Done() ? T('requiresTier0') : T('requiresPhase', TIER_PHASE[tier]);
      html += `<h3 class="tier-h">${L(TIER_NAMES[tier])} ${locked ? `<span class="lock">🔒 ${lockText}</span>` : ''}</h3><div class="ms-grid">`;
      for (const m of ms) {
        const st = milestoneState(m);
        const afford = canAfford(m.cost);
        html += `<div class="ms ${st}">
          <div class="ms-name">${st === 'done' ? '✅ ' : st === 'locked' ? '🔒 ' : ''}${L(m.name)}</div>
          ${st !== 'done' ? `<div class="costs">${this.costHTML(m.cost)}</div>` : ''}
          <div class="unlocks">${this.unlockIcons(m)}</div>
          ${st === 'open' ? `<div class="ms-btns"><button class="btn ${afford ? 'primary' : ''}" data-act="ms-complete" data-arg="${m.id}" ${afford ? '' : 'disabled'}>${T('complete')}</button>
            <button class="btn small ${G.tracked === m.id ? 'on' : ''}" data-act="ms-track" data-arg="${m.id}">📌 ${G.tracked === m.id ? T('tracking') : T('track')}</button></div>` : ''}
        </div>`;
      }
      html += '</div>';
    }
    return html;
  },

  elevatorHTML() {
    let html = `<p class="muted">${T('elevatorDesc')}</p>`;
    if (!elevatorBuilt()) html += `<div class="notice">🚧 ${T('buildElevatorFirst')}</div>`;
    PHASES.forEach((p, i) => {
      const done = i < G.phase, cur = i === G.phase;
      const tiers = p.tiers.map(t => L(TIER_NAMES[t])).join(', ');
      html += `<div class="phase ${done ? 'done' : cur ? 'cur' : 'locked'}">
        <div class="ms-name">${done ? '✅' : cur ? '🚀' : '🔒'} ${T('phase')} ${i + 1} ${tiers ? `<span class="muted">→ ${T('unlocks')}: ${tiers}</span>` : p.final ? `<span class="muted">→ 🏁</span>` : ''}</div>`;
      if (cur) {
        html += Object.keys(p.cost).map(k => {
          const have = G.inv[k] || 0, need = p.cost[k];
          return `<div class="goal-row">${Icons.img(k)}<span class="nm">${L(ITEMS[k].name)}</span><div class="gbar"><div style="width:${Math.min(1, have / need) * 100}%"></div><span>${fmt(Math.min(have, need))} / ${fmt(need)}</span></div></div>`;
        }).join('');
        const ok = elevatorBuilt() && canAfford(p.cost);
        html += `<button class="btn ${ok ? 'primary pulse' : ''}" data-act="phase-submit" ${ok ? '' : 'disabled'}>${T('submit')}</button>`;
      }
      html += '</div>';
    });
    if (G.phase >= PHASES.length) html += `<div class="notice good">🏆 ${T('allPhasesDone')}</div>`;
    return html;
  },

  invHTML() {
    const keys = Object.keys(ITEMS).filter(k => (G.inv[k] || 0) > 0 || G.stats.flow[k]);
    let html = `<div class="inv-wrap"><div class="inv-col"><h3>${T('storage')}</h3><div class="inv-grid">`;
    html += keys.length ? keys.map(k => {
      const rate = G.stats.flow[k];
      return `<div class="inv-cell" title="${L(ITEMS[k].name)}">${Icons.img(k, 'ico big')}<b>${fmt(G.inv[k] || 0)}</b><span class="nm">${L(ITEMS[k].name)}</span>${rate ? `<span class="rate">+${fmt(rate)}${T('perMin')}</span>` : ''}</div>`;
    }).join('') : `<div class="muted">${T('empty')}</div>`;
    html += `</div></div><div class="inv-col"><h3>${T('handCraft')} <span class="muted small">(${T('hold')})</span></h3><div class="craft-list">`;
    for (const id of handRecipes()) {
      const r = RECIPES[id];
      const ok = canAfford(r.in);
      const outs = Object.keys(r.out).map(k => `${Icons.img(k)}×${r.out[k]}`).join(' ');
      html += `<button class="craft ${ok ? '' : 'poor'}" data-craft="${id}">
        <span class="craft-out">${outs}</span><span class="craft-name">${recipeName(id)}${r.alt ? ` <em class="alt">${T('alt')}</em>` : ''}</span>
        <span class="craft-in">${this.costHTML(r.in)}</span></button>`;
    }
    html += `</div><div id="craftBar" class="craftbar"><div></div></div></div></div>`;
    return html;
  },

  mamHTML() {
    let html = `<p class="muted">${T('noHardDrives')}</p><div class="notice">💾 ${T('hardDrives')}: <b>${G.hardDrives}</b></div>`;
    if (G.hardDrives > 0) {
      const opts = altOptions();
      html += `<h3>${T('chooseAlt')}</h3><div class="ms-grid">`;
      if (!opts.length) html += `<div class="ms"><button class="btn primary" data-act="alt-choose" data-arg="">💎 +3 ${T('shards')}</button></div>`;
      for (const id of opts) html += `<div class="ms">${this.recipeCard(id)}<button class="btn primary" data-act="alt-choose" data-arg="${id}">${T('analyze')}</button></div>`;
      html += '</div>';
    }
    if (G.alts.size) {
      html += `<h3>${T('altUnlocked')}</h3><div class="ms-grid">`;
      for (const id of G.alts) html += `<div class="ms done">${this.recipeCard(id)}</div>`;
      html += '</div>';
    }
    return html;
  },

  recipeCard(id) {
    const r = RECIPES[id];
    const pm = (q) => fmt(q * 60 / r.t);
    const ins = Object.keys(r.in).map(k => `<span class="cost ok">${Icons.img(k)}${r.in[k]} <small>(${pm(r.in[k])}${T('perMin')})</small></span>`).join('');
    const outs = Object.keys(r.out).map(k => `<span class="cost ok">${Icons.img(k)}${r.out[k]} <small>(${pm(r.out[k])}${T('perMin')})</small></span>`).join('');
    return `<div class="ms-name">${recipeName(id)} <em class="alt">${T('alt')}</em></div><div class="muted small">${L(BUILDINGS[r.m].name)} · ${r.t}s</div>
      <div class="recipe-io">${ins}<span class="arrow">➜</span>${outs}</div>`;
  },

  shopItems() {
    return [
      { id: 'shard', price: 3, name: T('shopShard'), desc: T('shopShardDesc'), ico: '💎' },
      { id: 'drive', price: 8, name: T('shopDrive'), desc: T('shopDriveDesc'), ico: '💾' },
      { id: 'crate', price: 2, name: T('shopCrate'), desc: T('shopCrateDesc'), ico: '📦' },
    ];
  },

  shopHTML() {
    const cost = couponCost();
    let html = `<p class="muted">${T('sinkHelp')}</p>
      <div class="notice">🎟 ${T('coupons')}: <b>${G.coupons}</b> · ${T('points')}: <b>${fmt(G.pointsTotal)}</b> ${G.stats.sinkRate ? `<span class="rate">+${fmt(G.stats.sinkRate)}${T('perMin')}</span>` : ''}
      <div class="goal-row"><span class="nm">${T('couponProgress')}</span><div class="gbar"><div style="width:${Math.min(1, G.points / cost) * 100}%"></div><span>${fmt(G.points)} / ${fmt(cost)}</span></div></div></div><div class="ms-grid">`;
    for (const it of this.shopItems()) {
      html += `<div class="ms"><div class="ms-name">${it.ico} ${it.name}</div><div class="muted small">${it.desc}</div>
        <button class="btn ${G.coupons >= it.price ? 'primary' : ''}" data-act="shop-buy" data-arg="${it.id}" ${G.coupons >= it.price ? '' : 'disabled'}>${T('buy')} – 🎟 ${it.price}</button></div>`;
    }
    const now = Date.now() / 1000;
    const cd = (G.cooldowns.supply || 0) - now;
    html += `<div class="ms ad"><div class="ms-name">📺 ${T('supplyDrop')}</div><div class="muted small">${T('supplyDropDesc')}</div>
      <button class="btn ${cd > 0 ? '' : 'primary'}" data-act="ad-supply" ${cd > 0 ? 'disabled' : ''}>${cd > 0 ? T('cooldown', fmtTime(cd)) : '📺 ' + T('supplyDrop')}</button></div>`;
    html += '</div>';
    return html;
  },

  achHTML() {
    return `<div class="ms-grid">` + ACHIEVEMENTS.map(a => `<div class="ms ${G.ach.has(a.id) ? 'done' : 'locked'}"><div class="ms-name">${G.ach.has(a.id) ? '🏆' : '🔒'} ${L(a.name)}</div><div class="muted small">${L(a.desc)}</div></div>`).join('') + '</div>';
  },

  settingsHTML() {
    return `<div class="settings">
      <div class="row"><span>${T('language')}</span><button class="btn ${I18N.lang === 'en' ? 'on' : ''}" data-act="lang" data-arg="en">English</button><button class="btn ${I18N.lang === 'tr' ? 'on' : ''}" data-act="lang" data-arg="tr">Türkçe</button></div>
      <div class="row"><span>${T('sound')}</span><button class="btn" data-act="mute">${Sound.muted ? '🔇' : '🔊'}</button></div>
      <div class="row"><button class="btn" data-act="save">💾 ${T('saved').split(' ')[0]}</button></div>
      <h3>${T('controls')}</h3><p class="muted">${T('controlsText')}</p>
      <div class="row"><button class="btn danger" data-act="reset">🗑 ${T('resetGame')}</button></div>
    </div>`;
  },

  shopBuy(id) {
    const it = this.shopItems().find(o => o.id === id);
    if (!it || G.coupons < it.price) return;
    G.coupons -= it.price;
    if (id === 'shard') { G.shards++; this.toast('💎 ' + T('gotShards', 1), 'good'); }
    else if (id === 'drive') { G.hardDrives++; this.toast('💾 ' + T('gotHardDrive'), 'good'); }
    else if (id === 'crate') this.giveCrate(0.35);
    Sound.sfx.collect();
    this.renderPanel(true);
  },

  giveCrate(frac) {
    const g = currentGoal();
    const cost = g ? g.cost : { iron_plate: 50 };
    const got = [];
    for (const k in cost) {
      const n = Math.max(1, Math.ceil(cost[k] * frac));
      addInv(k, n);
      got.push(`${Icons.img(k)}+${fmt(n)}`);
    }
    this.toast('📦 ' + got.join(' '), 'good');
  },

  adOverdrive() {
    const now = Date.now() / 1000;
    if (G.overdriveUntil > G.time || (G.cooldowns.overdrive || 0) > now) return;
    SDK.rewarded(ok => {
      if (!ok) return;
      G.overdriveUntil = G.time + OVERDRIVE_TIME * 2; // sim time runs 2x
      G.cooldowns.overdrive = now + OVERDRIVE_TIME + OVERDRIVE_CD;
      Sound.sfx.milestone();
      this.toast('⏩ ' + T('overdriveActive'), 'good');
    });
  },
  adSupply() {
    const now = Date.now() / 1000;
    if ((G.cooldowns.supply || 0) > now) return;
    SDK.rewarded(ok => {
      if (!ok) return;
      G.cooldowns.supply = now + SUPPLY_CD;
      this.giveCrate(0.25);
      Sound.sfx.collect();
      this.renderPanel(true);
    });
  },

  // ---------- Inspect panel ----------
  renderInspect(force) {
    const el = $('#inspect');
    const e = this.selected ? ent(this.selected) : null;
    if (!e) { el.classList.remove('show'); this.lastHTML.inspect = ''; return; }
    el.classList.add('show');
    const d = def(e);
    const st = e.status ? `<span class="status" style="background:${STATUS_COLORS[e.status] || '#555'}">${T('status_' + e.status)}</span>` : '';
    let html = `<div class="insp-head"><img src="${R.buildingIcon(e.type)}" alt=""><div><b>${L(d.name)}</b><br>${st}</div><button class="x" data-act="close-inspect">✕</button></div>`;
    const clockMult = e.clock || 1;
    if (e.kind === 'machine') {
      const rs = recipesFor(e.type);
      html += `<div class="sect">${T('recipe')}</div><div class="recipes">` + rs.map(id =>
        `<button class="rbtn ${e.recipe === id ? 'on' : ''}" data-act="set-recipe" data-arg="${id}" title="${recipeName(id)}">${Icons.img(recipeMainOut(id))}<span>${recipeName(id)}</span>${RECIPES[id].alt ? '<em class="alt">ALT</em>' : ''}</button>`).join('') + '</div>';
      const r = RECIPES[e.recipe];
      if (r) {
        const pm = (q) => fmt(q * 60 / r.t * clockMult);
        html += `<div class="io"><div><div class="sect">${T('input')}</div>` + Object.keys(r.in).map(k => `<div class="io-row">${Icons.img(k)}<span>${fmt(e.inb[k] || 0)}</span><small>${pm(r.in[k])}${T('perMin')}</small></div>`).join('') + `</div>
          <div><div class="sect">${T('output')}</div>` + Object.keys(r.out).map(k => `<div class="io-row">${Icons.img(k)}<span>${fmt(e.outb[k] || 0)}</span><small>${pm(r.out[k])}${T('perMin')}</small></div>`).join('') + `</div></div>
          <div class="gbar thin"><div style="width:${(e.prog / r.t) * 100}%"></div></div>`;
        html += `<button class="btn small" data-act="take-output">${T('takeOutput')}</button>`;
      }
      html += this.clockHTML(e);
    } else if (e.kind === 'miner') {
      if (e.node) {
        const rate = d.rate * PURITY[e.node.purity].mult * clockMult;
        html += `<div class="io-row">${Icons.img(e.node.type)}<b>${L(ITEMS[e.node.type].name)}</b> <span style="color:${PURITY[e.node.purity].color}">${T(PURITY[e.node.purity].key)}</span></div>
          <div class="io-row">${T('produces')}: <b>${fmt(rate)}${T('perMin')}</b> · ${T('output')}: ${e.out}</div>
          <button class="btn small" data-act="take-output">${T('takeOutput')}</button>`;
      }
      html += this.clockHTML(e);
    } else if (e.kind === 'gen') {
      html += `<div class="io-row">⚡ <b>${d.gen} MW</b> · ${Math.round(G.power.load * 100)}%</div>`;
      if (d.fuels) {
        html += `<div class="sect">${T('fuel')}</div>` + Object.keys(d.fuels).map(k => `<div class="io-row">${Icons.img(k)}<span>${fmt(e.fuel[k] || 0)}</span><small>${T('inStorage')}: ${fmt(G.inv[k] || 0)}</small>
          <button class="btn small" data-act="add-fuel" data-arg="${k}">+ ${T('fuel')}</button></div>`).join('');
      }
    } else if (e.kind === 'belt') {
      html += `<div class="io-row">${fmt(d.speed * 120)} ${T('perMin')}</div>`;
    } else if (e.kind === 'hub') {
      html += `<p class="muted small">${L(d.desc)}</p><button class="btn primary" data-act="open" data-arg="hub">${T('openHub')}</button>`;
    } else if (e.kind === 'elevator') {
      html += `<button class="btn primary" data-act="open" data-arg="elevator">${T('elevator')}</button>`;
    } else if (e.kind === 'sink') {
      html += `<p class="muted small">${T('sinkHelp')}</p><button class="btn primary" data-act="open" data-arg="shop">${T('shop')}</button>`;
    } else {
      html += `<p class="muted small">${L(d.desc)}</p>`;
    }
    if (d.power) html += `<div class="muted small">⚡ ${T('consumes')}: ${fmt(d.power * clockPow(clockMult))} MW</div>`;
    if (e.kind !== 'hub') html += `<div class="insp-foot"><button class="btn danger small" data-act="decon">✖ ${T('deconstruct')}</button></div>`;
    this.setHTML(el, 'inspect', html, force);
  },

  clockHTML(e) {
    const mc = maxClock(e);
    let slots = '';
    for (let i = 1; i <= 3; i++) slots += `<button class="shard ${i <= (e.shardsUsed || 0) ? 'on' : ''}" data-act="shard" data-arg="${i}">💎</button>`;
    return `<div class="sect">${T('clock')}: <b id="clockLabel">${Math.round(e.clock * 100)}%</b> <span class="muted small">(max ${Math.round(mc * 100)}%)</span></div>
      <input type="range" min="1" max="250" value="${Math.round(e.clock * 100)}" data-clock>
      <div class="shards"><span class="muted small">${T('shardSlots')}</span>${slots}</div>`;
  },

  // ---------- Modals & toasts ----------
  toast(html, cls) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = html;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
    const all = $('#toasts').children;
    if (all.length > 5) all[0].remove();
  },

  modal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').classList.add('show');
    SDK.gameplayStop();
  },
  closeModal() {
    $('#modal').classList.remove('show');
    if (this._afterModal) { const f = this._afterModal; this._afterModal = null; f(); }
    if (!this.panel) SDK.gameplayStart();
  },

  crashModal(i) {
    const c = G.crashes[i];
    const ok = canAfford(c.cost);
    this.modal(`<h2>💾 ${T('crash').split('–')[0]}</h2><p>${T('crashNeeds')}</p><div class="costs">${this.costHTML(c.cost)}</div>
      <div class="modal-btns"><button class="btn ${ok ? 'primary' : ''}" data-act="crash-open" data-arg="${i}" ${ok ? '' : 'disabled'}>${T('openCrash')}</button><button class="btn" data-act="modal-close">${T('close')}</button></div>`);
  },

  offlineModal(gains, secs) {
    this._offline = gains;
    const list = Object.keys(gains).map(k => `<span class="cost ok">${Icons.img(k)}+${fmt(gains[k])}</span>`).join('');
    this.modal(`<h2>👋 ${T('welcomeBack')}</h2><p>${T('offlineText', fmtTime(secs))}</p><div class="costs">${list}</div>
      <div class="modal-btns"><button class="btn primary" data-act="offline-x2">📺 ${T('collectX2')}</button><button class="btn" data-act="offline-collect">${T('collect')}</button></div>`);
  },
  collectOffline(mult) {
    const g = this._offline;
    if (!g) return;
    this._offline = null;
    for (const k in g) addInv(k, Math.floor(g[k] * mult));
    Sound.sfx.collect();
    this.closeModal();
  },

  // ---------- Canvas overlay ----------
  drawOverlay(ctx, t) {
    const z = R.cam.z;
    const h = this.hover;
    // selection outline
    const sel = this.selected ? ent(this.selected) : null;
    if (sel) {
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2.5 / z;
      ctx.setLineDash([6 / z, 4 / z]); ctx.lineDashOffset = -t * 20 / z;
      ctx.strokeRect(sel.x * TILE - 2, sel.y * TILE - 2, sel.size * TILE + 4, sel.size * TILE + 4);
      ctx.setLineDash([]);
    }
    // tutorial pointer
    this.drawTutorialPointer(ctx, t);
    if (!h) return;
    if (this.tool === 'decon') {
      const e = entAt(h.x, h.y);
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      if (e && e.kind !== 'hub') ctx.fillRect(e.x * TILE, e.y * TILE, e.size * TILE, e.size * TILE);
      else { ctx.strokeStyle = 'rgba(255,90,90,0.8)'; ctx.lineWidth = 2 / z; ctx.strokeRect(h.x * TILE, h.y * TILE, TILE, TILE); }
      return;
    }
    if (this.tool) {
      const d = BUILDINGS[this.tool];
      if (d.kind === 'belt') {
        const path = this.beltPath || [{ x: h.x, y: h.y, dir: this.rot }];
        let cost = 0;
        let count = 0;
        for (const p of path) {
          const ex = entAt(p.x, p.y);
          if (ex && ex.kind !== 'belt') continue;
          const ok = ex ? true : !checkPlace(this.tool, p.x, p.y);
          if (ok) count++;
          if (ok && (!ex || ex.type !== this.tool)) cost++;
          const k = path.indexOf(p);
          const curve = k > 0 && path[k - 1].dir !== p.dir ? (path[k - 1].dir + 2) % 4 : -1;
          ctx.globalAlpha = 0.65;
          R.drawBelt(ctx, { type: this.tool, x: p.x, y: p.y, dir: p.dir }, t, false, curve);
          ctx.globalAlpha = 1;
          ctx.fillStyle = ok ? 'rgba(90,209,122,0.25)' : 'rgba(255,60,60,0.4)';
          ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
          this.drawArrow(ctx, p.x, p.y, p.dir, ok ? '#fff' : '#ff8080');
        }
        if (this.beltStart) {
          const st = this.beltStart;
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3 / z;
          ctx.strokeRect(st.x * TILE + 1, st.y * TILE + 1, TILE - 2, TILE - 2);
          const lx = h.x * TILE + TILE + 4, ly = h.y * TILE - 6;
          ctx.font = `bold ${13 / Math.max(z, 0.6)}px system-ui`; ctx.textAlign = 'left';
          ctx.lineWidth = 3 / z; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(T('beltEnd'), lx, ly);
          ctx.fillStyle = '#ffd23f'; ctx.fillText(T('beltEnd'), lx, ly);
        }
        if (path.length > 1) {
          const last = path[path.length - 1];
          const need = {}; for (const k in d.cost) need[k] = d.cost[k] * cost;
          const ok = canAfford(need);
          ctx.font = `bold ${12 / Math.max(z, 0.6)}px system-ui`; ctx.textAlign = 'left';
          ctx.fillStyle = ok ? '#fff' : '#ff8080';
          ctx.fillText(`${count} × ${L(d.name).split(' ').slice(-1)[0]}`, last.x * TILE + TILE + 4, last.y * TILE + 12);
        }
        return;
      }
      const o = this.placeOrigin(this.tool, h);
      const err = checkPlace(this.tool, o.x, o.y);
      const afford = canAfford(d.cost);
      const ghost = createGhost(this.tool, o.x, o.y, this.rot, this.copyRecipe);
      ctx.globalAlpha = 0.7;
      if (LOGI[d.kind] || d.kind === 'uploader') {
        if (d.kind === 'uploader') R.drawUploader(ctx, ghost, o.x * TILE, o.y * TILE, t);
        else R.drawLogi(ctx, ghost, t);
      } else R.drawBuilding(ctx, ghost, t, true);
      ctx.globalAlpha = 1;
      ctx.fillStyle = !err && afford ? 'rgba(90,209,122,0.22)' : 'rgba(255,60,60,0.35)';
      ctx.fillRect(o.x * TILE, o.y * TILE, d.size * TILE, d.size * TILE);
      if (d.kind === 'splitter') this.drawArrow(ctx, o.x, o.y, this.rot, '#fff');
      // IO hint for machines: show perimeter
      if (!LOGI[d.kind] && z > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 / z; ctx.setLineDash([3 / z, 3 / z]);
        ctx.strokeRect((o.x - 1) * TILE, (o.y - 1) * TILE, (d.size + 2) * TILE, (d.size + 2) * TILE);
        ctx.setLineDash([]);
      }
      // highlight nodes for miners
      if (d.kind === 'miner' || d.geyser) this.highlightNodes(ctx, d, t);
      return;
    }
    // no tool: hover highlight
    const e = entAt(h.x, h.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5 / z;
    if (e) ctx.strokeRect(e.x * TILE, e.y * TILE, e.size * TILE, e.size * TILE);
    else ctx.strokeRect(h.x * TILE, h.y * TILE, TILE, TILE);
  },

  highlightNodes(ctx, d, t) {
    const v = R.view;
    for (const nd of G.nodes) {
      if (nd.x < v.x0 || nd.x > v.x1 || nd.y < v.y0 || nd.y > v.y1) continue;
      const want = d.oil ? nd.type === 'crude_oil' : d.geyser ? nd.type === 'geyser' : nd.type !== 'crude_oil' && nd.type !== 'geyser';
      if (!want || G.occ[idx(nd.x, nd.y)]) continue;
      ctx.strokeStyle = `rgba(90,209,122,${0.5 + Math.sin(t * 5) * 0.4})`;
      ctx.lineWidth = 2 / R.cam.z;
      ctx.beginPath(); ctx.arc(nd.x * TILE + 16, nd.y * TILE + 16, 22, 0, 7); ctx.stroke();
    }
  },

  drawArrow(ctx, x, y, dir, col) {
    ctx.save(); ctx.translate(x * TILE + 16, y * TILE + 16); ctx.rotate(dir * Math.PI / 2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-3, -6); ctx.lineTo(-3, 6); ctx.fill();
    ctx.restore();
  },

  drawTutorialPointer(ctx, t) {
    if (G.tutorial !== 0 && G.tutorial !== 4) return;
    let tx, ty;
    if (G.tutorial === 0) {
      let best = null, bd = 1e9;
      for (const nd of G.nodes) {
        if (nd.type !== 'iron_ore' || G.occ[idx(nd.x, nd.y)]) continue;
        const d = Math.hypot(nd.x - G.cx, nd.y - G.cy);
        if (d < bd) { bd = d; best = nd; }
      }
      if (!best) return;
      tx = best.x * TILE + 16; ty = best.y * TILE;
    } else {
      tx = G.cx * TILE; ty = (G.cy - 2) * TILE;
    }
    const bob = Math.sin(t * 5) * 6;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2 / R.cam.z;
    ctx.beginPath(); ctx.moveTo(tx, ty - 6 + bob); ctx.lineTo(tx - 10, ty - 22 + bob); ctx.lineTo(tx - 4, ty - 22 + bob); ctx.lineTo(tx - 4, ty - 36 + bob);
    ctx.lineTo(tx + 4, ty - 36 + bob); ctx.lineTo(tx + 4, ty - 22 + bob); ctx.lineTo(tx + 10, ty - 22 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
  },

  placeOrigin(type, h) {
    const s = BUILDINGS[type].size;
    const off = Math.floor((s - 1) / 2);
    return { x: h.x - off, y: h.y - off };
  },

  worldTip(tile) {
    if (!tile || !inBounds(tile.x, tile.y)) return '';
    const i = idx(tile.x, tile.y);
    if (!G.revealed[i]) return `<span class="muted">${T('fog')}</span>`;
    const e = entAt(tile.x, tile.y);
    if (e) {
      const d = def(e);
      let s = `<b>${L(d.name)}</b>`;
      if (e.status) s += ` <span class="status" style="background:${STATUS_COLORS[e.status] || '#555'}">${T('status_' + e.status)}</span>`;
      if (e.recipe) s += `<div>${Icons.img(recipeMainOut(e.recipe))} ${recipeName(e.recipe)}</div>`;
      if (e.kind === 'miner' && e.node) s += `<div>${Icons.img(e.node.type)} ${fmt(d.rate * PURITY[e.node.purity].mult * e.clock)}${T('perMin')}</div>`;
      return s;
    }
    const sl = G.slugAt[i];
    if (sl >= 0 && !G.slugsTaken.has(sl)) return T('slug');
    const cr = G.crashAt[i];
    if (cr >= 0 && !G.crashesOpened.has(cr)) return T('crash');
    const ni = G.nodeAt[i];
    if (ni >= 0) {
      const nd = G.nodes[ni];
      const name = nd.type === 'geyser' ? L({ en: 'Geyser', tr: 'Gayzer' }) : L(ITEMS[nd.type].name);
      return `<b>${name}</b> <span style="color:${PURITY[nd.purity].color}">${T(PURITY[nd.purity].key)}</span>${nd.type !== 'crude_oil' && nd.type !== 'geyser' ? `<div class="muted">${T('handMine')}</div>` : ''}`;
    }
    if (G.trees[i]) return T('tree');
    return '';
  },

  // per-frame (hand crafting hold)
  frame(dt) {
    if (this.crafting) {
      const c = this.crafting;
      const r = RECIPES[c.id];
      const bar = document.querySelector('#craftBar div');
      if (!canAfford(r.in)) { if (bar) bar.style.width = '0%'; return; }
      c.t += dt;
      const need = handCraftTime(c.id);
      if (bar) bar.style.width = Math.min(100, c.t / need * 100) + '%';
      if (c.t >= need) {
        c.t = 0;
        handCraft(c.id);
        const outs = Object.keys(r.out).map(k => `+${r.out[k]}`).join(' ');
        void outs;
        this.renderPanel();
      }
    }
  },
};

function createGhost(type, x, y, dir, recipe) {
  const e = createEnt(type, x, y, dir);
  G.nextId--; // ghosts don't consume ids
  if (recipe && RECIPES[recipe] && RECIPES[recipe].m === type) e.recipe = recipe;
  e.status = '';
  return e;
}
