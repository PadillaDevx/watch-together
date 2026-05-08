export interface UserRecord {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  recoveryCode: string;
  avatar: string | null;
  createdAt: number;
}

export interface SessionData {
  username: string;
  isAdmin?: boolean;
  createdAt: number;
}

export interface PlayerState {
  videoId: string | null;
  streamUrl: string | null;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
}

export interface RoomUser {
  username: string;
  joinedAt: Date;
}

export interface ChatMessage {
  username: string;
  text: string;
  timestamp: number;
  avatar: string | null;
}

export interface Room {
  id: string;
  name: string;
  maxUsers: number;
  isOpen: boolean;
  pin?: string;
  createdAt: number;
  sourceType: 'youtube' | 'iptv';
  iptvListId?: string;
  playerState: PlayerState;
  users: Map<string, RoomUser>;
  chatHistory: ChatMessage[];
}

export interface RoomListItem {
  id: string;
  name: string;
  maxUsers: number;
  isOpen: boolean;
  pinProtected: boolean;
  createdAt: number;
  sourceType: 'youtube' | 'iptv';
  iptvListId?: string;
  playerState: PlayerState;
  users: Array<{ socketId: string; username: string; joinedAt: Date }>;
}

export interface TokenRecord {
  createdAt: number;
  usedBy: string | null;
}

export interface IPTVList {
  id: string;
  name: string;
  url: string;
  lastFetched: Date;
  entryCount: number;
  enabled: boolean;
}

export interface IPTVEntry {
  name: string;
  url: string;
  group: string;
  logo?: string;
}

export interface ServerToClientEvents {
  'room-list': (rooms: RoomListItem[]) => void;
  'room-users': (users: Array<{ socketId: string; username: string; joinedAt: Date }>) => void;
  'sync-state': (state: { videoId: string | null; streamUrl: string | null; currentTime: number; isPlaying: boolean; sourceType: 'youtube' | 'iptv' }) => void;
  'player-play': (data: { currentTime: number }) => void;
  'player-pause': (data: { currentTime: number }) => void;
  'player-seek': (data: { currentTime: number }) => void;
  'player-load': (data: { type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string }) => void;
  'chat-message': (msg: ChatMessage) => void;
  'user-joined': (data: { username: string }) => void;
  'user-left': (data: { username: string }) => void;
  'error': (data: { code: string }) => void;
}

export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; pin?: string }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'player-play': (data: { roomId: string; currentTime: number }) => void;
  'player-pause': (data: { roomId: string; currentTime: number }) => void;
  'player-seek': (data: { roomId: string; currentTime: number }) => void;
  'player-load': (data: { roomId: string } & ({ type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string })) => void;
  'chat-message': (data: { roomId: string; text: string }) => void;
  'request-sync': (data: { roomId: string }) => void;
  'resync-all': (data: { roomId: string; currentTime: number; isPlaying: boolean }) => void;
}

export interface SocketData {
  username: string;
  authenticated: boolean;
  avatar: string | null;
  roomId?: string;
}
