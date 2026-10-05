// Best-effort realtime broadcast (Supabase Realtime REST).
// Polling remains the source of truth on clients — these pushes only say
// "something changed, sync now". Both topic spellings are sent for
// compatibility with different channel-joining conventions.

// deno-lint-ignore-file no-explicit-any
export function createRealtimeBroadcaster(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const endpoint = `${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`;

  return async function broadcast(topic, event, payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          { topic, event, payload },
          { topic: `realtime:${topic}`, event, payload },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`broadcast failed: ${res.status}`);
    }
    await res.body?.cancel().catch(() => {});
  };
}
