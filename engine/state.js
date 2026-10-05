// Vote Out Imposter — core rules engine / state machine.
//
// Pure functions: (state, action, ctx) -> newState. No DOM, no network, no
// storage. The SAME module powers the One Mobile controller (browser), the
// online Supabase edge function (Deno) and the Node test-suite.
//
// Structure:
//   A game ("match") = N rounds. Each round has one secret word + one role
//   assignment, and may contain several voting cycles (discussion → voting →
//   result), including one revote after a tie. A round ends on a win
//   condition, a Chaos resolution, or the cycle limit (draw).
//
// All exported mutators CLONE the state, validate the transition, and bump
// `rev` when anything changed. Invalid operations throw EngineError.

import {
  PHASE, ROLE_INNOCENT, ROLE_IMPOSTER, MAX_PLAYERS, MIN_PLAYERS,
  MAX_VOTE_CYCLES_PER_ROUND, MAX_GUESS_CODEPOINTS, ENGINE_SCHEMA, DEADLINE_GRACE_MS,
} from './constants.js';
import { EngineError } from './errors.js';
import { createRng } from './random.js';
import { normalizeName, validateName, validateRoster, validateConfig, normalizeConfig } from './validation.js';
import { resolveImposterCount, resolveChaosRandomCount, assignRoles } from './roles.js';
import { selectWord } from './words.js';
import { selectHint } from './hints.js';

const clone = (x) => structuredClone(x);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) {
    throw new EngineError(
      'WRONG_PHASE',
      `This action is not allowed during the “${state.phase}” phase.`
    );
  }
}

function currentRound(state) {
  const round = state.rounds[state.roundIndex];
  if (!round) throw new EngineError('STATE_CORRUPT', 'Current round is missing.');
  return round;
}

function activeIds(state) {
  const round = currentRound(state);
  const eliminated = new Set(round.eliminated);
  return state.players.map((p) => p.id).filter((id) => !eliminated.has(id));
}

function activeRoleIds(state, role) {
  const round = currentRound(state);
  return activeIds(state).filter((id) => round.roles[id] === role);
}

function freshSession() {
  return {
    gamesPlayed: 0,
    roundsPlayed: 0,
    innocentWins: 0,
    imposterWins: 0,
    draws: 0,
    chaosOutcomes: 0,
    eliminationsByPlayer: {},
    correctGuesses: 0,
    wrongGuesses: 0,
    participation: {},
    roundsLog: [],
  };
}

function baseState({ mode, players, config, now, rng }) {
  return {
    schema: ENGINE_SCHEMA,
    gameId: 'g_' + now.toString(36) + '_' + rng.int(0x7fffffff).toString(36), // non-security id
    mode,
    status: 'active',
    createdAt: now,
    config,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    hostId: players[0]?.id ?? null,
    matchNumber: 1,
    roundIndex: 0,
    rounds: [],
    usedWordIds: [],
    chaosRandomWindow: null,
    session: freshSession(),
    phase: PHASE.ROLE_REVEAL,
    reveal: { acked: [] },
    speaking: null,
    timers: {},
    voting: null,
    lastVoteResult: null,
    guess: null,
    lastRoundResult: null,
    gameResult: null,
    rev: 1,
  };
}

