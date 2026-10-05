// One Mobile (pass-and-play) controller. Fully offline: the shared rules
// engine runs in this browser tab, state persists to localStorage for refresh
// recovery. Privacy model: roles/words are shown ONE player at a time on
// request, and hidden again before the device is passed. This protects against
// casual shoulder-surfing, NOT against someone inspecting the saved browser
// data (see docs/privacy.md).

import { h, icon, toast, confirmDialog, announce, setLeaveGuard, focusMain, vibrate, timerRing, formatClock } from '../../app/ui.js';
import {
  createLocalGame, acknowledgeRole, skipReveal, endDiscussion, castVote, endVoting,
  advance, submitGuess, endGuessing, playAgain, checkTimers, privateViewFor,
  toPublicState, isEngineError, createRng, WORD_DB, MIN_PLAYERS, nextSpeaker,
} from '../../engine/index.js';
import { createGameStorage } from './storage.js';
import { getSharedAudio } from '../audio/shared.js';
import {
  createSetupState, renderSetupSections, setupProblems, DEFAULT_SETUP_CONFIG, poolInfo,
} from '../ui/setup.js';
import {
  phaseHeader, timerPanel, rosterStrip, roleCard, passDeviceCard, hidePassCard,
  votingView, voteResultView, guessView, resultView, progressDots,
} from '../ui/components.js';
import { gameTitleArt } from '../ui/art.js';

const storage = createGameStorage();
const audio = getSharedAudio();

/* ================================================================== */
/* Setup screen                                                         */
/* ================================================================== */

export function renderLocalSetup({ mount, navigate }) {
  focusMain();
  const last = storage.getLastSetup();
  const state = createSetupState({
    initialConfig: last?.config ?? DEFAULT_SETUP_CONFIG,
    initialRoster: last?.roster,
    storage,
  });

  const saved = storage.loadLocalGame();
  let renderTick = 0;
  const schedule = () => { renderTick++; render(); };

  function render() {
    mount.replaceChildren();
    mount.append(h('div', { class: 'screen-enter stack', style: { gap: 18 } },
      backBar(navigate),
      h('div', { class: 'row-between' },
        h('h1', { style: { margin: 0, fontSize: '1.5rem' } }, icon('user', 24), ' One Mobile setup'),
        h('span', { class: 'badge good' }, 'Works offline'),
      ),
      saved ? h('div', { class: 'banner warn' }, icon('history', 18), h('div', { style: { flex: 1 } },
        h('b', { text: 'You have an unfinished game on this device.' }),
        h('div', { class: 'row', style: { marginTop: 8 } },
          h('a', { class: 'btn small primary', href: '#/game/vote-out-imposter/local/play' }, icon('play', 14), 'Resume it'),
          h('button', {
            class: 'btn small ghost', onclick: async () => {
              if (await confirmDialog('Discard the unfinished game?', { okLabel: 'Discard' })) {
                storage.clearLocalGame();
                schedule();
              }
            },
          }, 'Discard'),
        ))) : null,
      ...renderSetupSections({ state, schedule, audio }),
      summaryBar(),
    ));
  }

  function summaryBar() {
    const problems = setupProblems(state);
    const pool = poolInfo(state.config);
    const filled = state.roster.filter((p) => p.name.trim()).length;
    const canStart = problems.length === 0 && filled >= MIN_PLAYERS;
    return h('section', { class: 'card', style: { position: 'sticky', bottom: '70px', backdropFilter: 'blur(10px)' } },
      h('div', { class: 'row-between' },
        h('div', {},
          h('b', { text: `${filled} players` }),
          h('span', { class: 'muted small' }, ` · ${imposterSummary(state.config)} · ${state.config.rounds} round${state.config.rounds > 1 ? 's' : ''} · ${pool.usable} words`),
        ),
        h('button', {
          class: 'btn primary big', disabled: !canStart,
          onclick: () => startGame(state, navigate),
        }, icon('play', 20), 'Start game'),
      ),
      problems.length ? h('ul', { class: 'stack-sm', style: { margin: '10px 0 0', paddingLeft: 20 } },
        problems.map((p) => h('li', { class: 'field-error', text: p }))) : null,
    );
  }

  render();
}

