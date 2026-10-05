// In-app docs viewer: renders the beginner multiplayer setup guide.
// The full markdown guides live in /docs — this page mirrors the essential
// steps so they are readable offline inside the app.

import { h, icon } from '../../app/ui.js';
import { isOnlineConfigured } from '../../app/config.js';

export function renderDocsPage({ mount, navigate, params }) {
  const which = params.doc || 'multiplayer';
  mount.append(h('div', { class: 'screen-enter stack', style: { gap: 18, maxWidth: 820, margin: '0 auto' } },
    h('div', { class: 'row' },
      h('button', { class: 'btn small ghost', onclick: () => navigate('#/') }, icon('arrowLeft', 16), 'Back to the game')),
    which === 'multiplayer' ? multiplayerGuide() : notFound(),
  ));
}

function multiplayerGuide() {
  const configured = isOnlineConfigured();
  const steps = [
    ['Create a free Supabase account', 'Go to supabase.com and sign up with GitHub or email. The Free tier is enough for this game — no credit card is required. (Supabase may ask for billing details only if you opt into a paid plan or trials; you can skip all of that.)'],
    ['Create a new project', 'Click "New project", pick an organization, give it a name like "vote-out-imposter", choose a region near your players (e.g. Mumbai ap-south-1), and set a database password (you will not need it again for this guide — store it somewhere safe anyway).'],
    ['Wait for provisioning', 'The project takes 1–3 minutes to create. You will land on the project dashboard.'],
    ['Run the database migration', 'Open "SQL Editor" → "New query". Paste the entire contents of supabase/migrations/0001_init.sql from this repository and click "Run". It creates the voi_rooms table with row-level security enabled (no public access).'],
    ['Enable the pg_cron cleanup (optional)', 'In SQL Editor, run the statement at the bottom of the same migration file to delete expired rooms hourly. Optional — rooms also expire lazily when touched.'],
    ['Deploy the game edge function', 'Option A (dashboard): open "Edge Functions" → "Create a function" → name it game, replace the default code with the contents of supabase/functions/game/index.ts plus the sibling game/*.js files (or use the Supabase CLI below). Option B (CLI): supabase functions deploy game --no-verify-jwt (see docs/multiplayer-setup.md for the exact commands).'],
    ['Find your keys', 'Project Settings → API. Copy the "Project URL" (looks like https://abcd1234.supabase.co) and the "anon public" key (a long eyJ… string). The anon key is safe to ship to browsers; the service_role key is NOT — it is already configured as a function secret and must never appear in client code.'],
    ['Fill in app/config.js', 'Open app/config.js in your copy of this repository and set supabaseUrl and supabaseAnonKey. Redeploy your site (or rebuild for GitHub Pages).'],
    ['Verify the function', 'With the site deployed, open the game → Multiple Devices. The badge should say "Online ready". Create a room — you should see a room code within a couple of seconds.'],
    ['Test on real devices', 'Open the invite link on 2–3 different devices (phone, laptop). Join with different names, start a game, and play a round: private roles, voting, results.'],
    ['Troubleshooting', '"Not configured" badge: the keys in app/config.js are empty. "Network" errors: the function is not deployed or the URL is wrong. "Unauthorized": you redeployed with different keys — sessions from the old keys cannot be restored. Full troubleshooting table: docs/multiplayer-setup.md.'],
  ];
  return h('div', { class: 'stack', style: { gap: 14 } },
    h('h1', { style: { margin: 0 } }, icon('wifi', 26), ' Multiplayer setup guide'),
    h('div', { class: 'banner ' + (configured ? 'good' : 'info').replace('good', 'info'), role: 'status' },
      icon(configured ? 'check' : 'info', 20),
      h('div', { class: 'small' }, configured
        ? 'This deployment is configured for online play. The steps below are for other deployments.'
        : 'Follow these steps to enable real online multiplayer on your own deployment of this site.')),
    h('div', { class: 'steps' }, steps.map(([t, b], i) => h('div', { class: 'step' },
      h('div', { class: 's-body' }, h('b', { text: `${t}. ` }), b)))),
    h('p', { class: 'small muted' },
      'The complete guide (including CLI commands, credit-card honesty notes, rate limits and the troubleshooting table) lives in ',
      h('code', { class: 'mono', text: 'docs/multiplayer-setup.md' }), ' in the repository.'),
  );
}

function notFound() {
  return h('div', { class: 'center stack' },
    h('h2', { text: 'Unknown doc' }),
    h('a', { class: 'btn', href: '#/game/vote-out-imposter/docs/multiplayer' }, 'Multiplayer setup guide'));
}
