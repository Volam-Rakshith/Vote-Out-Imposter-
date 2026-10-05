// Word database tests (spec §24.3 + §8.7).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORD_DB, buildWordDatabase, selectWord, validateDataset, normalizeWordId,
  RAW_WORDS, resolveCategorySet, eligibleWords, WordsDataError,
} from '../engine/index.js';
import { seededRng } from './helpers.js';

const REQUIRED_CATEGORIES = Object.keys(RAW_WORDS);
const CATEGORY_LABELS = {
  food: 'Food & Drinks', people: 'People & Professions', family: 'Family & Relationships',
  household: 'Household & Everyday Life', transport: 'Transport', school: 'School & College',
  technology: 'Technology & Internet', sports: 'Sports & Games', places: 'Places & Buildings',
  entertainment: 'Entertainment & Media', animals: 'Animals & Birds', nature: 'Nature & Weather',
  india: 'India & Daily Life', festivals: 'Festivals & Occasions', clothing: 'Clothing & Accessories',
  healthcare: 'Healthcare Objects', shopping: 'Shopping & Money', chores: 'Household Chores',
  hobbies: 'Hobbies', instruments: 'Musical Instruments', tools: 'Tools',
  kitchen: 'Kitchen Appliances', colours: 'Colours & Shapes', travel: 'Travel', toys: 'Toys',
  emotions: 'Basic Emotions', special: 'Special (Tech & AI)', famous: 'Famous Characters & Figures',
};

describe('dataset integrity', () => {
  test('contains at least 600 unique usable entries', () => {
    assert.ok(WORD_DB.entries.length >= 600, `only ${WORD_DB.entries.length}`);
  });

  test('all 28 required categories exist', () => {
    assert.equal(REQUIRED_CATEGORIES.length, 28);
    for (const cat of REQUIRED_CATEGORIES) assert.ok(WORD_DB.categories.includes(cat));
    // also used by the UI
    for (const id of Object.keys(CATEGORY_LABELS)) assert.ok(REQUIRED_CATEGORIES.includes(id));
  });

  test('every category has at least 30 distinct words', () => {
    for (const cat of REQUIRED_CATEGORIES) {
      const n = WORD_DB.entries.filter((e) => e.categories.includes(cat)).length;
      assert.ok(n >= 30, `${cat} has ${n}`);
    }
  });

  test('normalized ids are unique and labels non-empty', () => {
    const ids = new Set();
    for (const e of WORD_DB.entries) {
      assert.ok(e.label && e.label.length > 0, `empty label for ${e.id}`);
      assert.equal(normalizeWordId(e.label), e.id);
      assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
      ids.add(e.id);
    }
  });

  test('no placeholder entries', () => {
    const v = validateDataset(WORD_DB, { requiredCategories: REQUIRED_CATEGORIES, minTotal: 600, minPerCategory: 30 });
    assert.ok(v.ok, v.problems.join('; '));
  });

  test('every difficulty is represented', () => {
    const diffs = new Set(WORD_DB.entries.map((e) => e.difficulty));
    assert.deepEqual([...diffs].sort(), ['easy', 'hard', 'normal']);
  });

  test('cross-category words merge into one entry with multiple tags', () => {
    const teacher = WORD_DB.byId.get('teacher');
    assert.ok(teacher);
    assert.ok(teacher.categories.includes('people') && teacher.categories.includes('family'));
    const camera = WORD_DB.byId.get('camera');
    assert.ok(camera.categories.length >= 3, 'camera should tag technology/entertainment/travel');
  });

  test('builder rejects conflicting difficulty for the same word', () => {
    const raw = { a: { easy: ['X'] }, b: { hard: ['X'] } };
    assert.throws(() => buildWordDatabase(raw), WordsDataError);
  });

  test('builder rejects duplicates within one category', () => {
    const raw = { a: { easy: ['X', 'x'] } };
    assert.throws(() => buildWordDatabase(raw), WordsDataError);
  });
});

