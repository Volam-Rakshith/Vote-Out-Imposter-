// App bootstrap: routes, global audio unlock, invite-link handling.
// Single-game app: the landing route (#/) IS the game.

import { route, startRouter, navigate } from './router.js';
import { renderGameHome } from './pages/game.js';
import { registerGameRoutes } from '../game/module.js';
import { getSharedAudio } from '../game/audio/shared.js';

registerGameRoutes();
route('#/', ({ mount, navigate: nav }) => renderGameHome({ mount, navigate: nav }));
// Legacy deep links from the old hub land on the game.
route('#/game', ({ navigate: nav }) => { nav('#/', { replace: true }); });

startRouter();

// Unlock WebAudio on the first user gesture (browser autoplay policy).
const unlockAudio = () => {
  const audio = getSharedAudio();
  audio.unlock();
  audio.updateVolumes();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Deep-link fallback: if the page was opened with ?room=CODE (some messaging
// apps strip fragments), route it into the online room once loaded.
(() => {
  const search = new URLSearchParams(location.search);
  const room = (search.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (room.length === 6 && !location.hash.includes('/online/')) {
    navigate(`#/game/vote-out-imposter/online/room?code=${room}`, { replace: true });
  }
})();
