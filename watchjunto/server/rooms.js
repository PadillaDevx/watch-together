'use strict';

const crypto = require('crypto');

/**
 * Room shape:
 * {
 *   id: string,
 *   name: string,
 *   maxUsers: number,
 *   isOpen: boolean,
 *   createdAt: number,
 *   playerState: { videoId: string|null, currentTime: number, isPlaying: boolean, updatedAt: number },
 *   users: Map<socketId:string, { username: string, joinedAt: Date }>,
 *   chatHistory: Array<object>
 * }
 */

// Module-level room store: Map<roomId:string, Room>
const rooms = new Map();

/**
 * Create a new room.
 * @param {string} name
 * @param {number} maxUsers
 * @param {boolean} isOpen
 * @returns {object} The full room object
 */
function createRoom(name, maxUsers, isOpen) {
  const id = crypto.randomUUID();
  const room = {
    id,
    name,
    maxUsers,
    isOpen,
    createdAt: Date.now(),
    playerState: {
      videoId: null,
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    },
    users: new Map(),
    chatHistory: [],
  };
  rooms.set(id, room);
  return room;
}

/**
 * Delete a room by ID.
 * @param {string} roomId
 * @returns {boolean}
 */
function deleteRoom(roomId) {
  return rooms.delete(roomId);
}

/**
 * Delete all rooms.
 */
function deleteAllRooms() {
  rooms.clear();
}

/**
 * Get a raw room object.
 * @param {string} roomId
 * @returns {object|undefined}
 */
function getRoom(roomId) {
  return rooms.get(roomId);
}

/**
 * Get a JSON-safe list of all rooms.
 * Converts inner users Map to an array and omits chatHistory.
 * @returns {Array<object>}
 */
function getRoomList() {
  const list = [];
  for (const room of rooms.values()) {
    const users = [];
    for (const [socketId, data] of room.users.entries()) {
      users.push({ socketId, username: data.username, joinedAt: data.joinedAt });
    }
    list.push({
      id: room.id,
      name: room.name,
      maxUsers: room.maxUsers,
      isOpen: room.isOpen,
      createdAt: room.createdAt,
      playerState: room.playerState,
      users,
    });
  }
  return list;
}

/**
 * Add a user to a room.
 * @param {string} roomId
 * @param {string} socketId
 * @param {string} username
 * @returns {{ ok: boolean, code?: string }}
 */
function addUserToRoom(roomId, socketId, username) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
  if (room.users.size >= room.maxUsers) return { ok: false, code: 'ROOM_FULL' };
  if (!room.isOpen) return { ok: false, code: 'ROOM_CLOSED' };
  room.users.set(socketId, { username, joinedAt: new Date() });
  return { ok: true };
}

/**
 * Remove a user from a room.
 * @param {string} roomId
 * @param {string} socketId
 */
function removeUserFromRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (room) {
    room.users.delete(socketId);
  }
}

/**
 * Merge a patch into room's playerState, always updating updatedAt.
 * @param {string} roomId
 * @param {object} patch
 */
function updatePlayerState(roomId, patch) {
  const room = rooms.get(roomId);
  if (room) {
    Object.assign(room.playerState, patch);
    room.playerState.updatedAt = Date.now();
  }
}

/**
 * Append a chat message to a room's history (max 100).
 * @param {string} roomId
 * @param {object} msg
 */
function appendChatMessage(roomId, msg) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.chatHistory.push(msg);
  if (room.chatHistory.length > 100) {
    room.chatHistory.splice(0, room.chatHistory.length - 100);
  }
}

/**
 * Get chat history for a room.
 * @param {string} roomId
 * @returns {Array<object>}
 */
function getChatHistory(roomId) {
  const room = rooms.get(roomId);
  return room ? room.chatHistory : [];
}

/**
 * Compute the live current playback time accounting for elapsed time when playing.
 * @param {object} room
 * @returns {number}
 */
function getLiveCurrentTime(room) {
  if (room.playerState.isPlaying) {
    return room.playerState.currentTime + (Date.now() - room.playerState.updatedAt) / 1000;
  }
  return room.playerState.currentTime;
}

module.exports = {
  createRoom,
  deleteRoom,
  deleteAllRooms,
  getRoom,
  getRoomList,
  addUserToRoom,
  removeUserFromRoom,
  updatePlayerState,
  appendChatMessage,
  getChatHistory,
  getLiveCurrentTime,
  // Expose the raw Map only for internal server use (disconnect handler needs to iterate)
  _rooms: rooms,
};
