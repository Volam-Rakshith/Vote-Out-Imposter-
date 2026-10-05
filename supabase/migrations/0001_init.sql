-- VR DEVELOPMENTS — VOTE OUT IMPOSTER
-- Database schema for online rooms. Run in the Supabase SQL Editor.
--
-- Security: the table is readable/writable ONLY by the service role (used by
-- the deployed edge function). Row Level Security is enabled with no policies,
-- so anon/authenticated keys have zero access. Room documents contain roles,
-- words and votes — they must never be publicly readable.

create table if not exists public.voi_rooms (
  code              text   primary key check (char_length(code) = 6),
  created_at        bigint not null,              -- epoch ms
  expires_at        bigint not null,              -- epoch ms
  last_activity_at  bigint not null,              -- epoch ms
  rev               bigint not null default 1,    -- optimistic-concurrency counter
  engine_state      jsonb  not null,              -- full authoritative game state
  members           jsonb  not null default '[]'::jsonb,   -- [{playerId,name,tokenHash,joinedAtOffset,joinedAt,lastSeenAt}]
  join_attempts     jsonb  not null default '[]'::jsonb    -- [epoch ms] rolling window
);

alter table public.voi_rooms enable row level security;

-- Intentionally NO policies: only the service role (edge function) may touch
-- this table. Anon/authenticated requests are denied by default.

create index if not exists voi_rooms_expires_idx on public.voi_rooms (expires_at);

-- ---------------------------------------------------------------------------
-- OPTIONAL scheduled cleanup (requires the pg_cron extension, available on the
-- free tier). Run this once:
--
--   create extension if not exists pg_cron;
--   select cron.schedule('voi-rooms-cleanup', '17 * * * *',
--     $$ delete from public.voi_rooms where expires_at < (extract(epoch from now()) * 1000)::bigint $$);
--
-- Cleanup is optional: rooms also expire lazily whenever they are touched
-- after their TTL, so the table stays correct even without cron.
-- ---------------------------------------------------------------------------
