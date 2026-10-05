// Active-state management for the top nav (single-game app).

export function updateNav(path) {
  let section = 'game'; // default: the game itself
  if (path.includes('/rules')) section = 'rules';
  else if (path.includes('/settings')) section = 'settings';
  else if (path.includes('/docs')) section = 'rules';
  for (const el of document.querySelectorAll('[data-nav]')) {
    el.classList.toggle('active', el.dataset.nav === section);
    el.setAttribute('aria-current', el.dataset.nav === section ? 'page' : 'false');
  }
}
