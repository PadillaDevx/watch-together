# Code Review — Feature 2: Strict Server-Side player-action Validation

**Branch:** `feat/host-takeover-sync`
**Status:** PASS with 2 Medium findings

## Findings

### Medium 1 — Missing action type validation

- **File:** `apps/server/src/socket/index.ts` (around the `player-action` handler, lines ~201-230)
- **Problem:** Handler accepts `action` as a generic string without validating it is one of: `'play' | 'pause' | 'seek' | 'load' | 'episode-change'`. A client can send `action: 'invalid'` and the server broadcasts a `player-sync` violating the type contract.
- **Suggested change:** Whitelist `validActions` and emit `error` with `code: 'INVALID_ACTION'` when not in the list. Reject early before mutating room state.

### Medium 2 — Timestamp fallback defeats latency compensation

- **File:** `apps/server/src/socket/index.ts` (player-action handler, ~line 220)
- **Problem:** If client omits `timestamp`, server falls back to `Date.now()`. This makes `latencyMs = 0` and zeroes the compensation. Although current clients always send timestamp, the contract is loose.
- **Suggested change:** Require a numeric `timestamp > 0`; otherwise emit `error` with `code: 'INVALID_TIMESTAMP'` and return. Remove the silent fallback.

## Verified

- Validation enforces authenticated + room membership only (no host gating).
- `computeAdjustedTime` correctly handles clock skew, zero latency, and 2s round trip.
- `error` event properly typed in `ServerToClientEvents`.
- Backward compatibility: `player-sync` keeps `currentTime` and adds optional `adjustedTime`.
- `docs/playback-control-model.md` is thorough.
- JSDoc present on new helpers.
- No `@ts-ignore` or `as any`.
- Pause path intentionally uses `rawCurrentTime` (documented).
- Tests: 19/19 pass.

## Action Items

1. (Medium) Validate `action` against allow-list; reject invalid.
2. (Medium) Validate `timestamp` is required positive number; reject otherwise.
3. Add tests in `playerActionValidation.test.ts` (or new helper test) covering both validations.
