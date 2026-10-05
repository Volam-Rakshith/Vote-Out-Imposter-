// Local persistence — versioned, defensive, never throws.
//
// Stores only device-local convenience data: audio preferences, recent player
// names, the last setup, One Mobile recovery state, optional local statistics
// and online session tokens (nonprivileged room-bound recovery identifiers).
//
// ALL persisted data is treated as untrusted on read: corrupted JSON, wrong
// schema versions and out-of-range values fall back to safe defaults.
// One Mobile recovery state includes roles/words by necessity — that is a
// convenience, not secure storage (anyone with device access can read it).

import { normalizeName, normalizeConfig } from '../../engine/index.js';

export const STORAGE_KEYS = Object.freeze({
  prefs: 'voi.prefs.v1',
  recentPlayers: 'voi.recentPlayers.v1',
  lastSetup: 'voi.lastSetup.v1',
  localGame: 'voi.localGame.v1',
  localStats: 'voi.localStats.v1',
  sessions: 'voi.sessions.v1',
  playerName: 'voi.playerName.v1',
});

const MAX_RECENT_PLAYERS = 100;
const MAX_SESSIONS = 10;

function defaultBackend() {
  try {
    if (typeof globalThis.localStorage === 'object' && globalThis.localStorage !== null) {
      // probe for real availability (some browsers throw in private mode)
      const k = '__voi_probe__';
      globalThis.localStorage.setItem(k, '1');
      globalThis.localStorage.removeItem(k);
      return globalThis.localStorage;
    }
  } catch { /* unavailable */ }
  return null;
}

function safeParse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function clampVolume(v, fallback) {
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : fallback;
}

function validPrefs(p) {
  const src = p && typeof p === 'object' ? p : {};
  const music = src.music && typeof src.music === 'object' ? src.music : {};
  const sfx = src.sfx && typeof src.sfx === 'object' ? src.sfx : {};
  return {
    music: {
      enabled: typeof music.enabled === 'boolean' ? music.enabled : true,
      volume: clampVolume(music.volume, 40),
    },
    sfx: {
      enabled: typeof sfx.enabled === 'boolean' ? sfx.enabled : true,
      volume: clampVolume(sfx.volume, 70),
    },
  };
}

function validNamesList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const name = normalizeName(item);
    if (!name || name.length > 24) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_RECENT_PLAYERS) break;
  }
  return out;
}

function validLocalGame(v) {
  if (!v || typeof v !== 'object') return null;
  const state = v.state;
  if (!state || typeof state !== 'object') return null;
  if (state.schema !== 1 || typeof state.phase !== 'string') return null;
  if (!Array.isArray(state.players) || state.players.length < 3) return null;
  if (state.status !== 'active') return null;
  return { savedAt: Number.isFinite(v.savedAt) ? v.savedAt : Date.now(), state };
}

function validLocalStats(v) {
  if (!v || typeof v !== 'object') return { gamesPlayed: 0, roundsPlayed: 0, innocentWins: 0, imposterWins: 0, draws: 0, chaosOutcomes: 0 };
  const num = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
  return {
    gamesPlayed: num(v.gamesPlayed),
    roundsPlayed: num(v.roundsPlayed),
    innocentWins: num(v.innocentWins),
    imposterWins: num(v.imposterWins),
    draws: num(v.draws),
    chaosOutcomes: num(v.chaosOutcomes),
  };
}

function validSessions(v) {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  for (const [code, sess] of Object.entries(v)) {
    if (typeof code !== 'string' || code.length < 4 || code.length > 12) continue;
    if (!sess || typeof sess !== 'object') continue;
    if (typeof sess.token !== 'string' || typeof sess.playerId !== 'string') continue;
    if (sess.token.length < 16 || sess.token.length > 128) continue;
    out[code.toUpperCase()] = {
      token: sess.token,
      playerId: sess.playerId,
      name: typeof sess.name === 'string' ? sess.name.slice(0, 24) : '',
      savedAt: Number.isFinite(sess.savedAt) ? sess.savedAt : 0,
    };
  }
  return out;
}

function validLastSetup(v, db) {
  if (!v || typeof v !== 'object') return null;
  const roster = Array.isArray(v.roster)
    ? v.roster
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
        .slice(0, 20)
        .map((p) => ({ id: p.id.slice(0, 24), name: normalizeName(p.name).slice(0, 24) }))
        .filter((p) => p.name)
    : [];
  if (roster.length < 3) return null;
  return { config: normalizeConfig(v.config ?? {}), roster };
}

/**
 * Create a storage facade. `backend` is injectable for tests; defaults to
 * window.localStorage when available, otherwise all operations no-op.
 */
