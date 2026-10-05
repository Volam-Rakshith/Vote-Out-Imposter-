// Online game authority — environment-agnostic core.
//
// This module implements the authoritative server logic for Multiple Devices
// mode. It is imported by the Supabase edge function (Deno) AND by the Node
// test-suite (with an in-memory DB adapter), so the online rules can be
// integration-tested locally without any live service.
//
// Security model:
//   * Rooms are identified by a 6-char code; membership is authorized by a
//     256-bit per-player token (returned once, stored only as a SHA-256 hash).
//   * The engine (same module as the browser) computes all state transitions.
//   * Clients only ever receive the PUBLIC state + their own private slice.
//   * Host-only operations are validated here, never trusted from the client.
//
// DB adapter interface (all async):
//   getRoomByCode(code) -> room | null
//   createRoom(room) -> room                      (throws {code:'CODE_TAKEN'})
//   updateRoom(code, room, expectedRev) -> room   (throws {code:'CONFLICT'})
//   deleteRoom(code) -> void

import {
  createLobby, lobbyAddPlayer, lobbyRemovePlayer, lobbySetName, lobbySetConfig,
  startGame, acknowledgeRole, skipReveal, endDiscussion, castVote, endVoting,
  advance, submitGuess, endGuessing, playAgain, checkTimers, toPublicState, nextSpeaker,
  privateViewFor, isEngineError, createRng, randomHex, randomRoomCode,
  normalizeConfig, validateName, MAX_PLAYERS, ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET,
  ROOM_TTL_MS, ROOM_IDLE_TTL_MS, PRESENCE_TIMEOUT_MS, HOST_GRACE_MS, WORD_DB,
  PHASE,
} from '../../../engine/index.js';

export class ActionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
    this.status = status;
  }
}

const HOST_ONLY_ACTIONS = new Set([
  'set_config', 'start_game', 'skip_reveal', 'end_discussion', 'end_voting',
  'continue', 'end_guessing', 'play_again', 'close_room', 'remove_member',
  'next_speaker',
]);
const SELF_ACTIONS = new Set(['set_name', 'ack_role', 'cast_vote', 'submit_guess', 'leave_room']);

const MAX_BODY_CHARS = 8192;
const JOIN_ATTEMPT_WINDOW_MS = 60_000;
const JOIN_ATTEMPT_LIMIT = 10;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function assertString(value, field, { max = 200, min = 1 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ActionError('BAD_REQUEST', `Invalid value for "${field}".`);
  }
  return value;
}

function publicMembers(room, now) {
  return room.members
    .map((m) => ({
      playerId: m.playerId,
      name: m.name,
      isHost: m.playerId === room.engineState.hostId,
      connected: now - m.lastSeenAt < PRESENCE_TIMEOUT_MS,
    }))
    .sort((a, b) => a.joinedAtOffset - b.joinedAtOffset);
}

function buildResponse(room, playerId, now, extra = {}) {
  const pub = toPublicState(room.engineState);
  pub.room = {
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    hostId: room.engineState.hostId,
    phaseLabel: room.engineState.phase,
    members: publicMembers(room, now),
  };
  // The roster shown in the UI: engine players enriched with presence.
  pub.players = room.engineState.players.map((p) => {
    const m = room.members.find((x) => x.playerId === p.id);
    return {
      id: p.id,
      name: p.name,
      connected: m ? now - m.lastSeenAt < PRESENCE_TIMEOUT_MS : false,
    };
  });
  return {
    ok: true,
    roomCode: room.code,
    publicState: pub,
    private: playerId ? privateViewFor(room.engineState, playerId) : null,
    serverNow: now,
    ...extra,
  };
}

async function broadcastState(ctx, room) {
  if (typeof ctx.broadcast !== 'function') return;
  try {
    await ctx.broadcast(`room-${room.code}`, 'state', { rev: room.rev });
  } catch { /* best-effort: polling is the correctness fallback */ }
}

function loadRoomChecked(db, code, now) {
  return (async () => {
    const room = await db.getRoomByCode(code);
    if (!room) throw new ActionError('ROOM_NOT_FOUND', 'That room does not exist. Check the code and try again.', 404);
    const idleExpired = now - room.lastActivityAt > ROOM_IDLE_TTL_MS;
    if (now > room.expiresAt || idleExpired) {
      await db.deleteRoom(code).catch(() => {});
      throw new ActionError('ROOM_EXPIRED', 'This room has expired. The host can create a new room.', 410);
    }
    return room;
  })();
}

