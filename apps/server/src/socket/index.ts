import type { Server } from 'socket.io';
import { parseCookies } from '../middleware/auth';
import { validateSession, getUser, isAdminSession } from '../services/users';
import {
  getRoom, getRoomList, addUserToRoom, removeUserFromRoom,
  updatePlayerState, appendChatMessage, getLiveCurrentTime, _rooms,
} from '../services/rooms';
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function getRoomUsers(room: NonNullable<ReturnType<typeof getRoom>>) {
  return Array.from(room.users.entries()).map(([socketId, data]) => ({
    socketId, username: data.username, joinedAt: data.joinedAt,
  }));
}

export function setupSocket(io: IO): void {
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies['wj_session'];
    if (token) {
      const username = validateSession(token);
      if (username) {
        socket.data.username = username;
        socket.data.authenticated = true;
        socket.data.avatar = getUser(username)?.avatar ?? null;
        // Propagate admin flag so socket handlers can check permissions
        socket.data.isAdmin = isAdminSession(token);
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, pin }) => {
      if (!socket.data.authenticated) { socket.emit('error', { code: 'NOT_AUTHENTICATED' }); return; }
      const room = getRoom(roomId);
      if (!room) { socket.emit('error', { code: 'ROOM_NOT_FOUND' }); return; }
      if (room.pin && pin !== room.pin) { socket.emit('error', { code: 'WRONG_PIN' }); return; }
      const result = addUserToRoom(roomId, socket.id, socket.data.username);
      if (!result.ok) { socket.emit('error', { code: result.code }); return; }

      socket.join(roomId);
      socket.data.roomId = roomId;

      socket.emit('sync-state', {
        videoId: room.playerState.videoId,
        streamUrl: room.playerState.streamUrl ?? null,
        currentTime: getLiveCurrentTime(room),
        isPlaying: room.playerState.isPlaying,
        sourceType: room.sourceType,
        queue: room.queue,
        title: room.playerState.title,
        thumbnail: room.playerState.thumbnail,
      });
      socket.to(roomId).emit('user-joined', { username: socket.data.username });
      io.to(roomId).emit('room-users', getRoomUsers(room));
      io.emit('room-list', getRoomList());
      console.log('[WJ]', socket.data.username, 'joined room', roomId);
    });

    socket.on('leave-room', ({ roomId }) => {
      removeUserFromRoom(roomId, socket.id);
      socket.leave(roomId);
      const room = getRoom(roomId);
      if (room) {
        socket.to(roomId).emit('user-left', { username: socket.data.username });
        io.to(roomId).emit('room-users', getRoomUsers(room));
      }
      io.emit('room-list', getRoomList());
    });

    socket.on('player-play', ({ roomId, currentTime }) => {
      updatePlayerState(roomId, { isPlaying: true, currentTime });
      socket.to(roomId).emit('player-play', { currentTime });
    });

    socket.on('player-pause', ({ roomId, currentTime }) => {
      updatePlayerState(roomId, { isPlaying: false, currentTime });
      socket.to(roomId).emit('player-pause', { currentTime });
    });

    socket.on('player-seek', ({ roomId, currentTime }) => {
      updatePlayerState(roomId, { currentTime });
      socket.to(roomId).emit('player-seek', { currentTime });
    });

    socket.on('player-load', (data) => {
      const { roomId } = data;
      if (data.type === 'iptv') {
        updatePlayerState(roomId, { streamUrl: data.streamUrl, videoId: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'iptv', streamUrl: data.streamUrl });
        console.log('[WJ] load IPTV in room', roomId, 'streamUrl:', data.streamUrl);
      } else {
        updatePlayerState(roomId, { videoId: data.videoId, streamUrl: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'youtube', videoId: data.videoId });
        console.log('[WJ] load YouTube in room', roomId, 'videoId:', data.videoId);
      }
    });

    socket.on('chat-message', ({ roomId, text }) => {
      if (!socket.data.authenticated) return;
      const sanitized = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500);
      const msg = { username: socket.data.username, text: sanitized, timestamp: Date.now(), avatar: socket.data.avatar ?? null };
      appendChatMessage(roomId, msg);
      io.to(roomId).emit('chat-message', msg);
    });

    socket.on('request-sync', ({ roomId }) => {
      const room = getRoom(roomId);
      if (!room) return;
      socket.emit('sync-state', {
        videoId: room.playerState.videoId,
        streamUrl: room.playerState.streamUrl ?? null,
        currentTime: getLiveCurrentTime(room),
        isPlaying: room.playerState.isPlaying,
        sourceType: room.sourceType,
        queue: room.queue,
        title: room.playerState.title,
        thumbnail: room.playerState.thumbnail,
      });
    });

    socket.on('resync-all', ({ roomId, currentTime, isPlaying }) => {
      if (!socket.data.authenticated) return;
      updatePlayerState(roomId, { currentTime, isPlaying });
      const room = getRoom(roomId);
      // Push the exact state to everyone in the room (including sender)
      io.to(roomId).emit('sync-state', {
        videoId: room?.playerState.videoId ?? null,
        streamUrl: room?.playerState.streamUrl ?? null,
        currentTime,
        isPlaying,
        sourceType: room?.sourceType ?? 'youtube',
        queue: room?.queue ?? [],
        title: room?.playerState.title ?? null,
        thumbnail: room?.playerState.thumbnail ?? null,
      });
    });

    socket.on('disconnect', () => {
      for (const room of _rooms.values()) {
        if (room.users.has(socket.id)) {
          removeUserFromRoom(room.id, socket.id);
          socket.to(room.id).emit('user-left', { username: socket.data.username });
          io.to(room.id).emit('room-users', getRoomUsers(room));
          io.emit('room-list', getRoomList());
        }
      }
    });
  });
}
