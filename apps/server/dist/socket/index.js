"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocket = setupSocket;
const auth_1 = require("../middleware/auth");
const users_1 = require("../services/users");
const rooms_1 = require("../services/rooms");
function getRoomUsers(room) {
    return Array.from(room.users.entries()).map(([socketId, data]) => ({
        socketId, username: data.username, joinedAt: data.joinedAt,
    }));
}
function setupSocket(io) {
    io.use((socket, next) => {
        const cookies = (0, auth_1.parseCookies)(socket.handshake.headers.cookie);
        const token = cookies['wj_session'];
        if (token) {
            const username = (0, users_1.validateSession)(token);
            if (username) {
                socket.data.username = username;
                socket.data.authenticated = true;
                socket.data.avatar = (0, users_1.getUser)(username)?.avatar ?? null;
            }
        }
        next();
    });
    io.on('connection', (socket) => {
        socket.on('join-room', ({ roomId, pin }) => {
            if (!socket.data.authenticated) {
                socket.emit('error', { code: 'NOT_AUTHENTICATED' });
                return;
            }
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room) {
                socket.emit('error', { code: 'ROOM_NOT_FOUND' });
                return;
            }
            if (room.pin && pin !== room.pin) {
                socket.emit('error', { code: 'WRONG_PIN' });
                return;
            }
            const result = (0, rooms_1.addUserToRoom)(roomId, socket.id, socket.data.username);
            if (!result.ok) {
                socket.emit('error', { code: result.code });
                return;
            }
            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.emit('sync-state', {
                videoId: room.playerState.videoId,
                streamUrl: room.playerState.streamUrl ?? null,
                currentTime: (0, rooms_1.getLiveCurrentTime)(room),
                isPlaying: room.playerState.isPlaying,
                sourceType: room.sourceType,
            });
            socket.to(roomId).emit('user-joined', { username: socket.data.username });
            io.to(roomId).emit('room-users', getRoomUsers(room));
            io.emit('room-list', (0, rooms_1.getRoomList)());
            console.log('[WJ]', socket.data.username, 'joined room', roomId);
        });
        socket.on('leave-room', ({ roomId }) => {
            (0, rooms_1.removeUserFromRoom)(roomId, socket.id);
            socket.leave(roomId);
            const room = (0, rooms_1.getRoom)(roomId);
            if (room) {
                socket.to(roomId).emit('user-left', { username: socket.data.username });
                io.to(roomId).emit('room-users', getRoomUsers(room));
            }
            io.emit('room-list', (0, rooms_1.getRoomList)());
        });
        socket.on('player-play', ({ roomId, currentTime }) => {
            (0, rooms_1.updatePlayerState)(roomId, { isPlaying: true, currentTime });
            socket.to(roomId).emit('player-play', { currentTime });
        });
        socket.on('player-pause', ({ roomId, currentTime }) => {
            (0, rooms_1.updatePlayerState)(roomId, { isPlaying: false, currentTime });
            socket.to(roomId).emit('player-pause', { currentTime });
        });
        socket.on('player-seek', ({ roomId, currentTime }) => {
            (0, rooms_1.updatePlayerState)(roomId, { currentTime });
            socket.to(roomId).emit('player-seek', { currentTime });
        });
        socket.on('player-load', (data) => {
            const { roomId } = data;
            if (data.type === 'iptv') {
                (0, rooms_1.updatePlayerState)(roomId, { streamUrl: data.streamUrl, videoId: null, currentTime: 0, isPlaying: false });
                io.to(roomId).emit('player-load', { type: 'iptv', streamUrl: data.streamUrl });
                console.log('[WJ] load IPTV in room', roomId, 'streamUrl:', data.streamUrl);
            }
            else {
                (0, rooms_1.updatePlayerState)(roomId, { videoId: data.videoId, streamUrl: null, currentTime: 0, isPlaying: false });
                io.to(roomId).emit('player-load', { type: 'youtube', videoId: data.videoId });
                console.log('[WJ] load YouTube in room', roomId, 'videoId:', data.videoId);
            }
        });
        socket.on('chat-message', ({ roomId, text }) => {
            if (!socket.data.authenticated)
                return;
            const sanitized = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500);
            const msg = { username: socket.data.username, text: sanitized, timestamp: Date.now(), avatar: socket.data.avatar ?? null };
            (0, rooms_1.appendChatMessage)(roomId, msg);
            io.to(roomId).emit('chat-message', msg);
        });
        socket.on('request-sync', ({ roomId }) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room)
                return;
            socket.emit('sync-state', {
                videoId: room.playerState.videoId,
                streamUrl: room.playerState.streamUrl ?? null,
                currentTime: (0, rooms_1.getLiveCurrentTime)(room),
                isPlaying: room.playerState.isPlaying,
                sourceType: room.sourceType,
            });
        });
        socket.on('resync-all', ({ roomId, currentTime, isPlaying }) => {
            if (!socket.data.authenticated)
                return;
            (0, rooms_1.updatePlayerState)(roomId, { currentTime, isPlaying });
            const room = (0, rooms_1.getRoom)(roomId);
            // Push the exact state to everyone in the room (including sender)
            io.to(roomId).emit('sync-state', {
                videoId: room?.playerState.videoId ?? null,
                streamUrl: room?.playerState.streamUrl ?? null,
                currentTime,
                isPlaying,
                sourceType: room?.sourceType ?? 'youtube',
            });
        });
        socket.on('disconnect', () => {
            for (const room of rooms_1._rooms.values()) {
                if (room.users.has(socket.id)) {
                    (0, rooms_1.removeUserFromRoom)(room.id, socket.id);
                    socket.to(room.id).emit('user-left', { username: socket.data.username });
                    io.to(room.id).emit('room-users', getRoomUsers(room));
                    io.emit('room-list', (0, rooms_1.getRoomList)());
                }
            }
        });
    });
}
