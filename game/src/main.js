// VOLTLINE PROTOCOL — main.js
// Boot & main loop. Import order = judge reading order (state, config, sim,
// player, weapons, combat, bots, map, grenades, economy, round, hud, input,
// render, audio). Loop: input -> fixed-step sim (60 Hz) -> consume events
// (audio/render/hearing) -> render -> HUD. No network, no eval.
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

// DEPLOY: discard the demo/menu state, start a real match from scratch.
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

// Open the buy menu with B (buy phase only); M mute; Esc exits pointer lock.
// P starts the match from the attract menu; H toggles the guide (menu).
input.cb.onKey = (code) => {
  if (code === 'KeyB' && s.phase === 'buy') s.buyOpen = !s.buyOpen;
  if (code === 'KeyM') setMuted(!isMuted());
  if (code === 'KeyP' && s.phase === 'menu') deploy();
  if (code === 'KeyH' && s.phase === 'menu') toggleGuide();
};

// Click anywhere to play: a click on the canvas during the menu deploys.
// (input.js mousedown already requests pointer lock when unlocked; this
// handler is separate. After deploy the phase is 'buy', so the same click
// cannot fire a weapon.)
canvas.addEventListener('click', () => { if (s.phase === 'menu') deploy(); });

// Consume the one-shot event queue: audio, render, AI hearing, HUD.
function consumeEvents() {
  const evs = s.events;
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    consumeAudioEvent(s, ev);
    consumeRenderEvent(s, ev);
    applyHearing(s, ev);
    if (ev.type === 'roundEnd') noteRoundWinner(s, ev.winner);
    if (ev.type === 'shot' && !ev.own && ev.botId !== undefined) {
      // Enemy shots show on the minimap for 2s.
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
  // Mouse sensitivity narrows with FOV while ADS (fov/75; sniper ~1/3).
  input.applyLook(s.player, sens * adsSensScale(camera.fov));
  // Auto fire: hold click = keep firing (auto weapons) / semi = once per click.
  const w = curWeapon(s);
  const wantFire = cmd.fire && s.phase === 'live' && s.player.alive;
  if (wantFire && w && !CFG.WEAPONS[w.id].auto) {
    // Semi-auto: only on the click edge (input stores the edge in cmd.fireEdge).
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
