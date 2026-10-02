// Rival faction (AI) and battles: raids on the player, player attacks on the rival base.
'use strict';

G.rival = null;
G.units = [];
G.unitId = 1;
G.battle = null;
G.autoDefend = true;
G.combatLog = [];

const RIVAL_BUILD_ORDER = ['turret', 'factory', 'power', 'turret', 'factory', 'turret', 'power', 'turret'];

function rivalLevel() { return 1 + Math.floor(G.milestones.size / 4) + G.phase; }
function rivalArming() { return G.phase >= 1; }
function raidsEnabled() { return G.rival && G.phase >= RIVAL.raidPhase && G.rival.hqDownUntil <= G.time; }
function militaryUnlocked() { return G.milestones.has('m3_munitions'); }
function logCombat(text) { G.combatLog.unshift({ t: Date.now(), text }); G.combatLog.length = Math.min(G.combatLog.length, 12); }

// ---------- Rival base ----------
function rivalInit(spot) {
  G.rival = {
    x: spot.x, y: spot.y, discovered: false,
    stock: { infantry: 2, drone: 0, tank: 0 }, prod: { infantry: 0, drone: 0, tank: 0 },
    structs: [], nextId: 1, buildT: 0, built: 0, nextRaid: 0, raids: 0, hqDownUntil: 0,
  };
  rivalPlace('hq', spot.x - 2, spot.y - 2);
  rivalPlace('factory', spot.x + 3, spot.y - 1) || rivalPlace('factory', spot.x - 6, spot.y - 1);
  rivalPlace('turret', spot.x - 1, spot.y + 3) || rivalPlace('turret', spot.x - 1, spot.y - 5);
}

function rivalStructAt(x, y) {
  if (!G.rival) return null;
  for (const s of G.rival.structs) if (x >= s.x && y >= s.y && x < s.x + s.size && y < s.y + s.size) return s;
  return null;
}

function rivalFree(x, y, size) {
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const tx = x + i, ty = y + j;
    if (!inBounds(tx, ty)) return false;
    const k = idx(tx, ty);
    if (G.terr[k] === TERR.WATER || G.terr[k] === TERR.ROCK || G.occ[k] || G.nodeAt[k] >= 0) return false;
    if (rivalStructAt(tx, ty)) return false;
  }
  return true;
}

function rivalPlace(type, x, y) {
  const d = RIVAL.structs[type];
  if (!rivalFree(x, y, d.size)) return null;
  const s = { id: G.rival.nextId++, type, x, y, size: d.size, hp: d.hp, maxHp: d.hp, cd: 0 };
  G.rival.structs.push(s);
  for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) {
    const k = idx(x + i, y + j);
    if (G.trees[k]) { G.trees[k] = 0; markChunk(x + i, y + j); }
  }
  return s;
}

function rivalHQ() { return G.rival && G.rival.structs.find(s => s.type === 'hq'); }
function rivalCenter() { return { x: G.rival.x, y: G.rival.y }; }

function rivalPower() {
  const st = G.rival.stock;
  return Math.round(st.infantry * UNITS.infantry.power + st.drone * UNITS.drone.power + st.tank * UNITS.tank.power
    + G.rival.structs.filter(s => s.type === 'turret').length * 4);
}

