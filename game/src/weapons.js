// VOLTLINE PROTOCOL — weapons.js
// Senjata: data dari config, tembakan pemain (hitscan + spread + recoil),
// reload, ganti slot, dan tembakan bot (akurasi berbasis jarak & kesulitan).
// Spread: diam < jalan (2.5-4x) < crouch -20-30%; 0.25 dtk settle setelah berhenti.
import { CFG } from './config.js';
import { rayShoot, calcDamage, applyDamage } from './combat.js';
import { curWeapon, emit, newWeaponState } from './state.js';

const D2R = Math.PI / 180;

// Spread efektif (derajat) untuk senjata w pada kondisi gerak tertentu.
export function spreadDeg(w, moveMag, crouch, settleT, bloom) {
  let sp = w.spread[0];
  if (moveMag > 0.5) sp = w.spread[1];
  else if (crouch) sp = w.spread[2];
  if (settleT > 0) sp += (w.spread[1] - w.spread[0]) * (settleT / 0.25) * 0.6;
  return sp + bloom;
}

// Arah tembak dari yaw/pitch + deviasi acak dalam kerucut spread (derajat).
// Tulis ke out {x,y,z} — tanpa alokasi.
export function aimDir(yaw, pitch, spread, out) {
  const a = (Math.random() - 0.5) * 2 * spread * D2R;
  const b = (Math.random() - 0.5) * 2 * spread * D2R;
  const y = yaw + a, p = pitch + b;
  out.x = -Math.sin(y) * Math.cos(p);
  out.y = Math.sin(p);
  out.z = -Math.cos(y) * Math.cos(p);
  return out;
}
const _dir = { x: 0, y: 0, z: 0 };
const _foes = []; // scratch target list, dipakai ulang tiap tembakan

// Bisakah senjata menembak sekarang (fire rate, mag, reload)?
export function canFire(ws, now) {
  const w = CFG.WEAPONS[ws.id];
  if (ws.reloading > 0 || ws.mag <= 0) return false;
  return now - ws.lastShot >= 60 / w.rpm;
}

// Satu peluru pemain. targets = bot musuh yang hidup. Kembalikan 'shot'|'dry'|'no'.
export function firePlayer(s, now) {
  const p = s.player;
  const ws = curWeapon(s);
  if (!ws) return 'no';
  if (ws.mag <= 0) { emit(s, 'dryfire', {}); return 'dry'; }
  if (!canFire(ws, now)) return 'no';
  const w = CFG.WEAPONS[ws.id];
  ws.lastShot = now;
  ws.mag--;
  ws.shots++;
  ws.spreadBloom = Math.min(2.5, ws.spreadBloom + (w.id === 'senja12' ? 1.2 : 0.35));
  p.spreadBloom = ws.spreadBloom;
  const eyeY = p.y + (p.crouch ? CFG.PLAYER.eyeCrouch : CFG.PLAYER.eye);
  const sp = spreadDeg(w, p.moveMag, p.crouch, p.settleT, ws.spreadBloom);
  _foes.length = 0;
  for (const b of s.bots) if (b.team === 'foe' && b.alive) _foes.push(b);
  const foes = _foes;
  let hitAny = false, hitHead = false, killed = false, totalDmg = 0;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    aimDir(p.yaw, p.pitch, sp, _dir);
    const r = rayShoot(s, p.x, eyeY, p.z, _dir.x, _dir.y, _dir.z, 120, foes);
    const hx = p.x + _dir.x * r.dist, hy = eyeY + _dir.y * r.dist, hz = p.z + _dir.z * r.dist;
    emit(s, 'tracer', { x0: p.x, y0: eyeY, z0: p.z, x1: hx, y1: hy, z1: hz, foe: false });
    if (r.ent) {
      const dmg = calcDamage(w, r.dist, r.head, r.ent);
      r.ent._phits = (r.ent._phits || 0) + 1; r.ent._phitsT = s.time; // hit pemain ke-2 = teman berhenti
      p.dmg += dmg; totalDmg += dmg;
      const died = applyDamage(s, r.ent, dmg, p, r.head, ws.id);
      hitAny = true; hitHead = hitHead || r.head; killed = killed || died;
      emit(s, 'hit', { x: hx, y: hy, z: hz, head: r.head, dmg, killed: died });
    } else {
      emit(s, 'impact', { x: hx, y: hy, z: hz, wall: r.dist >= r.wall - 0.01 });
    }
  }
  emit(s, 'shot', { id: ws.id, own: true, x: p.x, y: eyeY, z: p.z, moving: p.moveMag > 0.5 });
  if (hitAny) {
    p.hitmarkT = 0.25; p.hitmarkHead = hitHead; p.hitmarkKill = killed;
    emit(s, 'hitmark', { head: hitHead, kill: killed });
  }
  if (ws.mag === 0) emit(s, 'empty', { id: ws.id });
  return 'shot';
}

