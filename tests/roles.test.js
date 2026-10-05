// Role assignment tests (spec §24.2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRoles, resolveImposterCount, resolveChaosRandomCount, createLocalGame, playAgain, WORD_DB,
  CHAOS, ROLE_IMPOSTER, ROLE_INNOCENT, isEngineError, toPublicState,
} from '../engine/index.js';
import { makePlayers, seededRng, newGame } from './helpers.js';

const N = 8;

describe('resolveImposterCount', () => {
  const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

  test('fixed 1–4 gives exactly that count', () => {
    for (const v of [1, 2, 3, 4]) {
      const { count } = resolveImposterCount({
        playerCount: N, config: { imposter: { mode: 'fixed', value: v } }, rng: seededRng(7),
      });
      assert.equal(count, v);
    }
  });

  test('fixed value exceeding players-1 throws (never silently replaces)', () => {
    assert.throws(
      () => resolveImposterCount({ playerCount: 3, config: { imposter: { mode: 'fixed', value: 3 } }, rng: seededRng(7) }),
      (e) => isEngineError(e) && e.code === 'IMPOSTER_COUNT'
    );
  });

  test('custom count validated 1..n-1', () => {
    assert.equal(resolveImposterCount({ playerCount: N, config: { imposter: { mode: 'custom', value: 7 } }, rng: seededRng(7) }).count, 7);
    assert.throws(() => resolveImposterCount({ playerCount: N, config: { imposter: { mode: 'custom', value: 8 } }, rng: seededRng(7) }));
    assert.throws(() => resolveImposterCount({ playerCount: N, config: { imposter: { mode: 'custom', value: 0 } }, rng: seededRng(7) }));
  });

  test('standard random stays within 1..min(4, n-1)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { count } = resolveImposterCount({
        playerCount: N, config: { imposter: { mode: 'random' } }, rng: seededRng(seed),
      });
      assert.ok(count >= 1 && count <= 4, `seed ${seed} -> ${count}`);
    }
    // 3 players: random range must cap at 2
    for (let seed = 1; seed < 100; seed++) {
      const { count } = resolveImposterCount({
        playerCount: 3, config: { imposter: { mode: 'random' } }, rng: seededRng(seed),
      });
      assert.ok(count >= 1 && count <= 2);
    }
  });

  test('chaos everyone -> everyone imposter; chaos none -> zero', () => {
    assert.equal(resolveImposterCount({ playerCount: N, config: { chaos: CHAOS.EVERYONE }, rng: seededRng(1) }).count, N);
    assert.equal(resolveImposterCount({ playerCount: N, config: { chaos: CHAOS.NONE }, rng: seededRng(1) }).count, 0);
  });

  test('chaos random stays within 1..n-1', () => {
    for (let seed = 1; seed < 300; seed++) {
      const { count } = resolveImposterCount({
        playerCount: N, config: { chaos: CHAOS.RANDOM }, rng: seededRng(seed),
      });
      assert.ok(count >= 1 && count <= N - 1, `seed ${seed} -> ${count}`);
    }
  });

  test('chaos custom validated', () => {
    assert.equal(resolveImposterCount({ playerCount: N, config: { chaos: CHAOS.CUSTOM, chaosCustomCount: 6 }, rng: seededRng(1) }).count, 6);
    assert.throws(() => resolveImposterCount({ playerCount: N, config: { chaos: CHAOS.CUSTOM, chaosCustomCount: 9 }, rng: seededRng(1) }));
  });
});

describe('assignRoles invariants', () => {
  const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F']);

  test('every player gets exactly one role; exactly the requested imposters', () => {
    for (let count = 0; count <= 5; count++) {
      for (let seed = 1; seed < 25; seed++) {
        const roles = assignRoles({ players, count, rng: seededRng(seed) });
        assert.equal(roles.size, players.length);
        let imposters = 0;
        for (const r of roles.values()) {
          assert.ok(r === ROLE_IMPOSTER || r === ROLE_INNOCENT);
          if (r === ROLE_IMPOSTER) imposters++;
        }
        assert.equal(imposters, count);
      }
    }
  });

  test('assignment is not based on roster order (imposters vary by seed)', () => {
    const firstImposters = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const roles = assignRoles({ players, count: 1, rng: seededRng(seed) });
      const imp = [...roles.entries()].find(([, r]) => r === ROLE_IMPOSTER)[0];
      firstImposters.add(imp);
    }
    assert.ok(firstImposters.size >= 4, `imposters should vary, got ${firstImposters.size} distinct`);
    assert.ok(![...firstImposters].every((x) => x === 'p1'), 'p1 must not always be the imposter');
  });

  test('over 300 trials every player becomes imposter at least once', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const roles = assignRoles({ players, count: 2, rng: seededRng(seed) });
      for (const [pid, r] of roles) if (r === ROLE_IMPOSTER) seen.add(pid);
    }
    assert.equal(seen.size, players.length);
  });

  test('impossible counts throw', () => {
    assert.throws(() => assignRoles({ players, count: 7, rng: seededRng(1) }));
    assert.throws(() => assignRoles({ players, count: -1, rng: seededRng(1) }));
  });
});

