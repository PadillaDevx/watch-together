# Plan

## Problem

Implement a hybrid multimedia synchronization architecture in WatchJunto to support two categories of video providers with different capabilities. Smart Sync providers (e.g., Power Rangers) support postMessage API enabling full playback control (play/pause/seek) with real-time currentTime reporting, while Passive Sync providers (e.g., Coraje/cubeembed) have no external API and support only episode-start-time synchronization.

Current implementation has critical gaps:
1. Host takeover logic (automatic promotion when host disconnects) is not implemented
2. Host badge visibility is restricted to host only; should be visible to all participants with subtle styling
3. `player-action` validation lacks strict enforcement that only authenticated participants can emit (not host-only)
4. Socket.IO event interfaces are incomplete; events like `host-changed`, `series-episode-change` are missing type definitions
5. Free-for-all playback control model is not fully integrated in client code

These gaps prevent proper host management, break the free-for-all playback model, and leave socket handlers vulnerable to type errors.

## Solution

Implement a four-layer architecture:

**Layer 1 — Provider Detection:** Auto-detect smart vs passive capability on iframe load with 2s silent fallback to passive and domain-based caching.

**Layer 2 — Smart Sync (Free-for-All):** Any authenticated participant emits `player-action` (play/pause/seek); server broadcasts via `player-sync` with latency compensation. Host role used only for UI badge + metadata, not permission control.

**Layer 3 — Passive Sync (Coordinated Start):** All participants emit `client-ready`; server waits for all-ready OR 8s timeout; server emits `start-playback` with synchronized `playAt` timestamp. Manual resync via `request-resync` → `resync-state`.

**Layer 4 — Host Management:** First joiner becomes host. On host disconnect, server selects next user by earliest `joinedAt`. Server broadcasts `host-changed` event to all participants. Discrete host badge visible to everyone, updates live.

Sequential implementation phases ensure minimal regression and allow incremental testing.

---

### Feature 1: Host Takeover Logic (Server)

**Objective:** Implement automatic host tracking and transfer mechanism. When current host disconnects or leaves room, automatically promote next user based on earliest `joinedAt` timestamp. Broadcast `host-changed` event to all room participants.

**Files touched:**
- `apps/server/src/services/rooms.ts`: Add `hostUserId` and `hostUsername` fields to Room; implement `promoteNextHost(roomId)` function selecting user with earliest joinedAt; update room initialization to mark first joiner as host.
- `apps/server/src/socket/index.ts`: Modify `disconnect` and `leave-room` handlers to detect if departing user is host; call `promoteNextHost` and broadcast `host-changed` event if promotion occurs.
- `apps/server/src/types.ts`: Extend Room interface to include `hostUserId?: string` and `hostUsername?: string`; extend RoomUser interface to ensure `joinedAt: Date` is present; add `host-changed` to ServerToClientEvents interface.
- `docs/host-management.md`: New documentation file explaining host takeover mechanism, ordering logic, and fallback behavior.

**Acceptance Criteria:**
- First joiner to room is automatically set as host.
- When host leaves/disconnects, next user by earliest joinedAt becomes new host.
- `host-changed` event broadcasts to room with new host username and socket ID.
- `readyUsers` set unaffected by host change (passive sync readiness preserved).
- No race conditions if host and another user disconnect simultaneously.

**Tasks:**
- [x] Add `hostUserId` and `hostUsername` fields to Room type in `apps/server/src/types.ts`
- [x] Verify `RoomUser` interface has `joinedAt: Date` field; add if missing
- [x] Add `host-changed` event to `ServerToClientEvents` interface: `'host-changed': (data: { newHostUsername: string; newHostSocketId: string; previousHostUsername?: string }) => void;`
- [x] In `apps/server/src/services/rooms.ts`, implement `promoteNextHost(roomId: string)` function that selects user with minimum `joinedAt` timestamp
- [x] Update room creation in `rooms.ts` to mark first joined user as host via `joinRoom()` method or equivalent
- [x] Update `disconnect` handler in `apps/server/src/socket/index.ts` to check if disconnected user is host; call `promoteNextHost` if true
- [x] Update `leave-room` handler to check if departing user is host; call `promoteNextHost` if true
- [x] In both handlers, broadcast `host-changed` event to room with new host info via `io.to(roomId).emit('host-changed', ...)`
- [x] Add unit tests in `apps/server/src/services/__tests__/` for `promoteNextHost` function covering: single user, multiple users, correct ordering by joinedAt, no users left
- [x] Create `docs/host-management.md` documenting host selection algorithm, joinedAt ordering, host transfer on disconnect, and fault tolerance
- [x] Write JSDoc and update docs/
- [x] Build & prettier syntax check
- [x] Write and run tests
- [x] Pass code review
- [x] Commit