// Tembakan satu bot ke target (pemain atau bot). Akurasi = kesulitan x jarak x gerak.
// Bot membidik dengan error sudut; raycast yang menentukan kena/tidak — tanpa wallhack.
export function fireBot(s, b, target, now) {
  const ws = b.weapon;
  const w = CFG.WEAPONS[ws.id];
  if (ws.mag <= 0) { startReloadBot(s, b); return; }
  if (now - ws.lastShot < 60 / w.rpm) return;
  ws.lastShot = now; ws.mag--; ws.shots++;
  const d = CFG.DIFF[s.diff];
  const dx = target.x - b.x, dz = target.z - b.z;
  const dist = Math.hypot(dx, dz);
  // Akurasi dasar turun 12% tiap +10 m, -18% bila bot bergerak.
  let acc = d.acc * Math.max(0.15, 1 - 0.12 * Math.max(0, (dist - 15) / 10));
  if (b.moving) acc *= 0.82;
  const baseSpread = w.spread[0] * d.spread;
  // Error sudut: makin kecil acc makin besar error. 1 sigma ~ (1-acc) * 2.2 derajat.
  const err = (1 - acc) * 2.4 + baseSpread;
  const eyeY = b.y + (b.crouch ? 1.12 : 1.55);
  const ty = target.y + (target.crouch ? 0.9 : 1.35);
  // Bidik kepala dengan peluang = headshot share (cap per kesulitan).
  const aimHead = Math.random() < d.hs;
  const aimY = aimHead ? target.y + (target.crouch ? 1.0 : 1.6) : ty;
  const yaw = Math.atan2(-(target.x - b.x), -(target.z - b.z));
  const pitch = Math.atan2(aimY - eyeY, dist);
  const targets = target === s.player ? [s.player] : [target];
  let hitAny = false;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    aimDir(yaw, pitch, err, _dir);
    const r = rayShoot(s, b.x, eyeY, b.z, _dir.x, _dir.y, _dir.z, 120, targets);
    const hx = b.x + _dir.x * r.dist, hy = eyeY + _dir.y * r.dist, hz = b.z + _dir.z * r.dist;
    emit(s, 'tracer', { x0: b.x, y0: eyeY, z0: b.z, x1: hx, y1: hy, z1: hz, foe: b.team === 'foe' });
    if (r.ent) {
      const dmg = calcDamage(w, r.dist, r.head, r.ent);
      b.dmg += dmg;
      const died = applyDamage(s, r.ent, dmg, b, r.head, ws.id);
      if (r.ent === s.player) {
        s.player.dmgDir = Math.atan2(b.x - s.player.x, b.z - s.player.z) - s.player.yaw;
        s.player.dmgDirT = 0.6; s.player.lastHitBy = b.id;
        emit(s, 'playerHit', { dmg, head: r.head, from: b.id });
      }
      emit(s, 'hit', { x: hx, y: hy, z: hz, head: r.head, dmg, killed: died });
      hitAny = true;
    } else {
      emit(s, 'impact', { x: hx, y: hy, z: hz, wall: r.dist >= r.wall - 0.01 });
    }
  }
  emit(s, 'shot', { id: ws.id, own: false, x: b.x, y: eyeY, z: b.z, dist, botId: b.id });
  return hitAny;
}

// Reload pemain: shotgun per-shell, sisanya sekali jalan.
export function startReload(s) {
  const ws = curWeapon(s);
  if (!ws || ws.reloading > 0 || ws.mag >= CFG.WEAPONS[ws.id].mag) return false;
  if (CFG.WEAPONS[ws.id].reserve !== -1 && ws.reserve <= 0) return false;
  ws.reloading = CFG.WEAPONS[ws.id].reload;
  ws.reloadT = CFG.WEAPONS[ws.id].reload;
  emit(s, 'reload', { id: ws.id });
  return true;
}
export function startReloadBot(s, b) {
  const ws = b.weapon, w = CFG.WEAPONS[ws.id];
  if (ws.reloading > 0 || ws.mag >= w.mag) return;
  ws.reloading = w.reload; ws.reloadT = w.reload;
  emit(s, 'reloadBot', { id: b.id, dist: Math.hypot(b.x - s.player.x, b.z - s.player.z) });
}
// Majukan timer reload; isi magasin saat selesai.
export function tickReload(ws, dt) {
  if (ws.reloading <= 0) return;
  ws.reloading -= dt;
  const w = CFG.WEAPONS[ws.id];
  if (ws.reloading > 0) return;
  if (w.perShell) {
    ws.mag += 1;
    if (w.reserve !== -1) ws.reserve -= 1;
    if (ws.mag < w.mag && (w.reserve === -1 || ws.reserve > 0)) ws.reloading = w.reload;
  } else {
    const need = w.mag - ws.mag;
    const take = w.reserve === -1 ? need : Math.min(need, ws.reserve);
    ws.mag += take;
    if (w.reserve !== -1) ws.reserve -= take;
  }
  ws.spreadBloom = 0;
}

export function giveWeapon(s, id) {
  const p = s.player;
  p.primary = newWeaponState(id);
  p.slot = 'primary';
  emit(s, 'bought', { id });
}
export function giveBotWeapon(b, id) {
  b.weapon = newWeaponState(id);
  b.weaponId = id;
}