function tickRival(dt) {
  const r = G.rival;
  if (!r) return;
  // discovered once any HQ tile is revealed
  if (!r.discovered) {
    const hq = rivalHQ();
    if (hq && G.revealed[idx(hq.x + 2, hq.y + 2)]) { r.discovered = true; reveal(r.x, r.y, 12); emit('rivalFound', {}); logCombat(T('log_found')); }
  }
  if (r.hqDownUntil > G.time) return;
  if (r.hqDownUntil && !rivalHQ()) {
    // regrouped: rebuild the HQ
    r.hqDownUntil = 0;
    const s = rivalPlace('hq', r.x - 2, r.y - 2);
    if (!s) { const hq = { id: r.nextId++, type: 'hq', x: r.x - 2, y: r.y - 2, size: 4, hp: RIVAL.structs.hq.hp, maxHp: RIVAL.structs.hq.hp, cd: 0 }; r.structs.push(hq); }
    emit('toast', { text: '⚠ ' + T('rivalBack') });
    logCombat(T('rivalBack'));
  }
  if (!rivalArming()) return;
  const lv = rivalLevel();
  const fac = 1 + 0.3 * r.structs.filter(s => s.type === 'factory').length;
  const m = dt / 60 * fac;
  r.prod.infantry += m * 0.6 * lv;
  if (lv >= 4) r.prod.drone += m * 0.2 * lv;
  if (lv >= 7) r.prod.tank += m * 0.05 * lv;
  const caps = { infantry: 15 + 8 * lv, drone: 3 * lv, tank: lv };
  for (const k in r.prod) {
    while (r.prod[k] >= 1) { r.prod[k] -= 1; if (r.stock[k] < caps[k]) r.stock[k]++; }
  }
  // expansion
  r.buildT += dt;
  if (r.buildT >= RIVAL.buildEvery && r.structs.length < RIVAL.maxStructs) {
    r.buildT = 0;
    const type = RIVAL_BUILD_ORDER[r.built % RIVAL_BUILD_ORDER.length];
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 7;
      if (rivalPlace(type, Math.round(r.x + Math.cos(a) * d - 1), Math.round(r.y + Math.sin(a) * d - 1))) { r.built++; break; }
    }
  }
  // slow repairs outside of battle
  if (!G.battle) for (const s of r.structs) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.004 * dt);
  // raids
  if (raidsEnabled()) {
    if (!r.nextRaid) r.nextRaid = G.time + RIVAL.firstRaidDelay;
    if (!G.battle && G.time >= r.nextRaid) startRaid();
  }
}

// ---------- Units ----------
function spawnUnit(team, type, x, y, mode) {
  const d = UNITS[type];
  const u = { id: G.unitId++, team, type, x, y, hp: d.hp, maxHp: d.hp, cd: Math.random() * 0.5, mode, target: null, anim: Math.random() * 10 };
  G.units.push(u);
  return u;
}

function hubCenter() {
  const hub = [...G.ents.values()].find(e => e.kind === 'hub');
  return hub ? { x: hub.x + 2, y: hub.y + 2 } : { x: G.cx, y: G.cy };
}

// What the player can field right now from storage
function availableArmy() {
  let ammo = Math.floor(G.inv.ammo || 0);
  const tank = Math.min(Math.floor(G.inv.tank || 0), Math.floor(ammo / UNITS.tank.items.ammo));
  ammo -= tank * UNITS.tank.items.ammo;
  const infantry = Math.min(Math.floor(G.inv.rifle || 0), Math.floor(ammo / UNITS.infantry.items.ammo));
  const drone = Math.floor(G.inv.combat_drone || 0);
  return { infantry, drone, tank };
}
function armyPower(a) { return a.infantry * UNITS.infantry.power + a.drone * UNITS.drone.power + a.tank * UNITS.tank.power; }
function turretCount() { let n = 0; for (const e of G.ents.values()) if (e.kind === 'turret' && !e.broken) n++; return n; }

function deployArmy(mode) {
  const a = availableArmy();
  const h = hubCenter();
  let n = 0;
  for (const type of ['tank', 'drone', 'infantry']) {
    for (let i = 0; i < a[type]; i++) {
      for (const k in UNITS[type].items) G.inv[k] -= UNITS[type].items[k];
      const ang = Math.random() * Math.PI * 2;
      spawnUnit('p', type, h.x + Math.cos(ang) * 3, h.y + Math.sin(ang) * 3, mode);
      n++;
    }
  }
  if (n >= 30) unlockAch('army_30');
  return n;
}

