import crypto from 'crypto';
import type { Room, RoomListItem, PlayerState, ChatMessage } from '../types';

export const _rooms = new Map<string, Room>();

export function createRoom(name: string, maxUsers: number, isOpen: boolean, sourceType: 'youtube' | 'iptv' = 'youtube', iptvListId?: string): Room {
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
    playerState: { videoId: null, streamUrl: null, currentTime: 0, isPlaying: false, updatedAt: Date.now() },
    users: new Map(),
    chatHistory: [],
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
