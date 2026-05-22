# Socket.IO Event Type Contract

This document describes the typed Socket.IO contract shared between the
**server** (`apps/server`) and the **client** (`apps/client`). Both ends are
strongly typed against this contract so any mismatch is caught at compile time.

## Source of truth

- **Server**: [`apps/server/src/types.ts`](../apps/server/src/types.ts) defines
  `ClientToServerEvents`, `ServerToClientEvents`, `SocketData`, plus the shared
  payload types (`PlayerState`, `QueueItem`, `RoomListItem`, etc.).
- **Client**: [`apps/client/src/lib/socket-types.ts`](../apps/client/src/lib/socket-types.ts)
  duplicates the same interfaces (prefixed `Socket*` for payload structs) and
  **must be kept in sync** with the server file. A header comment in that file
  documents this rule.

The duplication is intentional: the client and server have separate
`tsconfig` projects and we do not want to introduce a shared package. Whenever
an event signature changes on the server, the client mirror must be updated in
the same commit.

## Server typing

```ts
import { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './types';

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>, // InterServerEvents (unused)
  SocketData
>(httpServer, { /* ... */ });
```

Each `socket` handler receives a fully typed `Socket<C2S, S2C, _, SocketData>`,
so `socket.data.username` and friends are inferred without casts.

## Client typing

```ts
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket-types';

// NOTE: client generic order is REVERSED — first the events the socket *listens*
// to (server → client), then the events it can *emit* (client → server).
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  withCredentials: true,
  autoConnect: false,
});
```

With this typing, `socket.emit('join-room', { roomId })` and
`socket.on('room-list', (rooms) => ...)` are both type-checked end-to-end.

## Event catalog

### Server → Client (`ServerToClientEvents`)

| Event | Payload | Purpose |
| --- | --- | --- |
| `room-list` | `RoomListItem[]` | Broadcast the lobby snapshot to every connected client. Note: the payload omits the in-memory `queue` field. |
| `room-users` | `Array<{ socketId; username; joinedAt: string }>` | Updated list of users in the current room. `joinedAt` is an ISO string after JSON serialization. |
| `sync-state` | `{ videoId; streamUrl; currentTime; isPlaying; sourceType; queue; title; thumbnail }` | Authoritative player snapshot used when a client joins or recovers. |
| `queue-update` | `QueueItem[]` | Replaces the room queue. |
| `source-switched` | `{ sourceType }` | Host changed the active source (`youtube` / `iptv` / `movie` / `url` / `series`). |
| `player-play` | `{ currentTime }` | Resume playback. |
| `player-pause` | `{ currentTime }` | Pause playback. |
| `player-seek` | `{ currentTime }` | Seek to a position. |
| `player-load` | `{ type: 'youtube'; videoId } \| { type: 'iptv'; streamUrl } \| { type: 'series'; embedUrl; title? }` | Load a new media item. |
| `player-sync` | `{ currentTime; isPlaying; title?; thumbnail?; updatedAt }` | Drift-correction broadcast from host. |
| `player-heartbeat` | `{ currentTime; isPlaying; updatedAt }` | Lightweight host pulse (≈ every 2s) for passive resync. |
| `error` | `{ code?; message? }` | Generic error envelope — both fields are optional. |
| `series-episode-change` | `{ serieId; serieName; temporada; episodioIndex; embedUrl; titulo }` | Host navigated to a different episode. |
| `start-playback` | `{ updatedAt }` | Cue clients to start playback in sync. |
| `resync-state` | full `PlayerState` shape | Response to `request-resync` — full snapshot. |
| `chat-message` | `ChatMessage` (`{ username; text; timestamp; avatar }`) | Chat message echoed to room. |
| `typing-update` | `{ usernames: string[] }` | Current set of users typing. |
| `user-joined` | `{ username }` | New user joined the room. |
| `user-left` | `{ username }` | User left the room. |
| `host-changed` | `{ hostUsername: string \| null }` | Host has been transferred. `null` clears the host. |

### Client → Server (`ClientToServerEvents`)

| Event | Payload | Purpose |
| --- | --- | --- |
| `join-room` | `{ roomId; pin? }` | Join a room (PIN required when room is protected). |
| `leave-room` | `{ roomId }` | Voluntarily leave a room. |
| `player-play` | `{ roomId; currentTime }` | Request resume (host-only authoritative). |
| `player-pause` | `{ roomId; currentTime }` | Request pause. |
| `player-seek` | `{ roomId; currentTime }` | Request seek. |
| `player-load` | `{ roomId } & ({ type:'youtube'; videoId } \| { type:'iptv'; streamUrl } \| { type:'series'; embedUrl; title? })` | Request load. |
| `player-action` | `{ roomId; action: 'play' \| 'pause' \| 'seek'; currentTime?; updatedAt? }` | Unified host action (newer code path). |
| `series-episode-change` | `{ roomId; serieId; serieName; temporada; episodioIndex; embedUrl; titulo }` | Host moves to a different episode. |
| `chat-message` | `{ roomId; text }` | Send chat. |
| `typing-start` | `{ roomId }` | User started typing. |
| `typing-stop` | `{ roomId }` | User stopped typing. |
| `request-sync` | `{ roomId }` | Request a fresh `sync-state` broadcast. |
| `resync-all` | `{ roomId }` | Host triggers a forced resync for the entire room. |
| `queue-add` | `{ roomId; item: QueueItem }` | Add an item to the queue. |
| `queue-remove` | `{ roomId; itemId }` | Remove a queue item. |
| `queue-next` | `{ roomId }` | Pop and play the next queue item. |
| `queue-reorder` | `{ roomId; itemIds: string[] }` | Reorder the queue. |
| `switch-source` | `{ roomId; sourceType }` | Change the active source type. |
| `client-ready` | `{ roomId }` | Client signals it has finished loading media and is ready to play. |
| `request-resync` | `{ roomId }` | Ask the host for a full `resync-state`. |

## Maintenance checklist

When adding or modifying a Socket.IO event:

1. Update [`apps/server/src/types.ts`](../apps/server/src/types.ts) first
   (source of truth).
2. Mirror the change in
   [`apps/client/src/lib/socket-types.ts`](../apps/client/src/lib/socket-types.ts).
3. Run `npx tsc --noEmit` in both `apps/server` and `apps/client` — both must
   exit with code `0`.
4. Update this document if the contract changes.
5. Add or update tests covering the new payload shape.

## Notes on payload reality

- `RoomListItem.users[].joinedAt` is typed as `string` on the wire because
  Socket.IO serializes the in-memory `Date` to ISO via `JSON.stringify`. Do not
  rely on a `Date` instance on the client.
- `RoomListItem` deliberately omits the `queue` field to keep the lobby payload
  small. The local `Room` interface on the client therefore declares
  `queue?: QueueItem[]` as optional.
- `QueueItem.type` on the wire is `'youtube' | 'movie' | 'iptv'`. The client's
  local `QueueItem.type` also accepts `'series'` for forward compatibility, but
  the server never emits it.
- The `error` event has **both** `code` and `message` optional. Always
  defensively check for `code` before branching.