---

### Feature 2: Strict Server-Side player-action Validation (Free-for-All Model)

**Objective:** Implement strict server-side validation of `player-action` events enforcing that only authenticated room participants can emit playback commands, NOT requiring host status. Remove any host-gating. Add latency compensation for `adjustedTime` calculation.

**Files touched:**
- `apps/server/src/socket/index.ts`: Update `player-action` handler to validate `socket.data.authenticated === true` AND `socket.data.roomId === payload.roomId`; reject with `error` event if validation fails; forward via `player-sync` with latency compensation.
- `apps/server/src/middleware/auth.ts`: Ensure socket auth context populates `socket.data.userId`, `socket.data.username`, `socket.data.authenticated` before handlers run.

**Acceptance Criteria:**
- Non-authenticated user emit `player-action` → server rejects with `error` event, no broadcast.
- Authenticated non-host participant emits `player-action` → event broadcasts to room via `player-sync` (host NOT required).
- Latency compensation applied: `adjustedTime = currentTime + (latencyMs / 2000)` included in `player-sync` payload.
- Host still visible in UI but has no special permission for playback control.

**Tasks:**
- [x] Review `apps/server/src/middleware/auth.ts` and verify socket.data initialization with `authenticated`, `userId`, `username`, `roomId`
- [x] In `apps/server/src/socket/index.ts`, locate `player-action` handler
- [x] Replace any host-gating logic (if `socket.data.isHost` check exists) with authenticated + room participant check only
- [x] Implement validation: `if (!socket.data.authenticated || socket.data.roomId !== payload.roomId) { socket.emit('error', { message: 'Unauthorized' }); return; }`
- [x] Add latency compensation: calculate `const latencyMs = Date.now() - payload.timestamp; const adjustedTime = payload.currentTime + (latencyMs / 2000);`
- [x] Update `player-sync` broadcast to include `adjustedTime` in payload
- [x] Add integration tests in `apps/server/src/socket/__tests__/` covering: authenticated non-host emits play/pause/seek; unauthenticated emit rejected; room membership validated
- [x] Add latency compensation test: verify adjustedTime calculation with mock timestamps
- [x] Create `docs/playback-control-model.md` documenting free-for-all player-action model, validation rules, and latency compensation
- [x] Write JSDoc and update docs/
- [x] Build & prettier syntax check
- [x] Write and run tests
- [x] Pass code review
- [x] Commit

---

### Feature 3: Discrete Host Badge Visible to All

**Objective:** Implement host badge UI component visible to all room participants. Badge shows current host identity, updates live on `host-changed`, and styled discretely without overlapping player controls.

**Files touched:**
- `apps/client/src/store.ts`: Add `roomHostUsername` field to AppStore; add setter `setRoomHostUsername(username: string | null)`.
- `apps/client/src/components/SyncProvider.tsx`: Create host badge component (small pill, Crown icon from lucide-react, host username); receive `hostUsername` prop; render badge in top-left corner z-20 with pointer-events-none.
- `apps/client/src/pages/RoomPage.tsx`: Register `host-changed` socket listener; dispatch store update on event; initialize host from `room-users` payload on join.
- `apps/server/src/socket/index.ts`: Include `hostUsername` in `room-users` payload so new joiners receive current host info.
- `docs/host-ui.md`: New documentation for host badge UI spec, styling, positioning, and real-time updates.

**Acceptance Criteria:**
- Host badge visible to all users in room (no host-only gating).
- Badge updates instantly on `host-changed` broadcast.
- Badge text displays host username; Crown icon from lucide-react (size 10px).
- Style: `bg-violet-700/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-full`.
- Position: top-left of player, z-20, pointer-events-none (does not block clicks).
- No visual overlap with player controls.
- Tooltip on hover shows full host username.

**Tasks:**
- [x] In `apps/client/src/store.ts`, add `roomHostUsername: string | null = null` field to AppStore interface
- [x] Add `setRoomHostUsername: (username: string | null) => void` reducer to store
- [x] In `apps/client/src/components/SyncProvider.tsx`, create HostBadge sub-component receiving `hostUsername` prop
- [x] Implement HostBadge styling: pill with violet background, Crown icon (lucide-react), username text, tooltip
- [x] Render HostBadge in SyncProvider JSX at top-left with z-20, pointer-events-none
- [x] In `apps/client/src/pages/RoomPage.tsx`, add socket listener for `host-changed` event: `socket.on('host-changed', ({ newHostUsername }) => { setRoomHostUsername(newHostUsername); })`
- [x] Extract current host from `room-users` payload on join and dispatch `setRoomHostUsername`
- [x] In `apps/server/src/socket/index.ts`, update `room-users` event payload to include `hostUsername: room.hostUsername`
- [x] Test HostBadge rendering with mock `hostUsername`
- [x] Test real-time update: simulate `host-changed` event and verify badge updates
- [x] Create `docs/host-ui.md` documenting badge UI spec, styling rules, positioning, and real-time sync behavior
- [x] Write JSDoc and update docs/
- [x] Build & prettier syntax check
- [x] Write and run tests
- [x] Pass code review
- [x] Commit

