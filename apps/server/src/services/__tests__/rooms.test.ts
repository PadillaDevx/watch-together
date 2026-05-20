import { describe, it, expect, beforeEach } from 'vitest';
import {
  _rooms,
  addUserToRoom,
  removeUserFromRoom,
  promoteNextHost,
} from '../rooms';
import type { Room } from '../../types';

/**
 * Helper to build a minimal in-memory `Room` for tests. We bypass the DB-backed
 * `createRoom()` factory because the host-takeover logic operates purely on the
 * `_rooms` map and does not interact with PostgreSQL.
 */
function makeRoom(id: string, maxUsers = 10): Room {
  const room: Room = {
    id,
    name: `Room ${id}`,
    maxUsers,
    isOpen: true,
    createdAt: Date.now(),
    sourceType: 'youtube',
    playerState: {
      videoId: null,
      streamUrl: null,
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
      title: null,
      thumbnail: null,
    },
    users: new Map(),
    chatHistory: [],
    queue: [],
    readyUsers: new Set(),
  };
  _rooms.set(id, room);
  return room;
}

describe('rooms.ts — host takeover', () => {
  beforeEach(() => {
    _rooms.clear();
  });

  describe('addUserToRoom', () => {
    it('promotes the first joiner to host', () => {
      makeRoom('r1');
      const res = addUserToRoom('r1', 'sock-a', 'alice');
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.becameHost).toBe(true);

      const room = _rooms.get('r1')!;
      expect(room.hostUserId).toBe('sock-a');
      expect(room.hostUsername).toBe('alice');
    });

    it('does not promote subsequent joiners while a host exists', () => {
      makeRoom('r1');
      addUserToRoom('r1', 'sock-a', 'alice');
      const res = addUserToRoom('r1', 'sock-b', 'bob');
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.becameHost).toBe(false);

      const room = _rooms.get('r1')!;
      expect(room.hostUserId).toBe('sock-a');
      expect(room.hostUsername).toBe('alice');
    });

    it('exposes hostUserId and hostUsername for non-host joiners so the server can emit host-changed to the joining socket', () => {
      // This covers the join-room flow in socket/index.ts where, for users who
      // did NOT become host, the server emits `host-changed` directly to the
      // joining socket using `room.hostUserId` and `room.hostUsername`.
      makeRoom('r1');
      addUserToRoom('r1', 'sock-a', 'alice');
      const res = addUserToRoom('r1', 'sock-b', 'bob');
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.becameHost).toBe(false);

      const room = _rooms.get('r1')!;
      // The fields required to build the `host-changed` payload must be set.
      expect(room.hostUserId).toBe('sock-a');
      expect(room.hostUsername).toBe('alice');
    });

    it('returns ROOM_NOT_FOUND for unknown rooms', () => {
      const res = addUserToRoom('nope', 'sock-a', 'alice');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ROOM_NOT_FOUND');
    });

    it('returns ROOM_FULL when capacity is exceeded', () => {
      makeRoom('r1', 1);
      addUserToRoom('r1', 'sock-a', 'alice');
      const res = addUserToRoom('r1', 'sock-b', 'bob');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ROOM_FULL');
    });
  });

  describe('promoteNextHost', () => {
    it('returns null and clears host fields when the room is empty', () => {
      const room = makeRoom('r1');
      room.hostUserId = 'sock-a';
      room.hostUsername = 'alice';

      const promotion = promoteNextHost('r1');
      expect(promotion).toBeNull();
      expect(room.hostUserId).toBeUndefined();
      expect(room.hostUsername).toBeUndefined();
    });

    it('returns null for unknown rooms', () => {
      expect(promoteNextHost('does-not-exist')).toBeNull();
    });

    it('promotes the user with the earliest joinedAt', () => {
      const room = makeRoom('r1');
      // alice joined first, bob later, carol later still
      room.users.set('sock-a', { username: 'alice', joinedAt: new Date(1_000) });
      room.users.set('sock-b', { username: 'bob', joinedAt: new Date(2_000) });
      room.users.set('sock-c', { username: 'carol', joinedAt: new Date(3_000) });
      room.hostUsername = 'former-host';

      const promotion = promoteNextHost('r1');
      expect(promotion).not.toBeNull();
      expect(promotion!.newHostSocketId).toBe('sock-a');
      expect(promotion!.newHostUsername).toBe('alice');
      expect(promotion!.previousHostUsername).toBe('former-host');
      expect(room.hostUserId).toBe('sock-a');
      expect(room.hostUsername).toBe('alice');
    });

    it('breaks ties on joinedAt by socket id (lexicographic)', () => {
      const room = makeRoom('r1');
      const sameInstant = new Date(5_000);
      room.users.set('sock-z', { username: 'zoe', joinedAt: sameInstant });
      room.users.set('sock-a', { username: 'alice', joinedAt: sameInstant });
      room.users.set('sock-m', { username: 'mark', joinedAt: sameInstant });

      const promotion = promoteNextHost('r1');
      expect(promotion).not.toBeNull();
      expect(promotion!.newHostSocketId).toBe('sock-a');
      expect(promotion!.newHostUsername).toBe('alice');
    });

    it('handles a single remaining user', () => {
      const room = makeRoom('r1');
      room.users.set('sock-only', { username: 'solo', joinedAt: new Date(42) });

      const promotion = promoteNextHost('r1');
      expect(promotion).not.toBeNull();
      expect(promotion!.newHostSocketId).toBe('sock-only');
      expect(promotion!.newHostUsername).toBe('solo');
      expect(room.hostUserId).toBe('sock-only');
    });

    it('full lifecycle: host leaves and the next earliest joiner is promoted', () => {
      makeRoom('r1');
      addUserToRoom('r1', 'sock-a', 'alice');
      // ensure bob's joinedAt is strictly greater
      const room = _rooms.get('r1')!;
      addUserToRoom('r1', 'sock-b', 'bob');
      room.users.get('sock-b')!.joinedAt = new Date(room.users.get('sock-a')!.joinedAt.getTime() + 1_000);
      addUserToRoom('r1', 'sock-c', 'carol');
      room.users.get('sock-c')!.joinedAt = new Date(room.users.get('sock-a')!.joinedAt.getTime() + 2_000);

      expect(room.hostUsername).toBe('alice');

      // Alice (host) leaves
      removeUserFromRoom('r1', 'sock-a');
      const promotion = promoteNextHost('r1');
      expect(promotion).not.toBeNull();
      expect(promotion!.newHostUsername).toBe('bob');
      expect(promotion!.previousHostUsername).toBe('alice');
    });
  });
});
