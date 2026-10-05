// Full rules page.

import { h, icon } from '../../app/ui.js';

export function renderRulesPage({ mount, navigate }) {
  mount.append(h('div', { class: 'screen-enter stack', style: { gap: 18, maxWidth: 820, margin: '0 auto' } },
    h('div', { class: 'row' },
      h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 16), 'Back to the game'),
    ),
    h('h1', { style: { margin: 0 } }, icon('book', 26), ' How to play'),
    h('p', { class: 'muted' },
      'Vote Out Imposter is a social deduction game for ', h('b', { text: '3–20 players' }),
      '. Most players are innocents who share a secret word. A few imposters don\'t know it — and must blend in.'),

    section('gamepad', 'Goal', [
      h('li', null, h('b', { text: 'Innocents win' }), ' when every imposter has been voted out.'),
      h('li', null, h('b', { text: 'Imposters win' }), ' when they equal the number of active innocents (parity) — or when any imposter correctly guesses the secret word after being caught.'),
    ]),
    section('sparkles', 'Imposter hints', [
      h('li', null, 'Every imposter privately receives a ', h('b', { text: 'related-word hint' }), ' — a word associated with the secret word (like ', h('i', { text: 'water' }), ' for ', h('i', { text: 'sponge' }), '), chosen to spark an idea without giving the answer away.'),
      h('li', null, 'Hints are never letter clues — no "starts with S", no "found in the kitchen". Always a related word.'),
      h('li', null, 'Innocents never see hints. The hint is revealed to everyone only after the round ends.'),
    ]),
    section('eye', 'Round flow', [
      h('li', null, h('b', { text: '1. Role reveal — ' }), 'each player privately sees their role. Innocents see the secret word; imposters see nothing but their related-word hint.'),
      h('li', null, h('b', { text: '2. Discussion — ' }), 'players describe the word WITHOUT saying it. Watch for who is guessing. Optional per-player speaking mode: everyone gets X seconds in turn and the current speaker\u2019s phone vibrates.'),
      h('li', null, h('b', { text: '3. Private voting — ' }), 'everyone votes to eliminate one player. No live totals — nothing is shown until all votes are in (or the timer runs out; not voting = abstaining, never a random vote).'),
      h('li', null, h('b', { text: '4. Elimination — ' }), 'the most-voted player is out and their role is revealed. Win conditions are re-checked.'),
      h('li', null, h('b', { text: '5. Imposter guess — ' }), 'if enabled, the imposter who was just voted out gets one private last-chance guess at the word — a correct guess steals the win instantly, even if they were the last imposter.'),
      h('li', null, h('b', { text: '6. Next cycle — ' }), 'repeat discussion → voting until a win condition ends the round.'),
    ]),
    section('vote', 'Ties & deadlocks', [
      h('li', null, 'A tie reveals the tied players and their vote counts, then ', h('b', { text: 'one revote' }), ' happens among only the tied players.'),
      h('li', null, 'A second tie means ', h('b', { text: 'no elimination' }), ' that cycle — play continues.'),
      h('li', null, 'After 5 voting cycles in one round with no winner, the round ends in a draw.'),
    ]),
    section('zap', 'Chaos Mode (exactly five variants)', [
      h('li', null, h('b', { text: 'Everyone Is Imposter' }), ' — nobody knows the word; everyone gets the shared hint. No innocent victory; survivors win at the end.'),
      h('li', null, h('b', { text: 'No Imposter' }), ' — everyone shares the word. A pure paranoia experiment with its own result screen.'),
      h('li', null, h('b', { text: 'Random Imposter Count' }), ' — a fresh imposter count every 3–5 rounds: one count holds for a block of rounds, then everything changes at once.'),
      h('li', null, h('b', { text: 'Custom Imposter Count' }), ' — you pick the exact number (validated: at least 1 imposter and 1 innocent).'),
      h('li', null, h('b', { text: 'No Hints' }), ' — standard imposter counts, but imposters receive ', h('b', { text: 'no hint at all' }), '. Brutal.'),
      h('li', { class: 'muted' }, 'That is the complete list — there are no other hidden variants.'),
    ]),
    section('word', 'Words', [
      h('li', null, '7,493 built-in words across 28 categories (227–402 per category), offline. Choose difficulty (easy / normal / hard / random per round) and any set of categories.'),
      h('li', null, 'Words never repeat until the chosen pool is used up, then the pool recycles.'),
    ]),
    section('user', 'One Mobile (pass-and-play)', [
      h('li', null, 'One device, passed around. Each player takes the device, taps to reveal their own card, hides it, and passes on.'),
      h('li', null, 'Only one role is ever on screen; the previous player\'s card is gone before the next person looks.'),
      h('li', null, 'Voting is the same handoff — each player votes privately on the shared device.'),
      h('li', null, 'Works with no internet at all. Refresh mid-game? The state is saved: resume, restart or abandon from the game home screen.'),
      h('li', { class: 'muted' }, 'Honest privacy note: this protects against casual peeking, not against someone who inspects the device\'s saved browser data.'),
    ]),
    section('wifi', 'Multiple Devices (online)', [
      h('li', null, 'The host creates a room and shares an invite link or the 6-character code.'),
      h('li', null, 'All game rules run on the server: roles, words, timers, votes, ties, eliminations, guesses, results. Your device only renders.'),
      h('li', null, 'Roles and votes are delivered privately — the server never broadcasts them.'),
      h('li', null, 'Lost connection? Reconnect automatically; refresh on a new device? Your saved session token restores your seat.'),
    ]),
  ));
}

function section(ic, title, items) {
  return h('section', { class: 'card' },
    h('h2', { class: 'section-title' }, icon(ic, 20), ' ' + title),
    h('ul', { style: { margin: 0, paddingLeft: 22, lineHeight: 1.9 } }, items),
  );
}
