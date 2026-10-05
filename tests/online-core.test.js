// Online multiplayer integration tests (spec §24.5 + §24.6) against the REAL
// authoritative core (supabase/functions/game/core.js) with an in-memory DB
// adapter. Three independent simulated clients (host + 2 participants) run
// through room creation, joining, private role delivery, voting, ties,
// guessing, results, replay, refresh-recovery, host transfer and expiry.
//
// These tests exercise genuine server-backed state exchange (the same code the
// deployed edge function runs) — live Supabase verification still requires the
// external project (see docs/multiplayer-setup.md).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { performAction, ActionError } from '../supabase/functions/game/core.js';
import { seededRng } from './helpers.js';

function createMemoryDb() {
  const rooms = new Map();
  const err = (code, message) => Object.assign(new Error(message), { code });
  return {
    rooms,
    async getRoomByCode(code) {
      const room = rooms.get(code);
      return room ? structuredClone(room) : null;
    },
    async createRoom(room) {
      if (rooms.has(room.code)) throw err('CODE_TAKEN', 'room code taken');
      rooms.set(room.code, structuredClone(room));
      return structuredClone(room);
    },
    async updateRoom(code, room, expectedRev) {
      const cur = rooms.get(code);
      if (!cur) throw err('ROOM_NOT_FOUND', 'room gone');
      if (cur.rev !== expectedRev) throw err('CONFLICT', 'rev mismatch');
      rooms.set(code, structuredClone(room));
      return structuredClone(room);
    },
    async deleteRoom(code) {
      rooms.delete(code);
    },
  };
}

function harness({ seed = 7 } = {}) {
  const db = createMemoryDb();
  const clock = { now: 1_000_000 };
  const broadcasts = [];
  const ctx = {
    now: () => clock.now,
    rng: seededRng(seed),
    broadcast: async (topic, event, payload) => {
      broadcasts.push({ topic, event, payload });
    },
  };
  /** A simulated independent client session. */
  function client(session = {}) {
    return {
      session,
      async act(action, payload = {}) {
        return performAction(db, action, { ...payload, code: session.code, token: session.token, ...payload }, ctx);
      },
    };
  }
  async function createRoom(name, config) {
    const res = await performAction(db, 'create_room', { name, config }, ctx);
    return { code: res.roomCode, token: res.token, playerId: res.private.playerId };
  }
  async function join(code, name) {
    const res = await performAction(db, 'join_room', { code, name }, ctx);
    return { code, token: res.token, playerId: res.private.playerId };
  }
  async function act(session, action, payload = {}) {
    return performAction(db, action, { ...payload, code: session.code, token: session.token }, ctx);
  }
  const errCode = async (fn) => {
    try { await fn(); } catch (e) { return e.code ?? null; }
    return null;
  };
  return { db, clock, broadcasts, ctx, client, createRoom, join, act, errCode };
}

/** Direct DB read (trusted test-harness view, like an admin console). */
function roomRecord(h, code) {
  return h.db.rooms.get(code);
}

describe('room lifecycle', () => {
  test('host creates a room; others join; roster and presence are server-backed', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    assert.match(host.code, /^[A-Z0-9]{6}$/);
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    const res = await h.act(host, 'sync');
    assert.equal(res.publicState.room.members.length, 3);
    assert.deepEqual(res.publicState.room.members.map((m) => m.name).sort(), ['Nishanth', 'Rakshith', 'Vijay']);
    assert.equal(res.publicState.room.hostId, host.playerId);
    assert.ok(res.publicState.room.members.every((m) => m.connected === true));
  });

  test('invalid/expired/unknown rooms and duplicate names are rejected', async () => {
    const h = harness();
    assert.equal(await h.errCode(() => h.join('ZZZZZZ', 'Asha')), 'ROOM_NOT_FOUND');
    const host = await h.createRoom('Rakshith');
    await h.join(host.code, 'vijay');
    assert.equal(await h.errCode(() => h.join(host.code, 'VIJAY')), 'NAME_DUPLICATE');
    assert.equal(await h.errCode(() => h.join(host.code, '')), 'BAD_REQUEST');
  });

  test('join rate limit kicks in after repeated attempts', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    let last = null;
    for (let i = 0; i < 12; i++) {
      last = await h.errCode(() => h.join(host.code, 'Player' + i));
    }
    assert.equal(last, 'JOIN_RATE_LIMIT');
  });

  test('expired rooms reject joins and syncs (lazy cleanup)', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    h.clock.now += 25 * 60 * 60 * 1000; // past the 24h TTL
    assert.equal(await h.errCode(() => h.join(host.code, 'Vijay')), 'ROOM_EXPIRED');
    // the first expired access already deleted it; later access sees it gone
    assert.equal(await h.errCode(() => h.act(host, 'sync')), 'ROOM_NOT_FOUND');
    assert.equal(h.db.rooms.size, 0, 'expired room is deleted');
  });

  test('host can close the room; a member cannot', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    assert.equal(await h.errCode(() => h.act(p2, 'close_room')), 'FORBIDDEN');
    await h.act(host, 'close_room');
    assert.equal(h.db.rooms.size, 0);
    assert.equal(await h.errCode(() => h.act(p2, 'sync')), 'ROOM_NOT_FOUND');
  });
});

