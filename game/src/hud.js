// VOLTLINE PROTOCOL — hud.js
// HUD: panel HTML di atas canvas. String & DOM hanya diperbarui bila nilainya
// berubah (cache last-*). Minimap 160px + compass strip. Buy menu, menu utama
// (poster penjelas), overlay akhir ronde & akhir match.
import { CFG, SITE_NAMES } from './config.js';
import { shopItems } from './economy.js';
import { curWeapon } from './state.js';
import { BOXES, SITES } from './map.js';

const $ = (id) => document.getElementById(id);
const last = {}; // cache nilai terakhir per kunci
function setText(id, v) {
  if (last[id] !== v) { last[id] = v; const el = $(id); if (el) el.textContent = v; }
}
const SHOW_DISPLAY = { kitBadge: 'inline' }; // span inline di baris UANG — 'block' akan pindah baris
function show(id, on) {
  const k = id + ':show';
  if (last[k] !== on) { last[k] = on; const el = $(id); if (el) el.style.display = on ? (SHOW_DISPLAY[id] || 'block') : 'none'; }
}
function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

let mm = null, mmCtx = null;
let callbacks = {};
let guideOn = false;
export function toggleGuide() { guideOn = !guideOn; show('guide', guideOn); }
export function hideGuide() { guideOn = false; show('guide', false); }

export function initHUD(s, cb) {
  callbacks = cb;
  mm = $('minimap'); if (mm) mmCtx = mm.getContext('2d');
  const start = $('startBtn');
  if (start) start.addEventListener('click', () => { cb.onStart && cb.onStart(); });
  const rematch = $('rematchBtn');
  if (rematch) rematch.addEventListener('click', () => { cb.onRematch && cb.onRematch(); });
  const toMenu = $('menuBtn');
  if (toMenu) toMenu.addEventListener('click', () => { cb.onMenu && cb.onMenu(); });
  const auto = $('autoBuyBtn');
  if (auto) auto.addEventListener('click', () => { cb.onAutoBuy && cb.onAutoBuy(); });
  const close = $('closeBuyBtn');
  if (close) close.addEventListener('click', () => { show('buymenu', false); });
  const mute = $('muteBtn');
  if (mute) mute.addEventListener('click', () => { cb.onMute && cb.onMute(); });
  const guideBtn = $('guideBtn');
  if (guideBtn) guideBtn.addEventListener('click', () => toggleGuide());
  const guideClose = $('guideCloseBtn');
  if (guideClose) guideClose.addEventListener('click', () => hideGuide());
  const vol = $('volSlider');
  if (vol) vol.addEventListener('input', () => { cb.onVolume && cb.onVolume(vol.value / 100); });
  document.querySelectorAll('[data-diff]').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-diff]').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      cb.onDiff && cb.onDiff(b.dataset.diff);
    });
  });
  buildBuyMenu(s);
}