/** Presence refresh + deterministic host transfer when the host is gone. */
function updatePresenceAndHost(room, now) {
  const hostMember = room.members.find((m) => m.playerId === room.engineState.hostId);
  const hostConnected = hostMember && now - hostMember.lastSeenAt < PRESENCE_TIMEOUT_MS;
  const hostGone = hostMember && !hostConnected && now - hostMember.lastSeenAt > HOST_GRACE_MS;
  const hostMissing = !hostMember;
  if ((hostGone || hostMissing) && room.members.length > 1) {
    const candidates = room.members
      .filter((m) => m.playerId !== room.engineState.hostId && now - m.lastSeenAt < PRESENCE_TIMEOUT_MS)
      .sort((a, b) => a.joinedAtOffset - b.joinedAtOffset);
    if (candidates.length > 0) {
      room.engineState.hostId = candidates[0].playerId;
      room.hostTransferredAt = now;
    }
  }
}

async function runRoomAction(db, code, ctx, now, mutate) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoomChecked(db, code, now);
    const result = await mutate(room, now);
    if (!result.changed) return result.response; // read-only (sync with no changes)
    room.lastActivityAt = now;
    const expectedRev = room.rev;
    room.rev += 1;
    try {
      await db.updateRoom(code, room, expectedRev);
    } catch (e) {
      if (e && e.code === 'CONFLICT' && attempt < 2) continue; // retry with fresh state
      throw e;
    }
    await broadcastState(ctx, room);
    return result.response;
  }
  throw new ActionError('CONFLICT', 'The room just changed — please retry.', 409);
}

async function authMemberByToken(room, token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) {
    throw new ActionError('UNAUTHORIZED', 'Your session is missing or invalid — please rejoin the room.', 401);
  }
  const hash = await sha256Hex(token);
  const member = room.members.find((m) => m.tokenHash === hash);
  if (!member) {
    throw new ActionError('UNAUTHORIZED', 'Your session could not be restored. Please rejoin the room.', 401);
  }
  return member;
}

function requireHost(room, member) {
  if (room.engineState.hostId !== member.playerId) {
    throw new ActionError('FORBIDDEN', 'Only the host can do that.', 403);
  }
}

/**
 * Execute an authorized room action against the DB.
 * @returns response object (never contains other players' private data)
 */
