// Build the single-file deployment: the ENTIRE app (all ES modules, styles,
// icons) inlined into one index.html with zero folder/file dependencies.
// Output: dist-single/ (index.html + 404.html + README.md) — commit those
// loose files to any static host and the game just works.
//
// Usage: node scripts/build-single-file.mjs   (needs esbuild: npm i -D esbuild)

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

mkdirSync('dist-single', { recursive: true });

// 1. Bundle the app graph (entry: app/main.js) into one IIFE script.
const result = await build({
  entryPoints: ['app/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
  metafile: true,
});
const js = result.outputFiles[0].text;
const modules = Object.keys(result.metafile?.inputs ?? {}).length;

// 2. Inline assets.
const css = readFileSync('assets/styles.css', 'utf8');
const favicon = 'data:image/svg+xml;base64,' + readFileSync('assets/favicon.svg').toString('base64');

// 3. Compose the single index.html.
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#04140c">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="Vote Out Imposter — a social deduction party game. Innocents share a secret word, imposters don't. Play pass-and-play on one device or online with friends. 3–20 players, works offline, no accounts.">
  <title>Vote Out Imposter — Social Deduction Party Game</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}">
  <link rel="apple-touch-icon" href="${favicon}">
  <style>
${css}
  </style>
</head>
<body>
  <a class="skip-link" href="#app">Skip to content</a>
  <div class="app-shell">
    <header class="top-nav">
      <div class="inner">
        <a class="brand" href="#/" aria-label="Vote Out Imposter">
          <img src="${favicon}" alt="" width="34" height="34">
          <span class="brand-name">VOTE&nbsp;OUT&nbsp;<span>IMPOSTER</span></span>
        </a>
        <nav class="nav-links" aria-label="Primary">
          <a class="nav-link" href="#/" data-nav="game">Play</a>
          <a class="nav-link" href="#/game/vote-out-imposter/rules" data-nav="rules">Rules</a>
          <a class="nav-link" href="#/game/vote-out-imposter/settings" data-nav="settings">Settings</a>
        </nav>
      </div>
    </header>

    <main id="app" tabindex="-1" aria-live="off">
      <div class="container center" style="padding-top:12vh">
        <p class="muted">Loading the game…</p>
      </div>
    </main>

    <footer class="site-footer">
      <div>VOTE OUT IMPOSTER · works offline · no accounts required</div>
    </footer>
  </div>

  <div id="toasts" aria-live="polite"></div>
  <div id="modal-root"></div>
  <div id="sr-status" class="sr-only" role="status" aria-live="polite"></div>

  <script>
${js}
  </script>
</body>
</html>
`;
writeFileSync('dist-single/index.html', html);

// 4. Companion files: SPA fallback + README. Both fully self-contained.
copyFileSync('404.html', 'dist-single/404.html');
writeFileSync('dist-single/README.md', `# Vote Out Imposter (single-file build)

The entire game is in \`index.html\` — all code, styles, sounds (procedural),
the 7,493-word database and icons are inlined. \`404.html\` redirects broken
links back into the app (keeping \`?room=\` invite codes).

## Host it

Any static host works. GitHub Pages, the easy way:

1. Create a repository and upload \`index.html\`, \`404.html\` and this README
   (loose files — no folders needed).
2. Repository **Settings → Pages → Build and deployment → Source:
   Deploy from a branch** → branch **main**, folder **/ (root)** → Save.
3. Open \`https://YOURNAME.github.io/REPOSITORY/\` a minute later.

Online multiplayer (optional): see the full source repository's
\`docs/multiplayer-setup.md\` — this single-file build works fully offline in
One Mobile mode; online mode requires configuring Supabase keys in the source
build.

Built from the full source at ${new Date().toISOString()}.
Bundle: ${modules} modules, ${js.length.toLocaleString()} bytes of JavaScript,
sha256(js)=${createHash('sha256').update(js).digest('hex').slice(0, 16)}…
`);

console.log(`OK: dist-single/index.html written — ${modules} modules, ${(html.length / 1024).toFixed(0)} KB total.`);
