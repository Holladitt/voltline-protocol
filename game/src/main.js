// VOLTLINE PROTOCOL — main.js
// Boot & loop utama. Urutan impor = urutan baca judge (state, config, sim,
// player, weapons, combat, bots, map, grenades, economy, round, hud, input,
// render, audio). Loop: input -> fixed-step sim (60 Hz) -> konsumsi event
// (audio/render/hearing) -> render -> HUD. Tanpa network, tanpa eval.
import { createState, resetMatch, curWeapon } from './state.js';
import { CFG } from './config.js';
import { stepFrame, applyHearing } from './sim.js';
import './player.js';
import './weapons.js';
import './combat.js';
import './bots.js';
import './map.js';
import './grenades.js';
import { buy, autoBuy } from './economy.js';
import { startMatch } from './round.js';
import { initHUD, updateHUD, buildBuyMenu, noteRoundWinner } from './hud.js';
import { createInput } from './input.js';
import { initRender, render, consumeRenderEvent } from './render.js';
import { initAudio, resumeAudio, setMuted, isMuted, setVolume, setAiming, consumeAudioEvent } from './audio.js';

const canvas = document.getElementById('game');
const s = createState();
const input = createInput(canvas);
const { renderer } = initRender(canvas);

let lastT = performance.now();
let sens = 1;

initHUD(s, {
  onStart: () => {
    initAudio(); resumeAudio();
    input.requestLock();
    resetMatch(s, s.diff);
    startMatch(s);
  },
  onRematch: () => { resetMatch(s, s.diff); startMatch(s); input.requestLock(); },
  onMenu: () => { resetMatch(s, s.diff); document.exitPointerLock && document.exitPointerLock(); },
  onBuy: (id) => { const r = buy(s, id); if (!r.ok) flashBuyMsg(r.reason); },
  onAutoBuy: () => autoBuy(s),
  onDiff: (d) => { s.diff = d; },
  onMute: () => { setMuted(!isMuted()); const b = document.getElementById('muteBtn'); if (b) b.textContent = isMuted() ? '🔇' : '🔊'; },
  onVolume: (v) => setVolume(v),
});

function flashBuyMsg(msg) {
  const el = document.getElementById('buyMsg');
  if (el) { el.textContent = msg; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 1500); }
}

// Buka buy menu dengan B (hanya fase buy); M mute; Esc keluar pointer lock.
input.cb.onKey = (code) => {
  if (code === 'KeyB' && s.phase === 'buy') s.buyOpen = !s.buyOpen;
  if (code === 'KeyM') setMuted(!isMuted());
};

// Konsumsi antrean event sekali-pakai: audio, render, hearing AI, HUD.
function consumeEvents() {
  const evs = s.events;
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    consumeAudioEvent(s, ev);
    consumeRenderEvent(s, ev);
    applyHearing(s, ev);
    if (ev.type === 'roundEnd') noteRoundWinner(s, ev.winner);
    if (ev.type === 'shot' && !ev.own && ev.botId !== undefined) {
      // Tembakan musuh terlihat di minimap 2 dtk.
      const b = s.bots[ev.botId];
      if (b) b._lastShotSeen = s.time;
    }
    if (ev.type === 'bought') buildBuyMenu(s);
  }
  evs.length = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const cmd = input.poll();
  input.applyLook(s.player, sens);
  // Tembakan otomatis: tahan klik = tembak terus (senjata auto) / semi = sekali per klik.
  const w = curWeapon(s);
  const wantFire = cmd.fire && s.phase === 'live' && s.player.alive;
  if (wantFire && w && !CFG.WEAPONS[w.id].auto) {
    // Semi-auto: hanya pada transisi klik (input menyimpan edge di cmd.fireEdge).
    cmd.fire = cmd.fire && !cmd._fired;
    cmd._fired = true;
  } else if (!cmd.fire) cmd._fired = false;
  stepFrame(s, cmd, frameDt);
  input.consume();
  consumeEvents();
  setAiming(!!cmd.ads);
  render(s, frameDt, now / 1000);
  updateHUD(s, frameDt);
}

requestAnimationFrame(frame);
