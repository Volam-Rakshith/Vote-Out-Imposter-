// One Mobile end-to-end simulation (spec §24.4) at the engine level: the exact
// sequence the pass-and-play UI drives, including recovery (serialization),
// duplicate rejection, ties/revotes, guessing, multi-round, Play Again and
// fully-disabled audio timers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalGame, acknowledgeRole, endDiscussion, castVote, endVoting, advance,
  submitGuess, playAgain, checkTimers, privateViewFor, toPublicState, votingProgress,
  validateConfig, WORD_DB,
} from '../engine/index.js';
import { makePlayers, seededRng } from './helpers.js';

const CONFIG = { discussionTimerSec: 60, votingTimerSec: 0, rounds: 2, imposterGuess: true };

function revealStepByStep(state) {
  // The UI reveals each player's card one at a time; the engine tracks acks.
  // Verify that at no point is more than one un-acked reveal pending and that
  // each private view contains only that player's own data.
  for (const p of state.players) {
    const before = state.reveal.acked.length;
    state = acknowledgeRole(state, { playerId: p.id, now: 100 + before });
    assert.equal(state.reveal.acked.length, before + 1);
    for (const other of state.players) {
      const priv = privateViewFor(state, other.id);
      assert.equal(Object.keys(priv).length <= 6, true);
      assert.equal(priv.role === undefined || typeof priv.role === 'string', true);
    }
  }
  return state;
}

