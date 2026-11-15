// VOLTLINE PROTOCOL — tests/sim_twoside.mjs
// Headless two-sided match smoke test. Runs a full match tick loop with the
// player idle, once attacking and once defending, ~120 s per side. Counts
// bot-in-collision samples (a living bot overlapping a box) — must be zero —
// and reports shots, kills, rounds and score as proof the match is alive.
// Deterministic: Math.random is replaced by a seeded generator.
// Usage: node tests/sim_twoside.mjs
import { createState } from '../game/src/state.js';
import { startMatch, startRound } from '../game/src/round.js';
import { tick } from '../game/src/sim.js';
import { collides } from '../game/src/map.js';

const DT = 1 / 60;
const TICKS = 120 * 60; // 120 s per side
// Idle player command: stands at spawn, never fires.
const IDLE = { f: 0, s: 0, run: false, crouch: false, jump: false, fire: false, ads: false, reload: false, slot: null, grenade: null, use: false };

// --- Deterministic RNG (mulberry32) so runs are repeatable. ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(2026);

function runSide(side) {
  const s = createState();
  startMatch(s);
  if (side === 'def') { s.playerSide = 'def'; startRound(s); }
  // Skip buy/freeze: jump straight to live.
  s.phase = 'live'; s.phaseT = 100;
  let shots = 0, kills = 0, collisionSamples = 0;
  let firstCollision = null;
  let maxRound = 1;
  for (let t = 0; t < TICKS; t++) {
    tick(s, { ...IDLE }, DT);
    for (const e of s.events) {
      if (e.type === 'shot') shots++;
      if (e.type === 'kill') kills++;
    }
    s.events.length = 0; // drain (the browser loop does this every frame)
    for (const b of s.bots) {
      if (!b.alive) continue;
      if (collides(b.x, b.z, 0.38, b.y)) {
        collisionSamples++;
        if (!firstCollision) firstCollision = { tick: t, bot: b.id, pos: [Number(b.x.toFixed(2)), Number(b.z.toFixed(2))], state: b.state };
      }
    }
    if (s.round > maxRound) maxRound = s.round;
  }
  const moved = s.bots.filter((b) => Math.hypot(b.x, b.z) > 0.5).length;
  const result = { side, ticks: TICKS, seconds: 120, shots, kills, collisions: collisionSamples, firstCollision, roundsReached: maxRound, score: [s.scoreYou, s.scoreFoe], phase: s.phase, botsMoved: moved };
  console.log(`[${side}] ${JSON.stringify(result)}`);
  return result;
}

const atk = runSide('atk');
const def = runSide('def');
const pass = atk.collisions === 0 && def.collisions === 0 && atk.shots > 0 && def.shots > 0;
console.log(`sim_twoside: collisions atk=${atk.collisions} def=${def.collisions}, shots atk=${atk.shots} def=${def.shots} -> ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
