"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._rooms = void 0;
exports.addTypingUser = addTypingUser;
exports.removeTypingUser = removeTypingUser;
exports.removeTypingUserFromAll = removeTypingUserFromAll;
exports.initRooms = initRooms;
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
exports.addToQueue = addToQueue;
exports.removeFromQueue = removeFromQueue;
exports.shiftQueue = shiftQueue;
exports.reorderQueue = reorderQueue;
exports.switchRoomSource = switchRoomSource;
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../db/index");
const schema_1 = require("../db/schema");
// ─── Runtime in-memory state ──────────────────────────────────────────────────
// Room metadata is persisted in DB. Connected users, chat, and player state
// are ephemeral and stored only in memory during a session.
exports._rooms = new Map();
// Typing indicator state: roomId -> Set<username>
const _typingUsers = new Map();
function addTypingUser(roomId, username) {
    if (!_typingUsers.has(roomId))
        _typingUsers.set(roomId, new Set());
    _typingUsers.get(roomId).add(username);
    return Array.from(_typingUsers.get(roomId));
}
function removeTypingUser(roomId, username) {
    _typingUsers.get(roomId)?.delete(username);
    return Array.from(_typingUsers.get(roomId) ?? []);
}
function removeTypingUserFromAll(username) {
    for (const typingSet of _typingUsers.values()) {
        typingSet.delete(username);
    }
}
// ─── DB helpers ───────────────────────────────────────────────────────────────
function buildRoomFromDb(dbRoom, queue = [], createdByUsername) {
    return {
        id: dbRoom.id,
        name: dbRoom.name,
        maxUsers: dbRoom.maxUsers,
        isOpen: dbRoom.isOpen,
        pin: dbRoom.pin ?? undefined,
        createdAt: dbRoom.createdAt.getTime(),
        sourceType: dbRoom.sourceType,
        iptvListId: dbRoom.iptvListId ?? undefined,
        createdByUsername,
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
        queue,
    };
}
function dbRowToQueueItem(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title ?? '',
        videoId: row.videoId ?? undefined,
        streamUrl: row.streamUrl ?? undefined,
        thumbnail: row.thumbnail ?? undefined,
        addedBy: row.addedBy ?? '',
    };
}
// ─── Initialization (load from DB on startup) ─────────────────────────────────
async function initRooms() {
    const dbRooms = await index_1.db.select().from(schema_1.rooms);
    for (const dbRoom of dbRooms) {
        const queueRows = await index_1.db.select()
            .from(schema_1.roomQueue)
            .where((0, drizzle_orm_1.eq)(schema_1.roomQueue.roomId, dbRoom.id))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.roomQueue.position));
        const queue = queueRows.map(dbRowToQueueItem);
        exports._rooms.set(dbRoom.id, buildRoomFromDb(dbRoom, queue));
    }
    console.log(`[Rooms] Loaded ${dbRooms.length} room(s) from DB`);
}
// ─── CRUD ─────────────────────────────────────────────────────────────────────
async function createRoom(name, maxUsers, isOpen, sourceType = 'youtube', iptvListId, createdByUsername) {
    const pin = isOpen ? null : String(Math.floor(100000 + Math.random() * 900000));
    const [dbRoom] = await index_1.db.insert(schema_1.rooms).values({
        name,
        maxUsers,
        isOpen,
        pin,
        sourceType,
        iptvListId: iptvListId ?? null,
    }).returning();
    const room = buildRoomFromDb(dbRoom, [], createdByUsername);
    exports._rooms.set(room.id, room);
    return room;
}
async function deleteRoom(roomId) {
    const result = await index_1.db.delete(schema_1.rooms).where((0, drizzle_orm_1.eq)(schema_1.rooms.id, roomId)).returning({ id: schema_1.rooms.id });
    exports._rooms.delete(roomId);
    return result.length > 0;
}
async function deleteAllRooms() {
    await index_1.db.delete(schema_1.rooms);
    exports._rooms.clear();
}
// ─── Runtime accessors (synchronous — from memory) ────────────────────────────
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
        createdByUsername: room.createdByUsername,
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
// ─── Queue (async — persisted to DB) ─────────────────────────────────────────
async function addToQueue(roomId, item) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return;
    const position = room.queue.length;
    await index_1.db.insert(schema_1.roomQueue).values({
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
async function removeFromQueue(roomId, itemId) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return false;
    const index = room.queue.findIndex(i => i.id === itemId);
    if (index === -1)
        return false;
    await index_1.db.delete(schema_1.roomQueue).where((0, drizzle_orm_1.eq)(schema_1.roomQueue.id, itemId));
    room.queue.splice(index, 1);
    // Rewrite positions after removal
    await rewriteQueuePositions(roomId, room.queue);
    return true;
}
async function shiftQueue(roomId) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return undefined;
    const item = room.queue.shift();
    if (!item)
        return undefined;
    await index_1.db.delete(schema_1.roomQueue).where((0, drizzle_orm_1.eq)(schema_1.roomQueue.id, item.id));
    await rewriteQueuePositions(roomId, room.queue);
    updatePlayerState(roomId, { title: item.title, thumbnail: item.thumbnail ?? null });
    return item;
}
async function reorderQueue(roomId, fromIndex, toIndex) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return;
    const last = room.queue.length - 1;
    if (fromIndex < 0 || fromIndex > last || toIndex < 0 || toIndex > last)
        return;
    const [element] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex, 0, element);
    await rewriteQueuePositions(roomId, room.queue);
}
async function switchRoomSource(roomId, sourceType, iptvListId) {
    const room = exports._rooms.get(roomId);
    if (!room)
        return false;
    await index_1.db.update(schema_1.rooms)
        .set({ sourceType, iptvListId: iptvListId ?? null })
        .where((0, drizzle_orm_1.eq)(schema_1.rooms.id, roomId));
    await index_1.db.delete(schema_1.roomQueue).where((0, drizzle_orm_1.eq)(schema_1.roomQueue.roomId, roomId));
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
// ─── Internal helper ──────────────────────────────────────────────────────────
async function rewriteQueuePositions(roomId, queue) {
    for (let i = 0; i < queue.length; i++) {
        await index_1.db.update(schema_1.roomQueue)
            .set({ position: i })
            .where((0, drizzle_orm_1.eq)(schema_1.roomQueue.id, queue[i].id));
    }
}