function imposterSummary(cfg) {
  if (cfg.chaos === 'everyone') return 'Everyone is an imposter';
  if (cfg.chaos === 'none') return 'No imposter';
  if (cfg.chaos === 'random') return 'Random imposters';
  if (cfg.chaos === 'custom') return `${cfg.chaosCustomCount} imposters`;
  if (cfg.imposter.mode === 'random') return 'Random imposters';
  return `${cfg.imposter.value} imposter${cfg.imposter.value > 1 ? 's' : ''}`;
}

function backBar(navigate) {
  return h('div', { class: 'row' },
    h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 16), 'Back to the game'),
    h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, 'Back to app'),
  );
}

function startGame(state, navigate) {
  const players = state.roster
    .filter((p) => p.name.trim())
    .map((p, i) => ({ id: 'p' + (i + 1), name: p.name.trim() }));
  try {
    const game = createLocalGame({
      players,
      config: state.config,
      rng: createRng(),
      db: WORD_DB,
      now: Date.now(),
    });
    storage.saveLastSetup({ config: state.config, roster: players });
    storage.saveLocalGame(game);
    for (const p of players) storage.addRecentPlayer(p.name);
    audio.unlock();
    audio.play('gameStart');
    navigate('#/game/vote-out-imposter/local/play');
  } catch (e) {
    toast(e instanceof Error && isEngineError(e) ? e.message : 'Could not start the game. Check the settings.', 'bad');
  }
}

/* ================================================================== */
/* Play screen                                                          */
/* ================================================================== */

