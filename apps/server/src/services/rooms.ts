import crypto from 'crypto';
import type { Room, RoomListItem, PlayerState, ChatMessage, QueueItem } from '../types';

export const _rooms = new Map<string, Room>();

export function createRoom(name: string, maxUsers: number, isOpen: boolean, sourceType: 'youtube' | 'iptv' | 'movie' = 'youtube', iptvListId?: string): Room {
  const id = crypto.randomUUID();
  const pin = isOpen ? undefined : String(Math.floor(100000 + Math.random() * 900000));
  const room: Room = {
    id,
    name,
    maxUsers,
    isOpen,
    pin,
    createdAt: Date.now(),
    sourceType,
    iptvListId,
    playerState: { videoId: null, streamUrl: null, currentTime: 0, isPlaying: false, updatedAt: Date.now(), title: null, thumbnail: null },
    users: new Map(),
    chatHistory: [],
    queue: [],
  };
  _rooms.set(id, room);
  return room;
}

export function deleteRoom(roomId: string): boolean {
  return _rooms.delete(roomId);
}

export function deleteAllRooms(): void {
  _rooms.clear();
}

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
    sourceType: room.sourceType,
    iptvListId: room.iptvListId,
    playerState: room.playerState,
    users: Array.from(room.users.entries()).map(([socketId, data]) => ({
      socketId,
      username: data.username,
      joinedAt: data.joinedAt,
    })),
  }));
}

export function addUserToRoom(roomId: string, socketId: string, username: string) {
  const room = _rooms.get(roomId);
  if (!room) return { ok: false as const, code: 'ROOM_NOT_FOUND' };
  if (room.users.size >= room.maxUsers) return { ok: false as const, code: 'ROOM_FULL' };
  room.users.set(socketId, { username, joinedAt: new Date() });
  return { ok: true as const };
}

export function removeUserFromRoom(roomId: string, socketId: string): void {
  _rooms.get(roomId)?.users.delete(socketId);
}

export function updatePlayerState(roomId: string, patch: Partial<PlayerState>): void {
  const room = _rooms.get(roomId);
  if (room) {
    Object.assign(room.playerState, patch);
    room.playerState.updatedAt = Date.now();
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

/** Append an item to the end of a room's queue. */
export function addToQueue(roomId: string, item: QueueItem): void {
  const room = _rooms.get(roomId);
  if (room) {
    room.queue.push(item);
  }
}

/**
 * Remove an item from a room's queue by its id.
 * Returns true if the item was found and removed, false otherwise.
 */
export function removeFromQueue(roomId: string, itemId: string): boolean {
  const room = _rooms.get(roomId);
  if (!room) return false;
  const index = room.queue.findIndex(i => i.id === itemId);
  if (index === -1) return false;
  room.queue.splice(index, 1);
  return true;
}

/**
 * Remove and return the first item in the queue.
 * If an item is returned, its title/thumbnail are applied to the player state.
 */
export function shiftQueue(roomId: string): QueueItem | undefined {
  const room = _rooms.get(roomId);
  if (!room) return undefined;
  const item = room.queue.shift();
  if (item) {
    updatePlayerState(roomId, { title: item.title, thumbnail: item.thumbnail ?? null });
  }
  return item;
}

/**
 * Move an item within the queue from one index to another.
 * Both indices must be within [0, queue.length - 1].
 */
export function reorderQueue(roomId: string, fromIndex: number, toIndex: number): void {
  const room = _rooms.get(roomId);
  if (!room) return;
  const last = room.queue.length - 1;
  if (fromIndex < 0 || fromIndex > last || toIndex < 0 || toIndex > last) return;
  const [element] = room.queue.splice(fromIndex, 1);
  room.queue.splice(toIndex, 0, element);
}

/**
 * Switch the active media source for a room.
 * Resets player state and clears the queue.
 * Returns true on success, false if the room does not exist.
 */
export function switchRoomSource(roomId: string, sourceType: 'youtube' | 'iptv' | 'movie', iptvListId?: string): boolean {
  const room = _rooms.get(roomId);
  if (!room) return false;
  room.sourceType = sourceType;
  room.iptvListId = iptvListId;
  room.playerState = {
    videoId: null,
    streamUrl: null,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    title: null,
    thumbnail: null,
  };
  room.queue = [];
  return true;
}
