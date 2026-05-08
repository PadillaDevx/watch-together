'use strict';

window.WJ = {};

// Storage keys
WJ.STORAGE_KEYS = {
  USERNAME: 'wj_username',
  TOKEN: 'wj_token',
  THEME: 'wj_theme',
  ADMIN_SESSION: 'wj_admin_session'
};

// Getters
Object.defineProperty(WJ, 'username', { get: () => localStorage.getItem(WJ.STORAGE_KEYS.USERNAME) });
Object.defineProperty(WJ, 'token', { get: () => localStorage.getItem(WJ.STORAGE_KEYS.TOKEN) });
Object.defineProperty(WJ, 'theme', { get: () => localStorage.getItem(WJ.STORAGE_KEYS.THEME) || 'dark' });
Object.defineProperty(WJ, 'isAdmin', { get: () => !!localStorage.getItem(WJ.STORAGE_KEYS.ADMIN_SESSION) });

// Theme
WJ.applyTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(WJ.STORAGE_KEYS.THEME, theme);
};

WJ.toggleTheme = function() {
  const next = WJ.theme === 'dark' ? 'light' : 'dark';
  WJ.applyTheme(next);
};

// Security
WJ.sanitize = function(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').slice(0, 500);
};

// Formatting
WJ.formatTimestamp = function(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Clipboard with visual feedback
WJ.copyToClipboard = function(text, buttonEl) {
  return navigator.clipboard.writeText(text).then(() => {
    if (buttonEl) {
      const original = buttonEl.textContent;
      buttonEl.textContent = '¡Copiado!';
      setTimeout(() => { buttonEl.textContent = original; }, 1500);
    }
  }).catch(err => console.error('[WJ] Clipboard error:', err));
};

// Chat localStorage helpers
WJ.chatKey = function(roomId) { return 'wj_chat_' + roomId; };

WJ.loadChatHistory = function(roomId) {
  try {
    return JSON.parse(localStorage.getItem(WJ.chatKey(roomId)) || '[]');
  } catch (e) {
    return [];
  }
};

WJ.saveChatMessage = function(roomId, msg) {
  const history = WJ.loadChatHistory(roomId);
  history.push(msg);
  if (history.length > 100) history.splice(0, history.length - 100);
  localStorage.setItem(WJ.chatKey(roomId), JSON.stringify(history));
};

// Handle token in URL query param
WJ.handleTokenParam = function() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem(WJ.STORAGE_KEYS.TOKEN, token);
    params.delete('token');
    const newUrl = location.pathname + (params.toString() ? '?' + params.toString() : '');
    history.replaceState(null, '', newUrl);
  }
};

// Initialize - call on DOMContentLoaded
WJ.init = function() {
  WJ.applyTheme(WJ.theme);
  WJ.handleTokenParam();
};
