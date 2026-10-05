// Input validation: player names, rosters and game configuration.
// Pure functions — no DOM, no storage. Used by the UI, the engine and the
// online backend (which re-validates every payload).

import {
  MIN_PLAYERS, MAX_PLAYERS, MAX_NAME_CODEPOINTS, MIN_ROUNDS, MAX_ROUNDS,
  DISCUSSION_TIMER_CHOICES, VOTING_TIMER_CHOICES, MIN_DISCUSSION_TIMER,
  MAX_DISCUSSION_TIMER, MIN_VOTING_TIMER, MAX_VOTING_TIMER, IMPOSTER_MODES,
  SPEAKING_TIMER_CHOICES, MIN_SPEAKING_TIMER, MAX_SPEAKING_TIMER,
  CHAOS_OPTIONS, DIFFICULTY_OPTIONS, CATEGORY_MODES, DEFAULT_CONFIG,
} from './constants.js';
import { resolveCategorySet, eligibleWords } from './words.js';

// --- Names -----------------------------------------------------------------

/** NFKC-normalize, collapse internal whitespace, trim. */
export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive comparison key for duplicate detection. */
export function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Validate a display name.
 * @returns {{ ok: boolean, error?: { code: string, message: string }, value?: string }}
 */
export function validateName(name, { existingNames = [] } = {}) {
  const value = normalizeName(name);
  if (value.length === 0) {
    return { ok: false, error: { code: 'NAME_EMPTY', message: 'Enter a name — it cannot be empty.' } };
  }
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, error: { code: 'NAME_INVALID', message: 'Names cannot contain control characters.' } };
  }
  if ([...value].length > MAX_NAME_CODEPOINTS) {
    return {
      ok: false,
      error: { code: 'NAME_TOO_LONG', message: `Names are limited to ${MAX_NAME_CODEPOINTS} characters.` },
    };
  }
  const key = nameKey(value);
  const clash = existingNames.find((n) => nameKey(n) === key);
  if (clash != null) {
    return {
      ok: false,
      error: { code: 'NAME_DUPLICATE', message: `“${clash}” is already in the list — names must be unique.` },
    };
  }
  return { ok: true, value };
}

/** Validate a full roster (array of {id, name}). */
export function validateRoster(players, { forStart = true } = {}) {
  if (!Array.isArray(players)) return { ok: false, errors: [{ code: 'ROSTER_INVALID', message: 'Invalid player list.' }] };
  const errors = [];
  const ids = new Set();
  const names = [];
  for (const p of players) {
    if (!p || typeof p.id !== 'string' || p.id.length === 0) {
      errors.push({ code: 'PLAYER_ID_INVALID', message: 'A player entry is missing a stable id.' });
      continue;
    }
    if (ids.has(p.id)) errors.push({ code: 'PLAYER_ID_DUPLICATE', message: `Duplicate player id ${p.id}.` });
    ids.add(p.id);
    const check = validateName(p.name, { existingNames: names });
    if (!check.ok) errors.push({ ...check.error, player: p.id });
    else names.push(check.value);
  }
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    errors.push({
      code: 'PLAYER_COUNT',
      message: `A game needs between ${MIN_PLAYERS} and ${MAX_PLAYERS} players (currently ${players.length}).`,
    });
  }
  if (forStart && players.length < MIN_PLAYERS) {
    errors.push({ code: 'PLAYER_COUNT', message: `Add at least ${MIN_PLAYERS} players to start.` });
  }
  return { ok: errors.length === 0, errors };
}

// --- Configuration -----------------------------------------------------------

/** Deep-merge a partial config over defaults (does NOT validate). */
export function normalizeConfig(partial = {}) {
  const d = structuredClone(DEFAULT_CONFIG);
  const p = partial ?? {};
  const imposter = { ...d.imposter, ...(p.imposter ?? {}) };
  const categories = { ...d.categories, ...(p.categories ?? {}) };
  return {
    ...d,
    ...p,
    imposter,
    categories,
    chaos: p.chaos ?? null,
    chaosCustomCount: p.chaosCustomCount ?? null,
    rounds: p.rounds ?? d.rounds,
    discussionTimerSec: p.discussionTimerSec ?? d.discussionTimerSec,
    votingTimerSec: p.votingTimerSec ?? d.votingTimerSec,
    speakingTimerSec: p.speakingTimerSec ?? d.speakingTimerSec,
    imposterGuess: p.imposterGuess ?? d.imposterGuess,
  };
}

/**
 * Validate a game configuration against the current roster size and word DB.
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string,field?:string}> , config: object }}
 */
