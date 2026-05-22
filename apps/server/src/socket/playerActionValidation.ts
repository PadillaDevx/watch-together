/**
 * @file Pure helpers for the `player-action` socket handler.
 *
 * The free-for-all playback model authorises ANY authenticated user that is
 * currently a member of the target room to emit `player-action` events
 * (play / pause / seek / load / episode-change). Host status is NOT required;
 * the host role is only used for UI badges and metadata.
 *
 * These helpers are extracted as pure functions so they can be unit-tested
 * without spinning up a real Socket.IO server.
 */

/**
 * Minimal shape of the `socket.data` object inspected by `player-action`
 * validation. Mirrors the relevant subset of {@link import('../types').SocketData}.
 */
export interface PlayerActionAuthContext {
  authenticated: boolean;
  /** Room ID the socket joined via `join-room` (set in the server handler). */
  roomId?: string | undefined;
}

/** Result of {@link validatePlayerAction}. */
export type PlayerActionValidationResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_AUTHENTICATED' | 'NOT_ROOM_MEMBER' };

/**
 * Allow-list of `action` values accepted by the `player-action` socket
 * handler. Any other value is rejected with an `INVALID_ACTION` error.
 */
export const PLAYER_ACTIONS = [
  'play',
  'pause',
  'seek',
  'load',
  'episode-change',
] as const;

/** Union of the allow-listed player actions. */
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

/**
 * Type guard for the `player-action` `action` field. Returns `true` only when
 * `action` matches one of the allow-listed {@link PLAYER_ACTIONS}.
 */
export function isValidAction(action: unknown): action is PlayerAction {
  return (
    typeof action === 'string' &&
    (PLAYER_ACTIONS as readonly string[]).includes(action)
  );
}

/**
 * Type guard for the `player-action` `timestamp` field. Timestamps must be a
 * finite, strictly-positive number (milliseconds since epoch). Non-number
 * values, `NaN`, `Infinity`, and `0`/negative values are rejected.
 */
export function isValidTimestamp(timestamp: unknown): timestamp is number {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0;
}

/**
 * Validate a `player-action` payload against the socket's auth context.
 *
 * Rules (free-for-all model):
 * 1. The socket MUST be authenticated (`authenticated === true`).
 * 2. The socket MUST belong to the room it is targeting
 *    (`socket.data.roomId === payload.roomId`).
 *
 * Host status is intentionally NOT checked here.
 *
 * @param ctx     Auth context extracted from `socket.data`.
 * @param roomId  Room ID from the incoming payload.
 */
export function validatePlayerAction(
  ctx: PlayerActionAuthContext,
  roomId: string,
): PlayerActionValidationResult {
  if (!ctx.authenticated) return { ok: false, reason: 'NOT_AUTHENTICATED' };
  if (!ctx.roomId || ctx.roomId !== roomId) {
    return { ok: false, reason: 'NOT_ROOM_MEMBER' };
  }
  return { ok: true };
}

/**
 * Compute a latency-compensated playback position.
 *
 * Network latency is approximated as `now - clientTimestamp`. We assume the
 * one-way trip is roughly half of the round-trip, so we add `latencyMs / 2000`
 * seconds (half of the latency expressed in seconds) to `currentTime`.
 *
 * The compensated value is always returned in seconds (matching the rest of
 * the playback time domain).
 *
 * @param currentTime     Client-reported playback position, in seconds.
 * @param clientTimestamp Client clock (`Date.now()`) at the moment the action
 *                        was emitted.
 * @param now             Server clock, defaults to `Date.now()`. Injectable
 *                        for deterministic tests.
 */
export function computeAdjustedTime(
  currentTime: number,
  clientTimestamp: number,
  now: number = Date.now(),
): { latencyMs: number; adjustedTime: number } {
  // Clamp negative latency (clock skew, future-dated timestamps) to 0 so we
  // never rewind playback below the reported `currentTime`.
  const latencyMs = Math.max(0, now - clientTimestamp);
  const adjustedTime = currentTime + latencyMs / 2000;
  return { latencyMs, adjustedTime };
}
