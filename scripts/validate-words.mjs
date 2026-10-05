#!/usr/bin/env node
// Standalone word-database validation (spec §8.7).
// Usage: node scripts/validate-words.mjs [--json]
// Exits non-zero when validation fails.

import { WORD_DB, validateDataset, RAW_WORDS } from '../engine/index.js';

const REQUIRED_CATEGORIES = Object.keys(RAW_WORDS);
const flags = new Set(process.argv.slice(2));
const json = flags.has('--json');

const result = validateDataset(WORD_DB, {
  requiredCategories: REQUIRED_CATEGORIES,
  minTotal: 600,
  minPerCategory: 30,
});

const perCategory = {};
for (const cat of WORD_DB.categories) {
  perCategory[cat] = WORD_DB.entries.filter((e) => e.categories.includes(cat)).length;
}
const byDifficulty = { easy: 0, normal: 0, hard: 0 };
for (const e of WORD_DB.entries) byDifficulty[e.difficulty]++;

if (json) {
  console.log(JSON.stringify({
    ok: result.ok,
    total: WORD_DB.entries.length,
    uniqueIds: new Set(WORD_DB.entries.map((e) => e.id)).size,
    categories: WORD_DB.categories.length,
    perCategory,
    byDifficulty,
    problems: result.problems,
  }, null, 2));
} else {
  console.log('Vote Out Imposter — word database validation');
  console.log('='.repeat(46));
  console.log(`Total words:        ${WORD_DB.entries.length}`);
  console.log(`Unique normalized:  ${new Set(WORD_DB.entries.map((e) => e.id)).size}`);
  console.log(`Categories:         ${WORD_DB.categories.length} (required: ${REQUIRED_CATEGORIES.length})`);
  console.log(`Difficulty split:   easy ${byDifficulty.easy} · normal ${byDifficulty.normal} · hard ${byDifficulty.hard}`);
  console.log('');
  console.log('Per-category counts (minimum 30):');
  const pad = Math.max(...Object.keys(perCategory).map((c) => c.length));
  for (const [cat, n] of Object.entries(perCategory).sort((a, b) => a[1] - b[1])) {
    console.log(`  ${cat.padEnd(pad)}  ${String(n).padStart(3)} ${n >= 30 ? '✓' : '✗ TOO FEW'}`);
  }
  console.log('');
  if (result.ok) {
    console.log('RESULT: PASS — dataset meets every requirement.');
  } else {
    console.log('RESULT: FAIL');
    for (const p of result.problems) console.log('  - ' + p);
    process.exitCode = 1;
  }
}
