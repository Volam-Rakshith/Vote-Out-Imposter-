// Route registration for the game feature.

import { route } from '../app/router.js';
import { renderLocalSetup, renderLocalPlay } from './local/controller.js';
import { renderOnlineHome, renderOnlineRoom } from './online/controller.js';
import { renderRulesPage } from './ui/rules.js';
import { renderSettingsPage } from './ui/settings-page.js';
import { renderDocsPage } from './ui/docs.js';

export function registerGameRoutes() {
  // Legacy hub route redirects to the single-game landing.
  route('#/game/vote-out-imposter', ({ navigate }) => navigate('#/', { replace: true }));

  // One Mobile (offline pass-and-play)
  route('#/game/vote-out-imposter/local', ({ mount, navigate }) => renderLocalSetup({ mount, navigate }));
  route('#/game/vote-out-imposter/local/play', ({ mount, navigate }) => renderLocalPlay({ mount, navigate }));

  // Multiple Devices (online)
  route('#/game/vote-out-imposter/online', ({ mount, navigate }) => renderOnlineHome({ mount, navigate }));
  route('#/game/vote-out-imposter/online/room', ({ mount, navigate, query }) => renderOnlineRoom({ mount, navigate, query }));

  // Meta
  route('#/game/vote-out-imposter/rules', ({ mount, navigate }) => renderRulesPage({ mount, navigate }));
  route('#/game/vote-out-imposter/settings', ({ mount, navigate }) => renderSettingsPage({ mount, navigate }));
  route('#/game/vote-out-imposter/docs/:doc', ({ mount, navigate, params }) => renderDocsPage({ mount, navigate, params }));
  route('#/game/vote-out-imposter', ({ navigate }) => navigate('#/', { replace: true }));
}
