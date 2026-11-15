// VOLTLINE PROTOCOL — config.js
// Satu-satunya tempat angka penyeimbang tinggal. Semua modul membaca dari sini;
// tidak ada angka damage, harga, atau timer yang diduplikasi di modul lain.
export const CFG = {
  TICK: 1 / 60, MAX_STEPS: 5,
  MAP: { W: 64, H: 44, X0: -32, X1: 32, Z0: -22, Z1: 22 },
  MOVE: {
    walk: 4.2, run: 5.5, crouch: 2.2, accel: 42,
    friction: 10, jump: 5.2, gravity: 14,
  },
  PLAYER: { hp: 100, eye: 1.62, eyeCrouch: 1.12, radius: 0.38, height: 1.72 },
  // Ronde: buy 15 dtk, freeze 5 dtk, live 100 dtk, end 6 dtk, intermission 8 dtk.
  ROUND: {
    buy: 15, freeze: 5, live: 100, end: 6, inter: 8,
    toWin: 7, maxRounds: 12, otMax: 3, bombTimer: 35,
    plantTime: 3, defuseTime: 5, defuseKitTime: 2.5,
  },
  MONEY: {
    start: 800, win: 3250, loss: 1900, loss2: 2400, loss3: 2900,
    lossCap: 3400, kill: 300, plant: 300, defuse: 300, cap: 16000,
  },
  // Senjata: nama, harga, dmg badan/kepala, rpm, mag, cadangan, reload,
  // spread (diam/jalan/crouch, derajat), falloff mulai (m) + lantai,
  // pellets, auto, scope, moveSlow (pengali gerak saat ADS).
  WEAPONS: {
    percik: {
      name: 'PERCIK', price: 0, body: 34, head: 68, rpm: 400,
      mag: 12, reserve: -1, reload: 1.1,
      spread: [0.6, 1.4, 0.5], falloff: [18, 0.60],
      pellets: 1, auto: false, scope: 0, slow: 1,
    },
    petir9: {
      name: 'PETIR-9', price: 2700, body: 33, head: 132, rpm: 600,
      mag: 30, reserve: 90, reload: 2.5,
      spread: [0.5, 1.6, 0.35], falloff: [25, 0.70],
      pellets: 1, auto: true, scope: 0, slow: 1,
    },
    jarum: {
      name: 'JARUM VOLT', price: 3100, body: 55, head: 165, rpm: 240,
      mag: 15, reserve: 45, reload: 2.9,
      spread: [0.15, 2.2, 0.1], falloff: [40, 1.00],
      pellets: 1, auto: false, scope: 2, slow: 0.8,
    },
    sengat9: {
      name: 'SENGAT-9', price: 1500, body: 26, head: 52, rpm: 900,
      mag: 32, reserve: 96, reload: 2.1,
      spread: [0.9, 1.5, 0.7], falloff: [12, 0.45],
      pellets: 1, auto: true, scope: 0, slow: 1,
    },
    busur: {
      name: 'BUSUR VOLT', price: 4750, body: 95, head: 190, rpm: 48,
      mag: 5, reserve: 15, reload: 3.7,
      spread: [3.5, 4.5, 3.0], falloff: [60, 1.00],
      pellets: 1, auto: false, scope: 4, slow: 0.4,
    },
    senja12: {
      name: 'SENJA-12', price: 1100, body: 12, head: 24, rpm: 75,
      mag: 6, reserve: 24, reload: 0.6,
      spread: [4.5, 4.5, 4.5], falloff: [10, 0.30],
      pellets: 8, auto: false, scope: 0, slow: 1, perShell: true,
    },
  },
  ARMOR: { kevlar: 650, kevlarHelm: 1000, kit: 400, bodyRed: 0.35, headRed: 0.40 },
  // Pisau taktis (slot 3, tombol 3): ayunan jarak dekat, tanpa amunisi.
  MELEE: { range: 2.2, dmg: 40, cd: 0.35 },
  GRENADES: {
    smoke: { price: 300, dur: 18, radius: 3.2 },
    flash: { price: 300, dur: 2.5, recover: 1.5, range: 25, cone: 120 },
  },
  // Bot per tingkat kesulitan: reaksi (dtk), akurasi dasar @15m,
  // headshot share, burst, spread pengali.
  DIFF: {
    recruit: {
      react: [0.65, 0.85], acc: 0.28, hs: 0.08,
      burst: [3, 4], spread: 1.35, label: 'RECRUIT',
    },
    veteran: {
      react: [0.45, 0.60], acc: 0.42, hs: 0.12,
      burst: [3, 5], spread: 1.0, label: 'VETERAN',
    },
    elite: {
      react: [0.30, 0.42], acc: 0.55, hs: 0.18,
      burst: [4, 5], spread: 0.8, label: 'ELITE',
    },
  },
  BOT: {
    vision: 100, visionV: 70, sightOpen: 40, sightCorr: 25, memory: 2.5,
    hearRifle: 35, hearPistol: 25, hearSniper: 45,
    hearRun: 12, hearWalk: 8, hearCrouch: 3, fovTurn: 180,
  },
  // Warna tim & palet. Penyerang oranye ember, bertahan biru elektrik.
  COLORS: {
    atk: 0xff7a1a, atkCss: '#FF8A1E', def: 0x3fa9f5, defCss: '#3FA9F5',
    volt: 0xffd21a, voltCss: '#FFD21A', night: 0x0b1026, glass: 0x9fd8ff,
    money: '#7BE495', danger: '#FF3B30',
  },
};
// Urutan slot senjata di HUD & buy menu.
export const SHOP_ORDER = ['petir9', 'jarum', 'sengat9', 'busur', 'senja12', 'percik'];
export const TEAM_NAMES = { atk: 'PEMUTUS SIRKUIT', def: 'PENJAGA ARUS' };
export const TEAM_SHORT = { atk: 'PEMUTUS', def: 'ARUS' };
export const SITE_NAMES = ['RELAY UTARA', 'GARDU KACA'];
