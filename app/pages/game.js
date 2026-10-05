// Game landing (single-game app): title, how-to, mode cards, saved-game
// resume, settings — this IS the app's front door (spec §21).

import { h, icon, toast } from '../ui.js';
import { isOnlineConfigured } from '../config.js';
import { createGameStorage } from '../../game/local/storage.js';
import { gameTitleArt } from '../../game/ui/art.js';

export function renderGameHome({ mount, navigate }) {
  const storage = createGameStorage();
  const saved = storage.loadLocalGame();
  const sessions = Object.values(storage.listSessions()).sort((a, b) => b.savedAt - a.savedAt);
  const onlineReady = isOnlineConfigured();

  mount.append(h('div', { class: 'screen-enter stack', style: { gap: 20 } },
    h('div', { class: 'hero', style: { padding: '18px 0 4px' } },
      gameTitleArt(),
      h('h1', { text: 'VOTE OUT IMPOSTER' }),
      h('p', { class: 'tagline' },
        'Innocents share a secret word. Imposters blend in. Discuss, vote, and eliminate the imposters — before they win.'
      ),
    ),

    saved ? resumeBanner(saved, navigate) : null,
    sessions.length && onlineReady ? resumeOnlineBanner(sessions[0], navigate) : null,

    h('div', { class: 'mode-grid' },
      modeCard({
        icon: 'user',
        title: 'One Mobile',
        desc: 'Pass-and-play on a single device. Fully offline — perfect for the dinner table, a bus ride, or anywhere with no signal.',
        cta: 'Start local game',
        onClick: () => navigate('#/game/vote-out-imposter/local'),
      }),
      modeCard({
        icon: 'wifi',
        title: 'Multiple Devices',
        desc: onlineReady
          ? 'Real online rooms: the host creates a room, everyone joins from their own device with an invite link.'
          : 'Genuine online rooms on real devices. Requires the site owner to configure an online service (see the setup guide).',
        cta: onlineReady ? 'Create / join room' : 'Open online lobby',
        disabled: false,
        badge: onlineReady ? { label: 'Online', cls: 'good' } : { label: 'Needs setup', cls: 'warn' },
        onClick: () => navigate('#/game/vote-out-imposter/online'),
      }),
    ),

    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('a', { class: 'btn', href: '#/game/vote-out-imposter/rules' }, icon('book', 18), 'Full rules'),
      h('a', { class: 'btn', href: '#/game/vote-out-imposter/settings' }, icon('settings', 18), 'Settings'),
    ),

    howTo(),
  ));
}

function modeCard({ icon: ic, title, desc, cta, onClick, disabled = false, badge }) {
  return h('div', {
    class: 'mode-card alt' + (disabled ? ' disabled' : ''),
    role: 'button', tabindex: disabled ? '-1' : '0',
    'aria-disabled': disabled ? 'true' : undefined,
    onclick: () => { if (!disabled) onClick(); },
    onkeydown: (e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } },
  },
    h('div', { class: 'row-between', style: { width: '100%' } },
      h('div', { class: 'mode-icon' }, icon(ic, 26)),
      badge ? h('span', { class: `badge ${badge.cls}`, text: badge.label }) : null,
    ),
    h('h3', { text: title }),
    h('p', { text: desc }),
    h('span', { class: 'btn accent2 small', style: { alignSelf: 'flex-start' } }, cta),
  );
}

function resumeBanner(saved, navigate) {
  const state = saved.state;
  return h('div', { class: 'banner info', role: 'status' },
    icon('history', 20),
    h('div', { style: { flex: 1 } },
      h('b', { text: 'Unfinished game on this device' }),
      h('div', { class: 'small muted' },
        `${state.players.length} players · round ${state.roundIndex + 1} of ${state.config.rounds} · saved for recovery.`),
      h('div', { class: 'row', style: { marginTop: 8 } },
        h('button', { class: 'btn primary small', onclick: () => navigate('#/game/vote-out-imposter/local/play') }, icon('play', 15), 'Resume'),
        h('button', {
          class: 'btn small', onclick: async () => {
            const { confirmDialog } = await import('../ui.js');
            if (await confirmDialog('Restart will discard the unfinished game on this device. Continue?', { okLabel: 'Restart' })) {
              createGameStorage().clearLocalGame();
              navigate('#/game/vote-out-imposter/local', { replace: true });
              toast('Unfinished game cleared.', 'good');
              location.reload();
            }
          },
        }, 'Restart'),
        h('button', {
          class: 'btn small', onclick: async () => {
            const { confirmDialog } = await import('../ui.js');
            if (await confirmDialog('Abandon removes the saved game. This cannot be undone.', { okLabel: 'Abandon' })) {
              createGameStorage().clearLocalGame();
              toast('Game abandoned.', 'info');
              location.reload();
            }
          },
        }, 'Abandon'),
      ),
    ),
  );
}

function resumeOnlineBanner(session, navigate) {
  const storage = createGameStorage();
  const code = Object.keys(storage.listSessions()).find((k) => storage.listSessions()[k] === session);
  return h('div', { class: 'banner info' },
    icon('wifi', 20),
    h('div', { style: { flex: 1 } },
      h('b', { text: 'Recent online room' }),
      h('div', { class: 'small muted' }, `Room ${code} — ${session.name || 'player'}'s last session.`),
      h('div', { class: 'row', style: { marginTop: 8 } },
        h('button', { class: 'btn primary small', onclick: () => navigate(`#/game/vote-out-imposter/online/room?code=${code}`) }, icon('refresh', 15), 'Rejoin'),
        h('button', { class: 'btn small', onclick: async () => {
          const { confirmDialog } = await import('../ui.js');
          if (await confirmDialog('Forget this room on this device?', { okLabel: 'Forget' })) {
            storage.removeSession(code);
            toast('Room forgotten.', 'info');
            location.reload();
          }
        } }, 'Forget'),
      ),
    ),
  );
}

function howTo() {
  return h('section', { class: 'card', style: { marginTop: 8 } },
    h('h2', { class: 'section-title' }, icon('book', 20), ' How it works'),
    h('div', { class: 'steps' },
      step('Everyone gets a role', 'Innocents see the secret word. Imposters see nothing but a related-word hint — and must fake it.'),
      step('Discuss', 'Talk about the word without saying it. Spot who is guessing.'),
      step('Vote privately', 'Everyone votes in secret — no live totals to sway you.'),
      step('Eliminate & win', 'Eliminate every imposter for an innocent win; imposters win at parity or by guessing the word.'),
    ),
    h('p', { class: 'small muted', style: { marginTop: 12 } },
      'Special twists: Chaos Mode with ', h('b', { text: 'Everyone Is Imposter' }), ', ',
      h('b', { text: 'No Imposter' }), ', ', h('b', { text: 'Random' }), ' and ', h('b', { text: 'Custom' }), ' imposter counts, or ', h('b', { text: 'No Hints' }), '.'),
    h('p', { class: 'small muted' },
      'Imposter lifeline: every imposter secretly receives a ', h('b', { text: 'related-word hint' }),
      ' — far from the answer, close enough to spark an idea.'),
  );
}
function step(title, body) {
  return h('div', { class: 'step' }, h('div', { class: 's-body' }, h('b', { text: title + '. ' }), body));
}