---

### Feature 4: Socket.IO Type Safety Hardening

**Objective:** Achieve complete type coverage for all Socket.IO events exchanged between client and server. Add missing event type definitions to `ClientToServerEvents` and `ServerToClientEvents` interfaces. Eliminate `@ts-ignore` and `as any` in socket handlers.

**Files touched:**
- `apps/server/src/types.ts`: Verify/extend `ClientToServerEvents` and `ServerToClientEvents` interfaces; add missing event signatures including `host-changed`, `series-episode-change`, `client-ready`, `request-resync`, `resync-state`, `start-playback`, `player-sync`, `player-heartbeat`.
- `apps/client/src/lib/socket.ts`: Update Socket.IO client type to mirror server types from `apps/server/src/types.ts`; import and apply same event interfaces.

**Acceptance Criteria:**
- `npx tsc --noEmit` passes on `apps/server` with strict mode enabled.
- `npx tsc --noEmit` passes on `apps/client` with strict mode enabled.
- No `@ts-ignore` or `as any` in socket handlers.
- All emitted events (socket.emit, io.to().emit) have corresponding type signatures.
- All received events (socket.on, socket.once) have corresponding type signatures.

**Tasks:**
- [ ] In `apps/server/src/types.ts`, verify existing `ClientToServerEvents` interface; document current events
- [ ] Add `host-changed` to `ServerToClientEvents` if not present (from Feature 1)
- [ ] Add/verify `series-episode-change`, `client-ready`, `request-resync`, `resync-state`, `start-playback`, `player-sync`, `player-heartbeat` to both event interfaces
- [ ] In `apps/client/src/lib/socket.ts`, import event types from server `types.ts` or create mirror interfaces matching server
- [ ] Search codebase for `@ts-ignore` comments in socket handlers; replace with proper type annotations
- [ ] Search codebase for `as any` in socket context; replace with proper type casting or interface refinement
- [ ] Run `npx tsc --noEmit` in `apps/server`; resolve any type errors
- [ ] Run `npx tsc --noEmit` in `apps/client`; resolve any type errors
- [ ] Add TypeScript strict mode validation test: verify no `noImplicitAny` errors in socket code
- [ ] Document event signatures in code comments with payload examples for clarity
- [ ] Create `docs/socket-types.md` documenting Socket.IO event interfaces, payload schemas, and type safety practices
- [ ] Write JSDoc and update docs/
- [ ] Build & prettier syntax check
- [ ] Write and run tests
- [ ] Pass code review
- [ ] Commit

---

### Feature 5: Client Integration of Free-for-All + Host Badge

**Objective:** Integrate free-for-all playback control model and host badge into client UI without regressions. Remove any host-gating from client playback emit logic. Ensure useSmartSync and usePassiveSync work correctly regardless of user host status. Verify end-to-end flow with host changes mid-playback.

**Files touched:**
- `apps/client/src/hooks/useSmartSync.ts`: Remove `if (isHost)` guards from `player-action` emit statements; allow any authenticated user to emit play/pause/seek; preserve host info for UI only.
- `apps/client/src/hooks/usePassiveSync.ts`: Verify passive sync flow works regardless of host status; no functional changes required if already stateless.
- `apps/client/src/pages/RoomPage.tsx`: Subscribe to `host-changed`; pass `hostUsername` to SyncProvider component; initialize host state on room join.
- `apps/client/src/components/SyncProvider.tsx`: Accept `hostUsername` prop; render via HostBadge component (from Feature 3); pass through to child components as needed.

**Acceptance Criteria:**
- Non-host user can emit `player-action` without errors or permission denials.
- Host badge updates in real-time on host changes without affecting playback synchronization.
- User A creates room (becomes host) → emits play → User B receives sync without errors.
- User B joins and emits seek → User A receives sync; no permission error.
- Host A disconnects → User B promoted → User B can emit play/pause/seek.
- No regression: passive sync LoadingOverlay still appears; drift correction still functions; resync button still works.

