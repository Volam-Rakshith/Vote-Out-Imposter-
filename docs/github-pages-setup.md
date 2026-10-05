# Hosting Vote Out Imposter on GitHub Pages — beginner walkthrough

This guide assumes you have **never used GitHub before**. Follow it top to
bottom and your game will be live on the internet at a free
`https://YOURUSERNAME.github.io/...` address. Total time: about 10 minutes.

> What you need: a computer or phone with a browser, and the
> `vote-out-imposter-site.zip` file (or the unzipped folder). Nothing else —
> no credit card, no coding, no command line.

---

## 0. What's inside the zip

The zip contains the **entire site** — ready to host as-is:

| File / folder | What it is |
| --- | --- |
| `index.html` | The app (it opens straight into the game) |
| `404.html` | Sends broken links back into the app (keeps invite codes) |
| `app/`, `game/`, `engine/`, `assets/` | The game code, styles, logo, sounds |
| `.github/workflows/deploy-pages.yml` | Automatic publishing (GitHub Actions) |
| `docs/` | Guides (you can delete this folder before uploading if you want a smaller site — the game doesn't need it) |
| `supabase/`, `tests/`, `scripts/`, `*.md`, `package.json` | Backend code and developer files — safe to ignore; they don't affect the site |

**No secrets are in the zip.** No passwords, no API keys — it is safe to
publish publicly. (Online multiplayer is OFF until you separately configure
Supabase — see [multiplayer-setup.md](multiplayer-setup.md). The offline
One Mobile game works immediately.)

---

## 1. Create a GitHub account (free)

1. Go to **https://github.com/signup**.
2. Pick a username, enter your email, choose a password.
3. Verify your email when GitHub sends the link.

## 2. Create a new repository

1. Click the **+** icon (top-right corner) → **New repository**.
2. **Repository name**: anything lowercase, e.g. `vote-out-imposter`.
   - If you name it exactly `YOURUSERNAME.github.io` (matching your username),
     the site goes live at `https://YOURUSERNAME.github.io/` — the shortest
     address. Any other name gives `https://YOURUSERNAME.github.io/vote-out-imposter/`.
     Both work fine.
3. Leave it **Public** (required for free Pages hosting).
4. Do **not** tick "Add a README" — start with an empty repo.
5. Click **Create repository**.

## 3. Upload the site files

1. **Unzip** `vote-out-imposter-site.zip` on your computer. You get a folder
   (for example `vote-out-imposter-site`) full of files.
2. On your new (empty) repository page, click **Add file → Upload files**.
3. Open the unzipped folder, select **everything inside it** (`index.html`,
   `404.html`, the `app` folder, the `game` folder, the `assets` folder, the
   `.github` folder, and the rest) and **drag all of it** onto the upload area.
   - ⚠️ Upload the *contents* of the folder — not the folder itself. GitHub
     must see `index.html` at the top level.
   - ⚠️ If you can't see the `.github` folder: on Windows, in File Explorer,
     tick **View → Show → Hidden items** first. If you skip this folder you
     can still publish with the manual method in step 4B.
5. Wait for all files to finish uploading (every folder from the checklist
   above must appear in the drag area), then click **Commit changes**.

   > Note: the GitHub web uploader accepts up to **100 files per upload** —
   > this site is 91 files, so one drag works. If you ever split it, upload
   > the remaining folders the same way (each commit is fine).

## 4. Turn on GitHub Pages

### 4A. Automatic (recommended — uses the included workflow)

1. In your repository, go to **Settings** (top tab) → **Pages** (left sidebar).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Done. The first build starts within a minute or two.

### 4B. Manual (if you skipped the `.github` folder)

1. **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Branch: **main**, folder: **/ (root)** → **Save**.

## 5. Open your game

- The Pages screen (and the **Actions** tab) will show the address once
  building finishes — it looks like:
  - `https://YOURUSERNAME.github.io/vote-out-imposter/`
  - or `https://YOURUSERNAME.github.io/` (if the repo is `YOURUSERNAME.github.io`)
- Open it on your phone or laptop → the game loads straight into the setup
  screen. Choose **One Mobile**, add 3–20 player names and play.
- Add it to your home screen (browser menu → *Add to Home Screen*) so it
  feels like an app.

## 6. Sharing the game with friends

- Just send them your site address. Anyone can open it and start their own
  game — nothing is stored on your account.
- Online rooms: the host creates a room and shares the invite link/code —
  this needs the Supabase setup in
  [multiplayer-setup.md](multiplayer-setup.md).

## 7. Updating the site later

Upload changed files the same way (**Add file → Upload files** overwrites),
or edit a file directly on GitHub (pencil icon). Pages re-publishes
automatically within a minute or two.

## 8. Troubleshooting

| Problem | Fix |
| --- | --- |
| "404 — There isn't a GitHub Pages site here" | Wait 1–2 minutes after enabling; check the **Actions** tab for a failed run; confirm Source is set (step 4). |
| The page loads but looks broken / plain | Files are missing: re-upload **all** files and folders, keeping the structure (`assets/`, `app/`, `game/`, `engine/` next to `index.html`). |
| Game loads at the wrong address / links break | Make sure all files are at the top level, not nested inside an extra folder like `vote-out-imposter-site/`. |
| Invite link with `?room=CODE` doesn't join | Online mode isn't configured on that deployment (expected until Supabase is set up). |
| I only see "Loading the game…" | Enable JavaScript in the browser, or try a current browser (Chrome, Edge, Firefox, Safari). |
| **Deploy fails: "Cannot find module …/tests"** (or …/scripts) | The upload was incomplete — that folder is missing from the repository. Re-upload it: **Add file → Upload files** → drag the missing folder from your unzipped zip → **Commit changes**. The deploy re-runs automatically. |
| Deploy fails at "Run npm test" with a different error | A file was uploaded in a corrupted/older version. Safest fix: delete the repo's folders and re-upload everything from the current zip in one drag (under 100 files = one upload is fine). |

---

**That's it — your game is live.** For game rules see [game-rules.md](game-rules.md);
for the online multiplayer walkthrough see [multiplayer-setup.md](multiplayer-setup.md).
