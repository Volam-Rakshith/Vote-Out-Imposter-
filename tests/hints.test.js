// Imposter hint system tests (hint expansion feature).
//
// Covers: curated dataset integrity, selectHint behaviour for EVERY word in
// the merged database, hint delivery through privateViewFor, No-Hints chaos
// suppression, and privacy (the hint must never leak into the public state
// while the round is still being played).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORD_DB, HINTS, selectHint, hintTooSimilar, normalizeWordId,
  createLocalGame, privateViewFor, toPublicState,
  endDiscussion, advance,
} from '../engine/index.js';
import { makePlayers, seededRng, ackAll, castVotes } from './helpers.js';
// advance imported above '../engine/index.js';

const QUIET = { discussionTimerSec: 0, votingTimerSec: 0 };

/** Letter-clue phrasings are forbidden: hints must be RELATED WORDS. */
const FORBIDDEN_PHRASES = [
  'first letter', 'starts with', 'begins with', 'ends with', 'rhymes with',
  'found in the', 'contains the letter', 'same letter', 'letter count',
  'number of letters', 'spelled', 'alphabet',
];

describe('curated hint dataset integrity', () => {
  test('every curated key is a real word id present in the database', () => {
    for (const [wordId, hint] of Object.entries(HINTS)) {
      assert.equal(wordId, normalizeWordId(wordId), `key "${wordId}" is not a normalized id`);
      assert.ok(WORD_DB.byId.has(wordId), `key "${wordId}" has no word in WORD_DB`);
      assert.equal(typeof hint, 'string');
      assert.ok(hint.trim().length > 0, `hint for "${wordId}" is empty`);
    }
  });

  test('hints are single related words — no letter/spelling clue phrasing', () => {
    for (const [wordId, hint] of Object.entries(HINTS)) {
      const lower = hint.toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.ok(!lower.includes(phrase), `hint "${hint}" (${wordId}) uses forbidden clue "${phrase}"`);
      }
    }
  });

  test('no curated hint gives the word away (similarity guard for every pair)', () => {
    for (const [wordId, hint] of Object.entries(HINTS)) {
      const entry = WORD_DB.byId.get(wordId);
      assert.ok(!hintTooSimilar(entry.label, hint), `hint "${hint}" is too similar to word "${entry.label}"`);
      assert.notEqual(normalizeWordId(hint), wordId, `hint "${hint}" normalizes to the word itself`);
    }
  });
});

describe('selectHint covers every word in the database', () => {
  test('every word yields a usable hint (curated or same-category fallback)', () => {
    for (const entry of WORD_DB.entries) {
      const rng = seededRng(7);
      const hint = selectHint(WORD_DB, entry, rng);
      assert.ok(hint, `no hint for "${entry.label}" (${entry.categories[0]}/${entry.difficulty})`);
      assert.equal(typeof hint.label, 'string');
      assert.ok(hint.label.trim().length > 0);
      assert.ok(['curated', 'related'].includes(hint.source), `bad source ${hint.source}`);
      assert.ok(!hintTooSimilar(entry.label, hint.label), `hint "${hint.label}" too similar to "${entry.label}"`);
    }
  });

  test('fallback hints come from the same category and never leak the word', () => {
    // Pick entries with no curated hint to force the fallback path.
    const uncurated = WORD_DB.entries.filter((e) => !HINTS[e.id]);
    assert.ok(uncurated.length > 0, 'every word is curated — fallback path untested');
    for (const entry of uncurated.slice(0, 200)) {
      const hint = selectHint(WORD_DB, entry, seededRng(3));
      assert.equal(hint.source, 'related');
      const hintEntry = WORD_DB.byId.get(normalizeWordId(hint.label));
      assert.ok(hintEntry, `fallback hint "${hint.label}" is not a database word`);
      assert.ok(entry.categories.some((c) => hintEntry.categories.includes(c)),
        `fallback hint "${hint.label}" is not from category ${entry.categories[0]}`);
    }
  });

  test('deterministic with the same seed', () => {
    const entry = WORD_DB.byId.get(normalizeWordId('sponge')) ?? WORD_DB.entries[0];
    const a = selectHint(WORD_DB, entry, seededRng(42));
    const b = selectHint(WORD_DB, entry, seededRng(42));
    assert.deepEqual(a, b);
  });
});

