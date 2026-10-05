// Shared game-phase UI components. They render from the PUBLIC state shape
// (identical for local play and the online server) plus the local player's
// private view — so both modes stay visually consistent.

import { h, icon, timerRing, formatClock, initials, announce } from '../../app/ui.js';
import { innocentArt, imposterArt, chaosArt } from './art.js';

const PHASE_META = {
  room_lobby: { title: 'Lobby', icon: 'users' },
  role_reveal: { title: 'Role reveal', icon: 'eye' },
  discussion: { title: 'Discussion', icon: 'chat' },
  voting: { title: 'Voting', icon: 'vote' },
  vote_result: { title: 'Vote result', icon: 'vote' },
  imposter_guess: { title: 'Imposter guess', icon: 'target' },
  round_result: { title: 'Round result', icon: 'flag' },
  game_result: { title: 'Game over', icon: 'crown' },
};

export function phaseHeader(publicState, { roundInfo = true } = {}) {
  const meta = PHASE_META[publicState.phase] ?? { title: publicState.phase, icon: 'info' };
  const children = [h('span', { class: 'ph-title' }, icon(meta.icon, 20), meta.title)];
  if (roundInfo && publicState.roundIndex !== undefined) {
    children.push(h('span', { class: 'badge accent' }, `Round ${publicState.roundIndex + 1} / ${publicState.config.rounds}`));
  }
  if (publicState.voting?.isRevote) children.push(h('span', { class: 'badge warn' }, 'Revote'));
  return h('div', { class: 'phase-header' }, ...children);
}

export function timerPanel(publicState, nowMs, onTick) {
  const timers = publicState.timers || {};
  const key = publicState.phase === 'discussion' ? 'discussionEndsAt' : publicState.phase === 'voting' ? 'votingEndsAt' : null;
  if (!key || !timers[key]) return null;
  const total = publicState.phase === 'discussion'
    ? publicState.config.discussionTimerSec
    : publicState.config.votingTimerSec;
  const left = Math.max(0, (timers[key] - nowMs) / 1000);
  if (onTick) onTick(left);
  return timerRing({ secondsLeft: left, totalSeconds: total, label: `Time left: ${formatClock(left)}` });
}

/** The roster as chips — with optional eliminations and a highlight. */
export function rosterStrip(players, { eliminated = [], highlight = null, voteProgress = null } = {}) {
  return h('div', { class: 'row', style: { gap: 8 } },
    players.map((p) => {
      const out = eliminated.includes(p.id);
      return h('span', {
        class: 'chip' + (out ? ' offline-dim' : '') + (highlight === p.id ? ' selected' : ''),
        style: { cursor: 'default' },
        'aria-label': `${p.name}${out ? ' (eliminated)' : ''}`,
      },
        h('span', { class: 'avatar-sm' }, initials(p.name)),
        p.name,
        out ? h('span', { 'aria-hidden': 'true' }, '✕') : null,
        voteProgress && voteProgress[p.id] ? icon('check', 13) : null,
      );
    }),
  );
}

/** Big role card shown during private reveal (One Mobile) or online. */
export function roleCard({ role, word, hint, chaosVariant, subtitle }) {
  const isChaos = chaosVariant === 'everyone' || chaosVariant === 'none';
  const cls = isChaos ? 'chaos' : role === 'imposter' ? 'imposter' : 'innocent';
  const art = isChaos ? chaosArt() : role === 'imposter' ? imposterArt() : innocentArt();
  let body;
  if (chaosVariant === 'everyone') {
    body = h('div', {},
      h('div', { class: 'word-display', style: { borderColor: 'rgba(251,113,133,.5)', color: 'var(--bad)' } }, '???'),
      hint ? hintPill(hint, 'SHARED HINT — a related word') : null,
      h('p', { class: 'muted small' }, 'Nobody knows the word this round. Survive the chaos!'),
    );
  } else if (chaosVariant === 'none') {
    body = h('div', {},
      h('div', { class: 'word-display', text: word || '—' }),
      h('p', { class: 'muted small' }, 'Everyone received the same word — but there is no imposter. Who will spot the truth?'),
    );
  } else if (role === 'imposter') {
    body = h('div', {},
      h('p', { class: 'small', style: { marginTop: 10 } },
        h('b', { text: 'You do NOT know the word.' }), ' Blend in, fake it, and survive the vote.'),
      chaosVariant === 'no_hints'
        ? h('div', { class: 'hint-pill none', role: 'note' }, icon('eyeOff', 16), h('span', {}, 'No hints this round — you are completely on your own.'))
        : hint
          ? hintPill(hint, 'YOUR HINT — a related word')
          : null,
      h('p', { class: 'small muted' }, 'Listen carefully to the discussion — you may get a chance to steal the win by guessing the word.'),
    );
  } else {
    body = h('div', {},
      h('p', { class: 'small muted', style: { marginTop: 4 } }, 'The secret word is:'),
      h('div', { class: 'word-display confetti-word', text: word }),
    );
  }
  return h('div', { class: `role-card ${cls}` },
    h('div', { class: 'role-icon' }, art),
    h('div', { class: 'role-name', text: roleLabel(role, chaosVariant) }),
    subtitle ? h('p', { class: 'small muted', style: { margin: '2px 0 0' }, text: subtitle }) : null,
    body,
  );
}

