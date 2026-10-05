// Win conditions, Chaos Mode results, guessing, multi-round & stats (spec §15, §16).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeRole, castVote, endDiscussion, endVoting, advance, submitGuess,
  endGuessing, playAgain, createLocalGame, checkTimers, privateViewFor,
  WORD_DB, CHAOS,
} from '../engine/index.js';
import { makePlayers, seededRng, QUIET_CONFIG } from './helpers.js';

function make(names, config, seed = 5) {
  const players = makePlayers(names);
  const state = createLocalGame({
    players, config: { ...QUIET_CONFIG, ...config }, rng: seededRng(seed), db: WORD_DB,
  });
  return { players, state };
}

function revealAll(ctx, now = 100) {
  for (const p of ctx.players) ctx.state = acknowledgeRole(ctx.state, { playerId: p.id, now });
  return ctx.state;
}

/** Vote out a specific player (everyone else piles votes on them). */
function voteOut(ctx, targetId, now = 300) {
  assert.equal(ctx.state.phase, 'discussion', `expected discussion, got ${ctx.state.phase}`);
  ctx.state = endDiscussion(ctx.state, { now });
  const round = ctx.state.rounds[ctx.state.roundIndex];
  const voters = ctx.players.map((p) => p.id).filter((id) => id !== targetId && !round.eliminated.includes(id));
  let t = now + 10;
  for (const v of voters) {
    ctx.state = castVote(ctx.state, { playerId: v, targetId, now: t });
    t += 10;
  }
  ctx.state = castVote(ctx.state, { playerId: targetId, targetId: voters[0], now: t });
  assert.equal(ctx.state.phase, 'vote_result');
  ctx.state = advance(ctx.state, { now: t + 10 });
  return ctx.state;
}

/** Keep eliminating (first active player each cycle) until the round ends. */
function playRoundToEnd(ctx, now = 1000) {
  let guard = 0;
  while (ctx.state.phase !== 'round_result' && guard++ < 12) {
    if (ctx.state.phase === 'role_reveal') { revealAll(ctx, now + guard); continue; }
    if (ctx.state.phase === 'discussion') {
      const round = ctx.state.rounds[ctx.state.roundIndex];
      const active = ctx.players.map((p) => p.id).filter((id) => !round.eliminated.includes(id));
      voteOut(ctx, active[0], now + guard * 100);
      continue;
    }
    if (ctx.state.phase === 'imposter_guess') {
      ctx.state = endGuessing(ctx.state, { now: now + guard * 100 });
      continue;
    }
    break;
  }
  assert.equal(ctx.state.phase, 'round_result');
  return ctx.state;
}

