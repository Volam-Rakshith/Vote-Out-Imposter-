# Vote Out Imposter — Developer Guide

Architecture, conventions and how to extend the game safely.

## Core principle: one rules engine

`engine/` is a **pure, deterministic, dependency-free** rules module used
identically by three environments:

| Consumer | Import |
| --- | --- |
| Browser (One Mobile) | `import … from './game/engine/index.js'` |
| Node test suite | `import … from '../engine/index.js'` |
| Deno edge function (online authority) | `import … from '../../../engine/index.js'` |

There is no duplicated logic anywhere: the same code that runs the local game
decides the online game on the server.

**Engine rules of engagement**

- Every exported mutation takes the state, **clones it**, validates, mutates
  the clone and returns it. Inputs are never mutated (tests enforce this).
- Invalid input throws `EngineError` with a stable `code` and a user-safe
  `message` — no internals leak.
- All randomness flows through an injectable `rng` (`createRng()` uses
  `crypto.getRandomValues` with unbiased rejection sampling; tests seed it).
- Time is always an injected `now` (ms). No hidden `Date.now()` in transitions
  — `checkTimers(state, { now })` is the only deadline evaluator.
- Phase transitions are explicit: each action requires its exact phase and
  throws `WRONG_PHASE` otherwise. See `engine/state.js`.

## State shape (v1)

```
GameState {
  schema: 1, gameId, mode: 'local'|'online', status: 'active'|'finished'|'aborted',
  createdAt, config: GameConfig, players: [{id, name}], hostId, matchNumber,
  roundIndex, rounds: Round[], usedWordIds, session: Stats,
  phase, reveal: {acked[]}, timers: {discussionEndsAt?, votingEndsAt?},
  voting: {cycle, isRevote, candidates[], votes{}, voted[]},
  lastVoteResult, guess: {eligibleIds[], guesses{}, resolved, correctBy} | null,
  lastRoundResult, gameResult, rev
}
```

Public/private projection lives in `engine/privacy.js`:

- `toPublicState(state)` — everything safe to broadcast. Never contains the
  current round's word, the role map, individual votes or `usedWordIds`.
- `privateViewFor(state, playerId)` — one player's own slice: their role, the
  word **only if they are innocent**, their vote/guess status.

Online security tests assert on the JSON of these projections — keep them
green when touching privacy code.

## Front-end

- **No build step.** Plain ES modules; the browser loads `app/main.js` from
  `index.html`. Keep it that way — it is a feature (offline, Pages-subpath
  hosting, zero toolchain).
- **Hash routing** (`app/router.js`): routes like `#/game/vote-out-imposter/local`.
  Handlers get `{ mount, params, query, navigate }` and may return a cleanup
  function (called on route change — use it to kill timers/pollers).
- **DOM building** (`app/ui.js` `h()`): user-provided text is inserted as text
  nodes only. Never use `innerHTML` with dynamic strings (XSS).
- **A11y expectations:** semantic buttons/labels, `aria-live` announcements
  via `announce()`, visible focus rings (CSS), no color-only information,
  reduced-motion honored globally in CSS.
- **Audio** (`game/audio/`): procedural WebAudio only. Music/SFX have
  independent enabled+volume settings persisted via storage. Nothing
  sound-only.

## Storage (`game/local/storage.js`)

Versioned keys (`voi.*.v1`) in `localStorage`, all read defensively: corrupt
JSON, wrong types or out-of-range values fall back to safe defaults and never
throw. A failing/quota-full backend degrades to no-ops. Online room state is
**never** mirrored locally — only nonprivileged session tokens for recovery.

## Online backend (`supabase/functions/game/`)

- `core.js` — environment-agnostic authority: room lifecycle, membership,
  tokens (SHA-256 hashed), presence, host transfer, timers, rate limiting,
  optimistic concurrency (`rev`), and a strict allow-list of actions. It is
  imported **directly by the Node test suite** with an in-memory DB adapter —
  the online rules are fully integration-tested offline.
- `index.ts` — thin Deno HTTP layer (CORS, body-size limit, error mapping).
- `db-postgres.js` — Supabase service-role adapter (`voi_rooms` rows,
  `rev`-guarded updates).
- `realtime-broadcast.js` — best-effort push ("sync now"); polling is always
  the correctness fallback.

Response contract: `{ ok: true, roomCode, publicState, private, serverNow }`
or `{ ok: false, error: { code, message } }` with a meaningful HTTP status.

### Adding a new action

1. Add validation + engine call in `core.js` (`HOST_ONLY_ACTIONS` or
   `SELF_ACTIONS`).
2. Expose it in the client (`game/online/controller.js`).
3. Add tests in `tests/online-core.test.js` — including the "must be
   rejected" cases (wrong phase, non-host, bad token).

## Words (`engine/words-data.js`)

`RAW_WORDS` maps 28 categories → `{easy, normal, hard}` string arrays.
Cross-category duplicates merge into one entry with multiple category tags; a
word appearing at two difficulties in *different* categories is a validation
error by design (pick one). `npm run validate:words` prints the full report;
the builder (`buildWordDatabase`) enforces normalization + uniqueness.

## Testing

`npm test` runs `node --test tests/` — see [testing.md](testing.md) for the
full map. Honesty rule: **never** mark an external-service scenario verified
without actually running it against that service.

## Extending

- **New word category:** add to `RAW_WORDS` or an expansion pack
  (`words-data-extra-1.js` / `words-data-extra-2.js`, merged via
  `mergeWordData`), add a label in `CATEGORY_LABELS`, run
  `npm run validate:words`. Nothing else to touch.
- **New curated hint:** add a `'word id': 'related word'` pair to
  `engine/hints-data.js` — the key must be a normalized id that exists in the
  merged word database (tests/hints.test.js enforces this), and the hint must
  be a related word that passes the similarity guard (never a letter clue).
- **New phase:** extend `PHASE`, implement transitions in `state.js` with
  explicit guards, add a public/private projection, add a screen in both
  controllers, add transitions tests.
- **New Chaos variant:** you must not. The specification forbids variants
  beyond the five shipped ones (Everyone Is Imposter, No Imposter, Random
  Count, Custom Count, No Hints — a source-scan test enforces the exact list).