/** Build a new round: fresh roles + fresh word (duplicate prevention). */
function buildRound(state, { now, rng, db }) {
  let count;
  if (state.config.chaos === 'random') {
    // Random Chaos: one rolled count holds for a block of 3–5 rounds, then
    // re-rolls — big chaotic swings, not per-round churn.
    const resolved = resolveChaosRandomCount({
      roundIndex: state.roundIndex,
      window: state.chaosRandomWindow,
      playerCount: state.players.length,
      config: state.config,
      rng,
    });
    state.chaosRandomWindow = resolved.window;
    count = resolved.count;
  } else {
    count = resolveImposterCount({ playerCount: state.players.length, config: state.config, rng }).count;
  }
  const roles = assignRoles({ players: state.players, count, rng });
  const selection = selectWord(db, {
    categories: state.config.categories,
    difficulty: state.config.difficulty,
    usedIds: state.usedWordIds,
    rng,
  });

  if (selection.recycled) {
    const recycle = new Set(selection.recycleIds);
    state.usedWordIds = state.usedWordIds.filter((id) => !recycle.has(id));
  }
  state.usedWordIds.push(selection.entry.id);

  // Imposter hint: a related word, delivered privately to imposters only.
  // Disabled entirely in the No-Hints chaos variant; meaningless when there
  // are no imposters (No Imposter chaos). In "Everyone Is Imposter" every
  // player is an imposter, so every player gets the shared hint.
  let hint = null;
  if (count > 0 && state.config.chaos !== 'no_hints') {
    hint = selectHint(db, selection.entry, rng)?.label ?? null;
  }

  const rolesObj = {};
  for (const [pid, role] of roles) rolesObj[pid] = role;

  state.rounds.push({
    index: state.roundIndex,
    startedAt: now,
    word: { id: selection.entry.id, label: selection.entry.label },
    hint,                          // private until the round completes
    difficulty: selection.resolvedDifficulty,
    category: selection.resolvedCategory,
    wordRecycled: selection.recycled,
    roles: rolesObj,               // private until the round completes
    revealedRoles: {},             // public — filled as players are eliminated
    eliminated: [],                // public
    cycles: [],                    // voting cycles (votes are private)
    guesses: [],                   // private until the round completes
    result: null,
  });

  state.timers = {};
  state.voting = null;
  state.lastVoteResult = null;
  state.guess = null;
  state.lastRoundResult = null;
  state.reveal = { acked: [] };
}

function enterDiscussion(state, now) {
  state.phase = PHASE.DISCUSSION;
  const sec = state.config.speakingTimerSec;
  if (sec > 0) {
    // Per-player speaking mode: roster-order rotation, X seconds each.
    // Replaces the shared table timer for this discussion.
    const order = activeIds(state);
    state.speaking = {
      order,
      index: 0,
      startedAt: now,
      endsAt: now + sec * 1000,
      secPerPlayer: sec,
    };
    state.timers.speakingEndsAt = state.speaking.endsAt;
    delete state.timers.discussionEndsAt;
  } else {
    state.speaking = null;
    delete state.timers.speakingEndsAt;
    const dsec = state.config.discussionTimerSec;
    if (dsec > 0) state.timers.discussionEndsAt = now + dsec * 1000;
    else delete state.timers.discussionEndsAt;
  }
}

/**
 * Move to the next speaker (host skip, or automatic when time runs out).
 * When the last speaker finishes, the discussion ends and voting begins.
 */
export function nextSpeaker(state, { now = Date.now() } = {}) {
  state = clone(state);
  requirePhase(state, PHASE.DISCUSSION);
  const speaking = state.speaking;
  if (!speaking) throw new EngineError('WRONG_PHASE', 'This discussion has no speaking turns.');
  advanceSpeaking(state, now);
  state.rev += 1;
  return state;
}

function advanceSpeaking(state, now) {
  const speaking = state.speaking;
  speaking.index += 1;
  if (speaking.index >= speaking.order.length) {
    // Everyone has spoken — the discussion is over, voting begins.
    state.speaking = null;
    delete state.timers.speakingEndsAt;
    const round = currentRound(state);
    startVoting(state, {
      now,
      cycle: round.cycles.length + 1,
      isRevote: false,
      candidates: activeIds(state),
    });
    return;
  }
  // next speaker gets a full fresh window from the moment of transition
  speaking.startedAt = now;
  speaking.endsAt = now + speaking.secPerPlayer * 1000;
  state.timers.speakingEndsAt = speaking.endsAt;
}

function startVoting(state, { now, cycle, isRevote, candidates }) {
  state.phase = PHASE.VOTING;
  delete state.timers.discussionEndsAt;
  delete state.timers.speakingEndsAt;
  state.speaking = null;
  state.voting = { cycle, isRevote, candidates, votes: {}, tallied: false };
  const sec = state.config.votingTimerSec;
  if (sec > 0) state.timers.votingEndsAt = now + sec * 1000;
  else delete state.timers.votingEndsAt;
}

