// Configuration & roster validation tests (spec §24.1).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName, validateRoster, validateConfig, normalizeName, nameKey,
  normalizeConfig, CHAOS_OPTIONS, WORD_DB, DEFAULT_CONFIG, buildWordDatabase,
} from '../engine/index.js';
import { makePlayers } from './helpers.js';

describe('player name validation', () => {
  test('rejects empty and whitespace-only names', () => {
    assert.equal(validateName('').error.code, 'NAME_EMPTY');
    assert.equal(validateName('   ').error.code, 'NAME_EMPTY');
    assert.equal(validateName('\t\n').error.code, 'NAME_EMPTY');
  });

  test('trims and collapses whitespace, keeps unicode and emoji', () => {
    assert.equal(validateName('  Ravi  ').value, 'Ravi');
    assert.equal(validateName('Ravi  Kumar').value, 'Ravi Kumar');
    assert.ok(validateName('रवि').ok);
    assert.ok(validateName('Lakshmi 🌸').ok);
    assert.equal(validateName('Lakshmi 🌸').value, 'Lakshmi 🌸');
  });

  test('rejects control characters', () => {
    assert.equal(validateName('Bad\u0007Name').error.code, 'NAME_INVALID');
  });

  test('rejects names longer than 24 code points', () => {
    assert.equal(validateName('a'.repeat(25)).error.code, 'NAME_TOO_LONG');
    assert.ok(validateName('a'.repeat(24)).ok);
    // emoji count as single code points
    assert.equal(validateName('🌸'.repeat(25)).error.code, 'NAME_TOO_LONG');
  });

  test('rejects duplicates case-insensitively after normalization', () => {
    assert.equal(validateName('ravi', { existingNames: ['Ravi'] }).error.code, 'NAME_DUPLICATE');
    assert.equal(validateName('RAVI KUMAR', { existingNames: ['ravi  kumar'] }).error.code, 'NAME_DUPLICATE');
    assert.ok(validateName('Ravi', { existingNames: ['Balu'] }).ok);
    assert.equal(nameKey(' École '), 'école');
  });
});

describe('roster validation', () => {
  test('rejects fewer than 3 and more than 20 players', () => {
    assert.equal(validateRoster(makePlayers(['A', 'B'])).errors[0].code, 'PLAYER_COUNT');
    assert.ok(validateRoster(makePlayers(['A', 'B', 'C'])).ok);
    assert.ok(validateRoster(makePlayers(Array.from({ length: 20 }, (_, i) => 'P' + (i + 1)))).ok);
    const tooMany = validateRoster(makePlayers(Array.from({ length: 21 }, (_, i) => 'P' + (i + 1))));
    assert.equal(tooMany.errors[0].code, 'PLAYER_COUNT');
  });

  test('rejects duplicate ids and duplicate names', () => {
    const dupIds = [{ id: 'p1', name: 'A' }, { id: 'p1', name: 'B' }, { id: 'p3', name: 'C' }];
    assert.ok(validateRoster(dupIds).errors.some((e) => e.code === 'PLAYER_ID_DUPLICATE'));
    const dupNames = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'a' }, { id: 'p3', name: 'C' }];
    assert.ok(validateRoster(dupNames).errors.some((e) => e.code === 'NAME_DUPLICATE'));
  });
});

describe('imposter count configuration', () => {
  const base = { playerCount: 6, db: WORD_DB };

  test('accepts fixed counts 1–4 and rejects impossible ones', () => {
    for (const v of [1, 2, 3, 4]) assert.ok(validateConfig({ imposter: { mode: 'fixed', value: v } }, base).ok, `fixed ${v}`);
    assert.ok(!validateConfig({ imposter: { mode: 'fixed', value: 5 } }, base).ok);
    assert.ok(!validateConfig({ imposter: { mode: 'fixed', value: 0 } }, base).ok);
  });

  test('for 3 players, at most 2 imposters', () => {
    assert.ok(validateConfig({ imposter: { mode: 'fixed', value: 2 } }, { playerCount: 3, db: WORD_DB }).ok);
    const r = validateConfig({ imposter: { mode: 'fixed', value: 3 } }, { playerCount: 3, db: WORD_DB });
    assert.ok(!r.ok);
    assert.equal(r.errors[0].code, 'IMPOSTER_COUNT');
  });

  test('custom mode: 1..n-1 only, no silent substitution', () => {
    assert.ok(validateConfig({ imposter: { mode: 'custom', value: 5 } }, base).ok);
    for (const v of [0, -1, 6, 1.5]) {
      const r = validateConfig({ imposter: { mode: 'custom', value: v } }, base);
      assert.ok(!r.ok, `custom ${v} should fail`);
      assert.equal(r.errors[0].code, 'IMPOSTER_COUNT');
    }
  });

  test('random mode is valid for any roster of 3+', () => {
    assert.ok(validateConfig({ imposter: { mode: 'random' } }, { playerCount: 3, db: WORD_DB }).ok);
  });
});