describe('authorization', () => {
  test('actions without a valid token are rejected', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    assert.equal(await h.errCode(() => performAction(h.db, 'cast_vote', { code: host.code, targetId: p2.playerId }, h.ctx)), 'UNAUTHORIZED');
    assert.equal(await h.errCode(() => h.act({ code: host.code, token: 'f'.repeat(64), playerId: 'x' }, 'sync')), 'UNAUTHORIZED');
  });

  test('host-only operations are enforced server-side, not by hiding buttons', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    for (const action of ['set_config', 'start_game', 'skip_reveal', 'end_discussion', 'end_voting', 'continue', 'end_guessing', 'play_again', 'close_room']) {
      assert.equal(await h.errCode(() => h.act(p2, action, action === 'set_config' ? { config: {} } : {})), 'FORBIDDEN', `${action} must be host-only`);
    }
    // host can start
    await h.act(host, 'start_game');
    assert.equal(roomRecord(h, host.code).engineState.phase, 'role_reveal');
  });

  test('names/settings are locked once the game starts', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    assert.equal(await h.errCode(() => h.act(p2, 'set_name', { name: 'NewName' })), 'WRONG_PHASE');
    assert.equal(await h.errCode(() => h.act(host, 'set_config', { config: {} })), 'WRONG_PHASE');
  });

  test('new players cannot join a running game; saved sessions can rejoin', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    await h.join(host.code, 'Vijay');
    await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    assert.equal(await h.errCode(() => h.join(host.code, 'Sunil')), 'GAME_IN_PROGRESS');
    // an original member refreshing still recovers their identity (token)
    const again = await h.act(host, 'sync');
    assert.equal(again.private.playerId, host.playerId);
  });
});

describe('private state separation (security-critical)', () => {
  test('public state never contains the secret word, roles or vote targets', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');

    const room = roomRecord(h, host.code);
    const word = room.engineState.rounds[0].word.label;
    const wordId = room.engineState.rounds[0].word.id;
    const roles = room.engineState.rounds[0].roles;

    // role_reveal
    let res = await h.act(host, 'sync');
    let pub = JSON.stringify(res.publicState);
    assert.ok(!pub.includes(`"${word}"`) && !pub.includes(`"${wordId}"`), 'secret word leaked in public state');
    assert.ok(!pub.includes('"roles"'), 'role map leaked in public state');
    for (const pid of Object.keys(roles)) assert.ok(!pub.includes(`"${pid}":"${roles[pid]}"`), 'role assignment leaked');

    // ack + discussion + voting
    await h.act(host, 'ack_role');
    await h.act(p2, 'ack_role');
    await h.act(p3, 'ack_role');
    await h.act(host, 'end_discussion');
    await h.act(host, 'cast_vote', { targetId: p3.playerId });
    res = await h.act(p2, 'sync');
    pub = JSON.stringify(res.publicState);
    assert.ok(!pub.includes(`"${word}"`) && !pub.includes(`"${wordId}"`), 'word leaked during voting');
    assert.ok(!pub.includes('"votes"'), 'vote map leaked');
    assert.ok(res.publicState.voting.voted.includes(host.playerId), 'who has voted IS public');
    // guess phase public payload exposes only counts
    assert.ok(!pub.includes('"eligibleIds"'), 'imposter identities leaked via guess phase');
  });

  test('each client receives only its own private role and word', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    const room = roomRecord(h, host.code);
    const roles = room.engineState.rounds[0].roles;
    const word = room.engineState.rounds[0].word.label;

    for (const session of [host, p2, p3]) {
      const res = await h.act(session, 'sync');
      const priv = res.private;
      assert.equal(priv.playerId, session.playerId);
      assert.equal(priv.role, roles[session.playerId], 'own role must match the server assignment');
      if (priv.role === 'innocent') assert.equal(priv.word, word);
      else assert.equal(priv.word, null, 'imposters never receive the word');
      assert.ok(!('players' in priv) && !('rounds' in priv), 'no bulk state in the private view');
    }
  });
});

