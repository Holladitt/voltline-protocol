// VOLTLINE PROTOCOL — sim.js
// Fixed-step heart: 60 ticks/second, 16.67 ms steps, accumulator, max 5
// steps/frame (leftover discarded). Fixed order each tick:
// input -> player -> bots -> weapons/grenades -> bomb -> round end.
// The sim only writes state; render & HUD read it.
import { CFG } from './config.js';
import { tickPlayer, tickInteract } from './player.js';
import { tickBot, tickBotHoldCheck, botHear, spawnBots, botBuy } from './bots.js';
import { tickNades, throwGrenade } from './grenades.js';
import { tickReload, firePlayer, startReload, swingMelee } from './weapons.js';
import { curWeapon } from './state.js';
import { tickRound, plantBomb, defuseBomb } from './round.js';
import { siteOf, collides } from './map.js';
import { emit } from './state.js';

let acc = 0;

// One simulation tick (dt = CFG.TICK). cmd = clean command from input.js.
export function tick(s, cmd, dt) {
  s.tick++;
  s.time += dt;
  const p = s.player;

  // Player effect timers.
  if (p.flashT > 0) p.flashT -= dt;
  if (p.hitmarkT > 0) p.hitmarkT -= dt;
  if (p.dmgDirT > 0) p.dmgDirT -= dt;
  if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 2);
  // Killfeed ages out.
  for (let i = s.killfeed.length - 1; i >= 0; i--) {
    if (s.time - s.killfeed[i].t > 5) s.killfeed.splice(i, 1);
  }

  if (s.phase === 'menu') { tickDemo(s, dt); return; }
  if (s.phase === 'matchend' || s.paused) return;

  // 1. Input -> player.
  tickPlayer(s, cmd, dt);
  if (cmd.fire && s.phase === 'live') {
    if (p.slot === 'melee') swingMelee(s, s.time);
    else firePlayer(s, s.time);
  }
  // ADS cancels when: reload starts, weapon swaps, grenade thrown, or death.
  // cmd.ads is cleared too so ADS does not re-engage on the next tick
  // (input only turns cmd.ads on when right-click is pressed again).
  if (cmd.reload && startReload(s)) cmd.ads = false;
  if (cmd.slot) {
    const before = p.slot;
    if (cmd.slot === 'primary' && p.primary) p.slot = 'primary';
    if (cmd.slot === 'secondary') p.slot = 'secondary';
    if (cmd.slot === 'melee') p.slot = 'melee';
    if (p.slot !== before) cmd.ads = false;
  }
  if (cmd.grenade) {
    const kind = cmd.grenade;
    if (p.grenades[kind] > 0 && s.phase === 'live') {
      p.grenades[kind]--;
      throwGrenade(s, p, kind, p.x, p.y + 1.5, p.z, p.yaw, p.pitch + 0.2);
      cmd.ads = false;
    }
  }
  if (!p.alive) cmd.ads = false;
  // ADS (right-click): sniper 4x / DMR 2x scope, slower movement, ambience ducked.
  p.ads = !!cmd.ads && p.alive;
  const w = curWeapon(s);
  if (w) tickReload(w, dt);

  // 2. Plant / defuse (hold E).
  const done = tickInteract(s, !!cmd.use, dt);
  if (done === 'planted') plantBomb(s, p, siteOf(p.x, p.z));
  if (done === 'defused') defuseBomb(s, p);

  // 3. Bots.
  for (const b of s.bots) {
    tickBot(s, b, dt);
    tickBotHoldCheck(s, b);
    // Bots mid-plant/defuse finish their action here (round.js
    // only reads events; a bot plant is triggered from the bot plant state).
    if (b.state === 'plant' && b.plantT >= CFG.ROUND.plantTime) {
      plantBomb(s, b, siteOf(b.x, b.z));
      b.state = 'patrol'; b.plantT = 0;
    }
    if (b.state === 'defuse' && b.defuseT >= (b.hasKit ? CFG.ROUND.defuseKitTime : CFG.ROUND.defuseTime)) {
      defuseBomb(s, b);
      b.state = 'patrol'; b.defuseT = 0;
    }
  }

  // 4. Grenades & smoke.
  tickNades(s, dt);

  // 5. Player footsteps -> bots hear them (radius from config).
  // (The 'step' event is consumed by audio.js & here for AI hearing.)
  // 6. Bomb & round end.
  tickRound(s, dt);

  // Spectate: when the player dies, follow the living friendly bot with the highest HP.
  if (!p.alive && s.phase === 'live') {
    if (p.spectate < 0 || !s.bots[p.spectate] || !s.bots[p.spectate].alive) {
      let best = -1, bh = -1;
      for (const b of s.bots) if (b.team === 'you' && b.alive && b.hp > bh) { bh = b.hp; best = b.id; }
      p.spectate = best;
    }
    if (cmd.specNext) {
      const alive = s.bots.filter((b) => b.team === 'you' && b.alive).map((b) => b.id);
      if (alive.length) {
        const i = alive.indexOf(p.spectate);
        p.spectate = alive[(i + 1) % alive.length];
      }
    }
  }
}