function startRaid() {
  const r = G.rival;
  r.raids++;
  const nr = r.raids;
  const comp = {
    infantry: Math.max(3, Math.min(r.stock.infantry, 3 + nr * 3)),
    drone: nr >= 3 ? Math.min(r.stock.drone, nr - 2) : 0,
    tank: nr >= 6 ? Math.min(r.stock.tank, Math.floor((nr - 4) / 2)) : 0,
  };
  const c = rivalCenter();
  for (const type in comp) {
    r.stock[type] = Math.max(0, r.stock[type] - comp[type]);
    for (let i = 0; i < comp[type]; i++) spawnUnit('r', type, c.x + (Math.random() - 0.5) * 6, c.y + (Math.random() - 0.5) * 6, 'raid');
  }
  // raiders can carry off at most 15% of your credits per raid
  G.battle = { kind: 'raid', t0: G.time, kills: 0, losses: 0, damaged: 0, stolen: 0, stealCap: Math.floor(G.credits * 0.15), loot: 0, enemies: comp };
  if (!r.discovered) { r.discovered = true; reveal(c.x, c.y, 12); }
  r.nextRaid = G.time + RIVAL.raidEvery[0] + Math.random() * (RIVAL.raidEvery[1] - RIVAL.raidEvery[0]);
  emit('raid', { comp });
  logCombat(T('log_raid', comp.infantry + comp.drone + comp.tank));
  if (G.autoDefend) deployArmy('defend');
}

function launchAttack() {
  if (!G.rival || !G.rival.discovered || G.battle || !rivalHQ()) return false;
  const n = deployArmy('attack');
  if (!n) { emit('error', { key: 'noArmy' }); return false; }
  G.battle = { kind: 'attack', t0: G.time, kills: 0, losses: 0, destroyed: 0, loot: 0, defended: false, sent: n };
  logCombat(T('log_attack', n));
  emit('toast', { text: '⚔ ' + T('attackLaunched', n) });
  return true;
}

// ---------- Targets & damage ----------
function entCenter(e) { return { x: e.x + e.size / 2, y: e.y + e.size / 2 }; }
function maxHpOf(e) { return e.kind === 'turret' ? TURRET.hp : e.kind === 'hub' ? 1e9 : 60 * e.size * e.size + 40; }
const RAID_TARGET_KINDS = { machine: 1, miner: 1, gen: 1, turret: 1, hub: 1, sink: 1, market: 1, radar: 1, uploader: 1, elevator: 1 };

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

function findTarget(u, aggro) {
  let best = null, bd = aggro * aggro;
  for (const o of G.units) {
    if (o.team === u.team || o.hp <= 0) continue;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bd) { bd = d; best = { unit: o }; }
  }
  if (best) return best;
  if (u.team === 'p') {
    if (u.mode !== 'attack') return null;
    for (const s of G.rival.structs) {
      const cx = s.x + s.size / 2, cy = s.y + s.size / 2;
      const d = Math.max(0, Math.sqrt(dist2(u.x, u.y, cx, cy)) - s.size / 2);
      if (d * d < bd) { bd = d * d; best = { struct: s }; }
    }
    return best;
  }
  // rival units: nearest player building within aggro
  const r = Math.ceil(aggro);
  const ux = Math.floor(u.x), uy = Math.floor(u.y);
  const seen = new Set();
  for (let y = uy - r; y <= uy + r; y++) for (let x = ux - r; x <= ux + r; x++) {
    if (!inBounds(x, y)) continue;
    const id = G.occ[idx(x, y)];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const e = G.ents.get(id);
    if (!RAID_TARGET_KINDS[e.kind] || e.broken) continue;
    const c = entCenter(e);
    const d = Math.max(0, Math.sqrt(dist2(u.x, u.y, c.x, c.y)) - e.size / 2);
    if (d * d < bd) { bd = d * d; best = { ent: e }; }
  }
  return best;
}

function targetPos(t) {
  if (t.unit) return { x: t.unit.x, y: t.unit.y, r: 0 };
  if (t.struct) return { x: t.struct.x + t.struct.size / 2, y: t.struct.y + t.struct.size / 2, r: t.struct.size / 2 };
  const c = entCenter(t.ent);
  return { x: c.x, y: c.y, r: t.ent.size / 2 };
}
function targetAlive(t) {
  if (!t) return false;
  if (t.unit) return t.unit.hp > 0 && G.units.includes(t.unit);
  if (t.struct) return t.struct.hp > 0 && G.rival.structs.includes(t.struct);
  return G.ents.get(t.ent.id) === t.ent && !t.ent.broken;
}

