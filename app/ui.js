// DOM helpers, inline SVG icons, toasts, modals, a11y announcer.
// All user content is inserted via text nodes / textContent — never innerHTML —
// so untrusted strings (player names, guesses, words) cannot inject markup.

/* ---------------- tiny DOM builder ---------------- */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (typeof c === 'string' || typeof c === 'number') el.append(document.createTextNode(String(c)));
    else el.append(c);
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/* ---------------- icons (inline SVG, no CDN) ---------------- */
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  gamepad: '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 12h4M9 10v4M15.5 11.5h.01M18 13.5h.01"/>',
  vr: '<path d="M3 9c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4v5c0 2.8-2.2 5-5 5h-2.4c-1.2 0-2.3-.6-3-1.6L10 16l-.6 1.4c-.7 1-1.8 1.6-3 1.6H5c-1.1 0-2-.9-2-2V9z"/><path d="M7.5 11.5h2M14.5 11.5h2"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  crown: '<path d="m2 6 4 5 6-7 6 7 4-5v12H2z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.16 3.19"/><path d="m2 2 20 20"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>',
  vote: '<path d="M9 12l2 2 4-5"/><path d="M5 4h14a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1h-3l-2 2h-4l-2-2H4a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  mask: '<circle cx="12" cy="12" r="10"/><path d="M16 10c-1 1.3-2.5 1.3-3.5 0M11.5 10c-1 1.3-2.5 1.3-3.5 0"/><path d="M8 15c1.5 1.5 6.5 1.5 8 0"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  music: '<path d="M9 18V6l12-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  sfx: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2"/>',
  wifiOff: '<path d="m2 2 20 20"/><path d="M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.6"/><circle cx="12" cy="19.5" r="1.2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6z"/>',
  zap: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  word: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  flag: '<path d="M4 22V4c3-2 6 2 9 0s7-1 7-1v11c-3-1-4 2-7 1s-6 2-9 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  doorOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};

export function icon(name, size = 20) {
  const d = PATHS[name] || PATHS.info;
  const span = document.createElement('span');
  span.className = 'icon';
  span.style.display = 'inline-flex';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return span;
}

/* ---------------- toasts ---------------- */
export function toast(message, type = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const t = h('div', { class: `toast ${type}` },
    icon(type === 'good' ? 'check' : type === 'bad' ? 'alert' : 'info', 18),
    h('span', { text: message })
  );
  root.append(t);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

/* ---------------- screen-reader announcements ---------------- */
let lastAnnounce = '';
export function announce(message) {
  if (message === lastAnnounce) return; // avoid re-announcing identical text
  lastAnnounce = message;
  const el = document.getElementById('sr-status');
  if (el) el.textContent = message;
}

/* ---------------- modal (focus-trapped) ---------------- */
export function modal({ title, body, actions = [], danger = false, dismissible = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previousFocus = document.activeElement;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) finish(null);
      if (e.key === 'Tab') trapFocus(e);
    };
    function trapFocus(e) {
      const focusables = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }

    const box = h('div', {
      class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title,
    },
      h('h3', { text: title }),
      body,
      h('div', { class: 'modal-actions' },
        actions.map((a) => h('button', {
          class: `btn ${a.style || ''}`,
          type: 'button',
          onclick: () => finish(a.value),
          autofocus: a.autofocus || undefined,
        }, a.label))
      )
    );
    const backdrop = h('div', { class: 'modal-backdrop' }, box);
    if (dismissible) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
    root.append(backdrop);
    document.addEventListener('keydown', onKey);
    const af = box.querySelector('[autofocus]') || box.querySelector('button');
    if (af) af.focus();
  });
}

export async function confirmDialog(message, { title = 'Are you sure?', okLabel = 'Confirm', danger = true } = {}) {
  return (await modal({
    title,
    body: h('p', { class: 'muted', text: message }),
    actions: [
      { label: 'Cancel', value: false, style: 'ghost' },
      { label: okLabel, value: true, style: danger ? 'danger' : 'primary', autofocus: true },
    ],
  })) === true;
}

/* ---------------- confirm-leave guard for navigation ---------------- */
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = typeof fn === 'function' ? fn : null; }
export async function maybeConfirmLeave() {
  if (!leaveGuard) return true;
  const ok = await leaveGuard();
  if (ok) leaveGuard = null;
  return ok;
}

/* ---------------- timer ring ---------------- */
export function timerRing({ secondsLeft, totalSeconds, label }) {
  const size = 92;
  const r = 40;
  const c = 2 * Math.PI * r;
  const frac = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 1;
  const wrap = h('div', { class: 'timer-wrap' + (secondsLeft <= 10 ? ' urgent' : ''), role: 'timer', 'aria-label': label },
    h('div', { class: 'timer-num', text: formatClock(secondsLeft) })
  );
  wrap.insertAdjacentHTML('afterbegin',
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(148,163,184,.18)" stroke-width="6"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="6"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}"
        style="color:var(--accent); transition: stroke-dashoffset .5s linear"/>
    </svg>`);
  return wrap;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------------- misc ---------------- */
export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Avatar initials for a display name (max 2 chars, uppercase). */
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

export function focusMain() {
  const main = document.getElementById('app');
  if (main) main.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

/**
 * Vibrate the device (best effort). Used for "your speaking turn" alerts.
 * Android/most mobile browsers support the Vibration API; iOS Safari does
 * not — there the visual + audio cues cover it. Never throws.
 */
export function vibrate(pattern = 800) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch { /* unsupported or blocked — ignore */ }
  return false;
}
