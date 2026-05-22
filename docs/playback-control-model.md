# Playback Control Model — Free-for-All with Latency Compensation

This document describes how WatchJunto authorises playback control
(`player-action`) events and how the server compensates for network latency
when broadcasting them as `player-sync`.

## 1. Rationale: Why Free-for-All?

WatchJunto is a co-watching application for small, trusted groups (friends,
family). Forcing a strict "only the host may pause/seek" model creates poor UX:

- The host becomes a bottleneck — when they are AFK, nobody else can pause.
- Promotion-on-disconnect (see [host-management.md](./host-management.md))
  could be abused as a denial-of-service vector if combined with host-gating.
- Trust inside a room is already enforced by the room PIN and authentication
  layer; once a user is *in* the room, granular per-action authorisation adds
  friction without meaningful safety.

We therefore allow **any authenticated room participant** to emit
`player-action`. The host role is preserved purely for UI purposes (the host
badge — see Feature 3) and for metadata such as "room owner". It is **not**
used to gate playback commands.

## 2. Validation Rules

The `player-action` socket handler (`apps/server/src/socket/index.ts`)
delegates authorisation to the pure helper
[`validatePlayerAction`](../apps/server/src/socket/playerActionValidation.ts).

A `player-action` payload is accepted **iff** both of the following hold:

| Rule | Check |
| ---- | ----- |
| Authenticated socket | `socket.data.authenticated === true` |
| Room membership      | `socket.data.roomId === payload.roomId` |

If either check fails the server responds with:

```ts
socket.emit('error', { message: 'Unauthorized', code: '<reason>' });
return;
```

where `<reason>` is `NOT_AUTHENTICATED` or `NOT_ROOM_MEMBER`. **No broadcast**
occurs.

Note: `socket.data.roomId` is populated by the `join-room` handler when the
user successfully joins a room. A socket that never joined any room therefore
cannot emit `player-action` for any room.

## 3. Latency Compensation

When a client emits a `player-action`, it includes:

- `currentTime` — the playback position at the moment of emission (seconds).
- `timestamp`   — the client's `Date.now()` at the moment of emission (ms).

The server computes the one-way latency as half of the round-trip delay and
adds it (converted to seconds) to `currentTime`:

```ts
const latencyMs    = Math.max(0, Date.now() - timestamp);
const adjustedTime = currentTime + latencyMs / 2000;
```

### Why `/ 2000` ?

- We approximate one-way latency as `latencyMs / 2` (assuming symmetric RTT).
- Playback time is in **seconds**, so we divide by another 1000.
- Combined: `latencyMs / 2000`.

### Clock skew safety

`Math.max(0, ...)` clamps negative latencies (caused by a client whose clock
runs ahead of the server) to zero, so we never *rewind* playback below the
client-reported position.

### Examples

| Scenario                           | `currentTime` | `latencyMs` | `adjustedTime` |
| ---------------------------------- | -------------:| -----------:| --------------:|
| Local network (1ms RTT)            |        10.000 |           1 |       10.0005  |
| Typical wifi (100ms RTT)           |        10.000 |         100 |       10.050   |
| Slow mobile (500ms RTT)            |        10.000 |         500 |       10.250   |
| Pathological (2s RTT)              |        30.000 |        2000 |       31.000   |
| Client clock skewed +1s into future|         7.000 |        −1000 → clamped 0 |   7.000 |

## 4. Broadcast Shape (`player-sync`)

To preserve backward compatibility with older clients that don't yet read
`adjustedTime`, the server forwards **both** values:

```ts
socket.to(roomId).emit('player-sync', {
  action,                       // 'play' | 'pause' | 'seek' | 'load' | 'episode-change'
  currentTime: rawCurrentTime,  // unchanged client value (legacy)
  adjustedTime,                 // latency-compensated value (preferred)
  serverTime: Date.now(),       // server clock at broadcast
});
```

New clients (Feature 4 / 5) should prefer `adjustedTime` when present.

## 5. Server-Side State Mutation

Per action, the server also updates the authoritative `playerState` stored in
the room so that late joiners receive an accurate `sync-state`:

| Action | `playerState.currentTime` written | `isPlaying` written |
| ------ | --------------------------------- | ------------------- |
| `play` | `adjustedTime`                    | `true`              |
| `pause`| `currentTime` (raw, no compensation — playback is frozen) | `false` |
| `seek` | `adjustedTime`                    | unchanged           |

`pause` intentionally uses the raw value: when the user pauses, the playhead
stops at exactly where the user wanted it, regardless of network delay.

## 6. Testing

Pure validation and compensation logic lives in
`apps/server/src/socket/playerActionValidation.ts` and is unit-tested in
`apps/server/src/socket/__tests__/playerActionValidation.test.ts`. The socket
handler itself is exercised indirectly through these helpers, avoiding a full
Socket.IO test harness.

## 7. Future Work

- Feature 4 introduces type-safe socket events end-to-end (client + server).
- Feature 5 wires `adjustedTime` consumption into the client smart-sync hook.
- A per-room rate limit on `player-action` may be added if abuse is observed.