function hit(attacker, t, dmg, fromX, fromY, team) {
  const p = targetPos(t);
  R.addTracer(fromX, fromY, p.x, p.y, team === 'p' ? '#7fd4ff' : '#ff6a5a', attacker === 'tank' || attacker === 'turret-heavy');
  Sound.sfx.shot();
  if (t.unit) t.unit.hp -= dmg;
  else if (t.struct) {
    t.struct.hp -= dmg;
    if (t.struct.hp <= 0) destroyStruct(t.struct);
  } else {
    const e = t.ent;
    if (e.kind === 'hub') {
      const left = G.battle && G.battle.stealCap != null ? G.battle.stealCap - G.battle.stolen : 0;
      const steal = Math.max(0, Math.min(Math.floor(G.credits), 15 + rivalLevel() * 5, left));
      if (steal > 0) { G.credits -= steal; if (G.battle) G.battle.stolen += steal; if (Math.random() < 0.3) emit('float', { x: p.x, y: p.y - 2, text: '-' + steal + ' 💰', color: '#ff6a5a' }); }
      return;
    }
    if (e.hp == null) e.hp = maxHpOf(e);
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.hp = 0; e.broken = true; e.active = false;
      if (G.battle) G.battle.damaged++;
      R.explode(p.x, p.y, 1.2);
      emit('float', { x: p.x, y: p.y - 1, text: '💥 ' + T('status_broken'), color: '#ff6a5a' });
    }
  }
}

function splash(u, cx, cy, radius, dmg) {
  for (const o of G.units) {
    if (o.team === u.team || o.hp <= 0) continue;
    if (dist2(o.x, o.y, cx, cy) <= radius * radius) o.hp -= dmg;
  }
}

function destroyStruct(s) {
  const r = G.rival;
  r.structs = r.structs.filter(o => o !== s);
  const d = RIVAL.structs[s.type];
  const loot = Math.round(d.loot * rivalLevel());
  earn(loot);
  if (G.battle) { G.battle.destroyed = (G.battle.destroyed || 0) + 1; G.battle.loot += loot; }
  R.explode(s.x + s.size / 2, s.y + s.size / 2, s.size * 0.9);
  Sound.sfx.boom();
  emit('float', { x: s.x + s.size / 2, y: s.y, text: '+' + fmt(loot) + ' 💰', color: '#ffd23f' });
  logCombat(T('log_destroyed', L(d.name), fmt(loot)));
  if (s.type === 'hq') {
    r.hqDownUntil = G.time + RIVAL.hqRegroup;
    r.stock = { infantry: 0, drone: 0, tank: 0 };
    G.hardDrives++; G.shards += 2;
    unlockAch('rival_hq');
    emit('hqDown', { loot });
  }
}

function returnUnit(u) {
  if (u.team === 'p') {
    for (const k in UNITS[u.type].items) if (k !== 'ammo') addInv(k, UNITS[u.type].items[k]);
  } else G.rival.stock[u.type]++;
}

