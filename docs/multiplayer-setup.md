# Multiplayer Configuration Guide (Multiple Devices mode)

A beginner-friendly, 18-step walkthrough to enable genuine online multiplayer
using Supabase's **free tier**. No mock multiplayer, no localStorage tricks —
real server-backed rooms.

> **Credit-card honesty:** the Supabase Free tier does **not** require a card
> to sign up or to run this game. Supabase may show optional offers (trials,
> add-ons) that ask for billing details — you can decline all of them. If
> Supabase's signup flow changes and asks for a card for the *free plan
> itself*, stop and use the alternative host in Appendix B.

---

## What you need

- 10 quiet minutes.
- The `supabase/` folder from this repository.
- A GitHub account (to sign up to Supabase and to host the site).

## Part 1 — Supabase project

1. **Create the account.** Go to <https://supabase.com> → *Start your project*
   → sign up with GitHub (or email). Choose the **Free** plan.

2. **Create a project.** Dashboard → **New project**. Pick an organization
   (create one if asked), name it `vote-out-imposter`, choose a database
   password (save it somewhere; this guide won't need it again), pick the
   region closest to your players (e.g. `ap-south-1` Mumbai for India).

3. **Wait for provisioning** (1–3 minutes). You land on the project dashboard.

4. **Open the SQL Editor.** Left sidebar → **SQL Editor** → **New query**.

5. **Run the migration.** Open `supabase/migrations/0001_init.sql` from this
   repository, copy **the entire file**, paste it into the editor, press
   **Run**. You should see "Success". This creates the `voi_rooms` table with
   Row Level Security **enabled and no policies** — only the service role
   (your edge function) can read or write room data.

6. **(Optional) schedule cleanup.** In the same SQL editor run the
   `pg_cron` statements from the bottom of that file so expired rooms are
   deleted hourly. Rooms also expire lazily by themselves, so this is a
   nice-to-have.

## Part 2 — the edge function

7. **Install the Supabase CLI** (skip if you prefer the dashboard-only path in
   Appendix A):
   - macOS: `brew install supabase/tap/supabase`
   - Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` then `scoop install supabase`
   - Linux: see <https://supabase.com/docs/guides/cli>
   Check with `supabase --version`.

8. **Log in and link.** From the repository root:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
   (The project ref is the `abcd1234` part of your project URL.)

9. **Deploy the function:**
   ```bash
   supabase functions deploy game --no-verify-jwt
   ```
   `--no-verify-jwt` is required: the game uses its own per-player tokens, not
   Supabase accounts. (`supabase/config.toml` already sets `verify_jwt=false`.)
   Expect output like `Deployed Function game (script size: xx kB)`.

10. **Set the service-role secret** (usually automatic): check
    *Project Settings → Edge Functions* — `SUPABASE_URL` and
    `SUPABASE_SERVICE_ROLE_KEY` are injected automatically on Supabase's
    hosted runtime. If you self-host, set them yourself (see `.env.example`).

## Part 3 — connect the site

11. **Copy your keys.** Dashboard → *Project Settings* (gear) → **API**:
    - **Project URL** — e.g. `https://abcd1234.supabase.co`
    - **anon public** key — a long `eyJ…` string.

    > The anon key is *designed* to be shipped to browsers. The
    > **service_role** key must never appear in client code — it already
    > lives only inside the function's server environment.

12. **Fill in the site config.** Open `app/config.js` in your copy of this
    repository and set:
    ```js
    supabaseUrl: 'https://abcd1234.supabase.co',
    supabaseAnonKey: 'eyJhbGciOi…',
    ```

13. **Redeploy / publish the site** (GitHub Pages, Netlify, Vercel — any
    static host works; see the README deployment section).

## Part 4 — verify

14. **Check the badge.** Open the site → **Multiple Devices**. The
    badge should read **"Online ready"** (no more "Needs setup").

15. **Create a test room.** Enter a name → **Create room**. A 6-character
    code (e.g. `A7KQM3`) appears within a couple of seconds.

16. **Join from a second device.** Copy the invite link (or code) to another
    phone/laptop, open it, enter a different name, join. Both screens show
    both players.

17. **Play a mini round.** Host starts the game with the defaults: each
    device shows its own private role; discussion → host starts the vote →
    each device votes → results appear on both devices.

18. **Check the room lifecycle.** Host closes the room → the other device
    shows "the host closed the room". Done — you're live.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Badge still says "Needs setup" | `app/config.js` empty or site not redeployed | Fill both keys, redeploy |
| "Could not reach the game server" | function not deployed, wrong URL, or offline | Re-run step 9; check the URL has no trailing slash issues |
| `FUNCTION_ERROR` / `DB_NOT_CONFIGURED` | service-role env missing (self-hosted) | set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for the function |
| "This game is already in progress" | joining with a NEW identity after start | refresh the original tab, or ask the host to Play Again |
| "Your session could not be restored" | tokens wiped or keys changed mid-session | rejoin; the old seat stays until it goes offline |
| Room code "does not exist" | room expired (>24h) or closed | create a new room |
| Votes not appearing live | realtime push failed (rare) | polling syncs every 2.5s anyway — wait a moment |
| Function 500s in logs | deploy from the wrong directory | deploy from repo root so `game/core.js` + `engine/` are bundled |

## Rate limits & free-tier notes (honest)

- Free tier includes 500k edge-function invocations/month and a small
  database — far beyond a game night's needs.
- Each client polls ~24 requests/minute while a room is open (plus realtime
  push); a 10-player game ≈ 14k requests/hour. Fine for casual play; not for
  a viral launch.
- Join attempts are rate-limited per room (10/minute).
- Rooms expire after 24h or 4h idle.

## Appendix A — dashboard-only deploy (no CLI)

Prefer not to install anything? In the dashboard: **Edge Functions → Create
function → name `game`** — then paste `supabase/functions/game/index.ts` and
create the sibling files `game/core.js`, `game/db-postgres.js`,
`game/realtime-broadcast.js` (copy their contents), and upload the
`engine/` folder into the function bundle via the editor's file support.
The CLI path (steps 7–9) is more reliable; use it if the dashboard rejects
multi-file functions.

## Appendix B — alternative hosts

`core.js` is environment-agnostic: any server that can run JavaScript and
persist a room record can host it (Deno Deploy, Cloudflare Workers with KV,
a Node server + Redis…). Implement the four DB adapter methods
(`getRoomByCode`, `createRoom`, `updateRoom`, `deleteRoom`) and point
`game/online/api-client.js` at your endpoint. You keep the tested authority
logic as-is.
