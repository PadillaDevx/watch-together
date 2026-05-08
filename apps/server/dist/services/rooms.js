"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._rooms = void 0;
exports.createRoom = createRoom;
exports.deleteRoom = deleteRoom;
exports.deleteAllRooms = deleteAllRooms;
exports.getRoom = getRoom;
exports.getRoomList = getRoomList;
exports.addUserToRoom = addUserToRoom;
exports.removeUserFromRoom = removeUserFromRoom;
exports.updatePlayerState = updatePlayerState;
exports.appendChatMessage = appendChatMessage;
exports.getLiveCurrentTime = getLiveCurrentTime;
const crypto_1 = __importDefault(require("crypto"));
exports._rooms = new Map();
function createRoom(name, maxUsers, isOpen, sourceType = 'youtube', iptvListId) {
    const id = crypto_1.default.randomUUID();
    const pin = isOpen ? undefined : String(Math.floor(100000 + Math.random() * 900000));
    const room = {
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
    exports._rooms.set(id, room);
    return room;
}
function deleteRoom(roomId) {
    return exports._rooms.delete(roomId);
}
function deleteAllRooms() {
    exports._rooms.clear();
}
function getRoom(roomId) {
    return exports._rooms.get(roomId);
}
function getRoomList() {
    return Array.from(exports._rooms.values()).map(room => ({
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
function addUserToRoom(roomId, socketId, username) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return { ok: false, code: 'ROOM_NOT_FOUND' };
    if (room.users.size >= room.maxUsers)
        return { ok: false, code: 'ROOM_FULL' };
    room.users.set(socketId, { username, joinedAt: new Date() });
    return { ok: true };
}
function removeUserFromRoom(roomId, socketId) {
    exports._rooms.get(roomId)?.users.delete(socketId);
}
function updatePlayerState(roomId, patch) {
    const room = exports._rooms.get(roomId);
    if (room) {
        Object.assign(room.playerState, patch);
        room.playerState.updatedAt = Date.now();
    }
}
function appendChatMessage(roomId, msg) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return;
    room.chatHistory.push(msg);
    if (room.chatHistory.length > 100)
        room.chatHistory.shift();
}
function getLiveCurrentTime(room) {
    const { playerState } = room;
    if (!playerState.isPlaying)
        return playerState.currentTime;
    return playerState.currentTime + (Date.now() - playerState.updatedAt) / 1000;
}
