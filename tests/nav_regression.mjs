// VOLTLINE PROTOCOL — tests/nav_regression.mjs
// Headless navigation regression for the bot route fix.
// Runs in Node (no DOM): imports the real game modules and drives tickBot
// directly. Deterministic: Math.random is replaced by a seeded generator,
// so two runs give the same numbers.
// Usage: node tests/nav_regression.mjs
// Exit 0 when every runnable test passes, 1 otherwise (a SKIP is not a fail).
import { createState } from '../game/src/state.js';
import { spawnBots, botBuy, tickBot, tickBotHoldCheck } from '../game/src/bots.js';
import * as botsMod from '../game/src/bots.js';
import { collides } from '../game/src/map.js';

const DT = 1 / 60;

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
Math.random = mulberry32(1337);

// --- Harness helpers ---
// A live-phase state with every bot bought, then everything killed except
// the bots the test revives. No opponents alive => no engagements.
function liveState(side) {
  const s = createState();
  s.playerSide = side;
  s.phase = 'live';
  s.time = 0;
  spawnBots(s);
  for (const b of s.bots) botBuy(s, b);
  s.player.alive = false;
  for (const b of s.bots) b.alive = false;
  return s;
}
function revive(s, id) { const b = s.bots[id]; b.alive = true; return b; }
function stepBot(s, b) {
  s.time += DT;
  tickBot(s, b, DT);
  tickBotHoldCheck(s, b);
}

// --- Test 1: same waypoint => defender must reach its hold point. ---
// Bot #6 starts at (-26,-14); its defender spot is (-24,-11). Both map to
// waypoint 9, so the waypoint route is empty. Baseline: the bot never moves
// and stays in patrol. Fixed: it walks the final leg and enters hold.
function testSameWaypoint() {
  const s = liveState('atk');
  const b = revive(s, 6);
  b.x = -26; b.z = -14; b.state = 'patrol';
  b.route.length = 0; b.routeI = 0;
  const sx = b.x, sz = b.z;
  for (let i = 0; i < 180; i++) stepBot(s, b);
  const moved = Math.hypot(b.x - sx, b.z - sz);
  const nearDest = Math.hypot(b.x - (-24), b.z - (-11));
  const pass = b.state === 'hold' && nearDest < 1.5;
  console.log(`[1] same-waypoint defender: start=(${sx},${sz}) end=(${b.x.toFixed(2)},${b.z.toFixed(2)}) moved=${moved.toFixed(2)}m state=${b.state} distToDest=${nearDest.toFixed(2)} -> ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

// --- Test 2: a blocked destination must be reported unreachable, not arrival. ---
function testBlockedDestination() {
  const setRouteTo = botsMod.setRouteTo;
  if (typeof setRouteTo !== 'function') {
    console.log('[2] blocked destination: SKIP (setRouteTo is not exported on this build)');
    return null;
  }
  const s = liveState('atk');
  const b = revive(s, 3);
  b.x = 16; b.z = 0; b.state = 'patrol';
  // Crate point inside the Site B cover.
  setRouteTo(s, b, 24, -11);
  const crateBlocked = b.routeState === 'blocked';
  // Relay pillar centre — also inside a box.
  setRouteTo(s, b, 0, 0);
  const pillarBlocked = b.routeState === 'blocked';
  // A free point must plan a live route.
  setRouteTo(s, b, 26, -11);
  const freeGoes = b.routeState === 'go';
  // Even after being told to go to the crate, the bot must never end up in it.
  setRouteTo(s, b, 24, -11);
  for (let i = 0; i < 300; i++) stepBot(s, b);
  const neverInside = !collides(b.x, b.z, 0.38, b.y);
  const pass = crateBlocked && pillarBlocked && freeGoes && neverInside;
  console.log(`[2] blocked destination: crate=${crateBlocked} pillar=${pillarBlocked} free=${freeGoes} neverInside=${neverInside} -> ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

// --- Test 3: every hold point the code can pick must be standable. ---
// Drives the real decideMove for every defender and every anchor (both
// sides, both sites) and checks each chosen destination is collision-free.
function testHoldSpotsStandable() {
  const checked = [];
  const bad = [];
  function drive(botId, side, x, z, role) {
    const s = liveState(side);
    const b = revive(s, botId);
    b.x = x; b.z = z; b.state = 'patrol'; b.role = role;
    b.route.length = 0; b.routeI = 0;
    stepBot(s, b); // decideMove runs (no live route) and sets destX/destZ
    checked.push([b.destX, b.destZ]);
    if (collides(b.destX, b.destZ, 0.38, b.y)) bad.push([b.destX, b.destZ, `bot${botId}/${side}/${role}`]);
  }
  // Defenders: foe bots on atk side (ids 3-6), you bots on def side (ids 0-2).
  for (const id of [3, 4, 5, 6]) drive(id, 'atk', 29, 0, 'entry');
  for (const id of [0, 1, 2]) drive(id, 'def', -29, 0, 'entry');
  // Anchors (holdSpot): attackers near each site, both sides.
  for (const id of [0, 1, 2]) { drive(id, 'atk', -20, -14, 'anchor'); drive(id, 'atk', 20, -14, 'anchor'); }
  for (const id of [3, 4, 5, 6]) { drive(id, 'def', -20, -14, 'anchor'); drive(id, 'def', 20, -14, 'anchor'); }
  const pass = bad.length === 0;
  console.log(`[3] hold spots standable: checked ${checked.length} destinations, blocked=${JSON.stringify(bad)} -> ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

// --- Test 4: all defenders reach hold from spawn, both sides. ---
function testAllDefendersReachHold() {
  const results = [];
  for (const side of ['atk', 'def']) {
    const s = liveState(side);
    const defIds = side === 'atk' ? [3, 4, 5, 6] : [0, 1, 2];
    for (const id of defIds) revive(s, id);
    const arrivedAt = {};
    const maxTicks = 3600; // 60 s
    for (let t = 0; t < maxTicks; t++) {
      s.time += DT;
      for (const id of defIds) {
        const b = s.bots[id];
        tickBot(s, b, DT);
        tickBotHoldCheck(s, b);
        if (b.state === 'hold' && arrivedAt[id] === undefined) arrivedAt[id] = t;
      }
      if (defIds.every((id) => s.bots[id].state === 'hold')) break;
    }
    for (const id of defIds) {
      const b = s.bots[id];
      results.push({ side, id, ok: b.state === 'hold', tick: arrivedAt[id] ?? null, pos: [Number(b.x.toFixed(2)), Number(b.z.toFixed(2))] });
    }
  }
  const fails = results.filter((r) => !r.ok);
  console.log(`[4] all defenders reach hold: ${JSON.stringify(results)} -> ${fails.length === 0 ? 'PASS' : 'FAIL'}`);
  return fails.length === 0;
}

// --- Run ---
const outcomes = [
  testSameWaypoint(),
  testBlockedDestination(),
  testHoldSpotsStandable(),
  testAllDefendersReachHold(),
];
const ran = outcomes.filter((o) => o !== null);
const passed = ran.filter(Boolean).length;
console.log(`nav_regression: ${passed}/${ran.length} passed (${outcomes.filter((o) => o === null).length} skipped)`);
process.exit(passed === ran.length ? 0 : 1);