/** The imposter's related-word hint, styled as a red mystery pill. */
function hintPill(hint, label) {
  return h('div', { class: 'hint-pill' },
    h('span', { class: 'hint-label' }, icon('sparkles', 14), label),
    h('div', { class: 'hint-word', text: hint }),
    h('span', { class: 'tiny muted', style: { display: 'block', marginTop: 6 } }, 'Think sideways — it points near the word, never at it.'),
  );
}

function roleLabel(role, chaosVariant) {
  if (chaosVariant === 'everyone') return 'IMPOSTER';
  if (chaosVariant === 'none') return 'INNOCENT';
  return role === 'imposter' ? 'IMPOSTER' : 'INNOCENT';
}

/** "Pass the device to X" card. */
export function passDeviceCard({ name, note, cta, onContinue, warning = null }) {
  return h('div', { class: 'pass-card' },
    h('p', { class: 'brand-line' }, icon('user', 14), 'PRIVATE REVEAL'),
    h('div', { class: 'pass-name', text: name }),
    h('p', { class: 'pass-note', text: note }),
    warning ? h('div', { class: 'banner warn', style: { marginBottom: 14, textAlign: 'left' } }, icon('eyeOff', 18),
      h('div', { class: 'small', text: warning })) : null,
    h('button', { class: 'btn primary big', onclick: onContinue }, icon('eye', 18), cta),
  );
}

/** Hidden-card state ("hide & pass"). */
export function hidePassCard({ fromName, toName, onContinue, doneAll = false }) {
  return h('div', { class: 'pass-card' },
    icon('lock', 44),
    h('p', { class: 'pass-name', style: { fontSize: '1.3rem' } }, doneAll ? 'All roles seen' : `Hide the card & pass to ${toName}`),
    h('p', { class: 'pass-note' }, doneAll
      ? 'Pass the device back to the group — the discussion is about to begin.'
      : `${fromName}'s role is now hidden. Make sure the screen is face down before passing.`),
    h('button', { class: 'btn big', onclick: onContinue }, icon(doneAll ? 'play' : 'arrowRight'), doneAll ? 'Start discussion' : 'I\'ve hidden it — pass on'),
  );
}

/** Voting UI — candidate grid with select + confirm (no live totals). */
export function votingView({
  voterName, candidates, myVote, hasVoted, onSelect, onConfirm, locked, note,
  selfId, eliminated = [], timerEl = null, onEndVoting = null,
}) {
  return h('div', { class: 'stack' },
    note ? h('div', { class: 'banner info' }, icon('info', 18), h('div', { class: 'small', text: note })) : null,
    timerEl,
    h('div', { class: 'candidate-grid', role: 'radiogroup', 'aria-label': `Vote for who to eliminate — ${voterName} is voting` },
      candidates.map((p) => {
        const selected = myVote === p.id;
        const disabled = locked || eliminated.includes(p.id);
        return h('button', {
          class: 'candidate' + (selected ? ' selected' : ''),
          role: 'radio', 'aria-checked': selected ? 'true' : 'false',
          dataset: { pid: p.id },
          disabled: disabled || undefined,
          onclick: () => { if (!locked) onSelect(p.id); },
        },
          h('span', { class: 'avatar' }, initials(p.name)),
          h('span', { text: p.name }),
          selected ? icon('check', 16) : null,
        );
      }),
    ),
    locked
      ? h('div', { class: 'banner good' }, icon('lock', 18), h('div', {}, h('b', { text: 'Vote locked in.' }), h('div', { class: 'small' }, 'Your vote stays hidden until everyone has voted.')))
      : h('div', { class: 'row' },
          h('button', { class: 'btn primary big', disabled: !myVote, onclick: onConfirm }, icon('vote', 18), 'Confirm vote'),
          onEndVoting ? h('button', { class: 'btn small ghost', onclick: onEndVoting }, 'Close voting (abstain rest)') : null,
        ),
  );
}

