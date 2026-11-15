// VOLTLINE PROTOCOL — sim.js
// Jantung fixed-step: 60 tick/detik, langkah 16.67 ms, accumulator, maks 5
// langkah/frame (sisa dibuang). Urutan tiap tick tetap:
// input -> pemain -> bot -> senjata/granat -> bom -> akhir ronde.
// Sim hanya menulis state; render & HUD membaca.
import { CFG } from './config.js';
import { tickPlayer, tickInteract } from './player.js';
import { tickBot, tickBotHoldCheck, botHear, spawnBots, botBuy } from './bots.js';
import { tickNades, throwGrenade } from './grenades.js';
import { tickReload, firePlayer, startReload, swingMelee } from './weapons.js';
import { curWeapon } from './state.js';
import { tickRound, plantBomb, defuseBomb } from './round.js';
import { siteOf } from './map.js';
import { emit } from './state.js';

let acc = 0;

// Satu tick simulasi (dt = CFG.TICK). cmd = perintah bersih dari input.js.
export function tick(s, cmd, dt) {
  s.tick++;
  s.time += dt;
  const p = s.player;

  // Timer efek pemain.
  if (p.flashT > 0) p.flashT -= dt;
  if (p.hitmarkT > 0) p.hitmarkT -= dt;
  if (p.dmgDirT > 0) p.dmgDirT -= dt;
  if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 2);
  // Killfeed menua.
  for (let i = s.killfeed.length - 1; i >= 0; i--) {
    if (s.time - s.killfeed[i].t > 5) s.killfeed.splice(i, 1);
  }

  if (s.phase === 'menu') { tickDemo(s, dt); return; }
  if (s.phase === 'matchend' || s.paused) return;

  // 1. Input -> pemain.
  tickPlayer(s, cmd, dt);
  if (cmd.fire && s.phase === 'live') {
    if (p.slot === 'melee') swingMelee(s, s.time);
    else firePlayer(s, s.time);
  }
  // ADS batal bila: reload dimulai, senjata diganti, granat dilempar, atau mati.
  // cmd.ads ikut dibersihkan supaya ADS tidak langsung nyala lagi di tick berikut
  // (input hanya menyalakan cmd.ads saat klik kanan ditekan ulang).
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
  // ADS (klik kanan): scope sniper 4x / DMR 2x, gerak melambat, ambience dipotong.
  p.ads = !!cmd.ads && p.alive;
  const w = curWeapon(s);
  if (w) tickReload(w, dt);

  // 2. Plant / defuse (tahan E).
  const done = tickInteract(s, !!cmd.use, dt);
  if (done === 'planted') plantBomb(s, p, siteOf(p.x, p.z));
  if (done === 'defused') defuseBomb(s, p);

  // 3. Bot.
  for (const b of s.bots) {
    tickBot(s, b, dt);
    tickBotHoldCheck(s, b);
    // Bot yang sedang plant/defuse menyelesaikan aksinya di sini (round.js
    // hanya membaca event; plant oleh bot dipicu dari state plant bot).
    if (b.state === 'plant' && b.plantT >= CFG.ROUND.plantTime) {
      plantBomb(s, b, siteOf(b.x, b.z));
      b.state = 'patrol'; b.plantT = 0;
    }
    if (b.state === 'defuse' && b.defuseT >= (b.hasKit ? CFG.ROUND.defuseKitTime : CFG.ROUND.defuseTime)) {
      defuseBomb(s, b);
      b.state = 'patrol'; b.defuseT = 0;
    }
  }

  // 4. Granat & asap.
  tickNades(s, dt);

  // 5. Suara langkah pemain -> bot mendengar (radius dari config).
  // (Event 'step' dikonsumsi audio.js & di sini untuk AI hearing.)
  // 6. Bom & akhir ronde.
  tickRound(s, dt);

  // Spectate: bila pemain mati, ikuti bot teman hidup dengan HP tertinggi.
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

// --- Demo attract mode (fase menu): bot-vs-bot penuh tanpa pemain ---
// Jalan otomatis saat load (main.js selalu menjalankan stepFrame).
// DEPLOY membuang state demo: onStart memanggil resetMatch + startMatch.
function startDemo(s) {
  spawnBots(s);
  for (const b of s.bots) {
    b.money = 4000; // demo: semua bot mampu beli rifle/SMG
    botBuy(s, b);
    b.hp = 100; b.alive = true;
  }
  s.player.alive = false; // bot musuh tidak membidik pemain saat demo
  s.player.hp = 0;
  s.bomb.state = 'carried'; s.bomb.timer = 0; s.mapLit = false;
  const atk = s.bots.filter((b) => (s.playerSide === 'atk') === (b.team === 'you'));
  const carrier = atk[Math.floor(Math.random() * atk.length)];
  s.bomb.carrier = carrier.id; carrier.hasBomb = true;
  s._demoOn = true;
}

function tickDemo(s, dt) {
  if (!s._demoOn) startDemo(s);
  // Bom terplant: hitung mundur, lalu "meledak" dan demo mulai dari nol.
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
      // Bot mati respawn 3 dtk kemudian supaya demo tidak pernah kosong.
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
      // Defuse demo: bom kembali carried, tanpa akhir ronde / skor.
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

// Event suara langkah -> AI hearing. Dipanggil main.js setelah konsumsi events.
export function applyHearing(s, ev) {
  if (ev.type !== 'step') return;
  const radius = ev.crouch ? CFG.BOT.hearCrouch : ev.run ? CFG.BOT.hearRun : CFG.BOT.hearWalk;
  // Langkah pemain didengar bot musuh; langkah bot didengar bot lawan.
  for (const b of s.bots) {
    if (!b.alive) continue;
    if (ev.own && b.team === 'foe') botHear(s, b, ev.x, ev.z, radius, 'step');
    else if (!ev.own && ev.id !== undefined && b.id !== ev.id && b.team !== s.bots[ev.id].team) {
      botHear(s, b, ev.x, ev.z, radius, 'step');
    }
  }
}

// Driver frame: accumulator fixed-step. Kembalikan jumlah tick yang jalan.
export function stepFrame(s, cmd, frameDt) {
  acc += Math.min(frameDt, 0.25);
  let n = 0;
  while (acc >= CFG.TICK && n < CFG.MAX_STEPS) {
    tick(s, cmd, CFG.TICK);
    acc -= CFG.TICK;
    n++;
  }
  if (n === CFG.MAX_STEPS) acc = 0; // buang sisa bila frame sangat lambat
  return n;
}
