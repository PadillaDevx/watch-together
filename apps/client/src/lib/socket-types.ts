/**
 * Socket.IO event types — client-side mirror.
 *
 * Keep in sync with `apps/server/src/types.ts`. This file intentionally
 * duplicates the server-side `ServerToClientEvents` / `ClientToServerEvents`
 * interfaces (and their payload helpers) so the client bundle does not depend
 * on the server's source tree. Whenever a socket event is added, removed, or
 * has its payload changed on the server, update this file accordingly.
 *
 * Types are namespaced with the `Socket` prefix to avoid collisions with the
 * client's own domain types declared in `apps/client/src/types.ts` (which
 * differ slightly — e.g. `QueueItem.type` excludes `'iptv'`).
 */

export interface SocketQueueItem {
  id: string;
  type: 'youtube' | 'movie' | 'iptv';
  title: string;
  videoId?: string;
  streamUrl?: string;
  thumbnail?: string;
  addedBy: string;
}

export interface SocketPlayerState {
  videoId: string | null;
  streamUrl: string | null;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  playbackRate?: number;
  revision?: number;
  title: string | null;
  thumbnail: string | null;
}

export interface SocketChatMessage {
  username: string;
  text: string;
  timestamp: number;
  avatar: string | null;
}

export interface SocketRoomListItem {
  id: string;
  name: string;
  maxUsers: number;
  isOpen: boolean;
  pinProtected: boolean;
  createdAt: number;
  createdByUsername?: string;
  sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series';
  iptvListId?: string;
  playerState: SocketPlayerState;
  // `joinedAt` is serialized to ISO string by Socket.IO's JSON encoder, even
  // though the server's in-memory `Room.users` map stores `Date` objects.
  users: Array<{ socketId: string; username: string; joinedAt: string }>;
  hostUsername?: string;
}

export type SocketSourceType = 'youtube' | 'iptv' | 'movie' | 'url' | 'series';

export type SocketPlayerAction = 'play' | 'pause' | 'seek' | 'load' | 'episode-change';

export interface YouTubeTimelineState {
  videoId: string | null;
  playing: boolean;
  currentTime: number;
  updatedAt: number;
  serverNow: number;
  playbackRate: number;
  revision: number;
  reason: 'join' | 'intent' | 'resync' | 'heartbeat';
}

export interface ServerToClientEvents {
  'room-list': (rooms: SocketRoomListItem[]) => void;
  'room-users': (
    users: Array<{ socketId: string; username: string; joinedAt: string }>,
  ) => void;
  'sync-state': (state: {
    videoId: string | null;
    streamUrl: string | null;
    currentTime: number;
    isPlaying: boolean;
    sourceType: SocketSourceType;
    queue: SocketQueueItem[];
    title: string | null;
    thumbnail: string | null;
    playbackRate?: number;
    revision?: number;
  }) => void;
  'queue-update': (queue: SocketQueueItem[]) => void;
  'source-switched': (data: { sourceType: SocketSourceType; iptvListId?: string }) => void;
  'player-play': (data: { currentTime: number; sentAt?: number }) => void;
  'player-pause': (data: { currentTime: number; sentAt?: number }) => void;
  'player-seek': (data: { currentTime: number }) => void;
  'player-load': (
    data:
      | { type: 'youtube'; videoId: string }
      | { type: 'iptv'; streamUrl: string }
      | { type: 'series'; embedUrl: string; title?: string; thumbnail?: string },
  ) => void;
  /**
   * Broadcast of a `player-action` to every other room participant.
   * `adjustedTime` is the latency-compensated playback position.
   */
  'player-sync': (data: {
    action: SocketPlayerAction;
    currentTime: number;
    adjustedTime?: number;
    videoId?: string;
    embedUrl?: string;
    streamUrl?: string;
    sourceType?: string;
    serieId?: string;
    serieName?: string;
    temporada?: number;
    episodioIndex?: number;
    titulo?: string;
    serverTime: number;
    playAt?: number;
    targetTime?: number;
  }) => void;
  /** Generic error event. `message` is set for user-facing reasons. */
  error: (data: { code?: string; message?: string }) => void;
  'player-heartbeat': (data: { currentTime: number; isPlaying: boolean }) => void;
  'series-episode-change': (data: {
    serieId: string;
    serieName: string;
    temporada: number;
    episodioIndex: number;
    embedUrl: string;
    titulo: string;
  }) => void;
  'start-playback': (data: { playAt: number; serverNow: number }) => void;
  'resync-state': (data: {
    currentTime: number;
    isPlaying: boolean;
    serverNow: number;
    syncMode: string;
  }) => void;
  'chat-message': (msg: SocketChatMessage) => void;
  'typing-update': (data: { roomId: string; typingUsers: string[] }) => void;
  'user-joined': (data: { username: string }) => void;
  'user-left': (data: { username: string }) => void;
  'host-changed': (data: {
    newHostUsername: string;
    newHostSocketId: string;
    previousHostUsername?: string;
  }) => void;
  'youtube-timeline': (state: YouTubeTimelineState) => void;
}

export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; pin?: string }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'player-play': (data: { roomId: string; currentTime: number; sentAt?: number }) => void;
  'player-pause': (data: { roomId: string; currentTime: number; sentAt?: number }) => void;
  'player-seek': (data: { roomId: string; currentTime: number }) => void;
  'player-load': (
    data: { roomId: string } & (
      | { type: 'youtube'; videoId: string }
      | { type: 'iptv'; streamUrl: string }
      | { type: 'series'; embedUrl: string; title?: string; thumbnail?: string }
    ),
  ) => void;
  'player-action': (data: {
    roomId: string;
    action: SocketPlayerAction;
    currentTime: number;
    videoId?: string;
    embedUrl?: string;
    streamUrl?: string;
    sourceType?: string;
    serieId?: string;
    serieName?: string;
    temporada?: number;
    episodioIndex?: number;
    titulo?: string;
    timestamp: number;
  }) => void;
  'series-episode-change': (data: {
    roomId: string;
    serieId: string;
    serieName: string;
    temporada: number;
    episodioIndex: number;
    embedUrl: string;
    titulo: string;
  }) => void;
  'chat-message': (data: { roomId: string; text: string }) => void;
  'typing-start': (data: { roomId: string; username: string }) => void;
  'typing-stop': (data: { roomId: string; username: string }) => void;
  'request-sync': (data: { roomId: string }) => void;
  'resync-all': (data: { roomId: string; currentTime: number; isPlaying: boolean }) => void;
  'queue-add': (data: { roomId: string; item: Omit<SocketQueueItem, 'id' | 'addedBy'> }) => void;
  'queue-remove': (data: { roomId: string; itemId: string }) => void;
  'queue-next': (data: { roomId: string }) => void;
  'queue-reorder': (data: { roomId: string; fromIndex: number; toIndex: number }) => void;
  'switch-source': (data: {
    roomId: string;
    sourceType: SocketSourceType;
    iptvListId?: string;
  }) => void;
  'client-ready': (data: { roomId: string; userId: string }) => void;
  'request-resync': (data: { roomId: string }) => void;
  'youtube-intent': (data: {
    roomId: string;
    type: 'play' | 'pause' | 'seek';
    currentTime: number;
    clientSentAt: number;
    playbackRate?: number;
  }) => void;
  'youtube-request-timeline': (data: { roomId: string }) => void;
}
