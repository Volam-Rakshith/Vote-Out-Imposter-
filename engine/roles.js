// Role assignment — cryptographically secure, unbiased, never based on roster
// order. Uses an injectable rng (crypto-backed by default).

import { EngineError } from './errors.js';
import {
  ROLE_INNOCENT, ROLE_IMPOSTER,
  CHAOS_RANDOM_WINDOW_MIN_ROUNDS, CHAOS_RANDOM_WINDOW_MAX_ROUNDS,
} from './constants.js';

/**
 * Resolve how many imposters a round gets, honouring Chaos Mode overrides.
 * Chaos: everyone (all imposters), none (zero), random (1..n-1), custom
 * (validated), no_hints (standard counts — only hint delivery changes).
 * Standard: fixed 1–4, custom 1..n-1, random 1..min(4, n-1).
 */
export function resolveImposterCount({ playerCount, config, rng }) {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new EngineError('PLAYER_COUNT', 'Invalid player count for role assignment.');
  }
  const max = playerCount - 1;
  if (max < 1) throw new EngineError('IMPOSSIBLE_ROLES', 'Need at least 2 players to assign roles.');

  const chaos = config.chaos;
  if (chaos === 'everyone') return { count: playerCount, chaos: true };
  if (chaos === 'none') return { count: 0, chaos: true };
  if (chaos === 'random') return { count: 1 + rng.int(max), chaos: true };
  if (chaos === 'custom') {
    const v = config.chaosCustomCount;
    if (!Number.isInteger(v) || v < 1 || v > max) {
      throw new EngineError('CHAOS_CUSTOM_COUNT', `Chaos custom imposter count must be between 1 and ${max}.`);
    }
    return { count: v, chaos: true };
  }
  // 'no_hints' chaos and standard play use the configured imposter count.
  return resolveStandardCount(config, max, playerCount, rng);
}

/**
 * Random Chaos window: one rolled imposter count holds for a block of
 * 3–5 rounds, then re-rolls. `window` is the previous { count, until } —
 * pass the state's stored window and the current roundIndex; the returned
 * window must be persisted by the caller. Returns { count, window }.
 */
export function resolveChaosRandomCount({ roundIndex, window, playerCount, config, rng }) {
  if (window && Number.isInteger(window.until) && roundIndex < window.until) {
    return { count: window.count, window };
  }
  // Re-roll: fresh count + fresh 3–5 round block.
  const { count } = resolveImposterCount({ playerCount, config, rng });
  const span = CHAOS_RANDOM_WINDOW_MIN_ROUNDS
    + rng.int(CHAOS_RANDOM_WINDOW_MAX_ROUNDS - CHAOS_RANDOM_WINDOW_MIN_ROUNDS + 1);
  const win = { count, until: roundIndex + span };
  return { count, window: win };
}

function resolveStandardCount(config, max, playerCount, rng) {
  const mode = config.imposter.mode;
  if (mode === 'fixed') {
    const v = config.imposter.value;
    if (![1, 2, 3, 4].includes(v) || v > max) {
      throw new EngineError('IMPOSTER_COUNT', `Invalid imposter count ${v} for ${playerCount} players.`);
    }
    return { count: v, chaos: false };
  }
  if (mode === 'custom') {
    const v = config.imposter.value;
    if (!Number.isInteger(v) || v < 1 || v > max) {
      throw new EngineError('IMPOSTER_COUNT', `Custom imposter count must be between 1 and ${max}.`);
    }
    return { count: v, chaos: false };
  }
  if (mode === 'random') {
    return { count: 1 + rng.int(Math.min(4, max)), chaos: false };
  }
  throw new EngineError('IMPOSTER_MODE', `Unknown imposter mode "${mode}".`);
}

/**
 * Assign roles: uniform random shuffle of player ids, first `count` are imposters.
 * @returns {Map<string, string>} playerId -> role
 */
export function assignRoles({ players, count, rng }) {
  if (!Array.isArray(players) || players.length < 2) {
    throw new EngineError('IMPOSSIBLE_ROLES', 'Need at least 2 players to assign roles.');
  }
  if (!Number.isInteger(count) || count < 0 || count > players.length) {
    throw new EngineError('IMPOSSIBLE_ROLES', `Impossible imposter count ${count} for ${players.length} players.`);
  }
  if (count === players.length && players.length > 0) {
    // Only valid for the explicit "Everyone Is Imposter" chaos variant, which
    // passes count = players.length — allowed, but never in normal mode.
    // (Normal mode is validated upstream to always leave ≥1 innocent.)
  }
  const roles = new Map();
  const shuffled = rng.shuffle(players.map((p) => p.id));
  const imposters = new Set(shuffled.slice(0, count));
  for (const p of players) {
    roles.set(p.id, imposters.has(p.id) ? ROLE_IMPOSTER : ROLE_INNOCENT);
  }
  // Invariant: exactly `count` imposters, everyone gets exactly one role.
  let seenImposters = 0;
  for (const r of roles.values()) if (r === ROLE_IMPOSTER) seenImposters++;
  if (seenImposters !== count || roles.size !== players.length) {
    throw new EngineError('ROLE_ASSIGNMENT_FAILED', 'Role assignment invariant violated.');
  }
  return roles;
}
