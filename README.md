# VOLTLINE PROTOCOL

A 4v4 round-based tactical FPS in the browser — Counter-Strike-style bomb
plant/defuse on an original map, with original art and names. Built with
three.js 0.187.0. 100% offline single-player against AI bots: no accounts,
no network, no build step.

## Overview

You play with three AI teammates against four AI enemies. Attackers carry
the bomb to Site A (North Relay) or Site B (Glass Substation) and plant it;
defenders stop the plant — or defuse the bomb before its 35-second timer
runs out. Win rounds to earn cash, buy better weapons and utility, and take
the match. First to 7 rounds wins (max 12, sides swap after round 6).

## How to Play

**Objective**

- **Attackers:** carry the bomb to a site, hold **E** for 3 s to plant it,
  then defend it until it detonates.
- **Defenders:** stop the plant. If the bomb is planted, hold **E** to
  defuse it — 5 s, or 2.5 s with a Defuse Kit. A round also ends when one
  team is eliminated.
- **Match:** first to 7 rounds, max 12 rounds. Sides swap after round 6.
  A tied 6–6 goes to overtime (win by 2, max 3 OT rounds), then a draw.

**Economy & buy menu**

Every round starts with a 15 s buy phase (press **B**). Earn cash for round
wins ($3,250), losses ($1,900–$3,400 loss bonus), kills ($300), plants
($300) and defuses ($300). Spend it on rifles, SMGs, a sniper, a shotgun,
Kevlar (+ helmet), a Defuse Kit, smoke (Glass Fog) and flash (Jolt).
Weapons are lost on death and kept when you survive. Bots follow the same
buy rules.

**Weapons**

| Weapon | Role |
| --- | --- |
| SPARK | Starting pistol |
| THUNDER-9 | Rifle |
| VOLT NEEDLE | Marksman rifle (scoped) |
| STING-9 | SMG |
| VOLT ARC | Sniper (scoped) |
| DUSK-12 | Shotgun |
| Tactical knife | Slot 3, close range |

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim |
| Left click | Shoot / knife swing |
| R | Reload |
| Shift | Walk (quieter, slower) |
| C | Crouch |
| Space | Jump |
| Hold E | Plant / defuse |
| 1 / 2 / 3 | Primary / pistol / knife |
| 4 | Smoke grenade |
| 5 | Flash grenade |
| B | Buy menu |
| M | Mute |
| Q | Spectate (when dead) |
| P | Deploy |
| H | Guide |

## Features

- **Bot AI** — 4v4 state machine (patrol / hold / engage / retreat /
  plant / defuse) with per-round roles (entry, support, lurker, anchor,
  flex), vision cones, hearing, memory, and fake site rotations. No
  wallhacks: bots see only by line of sight and hear only rough
  directions; smoke fully blocks their vision and fire.
- **Fixed-step simulation** — deterministic 60 Hz game logic, decoupled
  from rendering.
- **Buy menu & economy** — CS-style cash, loss bonuses, and per-round
  loadouts for you and the bots.
- **Grenades** — Glass Fog smoke (18 s, blocks sight) and Jolt flash
  (2.5 s blind, 25 m, 120° cone), with bouncing physics.
- **Synthesized audio** — all sounds are generated with WebAudio; no
  audio files. Every cue has a visual counterpart in the HUD.
- **Three difficulty levels** — Recruit, Veteran, Elite.

## Tech

- three.js 0.187.0 (ES modules, vendored locally — no CDN, no network)
- Plain JavaScript, no build step, no dependencies to install
- Game logic in `game/src/` (`sim.js` drives the fixed-step loop;
  `combat.js`, `bots.js`, `round.js`, `economy.js`, `player.js`,
  `grenades.js`, `audio.js`, `state.js`, `config.js` hold the systems;
  `render.js` and `hud.js` only read state)

## Running Locally

Serve the repo root with any static server — ES modules require
`http(s)`, they will not load from `file://`. The repo includes
`serve.ts` for this:

```sh
# with the included server (Bun)
bun serve.ts
```

Or any static server, e.g.:

```sh
python3 -m http.server
npx serve .
```

Then open the served URL in a browser. Click to lock the pointer and
press **P** (or click DEPLOY) to start the match.

## License

Original game code, map, and art — all names and content are original
creations for this project.
