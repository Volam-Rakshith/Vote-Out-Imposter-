// Shared engine constants — single source of truth for both the site (browser),
// the Supabase edge function (Deno) and the Node test-suite. No DOM/Deno APIs here.

export const GAME_ID = 'vote-out-imposter';
export const GAME_TITLE = 'VR DEVELOPMENTS — VOTE OUT IMPOSTER';

// --- Players -------------------------------------------------------------
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const MAX_NAME_CODEPOINTS = 24;
export const MAX_WORD_CODEPOINTS = 48;
export const MAX_GUESS_CODEPOINTS = 60;

// --- Match structure ------------------------------------------------------
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 20;
/** Maximum voting cycles (incl. revotes) per round before the round is resolved as a draw. */
export const MAX_VOTE_CYCLES_PER_ROUND = 5;

// --- Timers (seconds) ------------------------------------------------------
export const DISCUSSION_TIMER_CHOICES = [0, 30, 60, 90, 120];
export const VOTING_TIMER_CHOICES = [0, 15, 30, 45, 60];
export const MIN_DISCUSSION_TIMER = 10;
export const MAX_DISCUSSION_TIMER = 600;
export const MIN_VOTING_TIMER = 5;
export const MAX_VOTING_TIMER = 300;
/** Per-player speaking timer: each player gets X seconds in turn. */
export const SPEAKING_TIMER_CHOICES = [0, 10, 15, 20, 30, 45, 60, 90, 120];
export const MIN_SPEAKING_TIMER = 5;
export const MAX_SPEAKING_TIMER = 120;
/** Small grace window (ms) applied to server deadlines to absorb client clock skew. */
export const DEADLINE_GRACE_MS = 2000;

// --- Roles -----------------------------------------------------------------
export const ROLE_INNOCENT = 'innocent';
export const ROLE_IMPOSTER = 'imposter';

// --- Phases (explicit state machine) ----------------------------------------
export const PHASE = Object.freeze({
  SETUP: 'setup',            // local pre-game container (configuration being built)
  LOBBY: 'room_lobby',       // online room lobby
  ROLE_REVEAL: 'role_reveal',
  DISCUSSION: 'discussion',
  VOTING: 'voting',
  VOTE_RESULT: 'vote_result',
  IMPOSTER_GUESS: 'imposter_guess',
  ROUND_RESULT: 'round_result',
  GAME_RESULT: 'game_result',
  ABORTED: 'aborted',
});

export const PHASES = Object.values(PHASE);

// --- Imposter configuration --------------------------------------------------
/** Standard imposter-count options. `fixed` values are 1–4. */
export const IMPOSTER_MODES = ['fixed', 'custom', 'random'];

/** Chaos Mode — EXACTLY these five options. Do not add variants. */
export const CHAOS_OPTIONS = Object.freeze(['everyone', 'none', 'random', 'custom', 'no_hints']);
export const CHAOS = Object.freeze({
  EVERYONE: 'everyone', // Everyone Is Imposter
  NONE: 'none',         // No Imposter
  RANDOM: 'random',     // Random Imposter Count
  CUSTOM: 'custom',     // Custom Imposter Count
  NO_HINTS: 'no_hints', // No Hints (imposters get no hint)
});

/**
 * Random Imposter Count windows: one rolled count holds for a block of
 * 3–5 rounds, then re-rolls — big chaotic swings instead of per-round churn.
 */
export const CHAOS_RANDOM_WINDOW_MIN_ROUNDS = 3;
export const CHAOS_RANDOM_WINDOW_MAX_ROUNDS = 5;

export const CHAOS_LABELS = Object.freeze({
  everyone: 'Everyone Is Imposter',
  none: 'No Imposter',
  random: 'Random Imposter Count',
  custom: 'Custom Imposter Count',
  no_hints: 'No Hints',
});

// --- Words ---------------------------------------------------------------------
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_OPTIONS = ['easy', 'normal', 'hard', 'random'];
export const CATEGORY_MODES = ['selected', 'all', 'random'];

/** Human labels for the 28 word categories (display only). */
export const CATEGORY_LABELS = Object.freeze({
  food: 'Food & Drinks',
  people: 'People & Professions',
  family: 'Family & Relationships',
  household: 'Household & Everyday Life',
  transport: 'Transport',
  school: 'School & College',
  technology: 'Technology & Internet',
  sports: 'Sports & Games',
  places: 'Places & Buildings',
  entertainment: 'Entertainment & Media',
  animals: 'Animals & Birds',
  nature: 'Nature & Weather',
  india: 'India & Daily Life',
  festivals: 'Festivals & Occasions',
  clothing: 'Clothing & Accessories',
  healthcare: 'Healthcare Objects',
  shopping: 'Shopping & Money',
  chores: 'Household Chores',
  hobbies: 'Hobbies',
  instruments: 'Musical Instruments',
  tools: 'Tools',
  kitchen: 'Kitchen Appliances',
  colours: 'Colours & Shapes',
  travel: 'Travel',
  toys: 'Toys',
  emotions: 'Basic Emotions',
  special: 'Special (Tech & AI)',
  famous: 'Famous Characters & Figures',
});

// --- Room / online -----------------------------------------------------------
export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet: no 0/O, 1/I/L, 2/Z, 5/S, 8/B. */
export const ROOM_CODE_ALPHABET = '34679ACEFHJKMNPUWXY';
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;      // hard lifetime
export const ROOM_IDLE_TTL_MS = 4 * 60 * 60 * 1000;  // idle expiry
export const PRESENCE_TIMEOUT_MS = 30_000;
export const HOST_GRACE_MS = 60_000;

export const ENGINE_SCHEMA = 1;

export const DEFAULT_CONFIG = Object.freeze({
  imposter: Object.freeze({ mode: 'fixed', value: 1 }),
  chaos: null,
  chaosCustomCount: null,
  difficulty: 'normal',
  categories: Object.freeze({ mode: 'all', selected: [] }),
  rounds: 1,
  discussionTimerSec: 60,
  votingTimerSec: 30,
  speakingTimerSec: 0, // >0 = each player speaks for X seconds in turn
  imposterGuess: true,
});
