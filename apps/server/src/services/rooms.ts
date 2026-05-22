import crypto from 'crypto';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/index';
import { rooms as roomsTable, roomQueue } from '../db/schema';
import type { Room, RoomListItem, PlayerState, ChatMessage, QueueItem } from '../types';

// ─── Runtime in-memory state ──────────────────────────────────────────────────
// Room metadata is persisted in DB. Connected users, chat, and player state
// are ephemeral and stored only in memory during a session.

export const _rooms = new Map<string, Room>();

// Typing indicator state: roomId -> Set<username>
const _typingUsers = new Map<string, Set<string>>();

export function addTypingUser(roomId: string, username: string): string[] {
  if (!_typingUsers.has(roomId)) _typingUsers.set(roomId, new Set());
  _typingUsers.get(roomId)!.add(username);
  return Array.from(_typingUsers.get(roomId)!);
}

export function removeTypingUser(roomId: string, username: string): string[] {
  _typingUsers.get(roomId)?.delete(username);
  return Array.from(_typingUsers.get(roomId) ?? []);
}

export function removeTypingUserFromAll(username: string): void {
  for (const typingSet of _typingUsers.values()) {
    typingSet.delete(username);
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function buildRoomFromDb(
  dbRoom: typeof roomsTable.$inferSelect,
  queue: QueueItem[] = [],
  createdByUsername?: string,
): Room {
  return {
    id: dbRoom.id,
    name: dbRoom.name,
    maxUsers: dbRoom.maxUsers,
    isOpen: dbRoom.isOpen,
    pin: dbRoom.pin ?? undefined,
    createdAt: dbRoom.createdAt.getTime(),
    sourceType: dbRoom.sourceType as 'youtube' | 'iptv' | 'movie' | 'url' | 'series',
    iptvListId: dbRoom.iptvListId ?? undefined,
    createdByUsername,
    playerState: {
      videoId: null,
      streamUrl: null,
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
      playbackRate: 1,
      revision: 0,
      title: null,
      thumbnail: null,
    },
    users: new Map(),
    chatHistory: [],
    queue,
    readyUsers: new Set(),
  };
}

function dbRowToQueueItem(row: typeof roomQueue.$inferSelect): QueueItem {
  return {
    id: row.id,
    type: row.type as 'youtube' | 'movie' | 'iptv',
    title: row.title ?? '',
    videoId: row.videoId ?? undefined,
    streamUrl: row.streamUrl ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    addedBy: row.addedBy ?? '',
  };
}

// ─── Initialization (load from DB on startup) ─────────────────────────────────

export async function initRooms(): Promise<void> {
  const dbRooms = await db.select().from(roomsTable);

  for (const dbRoom of dbRooms) {
    const queueRows = await db.select()
      .from(roomQueue)
      .where(eq(roomQueue.roomId, dbRoom.id))
      .orderBy(asc(roomQueue.position));

    const queue = queueRows.map(dbRowToQueueItem);
    _rooms.set(dbRoom.id, buildRoomFromDb(dbRoom, queue));
  }

  console.log(`[Rooms] Loaded ${dbRooms.length} room(s) from DB`);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRoom(
  name: string,
  maxUsers: number,
  isOpen: boolean,
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series' = 'youtube',
  iptvListId?: string,
  createdByUsername?: string,
): Promise<Room> {
  const pin = isOpen ? null : String(Math.floor(100000 + Math.random() * 900000));

  const [dbRoom] = await db.insert(roomsTable).values({
    name,
    maxUsers,
    isOpen,
    pin,
    sourceType,
    iptvListId: iptvListId ?? null,
  }).returning();

  const room = buildRoomFromDb(dbRoom!, [], createdByUsername);
  _rooms.set(room.id, room);
  return room;
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  const result = await db.delete(roomsTable).where(eq(roomsTable.id, roomId)).returning({ id: roomsTable.id });
  _rooms.delete(roomId);
  return result.length > 0;
}

export async function deleteAllRooms(): Promise<void> {
  await db.delete(roomsTable);
  _rooms.clear();
}

// ─── Runtime accessors (synchronous — from memory) ────────────────────────────

export function getRoom(roomId: string): Room | undefined {
  return _rooms.get(roomId);
}

export function getRoomList(): RoomListItem[] {
  return Array.from(_rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    maxUsers: room.maxUsers,
    isOpen: room.isOpen,
    pinProtected: !!room.pin,
    createdAt: room.createdAt,
    createdByUsername: room.createdByUsername,
    sourceType: room.sourceType,
    iptvListId: room.iptvListId,
    playerState: room.playerState,
    users: Array.from(room.users.entries()).map(([socketId, data]) => ({
      socketId,
      username: data.username,
      joinedAt: data.joinedAt.toISOString(),
    })),
    hostUsername: room.hostUsername,
  }));
}

/**
 * Add a user to a room. If the room currently has no host, the joining user
 * is automatically promoted to host (first-joiner-becomes-host policy).
 *
 * @param roomId - Target room identifier
 * @param socketId - Socket id of the joining user (used as host identifier)
 * @param username - Display username of the joining user
 * @returns `{ ok: true, becameHost }` on success, or `{ ok: false, code }` on
 *          failure (`ROOM_NOT_FOUND` or `ROOM_FULL`).
 */
export function addUserToRoom(roomId: string, socketId: string, username: string) {
  const room = _rooms.get(roomId);
  if (!room) return { ok: false as const, code: 'ROOM_NOT_FOUND' };
  if (room.users.size >= room.maxUsers) return { ok: false as const, code: 'ROOM_FULL' };
  room.users.set(socketId, { username, joinedAt: new Date() });

  let becameHost = false;
  if (!room.hostUserId) {
    room.hostUserId = socketId;
    room.hostUsername = username;
    becameHost = true;
  }
  return { ok: true as const, becameHost };
}

export function removeUserFromRoom(roomId: string, socketId: string): void {
  _rooms.get(roomId)?.users.delete(socketId);
}

/**
 * Promote the next user in `room.users` to host, selecting the user with the
 * earliest `joinedAt` timestamp. Used when the current host disconnects or
 * leaves the room.
 *
 * Caller is expected to have already removed the previous host from
 * `room.users` (or to do so afterwards) — this function only inspects the
 * current membership and updates `hostUserId` / `hostUsername`.
 *
 * @param roomId - Room to promote a new host in
 * @returns Information about the new host, or `null` when the room is empty
 *          or does not exist (host fields are cleared in that case).
 */
export function promoteNextHost(
  roomId: string,
): { newHostSocketId: string; newHostUsername: string; previousHostUsername?: string } | null {
  const room = _rooms.get(roomId);
  if (!room) return null;

  const previousHostUsername = room.hostUsername;

  if (room.users.size === 0) {
    room.hostUserId = undefined;
    room.hostUsername = undefined;
    return null;
  }

  // Select user with the earliest joinedAt; ties broken deterministically by socket id
  let nextSocketId: string | undefined;
  let nextUser: { username: string; joinedAt: Date } | undefined;
  for (const [socketId, user] of room.users.entries()) {
    if (
      !nextUser ||
      user.joinedAt.getTime() < nextUser.joinedAt.getTime() ||
      (user.joinedAt.getTime() === nextUser.joinedAt.getTime() && socketId < (nextSocketId ?? ''))
    ) {
      nextSocketId = socketId;
      nextUser = user;
    }
  }

  if (!nextSocketId || !nextUser) {
    room.hostUserId = undefined;
    room.hostUsername = undefined;
    return null;
  }

  room.hostUserId = nextSocketId;
  room.hostUsername = nextUser.username;

  return {
    newHostSocketId: nextSocketId,
    newHostUsername: nextUser.username,
    previousHostUsername,
  };
}

export function updatePlayerState(roomId: string, patch: Partial<PlayerState>): void {
  const room = _rooms.get(roomId);
  if (room) {
    const shouldBumpRevision =
      'videoId' in patch ||
      'streamUrl' in patch ||
      'currentTime' in patch ||
      'isPlaying' in patch ||
      'playbackRate' in patch;
    Object.assign(room.playerState, patch);
    room.playerState.updatedAt = Date.now();
    if (shouldBumpRevision) {
      room.playerState.revision = (room.playerState.revision ?? 0) + 1;
    }
  }
}

export function appendChatMessage(roomId: string, msg: ChatMessage): void {
  const room = _rooms.get(roomId);
  if (!room) return;
  room.chatHistory.push(msg);
  if (room.chatHistory.length > 100) room.chatHistory.shift();
}

export function getLiveCurrentTime(room: Room): number {
  const { playerState } = room;
  if (!playerState.isPlaying) return playerState.currentTime;
  return playerState.currentTime + (Date.now() - playerState.updatedAt) / 1000;
}

// ─── Queue (async — persisted to DB) ─────────────────────────────────────────

export async function addToQueue(roomId: string, item: QueueItem): Promise<void> {
  const room = _rooms.get(roomId);
  if (!room) return;

  const position = room.queue.length;

  await db.insert(roomQueue).values({
    id: item.id,
    roomId,
    type: item.type,
    title: item.title,
    videoId: item.videoId ?? null,
    streamUrl: item.streamUrl ?? null,
    thumbnail: item.thumbnail ?? null,
    addedBy: item.addedBy,
    position,
  });

  room.queue.push(item);
}

export async function removeFromQueue(roomId: string, itemId: string): Promise<boolean> {
  const room = _rooms.get(roomId);
  if (!room) return false;

  const index = room.queue.findIndex(i => i.id === itemId);
  if (index === -1) return false;

  await db.delete(roomQueue).where(eq(roomQueue.id, itemId));
  room.queue.splice(index, 1);

  // Rewrite positions after removal
  await rewriteQueuePositions(roomId, room.queue);
  return true;
}

export async function shiftQueue(roomId: string): Promise<QueueItem | undefined> {
  const room = _rooms.get(roomId);
  if (!room) return undefined;

  const item = room.queue.shift();
  if (!item) return undefined;

  await db.delete(roomQueue).where(eq(roomQueue.id, item.id));
  await rewriteQueuePositions(roomId, room.queue);

  updatePlayerState(roomId, { title: item.title, thumbnail: item.thumbnail ?? null });
  return item;
}

export async function clearQueue(roomId: string): Promise<void> {
  const room = _rooms.get(roomId);
  if (!room) return;
  room.queue = [];
  await db.delete(roomQueue).where(eq(roomQueue.roomId, roomId));
}

export async function reorderQueue(roomId: string, fromIndex: number, toIndex: number): Promise<void> {
  const room = _rooms.get(roomId);
  if (!room) return;

  const last = room.queue.length - 1;
  if (fromIndex < 0 || fromIndex > last || toIndex < 0 || toIndex > last) return;

  const [element] = room.queue.splice(fromIndex, 1);
  room.queue.splice(toIndex, 0, element!);

  await rewriteQueuePositions(roomId, room.queue);
}

export async function switchRoomSource(
  roomId: string,
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url',
  iptvListId?: string,
): Promise<boolean> {
  const room = _rooms.get(roomId);
  if (!room) return false;

  await db.update(roomsTable)
    .set({ sourceType, iptvListId: iptvListId ?? null })
    .where(eq(roomsTable.id, roomId));

  await db.delete(roomQueue).where(eq(roomQueue.roomId, roomId));

  room.sourceType = sourceType;
  room.iptvListId = iptvListId;
  room.playerState = {
    videoId: null,
    streamUrl: null,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    playbackRate: 1,
    revision: 0,
    title: null,
    thumbnail: null,
  };
  room.queue = [];
  return true;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function rewriteQueuePositions(roomId: string, queue: QueueItem[]): Promise<void> {
  for (let i = 0; i < queue.length; i++) {
    await db.update(roomQueue)
      .set({ position: i })
      .where(eq(roomQueue.id, queue[i]!.id));
  }
}
