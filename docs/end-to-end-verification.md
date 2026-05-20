# End-to-End Verification — Host Takeover & Sync Architecture

Final verification record for the `feat/host-takeover-sync` branch (Features 1–5 of
`plan/PLAN.md` / `plan/TASKS.md`). This document captures the architecture as
shipped, the automated checks executed by Feature 6, and the manual smoke tests
the maintainer should run before merging.

---

## 1. Architecture Summary — Four Layers

The synchronization stack is intentionally split into orthogonal layers so a
single provider class (smart vs. passive) and a single role transition (host
takeover) can each be reasoned about in isolation.

### Layer 1 — Provider Detection

Implemented by `apps/client/src/hooks/useProviderDetection.ts`. The iframe is
probed with a postMessage handshake on mount; if no acknowledgement arrives
within the silent 2 s timeout the provider is classified as **passive**,
otherwise as **smart**. Results are cached by domain so the same provider does
not get re-probed on every navigation.

### Layer 2 — Smart Sync (Free-for-All)

Implemented by `apps/client/src/hooks/useSmartSync.ts` and the server
`player-action` handler in `apps/server/src/socket/index.ts`.

- Any authenticated participant emits `player-action` (`play` / `pause` /
  `seek`). Host role is **not** a permission gate.
- The server validates `socket.data.authenticated === true` and
  `socket.data.roomId === payload.roomId` only, then rebroadcasts via
  `player-sync` with latency compensation
  (`adjustedTime = currentTime + (Date.now() - timestamp) / 2000`).
- The current host plays the **drift-reference** role: it broadcasts its own
  `timeupdate` position as `action: 'seek'` every tick plus a 15 s `getTime`
  heartbeat. Non-hosts silently converge towards that reference when drift
  exceeds 2 s; drifts above 5 s also flash a 1 s spinner.

### Layer 3 — Passive Sync (Coordinated Start)

Implemented by `apps/client/src/hooks/usePassiveSync.ts` and the
`client-ready` / `start-playback` / `request-resync` / `resync-state` handlers
on the server.

- Every participant emits `client-ready` once the iframe is mounted.
- Server fires `start-playback` once either all peers are ready or an 8 s
  timeout elapses; the payload includes a synchronized `playAt` epoch.
- A manual `request-resync` round-trip resolves drift after the fact when no
  postMessage API is available.

### Layer 4 — Host Management

Implemented by `apps/server/src/services/rooms.ts` (`promoteNextHost`) and the
disconnect / leave handlers in `apps/server/src/socket/index.ts`.

- The first user to `join-room` becomes host.
- On host disconnect or `leave-room`, the participant with the earliest
  `joinedAt` is promoted; ties (impossible in practice) break by socket id.
- The server broadcasts `host-changed` with the new host username / socket id.
  All participants — not only the host — receive it and update the in-store
  `roomHostUsername`. The discrete `HostBadge` re-renders automatically.

The contract between layers is documented in:

- `docs/host-management.md` (Layer 4)
- `docs/playback-control-model.md` (Layer 2 server contract)
- `docs/host-ui.md` (UI badge)
- `docs/socket-types.md` (Layer 1–4 event schemas)
- `docs/client-playback-flow.md` (client integration)

---

## 2. Automated Verification — Results

All commands below were executed from the workspace root on the
`feat/host-takeover-sync` branch.

| Check | Command | Result |
| --- | --- | --- |
| Server TypeScript strict | `cd apps/server && npx tsc --noEmit` | **0 errors** |
| Client TypeScript strict | `cd apps/client && npx tsc --noEmit` | **0 errors** |
| Server tests | `cd apps/server && npx vitest run` | **2 files / 25 tests passed** |
| Client tests | `cd apps/client && npx vitest run` | **5 files / 50 tests passed** |
| Prettier check | _no prettier config in repo_ | skipped (not configured) |

Branch commit history is consistent with Features 1–5 plus the per-feature
"chore: mark feature N commit task complete" markers (see `git log
feat/host-takeover-sync --oneline`).

### New tests added by Feature 6

The Feature 5 code review (`plan/code_review/CODE_REVIEW_FEATURE_5.md`) flagged
coverage gaps M2–M5 for `useSmartSync`. They have been added in
`apps/client/src/hooks/__tests__/useSmartSync.test.ts`:

- M2 — Drift correction on non-host (`silentSeek` towards `hostTimeRef`,
  ignore-below-2 s threshold, spinner flash above 5 s with auto-hide after
  1 s).
