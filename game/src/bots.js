// VOLTLINE PROTOCOL — bots.js
// AI bot 4v4: state machine patrol/hold/engage/retreat/plant/defuse/buy,
// peran per ronde (entry/support/lurker/anchor/flex), vision cone 100°/70°,
// sight 40 m terbuka / 25 m koridor, memori 2.5 dtk, TANPA wallhack:
// LOS dicek raycast, suara hanya arah kasar ±30° + band jarak, asap memblokir
// tembak sepenuhnya. Bot teman menahan tembak 0.5 dtk & berhenti setelah
// 2 hit pemain pada target yang sama.
import { CFG } from './config.js';
import { nearestWP, findRoute, WP, hasLOS, collides, inSite, siteOf, distToSite } from './map.js';
import { fireBot, startReloadBot, tickReload, giveBotWeapon } from './weapons.js';
import { throwGrenade, segmentInSmoke } from './grenades.js';
import { emit } from './state.js';

const _route = []; // scratch rute waypoint
const ROLES = ['entry', 'support', 'lurker', 'anchor', 'flex'];

// --- Util ---
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function rand(a, b) { return a + Math.random() * (b - a); }
function pickSite(s, b) {
  // Penyerang pilih site: paling sedikit dijaga menurut suara + jalur terpendek.
  const dA = Math.abs(b.x - -20) + Math.abs(b.z - -14);
  const dB = Math.abs(b.x - 20) + Math.abs(b.z - -14);
  return dA <= dB ? 0 : 1;
}
function siteWP(site) { return site === 0 ? 10 : 13; }
function holdSpot(b, site) {
  // Titik hold di sekitar site: anchor di cover, sisanya di pintu masuk.
  const spots = site === 0
    ? [[-24, -11], [-16, -11], [-20, -18], [-26, -14], [-14, -17]]
    : [[16, -11], [24, -11], [20, -18], [16, -17], [24, -17]];
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
    b.target = -1; b.seenT = 0; b.hearT = 0;
  }
  // Peran diundi ulang tiap ronde.
  const roles = [...ROLES].sort(() => Math.random() - 0.5);
  s.bots.forEach((b, i) => { b.role = roles[i % 5]; });
}

export function botBuy(s, b) {
  // Aturan beli bot: <1000 pistol, 1000-3000 SMG/shotgun, >3000 rifle.
  // Minimal satu rifle per tim, maksimal satu sniper. Bot kalah cenderung eco.
  const m = b.money;
  let id = 'percik';
  if (m > 3000 && Math.random() < 0.55) id = 'petir9';
  else if (m > 3000 && Math.random() < 0.25) id = 'jarum';
  else if (m >= 1000 && Math.random() < 0.6) id = Math.random() < 0.5 ? 'sengat9' : 'senja12';
  if (id !== 'percik') b.money -= CFG.WEAPONS[id].price;
  giveBotWeapon(b, id);
  // Granat: support bawa smoke+flash bila mampu.
  if (b.role === 'support' && b.money >= 600) { b.grenades.smoke = 1; b.grenades.flash = 1; b.money -= 600; }
  else if (b.money >= 300 && Math.random() < 0.4) { b.grenades.smoke = 1; b.money -= 300; }
  // Armor bila kaya.
  if (b.money >= 650 && Math.random() < 0.5) { b.armor = 100; b.money -= 650; }
  b.state = 'patrol';
}

