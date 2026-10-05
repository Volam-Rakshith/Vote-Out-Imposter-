// Hash router — GitHub Pages subpath-safe (all routes are #/fragments, all
// asset URLs are relative ./paths). Supports :params and ?query strings.

import { updateNav } from './nav.js';

const routes = [];
let currentCleanup = null;

/** pattern: '#/game/vote-out-imposter/online/room' with :param segments */
export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })
    + '/?$');
  routes.push({ regex, keys, handler });
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    dispatch();
  } else {
    location.hash = hash;
  }
}

function parseLocation() {
  // Support ?room=CODE in the search string (invitation links & 404 redirect)
  const search = new URLSearchParams(location.search);
  const invitedCode = (search.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let hash = location.hash || '#/';
  if (!hash.startsWith('#/')) hash = '#/' + hash.replace(/^#?\/?/, '');

  let path = hash;
  let query = {};
  const qi = hash.indexOf('?');
  if (qi >= 0) {
    path = hash.slice(0, qi);
    for (const [k, v] of new URLSearchParams(hash.slice(qi + 1))) query[k] = v;
  }
  if (invitedCode && !query.room) query.room = invitedCode;
  return { path, query };
}

let dispatching = false;
async function dispatch() {
  if (dispatching) return;
  dispatching = true;
  try {
    const { path, query } = parseLocation();
    updateNav(path);
    const mount = document.getElementById('app');
    if (!mount) return;

    if (currentCleanup) {
      try { currentCleanup(); } catch { /* ignore */ }
      currentCleanup = null;
    }
    for (const r of routes) {
      const m = path.match(r.regex);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        const result = await r.handler({ mount, params, query, navigate });
        if (typeof result === 'function') currentCleanup = result;
        return;
      }
    }
    // no route matched -> home
    const home = routes.find((r) => r.regex.test('#/'));
    if (home) {
      const result = await home.handler({ mount, params: {}, query, navigate });
      if (typeof result === 'function') currentCleanup = result;
    }
  } finally {
    dispatching = false;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  window.addEventListener('popstate', dispatch);
  dispatch();
}

export { dispatch as rerender };
