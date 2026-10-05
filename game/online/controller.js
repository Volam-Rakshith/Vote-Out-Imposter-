// Multiple Devices (online) controller. Renders personal screens from the
// authoritative server state: lobby, role reveal, discussion, private voting,
// results, imposter guess, reconnection and error recovery.

import { h, icon, toast, confirmDialog, announce, copyToClipboard, focusMain, setLeaveGuard, vibrate } from '../../app/ui.js';
import { isOnlineConfigured } from '../../app/config.js';
import { createApiClient, ApiError } from './api-client.js';
import { createRealtime } from './realtime.js';
import { createGameStorage } from '../local/storage.js';
import { getSharedAudio } from '../audio/shared.js';
import {
  createSetupState, renderSetupSections, setupProblems, DEFAULT_SETUP_CONFIG,
} from '../ui/setup.js';
import {
  phaseHeader, timerPanel, rosterStrip, roleCard, votingView, voteResultView,
  guessView, resultView, progressDots,
} from '../ui/components.js';
import { timerRing, formatClock, initials } from '../../app/ui.js';
import { validateName } from '../../engine/index.js';

const storage = createGameStorage();
const audio = getSharedAudio();

const FATAL_CODES = new Set(['ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'UNAUTHORIZED', 'FORBIDDEN_SESSION']);

function inviteLink(code) {
  const { origin, pathname } = location;
  return `${origin}${pathname}#/game/vote-out-imposter/online/room?code=${code}`;
}

/* ================================================================== */
/* Online home                                                          */
/* ================================================================== */

export function renderOnlineHome({ mount, navigate }) {
  focusMain();
  const api = createApiClient();
  const configured = isOnlineConfigured() && api.configured;
  const sessions = Object.entries(storage.listSessions()).sort((a, b) => b[1].savedAt - a[1].savedAt);

  const nameInput = h('input', {
    class: 'input', type: 'text', maxlength: '24', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Your display name (e.g. Rakshith)',
    value: storage.getPreferredName(),
    'aria-label': 'Your display name',
  });
  const codeInput = h('input', {
    class: 'input mono', type: 'text', maxlength: '6', autocomplete: 'off',
    placeholder: 'ABC123', style: { textTransform: 'uppercase', letterSpacing: '0.2em', maxWidth: 160 },
    'aria-label': 'Room code',
  });

  async function ensureName() {
    const name = nameInput.value.trim();
    const check = validateName(name);
    if (!check.ok) {
      toast(check.message, 'bad');
      nameInput.classList.add('invalid', 'shake');
      setTimeout(() => nameInput.classList.remove('shake'), 450);
      nameInput.focus();
      return null;
    }
    storage.setPreferredName(name);
    return name;
  }

  async function createRoom() {
    const name = await ensureName();
    if (!name) return;
    try {
      toast('Creating room…', 'info', 1500);
      const res = await api.call('create_room', { name });
      storage.saveSession(res.roomCode, { token: res.token, playerId: res.private.playerId, name });
      audio.unlock();
      audio.play('gameStart');
      navigate(`#/game/vote-out-imposter/online/room?code=${res.roomCode}`);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function joinRoom(code) {
    const name = await ensureName();
    if (!name) return;
    try {
      const res = await api.call('join_room', { code, name });
      storage.saveSession(code, { token: res.token, playerId: res.private.playerId, name });
      audio.unlock();
      navigate(`#/game/vote-out-imposter/online/room?code=${code}`);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  mount.append(h('div', { class: 'screen-enter stack', style: { gap: 18 } },
    h('div', { class: 'row' },
      h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 16), 'Back to the game'),
      h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, 'Back to app'),
    ),
    h('div', { class: 'row-between' },
      h('h1', { style: { margin: 0, fontSize: '1.5rem' } }, icon('wifi', 24), ' Multiple Devices'),
      h('span', { class: 'badge ' + (configured ? 'good' : 'warn') }, configured ? 'Online ready' : 'Needs setup'),
    ),

    configured ? null : h('div', { class: 'banner warn' },
      icon('wifiOff', 20),
      h('div', {},
        h('b', { text: 'Online multiplayer is not configured on this deployment.' }),
        h('div', { class: 'small' },
          'One Mobile mode works right now, fully offline. To enable real online rooms, the site owner completes the ',
          h('a', { href: '#/game/vote-out-imposter/docs/multiplayer', style: { color: 'var(--accent)' } }, 'multiplayer setup guide'),
          ' (a free Supabase project — no credit card needed for the free tier).'),
      )),

    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('user', 20), ' You'),
      h('label', { class: 'field-label', for: 'name-input' }, 'Display name'),
      nameInput,
      h('p', { class: 'field-hint' }, 'Friends will see this name in the room. 1–24 characters, emojis welcome.'),
    ),

    configured ? h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('plus', 20), ' Create a room'),
      h('p', { class: 'section-sub' }, 'You become the host: configure the game, invite friends with a link, start when everyone is in.'),
      h('button', { class: 'btn primary big block', onclick: createRoom }, icon('plus', 20), 'Create room'),
    ) : null,

    configured ? h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('link', 20), ' Join a room'),
      h('div', { class: 'row' },
        codeInput,
        h('button', {
          class: 'btn primary', onclick: async () => {
            const code = codeInput.value.trim().toUpperCase();
            if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Enter the 6-character room code.', 'bad'); return; }
            await joinRoom(code);
          },
        }, icon('arrowRight', 18), 'Join'),
      ),
      h('p', { class: 'field-hint' }, 'Got an invite link? Just open it — the code is included automatically.'),
    ) : null,

    sessions.length ? h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, icon('history', 20), ' Your rooms on this device'),
      h('div', { class: 'chip-grid' }, sessions.map(([code, s]) => h('button', {
        class: 'chip recent-chip',
        onclick: () => navigate(`#/game/vote-out-imposter/online/room?code=${code}`),
      }, icon('refresh', 13), `${code} · ${s.name || 'player'}`))),
      h('button', {
        class: 'btn tiny ghost', style: { marginTop: 10 },
        onclick: async () => {
          if (await confirmDialog('Forget all saved room sessions on this device?', { okLabel: 'Forget all' })) {
            for (const [code] of sessions) storage.removeSession(code);
            toast('Saved sessions cleared.', 'good');
            navigate('#/game/vote-out-imposter/online', { replace: true });
          }
        },
      }, 'Forget all sessions'),
    ) : null,
  ));
}