describe('full online game: voting, ties, results, replay', () => {
  async function threePlayerRoom(h, config) {
    const host = await h.createRoom('Rakshith', config);
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    return { host, p2, p3 };
  }

  test('happy path with vote validation, elimination and synchronized result', async () => {
    const h = harness();
    const { host, p2, p3 } = await threePlayerRoom(h, { discussionTimerSec: 0, votingTimerSec: 0 });
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3]) await h.act(s, 'ack_role');
    assert.equal((await h.act(p2, 'sync')).publicState.phase, 'discussion');

    await h.act(host, 'end_discussion');
    // vote validation
    assert.equal(await h.errCode(() => h.act(host, 'cast_vote', { targetId: host.playerId })), 'VOTE_SELF');
    assert.equal(await h.errCode(() => h.act(host, 'cast_vote', { targetId: 'p_nope' })), 'VOTE_INVALID_TARGET');
    await h.act(host, 'cast_vote', { targetId: p3.playerId });
    assert.equal(await h.errCode(() => h.act(host, 'cast_vote', { targetId: p2.playerId })), 'VOTE_DUPLICATE');
    // a vote for the wrong phase
    assert.equal(await h.errCode(() => h.act(p2, 'end_discussion')), 'FORBIDDEN');

    await h.act(p2, 'cast_vote', { targetId: p3.playerId });
    await h.act(p3, 'cast_vote', { targetId: host.playerId });
    // all voted -> auto tally
    let res = await h.act(host, 'sync');
    assert.equal(res.publicState.phase, 'vote_result');
    assert.equal(res.publicState.lastVoteResult.eliminatedId, p3.playerId);
    const revealedRole = res.publicState.lastVoteResult.revealedRole;
    assert.ok(['innocent', 'imposter'].includes(revealedRole));
    assert.equal(res.publicState.lastVoteResult.tallies[p3.playerId], 2);

    // host advances; round ends (3 players, 1 imposter)
    await h.act(host, 'continue');
    res = await h.act(p2, 'sync');
    assert.equal(res.publicState.phase, 'round_result');
    const room = roomRecord(h, host.code);
    const winner = res.publicState.lastRoundResult.winner;
    if (revealedRole === 'imposter') assert.equal(winner, 'innocents');
    else assert.equal(winner, 'imposters'); // 1v1 parity
    // word + roles are public AFTER the round
    assert.equal(res.publicState.lastRoundResult.word.label, room.engineState.rounds[0].word.label);

    // final continue -> game result, then synchronized Play Again
    await h.act(host, 'continue');
    res = await h.act(p2, 'sync');
    assert.equal(res.publicState.phase, 'game_result');
    assert.equal(await h.errCode(() => h.act(p2, 'play_again')), 'FORBIDDEN');
    const oldWord = roomRecord(h, host.code).engineState.rounds[0].word.id;
    await h.act(host, 'play_again');
    res = await h.act(p3, 'sync');
    assert.equal(res.publicState.phase, 'role_reveal');
    assert.notEqual(roomRecord(h, host.code).engineState.rounds[0].word.id, oldWord, 'fresh word on replay');
    assert.equal(res.publicState.room.members.length, 3, 'roster preserved on replay');
  });

  test('tie -> synchronized revote among tied candidates only', async () => {
    const h = harness();
    const { host, p2, p3 } = await threePlayerRoom(h, { discussionTimerSec: 0, votingTimerSec: 0 });
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3]) await h.act(s, 'ack_role');
    await h.act(host, 'end_discussion');
    await h.act(host, 'cast_vote', { targetId: p2.playerId });
    await h.act(p2, 'cast_vote', { targetId: host.playerId });
    await h.act(p3, 'cast_vote', { targetId: host.playerId });
    // 2 votes host, 1 vote p2 -> host eliminated (not a tie) — make an actual tie:
    // redo with a 4th player for a genuine 1-1-1 tie
    const h2 = harness();
    const hostA = await h2.createRoom('Rakshith', { discussionTimerSec: 0, votingTimerSec: 0 });
    const b = await h2.join(hostA.code, 'Vijay');
    const c = await h2.join(hostA.code, 'Nishanth');
    const d = await h2.join(hostA.code, 'Sunil');
    await h2.act(hostA, 'start_game');
    for (const s of [hostA, b, c, d]) await h2.act(s, 'ack_role');
    await h2.act(hostA, 'end_discussion');
    await h2.act(hostA, 'cast_vote', { targetId: b.playerId });
    await h2.act(b, 'cast_vote', { targetId: c.playerId });
    await h2.act(c, 'cast_vote', { targetId: d.playerId });
    await h2.act(d, 'cast_vote', { targetId: hostA.playerId });
    let res = await h2.act(hostA, 'sync');
    assert.equal(res.publicState.lastVoteResult.outcome, 'tie');
    assert.equal(res.publicState.lastVoteResult.tieIds.length, 4);
    await h2.act(hostA, 'continue');
    res = await h2.act(b, 'sync');
    assert.equal(res.publicState.phase, 'voting');
    assert.equal(res.publicState.voting.isRevote, true);
    assert.equal(res.publicState.voting.candidates.length, 4);
    // revote: everyone lands on d
    for (const [voter, target] of [[hostA, d], [b, d], [c, d]]) {
      await h2.act(voter, 'cast_vote', { targetId: target.playerId });
    }
    await h2.act(d, 'cast_vote', { targetId: hostA.playerId });
    res = await h2.act(hostA, 'sync');
    assert.equal(res.publicState.lastVoteResult.eliminatedId, d.playerId);
  });

  test('imposter guess phase: private eligibility, correct guess wins', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { discussionTimerSec: 0, votingTimerSec: 0, imposter: { mode: 'fixed', value: 2 } });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    const p4 = await h.join(host.code, 'Sunil');
    const p5 = await h.join(host.code, 'Ritesh');
    const p6 = await h.join(host.code, 'Bunny');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3, p4, p5, p6]) await h.act(s, 'ack_role');

    const room = () => roomRecord(h, host.code);
    const imposters = Object.entries(room().engineState.rounds[0].roles)
      .filter(([, r]) => r === 'imposter').map(([id]) => id);
    assert.equal(imposters.length, 2);
    const sessions = { [host.playerId]: host, [p2.playerId]: p2, [p3.playerId]: p3, [p4.playerId]: p4, [p5.playerId]: p5, [p6.playerId]: p6 };
    const imposterSession = sessions[imposters[0]];
    const target = sessions[imposters[1]];

    // everyone votes out one imposter
    await h.act(host, 'end_discussion');
    for (const s of [host, p2, p3, p4, p5, p6]) {
      if (s !== target) await h.act(s, 'cast_vote', { targetId: target.playerId });
    }
    await h.act(target, 'cast_vote', { targetId: host.playerId });
    await h.act(host, 'continue'); // apply the elimination
    // 6 players, 2 imposters -> eliminate one -> guess phase for the CAUGHT imposter
    let res = await h.act(target, 'sync');
    assert.equal(res.publicState.phase, 'imposter_guess');
    // private eligibility: only the caught (eliminated) imposter may guess
    const priv = res.private;
    assert.equal(priv.guess.eligible, true);
    // the surviving imposter is NOT eligible
    const survivorPriv = (await h.act(imposterSession, 'sync')).private;
    assert.equal(survivorPriv.guess.eligible, false);
    assert.equal(await h.errCode(() => h.act(imposterSession, 'submit_guess', { guess: 'word' })), 'GUESS_NOT_ELIGIBLE');
    const innocentRes = await h.act(host, 'sync');
    // host may be the other imposter if imposters[1] was host — use a checked innocent
    const innocentSession = [p2, p3, p4, p5, p6].find((s) => !imposters.includes(s.playerId));
    const innocentPriv = (await h.act(innocentSession, 'sync')).private;
    assert.equal(innocentPriv.guess.eligible, false);
    assert.equal(await h.errCode(() => h.act(innocentSession, 'submit_guess', { guess: 'word' })), 'GUESS_NOT_ELIGIBLE');
    // the public state exposes only a pending count
    assert.equal(typeof res.publicState.guess.pendingCount, 'number');
    // correct guess by the caught imposter ends the round for everyone at once
    const word = room().engineState.rounds[0].word.label;
    await h.act(target, 'submit_guess', { guess: word });
    res = await h.act(innocentSession, 'sync');
    assert.equal(res.publicState.phase, 'round_result');
    assert.equal(res.publicState.lastRoundResult.winner, 'imposters');
    assert.equal(res.publicState.lastRoundResult.reason, 'guess');
  });
});