describe('Chaos Mode has exactly the five permitted options', () => {
  test('the option list is exactly everyone/none/random/custom/no_hints', () => {
    assert.deepEqual([...CHAOS_OPTIONS].sort(), ['custom', 'everyone', 'no_hints', 'none', 'random']);
  });

  test('all five chaos options validate (with custom count in range)', () => {
    for (const chaos of ['everyone', 'none', 'random', 'no_hints']) {
      assert.ok(validateConfig({ chaos }, { playerCount: 5, db: WORD_DB }).ok, chaos);
    }
    assert.ok(validateConfig({ chaos: 'custom', chaosCustomCount: 2 }, { playerCount: 5, db: WORD_DB }).ok);
  });

  test('chaos custom count is validated, not silently adjusted', () => {
    const r = validateConfig({ chaos: 'custom', chaosCustomCount: 5 }, { playerCount: 5, db: WORD_DB });
    assert.ok(!r.ok);
    assert.equal(r.errors[0].code, 'CHAOS_CUSTOM_COUNT');
  });

  test('unknown chaos values are rejected', () => {
    assert.ok(!validateConfig({ chaos: 'double-trouble' }, { playerCount: 5, db: WORD_DB }).ok);
  });

  test('no forbidden chaos variants exist in shipped source', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const forbidden = ['double trouble', 'hidden chaos', 'imposter swarm', 'one knows', 'reverse mode'];
    const dirs = ['engine', 'app', 'game', 'supabase/functions'];
    let scanned = 0;
    async function scan(dir) {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; } // dir may not exist yet
      for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) await scan(p);
        else if (/\.(js|ts|html|json)$/.test(entry.name)) {
          scanned++;
          const src = (await readFile(p, 'utf8')).toLowerCase();
          for (const f of forbidden) {
            assert.ok(!src.includes(f), `Forbidden chaos variant "${f}" found in ${p}`);
          }
        }
      }
    }
    for (const d of dirs) await scan(d);
    assert.ok(scanned > 5, 'expected to scan source files');
  });
});

describe('rounds, timers, categories, difficulty', () => {
  const base = { playerCount: 5, db: WORD_DB };

  test('round counts: 1,3,5,20 ok; 0, negative, fractional, 21 rejected', () => {
    for (const r of [1, 3, 5, 20]) assert.ok(validateConfig({ rounds: r }, base).ok, `rounds=${r}`);
    for (const r of [0, -1, 1.5, 21, 100]) {
      assert.ok(!validateConfig({ rounds: r }, base).ok, `rounds=${r} should fail`);
    }
  });

  test('discussion timer: Off or 10–600s', () => {
    for (const t of [0, 30, 60, 90, 120, 600]) assert.ok(validateConfig({ discussionTimerSec: t }, base).ok);
    for (const t of [5, 601, 12.5, -30]) assert.ok(!validateConfig({ discussionTimerSec: t }, base).ok);
  });

  test('voting timer: Off or 5–300s', () => {
    for (const t of [0, 15, 30, 45, 60, 300]) assert.ok(validateConfig({ votingTimerSec: t }, base).ok);
    for (const t of [3, 301]) assert.ok(!validateConfig({ votingTimerSec: t }, base).ok);
  });

  test('category selection: empty selection rejected, unknown ids rejected', () => {
    assert.ok(!validateConfig({ categories: { mode: 'selected', selected: [] } }, base).ok);
    assert.ok(!validateConfig({ categories: { mode: 'selected', selected: ['nope'] } }, base).ok);
    assert.ok(validateConfig({ categories: { mode: 'selected', selected: ['food', 'animals'] } }, base).ok);
    assert.ok(validateConfig({ categories: { mode: 'all' } }, base).ok);
    assert.ok(validateConfig({ categories: { mode: 'random', selected: ['food'] } }, base).ok);
  });

  test('empty category+difficulty combination is rejected before start', () => {
    // synthetic dataset where the only category has no 'hard' words
    const tinyDb = buildWordDatabase({ tiny: { easy: ['alpha'], normal: [], hard: [] } });
    const r = validateConfig(
      { categories: { mode: 'selected', selected: ['tiny'] }, difficulty: 'hard' },
      { playerCount: 5, db: tinyDb }
    );
    assert.ok(!r.ok);
    assert.ok(r.errors.some((e) => e.code === 'WORD_POOL_EMPTY'));
    assert.ok(validateConfig({ categories: { mode: 'selected', selected: ['tiny'] }, difficulty: 'easy' }, { playerCount: 5, db: tinyDb }).ok);
  });

  test('speaking timer: Off or 5–120 seconds per player', () => {
    assert.ok(validateConfig({ speakingTimerSec: 0 }, base).ok);
    assert.ok(validateConfig({ speakingTimerSec: 5 }, base).ok);
    assert.ok(validateConfig({ speakingTimerSec: 120 }, base).ok);
    for (const bad of [4, 121, 12.5, -1, '30']) {
      const r = validateConfig({ speakingTimerSec: bad }, base);
      assert.ok(!r.ok, `value ${bad} must be rejected`);
      assert.ok(r.errors.some((e) => e.code === 'TIMER_SPEAKING'));
    }
    assert.equal(normalizeConfig({}).speakingTimerSec, 0, 'default Off');
  });

  test('difficulty accepts exactly easy/normal/hard/random', () => {
    for (const d of ['easy', 'normal', 'hard', 'random']) assert.ok(validateConfig({ difficulty: d }, base).ok);
    assert.ok(!validateConfig({ difficulty: 'brutal' }, base).ok);
  });

  test('normalizeConfig fills defaults over partials', () => {
    const cfg = normalizeConfig({ rounds: 5 });
    assert.equal(cfg.imposter.mode, DEFAULT_CONFIG.imposter.mode);
    assert.equal(cfg.imposter.value, 1);
    assert.equal(cfg.rounds, 5);
    assert.equal(cfg.discussionTimerSec, 60);
    assert.equal(cfg.imposterGuess, true);
    assert.deepEqual(cfg.categories, { mode: 'all', selected: [] });
  });

  test('imposterGuess must be boolean', () => {
    assert.ok(!validateConfig({ imposterGuess: 'yes' }, base).ok);
    assert.ok(validateConfig({ imposterGuess: false }, base).ok);
  });
});
