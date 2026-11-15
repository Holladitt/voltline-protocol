// VOLTLINE PROTOCOL — bots.js: 4v4 AI (patrol/hold/engage/retreat/plant/
// defuse/buy), roles per round, vision 100°/70°, sight 40 m open / 25 m
// corridor, 2.5 s memory, NO wallhack: LOS by raycast, sound ±30° + range,
// smoke blocks shooting. Friendlies hold fire 0.5 s, stop after 2 player hits.
import { CFG } from './config.js';
import { findRoute, WP, hasLOS, collides, clearLine, inSite, siteOf, distToSite } from './map.js';
import { fireBot, startReloadBot, tickReload, giveBotWeapon } from './weapons.js';
import { throwGrenade, segmentInSmoke } from './grenades.js';
import { emit, radio } from './state.js';

const _route = []; // scratch waypoint route
const ROLES = ['entry', 'support', 'lurker', 'anchor', 'flex'];

// --- Util ---
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function rand(a, b) { return a + Math.random() * (b - a); }
function pickSite(s, b) {
  // Attackers pick a site: least guarded per sound + shortest path.
  const dA = Math.abs(b.x - -20) + Math.abs(b.z - -14);
  const dB = Math.abs(b.x - 20) + Math.abs(b.z - -14);
  return dA <= dB ? 0 : 1;
}
function siteWP(site) { return site === 0 ? 10 : 13; }
function holdSpot(b, site) {
  // Hold point near the site: anchor in cover, the rest at entrances.
  // Site B anchor sits at (26,-11): the old (24,-11) is inside the
  // substation crate's collision box, so a bot sent there can never arrive.
  const spots = site === 0
    ? [[-24, -11], [-16, -11], [-20, -18], [-26, -14], [-14, -17]]
    : [[16, -11], [26, -11], [20, -18], [16, -17], [24, -17]];
  return spots[b.id % spots.length];
}

// --- Spawn & buy ---
export function spawnBots(s) {
  const atkSpawn = [[-29, -3], [-29, 0], [-29, 3], [-27, -5], [-27, 5]];
  const defSpawn = [[29, -3], [29, 0], [29, 3], [27, -5], [27, 5]];
  let ai = 0, di = 0;
  for (const b of s.bots) {
    const isAtkTeam = (s.playerSide === 'atk') === (b.team === 'you');
    const sp = isAtkTeam ? atkSpawn[ai++ % 5] : defSpawn[di++ % 5];
    b.x = sp[0]; b.z = sp[1]; b.y = 0; b.vx = 0; b.vz = 0;
    b.yaw = isAtkTeam ? -Math.PI / 2 : Math.PI / 2;
    b.state = 'buy'; b.route.length = 0; b.routeI = 0; b.waitT = 0;
    // Route state: 'go' (a live route), 'done' (destination reached),
    // 'blocked' (no route / destination unreachable). 'blocked' means the
    // next patrol tick picks a fresh destination via decideMove.
    b.routeState = 'blocked'; b._stuckT = 0; b._lx = b.x; b._lz = b.z;
    b.target = -1; b.seenT = 0; b.hearT = 0;
  }
  // Roles are redrawn every round.
  const roles = [...ROLES].sort(() => Math.random() - 0.5);
  s.bots.forEach((b, i) => { b.role = roles[i % 5]; });
}

export function botBuy(s, b) {
  // Bot buy rules: <1000 pistol, 1000-3000 SMG/shotgun, >3000 rifle.
  // At least one rifle per team, at most one sniper. Losing bots tend to eco.
  const m = b.money;
  let id = 'percik';
  if (m > 3000 && Math.random() < 0.55) id = 'petir9';
  else if (m > 3000 && Math.random() < 0.25) id = 'jarum';
  else if (m >= 1000 && Math.random() < 0.6) id = Math.random() < 0.5 ? 'sengat9' : 'senja12';
  if (id !== 'percik') b.money -= CFG.WEAPONS[id].price;
  giveBotWeapon(b, id);
  // Grenades: support carries smoke+flash when affordable.
  if (b.role === 'support' && b.money >= 600) { b.grenades.smoke = 1; b.grenades.flash = 1; b.money -= 600; }
  else if (b.money >= 300 && Math.random() < 0.4) { b.grenades.smoke = 1; b.money -= 300; }
  // Armor when rich.
  if (b.money >= 650 && Math.random() < 0.5) { b.armor = 100; b.money -= 650; }
  b.state = 'patrol';
}

