# Vote Out Imposter — Game Rules

A social deduction game for **3–20 players**. Best with 4–10.

## Overview

At the start of each round every player privately receives a role:

- **Innocents** see the **secret word** for the round.
- **Imposters** see nothing — but they each secretly receive a
  **related-word hint** (see below) to spark ideas. They must blend in and
  pretend.

Innocents win by voting out every imposter. Imposters win by surviving until
they equal the number of remaining innocents, or by guessing the secret word
when caught.

## Round flow

1. **Role reveal** — players privately learn their role (on one shared device,
   or on their own device). Nobody sees anyone else's role.
2. **Discussion** — players describe the word *without saying it*. Innocents
   drop genuine hints; imposters improvise. Optional shared table timer, or
   **per-player speaking mode** (below).
3. **Private voting** — every active player votes to eliminate one player.
   Votes are cast in private; **no live totals** are shown while voting is
   open. If a voting timer expires, players who have not voted **abstain**
   (an abstention is never a random vote and never counts against anyone).
4. **Elimination** — the most-voted player is eliminated and their role is
   revealed to everyone. Eliminated players keep their identity and appear in
   the results, but cannot vote or be voted for. Win conditions are
   re-checked after every elimination.
5. **Imposter guess** *(optional)* — the imposter who was **just voted out**
   gets **one private last-chance guess** at the secret word. A correct guess
   makes the imposters win instantly — even if the guesser was the last
   imposter standing (the innocent win is deferred until the guess resolves).
   Surviving imposters do not guess; only the caught one does. A wrong or
   declined guess settles the outcome normally (last imposter out → innocents
   win). Guesses are never shown to other players during the phase.
6. **Next cycle** — repeat discussion → voting until the round ends.

## Ties and deadlocks

- **Tie:** the tied players and the exact vote counts are revealed, then a
  **single revote** happens in which only the tied players can be eliminated.
- **Second tie:** **no elimination** that cycle — play continues with a fresh
  discussion.
- **No votes at all:** no elimination.
- After **5 voting cycles** in one round without a winner, the round ends in a
  draw.

## Win conditions

| Winner | Condition |
| --- | --- |
| **Innocents** | every imposter has been eliminated |
| **Imposters** | active imposters ≥ active innocents (parity) — checked after every elimination |
| **Imposters** | the caught imposter guesses the word correctly in their last-chance phase |
| Draw | 5 cycles pass with no resolution |

Chaos variants replace these (below).

## Rounds and statistics

A match is 1–20 rounds (choose 1, 3, 5 or a custom count). Each round deals
**fresh roles and a new word**; eliminations reset between rounds. The session
tracks cumulative statistics: games and rounds played, innocent/imposter wins,
chaos outcomes, eliminations per player, correct/incorrect guesses,
participation and a round-by-round log (word, roles, outcome).

**Play Again** after a match preserves the exact roster, order and settings,
with brand-new role assignments and words.

## Per-player speaking mode (talking stick)

The host can replace the shared discussion timer with a **speaking rotation**:
each active player gets **X seconds (5–120)** in roster order, one at a time.

- The current speaker, their countdown and the upcoming order are shown on
  every screen (One Mobile: the shared device; online: every player's phone).
- **When a player's turn begins, their phone vibrates for ~1.5 seconds**
  (online mode; One Mobile: the shared device buzzes on every turn change).
  Honest limitation: iPhone browsers do not support the Vibration API — there
  the turn is signalled by the pulsing green YOUR TURN card and a sound cue.
- When the last speaker finishes, **voting starts automatically**.
- The host (or anyone, in One Mobile) can skip the current speaker, or start
  the vote early at any moment.
- Eliminated players are skipped; each new voting cycle starts a fresh
  rotation of the surviving players.

## Imposter hints

Every imposter privately receives a **related-word hint** — a single word
associated with the secret word (like *water* for *sponge*, or *steam* for
*idli*). The rules for hints:

- Hints are always **related words** — never letter clues. No "starts with S",
  no "found in the kitchen", no "rhymes with…".
- Hints are chosen to be **far/loose associations**: enough to spark an idea,
  never enough to give the word away. A similarity guard rejects hints that
  equal, contain, or share a prefix/token with the secret word.
- Words with a hand-curated hint pair use it; every other word falls back to a
  seeded pick from the same category (977 curated pairs cover the most
  evocative words — every profession in People, the everyday tech words in
  Special, and more; the fallback covers all 7,493).
- Only imposters see the hint, only during their own private reveal. It is
  revealed to everyone in the round result (after the round is over).
- In the *Everyone Is Imposter* chaos variant, all players are imposters, so
  all players share the same hint. In *No Hints*, nobody gets one.

## Imposter counts

Standard options: **1, 2, 3, 4, Custom (any valid number), Random** (1–4,
resolved when the round starts). Validation rules: at least 1 imposter, at
least 1 innocent, always fewer imposters than players. Invalid choices are
rejected — never silently replaced.

## Chaos Mode — the complete list

Chaos Mode has **exactly five** variants. There are no others (no hidden
toggles, no extra options):

1. **Everyone Is Imposter** — nobody receives the word; everyone gets the
   same shared hint. No team can win; the last players standing win at the
   end (round limit or final vote). The word is revealed only at the round
   result.
2. **No Imposter** — every player is innocent and everyone receives the same
   word. A paranoia experiment with its own dedicated result screen.
3. **Random Imposter Count** — a fresh imposter count every **3–5 rounds**: one
   rolled count holds for a whole block of rounds (nobody knows how many
   imposters are active OR when it will change), then the dice roll again —
   big chaotic swings, not per-round churn.
4. **Custom Imposter Count** — you choose the exact number (same validation
   rules as above).
5. **No Hints** — standard imposter counts, but imposters receive **no hint
   at all**. The purest form of the game — and the most brutal.

Imposter guessing is disabled in *Everyone Is Imposter* and *No Imposter*.

## Words

- **7,493 unique words** across 28 categories (227–402 per category), all
  built in and offline.
- Difficulty per game: easy / normal / hard / random-per-round.
- Categories: pick any set, all, or randomize. Words never repeat until the
  chosen pool is exhausted, then the pool resets (with a notice).
- The game validates the chosen category + difficulty pool before starting —
  an empty pool is an explicit error, never a silent fallback.

## One Mobile (pass-and-play) rules

- One device is passed around; each player takes it alone, taps to reveal
  **their own** role card, hides it, and passes on.
- Only one role is ever visible; the previous card is gone before the next
  player looks. Voting works the same way — each player votes privately.
- The device shows "make sure nobody else is looking" reminders at every
  private step.
- Refresh recovery: the game is saved locally. On return you get a neutral
  screen and can Resume, Restart or Abandon.
- **Honest privacy note:** this protects against casual shoulder-surfing, not
  against someone who deliberately inspects the device's saved browser data.

## Multiple Devices (online) rules

- The host creates a room; players join via invite link or a 6-character code.
- The server is the single authority for roles, words, timers, votes, ties,
  eliminations, guesses and results. Client timers are only displays.
- Roles and votes are delivered privately per player and never broadcast.
- If the host disconnects, host rights transfer automatically to the
  earliest-joined connected player after a grace period.
- Refresh on a new device? Your saved session token restores your seat —
  as long as it is the same browser profile that joined originally.
