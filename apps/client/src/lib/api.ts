import axios from 'axios';
import type { Room, AdminUser, Connection, Token, VideoSearchResult, IPTVList, IPTVEntry, JellyfinSearchResult, LibrarySerie, LibrarySerieDetail } from '../types';

const api = axios.create({ withCredentials: true });

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ ok: boolean; username: string; avatar: string | null; isAdmin: boolean }>('/api/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post<{ ok: boolean; username: string; recoveryCode: string }>('/api/auth/register', { username, password }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get<{ username: string; avatar: string | null; isAdmin: boolean; recoveryCode: string | null }>('/api/auth/me'),
  updateAvatar: (avatar: string | null) => api.put('/api/auth/avatar', { avatar }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ ok: boolean; newRecoveryCode: string }>('/api/auth/password', { currentPassword, newPassword }),
  recover: (username: string, recoveryCode: string, newPassword: string) =>
    api.post<{ ok: boolean; newRecoveryCode: string }>('/api/auth/recover', { username, recoveryCode, newPassword }),
};

export const roomsApi = {
  list: () => api.get<{ rooms: Room[] }>('/api/rooms'),
  createRoom: (name: string, maxUsers: number, isOpen: boolean, sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series' = 'youtube', iptvListId?: string) =>
    api.post('/api/admin/rooms', { name, maxUsers, isOpen, sourceType, ...(iptvListId ? { iptvListId } : {}) }),
  deleteRoom: (id: string) => api.delete(`/api/admin/rooms/${id}`),
};

export const searchApi = {
  search: (q: string) => api.get<{ results: VideoSearchResult[] }>('/api/search', { params: { q } }),
};

export const adminApi = {
  createRoom: (name: string, maxUsers: number, isOpen: boolean, sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series' = 'youtube', iptvListId?: string) =>
    api.post('/api/admin/rooms', { name, maxUsers, isOpen, sourceType, ...(iptvListId ? { iptvListId } : {}) }),
  deleteRoom: (id: string) => api.delete(`/api/admin/rooms/${id}`),
  deleteAllRooms: () => api.delete('/api/admin/rooms'),
  listUsers: () => api.get<{ users: AdminUser[] }>('/api/admin/users'),
  listConnections: () => api.get<Connection[]>('/api/admin/connections'),
  generateInvite: () => api.post<{ token: string; url: string }>('/api/admin/invite'),
  listTokens: () => api.get<{ tokens: Token[] }>('/api/admin/tokens'),
  revokeAllTokens: () => api.delete('/api/admin/tokens'),
};

export const iptvApi = {
  listAll: () => api.get<IPTVList[]>('/api/admin/iptv'),
  add: (name: string, url: string) => api.post<IPTVList>('/api/admin/iptv', { name, url }),
  upload: (name: string, content: string) =>
    api.post<IPTVList>('/api/admin/iptv/upload', { name, content }),
  update: (id: string, data: Partial<{ name: string; url: string; enabled: boolean }>) =>
    api.put<IPTVList>(`/api/admin/iptv/${id}`, data),
  remove: (id: string) => api.delete(`/api/admin/iptv/${id}`),
  refresh: (id: string) => api.post<IPTVList>(`/api/admin/iptv/${id}/refresh`),
  getEntries: (id: string) => api.get<IPTVEntry[]>(`/api/iptv/${id}/entries`),
};

export const jellyfinApi = {
  saveConfig: (baseUrl: string, apiKey: string) =>
    api.post<{ ok: boolean; serverName?: string; error?: string }>('/api/admin/jellyfin/config', { baseUrl, apiKey }),
  getStatus: () =>
    api.get<{ configured: boolean; ok?: boolean; serverName?: string; baseUrl?: string }>('/api/admin/jellyfin/status'),
  search: (q: string) =>
    api.get<Array<JellyfinSearchResult & { imageUrl: string; streamUrl: string }>>('/api/jellyfin/search', { params: { q } }),
  getStreamUrl: (itemId: string) =>
    api.get<{ streamUrl: string }>(`/api/jellyfin/stream-url/${itemId}`),
};

export const libraryApi = {
  listSeries: () =>
    api.get<LibrarySerie[]>('/api/library/series'),
  getSerieDetail: (serieId: string) =>
    api.get<LibrarySerieDetail>(`/api/library/series/${serieId}/episodes`),
  resolveEmbed: (path: string) =>
    api.get<{ embedUrl: string }>('/api/library/episode', { params: { path } }),
};
