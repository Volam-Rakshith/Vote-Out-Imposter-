// Explicit phase-transition validation (spec §3.2): invalid transitions are
// rejected, never silently accepted.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalGame, createLobby, lobbyAddPlayer, lobbyRemovePlayer, lobbySetName,
  lobbySetConfig, startGame, acknowledgeRole, skipReveal, endDiscussion, castVote,
  endVoting, advance, submitGuess, endGuessing, playAgain, abortGame, WORD_DB,
  nextSpeaker, checkTimers, toPublicState,
} from '../engine/index.js';
import { makePlayers, seededRng, QUIET_CONFIG } from './helpers.js';

const code = (fn) => {
  try { fn(); } catch (e) { return e.code ?? null; }
  return null;
};

describe('transition guards', () => {
  test('voting actions rejected outside the voting phase', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(1), db: WORD_DB });
    assert.equal(code(() => castVote(s, { playerId: 'p1', targetId: 'p2' })), 'WRONG_PHASE');
    assert.equal(code(() => endVoting(s, {})), 'WRONG_PHASE');
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    assert.equal(s.phase, 'discussion');
    assert.equal(code(() => castVote(s, { playerId: 'p1', targetId: 'p2', now: 20 })), 'WRONG_PHASE');
    assert.equal(code(() => endVoting(s, { now: 20 })), 'WRONG_PHASE');
    s = endDiscussion(s, { now: 30 });
    assert.equal(s.phase, 'voting');
    assert.equal(code(() => endDiscussion(s, { now: 40 })), 'WRONG_PHASE');
    s = castVote(s, { playerId: 'p1', targetId: 'p2', now: 50 });
    s = castVote(s, { playerId: 'p2', targetId: 'p3', now: 60 });
    s = castVote(s, { playerId: 'p3', targetId: 'p2', now: 70 });
    s = castVote(s, { playerId: 'p4', targetId: 'p2', now: 80 });
    assert.equal(s.phase, 'vote_result');
    assert.equal(code(() => endVoting(s, { now: 90 })), 'WRONG_PHASE');
    assert.equal(code(() => castVote(s, { playerId: 'p1', targetId: 'p3', now: 90 })), 'WRONG_PHASE');
  });

  test('advance rejected outside vote_result/round_result', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(2), db: WORD_DB });
    assert.equal(code(() => advance(s, { now: 10 })), 'WRONG_PHASE');
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    assert.equal(code(() => advance(s, { now: 20 })), 'WRONG_PHASE');
    s = endDiscussion(s, { now: 30 });
    assert.equal(code(() => advance(s, { now: 40 })), 'WRONG_PHASE');
  });

  test('guess actions rejected outside the guess phase', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    const s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(3), db: WORD_DB });
    assert.equal(code(() => submitGuess(s, { playerId: 'p1', guess: 'x' })), 'WRONG_PHASE');
    assert.equal(code(() => endGuessing(s, {})), 'WRONG_PHASE');
  });

  test('playAgain only from game_result; skipReveal only from role_reveal', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(4), db: WORD_DB });
    assert.equal(code(() => playAgain(s, { rng: seededRng(1), db: WORD_DB })), 'WRONG_PHASE');
    assert.equal(code(() => skipReveal(s, {})), null); // valid here
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    assert.equal(code(() => skipReveal(s, { now: 20 })), 'WRONG_PHASE');
  });

  test('lobby operations rejected once the game has started', () => {
    const host = { id: 'h1', name: 'Host' };
    let lobby = createLobby({ host, rng: seededRng(5) });
    lobby = lobbyAddPlayer(lobby, { player: { id: 'p2', name: 'Balu' } });
    lobby = lobbyAddPlayer(lobby, { player: { id: 'p3', name: 'Chitra' } });
    lobby = startGame(lobby, { rng: seededRng(6), db: WORD_DB });
    assert.equal(lobby.phase, 'role_reveal');
    assert.equal(code(() => lobbyAddPlayer(lobby, { player: { id: 'p4', name: 'Dev' } })), 'WRONG_PHASE');
    assert.equal(code(() => lobbyRemovePlayer(lobby, { playerId: 'p2' })), 'WRONG_PHASE');
    assert.equal(code(() => lobbySetName(lobby, { playerId: 'p2', name: 'NewName' })), 'WRONG_PHASE');
    assert.equal(code(() => lobbySetConfig(lobby, { config: {}, db: WORD_DB })), 'WRONG_PHASE');
    assert.equal(code(() => startGame(lobby, { rng: seededRng(7), db: WORD_DB })), 'WRONG_PHASE');
  });

  test('startGame refuses with too few players', () => {
    const host = { id: 'h1', name: 'Host' };
    let lobby = createLobby({ host, rng: seededRng(8) });
    lobby = lobbyAddPlayer(lobby, { player: { id: 'p2', name: 'Balu' } });
    assert.equal(code(() => startGame(lobby, { rng: seededRng(9), db: WORD_DB })), 'PLAYER_COUNT');
  });

  test('abort transitions to aborted and blocks further play', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(10), db: WORD_DB });
    s = abortGame(s, { reason: 'test' });
    assert.equal(s.phase, 'aborted');
    assert.equal(s.status, 'aborted');
    assert.equal(code(() => endDiscussion(s, { now: 10 })), 'WRONG_PHASE');
    assert.equal(code(() => advance(s, { now: 10 })), 'WRONG_PHASE');
    assert.equal(code(() => playAgain(s, { rng: seededRng(1), db: WORD_DB })), 'WRONG_PHASE');
  });

  test('state survives a JSON round-trip (serialization for storage/transport)', () => {
    const players = makePlayers(['A', 'B', 'C', 'D']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(12), db: WORD_DB });
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    s = endDiscussion(s, { now: 20 });
    s = castVote(s, { playerId: 'p1', targetId: 'p2', now: 30 });
    const roundTripped = JSON.parse(JSON.stringify(s));
    assert.deepEqual(roundTripped.voting.votes, s.voting.votes);
    // engine functions still operate on the deserialized state
    const s2 = castVote(roundTripped, { playerId: 'p2', targetId: 'p3', now: 40 });
    assert.ok(s2.voting.votes.p2);
  });
});

