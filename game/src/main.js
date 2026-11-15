// VOLTLINE PROTOCOL — main.js
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
import { initHUD, updateHUD, buildBuyMenu, noteRoundWinner, toggleGuide, hideGuide } from './hud.js';
import { createInput } from './input.js';
import { initRender, render, consumeRenderEvent, adsSensScale } from './render.js';
import { initAudio, resumeAudio, setMuted, isMuted, setVolume, setAiming, consumeAudioEvent } from './audio.js';

const canvas = document.getElementById('game');
const s = createState();
const input = createInput(canvas);
const { renderer, camera } = initRender(canvas);

let lastT = performance.now();
let sens = 1;

function deploy() {
  initAudio(); resumeAudio();
  hideGuide();
  input.requestLock();
  resetMatch(s, s.diff);
  startMatch(s);
}

initHUD(s, {
  onStart: () => { deploy(); },
  onRematch: () => { deploy(); },
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

input.cb.onKey = (code) => {
  if (code === 'KeyB' && s.phase === 'buy') s.buyOpen = !s.buyOpen;
  if (code === 'KeyM') setMuted(!isMuted());
  if (code === 'KeyP' && s.phase === 'menu') deploy();
  if (code === 'KeyH' && s.phase === 'menu') toggleGuide();
};

canvas.addEventListener('click', () => { if (s.phase === 'menu') deploy(); });

function consumeEvents() {
  const evs = s.events;
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    consumeAudioEvent(s, ev);
    consumeRenderEvent(s, ev);
    applyHearing(s, ev);
    if (ev.type === 'roundEnd') noteRoundWinner(s, ev.winner);
    if (ev.type === 'shot' && !ev.own && ev.botId !== undefined) {
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
  input.applyLook(s.player, sens * adsSensScale(camera.fov));
  const w = curWeapon(s);
  const wantFire = cmd.fire && s.phase === 'live' && s.player.alive;
  if (wantFire && w && !CFG.WEAPONS[w.id].auto) {
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
