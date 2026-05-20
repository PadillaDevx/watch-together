# Host Management

This document describes how WatchJunto selects, tracks, and transfers the
**host** role inside a synchronization room.

## Roles & Scope

The host is a soft, UI-level designation. In the free-for-all playback model,
**any authenticated participant** may emit `player-action` (play, pause, seek,
load, episode-change). The host role only drives:

- A discrete badge in the participants list / UI.
- Metadata broadcast to clients (e.g. `host-changed` events).

Host status is **not** consulted by the server when validating playback
commands. See [`playback-control-model.md`](./playback-control-model.md) (added
in a later feature) for the playback authorization rules.

## Data Model

`Room` (server, `apps/server/src/types.ts`) carries two host fields:

| Field          | Type                | Meaning                              |
| -------------- | ------------------- | ------------------------------------ |
| `hostUserId`   | `string \| undefined` | Socket id of the current host       |
| `hostUsername` | `string \| undefined` | Username mirror, for convenience    |

Both fields are `undefined` when the room is empty.

`RoomUser` carries a `joinedAt: Date` timestamp used to determine promotion
order.

## Selection Algorithm

The selection rule is **first-joiner-becomes-host**, with deterministic
fall-back on disconnect:

1. When a user joins a room with no host, that user is promoted immediately.
2. When the host disconnects or leaves, the next user is selected using
   `promoteNextHost(roomId)` in `apps/server/src/services/rooms.ts`:
   1. If the room is empty, both `hostUserId` and `hostUsername` are cleared
      and the function returns `null`.
   2. Otherwise, iterate `room.users` and select the entry with the **minimum
      `joinedAt` timestamp**.
   3. Ties on `joinedAt` (same millisecond) are broken by lexicographic order
      of the socket id, guaranteeing deterministic behaviour.

The new host fields are written before the function returns; callers are
expected to broadcast `host-changed` afterwards.

## Wire Events

`host-changed` (server → clients in room):

```ts
{
  newHostUsername: string;
  newHostSocketId: string;
  previousHostUsername?: string;
}
```

Emitted by the server in three cases:

- A user joins an empty room and becomes the first host.
- Current host calls `leave-room`.
- Current host's socket fires `disconnect`.

Clients should update their local "host" indicator on every `host-changed`.

## Fault Tolerance

- The previous host is removed from `room.users` **before** `promoteNextHost`
  runs, so the function never reselects the departing user.
- `readyUsers` (passive-sync readiness set) is intentionally **not** reset on
  host change — readiness is a per-socket concern, independent of role.
- If two users disconnect "simultaneously" (same event loop tick), Socket.IO
  serializes the `disconnect` handlers; the second invocation simply observes
  the new host and either keeps it or promotes again if the new host is also
  the one disconnecting.
- A room with zero users keeps both host fields `undefined`; the next joiner
  triggers a fresh promotion.

## Testing

Unit tests live in
`apps/server/src/services/__tests__/rooms.test.ts` and cover:

- Single user → becomes host on join.
- Multiple users → first joiner remains host, departure promotes earliest of
  the remaining members.
- Correct ordering when join timestamps differ.
- No users left → host fields are cleared and `promoteNextHost` returns
  `null`.
- Tie-breaking by socket id when `joinedAt` timestamps collide.
