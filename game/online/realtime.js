// Minimal realtime push client (Phoenix websocket protocol used by Supabase
// Realtime). Polling in the session controller remains the correctness
// fallback — realtime is purely a "something changed, sync now" hint.

import { SITE_CONFIG } from '../../app/config.js';

export function createRealtime({ roomCode, onEvent, onStatus } = {}) {
  let ws = null;
  let pingTimer = null;
  let rejoins = 0;
  let closedByUs = false;
  let joinRef = 0;
  const topic = `room-${roomCode}`;

  function setStatus(s) { try { onStatus?.(s); } catch { /* ignore */ } }

  function wsUrl() {
    const base = SITE_CONFIG.supabaseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${base}/realtime/v1/wss?apikey=${encodeURIComponent(SITE_CONFIG.supabaseAnonKey)}&vsn=1.0.0`;
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }

  function connect() {
    if (closedByUs) return;
    if (typeof WebSocket === 'undefined') { setStatus('unavailable'); return; }
    setStatus('connecting');
    let socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      setStatus('unavailable');
      return;
    }
    ws = socket;
    socket.addEventListener('open', () => {
      rejoins = 0;
      setStatus('connected');
      joinRef += 1;
      send({
        topic,
        event: 'phx_join',
        payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
        ref: String(joinRef),
      });
      pingTimer = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(joinRef += 1) }), 30000);
    });
    socket.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.topic === topic && msg.event === 'broadcast') {
        const { event, payload } = msg.payload || {};
        try { onEvent?.(event, payload || {}); } catch { /* ignore */ }
      }
    });
    socket.addEventListener('close', () => {
      if (pingTimer) clearInterval(pingTimer);
      if (!closedByUs) {
        setStatus('reconnecting');
        const delay = Math.min(15000, 800 * Math.pow(2, rejoins++));
        setTimeout(connect, delay);
      }
    });
    socket.addEventListener('error', () => { /* close handler drives retry */ });
  }

  connect();

  return {
    close() {
      closedByUs = true;
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(); } catch { /* ignore */ }
      setStatus('closed');
    },
  };
}
