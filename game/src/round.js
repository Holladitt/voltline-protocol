// VOLTLINE PROTOCOL — round.js
import { CFG, SITE_NAMES } from './config.js';
import { resetRound, emit, radio } from './state.js';
import { spawnBots, botBuy } from './bots.js';
import { spawnPlayer } from './player.js';
import { awardRound } from './economy.js';
import { giveBotWeapon } from './weapons.js';

export function startMatch(s) {
  s.scoreYou = 0; s.scoreFoe = 0; s.round = 1; s.ot = 0; s.matchOver = false; s.winner = null;
  s.playerSide = 'atk';
  s.player.money = CFG.MONEY.start;
  for (const b of s.bots) { b.money = CFG.MONEY.start; b.kills = 0; b.deaths = 0; b.dmg = 0; }
  s.player.kills = 0; s.player.deaths = 0; s.player.dmg = 0;
  s.player.primary = null; s.player.secondary = { id: 'percik', mag: 12, reserve: -1, reloading: 0, reloadT: 0, lastShot: -9, shots: 0, spreadBloom: 0, settleT: 0 };
  s.player.slot = 'secondary'; s.player.armor = 0; s.player.helm = false; s.player.hasKit = false;
  startRound(s);
}

export function startRound(s) {
  resetRound(s);
  spawnPlayer(s);
  spawnBots(s);
  const atkBots = s.bots.filter((b) => (s.playerSide === 'atk') === (b.team === 'you'));
  if (s.playerSide === 'atk') {
    s.player.hasBomb = true;
    s.bomb.carrier = -1; // -1 = player
  } else {
    s.player.hasBomb = false;
    const carrier = atkBots[Math.floor(Math.random() * atkBots.length)];
    s.bomb.carrier = carrier.id;
    carrier.hasBomb = true;
  }
  for (const b of s.bots) botBuy(s, b);
  s.phase = 'buy'; s.phaseT = CFG.ROUND.buy; s.buyOpen = true;
  s.time = 0;
  emit(s, 'roundStart', { round: s.round, side: s.playerSide });
}

function aliveCount(s, team) {
  let n = 0;
  if (team === 'you' && s.player.alive) n++;
  for (const b of s.bots) if (b.team === team && b.alive) n++;
  return n;
}

export function tickRound(s, dt) {
  if (s.phase === 'menu' || s.phase === 'matchend') return;
  s.phaseT -= dt;
  const b = s.bomb;

  if (s.phase === 'buy' && s.phaseT <= 0) {
    s.phase = 'freeze'; s.phaseT = CFG.ROUND.freeze; s.buyOpen = false;
    emit(s, 'phase', { phase: 'freeze' });
  } else if (s.phase === 'freeze' && s.phaseT <= 0) {
    s.phase = 'live'; s.phaseT = CFG.ROUND.live;
    emit(s, 'phase', { phase: 'live' });
  } else if (s.phase === 'intermission' && s.phaseT <= 0) {
    startRound(s);
  } else if (s.phase === 'live') {
    if (b.state === 'planted') {
      b.timer -= dt;
      b.beepT -= dt;
      if (b.beepT <= 0) {
        emit(s, 'bombBeep', { urgent: b.timer < 10 });
        b.beepT = b.timer < 5 ? 0.25 : b.timer < 10 ? 0.5 : 1.0;
      }
      if (b.timer <= 0) { emit(s, 'bombExplode', {}); return endRound(s, s.playerSide === 'atk' ? 'you' : 'foe', 'BOMB DETONATED'); }
    } else if (s.phaseT <= 0) {
      return endRound(s, s.playerSide === 'atk' ? 'foe' : 'you', 'TIME UP — NO PLANT');
    }
    const atkTeam = s.playerSide === 'atk' ? 'you' : 'foe';
    const defTeam = atkTeam === 'you' ? 'foe' : 'you';
    const atkAlive = aliveCount(s, atkTeam), defAlive = aliveCount(s, defTeam);
    if (b.state === 'planted') {
      if (defAlive === 0) return endRound(s, atkTeam, 'DEFENDERS ELIMINATED — BOMB DETONATES');
    } else {
      if (atkAlive === 0) return endRound(s, defTeam, 'ATTACKERS ELIMINATED');
      if (defAlive === 0) return endRound(s, atkTeam, 'DEFENDERS ELIMINATED');
    }
  } else if (s.phase === 'end' && s.phaseT <= 0) {
    nextRound(s);
  }
}

