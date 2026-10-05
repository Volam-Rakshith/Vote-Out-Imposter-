# VOTE OUT IMPOSTER

A complete, production-quality social deduction party game for 3–20 players.
Innocents share a secret word. Imposters don't — but they each get a secret
**related-word hint** to spark ideas. Discuss, vote privately, eliminate the
imposters — before they reach parity or steal the win by guessing the word.

**Two ways to play:**

| Mode | Devices | Network | Backend |
| --- | --- | --- | --- |
| **One Mobile** | One device, passed around | none — fully offline | none |
| **Multiple Devices** | One per player | internet | Supabase (free tier) |

Built as a dependency-free static site: plain ES modules, no build step, no
frameworks, no CDNs. Everything — including **7,493 secret words** across 28
categories and all sound effects (synthesized procedurally with the Web Audio
API) — ships in the repo.

## Quick start (local)

```bash
# no install step — zero dependencies
npm test                 # 154 tests: engine, words, hints, voting, online core, storage, audio
npm run validate:words   # word database validation report
```

To play: open `index.html` in a browser (or serve the folder — see below).
The app opens straight into the game — choose **One Mobile** and play
immediately, fully offline.

## Project layout

```
index.html            SPA shell (hash routing — GitHub Pages subpath-safe)
404.html              GitHub Pages SPA fallback (preserves ?room= invite codes)
app/                  site framework: router, nav, config, shared UI helpers
engine/               THE rules engine (shared by browser, tests and server)
game/
  ui/                 setup, phase screens, rules, settings, docs pages
  local/              One Mobile controller + validated localStorage layer
  online/             online client: API, realtime push, room UI
  audio/              procedural WebAudio music + SFX
  module.js           game route registration
supabase/
  functions/game/     authoritative edge function (Deno) + room core + DB adapters
  migrations/         SQL schema (RLS on, no public access)
  config.toml         function config (JWT verification off — own token auth)
scripts/              validate-words.mjs
tests/                node:test suites (run with `npm test`)
docs/                 user guide, rules, developer + multiplayer + maintenance guides
```

## Documentation

- [How to play (rules)](docs/game-rules.md)
- [User guide](docs/user-guide.md)
- [Developer guide](docs/developer-guide.md)
- [Multiplayer configuration (beginner walkthrough)](docs/multiplayer-setup.md)
- [Hosting on GitHub Pages (beginner walkthrough)](docs/github-pages-setup.md)
- [Maintenance guide](docs/maintenance.md)
- [Privacy notes](docs/privacy.md)
- [Testing guide + reports](docs/testing.md)
- [Final implementation report](docs/final-report.md)

## Deploying to GitHub Pages — beginner steps

The app is a **static site**: no build, no server, no environment variables
needed for One Mobile play. Full walkthrough with screenshots-level detail:
**[docs/github-pages-setup.md](docs/github-pages-setup.md)**. The short version:

1. Create a GitHub account (free) at [github.com](https://github.com).
2. Click **+** (top right) → **New repository** → name it anything, e.g.
   `vote-out-imposter` → **Create repository** (public is free).
3. Upload the site: **Add file → Upload files** → drag the unzipped
   `vote-out-imposter-site` folder's *contents* (all files and folders, not the
   folder itself) → **Commit changes**. (Or use `git` — see the full guide.)
4. Enable Pages: **Settings → Pages → Build and deployment → Source: GitHub
   Actions** (the repo already contains the workflow at
   `.github/workflows/deploy-pages.yml`).
5. Wait ~1–2 minutes, then open `https://YOURUSERNAME.github.io/REPOSITORY/`.

All routes are hash-based (`#/game/vote-out-imposter/...`) and all asset paths
are relative (`./assets/...`), so the app works at `user.github.io` **and** at
`user.github.io/repo/` without configuration. A `404.html` redirects unknown
paths back into the app (preserving `?room=` invite codes).

Online rooms (Multiple Devices) additionally need a Supabase project — that
setup is documented separately in
[docs/multiplayer-setup.md](docs/multiplayer-setup.md) and is **not** required
for the offline One Mobile game.

## Security model (online mode)

- The server is the only authority: roles, words, hints, timers, votes, ties,
  eliminations, guesses and results all live server-side.
- Players hold a random 256-bit session token (stored hashed) — no accounts.
- The role map, the secret word, the imposter hint and individual votes are
  **never** broadcast during play. Each player receives only their own private
  view.
- Host permissions are enforced server-side; `voi_rooms` is locked behind RLS
  with no policies (service-role access only).
- Honest limitation: a player with two devices can always join a room twice;
  voice chat is outside the server's control. See docs/maintenance.md.

## License

All code and the word database were written for this project. Provided as-is.
