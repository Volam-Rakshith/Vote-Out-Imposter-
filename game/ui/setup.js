// Setup screen — players, roles, words, match options, audio.
// Used by One Mobile setup and (minus the roster) by the online host lobby.

import { h, icon, toast, confirmDialog } from '../../app/ui.js';
import {
  WORD_DB, normalizeConfig, validateName, validateConfig, MAX_PLAYERS, MIN_PLAYERS,
  CHAOS, DIFFICULTIES, CATEGORY_LABELS,
} from '../../engine/index.js';

export const DEFAULT_SETUP_CONFIG = Object.freeze({
  imposter: { mode: 'fixed', value: 1 },
  chaos: null,
  chaosCustomCount: 2,
  difficulty: 'random',
  rounds: 3,
  discussionTimerSec: 120,
  speakingTimerSec: 0,
  votingTimerSec: 45,
  imposterGuess: true,
  categories: { mode: 'all', selected: [] },
});

let uid = 0;
const nextRowId = () => 'r' + (++uid);

export function createSetupState({ initialConfig, initialRoster, storage }) {
  let roster = (initialRoster && initialRoster.length ? initialRoster : []).map((p) => ({ ...p }));
  while (roster.length && roster.length < MIN_PLAYERS) roster.push({ id: nextRowId(), name: '' });
  const config = { ...(initialConfig || DEFAULT_SETUP_CONFIG), imposter: { ...(initialConfig || DEFAULT_SETUP_CONFIG).imposter }, categories: { ...(initialConfig || DEFAULT_SETUP_CONFIG).categories } };
  return { roster, config, storage };
}

/** Live pool info for the current categories+difficulty choice. */
export function poolInfo(config) {
  const selected = config.categories.selected ?? [];
  const allMode = config.categories.mode === 'all'
    || (config.categories.mode === 'random' && selected.length === 0);
  const all = WORD_DB.entries;
  const inCats = (e) => allMode || e.categories.some((c) => selected.includes(c));
  const byDiff = { easy: 0, normal: 0, hard: 0 };
  let total = 0;
  for (const e of all) {
    if (!inCats(e)) continue;
    byDiff[e.difficulty]++;
    total++;
  }
  const difficulty = config.difficulty === 'random' ? null : config.difficulty;
  const usable = difficulty === null ? total : byDiff[difficulty];
  return { total, byDiff, usable, categoryCount: allMode ? WORD_DB.categories.length : selected.length };
}

/** Validation of the whole setup (returns a list of user-facing problems). */
export function setupProblems(state) {
  const problems = [];
  const names = state.roster.map((p) => p.name);
  const filled = names.filter((n) => n.trim().length > 0);
  if (filled.length < MIN_PLAYERS) problems.push(`Add at least ${MIN_PLAYERS - filled.length} more player${MIN_PLAYERS - filled.length === 1 ? '' : 's'} (minimum ${MIN_PLAYERS}).`);
  if (state.roster.length > MAX_PLAYERS) problems.push(`Too many players (maximum ${MAX_PLAYERS}).`);
  const seen = new Map();
  for (const p of state.roster) {
    const check = validateName(p.name);
    if (p.name.length > 0 && !check.ok) problems.push(`“${p.name}”: ${check.message}`);
    const key = p.name.trim().toLowerCase();
    if (key && seen.has(key)) problems.push(`Duplicate player name: “${p.name.trim()}”.`);
    if (key) seen.set(key, p);
  }
  const res = validateConfig(state.config, { playerCount: Math.max(filled.length, MIN_PLAYERS), db: WORD_DB });
  if (!res.ok) {
    for (const err of res.errors) problems.push(err.message);
  }
  const pool = poolInfo(state.config);
  if (pool.usable === 0) {
    problems.push('No words match the chosen categories + difficulty. Pick more categories or another difficulty.');
  }
  return [...new Set(problems)];
}

