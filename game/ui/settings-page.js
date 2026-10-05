// Settings page: audio + local data management.

import { h, icon, toast, confirmDialog } from '../../app/ui.js';
import { createGameStorage } from '../local/storage.js';
import { getSharedAudio } from '../audio/shared.js';

export function renderSettingsPage({ mount, navigate }) {
  const storage = createGameStorage();
  const audio = getSharedAudio();

  const prefs = storage.getPrefs();
  const stats = storage.getLocalStats();
  const recent = storage.getRecentPlayers();
  const saved = storage.loadLocalGame();
  const sessions = Object.keys(storage.listSessions());

  const prefRow = (kind, label, sub, ic) => h('div', { class: 'toggle-row' },
    h('div', { class: 'toggle-text' },
      h('span', { class: 't-title' }, icon(ic, 15), ' ' + label),
      h('span', { class: 't-sub', text: sub })),
    h('div', { class: 'row', style: { gap: 12 } },
      h('input', {
        type: 'range', min: '0', max: '100', step: '5', value: String(prefs[kind].volume),
        'aria-label': `${label} volume percentage`,
        oninput: (e) => {
          prefs[kind].volume = Number(e.target.value);
          storage.setPrefs(prefs);
          audio.updateVolumes();
        },
      }),
      h('span', { class: 'mono', style: { minWidth: 38, textAlign: 'right' }, text: `${prefs[kind].volume}%` }),
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: prefs[kind].enabled, 'aria-label': `${label} toggle`,
          onchange: (e) => {
            prefs[kind].enabled = e.target.checked;
            storage.setPrefs(prefs);
            audio.unlock();
            audio.updateVolumes();
          },
        }),
        h('span', { class: 'track' }), h('span', { class: 'thumb' })),
    ),
  );

  mount.append(h('div', { class: 'screen-enter stack', style: { gap: 18, maxWidth: 760, margin: '0 auto' } },
    h('div', { class: 'row' },
      h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 16), 'Back to the game')),
    h('h1', { style: { margin: 0 } }, icon('settings', 26), ' Settings'),

    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('music', 20), ' Audio'),
      h('p', { class: 'section-sub' }, 'Saved on this device. The game is fully playable in silence — sound never carries unique information.'),
      prefRow('music', 'Music', 'Generated ambient background', 'music'),
      prefRow('sfx', 'Sound effects', 'Reveals, votes, results', 'sfx'),
      h('button', { class: 'btn small', style: { marginTop: 10 }, onclick: () => { audio.unlock(); audio.play('roleReveal'); } }, icon('sfx', 15), ' Test sound'),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('shield', 20), ' Local data'),
      h('p', { class: 'section-sub' }, 'Everything below lives only in this browser. Online room state always belongs to the server and is never overwritten locally.'),
      h('ul', { class: 'mini-table', style: { listStyle: 'none', padding: 0 } },
        h('li', null, h('strong', { text: 'Recent players: ' }), `${recent.length} saved`),
        h('li', null, h('strong', { text: 'Local stats: ' }), `${stats.gamesPlayed} game${stats.gamesPlayed === 1 ? '' : 's'} · ${stats.roundsPlayed} rounds`),
        h('li', null, h('strong', { text: 'Unfinished game: ' }), saved ? `yes (${saved.state.players.length} players)` : 'none'),
        h('li', null, h('strong', { text: 'Saved room sessions: ' }), String(sessions.length)),
      ),
      h('div', { class: 'row', style: { marginTop: 12 } },
        clearBtn('Recent players', async () => {
          if (await confirmDialog('Clear the recent-player history?', { okLabel: 'Clear' })) {
            storage.clearRecentPlayers();
            toast('Recent players cleared.', 'good');
            navigate('#/game/vote-out-imposter/settings', { replace: true });
          }
        }),
        clearBtn('Local stats', async () => {
          if (await confirmDialog('Reset the local statistics?', { okLabel: 'Reset' })) {
            storage.clearLocalStats();
            toast('Stats cleared.', 'good');
            navigate('#/game/vote-out-imposter/settings', { replace: true });
          }
        }),
        saved ? clearBtn('Unfinished game', async () => {
          if (await confirmDialog('Discard the unfinished game?', { okLabel: 'Discard' })) {
            storage.clearLocalGame();
            toast('Game discarded.', 'good');
            navigate('#/game/vote-out-imposter/settings', { replace: true });
          }
        }) : null,
        sessions.length ? clearBtn('Room sessions', async () => {
          if (await confirmDialog('Forget all saved room sessions?', { okLabel: 'Forget' })) {
            for (const code of sessions) storage.removeSession(code);
            toast('Sessions forgotten.', 'good');
            navigate('#/game/vote-out-imposter/settings', { replace: true });
          }
        }) : null,
        clearBtn('Everything', async () => {
          if (await confirmDialog('Clear ALL local game data (names, stats, settings, saved games, sessions)?', { okLabel: 'Clear everything' })) {
            storage.clearRecentPlayers();
            storage.clearLocalStats();
            storage.clearLocalGame();
            for (const code of sessions) storage.removeSession(code);
            toast('All local game data cleared.', 'good');
            navigate('#/game/vote-out-imposter/settings', { replace: true });
          }
        }, true),
      ),
    ),
  ));
}

function clearBtn(label, fn, danger = false) {
  return h('button', { class: `btn small ${danger ? 'danger' : 'ghost'}`, onclick: fn }, icon('trash', 14), `Clear: ${label}`);
}
