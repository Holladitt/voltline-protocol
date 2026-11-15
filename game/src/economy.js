// VOLTLINE PROTOCOL — economy.js
// Uang & buy menu: harga dari config, validasi daya beli, senjata hilang saat
// mati dan terbawa bila selamat. Bot memakai aturan yang sama (bots.js).
import { CFG } from './config.js';
import { giveWeapon, giveBotWeapon } from './weapons.js';
import { emit } from './state.js';

// Daftar barang buy menu: {kind, id, name, price, desc}.
export function shopItems(s) {
  const p = s.player;
  const items = [];
  for (const id of ['petir9', 'jarum', 'sengat9', 'busur', 'senja12']) {
    const w = CFG.WEAPONS[id];
    items.push({ kind: 'weapon', id, name: w.name, price: w.price, desc: `${w.body}/${w.head} dmg · ${w.rpm} rpm · mag ${w.mag}` });
  }
  items.push({ kind: 'armor', id: 'kevlar', name: 'KEVLAR', price: CFG.ARMOR.kevlar, desc: 'Damage badan -35%' });
  items.push({ kind: 'armor', id: 'kevlarHelm', name: 'KEVLAR + HELM', price: CFG.ARMOR.kevlarHelm, desc: 'Badan -35% · Headshot -40%' });
  items.push({ kind: 'kit', id: 'kit', name: 'DEFUSE KIT', price: CFG.ARMOR.kit, desc: 'Defuse 5 dtk jadi 2.5 dtk' });
  items.push({ kind: 'grenade', id: 'smoke', name: 'KABUT KACA', price: CFG.GRENADES.smoke.price, desc: 'Smoke 18 dtk · blokir pandang' });
  items.push({ kind: 'grenade', id: 'flash', name: 'SENTAK', price: CFG.GRENADES.flash.price, desc: 'Flash 2.5 dtk · 25 m' });
  return items;
}

export function canAfford(s, price) { return s.player.money >= price; }

// Beli satu barang. Kembalikan {ok, reason}.
export function buy(s, itemId) {
  const p = s.player;
  if (s.phase !== 'buy') return { ok: false, reason: 'Buy hanya saat fase buy' };
  const item = shopItems(s).find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'Barang tidak dikenal' };
  if (p.money < item.price) return { ok: false, reason: 'Uang tidak cukup' };
  if (item.kind === 'weapon') {
    if (p.primary && p.primary.id === item.id) return { ok: false, reason: 'Sudah dimiliki' };
    p.money -= item.price;
    giveWeapon(s, item.id);
  } else if (item.kind === 'armor') {
    if (p.armor > 0) return { ok: false, reason: 'Armor sudah dipakai' };
    p.money -= item.price;
    p.armor = 100;
    if (item.id === 'kevlarHelm') p.helm = true;
  } else if (item.kind === 'kit') {
    if (p.hasKit) return { ok: false, reason: 'Kit sudah dimiliki' };
    p.money -= item.price; p.hasKit = true;
  } else if (item.kind === 'grenade') {
    if (p.grenades[item.id] >= 1) return { ok: false, reason: 'Maks 1 per ronde' };
    p.money -= item.price; p.grenades[item.id] = 1;
  }
  emit(s, 'bought', { id: itemId, money: p.money });
  return { ok: true };
}

// Auto-buy: rifle + armor bila mampu, else SMG, else simpan.
export function autoBuy(s) {
  const p = s.player;
  if (p.money >= 3350 && !p.primary) buy(s, 'petir9');
  if (p.money >= 650 && p.armor <= 0) buy(s, 'kevlar');
  if (p.money >= 300 && p.grenades.smoke === 0) buy(s, 'smoke');
}

// Hadiah akhir ronde. winner: 'you' | 'foe'. reason: teks untuk banner.
export function awardRound(s, winner, reason) {
  const p = s.player;
  const won = winner === 'you';
  if (won) {
    s.winStreak++; s.lossStreak = 0;
    p.money = Math.min(CFG.MONEY.cap, p.money + CFG.MONEY.win);
    s.roundStats.money += CFG.MONEY.win;
  } else {
    s.lossStreak++; s.winStreak = 0;
    const loss = s.lossStreak === 1 ? CFG.MONEY.loss
      : s.lossStreak === 2 ? CFG.MONEY.loss2
      : Math.min(CFG.MONEY.lossCap, CFG.MONEY.loss3 + (s.lossStreak - 3) * 500);
    p.money = Math.min(CFG.MONEY.cap, p.money + loss);
    s.roundStats.money += loss;
  }
  // Bot juga dibayar (untuk buy ronde berikut).
  for (const b of s.bots) {
    const bWon = (winner === 'you') === (b.team === 'you');
    b.money = Math.min(CFG.MONEY.cap, b.money + (bWon ? CFG.MONEY.win : CFG.MONEY.loss));
  }
  return reason;
}
