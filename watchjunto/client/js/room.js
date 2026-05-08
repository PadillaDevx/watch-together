'use strict';

document.addEventListener('DOMContentLoaded', () => {
  WJ.init();

  // --- Read roomId from URL ---
  const params = new URLSearchParams(location.search);
  const roomId = params.get('roomId');

  if (!roomId) {
    showError('Sala no encontrada', 'No se especificó una sala válida.');
    return;
  }

  // --- DOM Elements ---
  const roomTitle = document.getElementById('room-title');
  const userCount = document.getElementById('user-count');
  const resyncBtn = document.getElementById('resync-btn');
  const videoUrlInput = document.getElementById('video-url');
  const loadVideoBtn = document.getElementById('load-video-btn');
  const syncPill = document.getElementById('sync-pill');
  const playerPlaceholder = document.getElementById('player-placeholder');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const usersList = document.getElementById('users-list');
  const chatFab = document.getElementById('chat-fab');
  const bottomDrawer = document.getElementById('bottom-drawer');
  const chatMessagesDrawer = document.getElementById('chat-messages-drawer');
  const chatInputDrawer = document.getElementById('chat-input-drawer');
  const chatSendDrawer = document.getElementById('chat-send-drawer');
  const usersListDrawer = document.getElementById('users-list-drawer');
  const errorOverlay = document.getElementById('error-overlay');
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');

  // --- Error overlay ---
  function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorOverlay.classList.remove('hidden');
  }

  // --- Sync pill ---
  let syncTimeout = null;
  function showSyncing() {
    syncPill.textContent = '⟳ Sincronizando...';
    syncPill.className = 'sync-pill syncing';
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncPill.textContent = '✓ Sincronizados';
      syncPill.className = 'sync-pill synced';
    }, 1500);
  }

  // --- Chat ---
  function appendChatMessage(msg, isSystem) {
    const el = document.createElement('div');
    if (isSystem) {
      el.className = 'chat-msg chat-msg-system';
      el.textContent = msg;
    } else {
      el.className = 'chat-msg';
      el.innerHTML = '<span class="chat-msg-author">' + WJ.sanitize(msg.username) + '</span> ' +
        WJ.sanitize(msg.text) +
        '<span class="chat-msg-time">' + WJ.formatTimestamp(msg.timestamp) + '</span>';
    }
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Also append to drawer
    const elD = el.cloneNode(true);
    chatMessagesDrawer.appendChild(elD);
    chatMessagesDrawer.scrollTop = chatMessagesDrawer.scrollHeight;
  }

  // Load chat history from localStorage
  WJ.loadChatHistory(roomId).forEach(msg => appendChatMessage(msg, false));

  // --- Send chat message ---
  function sendChat(inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('chat-message', { roomId, username: WJ.username || 'Anónimo', text });
    inputEl.value = '';
  }

  chatSend.addEventListener('click', () => sendChat(chatInput));
  chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(chatInput); });
  chatSendDrawer.addEventListener('click', () => sendChat(chatInputDrawer));
  chatInputDrawer.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(chatInputDrawer); });

  // --- Users list ---
  function renderUsers(users) {
    const count = Array.isArray(users) ? users.length : 0;
    userCount.textContent = count + (count === 1 ? ' usuario' : ' usuarios');
    const html = Array.isArray(users) ? users.map(u =>
      '<li class="user-item"><span class="user-dot"></span>' + WJ.sanitize(u.username) + '</li>'
    ).join('') : '';
    usersList.innerHTML = html || '<li class="user-item" style="color:var(--text-secondary)">Sin usuarios</li>';
    usersListDrawer.innerHTML = usersList.innerHTML;
  }

  // --- Sidebar tabs ---
  document.querySelectorAll('.sidebar-tab:not(.drawer-tab)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab:not(.drawer-tab)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('chat-panel').classList.toggle('active', tab === 'chat');
      document.getElementById('users-panel').classList.toggle('active', tab === 'users');
    });
  });

  document.querySelectorAll('.drawer-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.drawer-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('chat-panel-drawer').classList.toggle('active', tab === 'chat-drawer');
      document.getElementById('users-panel-drawer').classList.toggle('active', tab === 'users-drawer');
    });
  });

  // --- Mobile FAB / bottom drawer ---
  chatFab.addEventListener('click', () => bottomDrawer.classList.toggle('open'));
  bottomDrawer.querySelector('.bottom-drawer-handle').addEventListener('click', () => {
    bottomDrawer.classList.remove('open');
  });

  // --- Load video ---
  function loadVideo() {
    const input = videoUrlInput.value.trim();
    const videoId = PlayerManager.extractVideoId(input);
    if (!videoId) {
      videoUrlInput.style.borderColor = 'var(--error)';
      setTimeout(() => { videoUrlInput.style.borderColor = ''; }, 1500);
      return;
    }
    socket.emit('player-load', { roomId, videoId });
  }

  loadVideoBtn.addEventListener('click', loadVideo);
  videoUrlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') loadVideo(); });

  // --- Resync ---
  resyncBtn.addEventListener('click', () => {
    socket.emit('request-sync', { roomId });
    showSyncing();
  });

  // --- Init YouTube player ---
  PlayerManager.init('yt-player');

  PlayerManager.onPlay = function (currentTime) {
    if (!PlayerManager._isSyncing) {
      socket.emit('player-play', { roomId, currentTime });
    }
  };

  PlayerManager.onPause = function (currentTime) {
    if (!PlayerManager._isSyncing) {
      socket.emit('player-pause', { roomId, currentTime });
    }
  };

  PlayerManager.onSeek = function (currentTime) {
    if (!PlayerManager._isSyncing) {
      socket.emit('player-seek', { roomId, currentTime });
    }
  };

  // --- Socket.IO ---
  const socket = io();

  socket.on('connect', () => {
    console.log('[WJ] Connected, joining room:', roomId);
    socket.emit('join-room', {
      roomId,
      username: WJ.username || 'Anónimo',
      token: WJ.token
    });
  });

  socket.on('sync-state', (data) => {
    console.log('[WJ] sync-state received:', data);
    showSyncing();
    if (data.videoId) {
      playerPlaceholder.style.display = 'none';
      PlayerManager.loadVideo(data.videoId);
      setTimeout(() => {
        if (data.isPlaying) {
          PlayerManager.play(data.currentTime);
        } else {
          PlayerManager.pause(data.currentTime);
        }
      }, 1000);
    }
  });

  socket.on('player-play', (data) => {
    showSyncing();
    PlayerManager.play(data.currentTime);
  });

  socket.on('player-pause', (data) => {
    showSyncing();
    PlayerManager.pause(data.currentTime);
  });

  socket.on('player-seek', (data) => {
    showSyncing();
    PlayerManager.seekTo(data.currentTime);
  });

  socket.on('player-load', (data) => {
    playerPlaceholder.style.display = 'none';
    PlayerManager.loadVideo(data.videoId);
  });

  socket.on('room-users', (users) => {
    renderUsers(users);
  });

  socket.on('room-list', (rooms) => {
    if (Array.isArray(rooms)) {
      const room = rooms.find(r => r.id === roomId);
      if (room) roomTitle.textContent = WJ.sanitize(room.name);
    }
  });

  socket.on('user-joined', (data) => {
    appendChatMessage('— ' + WJ.sanitize(data.username) + ' se unió —', true);
  });

  socket.on('user-left', (data) => {
    appendChatMessage('— ' + WJ.sanitize(data.username) + ' salió —', true);
  });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg, false);
    WJ.saveChatMessage(roomId, msg);
  });

  socket.on('error', (data) => {
    console.error('[WJ] Socket error:', data);
    switch (data.code) {
      case 'ROOM_NOT_FOUND':
        showError('Sala no encontrada', 'Esta sala no existe o fue eliminada.');
        break;
      case 'ROOM_FULL':
        showError('Sala llena', 'Esta sala ha alcanzado el máximo de usuarios.');
        break;
      case 'ROOM_CLOSED':
        showError('Sala cerrada', 'Esta sala está cerrada temporalmente.');
        break;
      case 'TOKEN_INVALID':
        localStorage.removeItem(WJ.STORAGE_KEYS.TOKEN);
        window.location.href = '/join-required.html';
        break;
      default:
        showError('Error', 'Ocurrió un error inesperado: ' + (data.code || 'desconocido'));
    }
  });

  socket.on('connect_error', (err) => {
    console.error('[WJ] Connection error:', err.message);
  });

  socket.on('disconnect', () => {
    console.log('[WJ] Disconnected from server');
  });

  // Leave room on page unload
  window.addEventListener('beforeunload', () => {
    socket.emit('leave-room', { roomId });
  });
});
