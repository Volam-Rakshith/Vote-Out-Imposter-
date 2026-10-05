// VR Developments — Vote Out Imposter: authoritative game edge function.
//
// Deploy with the Supabase CLI from the repository root:
//   supabase functions deploy game --no-verify-jwt
//
// This function is the ONLY writer of room state. Browsers talk to it with
// JSON-RPC-style bodies: { action, ...payload } and receive public state plus
// their own private view. Service-role credentials never leave the server.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createPostgresDb } from './game/db-postgres.js';
import { createRealtimeBroadcaster } from './game/realtime-broadcast.js';
import { performAction, ActionError, assertPayloadSize } from './game/core.js';
import { isEngineError } from '../../engine/index.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

function errorResponse(e) {
  if (e instanceof ActionError) {
    return json({ ok: false, error: { code: e.code, message: e.message } }, e.status || 400);
  }
  if (isEngineError(e)) {
    return json({ ok: false, error: { code: e.code, message: e.message } }, 409);
  }
  console.error('[game] unexpected error:', e);
  return json({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' } }, 500);
}

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } }, 405);
  }

  const url = new URL(req.url);
  if (url.searchParams.get('key')) {
    // never echo or log secrets; treat unknown query params as noise
  }

  let bodyText;
  try {
    bodyText = await req.text();
  } catch {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Could not read the request body.' } }, 400);
  }
  try {
    assertPayloadSize(bodyText);
  } catch (e) {
    return errorResponse(e);
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request body must be JSON.' } }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request body must be a JSON object.' } }, 400);
  }

  const db = createPostgresDb(Deno.env);
  const broadcast = createRealtimeBroadcaster(Deno.env);

  try {
    const result = await performAction(db, String(body.action || ''), body, {
      now: () => Date.now(),
      broadcast,
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

serve(handler);