/* ===================================================================== */
/* Section renderers — each returns a card and re-renders via schedule() */
/* ===================================================================== */

export function renderSetupSections({ state, schedule, audio, showPlayers = true, showAudio = true }) {
  const sections = [];
  if (showPlayers) sections.push(playersSection(state, schedule, audio));
  sections.push(rolesSection(state, schedule));
  sections.push(wordsSection(state, schedule));
  sections.push(matchSection(state, schedule));
  if (showAudio) sections.push(audioSection(state, audio));
  return sections;
}

/* ------------------------- players ------------------------- */
function playersSection(state, schedule, audio) {
  const recent = state.storage.getRecentPlayers().filter(
    (n) => !state.roster.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())
  );
  const canAdd = state.roster.length < MAX_PLAYERS;

  const card = h('section', { class: 'card', 'aria-labelledby': 'sec-players' },
    h('h2', { class: 'section-title', id: 'sec-players' }, icon('users', 20), ' Players'),
    h('p', { class: 'section-sub' }, `Add between ${MIN_PLAYERS} and ${MAX_PLAYERS} players. Drag to reorder, or use the arrow buttons.`),
    h('div', { class: 'stack-sm', id: 'player-rows' }, state.roster.map((p, i) => playerRow(state, schedule, p, i))),
    h('div', { class: 'row', style: { marginTop: 10 } },
      h('button', {
        class: 'btn small', disabled: !canAdd, onclick: () => {
          state.roster.push({ id: nextRowId(), name: '' });
          schedule();
          setTimeout(() => card.querySelector('#player-rows .player-row:last-child input')?.focus(), 30);
        },
      }, icon('plus', 15), `Add player${canAdd ? '' : ' (max ' + MAX_PLAYERS + ')'}`),
      h('span', { class: 'badge', id: 'player-count' },
        `${state.roster.length} of max ${MAX_PLAYERS}`),
    ),
    recent.length ? h('div', { style: { marginTop: 14 } },
      h('div', { class: 'row-between' },
        h('span', { class: 'small muted', style: { fontWeight: 700 } }, icon('history', 14), ' Recent players'),
        h('button', {
          class: 'btn tiny ghost', onclick: async () => {
            if (await confirmDialog('Clear the recent-player history on this device?', { okLabel: 'Clear' })) {
              state.storage.clearRecentPlayers();
              toast('Recent players cleared.', 'good');
              schedule();
            }
          },
        }, 'Clear all'),
      ),
      h('div', { class: 'chip-grid', style: { marginTop: 8 } }, recent.map((name) => h('button', {
        class: 'chip recent-chip',
        title: `Add ${name}`,
        onclick: () => {
          if (state.roster.length >= MAX_PLAYERS) { toast(`Maximum ${MAX_PLAYERS} players.`, 'bad'); return; }
          state.roster.push({ id: nextRowId(), name });
          audio?.play('uiClick');
          schedule();
        },
      }, icon('plus', 13), name, h('span', {
        class: 'tiny muted', role: 'button', tabindex: 0, 'aria-label': `Remove ${name} from history`,
        onclick: async (e) => {
          e.stopPropagation();
          state.storage.removeRecentPlayer(name);
          schedule();
        },
      }, '✕')))),
    ) : null,
  );
  return card;
}