function tallyVotes(state, now) {
  const voting = state.voting;
  if (!voting || voting.tallied) throw new EngineError('WRONG_PHASE', 'No active voting to close.');
  const round = currentRound(state);

  const tallies = {};
  for (const c of voting.candidates) tallies[c] = 0;
  let totalVotes = 0;
  for (const target of Object.values(voting.votes)) {
    if (tallies[target] === undefined) continue; // defensive; validated at cast time
    tallies[target] += 1;
    totalVotes += 1;
  }

  let outcome = 'no_votes';
  let eliminatedId = null;
  let revealedRole = null;
  let tieIds = [];
  if (totalVotes > 0) {
    let max = -1;
    let leaders = [];
    for (const [cid, n] of Object.entries(tallies)) {
      if (n > max) { max = n; leaders = [cid]; }
      else if (n === max) leaders.push(cid);
    }
    if (leaders.length === 1) {
      outcome = 'eliminated';
      eliminatedId = leaders[0];
      revealedRole = round.roles[eliminatedId] ?? null;
    } else {
      outcome = 'tie';
      tieIds = leaders;
    }
  }

  round.cycles.push({
    number: voting.cycle,
    isRevote: voting.isRevote,
    votes: { ...voting.votes },           // private — never broadcast
    tallies,
    totalVotes,
    outcome,
    eliminatedId,
    revealedRole,
    tieIds,
    endedAt: now,
  });

  state.lastVoteResult = {
    cycle: voting.cycle,
    isRevote: voting.isRevote,
    tallies,
    totalVotes,
    outcome,
    eliminatedId,
    revealedRole,
    tieIds,
    applied: false,
  };
  voting.tallied = true;
  state.voting = { ...voting, tallied: true };
  delete state.timers.votingEndsAt;
  state.phase = PHASE.VOTE_RESULT;
}

function isChaosVariant(state) {
  return state.config.chaos === 'everyone' || state.config.chaos === 'none';
}

function chaosWinner(state) {
  return state.config.chaos === 'everyone' ? 'chaos_everyone' : 'chaos_none';
}

/** End the round with a winner; records stats and builds the public summary. */
function endRound(state, { now, winner, reason }) {
  const round = currentRound(state);
  const survivors = activeIds(state);
  round.result = { winner, reason, endedAt: now, survivors: [...survivors] };
  round.completedAt = now;

  // Session statistics ------------------------------------------------------
  const s = state.session;
  s.roundsPlayed += 1;
  if (winner === 'innocents') s.innocentWins += 1;
  else if (winner === 'imposters') s.imposterWins += 1;
  else if (winner === 'draw') s.draws += 1;
  else s.chaosOutcomes += 1;
  for (const p of state.players) {
    if (!s.participation[p.id]) s.participation[p.id] = { roundsPlayed: 0, timesEliminated: 0 };
    s.participation[p.id].roundsPlayed += 1;
  }
  for (const pid of round.eliminated) {
    s.eliminationsByPlayer[pid] = (s.eliminationsByPlayer[pid] ?? 0) + 1;
    if (s.participation[pid]) s.participation[pid].timesEliminated += 1;
  }
  s.correctGuesses += round.guesses.filter((g) => g.correct).length;
  s.wrongGuesses += round.guesses.filter((g) => !g.correct).length;
  s.roundsLog.push({
    match: state.matchNumber,
    round: round.index + 1,
    winner,
    reason,
    word: { ...round.word },
    hint: round.hint ?? null,
  });

  state.lastRoundResult = buildRoundSummary(round);
  state.phase = PHASE.ROUND_RESULT;
  state.timers = {};
  state.voting = null;
  state.guess = null;
}