export function buildBuyMenu(s) {
  const box = $('buyItems');
  if (!box) return;
  box.innerHTML = '';
  for (const it of shopItems(s)) {
    const d = document.createElement('div');
    d.className = 'buyItem';
    d.dataset.id = it.id;
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}</span><i>$${it.price}</i>`;
    d.addEventListener('click', () => { callbacks.onBuy && callbacks.onBuy(it.id); });
    box.appendChild(d);
  }
}

// Perbarui seluruh HUD dari state (read-only). Dipanggil tiap frame render.
export function updateHUD(s, dt) {
  const p = s.player;
  const w = curWeapon(s);
  const inGame = s.phase !== 'menu' && s.phase !== 'matchend';
  show('hud', inGame);
  show('menu', s.phase === 'menu');
  show('aiPilot', s.phase === 'menu');
  show('matchend', s.phase === 'matchend');
  show('roundend', s.phase === 'end');
  if (s.phase === 'menu') { updateMenu(s); return; }
  if (s.phase === 'matchend') { updateMatchEnd(s); return; }

  // --- Kiri bawah: faksi & peran + HP besar + bar hijau + armor + bar biru + kit ---
  setText('faction', s.playerSide === 'atk' ? 'PEMUTUS SIRKUIT · PENYERANG' : 'PENJAGA ARUS · BERTAHAN');
  setText('hp', String(Math.max(0, Math.round(p.hp))));
  $('hp').style.color = p.hp < 20 ? '#FF3B30' : p.hp < 40 ? '#FF8A1E' : '#F5F5F0';
  $('hpbar').style.width = Math.max(0, p.hp) + '%';
  setText('armor', p.armor > 0 ? '🛡 ' + Math.round(p.armor) + (p.helm ? ' +HELM' : '') : '—');
  $('armorBar').style.width = Math.min(100, Math.round(p.armor)) + '%';
  setText('money', '$' + p.money);
  show('kitBadge', p.hasKit);

  // --- Kanan bawah: jenis & nama senjata + amunisi besar + bar slot bernomor ---
  if (p.slot === 'melee') {
    setText('wname', 'PISAU TAKTIS');
    setText('ammoMag', '—');
    setText('ammoRes', '');
    $('ammoMag').style.color = '#F5F5F0';
    setText('reloadHint', 'KLIK — AYUN');
  } else {
    setText('wname', w ? CFG.WEAPONS[w.id].name : '—');
    setText('ammoMag', w ? String(w.mag) : '—');
    setText('ammoRes', w ? (w.reserve === -1 ? '∞' : String(w.reserve)) : '');
    $('ammoMag').style.color = w && w.mag === 0 ? '#FF3B30' : '#F5F5F0';
    setText('reloadHint', w && w.reloading > 0 ? 'RELOADING…' : (w && w.mag === 0 ? 'R — RELOAD' : ''));
  }
  const sbKey = p.slot + '|' + (p.primary ? p.primary.id : '-') + '|' + p.grenades.smoke + '|' + p.grenades.flash;
  if (last.slotBar !== sbKey) {
    last.slotBar = sbKey;
    const el = $('slotBar');
    if (el) {
      const nm = (on, txt) => `<b class="${on ? 'on' : ''}">${txt}</b>`;
      el.innerHTML =
        nm(p.slot === 'primary', '[1] ' + (p.primary ? CFG.WEAPONS[p.primary.id].name : '—')) + ' · ' +
        nm(p.slot === 'secondary', '[2] PERCIK') + ' · ' +
        nm(p.slot === 'melee', '[3] PISAU') + ' · ' +
        nm(false, '[4] SMOKE ×' + p.grenades.smoke) + ' · ' +
        nm(false, '[5] FLASH ×' + p.grenades.flash);
    }
  }
  if (p.hasBomb) setText('bombTag', '● BOM — PLANT DI SITE'); else setText('bombTag', '');

  // --- Atas tengah: nama tim + kotak hidup 4v4 + skor + timer + status bom ---
  setText('teamsLine', `PEMUTUS SIRKUIT ${alivePips(s, 'atk')} · ${alivePips(s, 'def')} PENJAGA ARUS`);
  setText('bombStatus', bombStatusText(s));
  const bomb = s.bomb;
  if (bomb.state === 'planted') {
    setText('timer', fmtTime(bomb.timer));
    $('timer').style.color = bomb.timer < 10 ? '#FF3B30' : '#FF8A1E';
    setText('phase', 'BOM TERPLANT — ' + SITE_NAMES[bomb.site]);
  } else {
    setText('timer', fmtTime(s.phaseT));
    $('timer').style.color = '#F5F5F0';
    const ph = { buy: 'BUY PHASE', freeze: 'FREEZE — SIAP', live: s.playerSide === 'atk' ? 'PLANT BOM DI SITE' : 'JAGA SITE', end: 'RONDE SELESAI', intermission: 'GANTI SISI' }[s.phase] || '';
    setText('phase', `RONDE ${s.round} — ${ph}`);
  }
  setText('scoreLine', `SKOR ${s.scoreYou} — ${s.scoreFoe} · RONDE ${s.round}/12${s.ot ? ' · OT' + s.ot : ''} · KAMU (${s.playerSide === 'atk' ? 'PENYERANG' : 'DEFENDER'}) · FIRST TO 7`);

  // --- Kill feed & daftar tim ---
  const kf = $('killfeed');
  if (kf && last.kf !== s.killfeed.length + (s.killfeed[0] ? s.killfeed[0].t : 0)) {
    last.kf = s.killfeed.length + (s.killfeed[0] ? s.killfeed[0].t : 0);
    kf.innerHTML = s.killfeed.map((k) =>
      `<div><b class="atk">${k.a}</b> [${CFG.WEAPONS[k.w] ? CFG.WEAPONS[k.w].name : (k.w === 'pisau' ? 'PISAU' : k.w)}] <b class="def">${k.b}</b>${k.head ? ' <i>HEADSHOT</i>' : ''}</div>`).join('');
  }
  // --- Radio taktis bot (maks 3 baris, kedaluwarsa 5 dtk) ---
  const rd = $('radio');
  if (rd) {
    const lines = s.log.filter((e) => s.time - e.t >= 0 && s.time - e.t < 5).slice(-3);
    const key = lines.map((e) => e.t + e.txt).join('|');
    if (last.radio !== key) {
      last.radio = key;
      rd.innerHTML = lines.map((e) => `<div>📻 ${e.txt}</div>`).join('');
    }
  }
  setText('teamYou', 'ARUS · ' + teamAlive(s, 'you'));
  setText('teamFoe', 'PEMUTUS · ' + teamAlive(s, 'foe'));

  // --- Crosshair: celah melebar saat gerak/tembak, menyempit saat crouch/diam ---
  const w2 = curWeapon(s);
  const spread = w2 ? (p.moveMag > 0.5 ? 14 : p.crouch ? 5 : 8) + (w2.spreadBloom || 0) * 6 : 8;
  const ch = $('crosshair');
  if (ch) ch.style.setProperty('--gap', Math.round(spread) + 'px');
  show('hitmark', p.hitmarkT > 0);
  if (p.hitmarkT > 0) {
    $('hitmark').className = 'hm' + (p.hitmarkKill ? ' kill' : p.hitmarkHead ? ' head' : '');
  }
  // Damage direction arc + vignette.
  $('vignette').style.opacity = p.hp < 40 && p.alive ? String((40 - p.hp) / 40 * 0.8 + 0.2) : '0';
  const dd = $('dmgdir');
  if (dd) {
    dd.style.opacity = p.dmgDirT > 0 ? '1' : '0';
    dd.style.transform = `translate(-50%,-50%) rotate(${p.dmgDir}rad)`;
  }
  // Flash overlay.
  const fl = $('flashov');
  if (fl) fl.style.opacity = p.flashT > 0 ? String(Math.min(1, p.flashT / 2.5)) : '0';
  // Scope overlay untuk sniper/DMR saat ADS.
  show('scope', p.ads && w && CFG.WEAPONS[w.id].scope >= 2);

  // --- Prompt kontekstual (HOLD E) ---
  updatePrompt(s);

  // --- Buy menu ---
  show('buymenu', s.phase === 'buy' && s.buyOpen);
  if (s.phase === 'buy') {
    setText('buyMoney', '$' + p.money);
    setText('buyTimer', 'BUY — ' + fmtTime(s.phaseT));
    document.querySelectorAll('.buyItem').forEach((el) => {
      const it = shopItems(s).find((i) => i.id === el.dataset.id);
      if (it) el.classList.toggle('cant', p.money < it.price);
    });
  }

  // --- Spectate ---
  show('spectate', !p.alive && s.phase === 'live');
  if (!p.alive && s.phase === 'live' && p.spectate >= 0) {
    const b = s.bots[p.spectate];
    if (b) setText('specText', `MENONTON ${b.name} · HP ${Math.round(b.hp)} · ${CFG.WEAPONS[b.weapon.id].name} · Q ganti · RONDE BERLANJUT`);
  }

  // --- Minimap & compass & label lokasi ---
  drawMinimap(s);
  updateCompass(s);
  setText('locLabel', '▸ ' + locName(s.player.x, s.player.z));

  // --- Round-end overlay ---
  if (s.phase === 'end') {
    const won = (s._lastWinner || 'you') === 'you';
    setText('roundTitle', won ? 'RONDE MENANG' : 'RONDE KALAH');
    $('roundTitle').style.color = won ? '#FF8A1E' : '#3FA9F5';
    setText('roundReason', s.endReason + ' · ' + s.endDetail);
    setText('roundStats', `KILL ${s.roundStats.kills} · DAMAGE ${Math.round(p.dmg)} · UANG +$${s.roundStats.money} · SKOR ${s.scoreYou} — ${s.scoreFoe}`);
    setText('nextRound', 'RONDE BERIKUTNYA — ' + fmtTime(s.phaseT));
  }
}

export function noteRoundWinner(s, w) { s._lastWinner = w; }

function teamAlive(s, team) {
  let n = team === 'you' && s.player.alive ? 1 : 0;
  for (const b of s.bots) if (b.team === team && b.alive) n++;
  return n + ' HIDUP';
}

// Kotak pemain hidup 4v4: ■ hidup, □ mati (untuk satu sisi atk/def).
function alivePips(s, side) {
  const team = (s.playerSide === 'atk') === (side === 'atk') ? 'you' : 'foe';
  let n = 0;
  if (team === 'you' && s.player.alive) n++;
  for (const b of s.bots) if (b.team === team && b.alive) n++;
  return '■'.repeat(n) + '□'.repeat(4 - n);
}

// Status bom di tengah atas: CORE ARMED (dibawa) / PLANTED + timer / DEFUSED.
function bombStatusText(s) {
  const b = s.bomb;
  if (b.state === 'planted') return `◉ PLANTED — ${SITE_NAMES[b.site]} ${fmtTime(b.timer)}`;
  if (b.state === 'defused') return '○ DEFUSED';
  if (s.phase === 'live') return '● CORE ARMED — PLANT DI SITE';
  return '';
}

// Nama lokasi aktif pemain (di bawah minimap).
function locName(x, z) {
  if (Math.hypot(x + 20, z + 14) <= 5) return 'RELAY UTARA — SITE A';
  if (Math.hypot(x - 20, z + 14) <= 5) return 'GARDU KACA — SITE B';
  if (z >= -2 && z <= 2) return 'KORIDOR VOLT';
  if (z < -9) return 'TERAS PANEL';
  if (z > 9) return 'LORONG KABEL';
  return 'SIRKUIT KACA';
}

function updatePrompt(s) {
  const p = s.player;
  const el = $('prompt');
  if (!el) return;
  let txt = '', pct = 0, showBar = false;
  if (s.phase === 'live' && p.alive) {
    const site = siteAt(s, p.x, p.z);
    if (s.playerSide === 'atk' && p.hasBomb && s.bomb.state === 'carried' && site >= 0) {
      txt = `HOLD E — PLANT (${SITE_NAMES[site]})`; pct = p.plantT / CFG.ROUND.plantTime; showBar = true;
    } else if (s.playerSide === 'def' && s.bomb.state === 'planted' && site === s.bomb.site) {
      txt = `HOLD E — DEFUSE (${SITE_NAMES[site]})`;
      pct = p.defuseT / (p.hasKit ? CFG.ROUND.defuseKitTime : CFG.ROUND.defuseTime); showBar = true;
    } else if (s.playerSide === 'atk' && p.hasBomb && s.bomb.state === 'carried') {
      const d = Math.min(distToSiteIdx(s, 0), distToSiteIdx(s, 1));
      const near = distToSiteIdx(s, 0) < distToSiteIdx(s, 1) ? 0 : 1;
      txt = `SITE ${SITE_NAMES[near]} — ${Math.round(d)}m →`;
    }
  }
  if (last.prompt !== txt) { last.prompt = txt; el.style.display = txt ? '' : 'none'; $('promptTxt').textContent = txt; }
  if (showBar) $('promptBar').style.width = Math.round(pct * 100) + '%';
  else $('promptBar').style.width = '0%';
}
function siteAt(s, x, z) {
  for (let i = 0; i < 2; i++) {
    const st = SITES[i];
    const dx = x - st.cx, dz = z - st.cz;
    if (dx * dx + dz * dz <= st.r * st.r) return i;
  }
  return -1;
}
function distToSiteIdx(s, i) {
  const st = SITES[i];
  return Math.max(0, Math.hypot(s.player.x - st.cx, s.player.z - st.cz) - st.r);
}

function drawMinimap(s) {
  if (!mmCtx) return;
  const c = mmCtx, W = 160, H = 160;
  const sx = W / 64, sz = H / 44;
  const X = (x) => (x + 32) * sx, Z = (z) => (z + 22) * sz;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(8,12,28,0.85)'; c.fillRect(0, 0, W, H);
  // Dinding & cover.
  c.strokeStyle = 'rgba(245,245,240,0.7)'; c.lineWidth = 1;
  for (const b of BOXES) c.strokeRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sx, (b.z1 - b.z0) * sz);
  // Site.
  c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
  SITES.forEach((st, i) => {
    c.fillStyle = s.bomb.state === 'planted' && s.bomb.site === i ? '#FF3B30' : '#FF8A1E';
    c.fillRect(X(st.cx) - 8, Z(st.cz) - 8, 16, 16);
    c.fillStyle = '#0b1026'; c.fillText(i === 0 ? 'A' : 'B', X(st.cx), Z(st.cz) + 4);
  });
  // Bot kawan biru, musuh merah hanya bila terlihat / baru menembak.
  for (const b of s.bots) {
    if (!b.alive) continue;
    if (b.team === 'you') { c.fillStyle = '#3FA9F5'; c.beginPath(); c.arc(X(b.x), Z(b.z), 3, 0, 7); c.fill(); }
    else if (b.vis || s.time - (b._lastShotSeen || 0) < 2) {
      c.fillStyle = '#FF3B30'; c.beginPath(); c.arc(X(b.x), Z(b.z), 3, 0, 7); c.fill();
    }
  }
  // View cone pemain (kerucut pandang 75°, jangkauan ~40 m) — kuning transparan.
  const p = s.player;
  c.fillStyle = 'rgba(255,210,26,0.14)';
  c.beginPath();
  c.moveTo(X(p.x), Z(p.z));
  c.arc(X(p.x), Z(p.z), 100, -p.yaw - Math.PI / 2 - 0.65, -p.yaw - Math.PI / 2 + 0.65);
  c.closePath(); c.fill();
  // Pemain: panah putih.
  c.save(); c.translate(X(p.x), Z(p.z)); c.rotate(-p.yaw);
  c.fillStyle = '#F5F5F0';
  c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
  c.restore();
}

function updateCompass(s) {
  const el = $('compass');
  if (!el) return;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const yaw = s.player.yaw;
  let deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  setText('compass', `${dirs[idx]} ${Math.round(deg)}° · A RELAY UTARA · B GARDU KACA`);
}

function updateMenu(s) {
  setText('menuScore', `FIRST TO 7 · 12 RONDE · PARUH 6 · OT UNGGUL 2`);
  const d = CFG.DIFF[s.diff];
  setText('menuDiff', `KESULITAN: ${d.label} (reaksi ${d.react[0]}–${d.react[1]} dtk)`);
}

function updateMatchEnd(s) {
  const won = s.winner === 'you';
  setText('matchTitle', s.winner === 'draw' ? 'SERI' : won ? 'VICTORY' : 'DEFEAT');
  $('matchTitle').style.color = won ? '#FF8A1E' : s.winner === 'draw' ? '#F5F5F0' : '#3FA9F5';
  setText('matchScore', `${s.scoreYou} : ${s.scoreFoe}`);
  setText('matchMvp', `MVP: ${s.mvp || '—'}`);
  const rows = [];
  const p = s.player;
  rows.push(['KAMU', p.kills, p.deaths, Math.round(p.dmg), '$' + p.money]);
  for (const b of s.bots) rows.push([b.name, b.kills, b.deaths, Math.round(b.dmg), '$' + b.money]);
  const key = JSON.stringify(rows);
  if (last.matchTable !== key) {
    last.matchTable = key;
    $('matchTable').innerHTML = '<tr><th>PEMAIN</th><th>K</th><th>D</th><th>DMG</th><th>UANG</th></tr>' +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('');
  }
}