function playerRow(state, schedule, player, index) {
  const nameCheck = player.name.length === 0 ? null : validateName(player.name);
  const dup = state.roster.some((p) => p !== player && p.name.trim().toLowerCase() === player.name.trim().toLowerCase() && player.name.trim() !== '');

  const input = h('input', {
    class: 'input' + (nameCheck && !nameCheck.ok || dup ? ' invalid' : ''),
    type: 'text', maxlength: '24', autocomplete: 'off', spellcheck: 'false',
    value: player.name,
    placeholder: `Player ${index + 1}`,
    'aria-label': `Player ${index + 1} name`,
    oninput: (e) => { player.name = e.target.value; },
    onchange: () => {
      player.name = player.name.trimStart();
      schedule();
    },
    onblur: () => {
      player.name = player.name.trim();
      if (player.name) state.storage.addRecentPlayer(player.name);
      schedule();
    },
  });

  const row = h('div', {
    class: 'player-row', dataset: { id: player.id },
    draggable: 'true',
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', player.id); row.classList.add('dragging'); },
    ondragend: () => row.classList.remove('dragging'),
    ondragover: (e) => { e.preventDefault(); row.classList.add('drag-over'); },
    ondragleave: () => row.classList.remove('drag-over'),
    ondrop: (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const from = state.roster.findIndex((p) => p.id === e.dataTransfer.getData('text/plain'));
      const to = state.roster.findIndex((p) => p.id === player.id);
      if (from >= 0 && to >= 0 && from !== to) {
        const [moved] = state.roster.splice(from, 1);
        state.roster.splice(to, 0, moved);
        schedule();
      }
    },
  },
    h('span', { class: 'drag-handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip', 18)),
    h('span', { class: 'p-num', 'aria-hidden': 'true' }, String(index + 1)),
    input,
    h('button', {
      class: 'icon-btn', 'aria-label': `Move ${player.name || 'player ' + (index + 1)} up`, disabled: index === 0,
      onclick: () => {
        if (index === 0) return;
        const [x] = state.roster.splice(index, 1);
        state.roster.splice(index - 1, 0, x);
        schedule();
      },
    }, icon('up', 16)),
    h('button', {
      class: 'icon-btn', 'aria-label': `Move ${player.name || 'player ' + (index + 1)} down`, disabled: index === state.roster.length - 1,
      onclick: () => {
        if (index === state.roster.length - 1) return;
        const [x] = state.roster.splice(index, 1);
        state.roster.splice(index + 1, 0, x);
        schedule();
      },
    }, icon('down', 16)),
    h('button', {
      class: 'icon-btn', 'aria-label': `Remove ${player.name || 'player ' + (index + 1)}`, disabled: state.roster.length <= MIN_PLAYERS,
      onclick: () => {
        state.roster.splice(index, 1);
        schedule();
      },
    }, icon('trash', 16)),
  );
  return row;
}