// --- Persepsi ---
function canSee(s, b, tx, ty, tz) {
  if (b.flashT > 0) return false;
  const dx = tx - b.x, dy = ty - (b.y + 1.5), dz = tz - b.z;
  const dist = Math.hypot(dx, dy, dz);
  const maxSight = dist2(b.x, b.z, tx, tz) > 25 * 25 ? CFG.BOT.sightOpen : CFG.BOT.sightCorr;
  if (dist > maxSight) return false;
  // Kerucut pandang horizontal 100°, vertikal 70°.
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

// Bot mendengar suara: hanya arah kasar ±30° + band jarak. Simpan sebagai hear target.
export function botHear(s, b, x, z, radius, kind) {
  const d = Math.hypot(x - b.x, z - b.z);
  if (d > radius) return;
  if (b.hearT > 0 && d > 20) return; // suara lama kalah dengan yang baru & dekat
  const err = rand(-30, 30) * Math.PI / 180;
  const base = Math.atan2(x - b.x, z - b.z) + err;
  const band = d < 8 ? 5 : (d < 18 ? 12 : 20); // dekat/sedang/jauh
  b.hearX = b.x + Math.sin(base) * band;
  b.hearZ = b.z + Math.cos(base) * band;
  b.hearT = 1.5;
  if (kind === 'shot') b.hearConf = 2;
}

// Cari target terlihat: pemain dulu (bila musuh), lalu bot lawan terdekat.
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

// --- Gerakan ---
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
  // Langkah kaki bot (terdengar pemain & bot lain).
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

// Ikuti rute waypoint; true bila sampai tujuan akhir.
function followRoute(s, b, speed, dt) {
  if (b.routeI >= b.route.length) return true;
  const n = WP[b.route[b.routeI]];
  if (moveToward(s, b, n[0], n[1], speed, dt)) b.routeI++;
  return b.routeI >= b.route.length;
}
function setRouteTo(s, b, tx, tz) {
  const from = nearestWP(b.x, b.z), to = nearestWP(tx, tz);
  findRoute(from, to, _route);
  b.route = _route.slice();
  b.routeI = 0;
  b.destX = tx; b.destZ = tz;
}

// --- Tick utama bot ---
export function tickBot(s, b, dt) {
  if (!b.alive) return;
  const d = CFG.DIFF[s.diff];
  const isAtkTeam = (s.playerSide === 'atk') === (b.team === 'you');
  if (b.flashT > 0) b.flashT -= dt;
  if (b.smokeT > 0) b.smokeT -= dt;
  tickReload(b.weapon, dt);

  // 1. Persepsi: scan tiap tick (murah: 7 bot x ~4 target, raycast pendek).
  const seen = scanTargets(s, b);
  if (seen) {
    const prevT = b.targetIsPlayer ? -2 : b.target;
    const newT = seen === s.player ? -2 : seen.id;
    if (newT !== prevT) b.holdUntil = undefined; // target baru: tahan tembak teman 0.5 dtk
    b.target = seen === s.player ? -1 : seen.id;
    b.targetIsPlayer = seen === s.player;
    b.seenT = CFG.BOT.memory;
    b.seenX = seen.x; b.seenZ = seen.z;
    if (b.reactT <= 0) b.reactT = rand(d.react[0], d.react[1]);
    // Bot teman menandai musuh di HUD 3 dtk.
    if (b.team === 'you') seen.vis = true;
  } else if (b.seenT > 0) {
    b.seenT -= dt;
    if (b.seenT <= 0) { b.target = -1; }
  }
  if (b.reactT > 0) b.reactT -= dt;

  // 2. Dengar: bila ada suara segar & tak ada target, hadapi arah suara.
  if (b.target < 0 && !b.targetIsPlayer && b.hearT > 0) {
    b.hearT -= dt;
    b.yaw = turnToward(b.yaw, Math.atan2(b.hearX - b.x, b.hearZ - b.z), CFG.BOT.fovTurn * Math.PI / 180 * dt);
  }

  // 3. State machine.
  switch (b.state) {
    case 'buy': break;
    case 'retreat': {
      // HP < 30: mundur ke teman terdekat.
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
      // Plant: hitung mundur 3 dtk. Penyelesaian (plantBomb) dilakukan blok
      // sim.js tepat setelah tick ini — JANGAN selesaikan di sini, kalau tidak
      // plantBomb tidak pernah terpanggil (bug v1: bot "plant" tapi bom tak
      // pernah ter-plant).
      b.plantT += dt;
      break;
    }
    case 'defuse': {
      // Defuse: hitung mundur 5 dtk (2,5 dtk dengan kit). Penyelesaian di sim.js.
      b.defuseT += dt;
      break;
    }
    case 'engage': {
      const tgt = b.targetIsPlayer ? s.player : (b.target >= 0 ? s.bots[b.target] : null);
      if (!tgt || !tgt.alive || b.seenT <= 0) { b.state = 'patrol'; break; }
      // Hadapi target; berhenti 0.4 dtk untuk stabilkan aim, lalu burst 3-5 + jeda 0.6.
      b.yaw = turnToward(b.yaw, Math.atan2(-(tgt.x - b.x), -(tgt.z - b.z)), CFG.BOT.fovTurn * Math.PI / 180 * dt);
      if (b.reactT <= 0) {
        if (b.burstPause > 0) b.burstPause -= dt;
        else {
          if (b.burstLeft <= 0) b.burstLeft = Math.floor(rand(d.burst[0], d.burst[1] + 1));
          // Bot teman: tahan 0.5 dtk pertama bila pemain membidik target yang sama
          // dalam 20 m, dan berhenti bila pemain sudah 2x mengenai target itu.
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
      // Mundur bila HP kritis.
      if (b.hp < 30) b.state = 'retreat';
      break;
    }
    case 'hold': {
      // Diam di balik cover, aim menyapu kerucut 60°.
      b.holdYaw += Math.sin(s.time * 0.5 + b.id) * dt * 0.6;
      b.yaw = turnToward(b.yaw, b.holdYaw, CFG.BOT.fovTurn * Math.PI / 180 * dt);
      if (b.seenT > 0) b.state = 'engage';
      break;
    }
    default: { // patrol
      // Tentukan tujuan dari peran & fase bom.
      if (!b.route.length || b.routeI >= b.route.length) decideMove(s, b, isAtkTeam);
      if (b.waitT > 0) { b.waitT -= dt; b.moving = false; }
      else {
        const ri = b.routeI;
        const done = followRoute(s, b, b.role === 'lurker' ? 4.2 : 5.5, dt);
        // Baru tiba di node perantara: kadang berhenti 1,5-2,5 dtk di tiap sudut.
        // (v1: cek ini jalan tiap tick saat bergerak, jadi bot merangkak
        // ~0,1 m/dtk dan tak pernah bertemu — demo 60 dtk 0 tembakan.)
        if (!done && b.routeI > ri && Math.random() < 0.3) b.waitT = rand(1.5, 2.5);
      }
      if (b.seenT > 0) b.state = 'engage';
      break;
    }
  }

  // Anti-macet: bot patrol yang tak bergerak 2,5 dtk padahal punya rute
  // (garis waypoint terhalang cover) melewati waypoint itu.
  if (b.state === 'patrol' && b.waitT <= 0 && b.route.length > 0 &&
      b.routeI < b.route.length) {
    const moved = Math.hypot(b.x - (b._lx ?? b.x), b.z - (b._lz ?? b.z));
    b._stuckT = moved < 0.001 ? (b._stuckT || 0) + dt : 0;
    b._lx = b.x; b._lz = b.z;
    if ((b._stuckT || 0) > 2.5) {
      b._stuckT = 0; b.routeI++;
      if (b.routeI >= b.route.length) b.route.length = 0;
    }
  }

  // 4. Plant/defuse dipicu dari patrol bila kondisi cocok (dicek round.js juga).
  // Jalan juga di fase menu (demo attract mode: bot-vs-bot).
  if (b.state === 'patrol' && (s.phase === 'live' || s.phase === 'menu')) {
    const site = siteOf(b.x, b.z);
    if (isAtkTeam && site >= 0 && s.bomb.state === 'carried' && s.bomb.carrier === b.id) {
      b.state = 'plant'; b.plantT = 0;
      emit(s, 'botPlanting', { id: b.id, site });
    } else if (!isAtkTeam && s.bomb.state === 'planted' && site === s.bomb.site) {
      b.state = 'defuse'; b.defuseT = 0;
      emit(s, 'botDefusing', { id: b.id });
    }
  }

  // 5. Utility: smoke sebelum plant/retake, flash sebelum masuk site.
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

  // 6. Reload otomatis saat mag kosong & aman.
  if (b.weapon.mag === 0 && b.state !== 'engage') startReloadBot(s, b);
}

function decideMove(s, b, isAtkTeam) {
  const bomb = s.bomb;
  if (bomb.state === 'planted') {
    if (isAtkTeam) {
      // Penyerang jaga site dari jarak 8-15 m setelah plant.
      const hs = holdSpot(b, bomb.site);
      setRouteTo(s, b, hs[0], hs[1]);
      b.state = 'patrol';
      return;
    }
    // Defender retake berpasangan ke site yang ditanam.
    const hs = holdSpot(b, bomb.site);
    setRouteTo(s, b, hs[0], hs[1]);
    b.state = 'patrol';
    return;
  }
  if (isAtkTeam) {
    const site = pickSite(s, b);
    // Fake: bila 20 dtk tanpa kontak, dua bot pindah site lain (sekali per ronde).
    let target = site;
    if (s.time > 20 && !s._fakeDone && (b.role === 'lurker' || b.role === 'flex')) {
      target = 1 - site; s._fakeDone = true;
    }
    if (b.role === 'anchor') { const hs = holdSpot(b, site); setRouteTo(s, b, hs[0], hs[1]); }
    else if (b.role === 'lurker') { setRouteTo(s, b, site === 0 ? -26 : 26, 14); } // lorong kabel
    else setRouteTo(s, b, SITES_X(site), -14);
    b._site = site;
  } else {
    // Defender: 2-1-2 — dua di A, satu mid, dua di B.
    const spots = [[-20, -14], [-24, -11], [0, 4], [20, -14], [24, -11]];
    const sp = spots[b.id % 5];
    setRouteTo(s, b, sp[0], sp[1]);
    b.holdYaw = Math.atan2(-(0 - sp[0]), -(0 - sp[1]));
    b._holdAt = sp;
  }
}
function SITES_X(site) { return site === 0 ? -20 : 20; }

// Setelah sampai di titik hold defender, ubah ke state hold.
export function tickBotHoldCheck(s, b) {
  if (b.state !== 'patrol' || !b._holdAt) return;
  if (dist2(b.x, b.z, b._holdAt[0], b._holdAt[1]) < 1.5) {
    b.state = 'hold'; b.holdYaw = b.yaw; b._holdAt = null;
  }
}
