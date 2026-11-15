// VOLTLINE PROTOCOL — hud.js
// HUD: panel HTML di atas canvas. String & DOM hanya diperbarui bila nilainya
// berubah (cache last-*). Minimap 160px + compass strip. Buy menu, menu utama
// (poster penjelas), overlay akhir ronde & akhir match.
import { CFG, TEAM_SHORT, SITE_NAMES } from './config.js';
import { shopItems } from './economy.js';
import { curWeapon } from './state.js';
import { BOXES, SITES } from './map.js';

const $ = (id) => document.getElementById(id);
const last = {}; // cache nilai terakhir per kunci
function setText(id, v) {
  if (last[id] !== v) { last[id] = v; const el = $(id); if (el) el.textContent = v; }
}
function show(id, on) {
  const k = id + ':show';
  if (last[k] !== on) { last[k] = on; const el = $(id); if (el) el.style.display = on ? '' : 'none'; }
}
function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

let mm = null, mmCtx = null;
let callbacks = {};

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
  show('matchend', s.phase === 'matchend');
  show('roundend', s.phase === 'end');
  if (s.phase === 'menu') { updateMenu(s); return; }
  if (s.phase === 'matchend') { updateMatchEnd(s); return; }

  // --- Kiri bawah: HP / armor / uang ---
  setText('hp', String(Math.max(0, Math.round(p.hp))));
  $('hp').style.color = p.hp < 20 ? '#FF3B30' : p.hp < 40 ? '#FF8A1E' : '#F5F5F0';
  $('hpbar').style.width = Math.max(0, p.hp) + '%';
  setText('armor', p.armor > 0 ? '🛡 ' + Math.round(p.armor) + (p.helm ? ' +HELM' : '') : '—');
  setText('money', '$' + p.money);

  // --- Kanan bawah: senjata & ammo ---
  setText('wname', w ? CFG.WEAPONS[w.id].name : '—');
  setText('ammoMag', w ? String(w.mag) : '—');
  setText('ammoRes', w ? (w.reserve === -1 ? '∞' : String(w.reserve)) : '');
  $('ammoMag').style.color = w && w.mag === 0 ? '#FF3B30' : '#F5F5F0';
  setText('reloadHint', w && w.reloading > 0 ? 'RELOADING…' : (w && w.mag === 0 ? 'R — RELOAD' : ''));
  setText('slot1', p.primary ? CFG.WEAPONS[p.primary.id].name : '—');
  setText('slot2', 'PERCIK');
  setText('slot3', `◉ ×${p.grenades.smoke} KABUT · ✦ ×${p.grenades.flash} SENTAK`);
  $('slot1').classList.toggle('on', p.slot === 'primary');
  $('slot2').classList.toggle('on', p.slot === 'secondary');
  if (p.hasBomb) setText('bombTag', '● BOM — PLANT DI SITE'); else setText('bombTag', '');

  // --- Atas tengah: timer / fase / skor ---
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
  setText('scoreYou', `${TEAM_SHORT[s.playerSide === 'atk' ? 'def' : 'atk']} ${s.scoreFoe} — ${s.scoreYou} ${TEAM_SHORT[s.playerSide === 'atk' ? 'atk' : 'def']}`);
  setText('scoreLine', `KAMU (${s.playerSide === 'atk' ? 'PENYERANG' : 'DEFENDER'}) · FIRST TO 7 · RONDE ${s.round}/12${s.ot ? ' · OT' + s.ot : ''}`);

  // --- Kill feed & daftar tim ---
  const kf = $('killfeed');
  if (kf && last.kf !== s.killfeed.length + (s.killfeed[0] ? s.killfeed[0].t : 0)) {
    last.kf = s.killfeed.length + (s.killfeed[0] ? s.killfeed[0].t : 0);
    kf.innerHTML = s.killfeed.map((k) =>
      `<div><b class="atk">${k.a}</b> [${CFG.WEAPONS[k.w] ? CFG.WEAPONS[k.w].name : k.w}] <b class="def">${k.b}</b>${k.head ? ' <i>HEADSHOT</i>' : ''}</div>`).join('');
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

  // --- Minimap & compass ---
  drawMinimap(s);
  updateCompass(s);

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
  // Pemain: panah putih.
  const p = s.player;
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