export function createGameStorage(backend = defaultBackend(), db = null) {
  const has = () => backend !== null;

  function read(key, validator) {
    if (!has()) return validator(null);
    let stored = null;
    try { stored = backend.getItem(key); } catch { return validator(null); }
    return validator(safeParse(stored));
  }

  function write(key, value) {
    if (!has()) return false;
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // quota/full/private mode — gameplay continues regardless
    }
  }

  function remove(key) {
    if (!has()) return;
    try { backend.removeItem(key); } catch { /* ignore */ }
  }

  return {
    isPersistent: backend !== null,

    // --- Audio preferences -------------------------------------------------
    getPrefs: () => read(STORAGE_KEYS.prefs, validPrefs),
    setPrefs(prefs) {
      const v = validPrefs(prefs);
      if (v) write(STORAGE_KEYS.prefs, v);
      return v;
    },

    // --- Recent players ----------------------------------------------------
    getRecentPlayers: () => read(STORAGE_KEYS.recentPlayers, validNamesList),
    addRecentPlayer(name) {
      const clean = normalizeName(name);
      if (!clean) return this.getRecentPlayers();
      const list = this.getRecentPlayers().filter((n) => n.toLowerCase() !== clean.toLowerCase());
      list.unshift(clean);
      write(STORAGE_KEYS.recentPlayers, list.slice(0, MAX_RECENT_PLAYERS));
      return list.slice(0, MAX_RECENT_PLAYERS);
    },
    removeRecentPlayer(name) {
      const clean = normalizeName(name).toLowerCase();
      const list = this.getRecentPlayers().filter((n) => n.toLowerCase() !== clean);
      write(STORAGE_KEYS.recentPlayers, list);
      return list;
    },
    clearRecentPlayers() {
      remove(STORAGE_KEYS.recentPlayers);
    },

    // --- Last setup (roster + config convenience) ----------------------------
    getLastSetup: () => read(STORAGE_KEYS.lastSetup, (v) => validLastSetup(v, db)),
    setLastSetup(setup) {
      const v = validLastSetup(setup, db);
      if (v) write(STORAGE_KEYS.lastSetup, v);
    },

    // --- Preferred display name (online) --------------------------------------
    getPreferredName: () => read(STORAGE_KEYS.playerName, (v) =>
      typeof v?.name === 'string' && v.name.length >= 1 && v.name.length <= 24 ? v.name : ''),
    setPreferredName(name) {
      const clean = typeof name === 'string' ? name.trim().slice(0, 24) : '';
      if (clean) write(STORAGE_KEYS.playerName, { name: clean });
    },

    // --- One Mobile recovery ---------------------------------------------------
    saveLocalGame(state) {
      if (!state || state.status !== 'active') return;
      write(STORAGE_KEYS.localGame, { savedAt: Date.now(), state });
    },
    loadLocalGame: () => read(STORAGE_KEYS.localGame, validLocalGame),
    clearLocalGame() { remove(STORAGE_KEYS.localGame); },

    // --- Local statistics ---------------------------------------------------------
    getLocalStats: () => read(STORAGE_KEYS.localStats, validLocalStats),
    mergeLocalStats(sessionStats) {
      const cur = this.getLocalStats();
      const add = (a, b) => (Number.isFinite(b) ? b : 0);
      const merged = validLocalStats({
        gamesPlayed: cur.gamesPlayed + (add(0, sessionStats?.gamesPlayed) || 0),
        roundsPlayed: cur.roundsPlayed + (sessionStats?.roundsPlayed ?? 0),
        innocentWins: cur.innocentWins + (sessionStats?.innocentWins ?? 0),
        imposterWins: cur.imposterWins + (sessionStats?.imposterWins ?? 0),
        draws: cur.draws + (sessionStats?.draws ?? 0),
        chaosOutcomes: cur.chaosOutcomes + (sessionStats?.chaosOutcomes ?? 0),
      });
      write(STORAGE_KEYS.localStats, merged);
      return merged;
    },
    clearLocalStats() { remove(STORAGE_KEYS.localStats); },

    // --- Online session tokens (room-bound recovery identifiers) ------------------
    listSessions: () => read(STORAGE_KEYS.sessions, validSessions),
    getSession(code) {
      const all = this.listSessions();
      return all[String(code).toUpperCase()] ?? null;
    },
    saveSession(code, session) {
      const all = this.listSessions();
      all[String(code).toUpperCase()] = { ...session, savedAt: Date.now() };
      // keep the most recent MAX_SESSIONS entries
      const entries = Object.entries(all).sort((a, b) => (b[1].savedAt ?? 0) - (a[1].savedAt ?? 0));
      write(STORAGE_KEYS.sessions, Object.fromEntries(entries.slice(0, MAX_SESSIONS)));
    },
    removeSession(code) {
      const all = this.listSessions();
      delete all[String(code).toUpperCase()];
      write(STORAGE_KEYS.sessions, all);
    },
  };
}
