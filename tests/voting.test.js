// Voting mechanics tests (spec §24.1/§13): validation, tally, ties, revotes,
// cycle limits.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  castVote, endDiscussion, endVoting, advance, acknowledgeRole, endGuessing,
  submitGuess, checkTimers, createLocalGame, WORD_DB, MAX_VOTE_CYCLES_PER_ROUND,
} from '../engine/index.js';
import { makePlayers, seededRng, QUIET_CONFIG } from './helpers.js';

function setup(names = ['Asha', 'Balu', 'Chitra', 'Dev', 'Esha'], config = {}) {
  const players = makePlayers(names);
  let state = createLocalGame({
    players,
    config: { ...QUIET_CONFIG, ...config },
    rng: seededRng(11),
    db: WORD_DB,
  });
  for (const p of players) state = acknowledgeRole(state, { playerId: p.id, now: 100 });
  assert.equal(state.phase, 'discussion');
  state = endDiscussion(state, { now: 200 });
  assert.equal(state.phase, 'voting');
  return { state, players };
}

function code(fn) {
  try { fn(); } catch (e) { return e.code ?? null; }
  return null;
}

describe('vote validation', () => {
  test('rejects self-votes, invalid targets, duplicates, unknown voters', () => {
    const { state, players } = setup();
    const [a, b, zz] = [players[0].id, players[1].id, 'p_zebra'];
    assert.equal(code(() => castVote(state, { playerId: a, targetId: a, now: 300 })), 'VOTE_SELF');
    assert.equal(code(() => castVote(state, { playerId: a, targetId: zz, now: 300 })), 'VOTE_INVALID_TARGET');
    assert.equal(code(() => castVote(state, { playerId: zz, targetId: b, now: 300 })), 'PLAYER_NOT_FOUND');
    let s = castVote(state, { playerId: a, targetId: b, now: 300 });
    assert.equal(code(() => castVote(s, { playerId: a, targetId: players[2].id, now: 310 })), 'VOTE_DUPLICATE');
  });

  test('rejects votes outside the voting phase', () => {
    const { state, players } = setup();
    assert.equal(code(() => castVote(state, { playerId: players[0].id, targetId: players[1].id, now: 300 })), null); // fine during voting
    const fresh = setup();
    let s = endVoting(fresh.state, { now: 400 }); // tallies with abstentions
    assert.equal(s.phase, 'vote_result');
    assert.equal(code(() => castVote(s, { playerId: fresh.players[0].id, targetId: fresh.players[1].id, now: 500 })), 'WRONG_PHASE');
  });

  test('rejects votes after the deadline (server clock)', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra', 'Dev']);
    let state = createLocalGame({
      players,
      config: { ...QUIET_CONFIG, votingTimerSec: 15 },
      rng: seededRng(3),
      db: WORD_DB,
    });
    for (const p of players) state = acknowledgeRole(state, { playerId: p.id, now: 0 });
    state = endDiscussion(state, { now: 0 });
    assert.ok(state.timers.votingEndsAt > 0);
    assert.equal(code(() => castVote(state, { playerId: players[0].id, targetId: players[1].id, now: state.timers.votingEndsAt + 5000 })), 'VOTE_DEADLINE');
    // within the deadline + grace it still works
    let s2 = castVote(state, { playerId: players[0].id, targetId: players[1].id, now: state.timers.votingEndsAt - 1000 });
    assert.ok(s2.voting.votes[players[0].id]);
  });

  test('eliminated players cannot vote in later cycles', () => {
    const { state, players } = setup(['Asha', 'Balu', 'Chitra', 'Dev']);
    // vote out Dev
    let s = state;
    for (const p of players.slice(0, 3)) s = castVote(s, { playerId: p.id, targetId: players[3].id, now: 300 });
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 310 }); // everyone voted
    assert.equal(s.phase, 'vote_result');
    s = advance(s, { now: 400 });
    assert.ok(s.rounds[0].eliminated.includes(players[3].id));
    // next cycle
    assert.equal(s.phase, 'discussion');
    s = endDiscussion(s, { now: 500 });
    assert.ok(!s.voting.candidates.includes(players[3].id), 'eliminated player is not a candidate');
    assert.equal(code(() => castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 600 })), 'VOTER_ELIMINATED');
  });
});