- M3 — `onPlayerSync` bridge forwards `play` / `pause` / `seek` into the iframe
  for non-hosts and is suppressed for hosts and when `enabled === false`.
- M4 — 15 s `getTime` heartbeat runs only for hosts.
- M5 — Host migration mid-playback: `rerender({ isHost })` toggles the drift
  broadcaster role on the same hook instance.

This raises `useSmartSync` coverage from 6 to 17 vitest cases.

---

## 3. Manual Smoke Test Checklist

These cannot be automated because they require two browser sessions and a real
embed. Run them once before merging.

### 3.1 Smart Sync — Power Rangers (YouTube-style provider)

Goal: confirm the free-for-all model works in both directions and that host
takeover does not require a reconnect on the non-host side.

1. User A creates a room with a Power Rangers episode URL → A is auto-promoted
   to host. The violet HostBadge in the top-left of the player shows `A`.
2. User B joins → HostBadge on B's screen also shows `A`.
3. A presses **play** in the iframe → B's player starts within ~1 s.
4. B presses **pause** → A's player pauses (host has no veto).
5. B scrubs the timeline → A jumps to the same position.
6. Force-close A's browser tab.
   - Within ~2 s the HostBadge on B's screen updates to `B`.
   - B can still press play / pause / seek; the action persists and would be
     rebroadcast to any C participant.
7. Open DevTools → no console errors, no `Unauthorized` socket emits.

### 3.2 Passive Sync — Coraje (`cubeembed` style provider)

Goal: confirm the coordinated-start flow and manual resync still work.

1. User A creates a room with a Coraje episode URL → A becomes host. The
   `LoadingOverlay` appears.
2. User B joins → both clients show `LoadingOverlay` waiting for `client-ready`.
3. Once both clients have signalled `client-ready` (or the 8 s server timeout
   elapses), the overlay disappears and the `PlayInstruction` chip appears.
4. A and B click play within the iframe roughly simultaneously → playback is
   in sync ± 1 s (the manual click is the only synchronization point — no
   postMessage API is available).
5. A scrubs forward inside the iframe (provider-internal seek, no event
   reaches us) → playback diverges. B presses the **Resync** button → modal
   confirms → B re-emits `request-resync` and the player jumps back into
   sync.

### 3.3 Host Takeover Mid-Playback

Goal: confirm Layer 4 + Layer 2 interact correctly while video is actually
playing.

1. Users A and B in a smart-sync room; A is host, video is playing.
2. Kill A's tab (do not "leave room" — simulate a network drop).
3. Expect on B within ~2 s:
   - HostBadge re-renders to show `B`.
   - No playback stutter or pause; the iframe keeps playing.
   - B's drift-reference heartbeat starts (no visible UI change; you can
     verify in the Network / Socket.IO frames panel that `player-action`
     `seek` frames now originate from B at 15 s cadence).
4. C joins the room → HostBadge on C shows `B`. C can play / pause without an
   `Unauthorized` error.

---

## 4. Known Limitations & Follow-Ups

Items intentionally deferred from Feature 6 because they would either require
infrastructure beyond unit tests or are cosmetic.

- **Smart-sync `seek` postMessage** — `useSmartSync` only listens for `play` /
  `pause` / `timeupdate`. Per the Feature 5 code review (M1), no current
  provider emits an explicit `seek` event; manual scrubs surface as a fresh
  `play` postMessage. If a future provider does emit `seek`, add a third
  branch alongside `play` / `pause`. The doc in `docs/client-playback-flow.md`
  already calls this out.
- **Cross-process host-takeover integration test** — Tested at the unit level
  on both sides (`promoteNextHost` on the server, `isHost` re-render on the
  client) but not yet end-to-end with two real Socket.IO clients in a vitest
  process. Worth a follow-up using `socket.io-client` + a started server in a
  test.
- **Latency compensation correctness** — The `adjustedTime` formula is unit
  tested with mock timestamps but never measured against a real RTT
  histogram. Acceptable for now; revisit if users report perceptible drift
  during the smart-sync smoke test (3.1).
- **Prettier** — No `.prettierrc` exists in the repo. The project relies on
  editor-side formatting. If we ever adopt Prettier formally, add the config
  and a `format:check` step to this checklist.
- **HostBadge visual regression** — The top-left badge is z-20 and
  `pointer-events-none`; verified by eye, not by snapshot. A Playwright
  visual regression test would be the right next step if the player chrome
  changes again.

---

## 5. Sign-Off

When all items in §2 and §3 pass, the `feat/host-takeover-sync` branch is
ready to merge. Open follow-ups from §4 should be filed as separate issues
rather than blocking the merge.
