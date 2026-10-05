// Imposter hint selection.
//
// A hint is ALWAYS a related word (e.g. "water" for "sponge") — never a
// letter clue ("starts with S"), never a containment clue ("found in the
// kitchen"). Sources, in order:
//   1. A curated pair from hints-data.js (chosen for a far/loose association).
//   2. A seeded pick from the word's own category pool (thematically related
//      by definition), filtered so the hint is never the word itself, never
//      contains it, never shares a long prefix or first token with it.
// The No-Hints chaos variant skips hint delivery entirely (state.js).

import { HINTS } from './hints-data.js';

function norm(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when a candidate hint is too close to the secret word. */
export function hintTooSimilar(candidate, word) {
  const a = norm(candidate);
  const b = norm(word);
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // share a 4+ character prefix (e.g. "ice cream" vs "ice cube")
  const n = Math.min(a.length, b.length, 6);
  if (n >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
  // same first token (multi-word near-duplicates)
  const [a1] = a.split(' ');
  const [b1] = b.split(' ');
  if (a1.length >= 3 && a1 === b1) return true;
  return false;
}

/**
 * Pick the imposter hint for a secret word.
 * @param {object} db word database (WORD_DB)
 * @param {object} entry the selected word entry
 * @param {object} rng seeded/injectable rng
 * @returns {{ label: string, source: 'curated'|'related' } | null}
 */
export function selectHint(db, entry, rng) {
  if (!entry || !db) return null;

  // 1. curated association
  const curated = HINTS[entry.id];
  if (curated && !hintTooSimilar(curated, entry.label)) {
    return { label: norm(curated), source: 'curated' };
  }

  // 2. related word from the same category pools
  const seen = new Set([entry.id]);
  const pool = [];
  for (const cat of entry.categories ?? []) {
    for (const e of db.entries) {
      if (seen.has(e.id)) continue;
      if (!e.categories.includes(cat)) continue;
      if (hintTooSimilar(e.label, entry.label)) continue;
      seen.add(e.id);
      pool.push(e.label);
    }
  }
  if (pool.length === 0) return null;
  const label = pool[rng.int(pool.length)];
  return { label: norm(label), source: 'related' };
}