export async function performAction(db, action, payload = {}, ctx = {}) {
  if (typeof action !== 'string' || action.length === 0 || action.length > 40) {
    throw new ActionError('BAD_REQUEST', 'Unknown action.');
  }
  const now = ctx.now ? ctx.now() : Date.now();
  const rng = ctx.rng || createRng();
  const wordDb = ctx.db || WORD_DB;
  const broadcast = ctx.broadcast;

  switch (action) {
    // ------------------------------------------------------------------ create
    case 'create_room': {
      const name = assertString(payload.name, 'name', { max: 24 });
      const nameCheck = validateName(name);
      if (!nameCheck.ok) throw new ActionError(nameCheck.error.code, nameCheck.error.message);
      const playerId = 'p_' + randomHex(6, () => rng.int(0x100000000));
      const token = randomHex(32, () => rng.int(0x100000000));
      const tokenHash = await sha256Hex(token);
      const hostConfig = payload.config ? normalizeConfig(payload.config) : undefined;

      let lastError = null;
      for (let i = 0; i < 12; i++) {
        const code = randomRoomCode(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, () => rng.int(0x100000000));
        const engineState = createLobby({
          host: { id: playerId, name: nameCheck.value },
          config: hostConfig,
          now,
          rng,
        });
        const room = {
          code,
          createdAt: now,
          expiresAt: now + ROOM_TTL_MS,
          lastActivityAt: now,
          rev: 1,
          engineState,
          members: [{
            playerId, name: nameCheck.value, tokenHash,
            joinedAtOffset: 0, joinedAt: now, lastSeenAt: now,
          }],
          joinAttempts: [],
        };
        try {
          await db.createRoom(room);
          await broadcastState(ctx, room);
          return { ...buildResponse(room, playerId, now, { token }) };
        } catch (e) {
          if (e && e.code === 'CODE_TAKEN') { lastError = e; continue; }
          throw e;
        }
      }
      throw new ActionError('ROOM_CREATE_FAILED', 'Could not generate a free room code. Please try again.', 500, { cause: lastError });
    }

    // ------------------------------------------------------------------ join
    // ------------------------------------------------------------------ join
    case 'join_room': {
      const code = assertString(payload.code, 'code', { max: 12 }).toUpperCase();
      const name = assertString(payload.name, 'name', { max: 24 });
      const nameCheck = validateName(name);
      if (!nameCheck.ok) throw new ActionError(nameCheck.error.code, nameCheck.error.message);

      const playerId = 'p_' + randomHex(6, () => rng.int(0x100000000));
      const token = randomHex(32, () => rng.int(0x100000000));
      const tokenHash = await sha256Hex(token);

      // The join attempt is recorded BEFORE validation so failed/probing
      // joins also count towards the rate limit.
      for (let attempt = 0; attempt < 4; attempt++) {
        const room = await loadRoomChecked(db, code, now);
        // Idempotency: if a previous attempt actually landed, return success.
        if (room.members.some((m) => m.playerId === playerId)) {
          return buildResponse(room, playerId, now, { token });
        }
        const attempts = (room.joinAttempts || []).filter((t) => now - t < JOIN_ATTEMPT_WINDOW_MS);
        attempts.push(now);
        const overLimit = attempts.length > JOIN_ATTEMPT_LIMIT;
        room.joinAttempts = attempts;
        room.lastActivityAt = now;
        let expected = room.rev;
        room.rev += 1;
        try {
          await db.updateRoom(code, room, expected);
        } catch (e) {
          if (e && e.code === 'CONFLICT' && attempt < 3) continue;
          throw e;
        }
        if (overLimit) {
          throw new ActionError('JOIN_RATE_LIMIT', 'Too many join attempts. Wait a minute and try again.', 429);
        }

        if (room.engineState.phase !== PHASE.LOBBY) {
          throw new ActionError(
            'GAME_IN_PROGRESS',
            'This game is already in progress. Rejoin with your registered player identity (refresh your original tab), or ask the host to start a new room.',
            409
          );
        }
        if (room.members.length >= MAX_PLAYERS) {
          throw new ActionError('ROOM_FULL', `The room is full (${MAX_PLAYERS} players maximum).`, 409);
        }
        try {
          room.engineState = lobbyAddPlayer(room.engineState, {
            player: { id: playerId, name: nameCheck.value },
            now,
          });
        } catch (e) {
          if (isEngineError(e)) throw new ActionError(e.code, e.message, 409);
          throw e;
        }
        room.members.push({
          playerId, name: nameCheck.value, tokenHash,
          joinedAtOffset: room.members.length, joinedAt: now, lastSeenAt: now,
        });

        expected = room.rev;
        room.rev += 1;
        try {
          await db.updateRoom(code, room, expected);
        } catch (e) {
          if (e && e.code === 'CONFLICT' && attempt < 3) continue;
          throw e;
        }
        await broadcastState(ctx, room);
        return buildResponse(room, playerId, now, { token });
      }
      throw new ActionError('CONFLICT', 'The room just changed — please retry.', 409);
    }


    case 'sync': {
      const code = assertString(payload.code, 'code', { max: 12 }).toUpperCase();
      return runRoomAction(db, code, ctx, now, async (room, now) => {
        const member = await authMemberByToken(room, payload.token);
        member.lastSeenAt = now;
        updatePresenceAndHost(room, now);
        // Authoritative deadline transitions (idempotent; engine bumps its own
        // rev on change). Sync always writes because lastSeenAt IS the
        // heartbeat that keeps presence accurate for everyone else.
        const { state } = checkTimers(room.engineState, { now });
        room.engineState = state;
        return { changed: true, response: buildResponse(room, member.playerId, now) };
      });
    }
  }

  // ---------------------------------------------------------------- host/self actions
  if (!HOST_ONLY_ACTIONS.has(action) && !SELF_ACTIONS.has(action)) {
    throw new ActionError('UNKNOWN_ACTION', `Unknown action "${action}".`, 404);
  }

  const code = assertString(payload.code, 'code', { max: 12 }).toUpperCase();
  return runRoomAction(db, code, ctx, now, async (room, now) => {
    const member = await authMemberByToken(room, payload.token);
    member.lastSeenAt = now;
    updatePresenceAndHost(room, now);
    const isHost = room.engineState.hostId === member.playerId;
    const engine = room.engineState;
    const pid = member.playerId;
    /** Run an engine mutation, translating engine errors to API errors. */
    const run = (fn) => {
      try {
        room.engineState = fn();
      } catch (e) {
        if (isEngineError(e)) throw new ActionError(e.code, e.message, 409);
        throw e;
      }
    };

    switch (action) {
      case 'set_name': {
        const name = assertString(payload.name, 'name', { max: 24 });
        if (engine.phase !== PHASE.LOBBY) throw new ActionError('WRONG_PHASE', 'Names are locked once the game starts.', 409);
        run(() => lobbySetName(engine, { playerId: pid, name }));
        member.name = room.engineState.players.find((p) => p.id === pid).name;
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'set_config': {
        requireHost(room, member);
        if (engine.phase !== PHASE.LOBBY) throw new ActionError('WRONG_PHASE', 'Settings are locked once the game starts.', 409);
        const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
        run(() => lobbySetConfig(engine, { config, db: wordDb }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'remove_member': {
        requireHost(room, member);
        if (engine.phase !== PHASE.LOBBY) throw new ActionError('WRONG_PHASE', 'The roster is locked once the game starts.', 409);
        const targetId = assertString(payload.playerId, 'playerId', { max: 24 });
        run(() => lobbyRemovePlayer(engine, { playerId: targetId }));
        room.members = room.members.filter((m) => m.playerId !== targetId);
        if (!room.members.length) {
          await db.deleteRoom(code);
          return { changed: false, response: { ok: true, roomCode: code, closed: true } };
        }
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'start_game': {
        requireHost(room, member);
        run(() => startGame(engine, { now, rng, db: wordDb }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'skip_reveal': {
        requireHost(room, member);
        run(() => skipReveal(engine, { now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'ack_role': {
        run(() => acknowledgeRole(engine, { playerId: pid, now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'end_discussion': {
        requireHost(room, member);
        run(() => endDiscussion(engine, { now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'next_speaker': {
        requireHost(room, member);
        run(() => nextSpeaker(engine, { now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'cast_vote': {
        const targetId = assertString(payload.targetId, 'targetId', { max: 24 });
        run(() => castVote(engine, { playerId: pid, targetId, now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'end_voting': {
        requireHost(room, member);
        run(() => endVoting(engine, { now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'continue': {
        requireHost(room, member);
        run(() => advance(engine, { now, rng, db: wordDb }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'submit_guess': {
        const guess = assertString(payload.guess, 'guess', { max: 80, min: 1 });
        run(() => submitGuess(engine, { playerId: pid, guess, now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'end_guessing': {
        requireHost(room, member);
        run(() => endGuessing(engine, { now }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'play_again': {
        requireHost(room, member);
        run(() => playAgain(engine, { now, rng, db: wordDb }));
        return { changed: true, response: buildResponse(room, pid, now) };
      }
      case 'leave_room': {
        if (engine.phase === PHASE.LOBBY) {
          run(() => lobbyRemovePlayer(engine, { playerId: pid }));
          room.members = room.members.filter((m) => m.playerId !== pid);
          if (!room.members.length) {
            await db.deleteRoom(code);
            return { changed: false, response: { ok: true, roomCode: code, closed: true } };
          }
          return { changed: true, response: buildResponse(room, null, now) };
        }
        // In-game leaving: identity is kept; presence will show them offline.
        return { changed: true, response: { ok: true, roomCode: code, left: true } };
      }
      case 'close_room': {
        requireHost(room, member);
        await db.deleteRoom(code);
        if (typeof broadcast === 'function') {
          try { await broadcast(`room-${code}`, 'closed', { code }); } catch { /* best-effort */ }
        }
        return { changed: false, response: { ok: true, roomCode: code, closed: true } };
      }
      default:
        throw new ActionError('UNKNOWN_ACTION', `Unknown action "${action}".`, 404);
    }
  });
}

/** Validate raw HTTP body size/type before parsing (edge function helper). */
export function assertPayloadSize(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BODY_CHARS) {
    throw new ActionError('BAD_REQUEST', 'Invalid request body.', 400);
  }
}