describe('normal mode win conditions', () => {
  test('innocents win when all imposters are eliminated', () => {
    const ctx = make(['Asha', 'Balu', 'Chitra', 'Dev'], {});
    revealAll(ctx);
    const imposters = Object.entries(ctx.state.rounds[0].roles).filter(([, r]) => r === 'imposter').map(([id]) => id);
    assert.equal(imposters.length, 1);
    let final = voteOut(ctx, imposters[0]);
    assert.equal(final.phase, 'imposter_guess', 'the caught imposter gets one last guess');
    assert.deepEqual(final.guess.eligibleIds, [imposters[0]]);
    final = endGuessing(final, { now: 999 }); // caught imposter declines
    assert.equal(final.phase, 'round_result');
    assert.equal(final.rounds[0].result.winner, 'innocents');
    assert.equal(final.rounds[0].result.reason, 'all_imposters_eliminated');
    assert.equal(final.session.innocentWins, 1);
  });

  test('imposters win on parity (imposters >= innocents among active players)', () => {
    const ctx = make(['Asha', 'Balu', 'Chitra', 'Dev'], {});
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const innocents = ctx.players.filter((p) => roles[p.id] === 'innocent').map((p) => p.id);
    // 4 players, 1 imposter: two eliminations of innocents -> 1v1 parity
    let s = voteOut(ctx, innocents[0]); // 3 active (1 imp / 2 inn) -> continues
    assert.equal(s.phase, 'discussion');
    s = voteOut(ctx, innocents[1]); // 2 active (1 imp / 1 inn) -> parity
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'imposters');
    assert.equal(s.rounds[0].result.reason, 'parity');
    assert.equal(s.session.imposterWins, 1);
  });

  test('multiple imposters: eliminating one does not end the round for innocents', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F', 'G'], { imposter: { mode: 'fixed', value: 2 } });
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposters = ctx.players.filter((p) => roles[p.id] === 'imposter').map((p) => p.id);
    const innocents = ctx.players.filter((p) => roles[p.id] === 'innocent').map((p) => p.id);
    let s = voteOut(ctx, innocents[0]); // 6 active (2 imp / 4 inn) -> continues
    assert.equal(s.phase, 'discussion');
    s = voteOut(ctx, imposters[0]); // 5 active (1 imp / 4 inn) -> caught imposter gets one last guess
    assert.equal(s.phase, 'imposter_guess');
    assert.deepEqual(s.guess.eligibleIds, [imposters[0]], 'only the caught imposter may guess');
    ctx.state = s = submitGuess(s, { playerId: imposters[0], guess: 'definitely-not-the-word', now: 900 });
    assert.equal(s.phase, 'discussion', 'wrong guess -> round continues');
    s = voteOut(ctx, imposters[1]); // last imposter out -> their last guess, then innocents win
    assert.equal(s.phase, 'imposter_guess');
    assert.deepEqual(s.guess.eligibleIds, [imposters[1]]);
    s = submitGuess(s, { playerId: imposters[1], guess: 'also-wrong', now: 950 });
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'innocents');
    assert.equal(s.rounds[0].result.reason, 'all_imposters_eliminated');
  });

  test('parity outranks the guess phase', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E'], { imposter: { mode: 'fixed', value: 2 } });
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const innocents = ctx.players.filter((p) => roles[p.id] === 'innocent').map((p) => p.id);
    // 5 players (2 imp / 3 inn): one innocent out -> 4 active (2 imp / 2 inn) -> parity now
    const s = voteOut(ctx, innocents[0]);
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'imposters');
    assert.equal(s.rounds[0].result.reason, 'parity');
  });
});

