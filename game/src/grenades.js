// VOLTLINE PROTOCOL — grenades.js
import { CFG } from './config.js';
import { collides, hasLOS } from './map.js';
import { emit } from './state.js';

export function throwGrenade(s, owner, kind, ox, oy, oz, yaw, pitch) {
  const speed = 13;
  s.nades.push({
    x: ox, y: oy, z: oz,
    vx: -Math.sin(yaw) * Math.cos(pitch) * speed,
    vy: Math.sin(pitch) * speed + 2.2,
    vz: -Math.cos(yaw) * Math.cos(pitch) * speed,
    kind, owner, t: 0, bounced: 0,
  });
  emit(s, 'throw', { kind, own: owner === s.player });
}

export function tickNades(s, dt) {
  for (let i = s.nades.length - 1; i >= 0; i--) {
    const n = s.nades[i];
    n.t += dt;
    n.vy -= 12 * dt;
    const nx = n.x + n.vx * dt, ny = n.y + n.vy * dt, nz = n.z + n.vz * dt;
    if (!collides(nx, n.y, 0.16, n.y)) n.x = nx; else { n.vx *= -0.35; n.bounced++; }
    if (ny < 0.12) { n.y = 0.12; n.vy = Math.abs(n.vy) * 0.35; n.bounced++; }
    else if (!collides(n.x, n.z, 0.16, ny)) n.y = ny; else { n.vy *= -0.35; n.bounced++; }
    if (!collides(n.x, nz, 0.16, n.y)) n.z = nz; else { n.vz *= -0.35; n.bounced++; }
    const landed = n.y <= 0.13 && Math.abs(n.vy) < 1.5;
    if ((n.kind === 'smoke' && (landed || n.bounced >= 2)) || (n.kind === 'flash' && n.t >= 0.8)) {
      detonate(s, n);
      s.nades.splice(i, 1);
    }
  }
  for (let i = s.smokes.length - 1; i >= 0; i--) {
    s.smokes[i].t += dt;
    if (s.smokes[i].t >= s.smokes[i].dur) s.smokes.splice(i, 1);
  }
}

function detonate(s, n) {
  if (n.kind === 'smoke') {
    s.smokes.push({ x: n.x, y: 0.4, z: n.z, t: 0, dur: CFG.GRENADES.smoke.dur, r: CFG.GRENADES.smoke.radius });
    emit(s, 'smoke', { x: n.x, y: 0.4, z: n.z });
  } else {
    s.flashes.push({ x: n.x, y: n.y, z: n.z, t: 0 });
    emit(s, 'flash', { x: n.x, y: n.y, z: n.z });
    applyFlash(s, n.x, n.y, n.z);
  }
}

export function applyFlash(s, x, y, z) {
  const g = CFG.GRENADES.flash;
  const all = [s.player, ...s.bots];
  for (const e of all) {
    if (!e.alive) continue;
    const dx = x - e.x, dy = y - (e.y + 1.4), dz = z - e.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > g.range) continue;
    if (!hasLOS(e.x, e.y + 1.4, e.z, x, y, z)) continue;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const dot = (dx * fx + dz * fz) / (Math.max(0.01, Math.hypot(dx, dz)));
    if (dot < Math.cos((g.cone / 2) * Math.PI / 180)) continue;
    const strength = 1 - (dist / g.range) * 0.6;
    e.flashT = Math.max(e.flashT, g.dur * strength);
    e.flashFull = Math.max(e.flashFull || 0, g.dur * strength);
    if (e === s.player) emit(s, 'flashed', { strength });
  }
}

export function segmentInSmoke(s, x1, y1, z1, x2, y2, z2) {
  for (const sm of s.smokes) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, pz = z1 + (z2 - z1) * t;
      const dx = px - sm.x, dy = py - sm.y, dz = pz - sm.z;
      if (dx * dx + dy * dy + dz * dz < sm.r * sm.r) return true;
    }
  }
  return false;
}

export function pointInSmoke(s, x, y, z) {
  for (const sm of s.smokes) {
    const dx = x - sm.x, dy = y - sm.y, dz = z - sm.z;
    if (dx * dx + dy * dy + dz * dz < sm.r * sm.r) return true;
  }
  return false;
}