**Tasks:**
- [ ] In `apps/client/src/hooks/useSmartSync.ts`, locate `socket.emit('player-action', ...)` calls
- [ ] Remove any `if (isHost) { ... }` guards wrapping these emits
- [ ] Ensure emits execute regardless of host status (for authenticated users only — server validates)
- [ ] Verify `useSmartSync` receives `hostUsername` only for UI badge purposes, not control logic
- [ ] In `apps/client/src/hooks/usePassiveSync.ts`, verify `client-ready`, `start-playback`, `request-resync` flows don't depend on host status
- [ ] Confirm LoadingOverlay and PlayInstruction display correctly regardless of user role
- [ ] In `apps/client/src/pages/RoomPage.tsx`, add `socket.on('host-changed', ...)` listener
- [ ] Dispatch store action to update `roomHostUsername` on host-changed event
- [ ] Extract host username from initial `room-users` payload and initialize store
- [ ] Pass `hostUsername` from store to SyncProvider component
- [ ] In `apps/client/src/components/SyncProvider.tsx`, accept `hostUsername` prop
- [ ] Render HostBadge component with `hostUsername`; verify badge updates on prop change
- [ ] Integration test: simulate host change mid-playback; verify badge updates; verify non-host can continue emitting playback actions
- [ ] Regression test: verify passive sync flow unchanged with host changes; verify drift correction still functions; verify resync button accessible
- [ ] Create or update `docs/client-playback-flow.md` documenting free-for-all client-side flow, host badge integration, and no-regression checklist
- [ ] Write JSDoc and update docs/
- [ ] Build & prettier syntax check
- [ ] Write and run tests
- [ ] Pass code review
- [ ] Commit

---

### Feature 6: End-to-End Verification and Regression Testing

**Objective:** Comprehensive verification that all four layers (Provider Detection, Smart Sync, Passive Sync, Host Management) work end-to-end without regressions. Validate smart-sync provider, passive provider, and forced host disconnect scenarios. Confirm TypeScript strict mode passes; confirm existing test suites pass.

**Files touched:**
- `apps/server/src/`: All modified modules from Features 1–5 (rooms.ts, socket/index.ts, types.ts, middleware/auth.ts).
- `apps/client/src/`: All modified modules from Features 1–5 (store.ts, SyncProvider.tsx, RoomPage.tsx, useSmartSync.ts, usePassiveSync.ts, lib/socket.ts).
- Test suites: `apps/server/src/socket/__tests__/`, `apps/client/src/hooks/__tests__/`, component tests.
- `docs/end-to-end-verification.md`: Checklist and verification scenarios.

**Acceptance Criteria:**
- Smart-sync provider (Power Rangers): User A controls playback → User B syncs in real-time without permission errors.
- Passive-sync provider (Coraje): All users see LoadingOverlay → server emits start-playback → users click play → synchronized playback starts.
- Host disconnect: Host A drops → Host B automatically promoted → Host C (originally guest) can now emit playback actions without errors.
- TypeScript strict mode: `npx tsc --noEmit` passes in both apps with zero errors.
- Test suites: All existing + new tests pass; no regressions in useWatchProgress, useSeriesNavigation, useHlsPlayer tests.
- No broken styles, no console errors in browser DevTools.

**Tasks:**
- [ ] Run `npx tsc --noEmit` in `apps/server`; confirm zero errors in strict mode
- [ ] Run `npx tsc --noEmit` in `apps/client`; confirm zero errors in strict mode
- [ ] Run full test suite in `apps/server` (if applicable); verify all pass
- [ ] Run full test suite in `apps/client`; verify existing tests in `__tests__/` pass with no regressions
- [ ] Manual smoke test — Smart Sync (Power Rangers URL): A creates room → B joins → A play → B sync → B seek → A sync → A disconnect → B promoted → B continues
- [ ] Manual smoke test — Passive Sync (Coraje/cubeembed URL): LoadingOverlay → server start-playback → PlayInstruction → synced playback → ResyncButton modal
- [ ] Manual smoke test — Host Takeover mid-playback: force A disconnect, verify badge updates on B within 2s, no playback stutter
- [ ] Verify no console errors in browser DevTools across all tests
- [ ] Verify no TypeScript type errors; no `@ts-ignore` workarounds added
- [ ] Verify video player styling unchanged; no badge overlap or visual regression
- [ ] Create `docs/end-to-end-verification.md` documenting all verification scenarios, test URLs, and acceptance criteria
- [ ] Document any known limitations or follow-up improvements
- [ ] Write JSDoc and update docs/
- [ ] Build & prettier syntax check
- [ ] Write and run tests
- [ ] Pass code review
- [ ] Commit