/* ------------------------- roles ------------------------- */
function rolesSection(state, schedule) {
  const cfg = state.config;
  const isChaos = Boolean(cfg.chaos);
  const playerCount = Math.max(MIN_PLAYERS, state.roster.filter((p) => p.name.trim()).length || MIN_PLAYERS);

  const standard = [
    { v: 1, t: '1', s: 'Classic' },
    { v: 2, t: '2', s: 'Pair' },
    { v: 3, t: '3', s: 'Trio' },
    { v: 4, t: '4', s: 'Crowd' },
    { v: 'custom', t: 'Custom', s: 'Pick a number' },
    { v: 'random', t: 'Random', s: 'Surprise (1–4)' },
  ];
  const chaosOptions = [
    { v: CHAOS.EVERYONE, t: 'Everyone Is Imposter', s: 'Nobody gets the word', ic: 'zap' },
    { v: CHAOS.NONE, t: 'No Imposter', s: 'Everyone shares the word', ic: 'shield' },
    { v: CHAOS.RANDOM, t: 'Random Imposter Count', s: 'A new count every 3–5 rounds', ic: 'sparkles' },
    { v: CHAOS.CUSTOM, t: 'Custom Imposter Count', s: 'You choose the number', ic: 'target' },
    { v: CHAOS.NO_HINTS, t: 'No Hints', s: 'Imposters get no hint', ic: 'eyeOff' },
  ];

  const customMax = playerCount - 1;
  const showCustomCount = (!isChaos && cfg.imposter.mode === 'custom') || (isChaos && cfg.chaos === CHAOS.CUSTOM);

  return h('section', { class: 'card', 'aria-labelledby': 'sec-roles' },
    h('h2', { class: 'section-title', id: 'sec-roles' }, icon('mask', 20), ' Imposters'),
    h('p', { class: 'section-sub' }, `${playerCount} players · imposter counts are validated against the roster.`),

    h('div', { class: 'toggle-row' },
      h('div', { class: 'toggle-text' },
        h('span', { class: 't-title' }, icon('zap', 15), ' Chaos Mode'),
        h('span', { class: 't-sub' }, 'Twist the rules with one of five special variants.'),
      ),
      switchEl(isChaos, (on) => {
        state.config.chaos = on ? CHAOS.EVERYONE : null;
        schedule();
      }, 'Chaos Mode toggle'),
    ),

    isChaos ? h('div', { class: 'radio-cards', style: { marginTop: 10 } },
      chaosOptions.map((o) => h('button', {
        class: 'radio-card' + (cfg.chaos === o.v ? ' selected' : ''),
        onclick: () => { cfg.chaos = o.v; schedule(); },
        'aria-pressed': cfg.chaos === o.v ? 'true' : 'false',
      },
        h('span', { class: 'rc-title' }, icon(o.ic, 15), ' ' + o.t),
        h('span', { class: 'rc-sub', text: o.s }),
      )),
    ) : h('div', { class: 'radio-cards', style: { marginTop: 10 } },
      standard.map((o) => {
        const isCurrent = (o.v === 'custom' && cfg.imposter.mode === 'custom')
          || (o.v === 'random' && cfg.imposter.mode === 'random')
          || (typeof o.v === 'number' && cfg.imposter.mode === 'fixed' && cfg.imposter.value === o.v);
        return h('button', {
          class: 'radio-card' + (isCurrent ? ' selected' : ''),
          onclick: () => {
            if (o.v === 'custom') cfg.imposter = { mode: 'custom', value: Math.min(cfg.imposter.value || 1, customMax) };
            else if (o.v === 'random') cfg.imposter = { mode: 'random' };
            else cfg.imposter = { mode: 'fixed', value: o.v };
            schedule();
          },
          'aria-pressed': isCurrent ? 'true' : 'false',
        },
          h('span', { class: 'rc-title', text: o.t }),
          h('span', { class: 'rc-sub', text: o.s }),
        );
      }),
    ),

    showCustomCount ? h('div', { class: 'row', style: { marginTop: 12 } },
      h('span', { class: 'small muted' }, 'Imposters:'),
      stepper({
        value: isChaos ? cfg.chaosCustomCount : cfg.imposter.value,
        min: 1, max: customMax,
        onChange: (v) => {
          if (isChaos) cfg.chaosCustomCount = v;
          else cfg.imposter.value = v;
          schedule();
        },
        label: 'Custom imposter count',
      }),
      h('span', { class: 'small muted' }, `of ${playerCount - 1} max`),
    ) : null,

    isChaos === false && cfg.imposter.mode === 'random'
      ? h('p', { class: 'field-hint' }, icon('info', 13), ' Random picks 1–4 imposters (limited by player count) and resolves when the round starts.')
      : null,
    isChaos ? h('p', { class: 'field-hint' }, icon('info', 13), ' Chaos variants have their own result screens. Imposter guessing is disabled in Everyone/No Imposter games.') : null,
  );
}