function buildRoundSummary(round) {
  return {
    round: round.index + 1,
    winner: round.result.winner,
    reason: round.result.reason,
    endedAt: round.result.endedAt,
    survivors: [...round.result.survivors],
    word: { ...round.word },
    hint: round.hint ?? null,
    roles: { ...round.roles },
    imposterIds: Object.entries(round.roles).filter(([, r]) => r === ROLE_IMPOSTER).map(([pid]) => pid),
    eliminated: round.eliminated.map((id) => ({ id, role: round.roles[id] })),
    cycles: round.cycles.map((c) => ({
      number: c.number, isRevote: c.isRevote, tallies: c.tallies, totalVotes: c.totalVotes,
      outcome: c.outcome, eliminatedId: c.eliminatedId, revealedRole: c.revealedRole, tieIds: c.tieIds,
    })),
    guesses: round.guesses.map((g) => ({ playerId: g.playerId, guess: g.guess, correct: g.correct })),
  };
}

function summarizeGame(state) {
  const matchRounds = state.rounds.map((r) => ({
    round: r.index + 1,
    winner: r.result?.winner ?? 'incomplete',
    reason: r.result?.reason ?? null,
    word: r.result ? { ...r.word } : null,
    imposterIds: r.result
      ? Object.entries(r.roles).filter(([, role]) => role === ROLE_IMPOSTER).map(([pid]) => pid)
      : [],
  }));
  const tally = { innocents: 0, imposters: 0, draws: 0, chaos: 0 };
  for (const r of matchRounds) {
    if (r.winner === 'innocents') tally.innocents += 1;
    else if (r.winner === 'imposters') tally.imposters += 1;
    else if (r.winner === 'draw') tally.draws += 1;
    else if (r.winner.startsWith('chaos_')) tally.chaos += 1;
  }
  return { matchNumber: state.matchNumber, rounds: matchRounds, tally, session: clone(state.session) };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Create a complete local (One Mobile) game. Throws EngineError on any
 * invalid roster/config combination — never silently substitutes values.
 */
export function createLocalGame({ players, config, now = Date.now(), rng = createRng(), db }) {
  if (!db) throw new EngineError('STATE_CORRUPT', 'Word database is required.');
  const rosterCheck = validateRoster(players, { forStart: true });
  if (!rosterCheck.ok) throw new EngineError(rosterCheck.errors[0].code, rosterCheck.errors[0].message);

  const cfgCheck = validateConfig(config, { playerCount: players.length, db });
  if (!cfgCheck.ok) throw new EngineError(cfgCheck.errors[0].code, cfgCheck.errors[0].message);

  const state = baseState({ mode: 'local', players, config: cfgCheck.config, now, rng });
  buildRound(state, { now, rng, db });
  return state;
}

/** Create an online room lobby (authoritative state before the game starts). */
export function createLobby({ host, config, now = Date.now(), rng = createRng() }) {
  const check = validateName(host.name);
  if (!check.ok) throw new EngineError(check.error.code, check.error.message);
  const player = { id: host.id, name: check.value };
  const state = baseState({ mode: 'online', players: [player], config: normalizeConfig(config), now, rng });
  state.status = 'lobby';
  state.phase = PHASE.LOBBY;
  state.hostId = player.id;
  state.lobby = { createdAt: now };
  return state;
}

// ---------------------------------------------------------------------------
// Lobby operations (online)
// ---------------------------------------------------------------------------

export function lobbyAddPlayer(state, { player, now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.LOBBY);
  if (state.players.length >= MAX_PLAYERS) {
    throw new EngineError('ROOM_FULL', `The room is full (${MAX_PLAYERS} players maximum).`);
  }
  const existing = state.players.map((p) => p.name);
  const check = validateName(player.name, { existingNames: existing });
  if (!check.ok) throw new EngineError(check.error.code, check.error.message);
  if (state.players.some((p) => p.id === player.id)) {
    throw new EngineError('PLAYER_ID_DUPLICATE', 'This player id is already in the room.');
  }
  state.players.push({ id: player.id, name: check.value });
  state.rev += 1;
  return state;
}

export function lobbyRemovePlayer(state, { playerId }) {
  state = clone(state);
  requirePhase(state, PHASE.LOBBY);
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) throw new EngineError('PLAYER_NOT_FOUND', 'That player is not in this room.');
  state.players.splice(idx, 1);
  if (state.hostId === playerId) state.hostId = state.players[0]?.id ?? null;
  state.rev += 1;
  return state;
}

