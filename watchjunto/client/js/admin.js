'use strict';

document.addEventListener('DOMContentLoaded', () => {
  WJ.init();

  // --- Elements ---
  const loginPage = document.getElementById('login-page');
  const adminPanel = document.getElementById('admin-panel');
  const adminPasswordInput = document.getElementById('admin-password');
  const adminLoginBtn = document.getElementById('admin-login-btn');
  const loginError = document.getElementById('login-error');
  const adminLogout = document.getElementById('admin-logout');
  const createRoomForm = document.getElementById('create-room-form');
  const roomsTbody = document.getElementById('rooms-tbody');
  const deleteAllBtn = document.getElementById('delete-all-btn');
  const generateInviteBtn = document.getElementById('generate-invite-btn');
  const inviteResult = document.getElementById('invite-result');
  const inviteUrlInput = document.getElementById('invite-url');
  const copyInviteBtn = document.getElementById('copy-invite-btn');
  const connectionsList = document.getElementById('connections-list');
  const refreshConnectionsBtn = document.getElementById('refresh-connections-btn');
  const clearTokensBtn = document.getElementById('clear-tokens-btn');

  // --- Session check ---
  function showPanel() {
    loginPage.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    loadAll();
  }

  function showLogin() {
    adminPanel.classList.add('hidden');
    loginPage.classList.remove('hidden');
  }

  if (localStorage.getItem(WJ.STORAGE_KEYS.ADMIN_SESSION)) {
    showPanel();
  }

  // --- Login ---
  async function doLogin() {
    const password = adminPasswordInput.value;
    if (!password) return;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        localStorage.setItem(WJ.STORAGE_KEYS.ADMIN_SESSION, 'true');
        loginError.classList.add('hidden');
        showPanel();
      } else {
        loginError.textContent = 'Contraseña incorrecta.';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.textContent = 'Error de conexión con el servidor.';
      loginError.classList.remove('hidden');
      console.error('[WJ Admin] Login error:', err);
    }
  }

  adminLoginBtn.addEventListener('click', doLogin);
  adminPasswordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

  // --- Logout ---
  adminLogout.addEventListener('click', () => {
    localStorage.removeItem(WJ.STORAGE_KEYS.ADMIN_SESSION);
    showLogin();
  });

  // --- Load all data ---
  function loadAll() {
    loadRooms();
    loadConnections();
  }

  // --- Load rooms ---
  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rooms = await res.json();
      renderRooms(rooms);
    } catch (err) {
      console.error('[WJ Admin] Failed to load rooms:', err);
    }
  }

  function renderRooms(rooms) {
    if (!rooms || rooms.length === 0) {
      roomsTbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay salas</td></tr>';
      return;
    }
    roomsTbody.innerHTML = rooms.map(room => {
      const userCount = Array.isArray(room.users) ? room.users.length : 0;
      const statusText = room.isOpen ? 'Abierta' : 'Cerrada';
      return `
        <tr>
          <td>${WJ.sanitize(room.name)}</td>
          <td>${userCount} / ${room.maxUsers}</td>
          <td><span class="${room.isOpen ? 'badge badge-success' : 'badge badge-warning'}">${WJ.sanitize(statusText)}</span></td>
          <td class="actions">
            <button class="btn btn-secondary copy-room-btn" data-room-id="${WJ.sanitize(room.id)}" style="font-size:0.75rem;padding:0.25rem 0.5rem">Copiar link</button>
            <button class="btn btn-danger delete-room-btn" data-room-id="${WJ.sanitize(room.id)}" style="font-size:0.75rem;padding:0.25rem 0.5rem">Eliminar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- Room table event delegation ---
  document.getElementById('rooms-table').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-room-btn');
    const copyBtn = e.target.closest('.copy-room-btn');

    if (deleteBtn) {
      const roomId = deleteBtn.getAttribute('data-room-id');
      try {
        const res = await fetch('/api/admin/rooms/' + encodeURIComponent(roomId), { method: 'DELETE' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        loadRooms();
      } catch (err) {
        console.error('[WJ Admin] Failed to delete room:', err);
      }
    }

    if (copyBtn) {
      const roomId = copyBtn.getAttribute('data-room-id');
      WJ.copyToClipboard(location.origin + '/room.html?roomId=' + encodeURIComponent(roomId), copyBtn);
    }
  });

  // --- Delete all rooms ---
  deleteAllBtn.addEventListener('click', async () => {
    if (!window.confirm('¿Eliminar TODAS las salas? Esta acción no se puede deshacer.')) return;
    try {
      const res = await fetch('/api/admin/rooms', { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loadRooms();
    } catch (err) {
      console.error('[WJ Admin] Failed to delete all rooms:', err);
    }
  });

  // --- Create room ---
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
        console.error('[WJ Admin] Failed to create room:', data.error || res.status);
        return;
      }
      createRoomForm.reset();
      document.getElementById('room-max').value = '10';
      document.getElementById('room-open').checked = true;
      loadRooms();
    } catch (err) {
      console.error('[WJ Admin] Create room error:', err);
    }
  });

  // --- Generate invite ---
  generateInviteBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/invite', { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      inviteUrlInput.value = data.url;
      inviteResult.classList.remove('hidden');
    } catch (err) {
      console.error('[WJ Admin] Failed to generate invite:', err);
    }
  });

  copyInviteBtn.addEventListener('click', () => {
    WJ.copyToClipboard(inviteUrlInput.value, copyInviteBtn);
  });

  // --- Load connections ---
  async function loadConnections() {
    try {
      const res = await fetch('/api/admin/connections');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const connections = await res.json();
      renderConnections(connections);
    } catch (err) {
      console.error('[WJ Admin] Failed to load connections:', err);
    }
  }

  function renderConnections(connections) {
    if (!connections || connections.length === 0) {
      connectionsList.innerHTML = '<div class="empty-state">No hay conexiones activas</div>';
      return;
    }
    connectionsList.innerHTML = connections.map(conn => `
      <div class="connection-item">
        <span>${WJ.sanitize(conn.username)}</span>
        <span style="color:var(--text-secondary)">${WJ.sanitize(conn.roomName)}</span>
        <span style="color:var(--text-secondary);font-size:0.8125rem">${WJ.formatTimestamp(new Date(conn.joinedAt).getTime())}</span>
      </div>
    `).join('');
  }

  refreshConnectionsBtn.addEventListener('click', loadConnections);

  // --- Clear tokens ---
  clearTokensBtn.addEventListener('click', async () => {
    if (!window.confirm('¿Revocar TODOS los tokens de invitación? Los invitados con tokens no usados no podrán unirse.')) return;
    try {
      const res = await fetch('/api/admin/tokens', { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      console.log('[WJ Admin] All tokens revoked');
      alert('Todos los tokens han sido revocados.');
    } catch (err) {
      console.error('[WJ Admin] Failed to revoke tokens:', err);
    }
  });

  // --- Socket.IO for live room-list updates ---
  const socket = io();
  socket.on('room-list', () => loadRooms());
  socket.on('connect_error', (err) => console.error('[WJ Admin] Socket error:', err.message));
});
