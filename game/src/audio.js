// VOLTLINE PROTOCOL — audio.js
// All sounds are synthesized WebAudio: one AudioContext (first gesture),
// one master gain, one reused 1 s white-noise buffer.
// No audio files. Every audio cue has a visual counterpart in the HUD.
// Events are consumed from state.events by main.js (consumeEvents).
let ctx = null, master = null, noiseBuf = null, muted = false, vol = 0.7;
let windSrc = null, windGain = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startWind();
  } catch (e) { ctx = null; }
}
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : vol; }
export function isMuted() { return muted; }
export function setVolume(v) { vol = v; if (master && !muted) master.gain.value = v; }

function startWind() {
  windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuf; windSrc.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
  windGain = ctx.createGain(); windGain.gain.value = 0.05;
  windSrc.connect(f); f.connect(windGain); windGain.connect(master);
  windSrc.start();
}
export function setAiming(ads) { if (windGain) windGain.gain.value = ads ? 0 : 0.05; }

// Util: noise burst through a filter + envelope. No per-frame allocation
// (nodes are created per sound event — event, not per render frame).
function burst(dur, filterType, freq, gain, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}
function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function panFor(x, z, px, pz, yaw) {
  // Stereo pan from position relative to the player's view direction.
  const dx = x - px, dz = z - pz;
  const rx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return Math.max(-0.9, Math.min(0.9, rx / 12));
}

// Sound signature per weapon (audible range: rifle 35 m, pistol/SMG 25 m, sniper 45 m).
const SHOT_SIG = {
  percik: () => { burst(0.09, 'highpass', 1800, 0.5); burst(0.05, 'lowpass', 400, 0.3); },
  petir9: () => { burst(0.16, 'lowpass', 900, 0.8); burst(0.02, 'highpass', 2500, 0.6); tone(70, 0.08, 'sine', 0.5); },
  jarum: () => { burst(0.14, 'bandpass', 1400, 0.7); tone(90, 0.1, 'sine', 0.4); },
  sengat9: () => { burst(0.07, 'bandpass', 1400, 0.55); },
  busur: () => { burst(0.12, 'highpass', 3000, 0.9); burst(0.25, 'lowpass', 300, 0.9); burst(0.4, 'lowpass', 300, 0.25, 0.12); },
  senja12: () => { burst(0.18, 'lowpass', 700, 0.9); tone(60, 0.12, 'sine', 0.6); },
};

export function playShot(id, own, dist) {
  if (!ctx) return;
  const sig = SHOT_SIG[id] || SHOT_SIG.petir9;
  if (own) { sig(); return; }
  // Bot shots: distance attenuation + increasingly muffled (low-pass closes).
  const att = 1 / (1 + (dist || 10) / 10);
  if (att < 0.08) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.value = Math.max(400, 4000 - (dist || 10) * 80);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7 * att, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + 0.17);
}

export function playReload() {
  burst(0.03, 'highpass', 2200, 0.4);
  burst(0.12, 'bandpass', 800, 0.35, 0.25);
  burst(0.06, 'highpass', 1600, 0.4, 0.55);
}
export function playDry() { burst(0.02, 'highpass', 3000, 0.3); }
export function playHitmark(head, kill) {
  tone(head ? 5200 : 4000, 0.03, 'square', 0.25);
  if (head) tone(5200, 0.03, 'square', 0.2, 0.05);
  if (kill) tone(600, 0.15, 'sine', 0.35, 0.02, 300);
}
export function playStep(own, run, crouch, pan) {
  if (!ctx || muted) return;
  const v = own ? (crouch ? 0.08 : 0.22) : (crouch ? 0.15 : 0.5);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = own ? 250 : 500;
  const g = ctx.createGain(); g.gain.setValueAtTime(v * (run ? 1.4 : 1), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(f); f.connect(g);
  if (pn) { pn.pan.value = pan || 0; g.connect(pn); pn.connect(master); }
  else g.connect(master);
  src.start(t); src.stop(t + 0.09);
}
export function playPlantBeep() { tone(880, 0.05, 'sine', 0.3); }
export function playBombBeep(urgent) { tone(1000, 0.08, 'sine', urgent ? 0.5 : 0.35); }
export function playExplosion() {
  burst(0.8, 'lowpass', 120, 1.0);
  tone(150, 0.6, 'sine', 0.8, 0, 40);
  burst(1.2, 'lowpass', 200, 0.3, 0.3);
  tone(8000, 0.5, 'sine', 0.05, 0.1); // ears ringing
}
export function playDefuseOk() {
  tone(660, 0.12, 'sine', 0.35); tone(880, 0.12, 'sine', 0.35, 0.12);
  tone(1320, 0.2, 'sine', 0.35, 0.24);
}
export function playStinger(win) {
  if (win) { tone(440, 0.25, 'sawtooth', 0.25); tone(660, 0.3, 'sawtooth', 0.25, 0.2); }
  else { tone(330, 0.3, 'sawtooth', 0.2); tone(220, 0.35, 'sawtooth', 0.2, 0.25); }
}
export function playFlash() { burst(0.15, 'highpass', 4000, 0.4); }
export function playSmoke() { burst(0.5, 'lowpass', 300, 0.3); }
export function playSpotted() { tone(700, 0.1, 'sine', 0.25); tone(900, 0.12, 'sine', 0.25, 0.1); }

// Consume one event from state.events. Called by main.js every frame.
export function consumeAudioEvent(s, ev) {
  if (!ctx) return;
  const p = s.player;
  switch (ev.type) {
    case 'shot': playShot(ev.id, ev.own, ev.dist || 0); break;
    case 'reload': playReload(); break;
    case 'dryfire': playDry(); break;
    case 'hitmark': playHitmark(ev.head, ev.kill); break;
    case 'step': playStep(ev.own, ev.run, ev.crouch, ev.own ? 0 : panFor(ev.x, ev.z, p.x, p.z, p.yaw)); break;
    case 'plantBeep': playPlantBeep(); break;
    case 'bombBeep': playBombBeep(ev.urgent); break;
    case 'planted': playStinger(true); break;
    case 'defused': playDefuseOk(); break;
    case 'flash': playFlash(); break;
    case 'smoke': playSmoke(); break;
    case 'kill': if (ev.attacker === 'YOU') playHitmark(ev.head, true); break;
    case 'roundEnd': playStinger(ev.winner === 'you'); break;
    case 'playerHit': tone(200, 0.08, 'sine', 0.3); break;
    case 'swing': burst(0.12, 'bandpass', 900, 0.4); break;
  }
}
