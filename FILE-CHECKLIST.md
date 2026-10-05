# File checklist — verify your upload with this

After you commit these files to GitHub, your repo's front page must show
**exactly these folders and files**. If any row is missing, the deploy fails.

| Item | Type | Files inside |
| --- | --- | --- |
| `.github` | folder (hidden!) | 1 (workflows/deploy-pages.yml) |
| `app` | folder | 6 |
| `assets` | folder | 3 |
| `docs` | folder | 9 |
| `engine` | folder | 14 |
| `game` | folder | 14 |
| `scripts` | folder | 2 |
| `supabase` | folder | 6 |
| `tests` | folder | **12** ← the one that was missing |
| `index.html` | file | — |
| `404.html` | file | — |
| `README.md` | file | — |
| `package.json` | file | — |
| `.env.example` | file (hidden!) | — |
| `.gitignore` | file (hidden!) | — |

**Total: 73 files** (this checklist makes it 74 — it's safe to commit or delete).

## The one trap: hidden files

`.github`, `.env.example` and `.gitignore` start with a dot = hidden by default:

- **Windows:** open the unzipped folder in File Explorer → **View → Show →
  Hidden items** (tick it) BEFORE selecting everything to upload.
- **Mac:** in Finder, press **Cmd + Shift + .** to reveal them.

Without `.github` there is no auto-deploy — you'd have to set
Settings → Pages → Deploy from branch (main / root) manually.
`.env.example` and `.gitignore` are nice-to-have; the game works without them.

## After you commit

1. Check the repo front page against the table above.
2. Click the **Actions** tab — the deploy should turn green in ~2 minutes.
3. Your game: `https://YOURNAME.github.io/REPOSITORY/`