// --- Demo attract mode (menu phase): full bot-vs-bot with no player ---
// Runs automatically on load (main.js always runs stepFrame).
// DEPLOY discards the demo state: onStart calls resetMatch + startMatch.
function startDemo(s) {
  spawnBots(s);
  for (const b of s.bots) {
    b.money = 4000; // demo: every bot can afford a rifle/SMG
    botBuy(s, b);
    b.hp = 100; b.alive = true;
  }
  // Instant action (demo only): stage both groups close together around the
  // Volt Corridor / Site A approach with clear LOS, so a firefight is visible
  // within 1-2 s of load. Spots verified clear of BOXES (guarded at runtime).
  const atkSpots = [[-8, -3], [-6, 0], [-6, 3], [-9, -1]]; // west corridor mouth
  const defSpots = [[2, -6], [4, -4], [6, -7], [3, -8]]; // Site A approach / east corridor
  let ai = 0, di = 0;
  for (const b of s.bots) {
    const isAtk = (s.playerSide === 'atk') === (b.team === 'you');
    const sp = isAtk ? atkSpots[ai++ % atkSpots.length] : defSpots[di++ % defSpots.length];
    if (!collides(sp[0], sp[1], 0.38, 0)) { b.x = sp[0]; b.z = sp[1]; b.y = 0; }
  }
  // Face the opposing group (yaw convention: atan2(-dx, -dz), as in bots.js).
  let ax = 0, az = 0, an = 0, dx = 0, dz = 0, dn = 0;
  for (const b of s.bots) {
    if ((s.playerSide === 'atk') === (b.team === 'you')) { ax += b.x; az += b.z; an++; }
    else { dx += b.x; dz += b.z; dn++; }
  }
  ax /= an; az /= an; dx /= dn; dz /= dn;
  for (const b of s.bots) {
    const isAtk = (s.playerSide === 'atk') === (b.team === 'you');
    const tx = isAtk ? dx : ax, tz = isAtk ? dz : az;
    b.yaw = Math.atan2(-(tx - b.x), -(tz - b.z));
  }
  s.player.alive = false; // enemy bots do not aim at the player during the demo
  s.player.hp = 0;
  s.bomb.state = 'carried'; s.bomb.timer = 0; s.mapLit = false;
  const atk = s.bots.filter((b) => (s.playerSide === 'atk') === (b.team === 'you'));
  const carrier = atk[Math.floor(Math.random() * atk.length)];
  s.bomb.carrier = carrier.id; carrier.hasBomb = true;
  // AI pilot: the camera + HUD follow this bot. Prefer a living attacker
  // with a rifle, else the first living attacker.
  const pilot = atk.find((b) => b.alive && b.weapon.id === 'petir9')
    || atk.find((b) => b.alive && b.weapon.id === 'jarum')
    || atk.find((b) => b.alive);
  s._pilotId = pilot ? pilot.id : -1;
  s._demoOn = true;
}