describe('imposter word guessing', () => {
  // 7 players, 3 imposters. The rule: the JUST-VOTED-OUT imposter gets one
  // last-chance guess — surviving imposters never guess.
  function guessSetup(seed = 5) {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F', 'G'], { imposter: { mode: 'fixed', value: 3 } }, seed);
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposters = ctx.players.filter((p) => roles[p.id] === 'imposter').map((p) => p.id);
    const innocents = ctx.players.filter((p) => roles[p.id] === 'innocent').map((p) => p.id);
    voteOut(ctx, imposters[0]); // -> guess phase for the CAUGHT imposter (2 imposters still active)
    assert.equal(ctx.state.phase, 'imposter_guess');
    assert.deepEqual(ctx.state.guess.eligibleIds, [imposters[0]]);
    return { ctx, imposters, innocents };
  }

  test('the caught imposter guesses correctly and steals the win while other imposters are still active', () => {
    const { ctx, imposters } = guessSetup();
    const word = ctx.state.rounds[0].word.label;
    let s = ctx.state;
    s = submitGuess(s, { playerId: imposters[0], guess: `  ${word.toUpperCase()}  `, now: 900 });
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'imposters');
    assert.equal(s.rounds[0].result.reason, 'guess');
    assert.equal(s.session.correctGuesses, 1);
    assert.equal(s.rounds[0].guesses[0].correct, true);
    assert.equal(s.rounds[0].guesses[0].playerId, imposters[0]);
  });

  test('guess validation: innocents and SURVIVING imposters are never eligible; empties rejected', () => {
    const { ctx, imposters, innocents } = guessSetup();
    let s = ctx.state;
    const tryGuess = (pid, g) => {
      try { s = submitGuess(s, { playerId: pid, guess: g, now: 950 }); } catch (e) { return e.code; }
      return null;
    };
    assert.equal(tryGuess(innocents[0], 'anything'), 'GUESS_NOT_ELIGIBLE');
    assert.equal(tryGuess(imposters[1], 'anything'), 'GUESS_NOT_ELIGIBLE', 'surviving imposters may not guess');
    assert.equal(tryGuess(imposters[2], 'anything'), 'GUESS_NOT_ELIGIBLE', 'surviving imposters may not guess');
    assert.equal(tryGuess(imposters[0], '   '), 'GUESS_EMPTY');
    assert.equal(tryGuess(imposters[0], 'some wrong guess'), null, 'the caught imposter may guess');
    assert.equal(s.phase, 'discussion', 'the single wrong guess resolves the phase');
    assert.equal(tryGuess(imposters[0], 'another guess'), 'WRONG_PHASE', 'the phase is closed after resolution');
    // session counters accumulate at round end; the round record already has it
    assert.equal(s.rounds[0].guesses.filter((g) => !g.correct).length, 1);
  });

  test('guesses never match by loose substring (exact match only)', () => {
    const { ctx, imposters } = guessSetup();
    const word = ctx.state.rounds[0].word.label;
    const fragment = word.length > 3 ? word.slice(0, 3) : 'zz';
    let s = ctx.state;
    s = submitGuess(s, { playerId: imposters[0], guess: fragment, now: 950 });
    assert.equal(s.phase, 'discussion', 'substring guess is wrong -> round continues');
    assert.equal(s.rounds[0].guesses.filter((g) => !g.correct).length, 1);
  });

  test('caught imposter wrong guess -> round continues', () => {
    const { ctx, imposters } = guessSetup();
    let s = ctx.state;
    s = submitGuess(s, { playerId: imposters[0], guess: 'zzz', now: 950 });
    assert.equal(s.phase, 'discussion', 'wrong guess -> next cycle');
    assert.equal(s.rounds[0].guesses.filter((g) => !g.correct).length, 1);
  });

  test('the caught imposter is the LAST imposter: wrong guess -> innocents win', () => {
    // 1-imposter game — the classic case: catching the imposter is not enough,
    // they still get their steal attempt before the innocents can cash in.
    const ctx = make(['A', 'B', 'C', 'D', 'E'], { imposter: { mode: 'fixed', value: 1 } }, 9);
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposter = ctx.players.find((p) => roles[p.id] === 'imposter').id;
    const s = voteOut(ctx, imposter);
    assert.equal(s.phase, 'imposter_guess', 'the last imposter still gets one last guess');
    assert.deepEqual(s.guess.eligibleIds, [imposter]);
    const after = submitGuess(s, { playerId: imposter, guess: 'wrong', now: 900 });
    assert.equal(after.phase, 'round_result');
    assert.equal(after.rounds[0].result.winner, 'innocents');
    assert.equal(after.rounds[0].result.reason, 'all_imposters_eliminated');
  });

  test('the caught imposter is the LAST imposter: declining the guess -> innocents win', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E'], { imposter: { mode: 'fixed', value: 1 } }, 9);
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposter = ctx.players.find((p) => roles[p.id] === 'imposter').id;
    const s = voteOut(ctx, imposter);
    const after = endGuessing(s, { now: 900 });
    assert.equal(after.phase, 'round_result');
    assert.equal(after.rounds[0].result.winner, 'innocents');
    assert.equal(after.rounds[0].result.reason, 'all_imposters_eliminated');
  });

  test('the caught imposter is the LAST imposter: correct guess -> imposters steal the win', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E'], { imposter: { mode: 'fixed', value: 1 } }, 9);
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposter = ctx.players.find((p) => roles[p.id] === 'imposter').id;
    const word = ctx.state.rounds[0].word.label;
    const s = voteOut(ctx, imposter);
    const after = submitGuess(s, { playerId: imposter, guess: word, now: 900 });
    assert.equal(after.phase, 'round_result');
    assert.equal(after.rounds[0].result.winner, 'imposters');
    assert.equal(after.rounds[0].result.reason, 'guess');
  });

  test('no guess phase when Imposter Guess is disabled', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F'], { imposter: { mode: 'fixed', value: 2 }, imposterGuess: false });
    revealAll(ctx);
    const imposters = Object.entries(ctx.state.rounds[0].roles).filter(([, r]) => r === 'imposter').map(([id]) => id);
    const s = voteOut(ctx, imposters[0]);
    assert.equal(s.phase, 'discussion', 'no guessing -> straight to the next cycle');
  });

  test('guesses outside the guess phase are rejected', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F'], { imposter: { mode: 'fixed', value: 2 } });
    revealAll(ctx);
    let code = null;
    try { submitGuess(ctx.state, { playerId: ctx.players[0].id, guess: 'word', now: 500 }); } catch (e) { code = e.code; }
    assert.equal(code, 'WRONG_PHASE');
  });
});

