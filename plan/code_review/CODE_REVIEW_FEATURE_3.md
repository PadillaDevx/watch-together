# Code Review — Feature 3: Discrete Host Badge Visible to All

**Branch:** `feat/host-takeover-sync`
**Status:** FAIL — 1 Critical + 2 Medium findings block merge

## Findings

### Critical 1 — Missing host initialization from `room-users`

- **Files:** `apps/server/src/socket/index.ts` (`getRoomUsers()` helper, ~lines 17-26) AND `apps/client/src/pages/RoomPage.tsx` (room-join flow)
- **Problem:** Plan Phase 3 requires "initialize host from `room-users` payload on join". Server's `getRoomUsers()` returns only `{ socketId, username, joinedAt }` — no `hostUsername`. Client does not extract host info from the payload.
- **Impact:** Users joining a room with an existing host won't see the badge until the next `host-changed` event (which may never happen). The Feature 1 fixup emits `host-changed` unicast to a joining non-host user, which partially mitigates this, but the design intent in the plan was to surface host info in `room-users` for consistency.
- **Suggested change:** Either
  - (A) Extend the `room-users` socket payload shape to include current host info (`hostUsername`, `hostSocketId`). Update typed event signature in `apps/server/src/types.ts` and consume on the client. OR
  - (B) Accept the Feature 1 unicast as the canonical mechanism and document it clearly in `docs/host-ui.md`. Note: this requires ensuring the unicast fires for BOTH the becameHost case and the joined-existing-host case (Feature 1 covers only the non-host case). Add unicast for the becameHost case too (see Medium 2 below).

### Medium 1 — First joiner does not receive `host-changed` unicast

- **File:** `apps/server/src/socket/index.ts` (`join-room` handler, ~lines 76-90)
- **Problem:** When the joiner becomes the first host, the server emits `host-changed` only via room broadcast. If Socket.IO's broadcast does not include the originating socket by default, the new host's own client may not receive the event needed to initialize the badge for itself.
- **Suggested change:** Emit `socket.emit('host-changed', { newHostUsername, newHostSocketId })` directly to the joining socket BEFORE/IN ADDITION TO the room broadcast. Or use `io.to(roomId).emit(...)` which includes the socket.

### Medium 2 — `isHost` derived from `createdByUsername`, not current host

- **File:** `apps/client/src/pages/RoomPage.tsx` (~line 881)
- **Problem:** `isHost={room?.createdByUsername === user?.username}` ties host status to the room creator. After Feature 1 takeover, the actual host can change at runtime, but this derived value remains stuck on the original creator.
- **Impact:** UI elements gated by `isHost` (if any) will not reflect actual host. Currently the playback model is free-for-all, so this is mostly cosmetic, but it's semantically wrong.
- **Suggested change:** Derive `isHost` from store: `isHost={roomHostUsername === user?.username}` where `roomHostUsername` is read from the store updated by `host-changed`.

### Minor — Store does not reset `roomHostUsername` on logout

- **File:** `apps/client/src/store.ts` (around `logout()` action)
- **Problem:** `roomHostUsername` may leak across sessions / logins.
- **Suggested change:** Reset `roomHostUsername: null` in `logout()` and ideally on leave-room.

## Verified

- `HostBadge` component is well-implemented with correct Tailwind classes, truncation, tooltip via `title` attr, Crown icon, pointer-events-none, z-20.
- Store uses Zustand pattern consistently.
- Socket listener has proper cleanup in useEffect return.
- `docs/host-ui.md` exists and is descriptive.
- 5/5 HostBadge unit tests pass.
- TypeScript strict passes on apps/client.

## Action Items

1. (Critical) Pick option A or B for `room-users` host initialization. Recommended: Option A — extend `room-users` payload typed shape; updates server, client, and types in one cohesive change. OR Option B — guarantee unicast covers all cases (also fixes Medium 1).
2. (Medium) Ensure first joiner receives `host-changed` for themselves.
3. (Medium) Switch `isHost` derivation to `roomHostUsername === user?.username`.
4. (Minor) Reset `roomHostUsername` on logout (and on leave-room as a robustness improvement).
5. Add 1–2 integration tests covering: late joiner sees host badge, takeover updates badge.