describe('tally, ties, revotes', () => {
  test('unique plurality eliminates; role is revealed at vote_result', () => {
    const { state, players } = setup(['Asha', 'Balu', 'Chitra', 'Dev']);
    let s = state;
    s = castVote(s, { playerId: players[0].id, targetId: players[3].id, now: 300 });
    s = castVote(s, { playerId: players[1].id, targetId: players[3].id, now: 310 });
    s = castVote(s, { playerId: players[2].id, targetId: players[3].id, now: 320 });
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 330 }); // all voted -> tally
    assert.equal(s.phase, 'vote_result');
    const r = s.lastVoteResult;
    assert.equal(r.outcome, 'eliminated');
    assert.equal(r.eliminatedId, players[3].id);
    assert.ok(r.revealedRole === 'innocent' || r.revealedRole === 'imposter');
    assert.equal(r.tallies[players[3].id], 3);
    assert.equal(r.tallies[players[0].id], 1);
    assert.equal(r.totalVotes, 4);
  });

  test('tie triggers a single revote among tied candidates only', () => {
    const { state, players } = setup(['Asha', 'Balu', 'Chitra', 'Dev']);
    let s = state;
    // A->B, B->A, C->B, D->A  => A:2? no: A gets B? Let's do A:2 B:2
    s = castVote(s, { playerId: players[0].id, targetId: players[1].id, now: 300 }); // A votes B
    s = castVote(s, { playerId: players[1].id, targetId: players[0].id, now: 310 }); // B votes A
    s = castVote(s, { playerId: players[2].id, targetId: players[1].id, now: 320 }); // C votes B
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 330 }); // D votes A
    assert.equal(s.phase, 'vote_result');
    assert.equal(s.lastVoteResult.outcome, 'tie');
    assert.deepEqual([...s.lastVoteResult.tieIds].sort(), [players[0].id, players[1].id].sort());
    s = advance(s, { now: 400 });
    assert.equal(s.phase, 'voting');
    assert.equal(s.voting.isRevote, true);
    assert.deepEqual([...s.voting.candidates].sort(), [players[0].id, players[1].id].sort());
    assert.equal(s.voting.cycle, 2);
    // revote: everyone votes again (tied candidates cannot vote for themselves)
    s = castVote(s, { playerId: players[0].id, targetId: players[1].id, now: 500 });
    s = castVote(s, { playerId: players[1].id, targetId: players[0].id, now: 510 });
    s = castVote(s, { playerId: players[2].id, targetId: players[0].id, now: 520 });
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 530 });
    assert.equal(s.phase, 'vote_result');
    assert.equal(s.lastVoteResult.outcome, 'eliminated');
    assert.equal(s.lastVoteResult.eliminatedId, players[0].id);
  });

  test('second tie ends the voting cycle without elimination', () => {
    const { state, players } = setup(['Asha', 'Balu', 'Chitra', 'Dev']);
    let s = state;
    s = castVote(s, { playerId: players[0].id, targetId: players[1].id, now: 300 });
    s = castVote(s, { playerId: players[1].id, targetId: players[0].id, now: 310 });
    s = castVote(s, { playerId: players[2].id, targetId: players[1].id, now: 320 });
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 330 });
    s = advance(s, { now: 400 }); // revote
    // deadlocked again
    s = castVote(s, { playerId: players[0].id, targetId: players[1].id, now: 500 });
    s = castVote(s, { playerId: players[1].id, targetId: players[0].id, now: 510 });
    s = castVote(s, { playerId: players[2].id, targetId: players[1].id, now: 520 });
    s = castVote(s, { playerId: players[3].id, targetId: players[0].id, now: 530 });
    assert.equal(s.lastVoteResult.outcome, 'tie');
    s = advance(s, { now: 600 });
    assert.equal(s.phase, 'discussion', 'second tie -> no elimination, next cycle');
    assert.ok(!s.rounds[0].eliminated.length);
    assert.equal(s.rounds[0].cycles.length, 2);
  });

  test('zero votes never eliminates anyone', () => {
    const { state, players } = setup();
    let s = endVoting(state, { now: 400 });
    assert.equal(s.phase, 'vote_result');
    assert.equal(s.lastVoteResult.outcome, 'no_votes');
    assert.equal(s.lastVoteResult.eliminatedId, null);
    s = advance(s, { now: 500 });
    assert.equal(s.phase, 'discussion');
    assert.equal(s.rounds[0].eliminated.length, 0);
  });

  test('abstentions are not counted as votes against someone', () => {
    const { state, players } = setup(['Asha', 'Balu', 'Chitra', 'Dev', 'Esha']);
    let s = state;
    s = castVote(s, { playerId: players[0].id, targetId: players[4].id, now: 300 });
    s = castVote(s, { playerId: players[1].id, targetId: players[4].id, now: 310 });
    // three players abstain
    s = endVoting(s, { now: 9000 });
    assert.equal(s.lastVoteResult.outcome, 'eliminated');
    assert.equal(s.lastVoteResult.totalVotes, 2);
    assert.equal(s.lastVoteResult.tallies[players[0].id], 0);
  });

  test('vote_result cannot be applied twice', () => {
    const { state, players } = setup();
    let s = state;
    s = castVote(s, { playerId: players[0].id, targetId: players[4].id, now: 300 });
    s = castVote(s, { playerId: players[1].id, targetId: players[4].id, now: 310 });
    s = castVote(s, { playerId: players[2].id, targetId: players[4].id, now: 320 });
    s = castVote(s, { playerId: players[3].id, targetId: players[4].id, now: 330 });
    s = castVote(s, { playerId: players[4].id, targetId: players[0].id, now: 340 });
    s = advance(s, { now: 500 });
    const phaseAfterFirst = s.phase;
    assert.notEqual(phaseAfterFirst, 'vote_result');
    assert.equal(code(() => advance(s, { now: 600 })), 'WRONG_PHASE');
  });
});

describe('cycle limit prevents endless voting', () => {
  test('five voting cycles with no win ends the round as a draw', () => {
    const players = makePlayers(['Asha', 'Balu', 'Chitra']);
    let s = createLocalGame({ players, config: QUIET_CONFIG, rng: seededRng(21), db: WORD_DB });
    for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: 10 });
    assert.equal(s.phase, 'discussion');
    for (let cycle = 1; cycle <= MAX_VOTE_CYCLES_PER_ROUND; cycle++) {
      assert.equal(s.phase, 'discussion', `cycle ${cycle} should start at discussion`);
      s = endDiscussion(s, { now: 1000 + cycle * 100 });
      s = endVoting(s, { now: 1000 + cycle * 100 + 50 }); // nobody votes
      s = advance(s, { now: 1000 + cycle * 100 + 60 });
    }
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'draw');
    assert.equal(s.rounds[0].result.reason, 'cycle_limit');
  });
});