describe('Chaos Mode outcomes', () => {
  test('Everyone Is Imposter: no team victory; survivor resolution; word never distributed', () => {
    const ctx = make(['Asha', 'Balu', 'Chitra', 'Dev'], { chaos: CHAOS.EVERYONE });
    revealAll(ctx);
    assert.ok(Object.values(ctx.state.rounds[0].roles).every((r) => r === 'imposter'));
    for (const p of ctx.players) {
      const priv = privateViewFor(ctx.state, p.id);
      assert.equal(priv.word, null, 'nobody receives the word in Everyone Is Imposter');
      assert.equal(priv.role, 'imposter');
    }
    let s = voteOut(ctx, ctx.players[0].id); // 3 active -> continues
    assert.equal(s.phase, 'discussion');
    s = voteOut(ctx, ctx.players[1].id); // 2 active -> chaos resolution
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'chaos_everyone');
    assert.ok(['survivors', 'cycle_limit'].includes(s.rounds[0].result.reason));
    assert.equal(s.session.innocentWins, 0, 'innocents must never win this variant');
    assert.equal(s.session.imposterWins, 0);
    assert.equal(s.session.chaosOutcomes, 1);
  });

  test('No Imposter: no hidden imposter, everyone shares the word, dedicated result', () => {
    const ctx = make(['Asha', 'Balu', 'Chitra', 'Dev'], { chaos: CHAOS.NONE });
    revealAll(ctx);
    assert.ok(Object.values(ctx.state.rounds[0].roles).every((r) => r === 'innocent'));
    const word = ctx.state.rounds[0].word.label;
    for (const p of ctx.players) {
      const priv = privateViewFor(ctx.state, p.id);
      assert.equal(priv.word, word, 'everyone receives the same word');
      assert.equal(priv.role, 'innocent');
    }
    let s = voteOut(ctx, ctx.players[0].id);
    assert.equal(s.phase, 'discussion');
    s = voteOut(ctx, ctx.players[1].id);
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].result.winner, 'chaos_none');
    assert.equal(s.session.imposterWins, 0);
    assert.equal(s.session.innocentWins, 0);
    assert.equal(s.session.chaosOutcomes, 1);
  });

  test('Chaos Random: a fresh valid count per round, ordinary win rules afterwards', () => {
    const counts = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const ctx = make(['A', 'B', 'C', 'D', 'E'], { chaos: CHAOS.RANDOM }, seed);
      const imp = Object.values(ctx.state.rounds[0].roles).filter((r) => r === 'imposter').length;
      assert.ok(imp >= 1 && imp <= 4, `random count ${imp} out of range`);
      counts.add(imp);
    }
    assert.ok(counts.size >= 2, 'random chaos should produce varying counts');
  });

  test('Chaos Custom: exactly the configured count, preserved for replay', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F'], { chaos: CHAOS.CUSTOM, chaosCustomCount: 3 });
    revealAll(ctx);
    assert.equal(Object.values(ctx.state.rounds[0].roles).filter((r) => r === 'imposter').length, 3);
    assert.equal(ctx.state.config.chaos, CHAOS.CUSTOM);
    assert.equal(ctx.state.config.chaosCustomCount, 3);
  });

  test('guessing is disabled in Everyone/No Imposter chaos variants', () => {
    const ctx1 = make(['A', 'B', 'C', 'D'], { chaos: CHAOS.EVERYONE, imposterGuess: true });
    revealAll(ctx1);
    let s = voteOut(ctx1, ctx1.players[0].id);
    assert.equal(s.phase, 'discussion', 'no guess phase in Everyone Is Imposter');

    const ctx2 = make(['A', 'B', 'C', 'D'], { chaos: CHAOS.NONE, imposterGuess: true });
    revealAll(ctx2);
    s = voteOut(ctx2, ctx2.players[0].id);
    assert.equal(s.phase, 'discussion', 'no guess phase in No Imposter');
  });
});