export function lobbySetName(state, { playerId, name }) {
  state = clone(state);
  requirePhase(state, PHASE.LOBBY);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new EngineError('PLAYER_NOT_FOUND', 'That player is not in this room.');
  const others = state.players.filter((p) => p.id !== playerId).map((p) => p.name);
  const check = validateName(name, { existingNames: others });
  if (!check.ok) throw new EngineError(check.error.code, check.error.message);
  player.name = check.value;
  state.rev += 1;
  return state;
}

export function lobbySetConfig(state, { config, db }) {
  state = clone(state);
  requirePhase(state, PHASE.LOBBY);
  const check = validateConfig(config, { playerCount: Math.max(state.players.length, MIN_PLAYERS), db });
  // Ignore PLAYER_COUNT errors here — the roster may still be filling up.
  const blocking = check.errors.filter((e) => e.code !== 'PLAYER_COUNT');
  if (blocking.length > 0) throw new EngineError(blocking[0].code, blocking[0].message);
  state.config = check.config;
  state.rev += 1;
  return state;
}

/** Start the game from a lobby (host action; server validates permissions). */
export function startGame(state, { now = Date.now(), rng = createRng(), db }) {
  state = clone(state);
  requirePhase(state, PHASE.LOBBY);
  const rosterCheck = validateRoster(state.players, { forStart: true });
  if (!rosterCheck.ok) throw new EngineError(rosterCheck.errors[0].code, rosterCheck.errors[0].message);
  const cfgCheck = validateConfig(state.config, { playerCount: state.players.length, db });
  if (!cfgCheck.ok) throw new EngineError(cfgCheck.errors[0].code, cfgCheck.errors[0].message);

  state.config = cfgCheck.config;
  state.status = 'active';
  state.roundIndex = 0;
  state.rounds = [];
  buildRound(state, { now, rng, db });
  state.phase = PHASE.ROLE_REVEAL;
  state.rev += 1;
  return state;
}

// ---------------------------------------------------------------------------
// Role reveal
// ---------------------------------------------------------------------------

export function acknowledgeRole(state, { playerId, now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.ROLE_REVEAL);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new EngineError('PLAYER_NOT_FOUND', 'That player is not in this game.');
  if (!state.reveal.acked.includes(playerId)) {
    state.reveal.acked.push(playerId);
    state.rev += 1;
  }
  if (state.reveal.acked.length >= state.players.length) {
    enterDiscussion(state, now);
    state.rev += 1;
  }
  return state;
}

/** Host shortcut: skip remaining acknowledgements and start discussion. */
export function skipReveal(state, { now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.ROLE_REVEAL);
  state.reveal.acked = state.players.map((p) => p.id);
  enterDiscussion(state, now);
  state.rev += 1;
  return state;
}

// ---------------------------------------------------------------------------
// Discussion & voting
// ---------------------------------------------------------------------------

export function endDiscussion(state, { now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.DISCUSSION);
  const round = currentRound(state);
  startVoting(state, {
    now,
    cycle: round.cycles.length + 1,
    isRevote: false,
    candidates: activeIds(state),
  });
  state.rev += 1;
  return state;
}

export function castVote(state, { playerId, targetId, now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.VOTING);
  const voting = state.voting;
  if (!voting || voting.tallied) throw new EngineError('WRONG_PHASE', 'Voting is not open right now.');
  if (!state.players.some((p) => p.id === playerId)) {
    throw new EngineError('PLAYER_NOT_FOUND', 'You are not part of this game.');
  }
  if (currentRound(state).eliminated.includes(playerId)) {
    throw new EngineError('VOTER_ELIMINATED', 'Eliminated players cannot vote.');
  }
  if (playerId === targetId) {
    throw new EngineError('VOTE_SELF', 'You cannot vote for yourself.');
  }
  if (!voting.candidates.includes(targetId)) {
    throw new EngineError('VOTE_INVALID_TARGET', 'That player is not a valid candidate in this vote.');
  }
  if (voting.votes[playerId]) {
    throw new EngineError('VOTE_DUPLICATE', 'A vote has already been submitted for this round.');
  }
  const deadline = state.timers.votingEndsAt;
  if (deadline && now > deadline + DEADLINE_GRACE_MS) {
    throw new EngineError('VOTE_DEADLINE', 'Voting time is over.');
  }
  voting.votes[playerId] = targetId;

  const eligibleVoters = activeIds(state);
  const votedCount = Object.keys(voting.votes).length;
  if (votedCount >= eligibleVoters.length) {
    tallyVotes(state, now); // everyone voted — close early
  }
  state.rev += 1;
  return state;
}