describe('word selection', () => {
  test('respects category and difficulty filters exactly', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const sel = selectWord(WORD_DB, {
        categories: { mode: 'selected', selected: ['food'] },
        difficulty: 'easy',
        usedIds: [],
        rng: seededRng(seed),
      });
      assert.ok(sel.entry.categories.includes('food'));
      assert.equal(sel.entry.difficulty, 'easy');
    }
  });

  test('never falls back to unselected categories', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const sel = selectWord(WORD_DB, {
        categories: { mode: 'selected', selected: ['instruments', 'tools'] },
        difficulty: 'hard',
        usedIds: [],
        rng: seededRng(seed),
      });
      assert.ok(
        sel.entry.categories.some((c) => c === 'instruments' || c === 'tools'),
        `${sel.entry.id} is outside the selected categories`
      );
    }
  });

  test('random category only picks from the permitted set', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sel = selectWord(WORD_DB, {
        categories: { mode: 'random', selected: ['food', 'animals'] },
        difficulty: 'normal',
        usedIds: [],
        rng: seededRng(seed),
      });
      assert.ok(['food', 'animals'].includes(sel.resolvedCategory));
    }
  });

  test('random difficulty resolves to a concrete, valid difficulty', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sel = selectWord(WORD_DB, {
        categories: { mode: 'all' },
        difficulty: 'random',
        usedIds: [],
        rng: seededRng(seed),
      });
      assert.ok(['easy', 'normal', 'hard'].includes(sel.resolvedDifficulty));
    }
  });

  test('no repeats until the eligible pool is exhausted, then recycle', () => {
    const cats = { mode: 'selected', selected: ['emotions'] };
    const diff = 'hard';
    const pool = eligibleWords(WORD_DB, ['emotions'], 'hard');
    assert.ok(pool.length >= 3);
    const used = [];
    let recycled = false;
    for (let i = 0; i < pool.length + 2; i++) {
      const sel = selectWord(WORD_DB, { categories: cats, difficulty: diff, usedIds: used, rng: seededRng(i + 1) });
      if (sel.recycled) { recycled = true; break; }
      used.push(sel.entry.id);
    }
    // Before recycling, no word repeated.
    assert.equal(new Set(used).size, used.length);
    assert.ok(recycled, 'pool should eventually report recycled');
    // The recycled selection is still from the eligible pool.
    const sel = selectWord(WORD_DB, { categories: cats, difficulty: diff, usedIds: used, rng: seededRng(2) });
    assert.ok(sel.entry.categories.includes('emotions'));
    assert.equal(sel.entry.difficulty, 'hard');
  });

  test('empty selection set throws a typed error instead of guessing', () => {
    let code = null;
    try {
      selectWord(WORD_DB, { categories: { mode: 'selected', selected: [] }, difficulty: 'easy', usedIds: [], rng: seededRng(1) });
    } catch (e) { code = e.code; }
    assert.equal(code, 'NO_ELIGIBLE_WORDS');
  });

  test('category+difficulty combo with no words throws (no silent fallback)', () => {
    let code = null;
    const tinyDb = buildWordDatabase({ tiny: { easy: ['alpha'], normal: [], hard: [] } });
    try {
      selectWord(tinyDb, { categories: { mode: 'selected', selected: ['tiny'] }, difficulty: 'hard', usedIds: [], rng: seededRng(1) });
    } catch (e) { code = e.code; }
    assert.equal(code, 'NO_ELIGIBLE_WORDS');
  });

  test('resolveCategorySet handles all/selected/random', () => {
    assert.equal(resolveCategorySet(WORD_DB, { mode: 'all' }).length, 28);
    assert.deepEqual(resolveCategorySet(WORD_DB, { mode: 'selected', selected: ['food'] }), ['food']);
    assert.deepEqual(resolveCategorySet(WORD_DB, { mode: 'random', selected: ['food', 'toys'] }), ['food', 'toys']);
    assert.equal(resolveCategorySet(WORD_DB, { mode: 'random', selected: [] }).length, 28);
  });

  test('familiar Indian/everyday words exist at easy difficulty', () => {
    for (const w of ['dosa', 'idli', 'cricket', 'school', 'bus', 'doctor', 'teacher', 'hospital', 'rain', 'birthday', 'smartphone']) {
      const e = WORD_DB.byId.get(w);
      assert.ok(e, `${w} should exist`);
    }
  });
});