describe('authoritative timers and reconnection', () => {
  test('server deadlines drive phase transitions; clients only render countdowns', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { discussionTimerSec: 30, votingTimerSec: 20 });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3]) await h.act(s, 'ack_role');
    let res = await h.act(p2, 'sync');
    assert.equal(res.publicState.phase, 'discussion');
    assert.ok(res.publicState.timers.discussionEndsAt > 0);
    // a client claiming time expired changes nothing; only the server clock does
    h.clock.now += 31_000;
    res = await h.act(p2, 'sync');
    assert.equal(res.publicState.phase, 'voting');
    // voting deadline passes with one vote cast
    await h.act(p3, 'cast_vote', { targetId: p2.playerId });
    h.clock.now += 21_000;
    res = await h.act(host, 'sync');
    assert.equal(res.publicState.phase, 'vote_result');
    assert.equal(res.publicState.lastVoteResult.totalVotes, 1, 'abstentions are not votes');
    assert.equal(res.publicState.lastVoteResult.eliminatedId, p2.playerId);
  });

  test('refresh recovery: the saved token restores identity; votes are not duplicated', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { discussionTimerSec: 0, votingTimerSec: 0 });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3]) await h.act(s, 'ack_role');
    await h.act(host, 'end_discussion');
    await h.act(p2, 'cast_vote', { targetId: p3.playerId });
    // p2 "refreshes": new client instance, same stored session token
    const refreshed = await h.act(p2, 'sync');
    assert.equal(refreshed.private.playerId, p2.playerId);
    assert.equal(refreshed.private.hasVoted, true);
    assert.equal(await h.errCode(() => h.act(p2, 'cast_vote', { targetId: host.playerId })), 'VOTE_DUPLICATE');
  });

  test('host transfer when the host disappears; deterministic successor', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    // host stops syncing (network gone). Presence timeout 30s, grace 60s.
    h.clock.now += 120_000;
    const res = await h.act(p2, 'sync');
    const members = res.publicState.room.members;
    assert.equal(members.find((m) => m.playerId === host.playerId).connected, false);
    assert.equal(members.find((m) => m.playerId === p2.playerId).connected, true);
    // earliest-joined connected member (p2) becomes host
    assert.equal(res.publicState.room.hostId, p2.playerId);
    // the old host's token no longer grants host powers
    assert.equal(await h.errCode(() => h.act(host, 'close_room')), 'FORBIDDEN');
    // the new host can act
    await h.act(p2, 'start_game');
    assert.equal(roomRecord(h, host.code).engineState.phase, 'role_reveal');
  });

  test('leaving the lobby updates the roster; host leaving transfers or closes', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    await h.act(p2, 'leave_room');
    let res = await h.act(host, 'sync');
    assert.equal(res.publicState.room.members.length, 2);
    // host leaves -> host transfers to earliest remaining member
    await h.act(host, 'leave_room');
    res = await h.act(p3, 'sync');
    assert.equal(res.publicState.room.members.length, 1);
    assert.equal(res.publicState.room.hostId, p3.playerId);
    // last member leaves -> room closes
    await h.act(p3, 'leave_room');
    assert.equal(h.db.rooms.size, 0);
  });
});

