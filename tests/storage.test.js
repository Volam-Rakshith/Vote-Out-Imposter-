// Local storage validation tests (spec §22.2): corrupted data, outdated
// schemas, missing fields and quota failures must never break the app.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGameStorage, STORAGE_KEYS } from '../game/local/storage.js';

function memoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function failingBackend() {
  return { getItem: () => { throw new Error('locked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
}

describe('audio preferences', () => {
  test('round-trip and independent volumes', () => {
    const b = memoryBackend();
    const s = createGameStorage(b);
    s.setPrefs({ music: { enabled: false, volume: 25 }, sfx: { enabled: true, volume: 80 } });
    const p = s.getPrefs();
    assert.equal(p.music.enabled, false);
    assert.equal(p.music.volume, 25);
    assert.equal(p.sfx.enabled, true);
    assert.equal(p.sfx.volume, 80);
  });

  test('corrupted/missing/out-of-range values fall back to defaults', () => {
    const b = memoryBackend();
    const s = createGameStorage(b);
    b.setItem(STORAGE_KEYS.prefs, '{corrupted json');
    const p = s.getPrefs();
    assert.deepEqual(p, { music: { enabled: true, volume: 40 }, sfx: { enabled: true, volume: 70 } });
    b.setItem(STORAGE_KEYS.prefs, JSON.stringify({ music: { volume: 999 }, sfx: { enabled: 'yes' } }));
    const p2 = s.getPrefs();
    assert.equal(p2.music.volume, 40); // out of range -> default
    assert.equal(p2.sfx.enabled, true); // wrong type -> default
    assert.equal(p2.sfx.volume, 70);
  });
});

describe('recent players', () => {
  test('adds, dedupes case-insensitively, trims, keeps newest first, bounded to 100', () => {
    const s = createGameStorage(memoryBackend());
    s.addRecentPlayer('  Ravi  ');
    s.addRecentPlayer('Balu');
    s.addRecentPlayer('RAVI'); // duplicate of Ravi
    assert.deepEqual(s.getRecentPlayers(), ['RAVI', 'Balu']);
    for (let i = 0; i < 130; i++) s.addRecentPlayer('Player' + i);
    assert.equal(s.getRecentPlayers().length, 100);
  });

  test('remove one and clear all', () => {
    const s = createGameStorage(memoryBackend());
    s.addRecentPlayer('Ravi');
    s.addRecentPlayer('Balu');
    s.removeRecentPlayer('ravi');
    assert.deepEqual(s.getRecentPlayers(), ['Balu']);
    s.clearRecentPlayers();
    assert.deepEqual(s.getRecentPlayers(), []);
  });

  test('corrupted list yields empty array, never throws', () => {
    const b = memoryBackend();
    const s = createGameStorage(b);
    b.setItem(STORAGE_KEYS.recentPlayers, 'not json at all');
    assert.deepEqual(s.getRecentPlayers(), []);
    b.setItem(STORAGE_KEYS.recentPlayers, JSON.stringify([42, null, '  ', 'OK', { x: 1 }, 'a'.repeat(40)]));
    assert.deepEqual(s.getRecentPlayers(), ['OK']);
  });
});

describe('One Mobile recovery state', () => {
  test('saves and loads an active game; refuses finished/corrupt entries', () => {
    const b = memoryBackend();
    const s = createGameStorage(b);
    const fakeState = { schema: 1, phase: 'discussion', status: 'active', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }] };
    s.saveLocalGame(fakeState);
    const loaded = s.loadLocalGame();
    assert.equal(loaded.state.phase, 'discussion');

    s.saveLocalGame({ ...fakeState, status: 'finished' });
    assert.equal(s.loadLocalGame().state.phase, 'discussion'); // finished games are not persisted

    b.setItem(STORAGE_KEYS.localGame, JSON.stringify({ savedAt: 1, state: { schema: 99, phase: 'x' } }));
    assert.equal(s.loadLocalGame(), null);
    b.setItem(STORAGE_KEYS.localGame, 'garbage');
    assert.equal(s.loadLocalGame(), null);

    s.clearLocalGame();
    assert.equal(s.loadLocalGame(), null);
  });
});

describe('local statistics', () => {
  test('merge accumulates and validates', () => {
    const s = createGameStorage(memoryBackend());
    s.mergeLocalStats({ gamesPlayed: 1, roundsPlayed: 3, innocentWins: 2, imposterWins: 1 });
    s.mergeLocalStats({ gamesPlayed: 1, roundsPlayed: 2, innocentWins: 1, draws: 1 });
    const st = s.getLocalStats();
    assert.equal(st.gamesPlayed, 2);
    assert.equal(st.roundsPlayed, 5);
    assert.equal(st.innocentWins, 3);
    assert.equal(st.imposterWins, 1);
    assert.equal(st.draws, 1);
    s.clearLocalStats();
    assert.equal(s.getLocalStats().gamesPlayed, 0);
  });
});

describe('online session tokens', () => {
  test('save/get/remove sessions with normalization and bounds', () => {
    const s = createGameStorage(memoryBackend());
    s.saveSession('abc123', { token: 'a'.repeat(64), playerId: 'p_1', name: 'Ravi' });
    assert.equal(s.getSession('ABC123').playerId, 'p_1');
    s.removeSession('abc123');
    assert.equal(s.getSession('ABC123'), null);
  });

  test('corrupted sessions yield empty and never throw', () => {
    const b = memoryBackend();
    const s = createGameStorage(b);
    b.setItem(STORAGE_KEYS.sessions, JSON.stringify({ 'BAD!!': { token: 'x' }, OKCODE: { token: 'a'.repeat(64), playerId: 'p' } }));
    const all = s.listSessions();
    assert.deepEqual(Object.keys(all), ['OKCODE']);
  });
});

describe('hostile backends never break gameplay', () => {
  test('failing localStorage is survivable', () => {
    const s = createGameStorage(failingBackend());
    assert.deepEqual(s.getPrefs(), { music: { enabled: true, volume: 40 }, sfx: { enabled: true, volume: 70 } });
    assert.deepEqual(s.getRecentPlayers(), []);
    assert.equal(s.loadLocalGame(), null);
    assert.equal(s.addRecentPlayer('Ravi').length, 1); // in-memory result still returned
    assert.equal(s.isPersistent, true); // backend provided (writes fail silently)
  });

  test('null backend (no localStorage) no-ops safely', () => {
    const s = createGameStorage(null);
    assert.equal(s.isPersistent, false);
    assert.deepEqual(s.getRecentPlayers(), []);
    s.addRecentPlayer('Ravi');
    assert.deepEqual(s.getRecentPlayers(), []); // nothing persisted without a backend
    assert.equal(s.loadLocalGame(), null);
  });
});