export function plantBomb(s, planter, site) {
  const b = s.bomb;
  b.state = 'planted'; b.site = site;
  b.x = planter.x; b.z = planter.z;
  b.timer = CFG.ROUND.bombTimer; b.beepT = 1;
  b.planter = planter === s.player ? -1 : planter.id;
  s.mapLit = true; // map lights turn volt yellow
  if (planter === s.player) {
    s.player.money = Math.min(CFG.MONEY.cap, s.player.money + CFG.MONEY.plant);
    s.roundStats.money += CFG.MONEY.plant;
    s.player.hasBomb = false;
  } else if (planter.money !== undefined) {
    planter.money = Math.min(CFG.MONEY.cap, planter.money + CFG.MONEY.plant);
  }
  emit(s, 'planted', { site, by: planter === s.player ? 'YOU' : planter.name });
  radio(s, `${planter === s.player ? 'YOU' : planter.name}: BOMB PLANTED AT ${'AB'[site]}`, true);
}

export function defuseBomb(s, defuser) {
  const b = s.bomb;
  b.state = 'defused'; b.defuser = defuser === s.player ? -1 : defuser.id;
  s.mapLit = false;
  if (defuser === s.player) {
    s.player.money = Math.min(CFG.MONEY.cap, s.player.money + CFG.MONEY.defuse);
    s.roundStats.money += CFG.MONEY.defuse;
  }
  emit(s, 'defused', { by: defuser === s.player ? 'YOU' : defuser.name });
  radio(s, `${defuser === s.player ? 'YOU' : defuser.name}: BOMB DEFUSED`, true);
  endRound(s, s.playerSide === 'atk' ? 'foe' : 'you', 'BOMB DEFUSED');
}

function endRound(s, winner, reason) {
  if (s.phase === 'end') return;
  s.phase = 'end'; s.phaseT = CFG.ROUND.end;
  s.endReason = reason;
  if (winner === 'you') s.scoreYou++; else s.scoreFoe++;
  awardRound(s, winner, reason);
  if (!s.player.alive) { s.player.primary = null; s.player.armor = 0; s.player.helm = false; s.player.hasKit = false; }
  for (const b of s.bots) if (!b.alive) { b.weaponId = 'percik'; b.armor = 0; b.helm = false; b.hasKit = false; }
  s.endDetail = `ROUND ${s.round} · ${SITE_NAMES[s.bomb.site] || ''}`;
  emit(s, 'roundEnd', { winner, reason, scoreYou: s.scoreYou, scoreFoe: s.scoreFoe });
}

function nextRound(s) {
  const toWin = CFG.ROUND.toWin;
  if (s.scoreYou >= toWin || s.scoreFoe >= toWin) return endMatch(s);
  if (s.round >= CFG.ROUND.maxRounds) {
    if (s.scoreYou === s.scoreFoe) {
      if (s.ot < CFG.ROUND.otMax) { s.ot++; s.round++; startRound(s); return; }
      return endMatch(s); // draw
    }
    return endMatch(s);
  }
  s.round++;
  if (s.round === 7) {
    s.playerSide = s.playerSide === 'atk' ? 'def' : 'atk';
    s.phase = 'intermission'; s.phaseT = CFG.ROUND.inter;
    emit(s, 'sideSwap', { side: s.playerSide });
    return;
  }
  startRound(s);
}

function endMatch(s) {
  s.phase = 'matchend'; s.phaseT = 0; s.matchOver = true;
  if (s.scoreYou > s.scoreFoe) s.winner = 'you';
  else if (s.scoreFoe > s.scoreYou) s.winner = 'foe';
  else s.winner = 'draw';
  let mvp = s.player, mk = s.player.kills;
  for (const b of s.bots) if (b.kills > mk) { mk = b.kills; mvp = b; }
  s.mvp = mvp === s.player ? 'YOU' : mvp.name;
  emit(s, 'matchEnd', { winner: s.winner, scoreYou: s.scoreYou, scoreFoe: s.scoreFoe, mvp: s.mvp });
}

export function scoreLine(s) {
  return { you: s.scoreYou, foe: s.scoreFoe, round: s.round };
}
