# Vote Out Imposter (single-file build)

The entire game is in `index.html` — all code, styles, sounds (procedural),
the 7,493-word database and icons are inlined. `404.html` redirects broken
links back into the app (keeping `?room=` invite codes).

## Host it

Any static host works. GitHub Pages, the easy way:

1. Create a repository and upload `index.html`, `404.html` and this README
   (loose files — no folders needed).
2. Repository **Settings → Pages → Build and deployment → Source:
   Deploy from a branch** → branch **main**, folder **/ (root)** → Save.
3. Open `https://YOURNAME.github.io/REPOSITORY/` a minute later.

## Online multiplayer (optional, no code edits)

This build works fully offline in One Mobile mode. For real online rooms with
invite codes: the host completes a one-time 10-minute free Supabase setup
(full guide: the source repository's `docs/multiplayer-setup.md`), then every
player opens **Multiple Devices** on their phone and pastes the Project URL +
anon public key into the connect form. Saved per device, no redeploy needed.

Built from the full source at 2026-10-05T06:02:42.586Z.
Bundle: 34 modules, 264,870 bytes of JavaScript,
sha256(js)=652247649b0c5a10…
