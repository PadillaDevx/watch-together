import crypto from 'crypto';
import type { Server } from 'socket.io';
import { parseCookies } from '../middleware/auth';
import { validateSession, getUser, isAdminSession } from '../services/users';
import {
  getRoom, getRoomList, addUserToRoom, removeUserFromRoom,
  updatePlayerState, appendChatMessage, getLiveCurrentTime, _rooms,
  addToQueue, removeFromQueue, shiftQueue, reorderQueue, switchRoomSource,
  addTypingUser, removeTypingUser, removeTypingUserFromAll,
  promoteNextHost,
} from '../services/rooms';
import { trustHostname } from '../routes/iptv';
import type { QueueItem, ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function getRoomUsers(room: NonNullable<ReturnType<typeof getRoom>>) {
  return Array.from(room.users.entries()).map(([socketId, data]) => ({
    socketId, username: data.username, joinedAt: data.joinedAt,
  }));
}

export function setupSocket(io: IO): void {
  io.use(async (socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies['wj_session'];
    if (token) {
      const username = validateSession(token);
      if (username) {
        socket.data.username = username;
        socket.data.authenticated = true;
        const user = await getUser(username);
        socket.data.avatar = user?.avatar ?? null;
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
      // If the joining user became the first host, notify the whole room so
      // clients can render the host badge immediately.
      if (result.becameHost && room.hostUserId && room.hostUsername) {
        io.to(roomId).emit('host-changed', {
          newHostUsername: room.hostUsername,
          newHostSocketId: room.hostUserId,
        });
      } else if (!result.becameHost && room.hostUserId && room.hostUsername) {
        // The joining user did not become host, but the room already has one.
        // Emit `host-changed` directly to the joining socket so the client can
        // initialize its host state (the `room-users` payload does not include
        // the host identity).
        socket.emit('host-changed', {
          newHostUsername: room.hostUsername,
          newHostSocketId: room.hostUserId,
        });
      }
      console.log('[WJ]', socket.data.username, 'joined room', roomId);
    });

    socket.on('leave-room', ({ roomId }) => {
      const room = getRoom(roomId);
      const wasHost = room?.hostUserId === socket.id;
      const previousHostUsername = room?.hostUsername;

      removeUserFromRoom(roomId, socket.id);
      socket.leave(roomId);
      if (room) {
        socket.to(roomId).emit('user-left', { username: socket.data.username });

        if (wasHost) {
          const promotion = promoteNextHost(roomId);
          if (promotion) {
            io.to(roomId).emit('host-changed', {
              newHostUsername: promotion.newHostUsername,
              newHostSocketId: promotion.newHostSocketId,
              previousHostUsername: promotion.previousHostUsername ?? previousHostUsername,
            });
          }
        }

        io.to(roomId).emit('room-users', getRoomUsers(room));
      }
      io.emit('room-list', getRoomList());
    });

    socket.on('player-play', ({ roomId, currentTime, sentAt }) => {
      updatePlayerState(roomId, { isPlaying: true, currentTime });
      // Forward sentAt so receiver can compensate for network latency
      socket.to(roomId).emit('player-play', { currentTime, sentAt: sentAt ?? Date.now() });
    });

    socket.on('player-pause', ({ roomId, currentTime, sentAt }) => {
      updatePlayerState(roomId, { isPlaying: false, currentTime });
      socket.to(roomId).emit('player-pause', { currentTime, sentAt: sentAt ?? Date.now() });
    });

    socket.on('player-seek', ({ roomId, currentTime }) => {
      updatePlayerState(roomId, { currentTime });
      socket.to(roomId).emit('player-seek', { currentTime });
    });

    socket.on('player-load', (data) => {
      const { roomId } = data;
      if (data.type === 'iptv') {
        // For URL rooms, auto-trust the hostname so the proxy allows it
        const room = getRoom(roomId);
        if (room?.sourceType === 'url') {
          try { trustHostname(new URL(data.streamUrl).hostname); } catch { /* ignore invalid URLs */ }
        }
        updatePlayerState(roomId, { streamUrl: data.streamUrl, videoId: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'iptv', streamUrl: data.streamUrl });
      } else if (data.type === 'series') {
        updatePlayerState(roomId, { videoId: null, streamUrl: data.embedUrl, currentTime: 0, isPlaying: false, title: data.title ?? null, thumbnail: data.thumbnail ?? null });
        io.to(roomId).emit('player-load', { type: 'series', embedUrl: data.embedUrl, title: data.title, thumbnail: data.thumbnail });
      } else {
        updatePlayerState(roomId, { videoId: data.videoId, streamUrl: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'youtube', videoId: data.videoId });
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

    // Feature 4: unified player-action with latency compensation
    socket.on('player-action', ({ roomId, action, currentTime, timestamp, videoId, streamUrl, embedUrl, title, thumbnail }: {
      roomId: string; action: string; currentTime?: number; timestamp: number;
      videoId?: string; streamUrl?: string; embedUrl?: string; title?: string; thumbnail?: string;
    }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;
      const latencyMs = Date.now() - (timestamp ?? Date.now());
      const latencyS = latencyMs / 1000;
      const adjustedTime = (currentTime ?? 0) + latencyS / 2;
      if (action === 'play') {
        updatePlayerState(roomId, { currentTime: adjustedTime, isPlaying: true });
      } else if (action === 'pause') {
        updatePlayerState(roomId, { currentTime: currentTime ?? 0, isPlaying: false });
      } else if (action === 'seek') {
        updatePlayerState(roomId, { currentTime: adjustedTime });
      }
      socket.to(roomId).emit('player-sync', { action: action as 'pause' | 'play' | 'seek' | 'load' | 'episode-change', currentTime: adjustedTime, serverTime: Date.now() });
    });

    socket.on('queue-add', async ({ roomId, item }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;
      const newItem: QueueItem = {
        ...item,
        id: crypto.randomUUID(),
        addedBy: socket.data.username!,
      };
      await addToQueue(roomId, newItem);
      io.to(roomId).emit('queue-update', room.queue);
    });

    socket.on('queue-remove', async ({ roomId, itemId }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;
      const idx = room.queue.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      const item = room.queue[idx];
      if (item!.addedBy !== socket.data.username && socket.data.isAdmin !== true) {
        socket.emit('error', { code: 'FORBIDDEN' });
        return;
      }
      await removeFromQueue(roomId, itemId);
      io.to(roomId).emit('queue-update', room.queue);
    });

    socket.on('queue-next', async ({ roomId }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;
      const item = await shiftQueue(roomId);
      if (!item) {
        io.to(roomId).emit('queue-update', room.queue);
        return;
      }
      if (item.type === 'youtube') {
        updatePlayerState(roomId, { videoId: item.videoId!, streamUrl: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'youtube', videoId: item.videoId! });
      } else {
        updatePlayerState(roomId, { streamUrl: item.streamUrl!, videoId: null, currentTime: 0, isPlaying: false });
        io.to(roomId).emit('player-load', { type: 'iptv', streamUrl: item.streamUrl! });
      }
      io.to(roomId).emit('queue-update', room.queue);
    });

    socket.on('queue-reorder', async ({ roomId, fromIndex, toIndex }) => {
      if (socket.data.isAdmin !== true) {
        socket.emit('error', { code: 'FORBIDDEN' });
        return;
      }
      const room = getRoom(roomId);
      if (!room) return;
      await reorderQueue(roomId, fromIndex, toIndex);
      io.to(roomId).emit('queue-update', room.queue);
    });

    socket.on('switch-source', async ({ roomId, sourceType, iptvListId }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;
      await switchRoomSource(roomId, sourceType as 'youtube' | 'iptv' | 'movie' | 'url', iptvListId);
      io.to(roomId).emit('source-switched', { sourceType, iptvListId });
      io.to(roomId).emit('queue-update', []);
      io.emit('room-list', getRoomList());
    });

    socket.on('series-episode-change', async (data) => {
      const { roomId, serieId, serieName, temporada, episodioIndex, embedUrl, titulo } = data;
      if (!socket.data.authenticated || !socket.data.username) return;
      if (socket.data.roomId !== roomId) return;
      updatePlayerState(roomId, { streamUrl: embedUrl, videoId: null, currentTime: 0, isPlaying: false, title: titulo, thumbnail: null });
      io.to(roomId).emit('series-episode-change', { serieId, serieName, temporada, episodioIndex, embedUrl, titulo });
      io.to(roomId).emit('player-load', { type: 'series', embedUrl, title: titulo });
    });

    // Passive sync: client signals it has loaded the iframe
    socket.on('client-ready', ({ roomId }) => {
      if (!socket.data.authenticated) return;
      const room = getRoom(roomId);
      if (!room) return;

      room.readyUsers.add(socket.id);

      const allReady = Array.from(room.users.keys()).every((sid) => room.readyUsers.has(sid));

      if (allReady) {
        clearTimeout(room.readyTimeoutHandle);
        room.readyTimeoutHandle = undefined;
        room.readyUsers.clear();
        const playAt = Date.now() + 2000;
        io.to(roomId).emit('start-playback', { playAt, serverNow: Date.now() });
      } else if (!room.readyTimeoutHandle) {
        // Fallback: start anyway after 8 seconds if not everyone is ready
        room.readyTimeoutHandle = setTimeout(() => {
          room.readyTimeoutHandle = undefined;
          room.readyUsers.clear();
          io.to(roomId).emit('start-playback', { playAt: Date.now() + 1000, serverNow: Date.now() });
        }, 8000);
      }
    });

    // Passive sync: viewer requests current position
    socket.on('request-resync', ({ roomId }) => {
      const room = getRoom(roomId);
      if (!room) return;
      const currentTime = getLiveCurrentTime(room);
      socket.emit('resync-state', {
        currentTime,
        isPlaying: room.playerState.isPlaying,
        serverNow: Date.now(),
        syncMode: 'passive',
      });
    });

    socket.on('typing-start', ({ roomId, username }) => {
      if (!socket.data.authenticated) return;
      const typingUsers = addTypingUser(roomId, username);
      socket.to(roomId).emit('typing-update', { roomId, typingUsers });
    });

    socket.on('typing-stop', ({ roomId, username }) => {
      if (!socket.data.authenticated) return;
      const typingUsers = removeTypingUser(roomId, username);
      socket.to(roomId).emit('typing-update', { roomId, typingUsers });
    });

    socket.on('disconnect', () => {
      if (socket.data.username) {
        removeTypingUserFromAll(socket.data.username);
      }
      for (const room of _rooms.values()) {
        if (room.users.has(socket.id)) {
          const wasHost = room.hostUserId === socket.id;
          const previousHostUsername = room.hostUsername;

          room.readyUsers.delete(socket.id);
          removeUserFromRoom(room.id, socket.id);
          socket.to(room.id).emit('user-left', { username: socket.data.username });

          if (wasHost) {
            const promotion = promoteNextHost(room.id);
            if (promotion) {
              io.to(room.id).emit('host-changed', {
                newHostUsername: promotion.newHostUsername,
                newHostSocketId: promotion.newHostSocketId,
                previousHostUsername: promotion.previousHostUsername ?? previousHostUsername,
              });
            }
          }

          io.to(room.id).emit('room-users', getRoomUsers(room));
          io.emit('room-list', getRoomList());
        }
      }
    });
  });

  // Feature 4: heartbeat for active rooms — large interval to avoid disrupting
  // playback. Clients only correct drifts >5s (see onPlayerHeartbeat in RoomPage)
  setInterval(() => {
    for (const room of _rooms.values()) {
      if (room.playerState.isPlaying && room.users.size > 1) {
        const elapsed = (Date.now() - (room.playerState.updatedAt ?? Date.now())) / 1000;
        const estimatedTime = (room.playerState.currentTime ?? 0) + elapsed;
        io.to(room.id).emit('player-heartbeat', { currentTime: estimatedTime, isPlaying: true });
      }
    }
  }, 120000);
}