/* ------------------------- words ------------------------- */
function wordsSection(state, schedule) {
  const cfg = state.config;
  const pool = poolInfo(cfg);
  const allSelected = cfg.categories.mode === 'all';
  const catIds = WORD_DB.categories;
  const isSel = (id) => allSelected || cfg.categories.selected.includes(id);

  const diffCards = DIFFICULTIES.map((d) => h('button', {
    class: 'radio-card' + (cfg.difficulty === d ? ' selected' : ''),
    onclick: () => { cfg.difficulty = d; schedule(); },
    'aria-pressed': cfg.difficulty === d ? 'true' : 'false',
  },
    h('span', { class: 'rc-title', text: d[0].toUpperCase() + d.slice(1) + (d === 'random' ? ' each round' : '') }),
    h('span', { class: 'rc-sub' }, d === 'random'
      ? `${pool.total} words in play`
      : `${pool.byDiff[d]} words available`),
  ));

  return h('section', { class: 'card', 'aria-labelledby': 'sec-words' },
    h('h2', { class: 'section-title', id: 'sec-words' }, icon('word', 20), ' Secret words'),
    h('p', { class: 'section-sub' },
      `${WORD_DB.entries.length} built-in words across ${catIds.length} categories. Everything is offline — no downloads.`),

    h('label', { class: 'field-label' }, 'Difficulty'),
    h('div', { class: 'radio-cards' }, diffCards),

    h('label', { class: 'field-label' }, 'Categories'),
    h('div', { class: 'row', style: { marginBottom: 10 } },
      h('button', {
        class: 'btn tiny' + (allSelected ? ' primary' : ''), onclick: () => {
          cfg.categories = { mode: 'all', selected: [] };
          schedule();
        },
      }, 'All categories'),
      h('button', {
        class: 'btn tiny', onclick: () => {
          const shuffled = [...catIds].sort(() => Math.random() - 0.5);
          const count = 1 + Math.floor(Math.random() * Math.min(6, catIds.length));
          cfg.categories = { mode: 'selected', selected: shuffled.slice(0, count) };
          toast('Picked random categories.', 'good');
          schedule();
        },
      }, icon('sparkles', 13), ' Randomize'),
      h('button', {
        class: 'btn tiny', onclick: () => {
          cfg.categories = { mode: 'selected', selected: [] };
          schedule();
        },
      }, 'Clear'),
    ),
    h('div', { class: 'chip-grid' }, catIds.map((id) => {
      const selected = isSel(id);
      return h('button', {
        class: 'chip' + (selected ? ' selected' : ''),
        'aria-pressed': selected ? 'true' : 'false',
        onclick: () => {
          const set = new Set(cfg.categories.mode === 'all' ? catIds : cfg.categories.selected);
          if (set.has(id)) set.delete(id); else set.add(id);
          cfg.categories = { mode: 'selected', selected: catIds.filter((c) => set.has(c)) };
          schedule();
        },
      }, h('span', { class: 'chip-check' }, icon('check', 13)), CATEGORY_LABELS[id] ?? id);
    })),

    h('div', { style: { marginTop: 14 } },
      pool.usable === 0
        ? h('div', { class: 'banner bad' }, icon('alert', 18), h('div', {},
            h('b', { text: 'No words match this combination.' }),
            h('div', { class: 'small' }, 'Add more categories or choose a different difficulty.')))
        : h('div', { class: 'banner info' }, icon('info', 18), h('div', {},
            h('b', { text: `${pool.usable} words in play` }),
            h('div', { class: 'small muted' },
              `${pool.categoryCount} of ${catIds.length} categories · words never repeat until the pool is used up.`))),
    ),
  );
}