export function renderLocalPlay({ mount, navigate }) {
  focusMain();
  audio.unlock();

  const saved = storage.loadLocalGame();
  if (!saved) {
    mount.append(h('div', { class: 'screen-enter stack center', style: { paddingTop: '8vh' } },
      gameTitleArt(),
      h('h2', { text: 'No game in progress' }),
      h('p', { class: 'muted' }, 'There is no saved game on this device. Start a new one!'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => navigate('#/game/vote-out-imposter/local') }, icon('plus', 18), 'New game'),
        h('button', { class: 'btn', onclick: () => navigate('#/') }, 'Back to the game'),
      ),
    ));
    return () => {};
  }

  let state = saved.state;
  if (state.status === 'aborted') {
    storage.clearLocalGame();
    navigate('#/game/vote-out-imposter/local', { replace: true });
    return () => {};
  }
  if (state.status === 'finished') {
    // keep it: render the result screen so Play Again still works
  }

  const ctx = {
    // per-player handoff substates
    revealStep: 'pass', // pass | revealed
    voteStep: 'pass',   // pass | voting | locked
    myVote: null,
    guessStep: 'pass',  // pass | form
    skippedGuesses: new Set(),
    archived: false,    // game-result stats archived exactly once
    lastSpeakerId: null, // per-player speaking mode: turn-change detection
  };
  let prevPhase = null;
  let prevRev = null;
  let timerHandle = null;

  const persist = () => storage.saveLocalGame(state);

  function apply(mutator) {
    try {
      state = mutator();
      persist();
      render();
    } catch (e) {
      if (isEngineError(e)) {
        toast(e.message, 'bad');
        render();
      } else throw e;
    }
  }

  function render() {
    // audio transition cues
    if (prevPhase !== state.phase || prevRev !== state.rev) {
      fireTransitionAudio(prevPhase, state);
      prevPhase = state.phase;
      prevRev = state.rev;
    }

    mount.replaceChildren();
    const pub = toPublicState(state);
    const wrap = h('div', { class: 'screen-enter stack', style: { gap: 16 } });
    mount.append(wrap);
    try {
      switch (state.phase) {
        case 'role_reveal': renderRoleReveal(wrap, pub); break;
        case 'discussion': renderDiscussion(wrap, pub); break;
        case 'voting': renderVoting(wrap, pub); break;
        case 'vote_result': renderVoteResult(wrap, pub); break;
        case 'imposter_guess': renderGuess(wrap, pub); break;
        case 'round_result': renderRoundResult(wrap, pub); break;
        case 'game_result': renderGameResult(wrap, pub); break;
        default:
          wrap.append(h('div', { class: 'banner bad' }, icon('alert', 18), h('div', {}, h('b', { text: 'Unexpected state' }),
            h('div', { class: 'small', text: `phase: ${state.phase}` }))));
      }
    } catch (err) {
      wrap.append(h('div', { class: 'banner bad' }, icon('alert', 18), h('div', {},
        h('b', { text: 'Something went wrong rendering this screen.' }),
        h('div', { class: 'small', text: 'Your game is saved — refresh to recover.' }))));
      console.error(err);
    }

    wrap.append(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: 6 } },
      h('button', {
        class: 'btn tiny ghost', onclick: async () => {
          if (await confirmDialog('Abandon this game for all players? This cannot be undone.', { okLabel: 'Abandon game' })) {
            storage.clearLocalGame();
            navigate('#/');
          }
        },
      }, icon('doorOut', 13), 'Abandon game'),
    ));
  }

  /* ---------------- role reveal ---------------- */
  function renderRoleReveal(wrap, pub) {
    const acked = state.reveal.acked;
    const pending = state.players.filter((p) => !acked.includes(p.id));
    wrap.append(phaseHeader(pub));

    if (pending.length === 0) {
      // engine should have moved on; safety valve
      wrap.append(h('p', { class: 'muted center' }, 'All roles seen…'));
      return;
    }
    const current = pending[0];
    const priv = privateViewFor(state, current.id);
    const total = state.players.length;
    const index = state.players.findIndex((p) => p.id === current.id);
    wrap.append(progressDots({ total, done: acked.length, current: index }));

    if (ctx.revealStep === 'pass') {
      wrap.append(passDeviceCard({
        name: current.name,
        note: `Player ${index + 1} of ${total} — take the device when it is your turn.`,
        cta: `I'm ${current.name} — show my role`,
        warning: 'Make sure nobody else is looking at the screen before revealing.',
        onContinue: () => {
          audio.play('roleReveal');
          ctx.revealStep = 'revealed';
          render();
        },
      }));
    } else {
      wrap.append(roleCard({
        role: priv.role,
        word: priv.word,
        hint: priv.hint,
        chaosVariant: state.config.chaos,
        subtitle: `Only ${current.name} should be reading this.`,
      }));
      wrap.append(hidePassCard({
        fromName: current.name,
        toName: pending[1] ? pending[1].name : 'the group',
        doneAll: pending.length === 1,
        onContinue: () => {
          ctx.revealStep = 'pass';
          apply(() => acknowledgeRole(state, { playerId: current.id, now: Date.now() }));
        },
      }));
    }

    if (pending.length > 1) {
      wrap.append(h('div', { class: 'center' },
        h('button', {
          class: 'btn tiny ghost', onclick: async () => {
            if (await confirmDialog('Skip the remaining role reveals? Everyone else will not see their word.', { okLabel: 'Skip reveals' })) {
              apply(() => skipReveal(state, { now: Date.now() }));
            }
          },
        }, 'Skip remaining reveals'),
      ));
    }
    announce(`Role reveal: ${current.name} is up. ${acked.length} of ${total} have seen their role.`);
  }

  /* ---------------- discussion ---------------- */
  function renderDiscussion(wrap, pub) {
    const round = state.rounds[state.roundIndex];
    wrap.append(phaseHeader(pub));
    const head = h('div', { class: 'row-between' });
    const tp = timerPanel(pub, Date.now(), (left) => audio.tickIfUrgent(left));
    if (tp) head.append(tp);
    head.append(h('span', { class: 'badge accent' }, `Cycle ${(round?.cycles?.length ?? 0) + 1} of ${MAX_VOTE_CYCLES_PER_ROUND}`));
    wrap.append(head);

    if (pub.speaking) {
      wrap.append(speakingPanel(pub));
    } else {
      wrap.append(h('div', { class: 'card' },
        h('h2', { class: 'section-title' }, icon('chat', 20), ' Discuss!'),
        h('p', { class: 'muted small' },
          'Everyone talks about the secret word — without saying it. Innocents drop hints; the imposter improvises.'),
        rosterStrip(state.players, { eliminated: round?.eliminated ?? [] }),
      ));
    }

    wrap.append(h('button', {
      class: 'btn primary big', onclick: async () => {
        if (await confirmDialog('End the discussion and start the vote?', { okLabel: 'Start voting' })) {
          apply(() => endDiscussion(state, { now: Date.now() }));
        }
      },
    }, icon('vote', 20), 'Start the vote'));
    announce('Discussion phase. Talk about the word, then start the vote.');
  }

  /** Per-player speaking mode: whose turn it is, countdown, order, skip. */
  function speakingPanel(pub) {
    const sp = pub.speaking;
    const speaker = state.players.find((p) => p.id === sp.playerId);
    const name = speaker ? speaker.name : '—';

    // Turn-change feedback: the shared device buzzes so the table notices,
    // plus a distinct audio cue (the speaker holds everyone's attention).
    if (ctx.lastSpeakerId !== sp.playerId) {
      if (ctx.lastSpeakerId !== null) {
        vibrate(600);
        audio.play('speakerTurn');
      }
      ctx.lastSpeakerId = sp.playerId;
      announce(`Speaking turn: ${name}. ${Math.round((sp.endsAt - Date.now()) / 1000)} seconds.`);
    }

    const left = Math.max(0, (sp.endsAt - Date.now()) / 1000);
    const nextUp = sp.order.slice(sp.index + 1)
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter(Boolean);

    return h('div', { class: 'card speaking-card' },
      h('div', { class: 'row-between' },
        h('div', {},
          h('div', { class: 'small muted', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' } },
            `Speaker ${sp.index + 1} of ${sp.total}`),
          h('div', { class: 'speak-name', text: name }),
          h('p', { class: 'tiny muted', style: { margin: '2px 0 0' } },
            nextUp.length ? `Next: ${nextUp.join(' → ')}` : 'Last speaker — voting begins after this.'),
        ),
        timerRing({ secondsLeft: left, totalSeconds: sp.secPerPlayer, label: `Speaking time: ${formatClock(left)}` }),
      ),
      h('div', { class: 'row', style: { marginTop: 10 } },
        h('button', {
          class: 'btn small', onclick: () => { apply(() => nextSpeaker(state, { now: Date.now() })); },
        }, icon('arrowRight', 15), 'Done — next speaker'),
      ),
    );
  }

  /* ---------------- voting ---------------- */
  function renderVoting(wrap, pub) {
    const round = state.rounds[state.roundIndex];
    const votes = state.voting.votes;
    const pendingVoters = state.players.filter((p) => !round.eliminated.includes(p.id) && !votes[p.id]);
    wrap.append(phaseHeader(pub));

    const head = h('div', { class: 'row-between' });
    const tp = timerPanel(pub, Date.now(), (left) => audio.tickIfUrgent(left));
    if (tp) head.append(tp);
    head.append(h('span', { class: 'badge' }, `${Object.keys(votes).length} of ${state.players.length - round.eliminated.length} voted`));
    wrap.append(head);

    if (pendingVoters.length === 0) {
      wrap.append(h('div', { class: 'pass-card' }, icon('vote', 40), h('p', { class: 'pass-name', style: { fontSize: '1.2rem' }, text: 'Tallying the votes…' })));
      apply(() => endVoting(state, { now: Date.now() }));
      return;
    }
    const voter = pendingVoters[0];
    const candidates = state.players.filter((p) => p.id !== voter.id && !round.eliminated.includes(p.id));

    if (ctx.voteStep === 'pass') {
      wrap.append(passDeviceCard({
        name: voter.name,
        note: `${Object.keys(votes).length} of ${state.players.length - round.eliminated.length} votes cast. Pass the device privately.`,
        cta: `I'm ${voter.name} — vote now`,
        warning: 'Votes are private. Nobody sees the tally until everyone has voted.',
        onContinue: () => { ctx.voteStep = 'voting'; ctx.myVote = null; render(); },
      }));
      wrap.append(progressDots({
        total: state.players.filter((p) => !round.eliminated.includes(p.id)).length,
        done: Object.keys(votes).length,
        current: state.players.filter((p) => !round.eliminated.includes(p.id)).findIndex((p) => p.id === voter.id),
      }));
      announce(`Voting: pass the device to ${voter.name}.`);
      return;
    }

    if (ctx.voteStep === 'voting') {
      wrap.append(votingView({
        voterName: voter.name,
        candidates,
        myVote: ctx.myVote,
        hasVoted: false,
        locked: false,
        selfId: voter.id,
        eliminated: round.eliminated,
        note: `${voter.name}, tap a player to vote them out. You cannot vote for yourself.`,
        onSelect: (id) => { ctx.myVote = id; render(); },
        onConfirm: () => {
          apply(() => castVote(state, { playerId: voter.id, targetId: ctx.myVote, now: Date.now() }));
          audio.play('voteLock');
          ctx.voteStep = 'locked';
          ctx.myVote = null;
          render();
        },
      }));
      wrap.append(h('button', { class: 'btn tiny ghost', onclick: () => { ctx.voteStep = 'pass'; render(); } }, 'Back — pass device first'));
      return;
    }

    // locked
    wrap.append(hidePassCard({
      fromName: voter.name,
      toName: pendingVoters[1] ? pendingVoters[1].name : 'the group',
      doneAll: pendingVoters.length === 1,
      onContinue: () => { ctx.voteStep = 'pass'; render(); },
    }));
  }

  /* ---------------- vote result ---------------- */
  function renderVoteResult(wrap, pub) {
    wrap.append(phaseHeader(pub));
    wrap.append(voteResultView({
      voteResult: state.lastVoteResult,
      players: state.players,
      onContinue: () => {
        apply(() => advance(state, { now: Date.now(), rng: createRng(), db: WORD_DB }));
      },
      continueLabel: 'Continue',
      tieNote: 'Tied players face a single revote — only they can be eliminated this cycle.',
    }));
    const vr = state.lastVoteResult;
    announce(vr.outcome === 'eliminated'
      ? `${state.players.find((p) => p.id === vr.eliminatedId)?.name} was eliminated. They were ${vr.revealedRole}.`
      : vr.outcome === 'tie' ? 'Tie vote. There will be a revote.' : 'No votes were cast.');
  }

  /* ---------------- imposter guess ---------------- */
  function renderGuess(wrap, pub) {
    wrap.append(phaseHeader(pub));
    const round = state.rounds[state.roundIndex];
    const pending = state.guess.eligibleIds.filter((id) => !state.guess.guesses[id] && !ctx.skippedGuesses.has(id));

    if (pending.length === 0) {
      // every eligible imposter guessed or declined — resolve
      apply(() => endGuessing(state, { now: Date.now() }));
      return;
    }
    const currentId = pending[0];
    const current = state.players.find((p) => p.id === currentId);

    if (ctx.guessStep === 'pass') {
      wrap.append(passDeviceCard({
        name: current.name,
        note: `${current.name} was voted out — but they get ONE last guess at the secret word. A correct guess steals the win.`,
        cta: `I'm ${current.name} — my last guess`,
        warning: 'Make sure nobody else is looking — the guess is for the caught imposter only.',
        onContinue: () => { ctx.guessStep = 'form'; render(); },
      }));
      announce(`Imposter guess: pass the device to ${current.name}, the caught imposter.`);
      return;
    }

    wrap.append(guessView({
      eligible: true,
      submittedGuess: null,
      onSubmit: (input) => {
        const text = input.value.trim();
        if (!text) { toast('Type a guess first — or choose “No guess”.', 'bad'); return; }
        const before = state.phase;
        apply(() => submitGuess(state, { playerId: currentId, guess: text, now: Date.now() }));
        ctx.guessStep = 'pass';
        // correct guess ends the round immediately (round_result); wrong stays open
        if (state.phase === 'round_result') audio.play('guessCorrect');
        else audio.play('guessWrong');
        render();
      },
      onSkip: () => {
        ctx.skippedGuesses.add(currentId);
        ctx.guessStep = 'pass';
        render();
      },
      onEnd: null,
    }));
  }

  /* ---------------- round / game results ---------------- */
  function renderRoundResult(wrap, pub) {
    wrap.append(phaseHeader(pub));
    wrap.append(resultView({
      kind: 'round',
      lastRoundResult: state.lastRoundResult,
      session: state.session,
      players: state.players,
      onContinue: () => apply(() => advance(state, { now: Date.now(), rng: createRng(), db: WORD_DB })),
      continueLabel: pub.roundIndex + 1 >= state.config.rounds ? 'Finish game' : 'Next round',
    }));
  }

  function renderGameResult(wrap, pub) {
    wrap.append(phaseHeader(pub));
    wrap.append(resultView({
      kind: 'game',
      lastRoundResult: state.lastRoundResult,
      gameResult: state.gameResult,
      session: state.session,
      players: state.players,
      onContinue: null,
    }));
    wrap.append(h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', {
        class: 'btn primary big', onclick: () => {
          apply(() => playAgain(state, { now: Date.now(), rng: createRng(), db: WORD_DB }));
          storage.saveLocalGame(state);
          audio.play('gameStart');
        },
      }, icon('refresh', 18), 'Play Again (same players & settings)'),
      h('button', { class: 'btn big', onclick: () => { storage.clearLocalGame(); navigate('#/game/vote-out-imposter/local'); } }, icon('plus', 18), 'New game'),
      h('button', { class: 'btn ghost big', onclick: () => { storage.clearLocalGame(); navigate('#/'); } }, 'Back to the game'),
    ));
    if (state.status === 'finished' && !ctx.archived) {
      // archive exactly once: stats merged, saved game cleared
      ctx.archived = true;
      storage.clearLocalGame();
      storage.mergeLocalStats(state.session);
    }
  }

  /* ---------------- audio cues ---------------- */
  function fireTransitionAudio(from, to) {
    if (to.phase === 'voting') audio.play('voteStart');
    if (to.phase === 'imposter_guess') audio.play('guessStart');
    if (to.phase === 'vote_result') {
      const outcome = to.lastVoteResult?.outcome;
      if (outcome === 'eliminated') audio.play('eliminate');
    }
    if (to.phase === 'round_result') {
      const w = to.lastRoundResult?.winner;
      if (w === 'chaos_everyone' || w === 'chaos_none') audio.play('chaosReveal');
      else if (w === 'innocents' || w === 'imposters') audio.play('victory');
      else audio.play('roundEnd');
    }
    if (to.phase === 'game_result') audio.play('victory');
    // guess correctness is cued at submit time via render diffs — approximate
    if (to.phase === 'round_result' && to.lastRoundResult?.reason === 'guess') {
      audio.play(to.lastRoundResult.winner === 'imposters' ? 'guessCorrect' : 'guessWrong');
    }
  }

  /* ---------------- timer loop ---------------- */
  timerHandle = setInterval(() => {
    if (state.status !== 'active') return;
    const hadPhase = state.phase;
    const res = checkTimers(state, { now: Date.now() });
    if (res.changed) {
      state = res.state;
      persist();
      render();
    } else if (hadPhase === 'discussion' || hadPhase === 'voting') {
      // refresh just the timer ring in place
      const head = mount.querySelector('.row-between');
      const old = head?.querySelector('.timer-wrap');
      if (old) {
        const tp = timerPanel(toPublicState(state), Date.now(), (left) => audio.tickIfUrgent(left));
        if (tp) old.replaceWith(tp);
      }
      // per-player speaking mode: refresh the speaking card's ring too
      if (hadPhase === 'discussion' && state.speaking) {
        const sp = state.speaking;
        const speakRing = mount.querySelector('.speaking-card .timer-wrap');
        if (speakRing) {
          const left = Math.max(0, (sp.endsAt - Date.now()) / 1000);
          audio.tickIfUrgent(left);
          speakRing.replaceWith(timerRing({ secondsLeft: left, totalSeconds: sp.secPerPlayer, label: `Speaking time: ${formatClock(left)}` }));
        }
      }
    }
  }, 500);

  setLeaveGuard(async () => {
    if (state.status === 'active') {
      toast('Game saved — resume any time from Game Home.', 'info');
      return true;
    }
    return true;
  });

  render();
  announce('Game resumed. Pass the device only when prompted.');

  return () => {
    if (timerHandle) clearInterval(timerHandle);
    setLeaveGuard(null);
  };
}