export function validateConfig(config, { playerCount, db }) {
  const errors = [];
  const cfg = normalizeConfig(config);

  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    errors.push({
      code: 'PLAYER_COUNT',
      field: 'players',
      message: `A game needs between ${MIN_PLAYERS} and ${MAX_PLAYERS} players (currently ${playerCount}).`,
    });
  }

  // Imposter count (standard) ---------------------------------------------
  const maxImposters = Math.max(1, playerCount - 1);
  if (!IMPOSTER_MODES.includes(cfg.imposter.mode)) {
    errors.push({ code: 'IMPOSTER_MODE', field: 'imposter', message: 'Invalid imposter-count mode.' });
  } else if (cfg.imposter.mode === 'fixed') {
    const v = cfg.imposter.value;
    if (![1, 2, 3, 4].includes(v)) {
      errors.push({ code: 'IMPOSTER_COUNT', field: 'imposter', message: 'Choose one, two, three or four imposters.' });
    } else if (v > maxImposters) {
      errors.push({
        code: 'IMPOSTER_COUNT',
        field: 'imposter',
        message: `With ${playerCount} players you can have at most ${maxImposters} imposters — there must always be at least one innocent.`,
      });
    }
  } else if (cfg.imposter.mode === 'custom') {
    const v = cfg.imposter.value;
    if (!Number.isInteger(v) || v < 1 || v > maxImposters) {
      errors.push({
        code: 'IMPOSTER_COUNT',
        field: 'imposter',
        message: `Custom imposter count must be a whole number between 1 and ${maxImposters}.`,
      });
    }
  } // 'random' is always valid for 3+ players (range 1..min(4, n-1) ≥ 1)

  // Chaos mode ---------------------------------------------------------------
  if (cfg.chaos !== null) {
    if (!CHAOS_OPTIONS.includes(cfg.chaos)) {
      errors.push({ code: 'CHAOS_INVALID', field: 'chaos', message: 'Invalid Chaos Mode option.' });
    } else if (cfg.chaos === 'custom') {
      const v = cfg.chaosCustomCount;
      if (!Number.isInteger(v) || v < 1 || v > maxImposters) {
        errors.push({
          code: 'CHAOS_CUSTOM_COUNT',
          field: 'chaos',
          message: `Chaos custom imposter count must be a whole number between 1 and ${maxImposters}.`,
        });
      }
    }
  }

  // Words ---------------------------------------------------------------------
  if (!DIFFICULTY_OPTIONS.includes(cfg.difficulty)) {
    errors.push({ code: 'DIFFICULTY', field: 'difficulty', message: 'Choose Easy, Normal, Hard or Random difficulty.' });
  }
  if (!CATEGORY_MODES.includes(cfg.categories.mode)) {
    errors.push({ code: 'CATEGORY_MODE', field: 'categories', message: 'Invalid category selection mode.' });
  } else if (cfg.categories.mode === 'selected' && (cfg.categories.selected ?? []).length === 0) {
    errors.push({ code: 'CATEGORIES_EMPTY', field: 'categories', message: 'Select at least one word category.' });
  }
  const unknownCats = (cfg.categories.selected ?? []).filter((c) => !db.categories.includes(c));
  if (unknownCats.length > 0) {
    errors.push({ code: 'CATEGORY_UNKNOWN', field: 'categories', message: `Unknown categories: ${unknownCats.join(', ')}` });
  }
  const catSet = resolveCategorySet(db, cfg.categories);
  if (catSet.length > 0) {
    const pool = eligibleWords(db, catSet, null);
    if (pool.length === 0) {
      errors.push({ code: 'WORD_POOL_EMPTY', field: 'categories', message: 'The selected categories have no words at all.' });
    } else if (cfg.difficulty !== 'random' && !pool.some((e) => e.difficulty === cfg.difficulty)) {
      errors.push({
        code: 'WORD_POOL_EMPTY',
        field: 'difficulty',
        message: 'This category and difficulty combination has no available words. Choose another category or difficulty.',
      });
    }
  }

  // Match structure --------------------------------------------------------------
  if (!Number.isInteger(cfg.rounds) || cfg.rounds < MIN_ROUNDS || cfg.rounds > MAX_ROUNDS) {
    errors.push({
      code: 'ROUNDS',
      field: 'rounds',
      message: `Rounds must be a whole number between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`,
    });
  }
  const dt = cfg.discussionTimerSec;
  if (!(dt === 0 || (Number.isInteger(dt) && dt >= MIN_DISCUSSION_TIMER && dt <= MAX_DISCUSSION_TIMER))) {
    errors.push({
      code: 'TIMER_DISCUSSION',
      field: 'discussionTimer',
      message: `Discussion time must be Off or ${MIN_DISCUSSION_TIMER}–${MAX_DISCUSSION_TIMER} seconds.`,
    });
  }
  const vt = cfg.votingTimerSec;
  if (!(vt === 0 || (Number.isInteger(vt) && vt >= MIN_VOTING_TIMER && vt <= MAX_VOTING_TIMER))) {
    errors.push({
      code: 'TIMER_VOTING',
      field: 'votingTimer',
      message: `Voting time must be Off or ${MIN_VOTING_TIMER}–${MAX_VOTING_TIMER} seconds.`,
    });
  }
  const st = cfg.speakingTimerSec;
  if (!(st === 0 || (Number.isInteger(st) && st >= MIN_SPEAKING_TIMER && st <= MAX_SPEAKING_TIMER))) {
    errors.push({
      code: 'TIMER_SPEAKING',
      field: 'speakingTimer',
      message: `Speaking time must be Off or ${MIN_SPEAKING_TIMER}–${MAX_SPEAKING_TIMER} seconds per player.`,
    });
  }
  if (typeof cfg.imposterGuess !== 'boolean') {
    errors.push({ code: 'IMPOSTER_GUESS', field: 'imposterGuess', message: 'Imposter Guess must be on or off.' });
  }

  return { ok: errors.length === 0, errors, config: cfg };
}

export { DISCUSSION_TIMER_CHOICES, VOTING_TIMER_CHOICES, SPEAKING_TIMER_CHOICES };