describe('role assignment through createLocalGame', () => {
  test('innocents receive the word; imposters do not', () => {
    const { state } = newGame({ names: ['A', 'B', 'C', 'D', 'E'], config: { imposter: { mode: 'fixed', value: 2 } } });
    const round = state.rounds[0];
    const imposters = Object.entries(round.roles).filter(([, r]) => r === ROLE_IMPOSTER);
    assert.equal(imposters.length, 2);
    // The word lives only in round.word; imposters' payloads derive from role.
    // (Enforced at the privacy layer — see online-core tests.)
    assert.ok(round.word.id && round.word.label);
  });

  test('Everyone Is Imposter: all imposters, nobody receives the word', () => {
    const { state } = newGame({ names: ['A', 'B', 'C', 'D'], config: { chaos: CHAOS.EVERYONE } });
    const round = state.rounds[0];
    assert.ok(Object.values(round.roles).every((r) => r === ROLE_IMPOSTER));
  });

  test('No Imposter: all innocents', () => {
    const { state } = newGame({ names: ['A', 'B', 'C', 'D'], config: { chaos: CHAOS.NONE } });
    assert.ok(Object.values(state.rounds[0].roles).every((r) => r === ROLE_INNOCENT));
  });

  test('replay (playAgain) generates fresh valid assignments', () => {
    const g2 = newGame({ names: ['A', 'B', 'C'], seed: 3, config: { rounds: 1 } });
    let s = g2.state;
    // Vote out one player to end the round -> game result.
    s = ackAllHelper(s);
    const target = s.players[1].id;
    s = castAllHelper(s, target);
    s = advanceHelper(s);
    // If the voted-out player was the imposter, they get one last-chance
    // guess first (new rule); decline it so the round settles.
    if (s.phase === 'imposter_guess') s = endGuessing(s, { now: 500 });
    assert.equal(s.phase, 'round_result');
    s = advanceHelper2(s);
    assert.equal(s.phase, 'game_result');
    const rolesBefore = { ...s.rounds[0].roles };
    const wordBefore = s.rounds[0].word.id;
    s = playAgain(s, { rng: seededRng(99), db: WORD_DB, now: 9999 });
    assert.equal(s.phase, 'role_reveal');
    assert.equal(s.matchNumber, 2);
    const changedRoles = JSON.stringify(rolesBefore) !== JSON.stringify(s.rounds[0].roles);
    assert.ok(changedRoles, 'roles should be regenerated on replay');
    assert.notEqual(s.rounds[0].word.id, wordBefore, 'word must not repeat while the pool has fresh words');
    assert.deepEqual(s.players.map((p) => p.name), ['A', 'B', 'C'], 'roster preserved');
    assert.equal(s.config.rounds, 1, 'config preserved');
  });
});

// small local helpers to avoid circular imports in describe bodies
import { acknowledgeRole, castVote, endDiscussion, endVoting, advance, endGuessing } from '../engine/index.js';
function ackAllHelper(s) {
  for (const p of s.players) s = acknowledgeRole(s, { playerId: p.id, now: 100 });
  return s;
}
function castAllHelper(s, target) {
  s = endDiscussion(s, { now: 150 });
  const others = s.players.map((p) => p.id).filter((id) => id !== target);
  for (const v of others) s = castVote(s, { playerId: v, targetId: target, now: 200 });
  // target also votes (cannot self-vote) so that everyone has voted
  s = castVote(s, { playerId: target, targetId: others[0], now: 210 });
  return s;
}
function advanceHelper(s) { return advance(s, { now: 300 }); }
function advanceHelper2(s) { return advance(s, { now: 400, rng: seededRng(5), db: WORD_DB }); }

