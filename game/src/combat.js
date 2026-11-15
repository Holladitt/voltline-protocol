// VOLTLINE PROTOCOL — combat.js
import { CFG } from './config.js';
import { rayWalls, hasLOS } from './map.js';
import { emit, radio } from './state.js';

function botBoxes(b, body, head) {
  const h = b.crouch ? 1.15 : 1.72;
  body.x0 = b.x - 0.38; body.x1 = b.x + 0.38;
  body.z0 = b.z - 0.38; body.z1 = b.z + 0.38;
  body.y0 = 0; body.y1 = h - 0.34;
  head.x0 = b.x - 0.21; head.x1 = b.x + 0.21;
  head.z0 = b.z - 0.21; head.z1 = b.z + 0.21;
  head.y0 = h - 0.34; head.y1 = h;
}
const _body = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0 };
const _head = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0 };

function rayHitBox(ox, oy, oz, dx, dy, dz, maxD, b) {
  let tmin = 0, tmax = maxD;
  const mins = [b.x0, b.y0, b.z0], maxs = [b.x1, b.y1, b.z1];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mins[i] || o[i] > maxs[i]) return -1; }
    else {
      let t1 = (mins[i] - o[i]) / d[i], t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function rayShoot(s, ox, oy, oz, dx, dy, dz, maxD, targets) {
  const wall = rayWalls(ox, oy, oz, dx, dy, dz, maxD);
  let best = wall, bestEnt = null, bestHead = false;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive) continue;
    botBoxes(t, _body, _head);
    const tb = rayHitBox(ox, oy, oz, dx, dy, dz, best, _body);
    if (tb >= 0 && tb < best) { best = tb; bestEnt = t; bestHead = false; }
    const th = rayHitBox(ox, oy, oz, dx, dy, dz, best, _head);
    if (th >= 0 && th < best) { best = th; bestEnt = t; bestHead = true; }
  }
  return { ent: bestEnt, head: bestHead, dist: best, wall };
}

export function calcDamage(w, dist, head, target) {
  let dmg = head ? w.head : w.body;
  const start = w.falloff[0], floor = w.falloff[1];
  if (dist > start) {
    const k = Math.min(1, (dist - start) / 25);
    dmg *= 1 - (1 - floor) * k;
  }
  if (target.armor > 0) {
    if (head && target.helm) dmg *= (1 - CFG.ARMOR.headRed);
    else if (!head) dmg *= (1 - CFG.ARMOR.bodyRed);
  }
  return Math.max(1, Math.round(dmg));
}

export function applyDamage(s, victim, dmg, attacker, head, weaponId) {
  if (!victim.alive) return false;
  victim.hp -= dmg;
  if (victim.team) victim.hitFlashT = 0.08;
  const died = victim.hp <= 0;
  if (died) {
    victim.hp = 0; victim.alive = false; victim.deaths++;
    if (attacker) {
      attacker.kills++;
      if (attacker === s.player) {
        s.player.money = Math.min(CFG.MONEY.cap, s.player.money + CFG.MONEY.kill);
        s.roundStats.kills++; s.roundStats.money += CFG.MONEY.kill;
      } else if (attacker.money !== undefined) {
        attacker.money = Math.min(CFG.MONEY.cap, attacker.money + CFG.MONEY.kill);
      }
    }
    const aName = attacker === s.player ? 'YOU' : (attacker ? attacker.name : '?');
    const vName = victim === s.player ? 'YOU' : victim.name;
    s.killfeed.unshift({ a: aName, b: vName, w: weaponId, head, t: s.time });
    if (s.killfeed.length > 4) s.killfeed.pop();
    emit(s, 'kill', { attacker: aName, victim: vName, head, weapon: weaponId });
    if (attacker && attacker !== s.player && attacker.name) {
      radio(s, `${attacker.name}: ENEMY DOWN — ${vName}`);
    }
    if (victim === s.player) emit(s, 'playerDead', {});
  }
  return died;
}

export function damageDir(s, fromX, fromZ) {
  const p = s.player;
  return Math.atan2(fromX - p.x, fromZ - p.z) - p.yaw;
}

export function losClear(x1, y1, z1, x2, y2, z2) { return hasLOS(x1, y1, z1, x2, y2, z2); }
