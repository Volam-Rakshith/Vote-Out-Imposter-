# Testing Guide

The complete test map, how to run everything, and what is (and is not)
verified. **Honesty rule:** nothing is reported as verified unless it was
actually executed and observed.

## Commands

```bash
npm test              # everything (node --test tests/)
npm run test:engine   # engine + words + storage + audio + local e2e
npm run test:online   # online authority integration tests
npm run validate:words
```

Environment used for the recorded results: **Node v20.20.2**, npm 10.8.2,
Linux x64. No other tooling.

## Suite map

| File | Covers |
| --- | --- |
| `tests/helpers.js` | seeded RNG (mulberry32), roster builders, shared fixtures — not a test file |
| `tests/config-validation.test.js` | names (empty/whitespace/length/dupes/Unicode), rosters 3–20, imposter options (1/2/3/4/custom/random), **all five chaos variants + the forbidden-variant source scan (exact list)**, rounds 1–20, timer ranges (table/voting/**per-player speaking**), category/difficulty validation, **word-pool emptiness (synthetic empty-pool fixture)** |
| `tests/roles.test.js` | imposter-count resolution per mode incl. chaos, role-assignment invariants (one role each, exact counts, seed-independence, no roster-order assignment, every player becomes imposter over trials), Play Again freshness, **Random-Chaos 3–5-round windows** (unit + full-game block traversal, count stability inside a window, boundary re-rolls, window never leaks to the public state, Play Again resets the window) |
| `tests/words.test.js` | ≥600 unique words (7,493 shipped), 28 categories ≥30 each, unique normalized ids, no placeholders, builder rejections (duplicate/conflict), selection honours filters exactly, no-repeat-until-exhaustion + recycle, typed `NO_ELIGIBLE_WORDS`, random category/difficulty resolution |
| `tests/hints.test.js` | curated hint dataset integrity (every key a real normalized word id, no letter-clue phrasing, similarity guard on every pair), `selectHint` covers **every word in the database** (curated or same-category fallback), fallback category correctness, seed determinism, imposter/innocent delivery split, **hint never leaks into the public state during play**, post-round reveal, No-Hints chaos suppression, zero/everyone-imposter hint behaviour |
| `tests/voting.test.js` | self/invalid-target/duplicate/unknown-voter/eliminated rejections, deadline enforcement (server clock, grace), tie → single revote among tied only, second tie → no elimination, abstentions don't count, no-votes outcome, unique plurality + role reveal, cycle limit → draw |
| `tests/win-conditions.test.js` | innocents win on all-imposters-out, parity (incl. outranking the guess phase), multi-imposter continuation, **caught-imposter last-chance guess** (correct guess steals the win even as the last imposter; wrong/declined guess settles the innocent win; surviving imposters are never eligible), guess correctness (case/whitespace-insensitive), guess validation, substring guesses don't match, chaos result states per variant, multi-round fresh roles/words/elimination scoping, cumulative stats, Play Again exact-config preservation, authoritative timers incl. idempotency |
| `tests/transitions.test.js` | every action rejected in wrong phases, lobby locked after start, startGame player minimum, abort terminality, JSON round-trip continuity, **per-player speaking mode** (rotation setup, expiry advance, auto-vote after the last speaker, skip action, early-vote cleanup, eliminated-player exclusion, refresh recovery) |
| `tests/local-e2e.test.js` | the §24.4 One Mobile flow: private step-by-step reveal, innocents-see-word/imposter-doesn't, duplicate vote rejection, tie+revote, elimination+reveal, caught-imposter guess handoff eligibility, multi-round, Play Again, refresh recovery (serialization), all-timers-off mode, public-state leak scan, 20-player scale |
| `tests/storage.test.js` | versioned prefs round-trip, corruption/missing/out-of-range fallbacks, recent players (dedupe/case/bounds/remove/clear), One Mobile recovery save/load validation, stats merge, session tokens, hostile (throwing) and absent backends |
| `tests/online-core.test.js` | §24.5/§24.6 against the REAL authority core with an in-memory DB: room lifecycle, joins (dupes/rate limit/full/running-game), token auth, **host-only enforcement**, names/settings locked in-game, **public-state leak scans (word/roles/votes)**, per-player private delivery, happy-path voting with validation, tie revote sync, guess phase privacy + immediate win, server-clock timer transitions, refresh-recovery identity, **host transfer**, lobby leave/transfer/close, chaos variants online, broadcast revision hints, **server-driven speaking rotation (public sync, clock advance, host-only skip, privacy scan)** |
| `tests/audio.test.js` | independent music/SFX toggles+volume ranges, autoplay gating (nothing before a user gesture), disabled SFX schedules nothing, every game event synthesizes distinct audio, unknown events ignored, final-10s ticking (once/second), no-WebAudio environment safety, fully-silent playability |

## Recorded results (2026-10-04, after the hint + word-expansion update)

```
$ npm test
# tests 167
# suites 45
# pass 167
# fail 0

$ npm run validate:words
Total words:        7493
Unique normalized:  7493
Categories:         28 (required: 28)
Difficulty split:   easy 2681 · normal 3035 · hard 1777
Curated hints:      977 (all valid word ids; fallback covers every word)
RESULT: PASS
```

## What is verified where

- **Rules engine:** exhaustively unit/integration tested in Node (same module
  the browser and the Deno function import).
- **Online authority logic:** integration-tested in Node via
  `supabase/functions/game/core.js` + an in-memory DB adapter — three
  simulated independent clients, real token hashing, real concurrency/rev
  conflicts, real presence/host-transfer timing.
- **Browser UI:** manually exercised via the hosted preview (setup → local
  game → refresh recovery; see the final report). Automated browser testing
  (Playwright/CDP) was **not** part of this environment — UI behaviour is not
  claimed as automatically verified.
- **Live Supabase (real network, real Postgres, three real devices):**
  **NOT verified** — no external service exists in this environment. The
  setup steps are documented in [multiplayer-setup.md](multiplayer-setup.md)
  and the in-browser code paths degrade gracefully when unconfigured.
  `tests/online-core.test.js` is the closest local proxy.

## Adding tests

- New engine behaviour → new case in the matching suite (or a new file).
- New online action → happy path **and** rejection paths (wrong phase,
  non-host, bad token, duplicate).
- Anything security-relevant → add an explicit leak-scan assertion
  (JSON-stringify the public state and assert the secret is absent).
