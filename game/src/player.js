// VOLTLINE PROTOCOL — player.js
import { CFG } from './config.js';
import { collides, inSite } from './map.js';
import { emit } from './state.js';

export function tickPlayer(s, cmd, dt) {
  const p = s.player;
  if (!p.alive || s.phase !== 'live') {
    p.vx *= 0.8; p.vz *= 0.8;
    return;
  }
  const wasMoving = p.moveMag > 0.5;
  let speed = CFG.MOVE.run;
  if (cmd.crouch) speed = CFG.MOVE.crouch;
  else if (!cmd.run) speed = CFG.MOVE.walk;
  if (p.ads) speed *= CFG.WEAPONS[s.player.slot === 'primary' && s.player.primary ? s.player.primary.id : 'percik'].slow || 1;
  if (p.plantT > 0 || p.defuseT > 0) speed = 0; // holding E = stand still
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let mx = (-sy * cmd.f) + (cy * cmd.s);
  let mz = (-cy * cmd.f) + (-sy * cmd.s);
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const acc = CFG.MOVE.accel;
  p.vx += mx * acc * dt;
  p.vz += mz * acc * dt;
  const vl = Math.hypot(p.vx, p.vz);
  const maxV = speed;
  if (vl > maxV) { p.vx *= maxV / vl; p.vz *= maxV / vl; }
  else if (ml < 0.1) {
    const f = Math.max(0, 1 - CFG.MOVE.friction * dt);
    p.vx *= f; p.vz *= f;
    if (Math.hypot(p.vx, p.vz) < 0.05) { p.vx = 0; p.vz = 0; }
  }
  p.moveMag = Math.hypot(p.vx, p.vz);
  p.crouch = !!cmd.crouch;
  if (cmd.jump && p.onGround) { p.vy = CFG.MOVE.jump; p.onGround = false; }
  if (!p.onGround) {
    p.vy -= CFG.MOVE.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  }
  const r = CFG.PLAYER.radius;
  const nx = p.x + p.vx * dt;
  if (!collides(nx, p.z, r, p.y)) p.x = nx; else p.vx = 0;
  const nz = p.z + p.vz * dt;
  if (!collides(p.x, nz, r, p.y)) p.z = nz; else p.vz = 0;
  p.x = Math.max(CFG.MAP.X0 + 0.4, Math.min(CFG.MAP.X1 - 0.4, p.x));
  p.z = Math.max(CFG.MAP.Z0 + 0.4, Math.min(CFG.MAP.Z1 - 0.4, p.z));
  if (p.moveMag < 0.5) p.settleT = Math.max(0, p.settleT - dt);
  else p.settleT = 0.25;
  const w = s.player.slot === 'primary' ? s.player.primary : s.player.secondary;
  if (w) w.spreadBloom = Math.max(0, w.spreadBloom - dt * 2.2);
  p.spreadBloom = w ? w.spreadBloom : 0;
  if (p.moveMag > 1 && p.onGround) {
    p.stepT -= dt * p.moveMag;
    if (p.stepT <= 0) {
      p.stepT = 1.9;
      emit(s, 'step', { x: p.x, z: p.z, run: p.moveMag > 4.6, crouch: p.crouch, own: true });
    }
  }
  if (wasMoving && p.moveMag <= 0.5) p.settleT = 0.25;
}

export function tickInteract(s, holdingE, dt) {
  const p = s.player;
  const b = s.bomb;
  if (!p.alive || s.phase !== 'live') { p.plantT = 0; p.defuseT = 0; return null; }
  const site = inSite(p.x, p.z, 0) ? 0 : (inSite(p.x, p.z, 1) ? 1 : -1);
  const isAtk = s.playerSide === 'atk';
  if (isAtk && p.hasBomb && b.state === 'carried' && site >= 0) {
    if (holdingE) {
      p.plantT += dt;
      if (Math.floor(p.plantT * 2) !== Math.floor((p.plantT - dt) * 2)) emit(s, 'plantBeep', {});
      if (p.plantT >= CFG.ROUND.plantTime) { p.plantT = 0; return 'planted'; }
    } else p.plantT = 0;
  } else p.plantT = 0;
  if (!isAtk && b.state === 'planted' && site === b.site) {
    if (holdingE) {
      p.defuseT += dt;
      const need = p.hasKit ? CFG.ROUND.defuseKitTime : CFG.ROUND.defuseTime;
      if (p.defuseT >= need) { p.defuseT = 0; return 'defused'; }
    } else p.defuseT = 0;
  } else p.defuseT = 0;
  return null;
}

export function spawnPlayer(s) {
  const p = s.player;
  const list = SPAWN_LIST(s);
  const sp = list[0];
  p.x = sp[0]; p.z = sp[1]; p.y = 0; p.vx = 0; p.vz = 0; p.vy = 0;
  p.yaw = s.playerSide === 'atk' ? -Math.PI / 2 : Math.PI / 2;
  p.pitch = 0;
}
export function SPAWN_LIST(s) {
  return s.playerSide === 'atk'
    ? [[-29, 0], [-29, -3], [-29, 3]]
    : [[29, 0], [29, -3], [29, 3]];
}