describe('per-player speaking timer (talking-stick mode)', () => {
  const SPK = { speakingTimerSec: 10, discussionTimerSec: 60, votingTimerSec: 0, imposterGuess: false, rounds: 1 };

  function startSpeakingGame(names = ['Asha', 'Balu', 'Chitra', 'Dev']) {
    const players = makePlayers(names);
    let state = createLocalGame({ players, config: SPK, rng: seededRng(3), db: WORD_DB });
    for (const p of players) state = acknowledgeRole(state, { playerId: p.id, now: 10 });
    return { state, players };
  }

  test('discussion begins with a speaking rotation and no shared table timer', () => {
    const { state, players } = startSpeakingGame();
    assert.equal(state.phase, 'discussion');
    assert.ok(state.speaking, 'speaking rotation must exist');
    assert.deepEqual(state.speaking.order, players.map((p) => p.id), 'roster order');
    assert.equal(state.speaking.index, 0);
    assert.equal(state.speaking.secPerPlayer, 10);
    assert.ok(state.timers.speakingEndsAt > 10, 'speaker deadline set');
    assert.equal(state.timers.discussionEndsAt, undefined, 'shared table timer must be suppressed');
    const pub = toPublicState(state);
    assert.equal(pub.speaking.playerId, players[0].id);
    assert.deepEqual(pub.speaking.order, players.map((p) => p.id));
    assert.equal(pub.speaking.secPerPlayer, 10);
  });

  test('expiry advances the speaker; a full pass ends discussion into voting', () => {
    const { state } = startSpeakingGame();
    let s = state;
    // first speaker's 10s expire
    let res = checkTimers(s, { now: 10 + 10001 });
    s = res.state;
    assert.ok(res.changed);
    assert.equal(s.speaking.index, 1);
    assert.equal(s.speaking.order[1], toPublicState(s).speaking.playerId);
    // second speaker expires
    res = checkTimers(s, { now: 10 + 10001 + 12000 });
    s = res.state;
    assert.equal(s.speaking.index, 2);
    // skip the rest manually via nextSpeaker
    s = nextSpeaker(s, { now: 40000 });
    s = nextSpeaker(s, { now: 41000 });
    assert.equal(s.phase, 'voting', 'voting begins after the last speaker');
    assert.equal(s.speaking, null);
    assert.equal(s.timers.speakingEndsAt, undefined);
  });

  test('nextSpeaker skips the current speaker; wrong phase / no rotation rejected', () => {
    const { state } = startSpeakingGame();
    let s = nextSpeaker(state, { now: 100 });
    assert.equal(s.speaking.index, 1);
    assert.equal(s.rev, state.rev + 1);
    // non-host phases reject
    assert.equal(code(() => nextSpeaker(s, { now: 120 })), null); // still valid in discussion
    s = endDiscussion(s, { now: 200 });
    assert.equal(code(() => nextSpeaker(s, { now: 300 })), 'WRONG_PHASE');
    // classic mode (speaking off) rejects
    const players2 = makePlayers(['Asha', 'Balu', 'Chitra']);
    let s2 = createLocalGame({ players: players2, config: { discussionTimerSec: 60, votingTimerSec: 0 }, rng: seededRng(3), db: WORD_DB });
    for (const p of players2) s2 = acknowledgeRole(s2, { playerId: p.id, now: 10 });
    assert.equal(s2.speaking, null);
    assert.equal(code(() => nextSpeaker(s2, { now: 50 })), 'WRONG_PHASE');
  });

  test('early "start the vote" clears the rotation; eliminated players are not in the order', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra', 'Dev', 'Esha']);
    let s = createLocalGame({ players, config: { ...SPK, imposterGuess: false }, rng: seededRng(9), db: WORD_DB });
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    assert.equal(s.speaking.order.length, 5);
    // eliminate one player via voting, then check cycle 2's rotation
    s = endDiscussion(s, { now: 100 });
    const target = players[4].id;
    const voters = players.map((p) => p.id).filter((id) => id !== target);
    for (const v of voters) s = castVote(s, { playerId: v, targetId: target, now: 150 });
    s = castVote(s, { playerId: target, targetId: voters[0], now: 160 });
    s = advance(s, { now: 200 });
    // 4 active: 1 imposter out? no — target may be innocent; either way next cycle discussion
    if (s.phase === 'imposter_guess') s = endGuessing(s, { now: 220 });
    assert.equal(s.phase, 'discussion');
    assert.equal(s.speaking.order.length, 4, 'eliminated player removed from the rotation');
    assert.ok(!s.speaking.order.includes(target));
    // early vote clears everything
    s = endDiscussion(s, { now: 300 });
    assert.equal(s.phase, 'voting');
    assert.equal(s.speaking, null);
  });

  test('JSON round-trip preserves the speaking rotation (refresh recovery)', () => {
    const { state } = startSpeakingGame();
    const restored = JSON.parse(JSON.stringify(state));
    assert.deepEqual(restored.speaking.order, state.speaking.order);
    assert.equal(restored.timers.speakingEndsAt, state.timers.speakingEndsAt);
    let res = checkTimers(restored, { now: 10 + 10001 });
    assert.equal(res.state.speaking.index, 1, 'recovered state keeps advancing speakers');
  });
});