export function endVoting(state, { now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.VOTING);
  tallyVotes(state, now);
  state.rev += 1;
  return state;
}

/** Vote progress for UI (who has voted — never who voted for whom). */
export function votingProgress(state) {
  if (state.phase !== PHASE.VOTING || !state.voting) return { voted: [], pending: [], total: 0 };
  const eligible = activeIds(state);
  const voted = eligible.filter((id) => state.voting.votes[id]);
  return { voted, pending: eligible.filter((id) => !state.voting.votes[id]), total: eligible.length };
}

// ---------------------------------------------------------------------------
// Advancing phases (vote result -> next, round result -> next round/game)
// ---------------------------------------------------------------------------

export function advance(state, { now = Date.now(), rng = createRng(), db } = {}) {
  state = clone(state);
  if (state.phase === PHASE.VOTE_RESULT) return advanceFromVoteResult(state, { now });
  if (state.phase === PHASE.ROUND_RESULT) return advanceFromRoundResult(state, { now, rng, db });
  throw new EngineError('WRONG_PHASE', 'There is nothing to advance right now.');
}

function advanceFromVoteResult(state, { now }) {
  const result = state.lastVoteResult;
  if (!result) throw new EngineError('STATE_CORRUPT', 'Missing vote result.');
  if (result.applied) throw new EngineError('WRONG_PHASE', 'This vote result was already applied.');
  result.applied = true;
  const round = currentRound(state);

  if (result.outcome === 'eliminated' && result.eliminatedId) {
    round.eliminated.push(result.eliminatedId);
    round.revealedRoles[result.eliminatedId] = round.roles[result.eliminatedId];
    return evaluateAfterElimination(state, { now, eliminatedId: result.eliminatedId });
  }
  return continueAfterNoElimination(state, { now });
}

function evaluateAfterElimination(state, { now, eliminatedId }) {
  const round = currentRound(state);
  const active = activeIds(state);
  const cyclesUsed = round.cycles.length;

  if (isChaosVariant(state)) {
    // Everyone Is Imposter / No Imposter — no innocent-vs-imposter outcome.
    if (active.length <= 2 || cyclesUsed >= MAX_VOTE_CYCLES_PER_ROUND) {
      endRound(state, { now, winner: chaosWinner(state), reason: active.length <= 2 ? 'survivors' : 'cycle_limit' });
      state.rev += 1;
      return state;
    }
    enterDiscussion(state, now);
    state.rev += 1;
    return state;
  }

  const activeImposters = activeRoleIds(state, ROLE_IMPOSTER);
  const activeInnocents = activeRoleIds(state, ROLE_INNOCENT);

  if (activeImposters.length >= activeInnocents.length) {
    endRound(state, { now, winner: 'imposters', reason: 'parity' });
  } else if (round.roles[eliminatedId] === ROLE_IMPOSTER && state.config.imposterGuess) {
    // The caught (just-eliminated) imposter gets ONE last-chance guess at the
    // word — a correct guess steals the win instantly. This happens even if
    // they were the last imposter: the innocent win is deferred until the
    // guess resolves. Parity (above) still outranks the guess phase.
    startGuessPhase(state, { now, eligibleIds: [eliminatedId] });
  } else if (activeImposters.length === 0) {
    endRound(state, { now, winner: 'innocents', reason: 'all_imposters_eliminated' });
  } else if (cyclesUsed >= MAX_VOTE_CYCLES_PER_ROUND) {
    endRound(state, { now, winner: 'draw', reason: 'cycle_limit' });
  } else {
    enterDiscussion(state, now);
  }
  state.rev += 1;
  return state;
}