describe('multiple rounds & statistics', () => {
  test('a 2-round game produces fresh roles, a new word and round-scoped eliminations', () => {
    const ctx = make(['A', 'B', 'C', 'D'], { rounds: 2 });
    revealAll(ctx);
    const word1 = ctx.state.rounds[0].word.id;
    const imposters1 = Object.entries(ctx.state.rounds[0].roles).filter(([, r]) => r === 'imposter').map(([id]) => id);
    let s = voteOut(ctx, imposters1[0]);
    assert.equal(s.phase, 'imposter_guess', 'caught imposter gets one last guess');
    s = submitGuess(s, { playerId: imposters1[0], guess: 'not-the-word', now: 4500 });
    assert.equal(s.phase, 'round_result');
    assert.equal(s.rounds[0].eliminated.length, 1);

    s = advance(s, { now: 5000, rng: seededRng(77), db: WORD_DB });
    assert.equal(s.phase, 'role_reveal');
    assert.equal(s.roundIndex, 1);
    assert.deepEqual(s.rounds[1].eliminated, [], 'eliminations are round-scoped');
    assert.notEqual(s.rounds[1].word.id, word1, 'new word each round');
    assert.equal(s.reveal.acked.length, 0);
    assert.deepEqual(s.rounds[1].roles !== s.rounds[0].roles, true);

    for (const p of ctx.players) s = acknowledgeRole(s, { playerId: p.id, now: 6000 });
    ctx.state = s;
    s = playRoundToEnd(ctx, 7000);
    s = advance(s, { now: 9000, rng: seededRng(78), db: WORD_DB });
    assert.equal(s.phase, 'game_result');
    assert.equal(s.status, 'finished');
    assert.equal(s.session.roundsPlayed, 2);
    assert.equal(s.session.gamesPlayed, 1);
    assert.equal(s.gameResult.rounds.length, 2);
  });

  test('cumulative statistics track eliminations, participation, guesses', () => {
    const ctx = make(['A', 'B', 'C', 'D', 'E', 'F'], { imposter: { mode: 'fixed', value: 2 }, rounds: 1 });
    revealAll(ctx);
    const roles = ctx.state.rounds[0].roles;
    const imposters = ctx.players.filter((p) => roles[p.id] === 'imposter').map((p) => p.id);
    let s = voteOut(ctx, imposters[0]); // -> guess phase for the caught imposter
    s = submitGuess(s, { playerId: imposters[0], guess: 'zzz-not-it', now: 900 });
    ctx.state = s;
    s = voteOut(ctx, imposters[1]); // -> guess phase again; decline -> innocents win
    s = endGuessing(s, { now: 950 });
    assert.equal(s.phase, 'round_result');
    const stats = s.session;
    assert.equal(stats.eliminationsByPlayer[imposters[0]], 1);
    assert.equal(stats.eliminationsByPlayer[imposters[1]], 1);
    assert.equal(stats.participation[imposters[0]].timesEliminated, 1);
    assert.equal(stats.participation[ctx.players[0].id].roundsPlayed, 1);
    assert.equal(stats.wrongGuesses, 1);
    assert.equal(stats.correctGuesses, 0);
    assert.equal(stats.roundsLog.length, 1);
    assert.equal(stats.roundsLog[0].word.id, s.rounds[0].word.id);
  });
});