describe('Random Chaos windows (count re-rolls every 3–5 rounds, not every round)', () => {
  test('resolveChaosRandomCount: fresh roll creates a 3–5 round window', () => {
    const config = { chaos: CHAOS.RANDOM };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { count, window } = resolveChaosRandomCount({ roundIndex: 0, window: null, playerCount: 6, config, rng: seededRng(seed) });
      assert.ok(count >= 1 && count <= 5, `count ${count} out of 1..n-1`);
      assert.ok(window.until >= 3 && window.until <= 5, `span ${window.until} out of 3..5`);
      assert.equal(window.count, count);
    }
  });

  test('resolveChaosRandomCount: the count persists inside the window, re-rolls after', () => {
    const config = { chaos: CHAOS.RANDOM };
    const rng = seededRng(42);
    const first = resolveChaosRandomCount({ roundIndex: 0, window: null, playerCount: 6, config, rng });
    // rounds 1..until-1 reuse the same count + window object semantics
    for (let r = 1; r < first.window.until; r++) {
      const again = resolveChaosRandomCount({ roundIndex: r, window: first.window, playerCount: 6, config, rng: seededRng(r) });
      assert.equal(again.count, first.count, `round ${r} must keep the block count`);
      assert.equal(again.window, first.window, 'window object is reused, not re-rolled');
    }
    // at `until` a NEW window is rolled (3–5 span from the new round index)
    const next = resolveChaosRandomCount({ roundIndex: first.window.until, window: first.window, playerCount: 6, config, rng: seededRng(99) });
    assert.notEqual(next.window, first.window, 'window must re-roll at the boundary');
    assert.ok(next.window.until >= first.window.until + 3 && next.window.until <= first.window.until + 5);
  });

  test('full game: the imposter count holds for blocks of 3–5 rounds and the count never leaks', () => {
    const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F']);
    let s = createLocalGame({
      players,
      config: { chaos: CHAOS.RANDOM, rounds: 10, discussionTimerSec: 0, votingTimerSec: 0, imposterGuess: false },
      rng: seededRng(21), db: WORD_DB,
    });
    const seen = [];
    let prevUntil = null;
    let t = 10; let guard = 0;
    while (s.phase !== 'game_result' && guard++ < 300) {
      if (s.phase === 'role_reveal') {
        const imposters = Object.values(s.rounds[s.roundIndex].roles).filter((r) => r === ROLE_IMPOSTER).length;
        seen.push({ round: s.roundIndex, imposters, until: s.chaosRandomWindow.until, count: s.chaosRandomWindow.count });
        assert.equal(imposters, s.chaosRandomWindow.count, 'round roles must match the active window');
        // window must cover the current round, and never extend more than 5
        // rounds past the round it was rolled in (roll round <= current round)
        assert.ok(s.chaosRandomWindow.until > s.roundIndex && s.chaosRandomWindow.until <= s.roundIndex + 5,
          `invalid window at round ${s.roundIndex}: until=${s.chaosRandomWindow.until}`);
        if (!prevUntil || prevUntil !== s.chaosRandomWindow.until) {
          // fresh roll happened at this round: span must be 3-5
          assert.ok(s.chaosRandomWindow.until - s.roundIndex >= 3 && s.chaosRandomWindow.until - s.roundIndex <= 5,
            `fresh window span must be 3-5 (got ${s.chaosRandomWindow.until - s.roundIndex} at round ${s.roundIndex})`);
          prevUntil = s.chaosRandomWindow.until;
        }
        for (const p of players) s = acknowledgeRole(s, { playerId: p.id, now: t });
      } else if (s.phase === 'discussion') {
        s = endDiscussion(s, { now: t });
      } else if (s.phase === 'voting') {
        const round = s.rounds[s.roundIndex];
        const active = players.filter((p) => !round.eliminated.includes(p.id));
        const target = active[0];
        for (const p of active) s = castVote(s, { playerId: p.id, targetId: p.id === target.id ? active[1].id : target.id, now: t });
      } else if (s.phase === 'vote_result' || s.phase === 'round_result') {
        assert.equal(toPublicState(s).chaosRandomWindow, undefined, 'the window (imposter count) must never be public');
        s = advance(s, { now: t, rng: seededRng(guard), db: WORD_DB });
      } else break;
      t += 5;
    }
    assert.equal(s.phase, 'game_result');
    assert.ok(seen.length >= 8, `expected to traverse most of the 10 rounds, saw ${seen.length}`);
    // counts may only change at window boundaries
    for (let i = 1; i < seen.length; i++) {
      if (seen[i].imposters !== seen[i - 1].imposters) {
        assert.equal(seen[i].round, seen[i - 1].until, 'count changed outside a window boundary');
      }
    }

    // Play Again resets the window and rolls a fresh block
    s = playAgain(s, { now: 9999, rng: seededRng(5), db: WORD_DB });
    assert.equal(s.phase, 'role_reveal');
    assert.ok(s.chaosRandomWindow && s.chaosRandomWindow.until >= 3 && s.chaosRandomWindow.until <= 5,
      'fresh match must roll a fresh 3-5 round window');
  });
});