/** Vote result: tallies revealed only after voting closes. */
export function voteResultView({ voteResult, players, onContinue, continueLabel = 'Continue', tieNote }) {
  const vr = voteResult;
  if (!vr) return null;
  const maxVotes = Math.max(1, ...Object.values(vr.tallies || {}));
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '—';
  const sortedIds = Object.keys(vr.tallies || {}).sort((a, b) => vr.tallies[b] - vr.tallies[a]);

  let outcome;
  if (vr.outcome === 'eliminated') {
    outcome = h('div', { class: 'result-banner imposters' },
      h('div', { class: 'r-title' }, `${nameOf(vr.eliminatedId)} was voted out`),
      vr.revealedRole === 'imposter'
        ? h('p', { style: { margin: '6px 0 0' } }, icon('mask', 18), h('b', { class: '', text: ' They were an IMPOSTER!' }))
        : h('p', { style: { margin: '6px 0 0' } }, icon('shield', 18), h('span', { text: ' They were innocent.' })),
    );
  } else if (vr.outcome === 'tie') {
    outcome = h('div', { class: 'result-banner draw' },
      h('div', { class: 'r-title', text: 'It’s a tie!' }),
      h('p', { class: 'muted', style: { margin: '6px 0 0' }, text: tieNote || `Tied: ${vr.tieIds.map(nameOf).join(', ')} — a single revote among them decides.` }),
    );
  } else {
    outcome = h('div', { class: 'result-banner draw' },
      h('div', { class: 'r-title', text: 'No votes were cast' }),
      h('p', { class: 'muted', style: { margin: '6px 0 0' }, text: 'Nobody was eliminated. On to the next cycle.' }),
    );
  }

  return h('div', { class: 'stack' },
    outcome,
    h('div', { class: 'card tight' },
      h('div', { class: 'small muted', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 } },
        `Final tally — ${vr.totalVotes} vote${vr.totalVotes === 1 ? '' : 's'}`),
      sortedIds.map((id) => h('div', { class: 'tally-row' },
        h('span', { class: 'tally-name' }, nameOf(id)),
        h('div', { class: 'tally-track' }, h('div', {
          class: 'tally-fill' + (vr.tallies[id] === maxVotes && maxVotes > 0 ? ' top' : ''),
          style: { width: `${(vr.tallies[id] / maxVotes) * 100}%` },
        })),
        h('span', { class: 'tally-count', text: String(vr.tallies[id]) }),
      )),
      vr.abstained > 0 ? h('p', { class: 'tiny muted', style: { marginTop: 6 } }, `${vr.abstained} abstention${vr.abstained === 1 ? '' : 's'} (not counted as votes)`) : null,
    ),
    onContinue ? h('button', { class: 'btn primary big', onclick: onContinue }, icon('arrowRight'), continueLabel) : null,
  );
}

/** Guess phase UI. */
export function guessView({ eligible, submittedGuess, onSubmit, onSkip, onEnd, subtitle }) {
  if (eligible && !submittedGuess) {
    const input = h('input', { class: 'input', id: 'guess-input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Type the secret word…' });
    const submit = () => onSubmit(input);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return h('div', { class: 'stack' },
      h('div', { class: 'banner warn' }, icon('target', 18), h('div', { class: 'small' },
        h('b', { text: 'You were voted out — but you get one shot.' }),
        h('div', { text: 'Guess the secret word correctly and the imposters steal the win instantly.' }))),
      h('div', { class: 'card' },
        h('label', { class: 'field-label', for: 'guess-input' }, 'Your guess'),
        input,
        h('div', { class: 'row', style: { marginTop: 12 } },
          h('button', { class: 'btn primary', onclick: submit }, icon('send', 18), 'Submit guess'),
          h('button', { class: 'btn ghost', onclick: onSkip }, 'No guess'),
        ),
      ),
      h('p', { class: 'small muted center' }, 'Only the caught imposter gets this chance — everyone else just waits.'),
    );
  }
  return h('div', { class: 'stack' },
    h('div', { class: 'pass-card' },
      icon('mask', 44),
      h('p', { class: 'pass-name', style: { fontSize: '1.25rem' }, text: subtitle || 'The caught imposter gets one last guess…' }),
      h('p', { class: 'pass-note' }, submittedGuess ? 'Your guess has been submitted. Waiting for the outcome…' : 'Waiting for the caught imposter’s decision…'),
      onEnd ? h('button', { class: 'btn small', onclick: onEnd }, 'Close guessing') : null,
    ),
  );
}

