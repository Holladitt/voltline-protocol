// VOLTLINE PROTOCOL — input.js
// Keyboard + mouse + pointer lock menjadi perintah bersih {f, s, run, crouch,
// jump, fire, ads, reload, use, slot, grenade, specNext}. Sim membaca cmd;
// input tidak pernah menyentuh state game langsung (kecuali callback UI).
import { CFG } from './config.js';

export function createInput(canvas) {
  const keys = {};
  const cmd = {
    f: 0, s: 0, run: true, crouch: false, jump: false,
    fire: false, ads: false, reload: false, use: false,
    slot: null, grenade: null, specNext: false,
    lookDX: 0, lookDY: 0,
  };
  const cb = { onKey: null, onLockChange: null, onFire: null };
  let locked = false;

  function key(e) { return e.code; }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { keys[key(e)] = true; return; }
    keys[key(e)] = true;
    if (key(e) === 'KeyR') cmd.reload = true;
    if (key(e) === 'Digit1') cmd.slot = 'primary';
    if (key(e) === 'Digit2') cmd.slot = 'secondary';
    if (key(e) === 'Digit4') cmd.grenade = 'smoke';
    if (key(e) === 'Digit5') cmd.grenade = 'flash';
    if (key(e) === 'KeyQ') cmd.specNext = true;
    if (cb.onKey) cb.onKey(key(e), e);
    if (['Space', 'Tab'].includes(key(e))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[key(e)] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; cmd.fire = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (!locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) cmd.fire = true;
    if (e.button === 2) cmd.ads = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) cmd.fire = false;
    if (e.button === 2) cmd.ads = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (cb.onLockChange) cb.onLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    cmd.lookDX += e.movementX;
    cmd.lookDY += e.movementY;
  });

  // Terapkan look ke pemain; dipanggil main.js tiap frame SEBELUM sim.
  function applyLook(p, sens) {
    if (cmd.lookDX || cmd.lookDY) {
      p.yaw -= cmd.lookDX * 0.0022 * sens;
      p.pitch -= cmd.lookDY * 0.0022 * sens;
      const lim = Math.PI / 2 - 0.01;
      p.pitch = Math.max(-lim, Math.min(lim, p.pitch));
      cmd.lookDX = 0; cmd.lookDY = 0;
    }
  }

  // Baca state tombol menjadi cmd gerak (dipanggil tiap frame).
  function poll() {
    const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    cmd.f = f; cmd.s = s;
    cmd.run = !keys['ShiftLeft'] && !keys['ShiftRight'];
    cmd.crouch = !!(keys['KeyC'] || keys['ControlLeft']);
    cmd.jump = !!keys['Space'];
    cmd.use = !!keys['KeyE'];
    return cmd;
  }

  // Konsumsi flag sekali-pakai setelah sim membacanya.
  function consume() {
    cmd.reload = false; cmd.slot = null; cmd.grenade = null; cmd.specNext = false;
  }

  return { cmd, cb, poll, consume, applyLook, isLocked: () => locked, requestLock: () => canvas.requestPointerLock() };
}
