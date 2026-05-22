import { describe, it, expect } from 'vitest';
import {
  validatePlayerAction,
  computeAdjustedTime,
  isValidAction,
  isValidTimestamp,
  PLAYER_ACTIONS,
} from '../playerActionValidation';

describe('playerActionValidation — validatePlayerAction', () => {
  it('rejects an unauthenticated socket', () => {
    const res = validatePlayerAction(
      { authenticated: false, roomId: 'r1' },
      'r1',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('NOT_AUTHENTICATED');
  });

  it('rejects an authenticated socket that is not in any room', () => {
    const res = validatePlayerAction(
      { authenticated: true, roomId: undefined },
      'r1',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('NOT_ROOM_MEMBER');
  });

  it('rejects an authenticated socket targeting a different room', () => {
    const res = validatePlayerAction(
      { authenticated: true, roomId: 'r2' },
      'r1',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('NOT_ROOM_MEMBER');
  });

  it('accepts an authenticated non-host user that belongs to the target room', () => {
    // Free-for-all model: host status is NOT checked.
    const res = validatePlayerAction(
      { authenticated: true, roomId: 'r1' },
      'r1',
    );
    expect(res.ok).toBe(true);
  });
});

describe('playerActionValidation — computeAdjustedTime', () => {
  it('adds half of the latency (in seconds) to currentTime', () => {
    // 400ms latency → +0.2s → 10 + 0.2 = 10.2
    const { latencyMs, adjustedTime } = computeAdjustedTime(10, 1_000, 1_400);
    expect(latencyMs).toBe(400);
    expect(adjustedTime).toBeCloseTo(10.2, 6);
  });

  it('returns currentTime unchanged when there is no measurable latency', () => {
    const { latencyMs, adjustedTime } = computeAdjustedTime(42, 5_000, 5_000);
    expect(latencyMs).toBe(0);
    expect(adjustedTime).toBe(42);
  });

  it('clamps future-dated client timestamps (negative latency) to 0', () => {
    const { latencyMs, adjustedTime } = computeAdjustedTime(7, 10_000, 9_000);
    expect(latencyMs).toBe(0);
    expect(adjustedTime).toBe(7);
  });

  it('compensates a 2-second round trip with +1s adjustment', () => {
    // 2000ms latency → +1.0s
    const { adjustedTime } = computeAdjustedTime(30, 0, 2000);
    expect(adjustedTime).toBeCloseTo(31, 6);
  });
});

describe('playerActionValidation — isValidAction', () => {
  it('accepts every allow-listed action', () => {
    for (const action of PLAYER_ACTIONS) {
      expect(isValidAction(action)).toBe(true);
    }
  });

  it('rejects unknown action strings', () => {
    expect(isValidAction('stop')).toBe(false);
    expect(isValidAction('PLAY')).toBe(false);
    expect(isValidAction('rewind')).toBe(false);
  });

  it('rejects empty strings and non-string values', () => {
    expect(isValidAction('')).toBe(false);
    expect(isValidAction(undefined)).toBe(false);
    expect(isValidAction(null)).toBe(false);
    expect(isValidAction(42)).toBe(false);
    expect(isValidAction({})).toBe(false);
  });
});

describe('playerActionValidation — isValidTimestamp', () => {
  it('accepts a positive finite number (typical Date.now() value)', () => {
    expect(isValidTimestamp(1_700_000_000_000)).toBe(true);
    expect(isValidTimestamp(1)).toBe(true);
  });

  it('rejects zero, negative values, and non-finite numbers', () => {
    expect(isValidTimestamp(0)).toBe(false);
    expect(isValidTimestamp(-1)).toBe(false);
    expect(isValidTimestamp(Number.NaN)).toBe(false);
    expect(isValidTimestamp(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects non-number types', () => {
    expect(isValidTimestamp(undefined)).toBe(false);
    expect(isValidTimestamp(null)).toBe(false);
    expect(isValidTimestamp('1700000000000')).toBe(false);
    expect(isValidTimestamp({})).toBe(false);
  });
});