// --- Perception ---
function canSee(s, b, tx, ty, tz) {
  if (b.flashT > 0) return false;
  const dx = tx - b.x, dy = ty - (b.y + 1.5), dz = tz - b.z;
  const dist = Math.hypot(dx, dy, dz);
  const maxSight = dist2(b.x, b.z, tx, tz) > 25 * 25 ? CFG.BOT.sightOpen : CFG.BOT.sightCorr;
  if (dist > maxSight) return false;
  // Horizontal view cone 100°, vertical 70°.
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const hd = Math.hypot(dx, dz);
  if (hd > 0.01) {
    const dot = (dx * fx + dz * fz) / hd;
    if (dot < Math.cos((CFG.BOT.vision / 2) * Math.PI / 180)) return false;
  }
  if (!hasLOS(b.x, b.y + 1.5, b.z, tx, ty, tz)) return false;
  if (segmentInSmoke(s, b.x, b.y + 1.5, b.z, tx, ty, tz)) return false;
  return true;
}

// A bot hears a sound: only rough direction ±30° + range band. Stored as a hear target.
export function botHear(s, b, x, z, radius, kind) {
  const d = Math.hypot(x - b.x, z - b.z);
  if (d > radius) return;
  if (b.hearT > 0 && d > 20) return; // an old sound loses to a newer & closer one
  const err = rand(-30, 30) * Math.PI / 180;
  const base = Math.atan2(x - b.x, z - b.z) + err;
  const band = d < 8 ? 5 : (d < 18 ? 12 : 20); // close/mid/far
  b.hearX = b.x + Math.sin(base) * band;
  b.hearZ = b.z + Math.cos(base) * band;
  b.hearT = 1.5;
  if (kind === 'shot') b.hearConf = 2;
}

// Find a visible target: the player first (when an enemy), then the nearest enemy bot.
function scanTargets(s, b) {
  const p = s.player;
  const foes = [];
  if (b.team === 'foe' && p.alive) foes.push(p);
  for (const o of s.bots) if (o.team !== b.team && o.alive) foes.push(o);
  let best = null, bd = 1e9;
  for (const f of foes) {
    const eyeY = f.y + (f.crouch ? 0.9 : 1.35);
    if (!canSee(s, b, f.x, eyeY, f.z)) continue;
    const d = dist2(b.x, b.z, f.x, f.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// --- Movement ---
function moveToward(s, b, tx, tz, speed, dt) {
  const dx = tx - b.x, dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) { b.vx = 0; b.vz = 0; b.moving = false; return true; }
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  const nx = b.x + vx * dt;
  if (!collides(nx, b.z, 0.38, b.y)) b.x = nx;
  const nz = b.z + vz * dt;
  if (!collides(b.x, nz, 0.38, b.y)) b.z = nz;
  b.vx = vx; b.vz = vz; b.moving = true;
  b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), CFG.BOT.fovTurn * Math.PI / 180 * dt);
  // Bot footsteps (heard by the player & other bots).
  b.stepT -= dt * speed;
  if (b.stepT <= 0) {
    b.stepT = 1.9;
    emit(s, 'step', { x: b.x, z: b.z, run: speed > 5, crouch: b.crouch, own: false, id: b.id });
  }
  return false;
}
function turnToward(yaw, target, maxStep) {
  let d = target - yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) <= maxStep) return target;
  return yaw + Math.sign(d) * maxStep;
}

// Follow the live route; true on reaching (destX, destZ). Waypoints are only
// the middle of the trip — the bot then walks the final leg itself. A route
// with exhausted waypoints is NOT arrival; a final leg with no clear line is blocked.
function followRoute(s, b, speed, dt) {
  if (b.routeState === 'done') return true;
  if (b.routeState !== 'go') return false;
  if (b.routeI < b.route.length) {
    const n = WP[b.route[b.routeI]];
    if (moveToward(s, b, n[0], n[1], speed, dt)) b.routeI++;
    return false;
  }
  // Final leg: walk the destination itself. Refuse a leg with no clear
  // line instead of sliding along a wall forever.
  if (!clearLine(b.x, b.z, b.destX, b.destZ, b.y, 0.38)) {
    b.routeState = 'blocked';
    b.vx = 0; b.vz = 0; b.moving = false;
    return false;
  }
  if (moveToward(s, b, b.destX, b.destZ, speed, dt)) {
    b.routeState = 'done';
    return true;
  }
  return false;
}

