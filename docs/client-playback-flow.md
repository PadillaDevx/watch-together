# Client Playback Flow — Free-for-All + Host Badge

This document describes the client-side playback flow after the host-takeover
work (PLAN.md Phase 5 / Feature 5). It complements
[`playback-control-model.md`](playback-control-model.md) which covers the
server-side contract.

## TL;DR

- **Any authenticated participant** can play / pause / seek. There is no
  client-side host gate on `socket.emit('player-action', …)`.
- The `host` role is **dynamic** and exists for two purposes only:
  1. Render a discrete **Host Badge** so participants know who is the current
     drift reference.
  2. Select the **drift broadcaster** in smart-sync mode (continuous
     `timeupdate` → `seek` broadcast). Whoever currently holds the `host`
     role plays this role; non-hosts converge silently.

## Component / hook responsibilities

| Layer | File | Responsibility |
| --- | --- | --- |
| Page | [`apps/client/src/pages/RoomPage.tsx`](../apps/client/src/pages/RoomPage.tsx) | Subscribes to `host-changed`, mirrors `roomHostUsername` into the Zustand store, passes `hostUsername` + `isHost` to `<SyncProvider>`. |
| Composition | [`apps/client/src/components/SyncProvider.tsx`](../apps/client/src/components/SyncProvider.tsx) | Detects provider capabilities, mounts smart **or** passive sync hooks, renders `<HostBadge hostUsername={…}/>` for every participant. |
| Smart sync | [`apps/client/src/hooks/useSmartSync.ts`](../apps/client/src/hooks/useSmartSync.ts) | postMessage-driven sync for providers exposing a player API. Free-for-all on play/pause; host is drift reference for `timeupdate`. |
| Passive sync | [`apps/client/src/hooks/usePassiveSync.ts`](../apps/client/src/hooks/usePassiveSync.ts) | Loading overlay + `client-ready` / `start-playback` / `request-resync` orchestration for opaque providers. Completely independent of host status. |
| UI | [`apps/client/src/components/HostBadge.tsx`](../apps/client/src/components/HostBadge.tsx) | Discrete pill rendered for every participant whenever `hostUsername` is non-null. |

## Free-for-all emit flow (smart sync)

```
┌──────────────────────┐  postMessage   ┌────────────────────┐
│ iframe / video       │ ─────────────▶ │ window 'message'   │
│ (any participant)    │  type:play     │ handler in         │
│                      │  type:pause    │ useSmartSync       │
└──────────────────────┘                └─────────┬──────────┘
                                                  │ socket.emit('player-action', ...)
                                                  ▼
                                          server validates auth
                                          (not host role)
                                                  │
                                                  ▼
                                          broadcast 'player-sync'
                                          to every other peer
```

- `play` and `pause` messages emit unconditionally — no `if (isHost)`.
- The `useSmartSync` handler only branches on `type === 'timeupdate' | 'play' | 'pause'`;
  there is **no** explicit `type === 'seek'` branch. The hook relies on the
  iframe re-emitting a `play` (or `pause`) postMessage with the post-scrub
  `currentTime` after a manual seek, which then follows the same emit path.
  Any provider that emits a custom `type: 'seek'` message would be silently
  dropped — TODO: revisit if a future provider needs a dedicated branch.

## Drift reference flow (smart sync, host only)

```
host iframe ──timeupdate──▶ useSmartSync ──player-action(seek)──▶ server ──player-sync──▶ peers
                                                                              │
                          ┌──────────────────────────────────────────────────┘
                          ▼
                  non-host useSmartSync.onPlayerSync
                          │
                          ▼
                  if drift ≥ 2 s → silentSeek (≥ 5 s → brief spinner)
```

The 15-second heartbeat (`getTime` postMessage into the iframe) only runs on
the host so that idle playback still produces drift reference broadcasts.

## Passive sync flow (host-independent)

```
embedUrl changes ─▶ usePassiveSync resets state, shows LoadingOverlay
iframe 'load'    ─▶ socket.emit('client-ready', { roomId, userId })
server 'start-playback' ─▶ schedule PlayInstruction overlay near playAt
user click       ─▶ markUserPlaying() suppresses PlayInstruction
resync button    ─▶ socket.emit('request-resync', { roomId })
server 'resync-state' ─▶ show PlayInstruction with estimated time
```

`isHost` is **not** consumed anywhere in `usePassiveSync`. Promotion or
demotion never changes the loading overlay, ready signal, or resync behaviour.

## Host change mid-playback

1. Server emits `host-changed` after promotion / takeover (see Features 1-3).
2. `RoomPage` `onHostChanged` handler writes `newHostUsername` into the
   Zustand store via `setRoomHostUsername`.
3. `roomHostUsername` selector re-renders `<SyncProvider>` with new
   `hostUsername` (badge) and `isHost` (drift role).
4. `useSmartSync` effect dependencies include `isHost`; the role transition
   happens on the next render — the new host starts broadcasting
   `timeupdate`, the old host stops.
5. `usePassiveSync` is unaffected.

## No-regression checklist

Run through this list whenever this area is touched. Items map to acceptance
criteria in `plan/TASKS.md` Feature 5 and Feature 6.

- [ ] Smart-sync provider: User A (host) plays → User B receives `player-sync`
      and plays in sync.
- [ ] Smart-sync provider: User B (non-host) pauses → User A and User C
      pause (no permission error from server).
- [ ] Smart-sync provider: drift > 2 s on a non-host is silently corrected;
      drift > 5 s briefly shows the spinner.
- [ ] Passive provider: every participant sees `LoadingOverlay`, then
      `PlayInstruction`, then synchronized playback.
- [ ] `ResyncButton` works for both smart and passive providers regardless
      of host status.
- [ ] Host disconnects → new host promoted → `HostBadge` updates in real time.
- [ ] After promotion the new host's `timeupdate` becomes the drift reference
      within one render cycle (no manual reload required).
- [ ] `socket.off('host-changed', …)` cleanup runs on `RoomPage` unmount.
- [ ] `setRoomHostUsername(null)` runs on `leave-room` so the badge does
      not leak across rooms.

## Related docs

- [`playback-control-model.md`](playback-control-model.md) — server-side
  free-for-all contract.
- [`host-management.md`](host-management.md) — promotion / takeover rules.
- [`host-ui.md`](host-ui.md) — host badge styling and visibility rules.
- [`socket-types.md`](socket-types.md) — typed Socket.IO contract.