/** Round / game result views. */
export function resultView({ kind, lastRoundResult, gameResult, session, players, onContinue, continueLabel, showScores = true }) {
  const rr = lastRoundResult;
  if (!rr) return null;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '—';

  const winnerMeta = {
    innocents: { cls: 'innocents', title: 'INNOCENTS WIN', ic: 'shield', why: 'All imposters were eliminated.' },
    imposters: { cls: 'imposters', title: 'IMPOSTERS WIN', ic: 'mask', why: 'The imposters reached parity with the innocents.' },
    draw: { cls: 'draw', title: 'DRAW', ic: 'flag', why: 'The voting could not decide anything this round.' },
    chaos_everyone: { cls: 'chaos', title: 'EVERYONE WAS AN IMPOSTER', ic: 'zap', why: 'The last players standing share the glory.' },
    chaos_none: { cls: 'chaos', title: 'NO IMPOSTER EXISTED', ic: 'shield', why: 'A game of pure paranoia — nobody was the imposter.' },
  };
  const meta = winnerMeta[rr.winner] ?? winnerMeta.draw;
  if (rr.winner === 'imposters' && rr.reason === 'guess') meta.why = 'An imposter guessed the secret word!';
  if (rr.winner === 'innocents') meta.why = rr.reason === 'cycle_limit' ? 'Round limit reached — no more eliminations possible.' : 'All imposters were eliminated.';

  const roleChips = Object.entries(rr.roles || {}).map(([id, role]) => h('span', {
    class: 'chip',
    style: { cursor: 'default', borderColor: role === 'imposter' ? 'rgba(251,113,133,.5)' : 'rgba(52,211,153,.5)' },
  },
    h('span', { class: 'avatar-sm' }, initials(nameOf(id))),
    nameOf(id),
    role === 'imposter' ? h('span', { class: 'badge bad', text: 'Imposter' }) : h('span', { class: 'badge good', text: 'Innocent' }),
  ));

  return h('div', { class: 'stack' },
    h('div', { class: `result-banner ${meta.cls}` },
      kind === 'game' ? h('p', { class: 'brand-line' }, icon('crown', 14), 'FINAL RESULT') : null,
      h('div', { class: 'r-title' }, icon(meta.ic, 26), ' ', meta.title),
      h('p', { class: 'muted', style: { margin: '6px 0 0' }, text: meta.why }),
    ),
    h('div', { class: 'card tight' },
      h('div', { class: 'small muted', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 } }, 'The word was'),
      h('div', { class: 'word-display', style: { margin: '0 0 10px' }, text: rr.word?.label ?? '—' }),
      rr.hint ? h('p', { class: 'small', style: { margin: '0 0 10px' } },
        h('span', { class: 'muted' }, 'The imposter’s hint was '), h('b', { class: 'hint-reveal', text: rr.hint }), h('span', { class: 'muted' }, '.')) : null,
      h('div', { class: 'chip-grid', style: { marginBottom: 4 } }, roleChips),
      rr.eliminated?.length ? h('p', { class: 'small muted', style: { marginTop: 10 } },
        'Eliminated this round: ', rr.eliminated.map(nameOf).join(', ')) : null,
      rr.guesses?.length ? h('p', { class: 'small muted' },
        'Guesses: ', rr.guesses.map((g) => `${nameOf(g.playerId)} guessed “${g.text}” (${g.correct ? 'correct' : 'wrong'})`).join(' · ')) : null,
    ),
    showScores && session ? scoreTable(session) : null,
    onContinue ? h('button', { class: 'btn primary big', onclick: onContinue }, icon(kind === 'game' ? 'refresh' : 'arrowRight'), continueLabel) : null,
  );
}

export function scoreTable(session) {
  if (!session || !session.participation) return null;
  const rows = Object.entries(session.participation)
    .map(([playerId, p]) => ({ playerId, ...p }));
  if (!rows.length) return null;
  return h('div', { class: 'card tight' },
    h('div', { class: 'small muted', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 } }, 'Session score'),
    h('table', { class: 'mini-table' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Player' }), h('th', { text: 'Rounds' }), h('th', { text: 'Imposter wins' }), h('th', { text: 'Innocent wins' }), h('th', { text: 'Eliminated' }),
      )),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('td', { text: r.name ?? '—' }),
        h('td', { text: String(r.roundsPlayed ?? 0) }),
        h('td', { text: String(r.imposterWins ?? 0) }),
        h('td', { text: String(r.innocentWins ?? 0) }),
        h('td', { text: String(r.timesEliminated ?? 0) }),
      ))),
    ),
  );
}

export function progressDots({ total, done, current }) {
  return h('div', { class: 'progress-dots', 'aria-label': `Step ${current + 1} of ${total}` },
    Array.from({ length: total }, (_, i) => h('span', {
      class: 'dot' + (i === current ? ' on' : i < current ? ' done' : ''),
    })));
}

export { announce };