/* ------------------------- match ------------------------- */
function matchSection(state, schedule) {
  const cfg = state.config;
  const chaosBlocksGuess = cfg.chaos === CHAOS.EVERYONE || cfg.chaos === CHAOS.NONE;

  return h('section', { class: 'card', 'aria-labelledby': 'sec-match' },
    h('h2', { class: 'section-title', id: 'sec-match' }, icon('flag', 20), ' Match'),
    h('p', { class: 'section-sub' }, 'Rounds, timers and the imposter’s last-ditch guess.'),

    h('label', { class: 'field-label' }, 'Rounds'),
    h('div', { class: 'row' },
      [1, 3, 5].map((v) => h('button', {
        class: 'chip' + (cfg.rounds === v ? ' selected' : ''),
        onclick: () => { cfg.rounds = v; schedule(); },
        'aria-pressed': cfg.rounds === v ? 'true' : 'false',
      }, `${v} round${v > 1 ? 's' : ''}`)),
      h('span', { class: 'row', style: { gap: 6 } },
        h('span', { class: 'small muted' }, 'Custom:'),
        stepper({ value: cfg.rounds, min: 1, max: 20, onChange: (v) => { cfg.rounds = v; schedule(); }, label: 'Round count' }),
      ),
    ),

    h('label', { class: 'field-label' }, 'Discussion timer'),
    h('div', { class: 'row' },
      [{ v: 0, t: 'Off' }, { v: 60, t: '1 min' }, { v: 120, t: '2 min' }, { v: 300, t: '5 min' }].map((o) => h('button', {
        class: 'chip' + (cfg.discussionTimerSec === o.v ? ' selected' : ''),
        onclick: () => { cfg.discussionTimerSec = o.v; schedule(); },
        'aria-pressed': cfg.discussionTimerSec === o.v ? 'true' : 'false',
      }, o.t)),
      h('span', { class: 'row', style: { gap: 6 } },
        h('span', { class: 'small muted' }, 'Custom (10–600s):'),
        stepper({ value: cfg.discussionTimerSec || 60, min: 10, max: 600, step: 10, onChange: (v) => { cfg.discussionTimerSec = v; schedule(); }, label: 'Discussion seconds' }),
      ),
    ),

    h('label', { class: 'field-label' }, 'Speaking timer (per player)'),
    h('div', { class: 'row' },
      [{ v: 0, t: 'Off' }, { v: 15, t: '15s' }, { v: 30, t: '30s' }, { v: 60, t: '60s' }].map((o) => h('button', {
        class: 'chip' + (cfg.speakingTimerSec === o.v ? ' selected' : ''),
        onclick: () => { cfg.speakingTimerSec = o.v; schedule(); },
        'aria-pressed': cfg.speakingTimerSec === o.v ? 'true' : 'false',
      }, o.t)),
      h('span', { class: 'row', style: { gap: 6 } },
        h('span', { class: 'small muted' }, 'Custom (5–120s):'),
        stepper({ value: cfg.speakingTimerSec || 30, min: 5, max: 120, step: 5, onChange: (v) => { cfg.speakingTimerSec = v; schedule(); }, label: 'Speaking seconds per player' }),
      ),
    ),
    h('p', { class: 'field-hint' }, icon('mic', 13), ' On = talking-stick mode: players speak one at a time in roster order, X seconds each. When it becomes a player\u2019s turn, their phone vibrates (One Mobile: the shared device buzzes). Voting starts automatically after the last speaker.'),

    h('label', { class: 'field-label' }, 'Voting timer'),
    h('div', { class: 'row' },
      [{ v: 0, t: 'Off' }, { v: 20, t: '20s' }, { v: 45, t: '45s' }, { v: 90, t: '90s' }].map((o) => h('button', {
        class: 'chip' + (cfg.votingTimerSec === o.v ? ' selected' : ''),
        onclick: () => { cfg.votingTimerSec = o.v; schedule(); },
        'aria-pressed': cfg.votingTimerSec === o.v ? 'true' : 'false',
      }, o.t)),
      h('span', { class: 'row', style: { gap: 6 } },
        h('span', { class: 'small muted' }, 'Custom:'),
        stepper({ value: cfg.votingTimerSec || 30, min: 10, max: 600, step: 5, onChange: (v) => { cfg.votingTimerSec = v; schedule(); }, label: 'Voting seconds' }),
      ),
    ),
    h('p', { class: 'field-hint' }, icon('info', 13), ' Timers run on this device in One Mobile mode (the group shares one screen anyway).'),

    h('div', { class: 'toggle-row', style: { marginTop: 8 } },
      h('div', { class: 'toggle-text' },
        h('span', { class: 't-title' }, icon('target', 15), ' Imposter guess'),
        h('span', { class: 't-sub' }, 'A freshly eliminated imposter gets one chance to guess the word and steal the win.'),
      ),
      switchEl(!chaosBlocksGuess && cfg.imposterGuess, (on) => { cfg.imposterGuess = on; schedule(); }, 'Imposter guess toggle', chaosBlocksGuess),
    ),
    chaosBlocksGuess ? h('p', { class: 'field-hint' }, icon('info', 13), ' Disabled for this Chaos variant.') : null,
  );
}

