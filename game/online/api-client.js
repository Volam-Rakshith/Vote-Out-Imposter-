// HTTP client for the authoritative game edge function.

import { SITE_CONFIG } from '../../app/config.js';

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function onlineEndpoint() {
  return SITE_CONFIG.supabaseUrl ? `${SITE_CONFIG.supabaseUrl.replace(/\/$/, '')}/functions/v1/game` : null;
}

export function createApiClient({ timeoutMs = 12000 } = {}) {
  const endpoint = onlineEndpoint();
  if (!endpoint) {
    return {
      configured: false,
      async call() { throw new ApiError('NOT_CONFIGURED', 'Online multiplayer is not configured on this deployment.', 0); },
    };
  }
  return {
    configured: true,
    async call(action, payload = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: SITE_CONFIG.supabaseAnonKey,
            authorization: `Bearer ${SITE_CONFIG.supabaseAnonKey}`,
          },
          body: JSON.stringify({ action, ...payload }),
          signal: controller.signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') throw new ApiError('TIMEOUT', 'The server took too long to respond.', 0);
        throw new ApiError('NETWORK', 'Could not reach the game server. Check your connection.', 0);
      } finally {
        clearTimeout(timer);
      }
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok || !data || data.ok === false) {
        throw new ApiError(
          data?.error?.code ?? `HTTP_${res.status}`,
          data?.error?.message ?? 'The server rejected the request.',
          res.status
        );
      }
      return data;
    },
  };
}
