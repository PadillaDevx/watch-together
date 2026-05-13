export interface User {
  username: string;
  avatar: string | null;
  isAdmin: boolean;
  recoveryCode?: string | null;
}

export interface VideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  embeddable?: boolean;
}

/** Represents a single item in a room's playback queue */
export interface QueueItem {
  id: string;
  type: 'youtube' | 'movie';
  title: string;
  videoId?: string;
  streamUrl?: string;
  thumbnail?: string;
  addedBy: string;
}

export interface PlayerState {
  videoId: string | null;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  /** Human-readable title of the currently playing media */
  title: string | null;
  /** Thumbnail URL for the currently playing media */
  thumbnail: string | null;
}

export interface RoomUser {
  socketId: string;
  username: string;
  joinedAt: string;
}

export interface Room {
  id: string;
  name: string;
  maxUsers: number;
  isOpen: boolean;
  pinProtected: boolean;
  createdAt: number;
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url';
  iptvListId?: string;
  playerState: PlayerState;
  users: RoomUser[];
  /** Ordered list of items waiting to be played */
  queue: QueueItem[];
}

export interface ChatMessage {
  username: string;
  text: string;
  timestamp: number;
  avatar: string | null;
}

export interface AdminUser {
  username: string;
  avatar: string | null;
  recoveryCode: string;
  createdAt: number;
}

export interface Connection {
  roomId: string;
  roomName: string;
  socketId: string;
  username: string;
  joinedAt: string;
}

export interface Token {
  token: string;
  createdAt: number;
  usedBy: string | null;
}

export interface IPTVList {
  id: string;
  name: string;
  url: string;
  entryCount: number;
  enabled: boolean;
  lastFetched: string;
}

export interface IPTVEntry {
  name: string;
  url: string;
  group: string;
  logo?: string;
}

/** Search result returned by the Jellyfin media server */
export interface JellyfinSearchResult {
  id: string;
  name: string;
  type: string;
  runtimeTicks?: number;
  imageUrl?: string;
  streamUrl: string;
}