describe('chaos variants online', () => {
  test('Everyone Is Imposter: nobody receives the word; chaos result', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { chaos: 'everyone', discussionTimerSec: 0, votingTimerSec: 0 });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    const p4 = await h.join(host.code, 'Sunil');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3, p4]) await h.act(s, 'ack_role');
    for (const s of [host, p2, p3, p4]) {
      const res = await h.act(s, 'sync');
      assert.equal(res.private.role, 'imposter');
      assert.equal(res.private.word, null);
    }
    // vote out two players -> survivors resolution
    await h.act(host, 'end_discussion');
    for (const s of [host, p2, p3, p4]) if (s !== p4) await h.act(s, 'cast_vote', { targetId: p4.playerId });
    await h.act(p4, 'cast_vote', { targetId: host.playerId });
    await h.act(host, 'continue');
    await h.act(host, 'end_discussion');
    for (const s of [host, p2, p3]) if (s !== p3) await h.act(s, 'cast_vote', { targetId: p3.playerId });
    await h.act(p3, 'cast_vote', { targetId: host.playerId });
    await h.act(host, 'continue');
    const res = await h.act(host, 'sync');
    assert.equal(res.publicState.phase, 'round_result');
    assert.equal(res.publicState.lastRoundResult.winner, 'chaos_everyone');
  });

  test('No Imposter: everyone receives the same word; dedicated result', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { chaos: 'none', discussionTimerSec: 0, votingTimerSec: 0 });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    const p4 = await h.join(host.code, 'Sunil');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3, p4]) await h.act(s, 'ack_role');
    const word = roomRecord(h, host.code).engineState.rounds[0].word.label;
    for (const s of [host, p2, p3, p4]) {
      const res = await h.act(s, 'sync');
      assert.equal(res.private.role, 'innocent');
      assert.equal(res.private.word, word);
    }
    await h.act(host, 'end_discussion');
    for (const s of [host, p2, p3, p4]) if (s !== p4) await h.act(s, 'cast_vote', { targetId: p4.playerId });
    await h.act(p4, 'cast_vote', { targetId: host.playerId });
    await h.act(host, 'continue');
    await h.act(host, 'end_discussion');
    for (const s of [host, p2, p3]) if (s !== p3) await h.act(s, 'cast_vote', { targetId: p3.playerId });
    await h.act(p3, 'cast_vote', { targetId: host.playerId });
    await h.act(host, 'continue');
    const res = await h.act(host, 'sync');
    assert.equal(res.publicState.phase, 'round_result');
    assert.equal(res.publicState.lastRoundResult.winner, 'chaos_none');
  });
});

