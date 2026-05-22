# Host Badge UI Specification

## Purpose

A discrete pill rendered on top of the iframe player that surfaces the
current room host to **every** participant. Unlike the legacy pill (which
only rendered for the host themselves), the badge in Feature 3 is part of
the free-for-all playback model where the host is informational only — it
no longer gates playback control.

## Component

`apps/client/src/components/HostBadge.tsx`

```tsx
<HostBadge hostUsername={roomHostUsername} />
```

- Pure presentational component.
- Renders `null` when `hostUsername` is null/empty.
- Username is truncated to 18 characters; the untruncated value is exposed
  through the `title` attribute (native tooltip on hover).

## Visual Contract

| Property         | Value                                               |
| ---------------- | --------------------------------------------------- |
| Position         | `absolute top-2 left-2`                             |
| Stack            | `z-20`                                              |
| Pointer events   | `pointer-events-none` (never blocks player UI)      |
| Background       | `bg-violet-700/70` + `backdrop-blur-sm`             |
| Text             | `text-white text-[10px] font-medium`                |
| Padding          | `px-2 py-0.5`                                       |
| Shape            | `rounded-full`                                      |
| Icon             | `lucide-react` `Crown` `size={10}`                  |
| Layout           | `flex items-center gap-1`                           |
| Test selector    | `data-testid="host-badge"`                          |

## Data Flow

1. **Server** emits `host-changed` with payload
   `{ newHostUsername, newHostSocketId, previousHostUsername? }`. The
   server guarantees the joining socket always receives a unicast
   `host-changed` whenever the room has a host, covering both join paths:
   - **First joiner becomes host** — server `socket.emit('host-changed')`
     to the joiner (initializes its own badge) plus `socket.to(roomId)`
     broadcast to any other sockets already in the room.
   - **Late joiner with existing host** — server `socket.emit` unicast
     only (host identity has not changed for existing users, no broadcast
     needed).
   - **Host disconnect / leave** — promotion triggers `io.to(roomId)`
     broadcast so every participant updates simultaneously.
2. **Client** (`apps/client/src/pages/RoomPage.tsx`) registers
   `socket.on('host-changed', ...)` and writes `newHostUsername` into the
   global Zustand store via `setRoomHostUsername`.
3. **`SyncProvider`** receives `hostUsername` as a prop from `RoomPage`
   (selected from the store) and forwards it to `<HostBadge />`.
4. On room unmount the store value is reset to `null` so the badge does
   not leak across rooms. The store also resets `roomHostUsername` on
   `logout()` to avoid leakage across user sessions.

## Why Not Modify `room-users`?

The server already covers all join paths via `host-changed`. Extending the
`room-users` payload would require coordinated type updates across both
the server and client `ServerToClientEvents` interfaces; the unicast
fallback in `join-room` is the cheaper and more isolated solution.

## Accessibility

- The crown icon is decorative (`aria-hidden="true"`).
- The host username is rendered as plain text and surfaced via the
  `title` attribute for keyboard / screen-reader users who hover with
  assistive tech.