/* ------------------------- audio ------------------------- */
function audioSection(state, audio) {
  const prefs = state.storage.getPrefs();
  const prefRow = (kind, label, sub, ic) => h('div', { class: 'toggle-row' },
    h('div', { class: 'toggle-text' },
      h('span', { class: 't-title' }, icon(ic, 15), ' ' + label),
      h('span', { class: 't-sub', text: sub }),
    ),
    h('div', { class: 'row', style: { gap: 12 } },
      h('label', { class: 'small muted', style: { whiteSpace: 'nowrap' } },
        h('span', { class: 'sr-only', text: `${label} volume` }),
        h('input', {
          type: 'range', min: '0', max: '100', step: '5', value: String(prefs[kind].volume),
          'aria-label': `${label} volume percentage`,
          oninput: (e) => {
            prefs[kind].volume = Number(e.target.value);
            state.storage.setPrefs(prefs);
            audio?.updateVolumes();
          },
        }),
        h('span', { class: 'mono', style: { minWidth: 38, textAlign: 'right' }, text: `${prefs[kind].volume}%` }),
      ),
      switchEl(prefs[kind].enabled, (on) => {
        prefs[kind].enabled = on;
        state.storage.setPrefs(prefs);
        audio?.unlock();
        audio?.updateVolumes();
        if (on && kind === 'sfx') audio?.play('uiClick');
      }, `${label} toggle`),
    ),
  );

  return h('section', { class: 'card', 'aria-labelledby': 'sec-audio' },
    h('h2', { class: 'section-title', id: 'sec-audio' }, icon('music', 20), ' Audio'),
    h('p', { class: 'section-sub' }, 'Independent music and sound-effect controls, saved on this device. The game is fully playable in silence.'),
    prefRow('music', 'Music', 'Ambient generated background pad', 'music'),
    prefRow('sfx', 'Sound effects', 'Voting, reveals, results', 'sfx'),
    h('button', {
      class: 'btn small', style: { marginTop: 10 },
      onclick: () => { audio?.unlock(); audio?.play('roleReveal'); },
    }, icon('sfx', 15), ' Test sound'),
  );
}

/* ------------------------- shared controls ------------------------- */
export function switchEl(checked, onChange, label, disabled = false) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked), 'aria-label': label, disabled: disabled || undefined });
  // put input first so the :checked selectors apply
  const wrap = h('label', { class: 'switch' }, input, h('span', { class: 'track' }), h('span', { class: 'thumb' }));
  if (disabled) wrap.setAttribute('data-disabled', '');
  return wrap;
}

export function stepper({ value, min, max, step = 1, onChange, label }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const val = h('span', { class: 'value', 'aria-live': 'polite', text: String(value) });
  const dec = h('button', { type: 'button', 'aria-label': `Decrease ${label}`, disabled: value <= min, onclick: () => { const v = clamp(value - step); onChange(v); } }, '−');
  const inc = h('button', { type: 'button', 'aria-label': `Increase ${label}`, disabled: value >= max, onclick: () => { const v = clamp(value + step); onChange(v); } }, '+');
  dec.addEventListener('click', () => { dec.disabled = value <= min; });
  return h('span', { class: 'stepper', role: 'group', 'aria-label': label }, dec, val, inc);
}
