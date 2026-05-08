'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const cookieParser = require('cookie-parser');

const {
  createRoom,
  deleteRoom,
  deleteAllRooms,
  getRoom,
  getRoomList,
  addUserToRoom,
  removeUserFromRoom,
  updatePlayerState,
  appendChatMessage,
  getLiveCurrentTime,
  _rooms,
} = require('./rooms');

const {
  generateToken,
  validateToken,
  markTokenUsed,
  revokeAllTokens,
  listTokens,
  signAdminCookie,
  verifyAdminCookie,
} = require('./auth');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the first non-internal IPv4 address on any network interface.
 * @returns {string}
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const ifaceList of Object.values(interfaces)) {
    for (const iface of ifaceList) {
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ---------------------------------------------------------------------------
// Express + Socket.IO setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// ---------------------------------------------------------------------------
// Admin auth middleware
// ---------------------------------------------------------------------------

function adminAuth(req, res, next) {
  const cookie = req.cookies && req.cookies.wj_admin;
  if (!cookie) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!verifyAdminCookie(cookie, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

// Validate invite token and redirect
app.get('/join/:token', (req, res) => {
  if (validateToken(req.params.token)) {
    return res.redirect('/?token=' + req.params.token);
  }
  return res.redirect('/join-required.html');
});

// List rooms (public)
app.get('/api/rooms', (_req, res) => {
  res.json(getRoomList());
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.cookie('wj_admin', signAdminCookie(password), {
    httpOnly: true,
    sameSite: 'strict',
  });
  return res.json({ ok: true });
});

// Create room (admin)
app.post('/api/admin/rooms', adminAuth, (req, res) => {
  const { name, maxUsers, isOpen } = req.body;
  const room = createRoom(name, Number(maxUsers), Boolean(isOpen));
  io.emit('room-list', getRoomList());
  return res.json(room);
});

// Delete one room (admin)
app.delete('/api/admin/rooms/:id', adminAuth, (req, res) => {
  deleteRoom(req.params.id);
  io.emit('room-list', getRoomList());
  return res.json({ ok: true });
});

// Delete all rooms (admin)
app.delete('/api/admin/rooms', adminAuth, (_req, res) => {
  deleteAllRooms();
  io.emit('room-list', getRoomList());
  return res.json({ ok: true });
});

// Generate invite token (admin)
app.post('/api/admin/invite', adminAuth, (_req, res) => {
  const baseUrl = 'http://' + getLocalIP() + ':' + PORT;
  const result = generateToken(baseUrl);
  return res.json(result);
});

// List tokens (admin)
app.get('/api/admin/tokens', adminAuth, (_req, res) => {
  return res.json({ tokens: listTokens() });
});

// Revoke all tokens (admin)
app.delete('/api/admin/tokens', adminAuth, (_req, res) => {
  revokeAllTokens();
  return res.json({ ok: true });
});

// List active connections (admin)
app.get('/api/admin/connections', adminAuth, (_req, res) => {
  const connections = [];
  for (const room of _rooms.values()) {
    for (const [socketId, userData] of room.users.entries()) {
      connections.push({
        roomId: room.id,
        roomName: room.name,
        socketId,
        username: userData.username,
        joinedAt: userData.joinedAt,
      });
    }
  }
  return res.json(connections);
});

// ---------------------------------------------------------------------------
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  // Helper: get a JSON-safe users array for a room
  function getRoomUsers(room) {
    const users = [];
    for (const [sid, data] of room.users.entries()) {
      users.push({ socketId: sid, username: data.username, joinedAt: data.joinedAt });
    }
    return users;
  }

  // join-room
  socket.on('join-room', ({ roomId, username, token }) => {
    if (!validateToken(token)) {
      socket.emit('error', { code: 'INVALID_TOKEN' });
      return;
    }

    const result = addUserToRoom(roomId, socket.id, username);
    if (!result.ok) {
      socket.emit('error', { code: result.code });
      return;
    }

    socket.join(roomId);
    socket.data = { roomId, username };
    markTokenUsed(token, socket.id);

    const room = getRoom(roomId);
    const liveTime = getLiveCurrentTime(room);

    // Send current playback state to the joining socket
    socket.emit('sync-state', {
      videoId: room.playerState.videoId,
      currentTime: liveTime,
      isPlaying: room.playerState.isPlaying,
    });

    // Notify others in the room
    socket.to(roomId).emit('user-joined', { username });

    // Broadcast updated user list to everyone in the room
    io.to(roomId).emit('room-users', getRoomUsers(room));

    // Broadcast updated room list to all connected clients
    io.emit('room-list', getRoomList());

    console.log('[WJ]', username, 'joined room', roomId);
  });

  // leave-room
  socket.on('leave-room', ({ roomId }) => {
    const { username } = socket.data || {};
    removeUserFromRoom(roomId, socket.id);
    socket.leave(roomId);

    const room = getRoom(roomId);
    if (room) {
      socket.to(roomId).emit('user-left', { username });
      io.to(roomId).emit('room-users', getRoomUsers(room));
    }
    io.emit('room-list', getRoomList());
  });

  // player-play
  socket.on('player-play', ({ roomId, currentTime }) => {
    updatePlayerState(roomId, { isPlaying: true, currentTime });
    socket.to(roomId).emit('player-play', { currentTime });
    console.log('[WJ] player-play in room', roomId, 'at', currentTime);
  });

  // player-pause
  socket.on('player-pause', ({ roomId, currentTime }) => {
    updatePlayerState(roomId, { isPlaying: false, currentTime });
    socket.to(roomId).emit('player-pause', { currentTime });
  });

  // player-seek
  socket.on('player-seek', ({ roomId, currentTime }) => {
    updatePlayerState(roomId, { currentTime });
    socket.to(roomId).emit('player-seek', { currentTime });
  });

  // player-load
  socket.on('player-load', ({ roomId, videoId }) => {
    updatePlayerState(roomId, { videoId, currentTime: 0, isPlaying: false });
    io.to(roomId).emit('player-load', { videoId });
    console.log('[WJ] player-load in room', roomId, 'videoId:', videoId);
  });

  // chat-message
  socket.on('chat-message', ({ roomId, username, text }) => {
    // Sanitize: replace HTML angle brackets and truncate to 500 chars
    const sanitized = String(text)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .slice(0, 500);

    const msg = { username, text: sanitized, timestamp: Date.now() };
    appendChatMessage(roomId, msg);
    io.to(roomId).emit('chat-message', msg);
  });

  // request-sync
  socket.on('request-sync', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const liveTime = getLiveCurrentTime(room);
    socket.emit('sync-state', {
      videoId: room.playerState.videoId,
      currentTime: liveTime,
      isPlaying: room.playerState.isPlaying,
    });
  });

  // disconnect
  socket.on('disconnect', () => {
    const { username } = socket.data || {};
    for (const room of _rooms.values()) {
      if (room.users.has(socket.id)) {
        removeUserFromRoom(room.id, socket.id);
        socket.to(room.id).emit('user-left', { username });
        io.to(room.id).emit('room-users', (() => {
          const users = [];
          for (const [sid, data] of room.users.entries()) {
            users.push({ socketId: sid, username: data.username, joinedAt: data.joinedAt });
          }
          return users;
        })());
        io.emit('room-list', getRoomList());
        console.log('[WJ]', username || socket.id, 'disconnected from room', room.id);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log('[WJ] Server running at http://' + getLocalIP() + ':' + PORT);
});