function continueAfterNoElimination(state, { now }) {
  const round = currentRound(state);
  const result = state.lastVoteResult;
  const cyclesUsed = round.cycles.length;

  // First tie → one revote among the tied candidates (never endless).
  if (result.outcome === 'tie' && !result.isRevote && result.tieIds.length >= 2) {
    if (cyclesUsed < MAX_VOTE_CYCLES_PER_ROUND) {
      startVoting(state, { now, cycle: cyclesUsed + 1, isRevote: true, candidates: [...result.tieIds] });
      state.rev += 1;
      return state;
    }
  }

  if (isChaosVariant(state)) {
    if (cyclesUsed >= MAX_VOTE_CYCLES_PER_ROUND) {
      endRound(state, { now, winner: chaosWinner(state), reason: 'cycle_limit' });
      state.rev += 1;
      return state;
    }
    enterDiscussion(state, now);
    state.rev += 1;
    return state;
  }

  if (cyclesUsed >= MAX_VOTE_CYCLES_PER_ROUND) {
    endRound(state, { now, winner: 'draw', reason: 'cycle_limit' });
  } else {
    enterDiscussion(state, now);
  }
  state.rev += 1;
  return state;
}

function advanceFromRoundResult(state, { now, rng, db }) {
  if (state.roundIndex + 1 < state.config.rounds) {
    state.roundIndex += 1;
    buildRound(state, { now, rng, db });
    state.phase = PHASE.ROLE_REVEAL;
  } else {
    state.session.gamesPlayed += 1;
    state.status = 'finished';
    state.gameResult = summarizeGame(state);
    state.phase = PHASE.GAME_RESULT;
  }
  state.rev += 1;
  return state;
}

// ---------------------------------------------------------------------------
// Imposter word guessing
// ---------------------------------------------------------------------------

function startGuessPhase(state, { now, eligibleIds }) {
  state.phase = PHASE.IMPOSTER_GUESS;
  delete state.timers.discussionEndsAt;
  delete state.timers.votingEndsAt;
  state.guess = {
    eligibleIds, // the caught imposter (or imposters, defensively) who may guess
    guesses: {}, // playerId -> {correct, at}
    resolved: false,
    correctBy: null,
  };
}