describe('Play Again', () => {
  test('preserves the exact configuration & roster; fresh assignments & word', () => {
    const config = {
      imposter: { mode: 'custom', value: 2 }, difficulty: 'hard', rounds: 2,
      discussionTimerSec: 90, votingTimerSec: 45, imposterGuess: false,
      categories: { mode: 'selected', selected: ['food', 'animals'] },
    };
    const ctx = make(['Asha', 'Balu', 'Chitra', 'Dev', 'Esha', 'Farhan'], config);
    revealAll(ctx);
    let s = playRoundToEnd(ctx, 2000);
    s = advance(s, { now: 3000, rng: seededRng(80), db: WORD_DB });
    assert.equal(s.phase, 'role_reveal');
    ctx.state = s;
    s = playRoundToEnd(ctx, 4000);
    s = advance(s, { now: 5000, rng: seededRng(81), db: WORD_DB });
    assert.equal(s.phase, 'game_result');

    const configBefore = structuredClone(s.config);
    const rosterBefore = s.players.map((p) => p.name);
    const roundsLogBefore = structuredClone(s.session.roundsLog);
    const s2 = playAgain(s, { now: 6000, rng: seededRng(123), db: WORD_DB });
    assert.equal(s2.phase, 'role_reveal');
    assert.equal(s2.matchNumber, 2);
    assert.deepEqual(s2.config, configBefore, 'exact config preserved');
    assert.deepEqual(s2.players.map((p) => p.name), rosterBefore, 'exact roster preserved');
    assert.deepEqual(s2.session.roundsLog, roundsLogBefore, 'cumulative stats preserved');
    assert.equal(s2.rounds.length, 1, 'per-game rounds reset');
    assert.equal(s2.reveal.acked.length, 0);
    assert.ok(s2.rounds[0].word.id);
    // the new word honours the preserved category selection
    const entry = WORD_DB.byId.get(s2.rounds[0].word.id);
    assert.ok(entry.categories.some((c) => c === 'food' || c === 'animals'));
    assert.equal(entry.difficulty, 'hard');
  });
});

describe('authoritative timers', () => {
  test('expired discussion deadline starts voting; expired voting deadline tallies; idempotent', () => {
    const players = makePlayers(['A', 'B', 'C']);
    let state = createLocalGame({
      players, config: { discussionTimerSec: 30, votingTimerSec: 20 }, rng: seededRng(9), db: WORD_DB,
    });
    for (const p of players) state = acknowledgeRole(state, { playerId: p.id, now: 0 });
    assert.equal(state.phase, 'discussion');
    assert.ok(state.timers.discussionEndsAt > 0);

    let res = checkTimers(state, { now: state.timers.discussionEndsAt - 1 });
    assert.equal(res.state.phase, 'discussion');
    assert.equal(res.changed, false);

    res = checkTimers(state, { now: state.timers.discussionEndsAt + 1 });
    assert.equal(res.state.phase, 'voting');
    assert.equal(res.changed, true);

    res = checkTimers(res.state, { now: res.state.timers.votingEndsAt + 100 });
    assert.equal(res.state.phase, 'vote_result');
    assert.equal(res.state.lastVoteResult.outcome, 'no_votes');

    const res2 = checkTimers(res.state, { now: res.state.timers.votingEndsAt + 200 });
    assert.equal(res2.state.rev, res.state.rev, 'timer transitions must not double-apply');
  });
});