/* ================================================================== */
/* Room (lobby + live game)                                             */
/* ================================================================== */

export function renderOnlineRoom({ mount, navigate, query }) {
  focusMain();
  const api = createApiClient();
  if (!api.configured) {
    mount.append(notConfiguredScreen(navigate));
    return () => {};
  }
  const code = String(query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    toast('That invite link is missing a valid room code.', 'bad');
    navigate('#/game/vote-out-imposter/online', { replace: true });
    return () => {};
  }
  const session = storage.getSession(code);
  if (!session) {
    renderJoinGate(mount, navigate, code);
    return () => {};
  }
  return startRoom(mount, navigate, code, session);
}

/* -------- gate shown when opening an invite link without a saved session -------- */
function renderJoinGate(mount, navigate, code) {
  const nameInput = h('input', {
    class: 'input', type: 'text', maxlength: '24', placeholder: 'Your display name',
    value: storage.getPreferredName(), 'aria-label': 'Your display name',
  });
  mount.append(h('div', { class: 'screen-enter stack center', style: { maxWidth: 460, margin: '4vh auto' } },
    h('h1', { style: { margin: 0 } }, icon('link', 28), ' You\'re invited!'),
    h('p', { class: 'muted' }, 'Room ', h('b', { class: 'mono', text: code })),
    h('div', { class: 'card', style: { textAlign: 'left' } },
      h('label', { class: 'field-label', for: 'gate-name' }, 'Your display name'),
      nameInput,
      h('button', {
        class: 'btn primary big block', style: { marginTop: 12 },
        onclick: async () => {
          const name = nameInput.value.trim();
          const check = validateName(name);
          if (!check.ok) { toast(check.message, 'bad'); return; }
          storage.setPreferredName(name);
          try {
            const res = await createApiClient().call('join_room', { code, name });
            storage.saveSession(code, { token: res.token, playerId: res.private.playerId, name });
            navigate(`#/game/vote-out-imposter/online/room?code=${code}`, { replace: true });
          } catch (e) {
            toast(e.message, 'bad');
            if (e.code === 'GAME_IN_PROGRESS' || e.code === 'ROOM_NOT_FOUND' || e.code === 'ROOM_EXPIRED') {
              setTimeout(() => navigate('#/game/vote-out-imposter/online', { replace: true }), 1600);
            }
          }
        },
      }, icon('arrowRight', 18), 'Join room'),
    ),
    h('button', { class: 'btn ghost', onclick: () => navigate('#/game/vote-out-imposter/online') }, 'Back'),
  ));
}