function normalizeGuessInput(guess) {
  const text = String(guess ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function submitGuess(state, { playerId, guess, now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.IMPOSTER_GUESS);
  const g = state.guess;
  if (!g || g.resolved) throw new EngineError('GUESS_WRONG_PHASE', 'Guessing is not open right now.');
  if (!g.eligibleIds.includes(playerId)) {
    throw new EngineError('GUESS_NOT_ELIGIBLE', 'You are not eligible to guess the secret word.');
  }
  if (g.guesses[playerId]) {
    throw new EngineError('GUESS_DUPLICATE', 'You have already submitted your guess.');
  }
  const text = normalizeGuessInput(guess);
  if (text.length === 0) throw new EngineError('GUESS_EMPTY', 'Type a word before submitting.');
  if ([...text].length > MAX_GUESS_CODEPOINTS) {
    throw new EngineError('GUESS_TOO_LONG', 'That guess is too long.');
  }

  const round = currentRound(state);
  const correct = text.toLowerCase() === round.word.id;
  g.guesses[playerId] = { correct, at: now };
  round.guesses.push({ playerId, guess: text, correct, at: now });

  if (correct) {
    g.resolved = true;
    g.correctBy = playerId;
    endRound(state, { now, winner: 'imposters', reason: 'guess' });
  } else if (Object.keys(g.guesses).length >= g.eligibleIds.length) {
    g.resolved = true;
    // All guesses wrong — re-check the round outcome: the caught imposter may
    // have been the last imposter (innocents win), the cycle limit may be
    // reached (draw), otherwise the round continues with a new discussion.
    const activeImposters = activeRoleIds(state, ROLE_IMPOSTER);
    const cyclesUsed = round.cycles.length;
    if (activeImposters.length === 0) {
      endRound(state, { now, winner: 'innocents', reason: 'all_imposters_eliminated' });
    } else if (cyclesUsed >= MAX_VOTE_CYCLES_PER_ROUND) {
      endRound(state, { now, winner: 'draw', reason: 'cycle_limit' });
    } else {
      enterDiscussion(state, now);
    }
  }
  state.rev += 1;
  return state;
}

/** Host control: close guessing with whatever was submitted. */
export function endGuessing(state, { now = Date.now() }) {
  state = clone(state);
  requirePhase(state, PHASE.IMPOSTER_GUESS);
  const g = state.guess;
  if (!g || g.resolved) throw new EngineError('WRONG_PHASE', 'Guessing is already closed.');
  g.resolved = true;
  const round = currentRound(state);
  // No guess (or guessing closed) — same re-check as a wrong guess: the caught
  // imposter may have been the last one standing.
  const activeImposters = activeRoleIds(state, ROLE_IMPOSTER);
  if (activeImposters.length === 0) {
    endRound(state, { now, winner: 'innocents', reason: 'all_imposters_eliminated' });
  } else if (round.cycles.length >= MAX_VOTE_CYCLES_PER_ROUND) {
    endRound(state, { now, winner: 'draw', reason: 'cycle_limit' });
  } else {
    enterDiscussion(state, now);
  }
  state.rev += 1;
  return state;
}

// ---------------------------------------------------------------------------
// Timers (authoritative deadlines; clients only render countdowns)
// ---------------------------------------------------------------------------

/** Apply any expired deadline transitions. Idempotent; safe to call often. */
export function checkTimers(state, { now = Date.now() } = {}) {
  let changed = false;
  for (let i = 0; i < 4; i++) {
    if (state.phase === PHASE.DISCUSSION && state.timers.discussionEndsAt && now >= state.timers.discussionEndsAt) {
      state = endDiscussion(state, { now });
      changed = true;
      continue;
    }
    if (state.phase === PHASE.DISCUSSION && state.speaking && state.timers.speakingEndsAt && now >= state.timers.speakingEndsAt) {
      // Speaker time over: next player, or voting once everyone has spoken.
      state = clone(state);
      advanceSpeaking(state, now);
      state.rev += 1;
      changed = true;
      continue;
    }
    if (state.phase === PHASE.VOTING && state.timers.votingEndsAt && now >= state.timers.votingEndsAt) {
      state = endVoting(state, { now });
      changed = true;
      continue;
    }
    break;
  }
  return { state, changed };
}

// ---------------------------------------------------------------------------
// Replay / abort
// ---------------------------------------------------------------------------

/**
 * Play Again: exact same configuration and roster, completely fresh
 * assignments and a new word (duplicate prevention preserved across matches).
 */
export function playAgain(state, { now = Date.now(), rng = createRng(), db } = {}) {
  state = clone(state);
  requirePhase(state, PHASE.GAME_RESULT);
  state.matchNumber += 1;
  state.roundIndex = 0;
  state.rounds = [];
  state.chaosRandomWindow = null; // fresh random-chaos block per match
  state.status = 'active';
  state.gameResult = null;
  state.lastRoundResult = null;
  buildRound(state, { now, rng, db });
  state.phase = PHASE.ROLE_REVEAL;
  state.rev += 1;
  return state;
}

export function abortGame(state, { reason = 'abandoned' } = {}) {
  state = clone(state);
  if (state.status === 'finished') throw new EngineError('WRONG_PHASE', 'The game is already finished.');
  state.status = 'aborted';
  state.phase = PHASE.ABORTED;
  state.gameResult = { aborted: true, reason };
  delete state.timers.discussionEndsAt;
  delete state.timers.votingEndsAt;
  state.rev += 1;
  return state;
}

// ---------------------------------------------------------------------------
// Read helpers for UI
// ---------------------------------------------------------------------------

export function currentPlayerView(state, playerId) {
  const round = state.rounds[state.roundIndex];
  const active = round ? activeIds(state) : [];
  return {
    phase: state.phase,
    roundIndex: state.roundIndex,
    totalRounds: state.config.rounds,
    activeCount: active.length,
    isActive: active.includes(playerId),
    cycleCount: round ? round.cycles.length : 0,
  };
}