function tickDemo(s, dt) {
  if (!s._demoOn) startDemo(s);
  // AI pilot: keep following a living bot. When the pilot dies, switch to
  // another living bot, preferring one that is engaging (seenT > 0).
  const pilot = s.bots[s._pilotId];
  if (!pilot || !pilot.alive) {
    const living = s.bots.filter((b) => b.alive);
    const next = living.find((b) => b.seenT > 0) || living[0];
    s._pilotId = next ? next.id : -1;
  }
  // Bomb planted: count down, then "explode" and restart the demo from scratch.
  if (s.bomb.state === 'planted') {
    s.bomb.timer -= dt;
    if (s.bomb.timer <= 0) {
      emit(s, 'bombExplode', {});
      startDemo(s);
      return;
    }
  }
  for (const b of s.bots) {
    if (!b.alive) {
      // Dead bots respawn after 3s so the demo never empties out.
      b._demoRespawn = (b._demoRespawn || 0) + dt;
      if (b._demoRespawn > 3) {
        b._demoRespawn = 0;
        b.hp = 100; b.alive = true; b.state = 'patrol';
        b.route.length = 0; b.routeI = 0;
        b.weapon.mag = CFG.WEAPONS[b.weapon.id].mag;
        const atkTeam = (s.playerSide === 'atk') === (b.team === 'you');
        b.x = atkTeam ? -29 : 29;
        b.z = Math.random() * 6 - 3;
        b.y = 0;
        b.yaw = atkTeam ? -Math.PI / 2 : Math.PI / 2;
      }
      continue;
    }
    tickBot(s, b, dt);
    tickBotHoldCheck(s, b);
    if (b.state === 'plant' && b.plantT >= CFG.ROUND.plantTime) {
      plantBomb(s, b, siteOf(b.x, b.z));
      b.state = 'patrol'; b.plantT = 0;
    }
    if (b.state === 'defuse' &&
        b.defuseT >= (b.hasKit ? CFG.ROUND.defuseKitTime : CFG.ROUND.defuseTime)) {
      // Demo defuse: the bomb goes back to carried, no round end / score.
      s.bomb.state = 'carried'; s.mapLit = false;
      emit(s, 'defused', { by: b.name });
      b.state = 'patrol'; b.defuseT = 0;
      const atk = s.bots.filter((o) => o.alive &&
        (s.playerSide === 'atk') === (o.team === 'you'));
      if (atk.length) {
        const c = atk[Math.floor(Math.random() * atk.length)];
        s.bomb.carrier = c.id; c.hasBomb = true;
      }
    }
  }
  tickNades(s, dt);
}

// Footstep sound event -> AI hearing. Called by main.js after consuming events.
export function applyHearing(s, ev) {
  if (ev.type !== 'step') return;
  const radius = ev.crouch ? CFG.BOT.hearCrouch : ev.run ? CFG.BOT.hearRun : CFG.BOT.hearWalk;
  // Enemy bots hear player steps; bots hear opposing bots' steps.
  for (const b of s.bots) {
    if (!b.alive) continue;
    if (ev.own && b.team === 'foe') botHear(s, b, ev.x, ev.z, radius, 'step');
    else if (!ev.own && ev.id !== undefined && b.id !== ev.id && b.team !== s.bots[ev.id].team) {
      botHear(s, b, ev.x, ev.z, radius, 'step');
    }
  }
}

// Frame driver: fixed-step accumulator. Returns the number of ticks run.
export function stepFrame(s, cmd, frameDt) {
  acc += Math.min(frameDt, 0.25);
  let n = 0;
  while (acc >= CFG.TICK && n < CFG.MAX_STEPS) {
    tick(s, cmd, CFG.TICK);
    acc -= CFG.TICK;
    n++;
  }
  if (n === CFG.MAX_STEPS) acc = 0; // discard the remainder when the frame is very slow
  return n;
}
