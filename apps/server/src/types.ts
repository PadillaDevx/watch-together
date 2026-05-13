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

/** Represents a single item in a room's playback queue */
export interface QueueItem {
  id: string;
  type: 'youtube' | 'movie' | 'iptv';
  title: string;
  videoId?: string;
  streamUrl?: string;
  thumbnail?: string;
  addedBy: string;
}

export interface PlayerState {
  videoId: string | null;
  streamUrl: string | null;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  /** Human-readable title of the currently playing media */
  title: string | null;
  /** Thumbnail URL for the currently playing media */
  thumbnail: string | null;
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
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series';
  iptvListId?: string;
  playerState: PlayerState;
  users: Map<string, RoomUser>;
  chatHistory: ChatMessage[];
  /** Ordered list of items waiting to be played */
  queue: QueueItem[];
}

export interface RoomListItem {
  id: string;
  name: string;
  maxUsers: number;
  isOpen: boolean;
  pinProtected: boolean;
  createdAt: number;
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series';
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

export interface LibrarySerie {
  id: string;
  name: string;
  lacartoons_serie_id: number;
  thumbnail?: string;
  active: boolean;
}

export interface LibraryEpisodio {
  capitulo_numero: number;
  titulo: string;
  /** Raw path to the episode page (NOT the embed URL) */
  url: string;
}

export interface LibraryTemporada {
  temporada: number;
  episodios: LibraryEpisodio[];
}

export interface LibrarySerieDetail extends LibrarySerie {
  temporadas: LibraryTemporada[];
}

export interface ServerToClientEvents {
  'room-list': (rooms: RoomListItem[]) => void;
  'room-users': (users: Array<{ socketId: string; username: string; joinedAt: Date }>) => void;
  'sync-state': (state: { videoId: string | null; streamUrl: string | null; currentTime: number; isPlaying: boolean; sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'; queue: QueueItem[]; title: string | null; thumbnail: string | null }) => void;
  'queue-update': (queue: QueueItem[]) => void;
  'source-switched': (data: { sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'; iptvListId?: string }) => void;
  'player-play': (data: { currentTime: number }) => void;
  'player-pause': (data: { currentTime: number }) => void;
  'player-seek': (data: { currentTime: number }) => void;
  'player-load': (data: { type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string } | { type: 'series'; embedUrl: string; title?: string; thumbnail?: string }) => void;
  'series-episode-change': (data: { serieId: string; serieName: string; temporada: number; episodioIndex: number; embedUrl: string; titulo: string }) => void;
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
  'player-load': (data: { roomId: string } & ({ type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string } | { type: 'series'; embedUrl: string; title?: string; thumbnail?: string })) => void;
  'series-episode-change': (data: { roomId: string; serieId: string; serieName: string; temporada: number; episodioIndex: number; embedUrl: string; titulo: string }) => void;
  'chat-message': (data: { roomId: string; text: string }) => void;
  'request-sync': (data: { roomId: string }) => void;
  'resync-all': (data: { roomId: string; currentTime: number; isPlaying: boolean }) => void;
  'queue-add': (data: { roomId: string; item: Omit<QueueItem, 'id' | 'addedBy'> }) => void;
  'queue-remove': (data: { roomId: string; itemId: string }) => void;
  'queue-next': (data: { roomId: string }) => void;
  'queue-reorder': (data: { roomId: string; fromIndex: number; toIndex: number }) => void;
  'switch-source': (data: { roomId: string; sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'; iptvListId?: string }) => void;
}

export interface SocketData {
  username: string;
  authenticated: boolean;
  avatar: string | null;
  isAdmin?: boolean;
  roomId?: string;
}