/* ---------------- the live room ---------------- */
function startRoom(mount, navigate, code, session) {
  let publicState = null;
  let priv = null;
  let clockOffset = 0;
  let connection = 'connecting';
  let pollTimer = null;
  let realtime = null;
  let stopped = false;
  let backoffMs = 2500;
  let myPlayerId = session.playerId;
  let busy = false;
  let prevPhase = null;
  let lastSpeakerId = null; // speaking-mode turn detection (vibration on MY turn)

  function absorb(res) {
    publicState = res.publicState;
    priv = res.private;
    if (res.private?.playerId) myPlayerId = res.private.playerId;
    if (typeof res.serverNow === 'number') clockOffset = res.serverNow - Date.now();
    render();
  }

  async function sync({ silent = false } = {}) {
    if (stopped) return;
    try {
      const res = await api.call('sync', { code, token: session.token });
      connection = 'online';
      backoffMs = 2500;
      absorb(res);
    } catch (e) {
      if (stopped) return;
      if (e instanceof ApiError && (e.code === 'ROOM_NOT_FOUND' || e.code === 'ROOM_EXPIRED' || e.code === 'UNAUTHORIZED')) {
        fatal(e);
        return;
      }
      connection = 'offline';
      if (!silent) render();
      backoffMs = Math.min(20000, backoffMs * 1.7);
      setTimeout(() => { if (!stopped) sync({ silent: true }); }, backoffMs);
    }
  }

  async function act(action, payload = {}) {
    if (busy) return null;
    busy = true;
    try {
      const res = await api.call(action, { ...payload, code, token: session.token });
      connection = 'online';
      absorb(res);
      return res;
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'ROOM_NOT_FOUND' || e.code === 'ROOM_EXPIRED' || e.code === 'UNAUTHORIZED')) {
        fatal(e);
      } else {
        toast(e.message, 'bad');
        render();
      }
      return null;
    } finally {
      busy = false;
    }
  }

  function fatal(e) {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    realtime?.close();
    storage.removeSession(code);
    renderFatal(e);
  }

  /* ------------- render ------------- */
  function render() {
    if (stopped) return;
    if (prevPhase !== publicState?.phase) {
      fireTransitionAudio(prevPhase, publicState);
      prevPhase = publicState?.phase;
    }
    mount.replaceChildren();
    const wrap = h('div', { class: 'screen-enter stack', style: { gap: 16 } });
    mount.append(wrap);

    wrap.append(connBar());
    if (!publicState) {
      wrap.append(h('div', { class: 'pass-card' }, icon('refresh', 40), h('p', { class: 'pass-name', style: { fontSize: '1.2rem' }, text: 'Connecting to room…' })));
      return;
    }
    const st = publicState;
    const me = st.room?.members?.find((m) => m.playerId === myPlayerId);
    const isHost = st.room?.hostId === myPlayerId;

    switch (st.phase) {
      case 'room_lobby': renderLobby(wrap, st, me, isHost); break;
      case 'role_reveal': renderRoleReveal(wrap, st, isHost); break;
      case 'discussion': renderDiscussion(wrap, st, isHost); break;
      case 'voting': renderVoting(wrap, st, isHost); break;
      case 'vote_result': renderVoteResult(wrap, st, isHost); break;
      case 'imposter_guess': renderGuess(wrap, st, isHost); break;
      case 'round_result': renderRoundResult(wrap, st, isHost); break;
      case 'game_result': renderGameResult(wrap, st, isHost); break;
      default:
        wrap.append(h('div', { class: 'banner bad' }, icon('alert', 18), h('span', { text: `Unknown phase: ${st.phase}` })));
    }
  }

  function connBar() {
    const label = connection === 'online' ? 'Live' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';
    return h('div', { class: 'row-between' },
      h('button', { class: 'btn tiny ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 13), 'Back to the game'),
      h('div', { class: 'row' },
        h('span', { class: 'conn-pill ' + (connection === 'online' ? '' : connection === 'connecting' ? 'connecting' : 'offline') },
          h('span', { class: 'conn-dot' }), label),
        h('span', { class: 'badge mono', text: code }),
      ),
    );
  }

  function serverTimer(st) {
    const key = st.phase === 'discussion' ? 'discussionEndsAt' : st.phase === 'voting' ? 'votingEndsAt' : null;
    if (!key || !st.timers?.[key]) return null;
    const total = st.phase === 'discussion' ? st.config.discussionTimerSec : st.config.votingTimerSec;
    const left = Math.max(0, (st.timers[key] - (Date.now() + clockOffset)) / 1000);
    audio.tickIfUrgent(left);
    return timerRing({ secondsLeft: left, totalSeconds: total, label: `Time left: ${formatClock(left)}` });
  }

  /* ------------- lobby ------------- */
  function renderLobby(wrap, st, me, isHost) {
    const members = st.room.members;
    const setupState = createSetupState({
      initialConfig: st.config ?? DEFAULT_SETUP_CONFIG,
      initialRoster: members.map((m) => ({ id: m.playerId, name: m.name })),
      storage,
    });
    let saveTimer = null;
    const schedule = () => {
      render();
      // debounce config saves to the server
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        act('set_config', { config: setupState.config });
      }, 350);
    };

    wrap.append(
      h('div', { class: 'row-between' },
        h('h1', { style: { margin: 0, fontSize: '1.4rem' } }, icon('users', 22), ' Room lobby'),
        h('span', { class: 'badge ' + (members.length >= 3 ? 'good' : 'warn') }, `${members.length} / 20 players`),
      ),
      h('div', { class: 'card' },
        h('h2', { class: 'section-title' }, icon('share', 20), ' Invite friends'),
        h('div', { class: 'room-code-box' }, h('span', { class: 'room-code', text: code })),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: 12 } },
          h('button', {
            class: 'btn small', onclick: async () => {
              (await copyToClipboard(code)) ? toast('Room code copied.', 'good') : toast('Copy failed — code is ' + code, 'bad');
            },
          }, icon('copy', 15), 'Copy code'),
          h('button', {
            class: 'btn small', onclick: async () => {
              (await copyToClipboard(inviteLink(code))) ? toast('Invite link copied.', 'good') : toast('Copy failed — select the link manually.', 'bad');
            },
          }, icon('link', 15), 'Copy invite link'),
          h('button', {
            class: 'btn small', onclick: async () => {
              if (navigator.share) {
                try { await navigator.share({ title: 'Vote Out Imposter', text: `Join my game! Room code: ${code}`, url: inviteLink(code) }); } catch { /* cancelled */ }
              } else {
                (await copyToClipboard(inviteLink(code))) ? toast('Invite link copied.', 'good') : null;
              }
            },
          }, icon('share', 15), 'Share'),
        ),
        h('p', { class: 'tiny muted center', style: { marginTop: 8 } }, 'The invite link keeps your room code — open it on any device.'),
      ),
      h('div', { class: 'card' },
        h('h2', { class: 'section-title' }, icon('users', 20), ` Players (${members.length})`),
        h('div', { class: 'stack-sm' }, members.map((m) => h('div', { class: 'player-row' + (m.connected ? '' : ' offline-dim') },
          h('span', { class: 'p-num' }, initials(m.name)),
          h('span', { style: { flex: 1, fontWeight: 700 } }, m.name,
            m.connected ? null : h('span', { class: 'tiny muted', text: '  (offline)' })),
          m.isHost ? h('span', { class: 'badge host' }, icon('crown', 12), 'Host') : null,
          isHost && !m.isHost ? h('button', {
            class: 'icon-btn', 'aria-label': `Remove ${m.name}`, title: 'Remove from room',
            onclick: async () => {
              if (await confirmDialog(`Remove ${m.name} from the room?`, { okLabel: 'Remove' })) {
                act('remove_member', { playerId: m.playerId });
              }
            },
          }, icon('trash', 15)) : null,
        ))),
        me && !isHost ? h('div', { class: 'row', style: { marginTop: 10 } },
          h('button', {
            class: 'btn small ghost', onclick: async () => {
              if (await confirmDialog('Leave this room?', { okLabel: 'Leave' })) {
                await act('leave_room');
                storage.removeSession(code);
                navigate('#/game/vote-out-imposter/online');
              }
            },
          }, icon('doorOut', 14), 'Leave room'),
        ) : null,
      ),
      isHost ? h('details', { class: 'card', open: members.length >= 3 },
        h('summary', { class: 'section-title', style: { cursor: 'pointer' } }, icon('settings', 20), ' Game settings (host)'),
        h('div', { class: 'stack', style: { marginTop: 10, gap: 14 } },
          renderSetupSections({ state: setupState, schedule, audio, showPlayers: false, showAudio: false }),
          h('p', { class: 'tiny muted' }, 'Changes save automatically for everyone in the room.'),
        ),
      ) : h('div', { class: 'card tight' },
        h('p', { class: 'small muted' }, 'The host configures the game settings. Sit tight!'),
      ),
    );

    const problems = isHost ? setupProblems({ ...setupState, roster: members.map((m) => ({ name: m.name })) }).filter((p) => !/player/i.test(p)) : [];
    const canStart = isHost && members.length >= 3;
    wrap.append(h('div', { class: 'card' },
      isHost
        ? h('button', {
            class: 'btn primary big block', disabled: !canStart || busy,
            onclick: async () => {
              if (await confirmDialog('Start the game for everyone? Settings lock once it begins.', { okLabel: 'Start game' })) {
                audio.unlock();
                await act('start_game');
              }
            },
          }, icon('play', 20), canStart ? 'Start game' : `Waiting for ${3 - members.length} more player${3 - members.length === 1 ? '' : 's'}…`)
        : h('p', { class: 'small muted center' }, 'Waiting for the host to start the game…'),
      problems.length ? h('ul', { style: { margin: '10px 0 0', paddingLeft: 20 } }, problems.map((p) => h('li', { class: 'field-error', text: p }))) : null,
    ));
    announce(`Lobby: ${members.length} players connected.`);
  }

  /* ------------- role reveal ------------- */
  function renderRoleReveal(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    const acked = st.reveal.acked ?? [];
    const total = st.players.length;
    wrap.append(progressDots({ total, done: acked.length, current: acked.length }));

    if (priv?.role) {
      wrap.append(roleCard({
        role: priv.role,
        word: priv.word,
        hint: priv.hint,
        chaosVariant: st.config.chaos,
        subtitle: 'This screen is for your eyes only.',
      }));
      const mine = acked.includes(myPlayerId);
      wrap.append(mine
        ? h('div', { class: 'banner good' }, icon('check', 18), h('div', { class: 'small' }, h('b', { text: 'You have seen your role.' }), ` Waiting for ${total - acked.length} other player${total - acked.length === 1 ? '' : 's'}…`))
        : h('button', {
            class: 'btn primary big block', onclick: () => { audio.play('roleReveal'); act('ack_role'); },
          }, icon('eye', 18), 'Got it — I\'ve seen my role'));
    }
    if (isHost && total - acked.length > 0) {
      wrap.append(h('div', { class: 'center' },
        h('button', {
          class: 'btn tiny ghost', onclick: async () => {
            if (await confirmDialog('Skip the remaining role reveals?', { okLabel: 'Skip' })) act('skip_reveal');
          },
        }, 'Skip remaining reveals (host)')));
    }
    announce('Role reveal. Open your role privately.');
  }

  /* ------------- discussion ------------- */
  function renderDiscussion(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    const tp = serverTimer(st);
    const head = h('div', { class: 'row-between' });
    if (tp) head.append(tp);
    head.append(h('span', { class: 'badge accent' }, `Round ${st.roundIndex + 1} / ${st.config.rounds}`));
    wrap.append(head);

    if (st.speaking) {
      wrap.append(speakingPanelOnline(st, isHost));
    } else {
      wrap.append(h('div', { class: 'card' },
        h('h2', { class: 'section-title' }, icon('chat', 20), ' Discuss!'),
        h('p', { class: 'muted small' }, 'Talk about the secret word — without saying it. Then the host starts the vote.'),
        rosterStrip(st.players, { eliminated: st.currentEliminated ?? [] }),
      ));
    }
    if (isHost) {
      wrap.append(h('button', {
        class: 'btn primary big block', onclick: async () => {
          if (await confirmDialog('Start the vote for everyone?', { okLabel: 'Start voting' })) await act('end_discussion');
        },
      }, icon('vote', 20), 'Start the vote'));
    } else {
      wrap.append(h('p', { class: 'small muted center' }, 'The host starts the vote when the discussion is done.'));
    }
    announce('Discussion phase.');
  }

  /** Per-player speaking mode: everyone sees whose turn it is + countdown.
   *  The current speaker's OWN phone vibrates for ~1.5s when their turn starts. */
  function speakingPanelOnline(st, isHost) {
    const sp = st.speaking;
    const speaker = st.players.find((p) => p.id === sp.playerId);
    const name = speaker ? speaker.name : '—';
    const isMyTurn = sp.playerId === myPlayerId;

    // Turn-change detection (state arrives via polling/realtime):
    if (lastSpeakerId !== sp.playerId) {
      if (isMyTurn) {
        // MY turn: strong 1.5s vibration + distinct cue
        vibrate(1500);
        audio.play('speakerTurn');
        announce('Your speaking turn!');
      } else if (lastSpeakerId !== null) {
        announce(`${name} is speaking.`);
      }
      lastSpeakerId = sp.playerId;
    }

    const left = Math.max(0, (sp.endsAt - (Date.now() + clockOffset)) / 1000);
    const nextUp = sp.order.slice(sp.index + 1)
      .map((id) => st.players.find((p) => p.id === id)?.name)
      .filter(Boolean);

    return h('div', { class: 'card speaking-card' + (isMyTurn ? ' my-turn' : '') },
      h('div', { class: 'row-between' },
        h('div', {},
          h('div', { class: 'small muted', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' } },
            `Speaker ${sp.index + 1} of ${sp.total}`),
          h('div', { class: 'speak-name', text: isMyTurn ? 'YOUR TURN — ' + name : name }),
          h('p', { class: 'tiny muted', style: { margin: '2px 0 0' } },
            nextUp.length ? `Next: ${nextUp.join(' → ')}` : 'Last speaker — voting begins after this.'),
        ),
        timerRing({ secondsLeft: left, totalSeconds: sp.secPerPlayer, label: `Speaking time: ${formatClock(left)}` }),
      ),
      isHost ? h('div', { class: 'row', style: { marginTop: 10 } },
        h('button', { class: 'btn small', onclick: () => act('next_speaker') }, icon('arrowRight', 15), 'Done — next speaker'),
      ) : null,
    );
  }

  /* ------------- voting ------------- */
  function renderVoting(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    const head = h('div', { class: 'row-between' });
    const tp = serverTimer(st);
    if (tp) head.append(tp);
    const activeCount = st.players.length - (st.rounds?.[st.roundIndex]?.eliminated?.length ?? 0);
    head.append(h('span', { class: 'badge' }, `${st.voting.voted?.length ?? 0} of ${activeCount} voted`));
    wrap.append(head);

    const meVoted = priv?.hasVoted === true;
    const round = st.rounds?.[st.roundIndex];
    const eliminated = round?.eliminated ?? [];
    const candidates = st.players.filter((p) => p.id !== myPlayerId && !eliminated.includes(p.id));
    let myVote = null;

    if (meVoted) {
      wrap.append(h('div', { class: 'pass-card' },
        icon('lock', 40),
        h('p', { class: 'pass-name', style: { fontSize: '1.2rem' }, text: 'Vote locked in' }),
        h('p', { class: 'pass-note' }, 'Your vote stays hidden until everyone has voted. No totals are shown while voting is open.'),
      ));
    } else {
      const view = votingView({
        voterName: st.players.find((p) => p.id === myPlayerId)?.name ?? 'You',
        candidates,
        myVote: null,
        hasVoted: false,
        locked: false,
        selfId: myPlayerId,
        eliminated,
        note: 'Your vote is private — no totals are shown while voting is open.',
        onSelect: (id) => { myVote = id; renderVoteSelect(); },
        onConfirm: async () => {
          if (!myVote) return;
          const res = await act('cast_vote', { targetId: myVote });
          if (res) audio.play('voteLock');
        },
        onEndVoting: null,
      });
      wrap.append(view);
      // reflect selection state on re-select
      function renderVoteSelect() {
        const grid = view.querySelector('.candidate-grid');
        const btn = view.querySelector('.btn.primary');
        if (!grid || !btn) return;
        for (const b of grid.children) {
          b.classList.toggle('selected', b.dataset.pid === myVote);
          b.setAttribute('aria-checked', b.dataset.pid === myVote ? 'true' : 'false');
        }
        btn.disabled = !myVote;
      }
      renderVoteSelect();
    }
    if (isHost) {
      wrap.append(h('button', {
        class: 'btn ghost block', onclick: async () => {
          if (await confirmDialog('Close voting now? Players who have not voted will abstain.', { okLabel: 'Close voting' })) {
            await act('end_voting');
          }
        },
      }, 'Close voting early (host)'));
    }
    announce('Voting phase. Votes are private.');
  }

  /* ------------- vote result ------------- */
  function renderVoteResult(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    wrap.append(voteResultView({
      voteResult: st.lastVoteResult,
      players: st.players,
      onContinue: isHost ? () => act('continue') : null,
      continueLabel: 'Continue',
    }));
    if (!isHost) wrap.append(h('p', { class: 'small muted center' }, 'The host continues the game.'));
    const vr = st.lastVoteResult;
    announce(vr?.outcome === 'eliminated'
      ? `Vote result: ${st.players.find((p) => p.id === vr.eliminatedId)?.name} eliminated — they were ${vr.revealedRole}.`
      : 'Vote result shown.');
  }

  /* ------------- guess ------------- */
  function renderGuess(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    const eligible = priv?.guess?.eligible === true;
    const submitted = priv?.guess?.submitted === true;
    wrap.append(guessView({
      eligible,
      submittedGuess: submitted,
      onSubmit: async (input) => {
        const text = input.value.trim();
        if (!text) { toast('Type a guess first — or choose “No guess”.', 'bad'); return; }
        const res = await act('submit_guess', { guess: text });
        if (res) audio.play(st.phase === 'round_result' ? 'guessCorrect' : 'guessWrong');
      },
      onSkip: async () => { await act('end_guessing'); },
      onEnd: isHost ? () => act('end_guessing') : null,
      subtitle: st.guess?.pendingCount > 0 ? 'The caught imposter is deciding…' : 'Resolving the guess…',
    }));
    if (eligible && !submitted) announce('You may guess the word!');
    else announce('Imposter guess in progress.');
  }

  /* ------------- round / game results ------------- */
  function renderRoundResult(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    wrap.append(resultView({
      kind: 'round',
      lastRoundResult: st.lastRoundResult,
      session: st.session,
      players: st.players,
      onContinue: isHost ? () => act('continue') : null,
      continueLabel: st.roundIndex + 1 >= st.config.rounds ? 'Finish game' : 'Next round',
    }));
    if (!isHost) wrap.append(h('p', { class: 'small muted center' }, 'The host starts the next round.'));
  }

  function renderGameResult(wrap, st, isHost) {
    wrap.append(phaseHeader(st));
    wrap.append(resultView({
      kind: 'game',
      lastRoundResult: st.lastRoundResult,
      gameResult: st.gameResult,
      session: st.session,
      players: st.players,
      onContinue: null,
    }));
    wrap.append(h('div', { class: 'row', style: { justifyContent: 'center' } },
      isHost ? h('button', {
        class: 'btn primary big', onclick: async () => {
          const res = await act('play_again');
          if (res) audio.play('gameStart');
        },
      }, icon('refresh', 18), 'Play Again') : h('p', { class: 'small muted' }, 'Waiting for the host…'),
      h('button', {
        class: 'btn big ghost', onclick: async () => {
          if (isHost) await act('close_room');
          else await act('leave_room');
          storage.removeSession(code);
          navigate('#/game/vote-out-imposter/online');
        },
      }, 'Exit to lobby'),
    ));
  }

  function renderFatal(e) {
    mount.replaceChildren();
    const msg = {
      ROOM_EXPIRED: 'This room has expired (rooms live for 24 hours).',
      ROOM_NOT_FOUND: 'This room no longer exists — the host may have closed it.',
      UNAUTHORIZED: 'Your saved session for this room is no longer valid.',
    }[e.code] ?? e.message;
    mount.append(h('div', { class: 'screen-enter stack center', style: { paddingTop: '10vh', gap: 16 } },
      icon('alert', 48),
      h('h2', { text: 'Connection ended' }),
      h('p', { class: 'muted', text: msg }),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => navigate('#/game/vote-out-imposter/online') }, icon('plus', 16), 'Back to online lobby'),
        h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, 'Back to the game'),
      ),
    ));
  }

  function fireTransitionAudio(from, to) {
    if (!to) return;
    if (to.phase === 'voting') audio.play('voteStart');
    if (to.phase === 'imposter_guess') audio.play('guessStart');
    if (to.phase === 'vote_result' && to.lastVoteResult?.outcome === 'eliminated') audio.play('eliminate');
    if (to.phase === 'round_result') {
      const w = to.lastRoundResult?.winner;
      if (w === 'chaos_everyone' || w === 'chaos_none') audio.play('chaosReveal');
      else if (to.lastRoundResult?.reason === 'guess') audio.play(to.lastRoundResult.winner === 'imposters' ? 'guessCorrect' : 'guessWrong');
      else audio.play('roundEnd');
    }
    if (to.phase === 'game_result') audio.play('victory');
  }

  /* ------------- start ------------- */
  setLeaveGuard(null);
  sync();
  pollTimer = setInterval(() => { if (!stopped) sync({ silent: true }); }, 2500);
  realtime = createRealtime({
    roomCode: code,
    onEvent: (event) => {
      if (event === 'state') sync({ silent: true });
      if (event === 'closed') { if (!stopped) { storage.removeSession(code); fatal(new ApiError('ROOM_NOT_FOUND', 'The host closed the room.')); } }
    },
  });
  const uiTimer = setInterval(() => {
    if (stopped) return;
    // refresh countdown rings in place
    const old = mount.querySelector('.timer-wrap');
    if (old && publicState && (publicState.phase === 'discussion' || publicState.phase === 'voting')) {
      const t = serverTimer(publicState);
      if (t) old.replaceWith(t);
    }
    // speaking-mode ring inside the speaking card
    if (publicState && publicState.phase === 'discussion' && publicState.speaking) {
      const sp = publicState.speaking;
      const ring = mount.querySelector('.speaking-card .timer-wrap');
      if (ring) {
        const left = Math.max(0, (sp.endsAt - (Date.now() + clockOffset)) / 1000);
        audio.tickIfUrgent(left);
        ring.replaceWith(timerRing({ secondsLeft: left, totalSeconds: sp.secPerPlayer, label: `Speaking time: ${formatClock(left)}` }));
      }
    }
  }, 500);

  render();

  return () => {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    if (uiTimer) clearInterval(uiTimer);
    realtime?.close();
  };
}

function notConfiguredScreen(navigate) {
  return h('div', { class: 'screen-enter stack center', style: { paddingTop: '10vh', gap: 14 } },
    icon('wifiOff', 48),
    h('h2', { text: 'Online multiplayer is not configured' }),
    h('p', { class: 'muted', style: { maxWidth: 480 } },
      'This deployment has no online service configured. One Mobile mode works fully offline right now. ',
      'The site owner can follow the multiplayer setup guide to enable real online rooms.'),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('a', { class: 'btn', href: '#/game/vote-out-imposter/docs/multiplayer' }, icon('book', 16), 'Setup guide'),
      h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, 'Back to the game'),
    ),
  );
}