// ---------- Battle tick ----------
function tickCombat(dt) {
  if (!G.rival) return;
  tickRival(dt);
  const units = G.units;
  const home = hubCenter();
  const rc = rivalCenter();
  for (const u of units) {
    if (u.hp <= 0) continue;
    const d = UNITS[u.type];
    u.cd -= dt;
    u.anim += dt;
    // retreat / return logic
    if (u.mode === 'raid' && G.battle && G.time - G.battle.t0 > RIVAL.raidTimeout) u.mode = 'retreat';
    let goal = null;
    if (u.mode === 'return' || u.mode === 'retreat') {
      goal = u.team === 'p' ? home : rc;
      if (dist2(u.x, u.y, goal.x, goal.y) < 4) { returnUnit(u); u.hp = -1; u.gone = true; continue; }
    }
    if (u.mode !== 'return' && u.mode !== 'retreat') {
      if (!targetAlive(u.target) || Math.random() < 0.05) u.target = findTarget(u, d.range + 3);
    } else u.target = null;
    if (u.target) {
      const p = targetPos(u.target);
      const dd = Math.sqrt(dist2(u.x, u.y, p.x, p.y)) - p.r;
      if (dd <= d.range) {
        if (u.cd <= 0) {
          u.cd = 1 / d.rof;
          hit(u.type, u.target, d.dmg, u.x, u.y, u.team);
          if (d.splash) splash(u, p.x, p.y, d.splash, d.dmg * 0.5);
        }
        continue;
      }
      goal = p;
    }
    if (!goal) {
      if (u.mode === 'raid') goal = home;
      else if (u.mode === 'attack') {
        // head for the HQ, or the nearest remaining structure; go home when the base is cleared
        const hq = rivalHQ();
        let tgt = hq;
        if (!tgt) { let bd = Infinity; for (const s of G.rival.structs) { const q = dist2(u.x, u.y, s.x + s.size / 2, s.y + s.size / 2); if (q < bd) { bd = q; tgt = s; } } }
        if (tgt) goal = { x: tgt.x + tgt.size / 2, y: tgt.y + tgt.size / 2 };
        else if (!units.some(o => o.team === 'r' && o.hp > 0)) { u.mode = 'return'; goal = home; }
      }
      else if (u.mode === 'defend') {
        // chase the closest raider anywhere on the map
        let best = null, bd = Infinity;
        for (const o of units) if (o.team !== u.team && o.hp > 0) { const q = dist2(u.x, u.y, o.x, o.y); if (q < bd) { bd = q; best = o; } }
        goal = best || home;
        if (!best) u.mode = 'return';
      } else if (u.mode === 'guard') goal = null;
    }
    if (goal) {
      const dx = goal.x - u.x, dy = goal.y - u.y, L2 = Math.hypot(dx, dy);
      if (L2 > 0.05) { const s = Math.min(L2, d.speed * dt); u.x += dx / L2 * s; u.y += dy / L2 * s; u.dir = Math.atan2(dy, dx); }
    }
  }
  // rival defenders appear when attackers get close to the base
  if (G.battle && G.battle.kind === 'attack' && !G.battle.defended && rivalHQ()) {
    if (units.some(u => u.team === 'p' && u.hp > 0 && dist2(u.x, u.y, rc.x, rc.y) < 16 * 16)) {
      G.battle.defended = true;
      const st = G.rival.stock;
      for (const type of ['infantry', 'drone', 'tank']) {
        for (let i = 0; i < st[type]; i++) spawnUnit('r', type, rc.x + (Math.random() - 0.5) * 8, rc.y + (Math.random() - 0.5) * 8, 'guard');
        st[type] = 0;
      }
      emit('toast', { text: '⚠ ' + T('rivalDefends') });
    }
  }
  // turrets (player)
  for (const e of G.ents.values()) {
    if (e.kind !== 'turret') continue;
    if (e.broken) { e.status = 'broken'; continue; }
    e.cd = (e.cd || 0) - dt;
    const c = entCenter(e);
    let best = null, bd = TURRET.range * TURRET.range;
    for (const o of units) if (o.team === 'r' && o.hp > 0) { const q = dist2(c.x, c.y, o.x, o.y); if (q < bd) { bd = q; best = o; } }
    e.aim = best ? Math.atan2(best.y - c.y, best.x - c.x) : e.aim;
    e.status = best ? ((G.inv.ammo || 0) >= 1 ? 'working' : 'noammo') : ((G.inv.ammo || 0) >= 1 ? 'idle' : 'noammo');
    e.active = !!best;
    if (best && e.cd <= 0 && (G.inv.ammo || 0) >= 1) {
      G.inv.ammo -= 1;
      e.cd = 1 / TURRET.rof;
      hit('turret', { unit: best }, TURRET.dmg, c.x, c.y, 'p');
      e.kills = (e.kills || 0) + (best.hp <= 0 ? 1 : 0);
    }
  }
  // turrets (rival)
  for (const s of G.rival.structs) {
    if (s.type !== 'turret') continue;
    const d = RIVAL.structs.turret;
    s.cd -= dt;
    const cx = s.x + 1, cy = s.y + 1;
    let best = null, bd = d.range * d.range;
    for (const o of units) if (o.team === 'p' && o.hp > 0) { const q = dist2(cx, cy, o.x, o.y); if (q < bd) { bd = q; best = o; } }
    if (best) s.aim = Math.atan2(best.y - cy, best.x - cx);
    if (best && s.cd <= 0) { s.cd = 1 / d.rof; hit('turret', { unit: best }, d.dmg, cx, cy, 'r'); }
  }
  // remove dead units
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.hp > 0) continue;
    units.splice(i, 1);
    if (u.gone) continue;
    R.explode(u.x, u.y, u.type === 'tank' ? 1.2 : 0.6);
    if (u.type !== 'infantry') Sound.sfx.boom();
    if (u.team === 'r') {
      const b = Math.round(UNITS[u.type].bounty * (1 + rivalLevel() * 0.1));
      earn(b);
      if (G.battle) { G.battle.kills++; G.battle.loot += b; }
    } else if (G.battle) G.battle.losses++;
  }
  // battle end
  const b = G.battle;
  if (b) {
    const reds = units.filter(u => u.team === 'r' && u.mode !== 'retreat' && u.mode !== 'return');
    const blues = units.filter(u => u.team === 'p' && u.mode !== 'return');
    if (b.kind === 'raid' && !reds.length) {
      units.forEach(u => { if (u.team === 'p') u.mode = 'return'; });
      const repelled = !units.some(u => u.team === 'r');
      if (repelled && b.kills > 0) unlockAch('first_defense');
      emit('battleEnd', { kind: 'raid', repelled, b });
      logCombat(T(repelled ? 'log_repelled' : 'log_raidOver', b.kills, b.losses, b.damaged));
      G.battle = null;
    } else if (b.kind === 'attack' && !blues.length) {
      units.forEach(u => { if (u.team === 'r') u.mode = 'return'; if (u.team === 'p') u.mode = 'return'; });
      emit('battleEnd', { kind: 'attack', b });
      logCombat(T('log_attackOver', b.kills, b.losses, b.destroyed || 0, fmt(b.loot)));
      G.battle = null;
    }
  }
}