describe('broadcasts', () => {
  test('state changes broadcast a revision hint to the room topic', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith');
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Nishanth');
    h.broadcasts.length = 0;
    await h.act(p2, 'set_name', { name: 'Vijay Kumar' });
    const stateMsgs = h.broadcasts.filter((b) => b.event === 'state');
    assert.ok(stateMsgs.length >= 1);
    assert.ok(stateMsgs.every((b) => b.topic === `room-${host.code}`));
    assert.ok(stateMsgs.every((b) => typeof b.payload.rev === 'number'));
  });
});

describe('online speaking mode (per-player turns, server-driven)', () => {
  test('rotation syncs publicly, advances on the server clock, host can skip, and the count/word never leak', async () => {
    const h = harness();
    const host = await h.createRoom('Rakshith', { speakingTimerSec: 10, discussionTimerSec: 60, votingTimerSec: 0, imposterGuess: false });
    const p2 = await h.join(host.code, 'Vijay');
    const p3 = await h.join(host.code, 'Sunil');
    await h.act(host, 'start_game');
    for (const s of [host, p2, p3]) await h.act(s, 'ack_role');

    let res = await h.act(p2, 'sync');
    assert.equal(res.publicState.phase, 'discussion');
    const sp = res.publicState.speaking;
    assert.ok(sp, 'speaking rotation must be public');
    assert.equal(sp.total, 3);
    assert.equal(sp.secPerPlayer, 10);
    assert.equal(sp.playerId, host.playerId, 'first speaker is the first roster player');
    // no secrets in the speaking projection
    const pubStr = JSON.stringify(res.publicState);
    assert.ok(!pubStr.includes('"word"'), 'word must not leak');
    assert.ok(!pubStr.includes('"roles"'), 'roles must not leak');

    // server clock advances past the first speaker's 10s
    h.clock.now += 10_500;
    res = await h.act(p2, 'sync');
    assert.equal(res.publicState.speaking.playerId, p2.playerId, 'second speaker after expiry');

    // host skips the second speaker
    const skipRes = await h.act(host, 'next_speaker');
    assert.equal(skipRes.publicState.speaking.playerId, p3.playerId, 'host skip moves to the third speaker');

    // non-hosts may NOT skip
    assert.equal(await h.errCode(() => h.act(p2, 'next_speaker')), 'FORBIDDEN');

    // last speaker expires -> voting for everyone, rotation cleaned up
    h.clock.now += 10_500;
    res = await h.act(p3, 'sync');
    assert.equal(res.publicState.phase, 'voting');
    assert.equal(res.publicState.speaking, undefined);
  });
});
