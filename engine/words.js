// Word database builder + selection logic.
// A canonical word entry can carry multiple category tags; difficulty belongs
// to the entry. Selection always respects active category/difficulty filters,
// avoids repeats until the eligible pool is exhausted, and never falls back to
// unselected categories.

import { WordsDataError } from './errors.js';
import { DIFFICULTIES } from './constants.js';

/** Normalize a word label into its id: NFKC → lowercase → collapse whitespace. */
export function normalizeWordId(label) {
  return String(label)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a guess for comparison (case-insensitive exact match policy). */
export function normalizeGuessText(text) {
  return normalizeWordId(text);
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Build (and validate) the word database from raw category data.
 * Throws WordsDataError on any structural problem — bad data must never ship.
 */
export function buildWordDatabase(raw) {
  const entries = new Map();

  for (const [categoryId, groups] of Object.entries(raw)) {
    if (!groups || typeof groups !== 'object') {
      throw new WordsDataError(`Category "${categoryId}" is not a difficulty group object`);
    }
    for (const [difficulty, labels] of Object.entries(groups)) {
      if (!DIFFICULTIES.includes(difficulty)) {
        throw new WordsDataError(`Category "${categoryId}" has invalid difficulty "${difficulty}"`);
      }
      if (!Array.isArray(labels)) throw new WordsDataError(`Category "${categoryId}.${difficulty}" is not an array`);
      for (const label of labels) {
        if (typeof label !== 'string' || label.length === 0) {
          throw new WordsDataError(`Category "${categoryId}" contains a non-string label`);
        }
        if (CONTROL_CHARS.test(label)) {
          throw new WordsDataError(`Word "${label}" contains control characters`);
        }
        if (label !== label.trim()) {
          throw new WordsDataError(`Word "${label}" has leading/trailing whitespace`);
        }
        if ([...label].length > 48) {
          throw new WordsDataError(`Word "${label}" exceeds 48 code points`);
        }
        const id = normalizeWordId(label);
        if (!id) throw new WordsDataError(`Word "${label}" normalizes to an empty id`);
        let entry = entries.get(id);
        if (!entry) {
          entry = { id, label, categories: [], difficulty };
          entries.set(id, entry);
        } else {
          if (entry.difficulty !== difficulty) {
            throw new WordsDataError(
              `Word "${label}" has conflicting difficulty: "${entry.difficulty}" vs "${difficulty}" (category ${categoryId})`
            );
          }
          if (entry.categories.includes(categoryId)) {
            throw new WordsDataError(`Word "${label}" duplicated within category "${categoryId}"`);
          }
        }
        entry.categories.push(categoryId);
      }
    }
  }

  const list = [...entries.values()];
  const byId = new Map(list.map((e) => [e.id, e]));
  const categories = Object.keys(raw);
  return { entries: list, byId, categories };
}

/** Resolve the effective category set from a category config. */
export function resolveCategorySet(db, categoriesConfig) {
  const mode = categoriesConfig?.mode ?? 'all';
  if (mode === 'all') return db.categories;
  if (mode === 'random' || mode === 'selected') {
    const selected = (categoriesConfig?.selected ?? []).filter((c) => db.categories.includes(c));
    if (mode === 'selected') return selected;
    // random mode: permitted set is the selection (or all if none selected)
    return selected.length > 0 ? selected : db.categories;
  }
  throw new WordsDataError(`Invalid category mode "${mode}"`);
}

/** Words eligible for a category set + fixed difficulty. */
export function eligibleWords(db, categorySet, difficulty) {
  const cats = new Set(categorySet);
  return db.entries.filter(
    (e) => e.categories.some((c) => cats.has(c)) && (difficulty == null || e.difficulty === difficulty)
  );
}

/**
 * Select a secret word.
 * @returns {{ entry, resolvedDifficulty, resolvedCategory, recycled, poolSize }}
 * @throws EngineError NO_ELIGIBLE_WORDS when the active filters match nothing.
 */
export function selectWord(db, { categories: categoriesConfig, difficulty, usedIds, rng }) {
  const categorySet = resolveCategorySet(db, categoriesConfig);
  if (categorySet.length === 0) {
    const err = new Error('No categories available for the current selection.');
    err.code = 'NO_ELIGIBLE_WORDS';
    throw err;
  }

  let pool = eligibleWords(db, categorySet, null);
  let resolvedCategory = null;

  if (categoriesConfig.mode === 'random') {
    // Random category: choose uniformly among permitted categories that can
    // actually supply a word under the difficulty policy. Never falls back to
    // categories outside the permitted set.
    const needsDifficulty = difficulty !== 'random';
    const candidateCats = categorySet.filter((cat) => {
      const inCat = pool.filter((e) => e.categories.includes(cat));
      if (inCat.length === 0) return false;
      if (!needsDifficulty) return true;
      return inCat.some((e) => e.difficulty === difficulty);
    });
    if (candidateCats.length === 0) {
      const err = new Error('The selected categories have no words for this difficulty.');
      err.code = 'NO_ELIGIBLE_WORDS';
      throw err;
    }
    resolvedCategory = rng.pick(candidateCats);
    pool = pool.filter((e) => e.categories.includes(resolvedCategory));
  }

  let resolvedDifficulty = difficulty;
  if (difficulty === 'random') {
    const diffs = DIFFICULTIES.filter((d) => pool.some((e) => e.difficulty === d));
    if (diffs.length === 0) {
      const err = new Error('The selected categories have no words for this difficulty.');
      err.code = 'NO_ELIGIBLE_WORDS';
      throw err;
    }
    resolvedDifficulty = rng.pick(diffs);
  }

  const finalPool = pool.filter((e) => e.difficulty === resolvedDifficulty);
  if (finalPool.length === 0) {
    const err = new Error('This category and difficulty combination has no available words.');
    err.code = 'NO_ELIGIBLE_WORDS';
    throw err;
  }

  const used = new Set(usedIds ?? []);
  let fresh = finalPool.filter((e) => !used.has(e.id));
  let recycled = false;
  if (fresh.length === 0) {
    // Pool exhausted: reset the used-word cycle for THIS eligible pool only.
    fresh = finalPool;
    recycled = true;
  }
  const entry = rng.pick(fresh);
  return {
    entry,
    resolvedDifficulty,
    resolvedCategory,
    recycled,
    poolSize: finalPool.length,
    recycleIds: recycled ? finalPool.map((e) => e.id) : [],
  };
}

// --- Dataset validation (used by tests and scripts/validate-words.mjs) --------

const PLACEHOLDER_PATTERNS = [
  /^word\s*\d+$/i,
  /placeholder/i,
  /^test\s*word/i,
  /^lorem/i,
  /^xyz+/i,
  /^(?:[a-z])\1{2,}$/i, // e.g. "aaa", "xxx"
];

export function validateDataset(db, { requiredCategories, minTotal = 600, minPerCategory = 30 }) {
  const problems = [];
  const counts = { total: db.entries.length, byCategory: {}, byDifficulty: { easy: 0, normal: 0, hard: 0 } };

  for (const cat of requiredCategories) {
    if (!db.categories.includes(cat)) problems.push(`Missing required category "${cat}"`);
  }
  for (const cat of db.categories) {
    counts.byCategory[cat] = db.entries.filter((e) => e.categories.includes(cat)).length;
    if (counts.byCategory[cat] < minPerCategory) {
      problems.push(`Category "${cat}" has only ${counts.byCategory[cat]} words (min ${minPerCategory})`);
    }
  }
  for (const e of db.entries) {
    counts.byDifficulty[e.difficulty] += 1;
    if (PLACEHOLDER_PATTERNS.some((re) => re.test(e.label))) {
      problems.push(`Placeholder-like word "${e.label}"`);
    }
    if (!DIFFICULTIES.includes(e.difficulty)) problems.push(`Invalid difficulty on "${e.label}"`);
    if (e.categories.length === 0) problems.push(`Word "${e.label}" has no category`);
  }
  if (counts.total < minTotal) problems.push(`Dataset has ${counts.total} words (min ${minTotal})`);
  for (const d of DIFFICULTIES) {
    if (counts.byDifficulty[d] === 0) problems.push(`No words with difficulty "${d}"`);
  }
  // Uniqueness is inherent (Map by id) — verified by construction + recount here.
  const uniqueIds = new Set(db.entries.map((e) => e.id));
  if (uniqueIds.size !== db.entries.length) problems.push('Duplicate word ids detected');

  return { ok: problems.length === 0, problems, counts };
}
