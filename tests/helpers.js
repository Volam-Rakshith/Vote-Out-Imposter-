// Shared test helpers: seeded RNG (deterministic but still exercising the
// real unbiased integer paths), player factories and game-driving utilities.

import {
  createRng, createLocalGame, acknowledgeRole, castVote, WORD_DB,
} from '../engine/index.js';

/** Deterministic rng (mulberry32) wrapped in the engine's createRng API. */
export function seededRng(seed) {
  let a = seed >>> 0;
  function nextUint32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  return createRng(nextUint32);
}

export function makePlayers(names) {
  return names.map((n, i) => ({ id: 'p' + (i + 1), name: n }));
}

export const QUIET_CONFIG = {
  discussionTimerSec: 0,
  votingTimerSec: 0,
};

export function newGame({ names = ['Asha', 'Balu', 'Chitra', 'Dev', 'Esha'], config = {}, seed = 1 } = {}) {
  const rng = seededRng(seed);
  const players = makePlayers(names);
  const state = createLocalGame({
    players,
    config: { ...QUIET_CONFIG, ...config },
    rng,
    db: WORD_DB,
  });
  return { state, rng, players };
}

export function ackAll(state, now = 1000) {
  for (const p of state.players) state = acknowledgeRole(state, { playerId: p.id, now });
  return state;
}

export function castVotes(state, map, now = 2000) {
  for (const [voter, target] of Object.entries(map)) {
    state = castVote(state, { playerId: voter, targetId: target, now });
  }
  return state;
}

/** Role of a player in the current round. */
export function roleOf(state, playerId) {
  return state.rounds[state.roundIndex].roles[playerId];
}

/** The imposters of the current round. */
export function impostersOf(state) {
  const round = state.rounds[state.roundIndex];
  return state.players.filter((p) => round.roles[p.id] === 'imposter').map((p) => p.id);
}

export function errCode(fn) {
  try {
    fn();
  } catch (e) {
    return e.code ?? null;
  }
  return null;
}
