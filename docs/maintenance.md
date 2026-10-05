# Maintenance Guide

How to keep Vote Out Imposter healthy after launch.

## Routine checks

```bash
npm test              # full suite — must be 100% green before any release
npm run validate:words
npm run test:engine   # engine + words only
npm run test:online   # online authority integration tests
```

The GitHub Actions workflow runs the same commands on every push and blocks
the Pages deployment on failure.

## Word database

- Minimum 30 words per category, 600+ total — `validate-words.mjs` enforces.
- Adding words: append to the arrays in `engine/words-data.js`. Keep language
  simple (Indian players, simple English), keep entries age-appropriate.
- Cross-category duplicates are allowed (they merge); conflicting difficulties
  across categories are NOT (the builder fails loudly — resolve by choosing
  one difficulty).
- Never add placeholder entries; the validator reports honest counts.

## Releases

1. All tests green locally.
2. Bump nothing (no build step) — commit and push.
3. Watch the Actions run; Pages deploys automatically from `main`.

## Online service health

- **Rooms table size:** watch `voi_rooms` row count in the Supabase dashboard;
  cron cleanup (migration file) keeps it small. Lazy expiry also handles it.
- **Function logs:** Supabase → Edge Functions → `game` → Logs. Unexpected
  `INTERNAL` errors print a stack server-side only — never to clients.
- **Rotation:** if you ever rotate the service-role key, redeploy the function
  and expect existing sessions to still work (tokens live in the rooms table,
  not Supabase auth). Rotating the *anon* key requires updating
  `app/config.js` and all saved client sessions become stale — players rejoin.

## Data & privacy

- Local data (names, stats, settings, saved game, session tokens) is per
  browser profile, clearable in-game (Settings) and by clearing site data.
- The server stores: room state (incl. roles/words/votes while the room
  lives), member names and hashed tokens. Rooms are deleted on expiry/close.
  No emails, no IPs logged by the game code.
- See [privacy.md](privacy.md) for the One Mobile privacy disclosure.

## Known limitations (honest)

- **Sybil joins:** anyone with another browser profile can join a room twice.
  The room code is the only membership gate; there is no identity provider by
  design (no accounts). Hosts can remove players in the lobby.
- **Voice-chat cheating** (imposters coordinating, innocents screen-sharing)
  is outside the server's control.
- **One Mobile privacy is social, not cryptographic:** the saved game in
  localStorage contains roles/words for refresh recovery. Anyone inspecting
  the device's storage can read them.
- **Client display bugs can't corrupt games online** — the server is the
  authority — but a *host's* display bug can stall a room (host-only
  "continue" actions). Host transfer covers abandoned hosts.
- **Polling cost:** ~24 requests/min/client. Fine for game nights; a very
  large event would need websocket-first delivery.

## Common support questions

- *"Can we add a 6th chaos variant?"* — No. The specification explicitly
  forbids additional variants; a source-scan test enforces the five shipped
  ones (Everyone Is Imposter, No Imposter, Random Count, Custom Count,
  No Hints).
- *"Can the word list include brand X?"* — keep it generic and non-defamatory;
  the Special/Famous categories were curated deliberately.
- *"Why does nothing happen when I click Start?"* — the setup screen lists
  blocking problems above the button (not enough players, empty word pool…).

## Repository conventions

- Plain ES modules; **no** npm dependencies at runtime (keep it that way).
- Engine mutations: clone-in, return-new; typed errors with stable codes.
- User text: text nodes only (no `innerHTML` with dynamic content).
- New online actions need tests including the rejection paths.
- Docs live in `docs/`; update them with behaviour changes.
