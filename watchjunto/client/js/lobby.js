'use strict';

document.addEventListener('DOMContentLoaded', () => {
  WJ.init();

  // --- Elements ---
  const usernameDisplay = document.getElementById('username-display');
  const adminBadge = document.getElementById('admin-badge');
  const createRoomBtn = document.getElementById('create-room-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const themeDark = document.getElementById('theme-icon-dark');
  const themeLight = document.getElementById('theme-icon-light');
  const copyInviteBtn = document.getElementById('copy-invite-btn');
  const roomsContainer = document.getElementById('rooms-container');
  const usernameModal = document.getElementById('username-modal');
  const usernameInput = document.getElementById('username-input');
  const usernameSubmit = document.getElementById('username-submit');
  const usernameError = document.getElementById('username-error');
  const createRoomModal = document.getElementById('create-room-modal');
  const createRoomForm = document.getElementById('create-room-form');
  const cancelRoomBtn = document.getElementById('cancel-room-btn');

  // --- Initial render ---
  function renderUserInfo() {
    usernameDisplay.textContent = WJ.username || 'Invitado';
    if (WJ.isAdmin) {
      adminBadge.classList.remove('hidden');
      createRoomBtn.classList.remove('hidden');
    } else {
      adminBadge.classList.add('hidden');
      createRoomBtn.classList.add('hidden');
    }
  }

  function updateThemeIcon() {
    if (WJ.theme === 'dark') {
      themeDark.classList.add('hidden');
      themeLight.classList.remove('hidden');
    } else {
      themeDark.classList.remove('hidden');
      themeLight.classList.add('hidden');
    }
  }

  renderUserInfo();
  updateThemeIcon();

  // --- Username modal ---
  if (!WJ.username) {
    usernameModal.showModal();
    usernameInput.focus();
  }

  function submitUsername() {
    const val = usernameInput.value.trim();
    if (!val) {
      usernameError.textContent = 'El nombre no puede estar vacío.';
      usernameError.classList.remove('hidden');
      return;
    }
    if (val.length > 20) {
      usernameError.textContent = 'Máximo 20 caracteres.';
      usernameError.classList.remove('hidden');
      return;
    }
    if (/[<>"'&]/.test(val)) {
      usernameError.textContent = 'El nombre contiene caracteres no permitidos.';
      usernameError.classList.remove('hidden');
      return;
    }
    localStorage.setItem(WJ.STORAGE_KEYS.USERNAME, val);
    usernameModal.close();
    renderUserInfo();
  }

  usernameSubmit.addEventListener('click', submitUsername);
  usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitUsername(); });

  // --- Theme toggle ---
  themeToggle.addEventListener('click', () => {
    WJ.toggleTheme();
    updateThemeIcon();
  });

  // --- Copy invite link ---
  copyInviteBtn.addEventListener('click', () => {
    WJ.copyToClipboard(window.location.origin, copyInviteBtn);
  });

  // --- Create room modal ---
  createRoomBtn.addEventListener('click', () => createRoomModal.showModal());
  cancelRoomBtn.addEventListener('click', () => createRoomModal.close());

  createRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('room-name').value.trim();
    const maxUsers = parseInt(document.getElementById('room-max').value, 10) || 10;
    const isOpen = document.getElementById('room-open').checked;
    if (!name) return;
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, maxUsers, isOpen })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[WJ] Failed to create room:', data.error || res.status);
        return;
      }
      createRoomModal.close();
      createRoomForm.reset();
      document.getElementById('room-max').value = '10';
      document.getElementById('room-open').checked = true;
    } catch (err) {
      console.error('[WJ] Create room error:', err);
    }
  });

  // --- Render rooms ---
  function renderRooms(rooms) {
    if (!rooms || rooms.length === 0) {
      roomsContainer.innerHTML = '<div class="rooms-empty">No hay salas activas</div>';
      return;
    }
    roomsContainer.innerHTML = rooms.map(room => {
      const userCount = Array.isArray(room.users) ? room.users.length : 0;
      const isFull = userCount >= room.maxUsers;
      const statusClass = room.isOpen && !isFull ? 'room-status-open' : 'room-status-closed';
      const statusText = !room.isOpen ? 'Cerrada' : isFull ? 'Llena' : 'Abierta';
      const canEnter = room.isOpen && !isFull;
      return `
        <div class="room-card card">
          <div class="room-card-header">
            <strong>${WJ.sanitize(room.name)}</strong>
            <span class="badge ${room.isOpen && !isFull ? 'badge-success' : 'badge-warning'}">${WJ.sanitize(statusText)}</span>
          </div>
          <div class="room-card-meta">
            <span>&#128101; ${userCount} / ${room.maxUsers}</span>
            <span class="${statusClass}">${WJ.sanitize(statusText)}</span>
          </div>
          <div class="room-card-footer">
            <button class="btn btn-primary enter-room-btn" data-room-id="${WJ.sanitize(room.id)}" ${canEnter ? '' : 'disabled'}>
              Entrar
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach enter room button listeners
    roomsContainer.querySelectorAll('.enter-room-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const roomId = btn.getAttribute('data-room-id');
        window.location.href = 'room.html?roomId=' + encodeURIComponent(roomId);
      });
    });
  }

  // --- Socket.IO ---
  const socket = io();

  socket.on('connect', () => {
    console.log('[WJ] Connected to server');
    // Fetch initial room list
    fetch('/api/rooms')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(rooms => renderRooms(rooms))
      .catch(err => console.error('[WJ] Failed to fetch rooms:', err));
  });

  socket.on('room-list', (rooms) => {
    renderRooms(rooms);
  });

  socket.on('connect_error', (err) => {
    console.error('[WJ] Socket connection error:', err.message);
  });

  socket.on('error', (data) => {
    console.error('[WJ] Socket error:', data);
  });
});
