// Vote Out Imposter — shared rules engine (public API).
// Single source of truth imported by the browser UI, the Supabase edge
// function and the Node test-suite.

export * from './constants.js';
export { EngineError, isEngineError, WordsDataError } from './errors.js';
export { createRng, randomHex, randomRoomCode } from './random.js';
export { RAW_WORDS } from './words-data.js';
export { EXTRA_WORDS_1 } from './words-data-extra-1.js';
export { EXTRA_WORDS_2 } from './words-data-extra-2.js';
export {
  buildWordDatabase, normalizeWordId, normalizeGuessText, resolveCategorySet,
  eligibleWords, selectWord, validateDataset,
} from './words.js';
export {
  normalizeName, nameKey, validateName, validateRoster, normalizeConfig, validateConfig,
} from './validation.js';
export { resolveImposterCount, resolveChaosRandomCount, assignRoles } from './roles.js';
export { HINTS } from './hints-data.js';
export { selectHint, hintTooSimilar } from './hints.js';
export {
  createLocalGame, createLobby, lobbyAddPlayer, lobbyRemovePlayer, lobbySetName,
  lobbySetConfig, startGame, acknowledgeRole, skipReveal, endDiscussion, castVote,
  endVoting, votingProgress, advance, submitGuess, endGuessing, checkTimers,
  playAgain, abortGame, currentPlayerView, nextSpeaker,
} from './state.js';
export { toPublicState, privateViewFor } from './privacy.js';
export { SPEAKING_TIMER_CHOICES } from './validation.js';

import { buildWordDatabase } from './words.js';
import { RAW_WORDS } from './words-data.js';
import { EXTRA_WORDS_1 } from './words-data-extra-1.js';
import { EXTRA_WORDS_2 } from './words-data-extra-2.js';

/** Merge base categories with the expansion files (append per difficulty). */
export function mergeWordData(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [cat, groups] of Object.entries(source)) {
      if (!merged[cat]) merged[cat] = { easy: [], normal: [], hard: [] };
      for (const [difficulty, labels] of Object.entries(groups)) {
        merged[cat][difficulty] = [...(merged[cat][difficulty] ?? []), ...labels];
      }
    }
  }
  return merged;
}

/** The built-in word database (built + validated once per process). */
export const WORD_DB = buildWordDatabase(mergeWordData(RAW_WORDS, EXTRA_WORDS_1, EXTRA_WORDS_2));