// When nothing is attacking, attackers who ran out of targets head home
function recallArmy() {
  G.units.forEach(u => { if (u.team === 'p') u.mode = 'return'; });
}

function repairCost(e) {
  const c = {};
  const base = BUILDINGS[e.type].cost;
  for (const k in base) c[k] = Math.max(1, Math.ceil(base[k] * 0.25));
  return c;
}
function repairEnt(e) {
  const c = repairCost(e);
  if (!canAfford(c)) { emit('error', { key: 'notEnough' }); return false; }
  pay(c);
  e.broken = false; e.hp = maxHpOf(e);
  return true;
}
function repairAll() {
  let n = 0;
  for (const e of G.ents.values()) if (e.broken && canAfford(repairCost(e))) { pay(repairCost(e)); e.broken = false; e.hp = maxHpOf(e); n++; }
  return n;
}

// Save helpers: units in the field are folded back into storage / rival stock
function combatSave() {
  const inv = {}, stock = Object.assign({}, G.rival ? G.rival.stock : {});
  for (const u of G.units) {
    if (u.team === 'p') {
      for (const k in UNITS[u.type].items) if (k !== 'ammo') inv[k] = (inv[k] || 0) + UNITS[u.type].items[k];
    } else stock[u.type] = (stock[u.type] || 0) + 1;
  }
  const rv = G.rival ? Object.assign({}, G.rival, { stock }) : null;
  return { rv, inv, ad: G.autoDefend, log: G.combatLog.slice(0, 8) };
}
