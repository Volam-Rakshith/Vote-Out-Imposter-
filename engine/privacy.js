// Public/private state separation.
//
// toPublicState() produces the state that may be broadcast to every client:
// it NEVER contains the current round's secret word, role map, individual
// votes, or guess contents. privateViewFor() produces the minimum private
// payload a single player is authorized to see.
//
// These functions are used by the online backend; a dedicated test scans the
// serialized public state for the secret word and role assignments.

import { PHASE, ROLE_INNOCENT, ROLE_IMPOSTER } from './constants.js';

const clone = (x) => structuredClone(x);

function publicCycle(cycle) {
  return {
    number: cycle.number,
    isRevote: cycle.isRevote,
    tallies: cycle.tallies,          // aggregate totals only
    totalVotes: cycle.totalVotes,
    outcome: cycle.outcome,
    eliminatedId: cycle.eliminatedId,
    revealedRole: cycle.revealedRole,
    tieIds: cycle.tieIds,
  };
}

/**
 * Build the publicly broadcastable projection of a game state.
 * Completed rounds are fully revealed except individual voter choices,
 * which are never published (aggregate totals only).
 */
export function toPublicState(state) {
  const pub = clone(state);
  delete pub.usedWordIds; // contains the current secret word's id — never public
  delete pub.chaosRandomWindow; // holds the active random-chaos imposter count — secret during play
  delete pub.speaking; // re-added below ONLY as the public projection while active

  const currentIdx = state.roundIndex;
  pub.rounds = state.rounds.map((round, i) => {
    const complete = Boolean(round.result);
    if (complete) {
      return {
        index: round.index,
        startedAt: round.startedAt,
        completedAt: round.completedAt ?? null,
        difficulty: round.difficulty,
        category: round.category,
        wordRecycled: round.wordRecycled,
        word: round.word,                    // revealed once the round is over
        hint: round.hint ?? null,            // revealed once the round is over
        roles: round.roles,                  // revealed once the round is over
        revealedRoles: round.revealedRoles,
        eliminated: round.eliminated,
        cycles: round.cycles.map(publicCycle),
        guesses: round.guesses.map((g) => ({ playerId: g.playerId, guess: g.guess, correct: g.correct })),
        result: round.result,
      };
    }
    if (i !== currentIdx) return { index: round.index, incomplete: true };
    // Active round: keep only what is public during play.
    return {
      index: round.index,
      startedAt: round.startedAt,
      difficulty: round.difficulty,
      category: round.category,             // category is public — it helps imposters play
      wordRecycled: round.wordRecycled,
      revealedRoles: round.revealedRoles,   // roles of eliminated players
      eliminated: round.eliminated,
      cycles: round.cycles.map(publicCycle),
      guessCount: round.guesses.length,     // count only — who guessed would leak imposters
      result: null,
    };
  });

  // Active speaking turn (per-player mode): public — the current speaker is
  // speaking out loud anyway. Contains no roles, words or votes.
  if (state.phase === PHASE.DISCUSSION && state.speaking) {
    const sp = state.speaking;
    pub.speaking = {
      playerId: sp.order[sp.index] ?? null,
      index: sp.index,
      total: sp.order.length,
      order: [...sp.order],
      endsAt: sp.endsAt,
      secPerPlayer: sp.secPerPlayer,
    };
  }

  // Active voting: reveal who has voted (allowed) but never targets.
  if (state.voting) {
    pub.voting = {
      cycle: state.voting.cycle,
      isRevote: state.voting.isRevote,
      candidates: state.voting.candidates,
      voted: Object.keys(state.voting.votes),
      tallied: state.voting.tallied,
    };
  }

  // Active guess phase: only how many imposters still owe a guess.
  if (state.guess) {
    pub.guess = {
      pendingCount: Math.max(0, state.guess.eligibleIds.length - Object.keys(state.guess.guesses).length),
      resolved: state.guess.resolved,
    };
  }

  if (state.lastVoteResult) {
    pub.lastVoteResult = clone(state.lastVoteResult); // tallies/outcome only — no voter map
  }
  return pub;
}

/**
 * The private payload for a single player. Contains ONLY that player's own
 * information: their role, the secret word if they are an innocent, their
 * own vote/guess status.
 */
export function privateViewFor(state, playerId) {
  const view = { playerId, phase: state.phase };
  if (!state.players.some((p) => p.id === playerId)) return view;

  const round = state.rounds[state.roundIndex];
  if (round && !round.result) {
    const role = round.roles[playerId] ?? null;
    view.role = role;
    // Only innocents ever receive the word. Imposters (and everyone in the
    // "Everyone Is Imposter" variant) never do.
    view.word = role === ROLE_INNOCENT ? round.word.label : null;
    // Imposters receive the private hint (a related word); innocents do not
    // need one. Null when hints are disabled (No-Hints chaos variant).
    view.hint = role === ROLE_IMPOSTER ? (round.hint ?? null) : null;
  }

  if (state.phase === PHASE.VOTING && state.voting) {
    view.hasVoted = Boolean(state.voting.votes[playerId]);
  }
  if (state.phase === PHASE.IMPOSTER_GUESS && state.guess) {
    const mine = state.guess.guesses[playerId];
    view.guess = {
      eligible: state.guess.eligibleIds.includes(playerId),
      submitted: Boolean(mine),
      correct: mine ? mine.correct : null,
    };
  } else if (state.guess) {
    view.guess = { eligible: false, submitted: false, correct: null };
  }
  return view;
}