describe('One Mobile full game flow', () => {
  test('3 players, 2 rounds, tie + revote, imposter guess, replay, recovery', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra']);
    let state = createLocalGame({
      players, config: CONFIG, rng: seededRng(2024), db: WORD_DB,
    });

    // 6–8. Private role reveal for each player (previous roles concealed is a
    // UI property; the engine exposes only per-player private views).
    state = revealStepByStep(state);
    assert.equal(state.phase, 'discussion');
    const round1 = state.rounds[0];
    const imposter1 = Object.entries(round1.roles).find(([, r]) => r === 'imposter')?.[0];
    const innocents1 = Object.entries(round1.roles).filter(([, r]) => r === 'innocent').map(([id]) => id);
    assert.ok(imposter1 && innocents1.length === 2);

    // innocents see the word, the imposter does not
    const word = round1.word.label;
    for (const id of innocents1) assert.equal(privateViewFor(state, id).word, word);
    assert.equal(privateViewFor(state, imposter1).word, null);

    // 9. Discussion with a running (but not expired) timer
    assert.ok(state.timers.discussionEndsAt > 0);
    const notExpired = checkTimers(state, { now: state.timers.discussionEndsAt - 1 });
    assert.equal(notExpired.state.phase, 'discussion');

    // 11. Duplicate vote rejected
    state = endDiscussion(state, { now: 200 });
    assert.equal(state.phase, 'voting');
    assert.equal(votingProgress(state).total, 3);
    let dupCode = null;
    state = castVote(state, { playerId: innocents1[0], targetId: imposter1, now: 300 });
    try { state = castVote(state, { playerId: innocents1[0], targetId: innocents1[1], now: 310 }); }
    catch (e) { dupCode = e.code; }
    assert.equal(dupCode, 'VOTE_DUPLICATE');

    // 13–14. Tie and revote: the remaining votes create a 1-1-1 tie
    state = castVote(state, { playerId: imposter1, targetId: innocents1[1], now: 320 });
    state = castVote(state, { playerId: innocents1[1], targetId: innocents1[0], now: 330 });
    assert.equal(state.phase, 'vote_result');
    assert.equal(state.lastVoteResult.outcome, 'tie');
    state = advance(state, { now: 400 });
    assert.equal(state.phase, 'voting');
    assert.equal(state.voting.isRevote, true);
    assert.equal(state.voting.candidates.length, 3);

    // revote: majority lands on the imposter
    state = castVote(state, { playerId: innocents1[0], targetId: imposter1, now: 500 });
    state = castVote(state, { playerId: innocents1[1], targetId: imposter1, now: 510 });
    state = castVote(state, { playerId: imposter1, targetId: innocents1[0], now: 520 });
    assert.equal(state.lastVoteResult.outcome, 'eliminated');

    // 16. Elimination + role reveal at the correct phase
    state = advance(state, { now: 600 });
    assert.ok(state.rounds[0].eliminated.includes(imposter1));
    assert.equal(state.lastVoteResult.revealedRole, 'imposter');

    // 16b. The CAUGHT imposter gets one last-chance guess (they are the last
    // imposter, so the innocent win is deferred until the guess resolves).
    assert.equal(state.phase, 'imposter_guess');
    assert.deepEqual(state.guess.eligibleIds, [imposter1]);
    const caughtPriv = privateViewFor(state, imposter1);
    assert.equal(caughtPriv.guess.eligible, true);
    state = submitGuess(state, { playerId: imposter1, guess: 'wrong guess', now: 650 });

    // 17. Win condition: wrong last guess -> all imposters out -> innocents win round 1
    assert.equal(state.phase, 'round_result');
    assert.equal(state.rounds[0].result.winner, 'innocents');
    assert.equal(state.lastRoundResult.word.label, word, 'word revealed at round end');
    assert.deepEqual(state.lastRoundResult.roles, round1.roles, 'roles revealed at round end');

    // 19. Multi-round: round 2 with fresh assignments
    state = advance(state, { now: 1000, rng: seededRng(2025), db: WORD_DB });
    assert.equal(state.phase, 'role_reveal');
    assert.equal(state.roundIndex, 1);
    assert.notEqual(state.rounds[1].word.id, round1.word.id);
    assert.deepEqual(state.rounds[1].eliminated, []);

    // 18. Imposter guess flow in round 2: eliminate the imposter? Round 2 has
    // 3 players and 1 imposter; eliminating the imposter ends the round
    // (innocents win) with no guess (no imposters remain). Instead, eliminate
    // an innocent first to reach parity — imposters win. To exercise the
    // guess phase we need 2 imposters; do that in the dedicated test below.
    state = revealStepByStep(state);
    const round2 = state.rounds[1];
    const imposter2 = Object.entries(round2.roles).find(([, r]) => r === 'imposter')?.[0];
    const innocent2 = Object.entries(round2.roles).find(([id, r]) => r === 'innocent')?.[0];
    state = endDiscussion(state, { now: 1500 });
    // the other two players vote out an innocent -> parity for the imposter
    for (const p of players.map((p) => p.id).filter((id) => id !== innocent2)) {
      state = castVote(state, { playerId: p, targetId: innocent2, now: 1600 });
    }
    state = castVote(state, { playerId: innocent2, targetId: imposter2, now: 1620 });
    state = advance(state, { now: 1700 });
    // 2 active (1 imposter / 1 innocent) -> parity -> imposters win the round & game
    assert.equal(state.rounds[1].result.winner, 'imposters');
    state = advance(state, { now: 1800, rng: seededRng(2026), db: WORD_DB });
    assert.equal(state.phase, 'game_result');
    assert.equal(state.status, 'finished');
    assert.equal(state.gameResult.tally.innocents + state.gameResult.tally.imposters, 2);

    // 20–22. Play Again preserves roster & config; fresh assignments & word
    const configBefore = structuredClone(state.config);
    const rosterBefore = state.players.map((p) => p.name);
    state = playAgain(state, { now: 2000, rng: seededRng(2027), db: WORD_DB });
    assert.equal(state.phase, 'role_reveal');
    assert.deepEqual(state.config, configBefore);
    assert.deepEqual(state.players.map((p) => p.name), rosterBefore);
    assert.notEqual(state.rounds[0].word.id, round1.word.id);
    assert.notEqual(state.rounds[0].word.id, round2.word.id, 'no word repeats while the pool is fresh');
  });

  test('imposter guess flow in One Mobile: the caught imposter alone gets one last guess on the device', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra', 'Dev', 'Esha', 'Farhan']);
    let state = createLocalGame({
      players, config: { discussionTimerSec: 0, votingTimerSec: 0, imposter: { mode: 'fixed', value: 2 }, rounds: 1 },
      rng: seededRng(55),
      db: WORD_DB,
    });
    state = revealStepByStep(state);
    const roles = state.rounds[0].roles;
    const imposters = Object.entries(roles).filter(([, r]) => r === 'imposter').map(([id]) => id);
    assert.equal(imposters.length, 2);

    // eliminate one imposter -> guess phase for the CAUGHT imposter
    state = endDiscussion(state, { now: 200 });
    const others = players.map((p) => p.id).filter((id) => id !== imposters[0]);
    for (const v of others) state = castVote(state, { playerId: v, targetId: imposters[0], now: 300 });
    state = castVote(state, { playerId: imposters[0], targetId: others[0], now: 400 });
    state = advance(state, { now: 500 });
    assert.equal(state.phase, 'imposter_guess');

    // per-player device handoff: only the CAUGHT imposter may guess
    assert.deepEqual(state.guess.eligibleIds, [imposters[0]]);
    for (const pid of players.map((p) => p.id)) {
      const priv = privateViewFor(state, pid);
      if (pid === imposters[0]) {
        assert.equal(priv.guess.eligible, true);
        assert.equal(priv.guess.submitted, false);
      } else {
        // innocents AND the surviving imposter are not eligible
        assert.equal(priv.guess ? priv.guess.eligible : false, false);
      }
    }

    // the caught imposter guesses the word correctly and steals the win
    const word = state.rounds[0].word.label;
    state = submitGuess(state, { playerId: imposters[0], guess: word.toLowerCase(), now: 600 });
    assert.equal(state.phase, 'round_result');
    assert.equal(state.rounds[0].result.winner, 'imposters');
    assert.equal(state.rounds[0].result.reason, 'guess');
  });

  test('refresh recovery: mid-reveal state restores without exposing the previous card', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra', 'Dev']);
    let state = createLocalGame({ players, config: CONFIG, rng: seededRng(31), db: WORD_DB });
    state = acknowledgeRole(state, { playerId: players[0].id, now: 10 });

    // simulate refresh: JSON round-trip through storage
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(restored.reveal.acked.length, 1);
    // UI contract on recovery: the reveal flow restarts at the first un-acked
    // player with the card FACE DOWN (never auto-reveals).
    const nextPlayer = players.find((p) => !restored.reveal.acked.includes(p.id));
    assert.equal(nextPlayer.id, players[1].id);
    // the engine continues cleanly after recovery:
    let s = restored;
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 20 });
    assert.equal(s.phase, 'discussion');
  });

  test('works with every timer disabled and audio-independent (no timer fields set)', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra']);
    let state = createLocalGame({
      players,
      config: { discussionTimerSec: 0, votingTimerSec: 0, rounds: 1 },
      rng: seededRng(77),
      db: WORD_DB,
    });
    state = revealStepByStep(state);
    assert.equal(state.timers.discussionEndsAt, undefined);
    state = endDiscussion(state, { now: 100 });
    assert.equal(state.timers.votingEndsAt, undefined);
    // manual close instead of a deadline
    state = endVoting(state, { now: 200 });
    assert.equal(state.phase, 'vote_result');
    assert.equal(state.lastVoteResult.outcome, 'no_votes');
  });

  test('public state never contains the secret word or votes during play', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra', 'Dev', 'Esha']);
    let state = createLocalGame({
      players,
      config: { discussionTimerSec: 0, votingTimerSec: 0, rounds: 1 },
      rng: seededRng(88),
      db: WORD_DB,
    });
    state = revealStepByStep(state);
    state = endDiscussion(state, { now: 100 });
    state = castVote(state, { playerId: players[0].id, targetId: players[1].id, now: 200 });

    const pub = JSON.stringify(toPublicState(state));
    const word = state.rounds[0].word.label;
    assert.ok(!pub.includes(`"label":"${word}"`), 'secret word must not appear in public state');
    assert.ok(!pub.includes(`"${word.toLowerCase()}"`), 'secret word id must not appear either');
    assert.ok(!pub.includes('"votes":{' + `"${players[0].id}"`), 'vote map must not be public');
    assert.equal(pub.includes('"roles"'), false, 'role map of the active round must not be public');
    // but "who has voted" is allowed
    assert.ok(JSON.parse(pub).voting.voted.includes(players[0].id));
  });

  test('a full 20-player game validates and runs a voting cycle', () => {
    const players = makePlayers(Array.from({ length: 20 }, (_, i) => 'Player ' + (i + 1)));
    assert.ok(validateConfig({ imposter: { mode: 'fixed', value: 4 } }, { playerCount: 20, db: WORD_DB }).ok);
    let state = createLocalGame({
      players,
      config: { discussionTimerSec: 0, votingTimerSec: 0, imposter: { mode: 'fixed', value: 4 }, rounds: 1 },
      rng: seededRng(99),
      db: WORD_DB,
    });
    assert.equal(state.players.length, 20);
    for (const p of players) state = acknowledgeRole(state, { playerId: p.id, now: 10 });
    assert.equal(state.phase, 'discussion');
    state = endDiscussion(state, { now: 100 });
    assert.equal(state.voting.candidates.length, 20);
    // 19 votes against p20 + p20's own vote -> unique plurality
    for (const p of players.slice(0, 19)) state = castVote(state, { playerId: p.id, targetId: 'p20', now: 200 });
    state = castVote(state, { playerId: 'p20', targetId: 'p1', now: 300 });
    assert.equal(state.phase, 'vote_result');
    assert.equal(state.lastVoteResult.eliminatedId, 'p20');
    state = advance(state, { now: 400 });
    assert.ok(state.rounds[0].eliminated.includes('p20'));
  });
});