// Nearest waypoint the bot can actually stand on and walk to in a straight
// line (not inside a box, with a clear line from the bot). -1 if none.
function nearestOpenWP(x, z, y) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < WP.length; i++) {
    const wx = WP[i][0], wz = WP[i][1];
    if (collides(wx, wz, 0.38, y)) continue;
    if (!clearLine(x, z, wx, wz, y, 0.38)) continue;
    const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Plan a route to (tx, tz); exported for the nav regression tests. Sets
// routeState 'go' or 'blocked' (destination inside a box, or no waypoint
// path — never silently treated as reached).
export function setRouteTo(s, b, tx, tz) {
  b.destX = tx; b.destZ = tz;
  b.route = []; b.routeI = 0; b.routeState = 'blocked';
  // The destination itself must be standable.
  if (collides(tx, tz, 0.38, b.y)) return;
  // Straight shot when the direct line is clear (also covers the
  // same-waypoint case, where the BFS route is empty).
  if (clearLine(b.x, b.z, tx, tz, b.y, 0.38)) { b.routeState = 'go'; return; }
  // Else route via the waypoint graph from the nearest reachable waypoint.
  // BFS drops its start node, so prepend it (the bot must stand on it first).
  const from = nearestOpenWP(b.x, b.z, b.y);
  const to = nearestOpenWP(tx, tz, b.y);
  if (from < 0 || to < 0) return;
  findRoute(from, to, _route);
  if (from !== to && _route.length === 0) return; // no graph path
  b.route = [from, ..._route];
  b.routeState = 'go';
}

// --- Main bot tick ---
export function tickBot(s, b, dt) {
  if (!b.alive) return;
  const d = CFG.DIFF[s.diff];
  const isAtkTeam = (s.playerSide === 'atk') === (b.team === 'you');
  if (b.flashT > 0) b.flashT -= dt;
  if (b.hitFlashT > 0) b.hitFlashT -= dt;
  if (b.smokeT > 0) b.smokeT -= dt;
  tickReload(b.weapon, dt);

  // 1. Perception: scan every tick (cheap: 7 bots x ~4 targets, short raycasts).
  const seen = scanTargets(s, b);
  if (seen) {
    const prevT = b.targetIsPlayer ? -2 : b.target;
    const newT = seen === s.player ? -2 : seen.id;
    if (newT !== prevT) b.holdUntil = undefined; // new target: hold friendly fire 0.5 s
    b.target = seen === s.player ? -1 : seen.id;
    b.targetIsPlayer = seen === s.player;
    b.seenT = CFG.BOT.memory;
    b.seenX = seen.x; b.seenZ = seen.z;
    if (b.reactT <= 0) b.reactT = rand(d.react[0], d.react[1]);
    // Friendly bots mark the enemy on the HUD for 3 s.
    if (b.team === 'you') seen.vis = true;
  } else if (b.seenT > 0) {
    b.seenT -= dt;
    if (b.seenT <= 0) { b.target = -1; }
  }
  if (b.reactT > 0) b.reactT -= dt;

  // 2. Hearing: with a fresh sound & no target, face the sound direction.
  if (b.target < 0 && !b.targetIsPlayer && b.hearT > 0) {
    b.hearT -= dt;
    b.yaw = turnToward(b.yaw, Math.atan2(b.hearX - b.x, b.hearZ - b.z), CFG.BOT.fovTurn * Math.PI / 180 * dt);
  }

  // 3. State machine.
  switch (b.state) {
    case 'buy': break;
    case 'retreat': {
      // HP < 30: fall back to the nearest teammate.
      let mate = null, bd = 1e9;
      for (const o of s.bots) if (o.team === b.team && o.alive && o !== b) {
        const dd = dist2(b.x, b.z, o.x, o.z);
        if (dd < bd) { bd = dd; mate = o; }
      }
      if (mate) moveToward(s, b, mate.x, mate.z, 5.5, dt);
      if (b.hp > 45) b.state = 'patrol';
      break;
    }
    case 'plant': {
      // Plant: 3 s countdown. plantBomb completes in sim.js right after this
      // tick — DO NOT complete it here (v1 bug: bomb never planted).
      b.plantT += dt;
      break;
    }
    case 'defuse': {
      // Defuse: 5 s countdown (2.5 s with kit). Completion in sim.js.
      b.defuseT += dt;
      break;
    }
    case 'engage': {
      const tgt = b.targetIsPlayer ? s.player : (b.target >= 0 ? s.bots[b.target] : null);
      if (!tgt || !tgt.alive || b.seenT <= 0) { b.state = 'patrol'; break; }
      // Face the target; stop 0.4 s to steady aim, then burst 3-5 + 0.6 s pause.
      b.yaw = turnToward(b.yaw, Math.atan2(-(tgt.x - b.x), -(tgt.z - b.z)), CFG.BOT.fovTurn * Math.PI / 180 * dt);
      if (b.reactT <= 0) {
        if (b.burstPause > 0) b.burstPause -= dt;
        else {
          if (b.burstLeft <= 0) b.burstLeft = Math.floor(rand(d.burst[0], d.burst[1] + 1));
          // Friendly: hold fire 0.5 s if the player aims at the same target (<20 m); stop after 2 player hits.
          let holdFire = false;
          if (b.team === 'you' && s.player.alive) {
            const pd = Math.hypot(tgt.x - s.player.x, tgt.z - s.player.z);
            if (pd < 20) {
              if (b.holdUntil === undefined) b.holdUntil = s.time + 0.5;
              if (s.time < b.holdUntil) holdFire = true;
              if (tgt._phits >= 2 && s.time - (tgt._phitsT || 0) < 1.2) holdFire = true;
            }
          }
          if (!holdFire) {
            fireBot(s, b, tgt, s.time);
            b.burstLeft--;
            if (b.burstLeft <= 0) b.burstPause = 0.6;
          }
        }
      }
      // Fall back on critical HP.
      if (b.hp < 30) b.state = 'retreat';
      break;
    }
    case 'hold': {
      // Still behind cover, aim sweeping a 60° cone.
      b.holdYaw += Math.sin(s.time * 0.5 + b.id) * dt * 0.6;
      b.yaw = turnToward(b.yaw, b.holdYaw, CFG.BOT.fovTurn * Math.PI / 180 * dt);
      if (b.seenT > 0) b.state = 'engage';
      break;
    }
    default: { // patrol
      // Pick a destination from role & bomb phase. A new destination is
      // only picked when no route is live — never re-planned every tick
      // while the final leg is still running.
      if (b.routeState !== 'go') decideMove(s, b, isAtkTeam);
      if (b.waitT > 0) { b.waitT -= dt; b.moving = false; }
      else {
        const ri = b.routeI;
        const done = followRoute(s, b, b.role === 'lurker' ? 4.2 : 5.5, dt);
        // At an intermediate node: sometimes wait 1.5-2.5 s (v1 ran this every tick — bots crawled).
        if (!done && b.routeI > ri && Math.random() < 0.3) b.waitT = rand(1.5, 2.5);
      }
      if (b.seenT > 0) b.state = 'engage';
      break;
    }
  }

  // Anti-stuck: a patrolling bot unmoved for 2.5 s on a live route gives up.
  // Never skips a waypoint (could cut through cover); also catches the final leg.
  if (b.state === 'patrol' && b.waitT <= 0 && b.routeState === 'go') {
    const moved = Math.hypot(b.x - (b._lx ?? b.x), b.z - (b._lz ?? b.z));
    b._stuckT = moved < 0.001 ? (b._stuckT || 0) + dt : 0;
    b._lx = b.x; b._lz = b.z;
    if ((b._stuckT || 0) > 2.5) {
      b._stuckT = 0; b.routeState = 'blocked';
    }
  }

  // 4. Plant/defuse from patrol when conditions fit (also in round.js; runs in menu demo too).
  if (b.state === 'patrol' && (s.phase === 'live' || s.phase === 'menu')) {
    const site = siteOf(b.x, b.z);
    if (isAtkTeam && site >= 0 && s.bomb.state === 'carried' && s.bomb.carrier === b.id) {
      b.state = 'plant'; b.plantT = 0;
      radio(s, `${b.name}: SITE ${'AB'[site]} CLEAR — PLANT`);
      emit(s, 'botPlanting', { id: b.id, site });
    } else if (!isAtkTeam && s.bomb.state === 'planted' && site === s.bomb.site) {
      b.state = 'defuse'; b.defuseT = 0;
      radio(s, `${b.name}: DEFUSE — COVER ME`);
      emit(s, 'botDefusing', { id: b.id });
    }
  }

  // 5. Utility: smoke before plant/retake, flash before entering a site.
  if (b.state === 'patrol' && !b.usedSmoke && b.grenades.smoke > 0 && isAtkTeam) {
    const site = pickSite(s, b);
    if (distToSite(b.x, b.z, site) < 12) {
      b.usedSmoke = true; b.grenades.smoke--;
      throwGrenade(s, b, 'smoke', b.x, b.y + 1.5, b.z, b.yaw, 0.15);
    }
  }
  if (b.state === 'patrol' && !b.usedFlash && b.grenades.flash > 0 && isAtkTeam) {
    const site = pickSite(s, b);
    if (distToSite(b.x, b.z, site) < 8) {
      b.usedFlash = true; b.grenades.flash--;
      throwGrenade(s, b, 'flash', b.x, b.y + 1.5, b.z, b.yaw, 0.2);
    }
  }

  // 6. Auto-reload when the mag is empty & it's safe.
  if (b.weapon.mag === 0 && b.state !== 'engage') startReloadBot(s, b);
}

function decideMove(s, b, isAtkTeam) {
  const bomb = s.bomb;
  if (bomb.state === 'planted') {
    if (isAtkTeam) {
      // Attackers guard the site from 8-15 m after plant.
      const hs = holdSpot(b, bomb.site);
      setRouteTo(s, b, hs[0], hs[1]);
      b.state = 'patrol';
      return;
    }
    // Defenders retake in pairs toward the planted site.
    const hs = holdSpot(b, bomb.site);
    setRouteTo(s, b, hs[0], hs[1]);
    b.state = 'patrol';
    return;
  }
  if (isAtkTeam) {
    const site = pickSite(s, b);
    // Fake: after 20 s without contact, two bots rotate to the other site (once per round).
    let target = site;
    if (s.time > 20 && !s._fakeDone && (b.role === 'lurker' || b.role === 'flex')) {
      target = 1 - site; s._fakeDone = true;
      radio(s, `${b.name}: ROTATING TO ${target === 0 ? 'A' : 'B'}`);
    }
    if (b.role === 'anchor') { const hs = holdSpot(b, site); setRouteTo(s, b, hs[0], hs[1]); }
    else if (b.role === 'lurker') { setRouteTo(s, b, site === 0 ? -26 : 26, 14); } // cable corridor
    else setRouteTo(s, b, SITES_X(site), -14);
    b._site = site;
  } else {
    // Defenders: 2-1-2 — two at A, one mid, two at B.
    // B anchor sits at (26,-11): the old (24,-11) is inside the Site B crate.
    const spots = [[-20, -14], [-24, -11], [0, 4], [20, -14], [26, -11]];
    const sp = spots[b.id % 5];
    setRouteTo(s, b, sp[0], sp[1]);
    b.holdYaw = Math.atan2(-(0 - sp[0]), -(0 - sp[1]));
    b._holdAt = sp;
  }
}
function SITES_X(site) { return site === 0 ? -20 : 20; }

// Once a defender reaches its hold point, switch to hold state.
// A blocked route never counts as arrival, so it can never flip to hold.
export function tickBotHoldCheck(s, b) {
  if (b.state !== 'patrol' || !b._holdAt || b.routeState === 'blocked') return;
  if (dist2(b.x, b.z, b._holdAt[0], b._holdAt[1]) < 1.5) {
    b.state = 'hold'; b.holdYaw = b.yaw; b._holdAt = null;
  }
}
