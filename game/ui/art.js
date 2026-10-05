// Inline SVG artwork for the game (kept as code so it works offline and
// inherits page styles). Theme: emerald green = innocents, red = imposters.
// Motion is applied via CSS classes (art.js markup stays static) so
// prefers-reduced-motion can disable it globally.

import { h } from '../../app/ui.js';

export function gameTitleArt() {
  const art = h('div', { class: 'hero-art', 'aria-hidden': 'true' });
  art.innerHTML = `
<svg viewBox="0 0 340 150" width="300" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="ga" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="ga2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/>
    </linearGradient>
    <filter id="gglow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#gglow)">
    <path d="M40 52c0-6 4.9-11 11-11h48c6 0 11 5 11 11v26c0 9.4-7.6 17-17 17h-8.6c-3.4 0-6.6-1.7-8.4-4.6L70 82l-6 9.4c-1.8 2.9-5 4.6-8.4 4.6H57c-9.4 0-17-7.6-17-17V52z"
      fill="none" stroke="url(#ga)" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="58" cy="63" r="9" fill="#34d399"/>
    <circle cx="86" cy="63" r="9" fill="#f87171"/>
    <path d="M228 74l34 0" stroke="url(#ga2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>
    <path d="M300 58c0-5 4-9 9-9s9 4 9 9-4 9-9 9h-9zM300 58h-14c-3 0-5-1-7-3l-12-12" fill="none" stroke="#34d399" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M298 88l16 16M314 88l-16 16" stroke="#fb7185" stroke-width="4.5" stroke-linecap="round"/>
  </g>
  <g fill="#e8fbee" font-family="Arial, sans-serif" font-weight="900" font-size="30" letter-spacing="2">
    <text x="130" y="72">VOTE</text>
    <text x="130" y="106">OUT</text>
  </g>
  <text x="130" y="140" fill="#f87171" font-family="Arial, sans-serif" font-weight="900" font-size="26" letter-spacing="2">IMPOSTER</text>
</svg>`;
  return art;
}

export function innocentArt() {
  const el = h('div', { class: 'role-art innocent', 'aria-hidden': 'true' });
  el.innerHTML = `<svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>
  </svg>`;
  return el;
}

export function imposterArt() {
  const el = h('div', { class: 'role-art imposter', 'aria-hidden': 'true' });
  el.innerHTML = `<svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M16 10c-1 1.3-2.5 1.3-3.5 0M11.5 10c-1 1.3-2.5 1.3-3.5 0"/><path d="M8 15c1.5 1.7 6.5 1.7 8 0"/>
  </svg>`;
  return el;
}

export function chaosArt() {
  const el = h('div', { class: 'role-art chaos', 'aria-hidden': 'true' });
  el.innerHTML = `<svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6z"/>
  </svg>`;
  return el;
}
