// VOLTLINE PROTOCOL — state.js
// SATU-SATUNYA tempat state dibuat dan direset. Semua modul menerima referensi
// objek ini; tidak ada salinan angka yang sama di dua tempat. Hanya sim.js yang
// menulis state gameplay; hud.js dan render.js hanya membaca.
import { CFG } from './config.js';

export const BOT_DEFS = [
  // Tim pemain (3 bot kawan) — nama, peran awal. 4v4: pemain + 3 bot.
  { team: 'you', name: 'RAKA',  role: 'entry' },
  { team: 'you', name: 'SINTA', role: 'support' },
  { team: 'you', name: 'BIMO',  role: 'lurker' },
  // Tim lawan (4 bot musuh).
  { team: 'foe', name: 'GUNTUR', role: 'entry' },
  { team: 'foe', name: 'PETIR',  role: 'support' },
  { team: 'foe', name: 'KILAT',  role: 'lurker' },
  { team: 'foe', name: 'SENGAT', role: 'anchor' },
];

export function newWeaponState(id) {
  const w = CFG.WEAPONS[id];
  return { id, mag: w.mag, reserve: w.reserve, reloading: 0, reloadT: 0, lastShot: -9, shots: 0, spreadBloom: 0, settleT: 0 };
}

export function newBot(def, i) {
  return {
    id: i, team: def.team, name: def.name, role: def.role,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0,
    hp: 100, armor: 0, helm: false, alive: true,
    crouch: false, moving: false, speed: 0,
    state: 'buy', // buy | patrol | hold | engage | retreat | plant | defuse
    wp: 0, route: [], routeI: 0, waitT: 0, holdYaw: 0,
    weapon: newWeaponState('percik'), weaponId: 'percik',
    target: -1, targetIsPlayer: false, seenT: 0, seenX: 0, seenZ: 0, reactT: 0, burstLeft: 0, burstPause: 0,
    hearX: 0, hearZ: 0, hearT: 0, hearConf: 0,
    plantT: 0, defuseT: 0, flashT: 0, smokeT: 0,
    kills: 0, deaths: 0, dmg: 0, money: 800, hasKit: false,
    grenades: { smoke: 0, flash: 0 }, usedSmoke: false, usedFlash: false,
    stepT: 0, shotT: 0, aimErr: 0, lastPosX: 0, lastPosZ: 0,
    vis: false, // terlihat pemain (untuk minimap)
  };
}

export function createState() {
  const s = {
    phase: 'menu', phaseT: 0, round: 1, roundInHalf: 1,
    scoreYou: 0, scoreFoe: 0, ot: 0, matchOver: false, winner: null, mvp: null,
    playerSide: 'atk', // ronde 1-6 menyerang, 7-12 bertahan
    diff: 'veteran',
    time: 0, tick: 0,
    bomb: { state: 'carried', site: -1, x: 0, z: 0, timer: 0, carrier: -1, progress: 0, planter: -1, defuser: -1, beepT: 0 },
    player: {
      x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0,
      hp: 100, armor: 0, helm: false, alive: true, crouch: false, onGround: true,
      money: CFG.MONEY.start, kills: 0, deaths: 0, dmg: 0, assists: 0,
      hasKit: false, hasBomb: false, spectate: -1,
      primary: null, secondary: newWeaponState('percik'), slot: 'secondary',
      grenades: { smoke: 0, flash: 0 },
      flashT: 0, flashFull: 0, shake: 0, stepT: 0, ads: false, adsT: 0,
      spreadBloom: 0, settleT: 0, hitmarkT: 0, hitmarkHead: false, hitmarkKill: false,
      dmgDir: 0, dmgDirT: 0, lastHitBy: -1, plantT: 0, defuseT: 0,
      moveMag: 0, airT: 0,
    },
    bots: [],
    smokes: [],   // {x,y,z, t, dur, r} — memblokir garis pandang bot & pemain
    flashes: [],  // {x,y,z, t} — ledakan flash yang sedang aktif
    nades: [],    // granat di udara {x,y,z,vx,vy,vz,kind,owner,t}
    events: [],   // antrean event sekali-pakai untuk audio/hud/render
    killfeed: [], // {a, b, w, head, t}
    roundStats: { kills: 0, dmg: 0, money: 0 },
    lossStreak: 0, winStreak: 0,
    buyOpen: false, paused: false,
    mapLit: false, // lampu map kuning volt saat bom ter-plant
    menuCam: 0, endReason: '', endDetail: '',
    log: [], // pesan singkat di HUD (mis. "BOT MENANAM BOM")
  };
  for (let i = 0; i < 7; i++) s.bots.push(newBot(BOT_DEFS[i], i));
  return s;
}

// Reset penuh match (dari menu / rematch).
export function resetMatch(s, diff) {
  const keep = s.diff;
  const fresh = createState();
  Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
  s.diff = diff || keep;
  s.phase = 'menu';
}

// Reset ronde: posisi, HP, senjata yang selamat dibawa, uang tetap.
export function resetRound(s) {
  s.bomb = { state: 'carried', site: -1, x: 0, z: 0, timer: 0, carrier: -1, progress: 0, planter: -1, defuser: -1, beepT: 0 };
  s.smokes.length = 0; s.flashes.length = 0; s.nades.length = 0;
  s.killfeed.length = 0; s.events.length = 0;
  s.roundStats = { kills: 0, dmg: 0, money: 0 };
  s.mapLit = false; s.endReason = ''; s.endDetail = '';
  s._fakeDone = false;  const p = s.player;
  p.hp = 100; p.alive = true; p.crouch = false; p.flashT = 0; p.flashFull = 0;
  p.plantT = 0; p.defuseT = 0; p.spectate = -1; p.ads = false; p.shake = 0;
  p.hitmarkT = 0; p.dmgDirT = 0; p.moveMag = 0;
  if (!p.primary) p.slot = 'secondary';
  else p.slot = 'primary';
  // Senjata yang selamat: magasin & cadangan dibawa; yang mati kehilangan primary.
  for (const w of [p.primary, p.secondary]) if (w) { w.reloading = 0; w.reloadT = 0; w.spreadBloom = 0; }
  p.grenades = { smoke: 0, flash: 0 };
  for (const b of s.bots) {
    b.hp = 100; b.alive = true; b.crouch = false; b.state = 'buy';
    b.target = -1; b.seenT = 0; b.reactT = 0; b.burstLeft = 0; b.burstPause = 0;
    b.plantT = 0; b.defuseT = 0; b.flashT = 0; b.smokeT = 0;
    b.grenades = { smoke: 0, flash: 0 }; b.usedSmoke = false; b.usedFlash = false;
    b.weapon.reloading = 0; b.weapon.reloadT = 0; b.weapon.spreadBloom = 0;
    b.vis = false; b.hearT = 0; b._phits = 0; b.holdUntil = undefined; b._site = undefined;
  }
}

export function curWeapon(s) {
  const p = s.player;
  return p.slot === 'primary' ? p.primary : p.secondary;
}

export function emit(s, type, data) {
  s.events.push({ type, ...data });
}
