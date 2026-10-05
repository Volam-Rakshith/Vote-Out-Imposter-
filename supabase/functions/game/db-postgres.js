// Postgres-backed room store (Supabase, service-role client).
// Room documents are stored as one row per room with optimistic locking on
// `rev`. All timestamps are bigint epoch milliseconds — no timezone fun.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TABLE = 'voi_rooms';

function wrap(code, message, cause) {
  return Object.assign(new Error(message), { code, cause });
}

export function createPostgresDb(env) {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw wrap('DB_NOT_CONFIGURED', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set for the function.');
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'vote-out-imposter/1.0' } },
  });

  return {
    async getRoomByCode(code) {
      const { data, error } = await supabase.from(TABLE).select('*').eq('code', code).maybeSingle();
      if (error) throw wrap('DB_ERROR', 'Could not read the room.', error);
      return data ? rowToRoom(data) : null;
    },

    async createRoom(room) {
      const row = roomToRow(room);
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) {
        if (error.code === '23505') throw wrap('CODE_TAKEN', 'room code taken');
        throw wrap('DB_ERROR', 'Could not create the room.', error);
      }
      return room;
    },

    async updateRoom(code, room, expectedRev) {
      const row = roomToRow(room);
      const { data, error } = await supabase
        .from(TABLE)
        .update(row)
        .eq('code', code)
        .eq('rev', expectedRev)
        .select('code')
        .maybeSingle();
      if (error) throw wrap('DB_ERROR', 'Could not update the room.', error);
      if (!data) throw wrap('CONFLICT', 'The room was modified by someone else.');
      return room;
    },

    async deleteRoom(code) {
      const { error } = await supabase.from(TABLE).delete().eq('code', code);
      if (error) throw wrap('DB_ERROR', 'Could not delete the room.', error);
    },
  };
}

function roomToRow(room) {
  return {
    code: room.code,
    created_at: room.createdAt,
    expires_at: room.expiresAt,
    last_activity_at: room.lastActivityAt,
    rev: room.rev,
    engine_state: room.engineState,
    members: room.members,
    join_attempts: room.joinAttempts ?? [],
  };
}

function rowToRoom(row) {
  return {
    code: row.code,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    lastActivityAt: Number(row.last_activity_at),
    rev: Number(row.rev),
    engineState: row.engine_state,
    members: row.members ?? [],
    joinAttempts: row.join_attempts ?? [],
  };
}