describe('hint delivery in a real game', () => {
  const names = ['Asha', 'Balu', 'Chitra', 'Dev', 'Esha'];

  function startGame(config = {}) {
    const players = makePlayers(names);
    const state = createLocalGame({ players, config: { ...QUIET, ...config }, rng: seededRng(11), db: WORD_DB });
    return { state, players };
  }

  test('imposters receive the hint; innocents do not; word goes only to innocents', () => {
    const { state, players } = startGame();
    const round = state.rounds[state.roundIndex];
    assert.equal(typeof round.hint, 'string');
    for (const p of players) {
      const view = privateViewFor(state, p.id);
      if (view.role === 'imposter') {
        assert.equal(view.hint, round.hint, 'imposter hint mismatch');
        assert.equal(view.word, null, 'imposter must not see the word');
      } else {
        assert.equal(view.hint, null, 'innocent must not see the hint');
        assert.equal(view.word, round.word.label);
      }
    }
    // At least one imposter exists in a standard game.
    assert.ok(players.some((p) => round.roles[p.id] === 'imposter'));
  });

  test('public state during play never contains the word or the hint', () => {
    const { state } = startGame();
    const round = state.rounds[state.roundIndex];
    const pub = JSON.stringify(toPublicState(state));
    assert.ok(!pub.includes(round.word.label), 'secret word leaked into public state');
    assert.ok(!pub.includes(round.hint), 'hint leaked into public state');
  });

  test('hint is revealed publicly only after the round completes', () => {
    let state; ({ state } = startGame({ imposterGuess: false }));
    state = ackAll(state);
    state = endDiscussion(state, { now: 100 });
    // 5 players: majority vote for p4 (3 vs 2), no self-votes. With the
    // voting timer off, the final castVote tallies automatically.
    state = castVotes(state, {
      p1: 'p2', p2: 'p4', p3: 'p4', p4: 'p2', p5: 'p4',
    }, 200);
    assert.equal(state.phase, 'vote_result');
    state = advance(state, { now: 400 }); // vote_result -> round_result
    // If a revote is somehow required, break the tie and advance again.
    let guard = 0;
    while (state.phase === 'voting' && state.voting?.isRevote && guard++ < 5) {
      state = castVotes(state, { p1: state.voting.candidates[0], p2: state.voting.candidates[0], p3: state.voting.candidates[0], p4: state.voting.candidates[0], p5: state.voting.candidates[1] }, 400 + guard);
      state = advance(state, { now: 500 + guard });
    }
    assert.equal(state.phase, 'round_result');
    const completed = toPublicState(state).rounds[state.roundIndex];
    assert.equal(completed.hint, state.rounds[state.roundIndex].hint, 'completed round must reveal the hint');
    assert.equal(completed.word.label, state.rounds[state.roundIndex].word.label);
    assert.equal(state.lastRoundResult.hint, state.rounds[state.roundIndex].hint, 'round summary must include the hint');
    assert.ok(state.session.roundsLog.at(-1).hint !== undefined, 'roundsLog entry must include the hint');
  });

  test('No Hints chaos: imposters get no hint but standard imposter counts apply', () => {
    const { state, players } = startGame({ chaos: 'no_hints', imposter: { mode: 'fixed', value: 2 } });
    const round = state.rounds[state.roundIndex];
    assert.equal(round.hint, null, 'no_hints must suppress the round hint');
    const imposterCount = players.filter((p) => round.roles[p.id] === 'imposter').length;
    assert.equal(imposterCount, 2, 'no_hints uses the standard imposter count');
    for (const p of players) {
      const view = privateViewFor(state, p.id);
      assert.equal(view.hint, null, 'no player may receive a hint under no_hints');
    }
    assert.equal(state.chaosOutcome, undefined, 'no_hints is not tallied as a chaos outcome');
  });

  test('zero-imposter chaos: no hints exist and everyone gets the word', () => {
    const { state, players } = startGame({ chaos: 'none' });
    const round = state.rounds[state.roundIndex];
    assert.equal(round.hint, null);
    for (const p of players) {
      const view = privateViewFor(state, p.id);
      assert.equal(view.role, 'innocent');
      assert.equal(view.word, round.word.label);
      assert.equal(view.hint, null);
    }
  });

  test('everyone-is-imposter chaos: every player receives the shared hint', () => {
    const { state, players } = startGame({ chaos: 'everyone' });
    const round = state.rounds[state.roundIndex];
    assert.equal(typeof round.hint, 'string');
    for (const p of players) {
      const view = privateViewFor(state, p.id);
      assert.equal(view.role, 'imposter');
      assert.equal(view.word, null);
      assert.equal(view.hint, round.hint);
    }
  });
});
