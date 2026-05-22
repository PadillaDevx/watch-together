import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Users, RotateCcw, Send, Link, Check,
  Play, Loader2, MessageSquare, Search, Tv, AlertCircle,
  Film, Youtube, SkipForward, Trophy, BookOpen, X, Maximize, Minimize, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useYouTube } from '../hooks/useYouTube';
import { useYouTubeTimelineSync } from '../hooks/useYouTubeTimelineSync';
import { useHlsPlayer } from '../hooks/useHlsPlayer';
import { Avatar } from '../components/ui/Avatar';
import { VideoSearchModal } from '../components/VideoSearchModal';
import { IPTVBrowserModal } from '../components/IPTVBrowserModal';
import { JellyfinBrowserModal } from '../components/JellyfinBrowserModal';
import { socket } from '../lib/socket';
import { copyToClipboard } from '../lib/utils';
import { useStore } from '../store';
import { Button } from '../components/ui/Button';
import QueuePanel from '../components/QueuePanel';
import SeriesSelector from '../components/SeriesSelector';
import NextEpisodeButton from '../components/NextEpisodeButton';
import { Modal } from '../components/ui/Modal';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useSeriesNavigation } from '../hooks/useSeriesNavigation';
import { libraryApi, searchApi } from '../lib/api';
import { SyncProvider } from '../components/SyncProvider';
import type { YouTubeTimelineState } from '../lib/socket-types';
import type { ChatMessage, RoomUser, IPTVEntry, QueueItem, LibrarySerie, LibrarySerieDetail } from '../types';

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('?')[0] ?? null;
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch { /* not a url */ }
  return null;
}

/** Extracts a YouTube playlist id from a URL, if present. */
function extractPlaylistId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (!/youtube\.com|youtu\.be/.test(url.hostname)) return null;
    const list = url.searchParams.get('list');
    return list && /^[a-zA-Z0-9_-]+$/.test(list) ? list : null;
  } catch { return null; }
}

/** Returns true if the URL points to a direct video/stream file (HLS, MP4, etc.) */
function isDirectVideoUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(m3u8|mp4|webm|ogg|ogv|mkv|ts|avi|flv)(\?|$)/.test(path);
  } catch { return false; }
}

type PanelTab = 'users' | 'chat';

export function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const pin = (location.state as { pin?: string } | null)?.pin;
  const { user, rooms } = useStore();
  const roomHostUsername = useStore((s) => s.roomHostUsername);
  const setRoomHostUsername = useStore((s) => s.setRoomHostUsername);

  const room = rooms.find((r) => r.id === roomId);

  const [users, setUsers] = useState<RoomUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');
  const [isCopied, setIsCopied] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string | null>(null);
  const [iptvBrowserOpen, setIptvBrowserOpen] = useState(false);
  const [jellyfinOpen, setJellyfinOpen] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nowTitle, setNowTitle] = useState<string | null>(null);
  const [nowThumbnail, setNowThumbnail] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<'youtube' | 'iptv' | 'movie' | 'url' | 'series'>(room?.sourceType ?? 'youtube');
  // Series Classic states
  const [seriesList, setSeriesList] = useState<LibrarySerie[]>([]);
  const [serieDetail, setSerieDetail] = useState<LibrarySerieDetail | null>(null);
  const [selectedSerieId, setSelectedSerieId] = useState<string | null>(null);
  const [selectedTemporada, setSelectedTemporada] = useState<number | null>(null);
  const [selectedEpisodioIndex, setSelectedEpisodioIndex] = useState<number | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingEmbed, setLoadingEmbed] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [seriesSelectorOpen, setSeriesSelectorOpen] = useState(false);
  // For 'url' rooms: tracks what player is currently active
  const [urlActivePlayer, setUrlActivePlayer] = useState<'youtube' | 'stream' | 'iframe' | null>(null);
  const urlActivePlayerRef = useRef<'youtube' | 'stream' | 'iframe' | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Feature 1: typing indicator
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature 3: fullscreen overlay
  // isNativeFullscreen: driven by the browser Fullscreen API (desktop / Android)
  // isCSSFullscreen: simulated fullscreen via position:fixed — works on iOS Chrome
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCSSFullscreen, setIsCSSFullscreen] = useState(false);
  const [hideSocialPanel, setHideSocialPanel] = useState(false);
  const isFullscreen = isNativeFullscreen || isCSSFullscreen;
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roomContainerRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  // Track sourceType in a ref to avoid stale closures in socket handlers
  const sourceTypeRef = useRef<'youtube' | 'iptv' | 'movie' | 'url' | 'series'>(room?.sourceType ?? 'youtube');
  useEffect(() => {
    sourceTypeRef.current = room?.sourceType ?? 'youtube';
  }, [room?.sourceType]);

  const isLiveRef = useRef<boolean>(false);
  const youtubeTimelineHandlersRef = useRef({
    play: (_time: number) => { },
    pause: (_time: number) => { },
    seek: (_time: number) => { },
  });

  // Series Classic hooks
  const watchProgress = useWatchProgress(roomId ?? '', user?.username ?? '');
  const { hasNext, getNext } = useSeriesNavigation({ serieDetail, selectedTemporada, selectedEpisodioIndex });

  // Ref to hold latest handleNext without circular deps (handleEnded -> handleNext -> loadStream)
  const handleNextRef = useRef<() => void>(() => { });

  const handleEnded = useCallback(() => {
    if (activeSource === 'series' && selectedSerieId && selectedTemporada !== null && selectedEpisodioIndex !== null) {
      const temporadaData = serieDetail?.temporadas.find(t => t.temporada === selectedTemporada);
      const episodio = temporadaData?.episodios[selectedEpisodioIndex];
      if (episodio) watchProgress.markWatched(selectedSerieId, selectedTemporada, episodio.capitulo_numero);
      handleNextRef.current();
      return;
    }
    if (!isLiveRef.current) {
      socket.emit('queue-next', { roomId: roomId! });
    }
  }, [roomId, activeSource, selectedSerieId, selectedTemporada, selectedEpisodioIndex, serieDetail, watchProgress]);

  // YouTube player
  const { isReady: isYouTubeReady, loadVideo, remotePlay, remotePause, remoteSeek, setPlaybackRate, getCurrentTime } = useYouTube({
    containerId: 'yt-player',
    onPlay: (t) => {
      const st = sourceTypeRef.current;
      const ap = urlActivePlayerRef.current;
      if (st === 'youtube' || (st === 'url' && ap === 'youtube')) {
        youtubeTimelineHandlersRef.current.play(t);
        return;
      }
      socket.emit('player-play', { roomId: roomId!, currentTime: t, sentAt: Date.now() });
    },
    onPause: (t) => {
      const st = sourceTypeRef.current;
      const ap = urlActivePlayerRef.current;
      if (st === 'youtube' || (st === 'url' && ap === 'youtube')) {
        youtubeTimelineHandlersRef.current.pause(t);
        return;
      }
      socket.emit('player-pause', { roomId: roomId!, currentTime: t, sentAt: Date.now() });
    },
    onEnded: handleEnded,
    onEmbedError: (vid) => setEmbedError(vid),
  });

  const isYouTubeTimelineEnabled = activeSource === 'youtube' || (activeSource === 'url' && urlActivePlayer === 'youtube');
  const {
    applyTimelineSnapshot,
    handleLocalPlay,
    handleLocalPause,
    handleLocalSeek,
    requestTimeline,
  } = useYouTubeTimelineSync({
    roomId: roomId ?? '',
    enabled: !!roomId && isYouTubeTimelineEnabled,
    isReady: isYouTubeReady,
    getCurrentTime,
    remotePlay,
    remotePause,
    remoteSeek,
    setPlaybackRate,
  });

  useEffect(() => {
    youtubeTimelineHandlersRef.current = {
      play: handleLocalPlay,
      pause: handleLocalPause,
      seek: handleLocalSeek,
    };
  }, [handleLocalPause, handleLocalPlay, handleLocalSeek]);

  useEffect(() => {
    if (!roomId || !isYouTubeTimelineEnabled) return;
    const handleTimeline = (state: YouTubeTimelineState) => {
      applyTimelineSnapshot(state);
    };
    socket.on('youtube-timeline', handleTimeline);
    return () => { socket.off('youtube-timeline', handleTimeline); };
  }, [applyTimelineSnapshot, isYouTubeTimelineEnabled, roomId]);

  useEffect(() => {
    if (!roomId || !isYouTubeTimelineEnabled || !isYouTubeReady || !currentVideoId) return;
    requestTimeline();
  }, [currentVideoId, isYouTubeReady, isYouTubeTimelineEnabled, requestTimeline, roomId]);

  // HLS/IPTV player
  const {
    loadStream,
    remotePlay: hlsPlay,
    remotePause: hlsPause,
    remoteSeek: hlsSeek,
    getCurrentTime: hlsGetTime,
    isLive,
    error: hlsError,
    retryStream,
  } = useHlsPlayer({
    videoRef,
    onPlay: (t) => socket.emit('player-play', { roomId: roomId!, currentTime: t, sentAt: Date.now() }),
    onPause: (t) => socket.emit('player-pause', { roomId: roomId!, currentTime: t, sentAt: Date.now() }),
    onEnded: handleEnded,
  });
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);

  // handleNext for series — defined after loadStream to avoid circular dependency
  const handleNext = useCallback(async () => {
    if (!hasNext) {
      if (selectedSerieId) {
        toast('¡Terminaste la serie!', { icon: <Trophy className="w-4 h-4" /> });
      }
      return;
    }
    const next = getNext();
    if (!next) return;
    // Mark current episode as watched
    if (selectedSerieId && selectedTemporada !== null && selectedEpisodioIndex !== null) {
      const temporadaData = serieDetail?.temporadas.find(t => t.temporada === selectedTemporada);
      const currentEpisodio = temporadaData?.episodios[selectedEpisodioIndex];
      if (currentEpisodio) watchProgress.markWatched(selectedSerieId, selectedTemporada, currentEpisodio.capitulo_numero);
    }
    setSelectedTemporada(next.temporada);
    setSelectedEpisodioIndex(next.episodioIndex);
    try {
      const { data } = await libraryApi.resolveEmbed(next.episodio.url);
      const embedUrl = data.embedUrl;
      setNowTitle(next.episodio.titulo);
      socket.emit('series-episode-change', {
        roomId: roomId!,
        serieId: selectedSerieId!,
        serieName: serieDetail!.name,
        temporada: next.temporada,
        episodioIndex: next.episodioIndex,
        embedUrl,
        titulo: next.episodio.titulo,
      });
      if (isDirectVideoUrl(embedUrl)) {
        loadStream(embedUrl);
      } else {
        setCurrentStreamUrl(embedUrl);
        setUrlActivePlayer('iframe');
        urlActivePlayerRef.current = 'iframe';
      }
    } catch {
      toast.error('Error al cargar el siguiente episodio');
    }
  }, [hasNext, getNext, selectedSerieId, selectedTemporada, selectedEpisodioIndex, serieDetail, watchProgress, roomId, loadStream]);

  // Keep handleNextRef in sync so handleEnded can call the latest version
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const showRoomNotice = useCallback((text: string, icon?: React.ReactElement) => {
    toast(text, {
      icon,
      duration: 1800,
      style: {
        background: 'rgba(19, 19, 43, 0.88)',
        color: 'rgba(255,255,255,0.88)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.34)',
        backdropFilter: 'blur(16px)',
      },
    });
  }, []);

  // Join room on mount, leave on unmount
  useEffect(() => {
    if (!roomId) return;
    socket.emit('join-room', { roomId, ...(pin ? { pin } : {}) });

    return () => {
      socket.emit('leave-room', { roomId });
      // Reset host badge so it does not leak across rooms.
      setRoomHostUsername(null);
    };
  }, [roomId]);

  // Socket events
  useEffect(() => {
    function onRoomUsers(list: RoomUser[]) { setUsers(list); }
    function onSyncState(state: { videoId: string | null; streamUrl: string | null; currentTime: number; isPlaying: boolean; sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'; queue?: QueueItem[]; title?: string | null; thumbnail?: string | null }) {
      setActiveSource(state.sourceType);
      sourceTypeRef.current = state.sourceType;
      if (state.queue) setQueue(state.queue);
      setNowTitle(state.title ?? null);
      setNowThumbnail(state.thumbnail ?? null);
      if ((state.sourceType === 'iptv' || state.sourceType === 'movie') && state.streamUrl) {
        setCurrentStreamUrl(state.streamUrl);
        loadStream(state.streamUrl);
      } else if (state.sourceType === 'youtube' && state.videoId) {
        setCurrentVideoId(state.videoId);
        loadVideo(state.videoId);
      } else if (state.sourceType === 'url') {
        if (state.streamUrl) {
          setCurrentStreamUrl(state.streamUrl);
          if (isDirectVideoUrl(state.streamUrl)) {
            setUrlActivePlayer('stream');
            urlActivePlayerRef.current = 'stream';
            loadStream(state.streamUrl);
          } else {
            setUrlActivePlayer('iframe');
            urlActivePlayerRef.current = 'iframe';
          }
        } else if (state.videoId) {
          setCurrentVideoId(state.videoId);
          setUrlActivePlayer('youtube');
          urlActivePlayerRef.current = 'youtube';
          loadVideo(state.videoId);
        }
      } else if (state.sourceType === 'series') {
        if (state.streamUrl) {
          setCurrentStreamUrl(state.streamUrl);
          if (isDirectVideoUrl(state.streamUrl)) {
            setUrlActivePlayer('stream');
            urlActivePlayerRef.current = 'stream';
            loadStream(state.streamUrl);
            // Seek to currentTime after HLS initializes
            if (state.currentTime > 2) {
              setTimeout(() => {
                hlsSeek(state.currentTime);
                if (state.isPlaying) hlsPlay(state.currentTime);
                else hlsPause(state.currentTime);
              }, 1500);
            }
          } else {
            setUrlActivePlayer('iframe');
            urlActivePlayerRef.current = 'iframe';
          }
        }
      }
    }
    function onPlayerPlay({ currentTime }: { currentTime: number; sentAt?: number }) {
      if (sourceTypeRef.current === 'youtube' || (sourceTypeRef.current === 'url' && urlActivePlayerRef.current === 'youtube')) return;
      // No latency compensation: clock skew between clients can make 'elapsed' negative,
      // which causes seek-back → buffer reload → black flash. The natural ~100–200ms
      // network delay is imperceptible; large drifts get corrected by the heartbeat.
      const st = sourceTypeRef.current;
      const ap = urlActivePlayerRef.current;
      if (st === 'iptv' || st === 'movie') {
        hlsPlay(currentTime);
      } else if (st === 'url' || st === 'series') {
        if (ap === 'youtube') remotePlay(currentTime);
        else if (ap === 'stream') hlsPlay(currentTime);
        // 'iframe': SyncProvider handles it via postMessage — no direct control here
      } else {
        remotePlay(currentTime); // youtube source
      }
    }
    function onPlayerPause({ currentTime }: { currentTime: number; sentAt?: number }) {
      if (sourceTypeRef.current === 'youtube' || (sourceTypeRef.current === 'url' && urlActivePlayerRef.current === 'youtube')) return;
      const st = sourceTypeRef.current;
      const ap = urlActivePlayerRef.current;
      if (st === 'iptv' || st === 'movie') {
        hlsPause(currentTime);
      } else if (st === 'url' || st === 'series') {
        if (ap === 'youtube') remotePause(currentTime);
        else if (ap === 'stream') hlsPause(currentTime);
      } else {
        remotePause(currentTime);
      }
    }
    function onPlayerSeek({ currentTime }: { currentTime: number }) {
      if (sourceTypeRef.current === 'youtube' || (sourceTypeRef.current === 'url' && urlActivePlayerRef.current === 'youtube')) return;
      const st = sourceTypeRef.current;
      const ap = urlActivePlayerRef.current;
      if (st === 'iptv' || st === 'movie') {
        hlsSeek(currentTime);
      } else if (st === 'url' || st === 'series') {
        if (ap === 'youtube') remoteSeek(currentTime);
        else if (ap === 'stream') hlsSeek(currentTime);
      } else {
        remoteSeek(currentTime);
      }
    }
    function onPlayerLoad(data: { type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string } | { type: 'series'; embedUrl: string; title?: string }) {
      if (data.type === 'youtube') {
        setCurrentVideoId(data.videoId);
        setEmbedError(null);
        loadVideo(data.videoId);
        if (sourceTypeRef.current === 'url') { setUrlActivePlayer('youtube'); urlActivePlayerRef.current = 'youtube'; }
      } else if (data.type === 'iptv') {
        setCurrentStreamUrl(data.streamUrl);
        if (sourceTypeRef.current === 'url') {
          if (isDirectVideoUrl(data.streamUrl)) {
            loadStream(data.streamUrl);
            setUrlActivePlayer('stream');
            urlActivePlayerRef.current = 'stream';
          } else {
            setUrlActivePlayer('iframe');
            urlActivePlayerRef.current = 'iframe';
          }
        } else {
          loadStream(data.streamUrl);
        }
      } else if (data.type === 'series') {
        if (isDirectVideoUrl(data.embedUrl)) {
          loadStream(data.embedUrl);
          setUrlActivePlayer('stream');
          urlActivePlayerRef.current = 'stream';
        } else {
          setCurrentStreamUrl(data.embedUrl);
          setUrlActivePlayer('iframe');
          urlActivePlayerRef.current = 'iframe';
        }
        if (data.title) setNowTitle(data.title);
      }
    }
    function onChatMessage(msg: ChatMessage) {
      setMessages((prev) => [...prev, msg]);
      setPanelTab((tab) => {
        if (tab !== 'chat') setUnreadCount((n) => n + 1);
        return tab;
      });
    }
    function onUserJoined({ username }: { username: string }) {
      showRoomNotice(`${username} se unió`, <Users className="w-4 h-4 text-accent-lighter" />);
    }
    function onUserLeft({ username }: { username: string }) {
      showRoomNotice(`${username} salió`, <Users className="w-4 h-4 text-white/60" />);
    }
    function onError({ code }: { code?: string; message?: string }) {
      if (code === 'ROOM_NOT_FOUND') { toast.error('Sala no encontrada'); navigate('/'); }
      if (code === 'ROOM_FULL') { toast.error('La sala está llena'); navigate('/'); }
      if (code === 'ROOM_CLOSED') { toast.error('La sala está cerrada'); navigate('/'); }
      if (code === 'WRONG_PIN') { toast.error('PIN incorrecto'); navigate('/'); }
    }
    function onQueueUpdate(q: QueueItem[]) { setQueue(q); }
    function onSourceSwitched(data: { sourceType: 'youtube' | 'iptv' | 'movie' | 'url' | 'series' }) {
      sourceTypeRef.current = data.sourceType;
      setActiveSource(data.sourceType);
      setQueue([]);
      setNowTitle(null);
      setNowThumbnail(null);
      const sourceLabel = data.sourceType === 'youtube' ? 'YouTube' : data.sourceType === 'iptv' ? 'TV' : data.sourceType === 'movie' ? 'Películas' : data.sourceType === 'series' ? 'Series' : 'URL';
      showRoomNotice(`Modo ${sourceLabel}`, <Sparkles className="w-4 h-4 text-accent-lighter" />);
      if (data.sourceType === 'url' || data.sourceType === 'series') {
        setUrlActivePlayer(null);
        urlActivePlayerRef.current = null;
      }
    }

    const onSeriesEpisodeChange = (data: { serieId: string; serieName: string; temporada: number; episodioIndex: number; embedUrl: string; titulo: string }) => {
      setSelectedSerieId(data.serieId);
      setSelectedTemporada(data.temporada);
      setSelectedEpisodioIndex(data.episodioIndex);
      setNowTitle(data.titulo);
      showRoomNotice('Episodio cambiado', <BookOpen className="w-4 h-4 text-accent-lighter" />);
      if (isDirectVideoUrl(data.embedUrl)) {
        loadStream(data.embedUrl);
        setUrlActivePlayer('stream');
        urlActivePlayerRef.current = 'stream';
      } else {
        setCurrentStreamUrl(data.embedUrl);
        setUrlActivePlayer('iframe');
        urlActivePlayerRef.current = 'iframe';
      }
    };

    socket.on('room-users', onRoomUsers);
    socket.on('sync-state', onSyncState);
    socket.on('player-play', onPlayerPlay);
    socket.on('player-pause', onPlayerPause);
    socket.on('player-seek', onPlayerSeek);
    socket.on('player-load', onPlayerLoad);
    socket.on('chat-message', onChatMessage);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('error', onError);
    socket.on('queue-update', onQueueUpdate);
    socket.on('source-switched', onSourceSwitched);
    socket.on('series-episode-change', onSeriesEpisodeChange);

    // Feature 1: typing indicator
    function onTypingUpdate(data: { roomId: string; typingUsers: string[] }) {
      if (data.roomId === roomId) {
        setTypingUsers(data.typingUsers.filter((u: string) => u !== user?.username));
      }
    }
    socket.on('typing-update', onTypingUpdate);

    // Feature 4: robust sync events
    function onPlayerSync(data: { action: string; currentTime?: number; isPlaying?: boolean; serverTime: number }) {
      if (sourceTypeRef.current === 'youtube' || (sourceTypeRef.current === 'url' && urlActivePlayerRef.current === 'youtube')) return;
      // Iframe embeds: SyncProvider handles player-sync internally via smartSync.onPlayerSync
      // and the postMessage drift correction. Calling YouTube/HLS APIs here for iframe sources
      // would target the wrong player.
      if (urlActivePlayerRef.current === 'iframe') return;
      const latency = (Date.now() - data.serverTime) / 2;
      const adjustedTime = (data.currentTime ?? 0) + latency / 1000;
      const src = sourceTypeRef.current;
      const isStream = src === 'iptv' || src === 'movie' ||
        (src === 'url' && urlActivePlayerRef.current === 'stream') ||
        (src === 'series' && urlActivePlayerRef.current === 'stream');
      if (data.action === 'play') {
        if (isStream) { hlsSeek(adjustedTime); hlsPlay(adjustedTime); } else { remoteSeek(adjustedTime); remotePlay(adjustedTime); }
      } else if (data.action === 'pause') {
        if (isStream) { hlsSeek(adjustedTime); hlsPause(adjustedTime); } else { remoteSeek(adjustedTime); remotePause(adjustedTime); }
      } else if (data.action === 'seek') {
        if (isStream) { hlsSeek(adjustedTime); } else { remoteSeek(adjustedTime); }
      }
    }
    socket.on('player-sync', onPlayerSync);

    function onPlayerHeartbeat(data: { currentTime: number; isPlaying: boolean }) {
      if (sourceTypeRef.current === 'youtube' || (sourceTypeRef.current === 'url' && urlActivePlayerRef.current === 'youtube')) return;
      const src = sourceTypeRef.current;
      const isStream = src === 'iptv' || src === 'movie' || (src === 'url' && urlActivePlayerRef.current === 'stream');
      const localTime = isStream ? hlsGetTime() : getCurrentTime();
      const diff = Math.abs(localTime - data.currentTime);
      // Only correct large drifts (>5s) — small drifts are normal and correcting them causes visible jumps
      if (diff > 5) {
        if (isStream) { hlsSeek(data.currentTime); } else { remoteSeek(data.currentTime); }
      }
    }
    socket.on('player-heartbeat', onPlayerHeartbeat);

    /**
     * Handle host changes (Feature 3 — Discrete Host Badge).
     * Server emits this event in three cases:
     *   1. First joiner becomes host (broadcast to room).
     *   2. Late joiner who is NOT host receives a direct unicast so it can
     *      initialise its local host state without waiting for a transition.
     *   3. Previous host disconnects / leaves and a new host is promoted.
     * The username is pushed to the global Zustand store so the
     * <HostBadge /> rendered inside <SyncProvider /> updates reactively.
     */
    function onHostChanged(data: { newHostUsername: string; newHostSocketId: string; previousHostUsername?: string }) {
      setRoomHostUsername(data.newHostUsername);
    }
    socket.on('host-changed', onHostChanged);

    return () => {
      socket.off('room-users', onRoomUsers);
      socket.off('sync-state', onSyncState);
      socket.off('player-play', onPlayerPlay);
      socket.off('player-pause', onPlayerPause);
      socket.off('player-seek', onPlayerSeek);
      socket.off('player-load', onPlayerLoad);
      socket.off('chat-message', onChatMessage);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('error', onError);
      socket.off('queue-update', onQueueUpdate);
      socket.off('source-switched', onSourceSwitched);
      socket.off('series-episode-change', onSeriesEpisodeChange);
      socket.off('typing-update', onTypingUpdate);
      socket.off('player-sync', onPlayerSync);
      socket.off('player-heartbeat', onPlayerHeartbeat);
      socket.off('host-changed', onHostChanged);
    };
  }, [loadVideo, remotePlay, remotePause, remoteSeek, loadStream, hlsPlay, hlsPause, hlsSeek, navigate, showRoomNotice]);

  // Auto-scroll chat
  useEffect(() => {
    if (panelTab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, panelTab]);

  // Fullscreen detection
  useEffect(() => {
    function handleFsChange() {
      setIsNativeFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    // Exit CSS fullscreen when user presses Escape
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsCSSFullscreen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Lock body scroll when CSS fullscreen is active
  useEffect(() => {
    document.body.style.overflow = isCSSFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCSSFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
    const roomEl = roomContainerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (isNativeFullscreen) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else void doc.webkitExitFullscreen?.();
      return;
    }
    if (isCSSFullscreen) { setIsCSSFullscreen(false); return; }
    if (roomEl && (document.fullscreenEnabled || roomEl.webkitRequestFullscreen)) {
      if (roomEl.requestFullscreen) void roomEl.requestFullscreen();
      else void roomEl.webkitRequestFullscreen?.();
    } else {
      setIsCSSFullscreen(true);
    }
  }, [isNativeFullscreen, isCSSFullscreen]);

  useEffect(() => {
    if (!isFullscreen) setHideSocialPanel(false);
  }, [isFullscreen]);

  // Feature 5: Visual Viewport resize for iOS keyboard
  useEffect(() => {
    if (!window.visualViewport) return;
    const handler = () => {
      if (document.activeElement === chatInputRef.current) {
        setTimeout(() => chatInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100);
      }
    };
    window.visualViewport.addEventListener('resize', handler);
    return () => { window.visualViewport?.removeEventListener('resize', handler); };
  }, []);

  // Block popups originating from the series iframe at the parent window level
  // (Cross-origin iframes can't be modified directly; instead we monkey-patch
  // window.open on the parent and detect/close popups that match suspicious patterns)
  useEffect(() => {
    if (urlActivePlayer !== 'iframe' || !currentStreamUrl) return;
    const originalOpen = window.open;
    // Override parent window.open to block any popup attempted while iframe player is mounted
    window.open = function (url?: string | URL, target?: string, features?: string): Window | null {
      const urlStr = url ? String(url) : '';
      // Allow same-origin / known safe URLs (about:blank handshake, etc.)
      const sameOrigin = !urlStr || urlStr.startsWith('/') || urlStr.startsWith(window.location.origin) || urlStr.startsWith('about:');
      if (sameOrigin) {
        return originalOpen.call(window, url ?? '', target ?? '_blank', features ?? '');
      }
      console.warn('[WJ] Blocked popup attempt to:', urlStr);
      return null;
    };
    return () => {
      window.open = originalOpen;
    };
  }, [urlActivePlayer, currentStreamUrl]);

  // Detect tab-stealing popups: if a new window steals focus, refocus parent
  useEffect(() => {
    if (urlActivePlayer !== 'iframe' || !currentStreamUrl) return;
    function handleBlur() {
      // When the iframe steals focus (e.g. a popup opened), refocus the parent after a tick
      setTimeout(() => {
        if (document.hidden) return;
        window.focus();
      }, 0);
    }
    window.addEventListener('blur', handleBlur);
    return () => { window.removeEventListener('blur', handleBlur); };
  }, [urlActivePlayer, currentStreamUrl]);

  function switchTab(t: PanelTab) {
    setPanelTab(t);
    if (t === 'chat') setUnreadCount(0);
  }

  function handleLoadUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const videoId = extractVideoId(trimmed);
    const playlistId = extractPlaylistId(trimmed);

    // YouTube playlist URL → load first video + queue the rest
    if (playlistId && activeSource !== 'url') {
      setUrlInput('');
      showRoomNotice('Cargando playlist…', <Play className="w-4 h-4 text-accent-lighter" />);
      searchApi.getPlaylistItems(playlistId, videoId ?? undefined)
        .then(({ data }) => {
          const items = data.items;
          if (!items.length) { toast.error('Playlist vacía'); return; }
          const first = videoId && items.find((it) => it.videoId === videoId) ? videoId : items[0].videoId;
          setCurrentVideoId(first);
          socket.emit('player-load', { roomId: roomId!, type: 'youtube', videoId: first });
          for (const it of items) {
            if (it.videoId === first) continue;
            socket.emit('queue-add', {
              roomId: roomId!,
              item: { type: 'youtube', title: it.title, videoId: it.videoId, thumbnail: it.thumbnail },
            });
          }
        })
        .catch(() => toast.error('No se pudo cargar la playlist'));
      return;
    }

    if (videoId) {
      setCurrentVideoId(videoId);
      if (activeSource === 'url') { setUrlActivePlayer('youtube'); urlActivePlayerRef.current = 'youtube'; }
      socket.emit('player-load', { roomId: roomId!, type: 'youtube', videoId });
      setUrlInput('');
      showRoomNotice('Preparando video juntos', <Play className="w-4 h-4 text-accent-lighter" />);
      return;
    }
    // In 'url' rooms: detect direct video vs embed page
    if (activeSource === 'url') {
      try { new URL(trimmed); } catch { toast.error('URL inválida'); return; }
      setCurrentStreamUrl(trimmed);
      if (isDirectVideoUrl(trimmed)) {
        setUrlActivePlayer('stream');
        urlActivePlayerRef.current = 'stream';
      } else {
        setUrlActivePlayer('iframe');
        urlActivePlayerRef.current = 'iframe';
      }
      socket.emit('player-load', { roomId: roomId!, type: 'iptv', streamUrl: trimmed });
      setUrlInput('');
      showRoomNotice('Preparando la sala', <Sparkles className="w-4 h-4 text-accent-lighter" />);
      return;
    }
    // YouTube room: not a valid YT URL — open search
    const isYTUrl = trimmed.toLowerCase().includes('youtube.com') || trimmed.toLowerCase().includes('youtu.be');
    setSearchInitialQuery(isYTUrl ? '' : trimmed);
    setSearchOpen(true);
  }

  function handleVideoSelect(videoId: string) {
    setCurrentVideoId(videoId);
    setEmbedError(null);
    socket.emit('player-load', { roomId: roomId!, type: 'youtube', videoId });
    setUrlInput('');
    showRoomNotice('Video listo para ver juntos', <Play className="w-4 h-4 text-accent-lighter" />);
  }

  function handleIptvSelect(entry: IPTVEntry) {
    setCurrentStreamUrl(entry.url);
    socket.emit('player-load', { roomId: roomId!, type: 'iptv', streamUrl: entry.url });
    showRoomNotice('Canal cambiado', <Tv className="w-4 h-4 text-accent-lighter" />);
  }

  function handleResync() {
    const isStreamPlayer = activeSource === 'iptv' || activeSource === 'movie' ||
      (activeSource === 'url' && urlActivePlayer === 'stream') ||
      (activeSource === 'series' && urlActivePlayer === 'stream');
    const currentTime = isStreamPlayer ? hlsGetTime() : (activeSource === 'series' ? 0 : getCurrentTime());
    const isPlaying = isStreamPlayer ? !videoRef.current?.paused : (activeSource === 'youtube');
    setSyncStatus('syncing');
    socket.emit('resync-all', { roomId: roomId!, currentTime, isPlaying });
    setTimeout(() => setSyncStatus('synced'), 2500);
    showRoomNotice('Sincronizando la sala', <RotateCcw className="w-4 h-4 text-accent-lighter" />);
  }

  function handleTyping() {
    if (!roomId || !user?.username) return;
    socket.emit('typing-start', { roomId, username: user.username });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit('typing-stop', { roomId, username: user.username! });
    }, 1500);
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat-message', { roomId: roomId!, text: chatInput.trim() });
    setChatInput('');
  }

  const handleSerieChange = useCallback(async (serieId: string) => {
    setSelectedSerieId(serieId);
    setSelectedTemporada(null);
    setSelectedEpisodioIndex(null);
    setSerieDetail(null);
    setLoadingEpisodes(true);
    try {
      const { data } = await libraryApi.getSerieDetail(serieId);
      setSerieDetail(data);
      if (data.temporadas.length > 0) {
        setSelectedTemporada([...data.temporadas].sort((a, b) => a.temporada - b.temporada)[0].temporada);
      }
    } catch {
      setSeriesError('Error al cargar los episodios');
    } finally {
      setLoadingEpisodes(false);
    }
  }, []);

  function handleTemporadaChange(temporada: number) {
    setSelectedTemporada(temporada);
    setSelectedEpisodioIndex(null);
  }

  function handleEpisodioChange(index: number) {
    setSelectedEpisodioIndex(index);
  }

  const handlePlay = useCallback(async () => {
    if (selectedSerieId == null || selectedTemporada == null || selectedEpisodioIndex == null) return;
    const temporadaData = serieDetail?.temporadas.find(t => t.temporada === selectedTemporada);
    const episodio = temporadaData?.episodios[selectedEpisodioIndex];
    if (!episodio) return;
    setLoadingEmbed(true);
    try {
      const { data } = await libraryApi.resolveEmbed(episodio.url);
      const embedUrl = data.embedUrl;
      socket.emit('series-episode-change', {
        roomId: roomId!,
        serieId: selectedSerieId,
        serieName: serieDetail!.name,
        temporada: selectedTemporada,
        episodioIndex: selectedEpisodioIndex,
        embedUrl,
        titulo: episodio.titulo,
      });
      if (isDirectVideoUrl(embedUrl)) {
        loadStream(embedUrl);
        setUrlActivePlayer('stream');
        urlActivePlayerRef.current = 'stream';
      } else {
        setCurrentStreamUrl(embedUrl);
        setUrlActivePlayer('iframe');
        urlActivePlayerRef.current = 'iframe';
      }
      showRoomNotice('Episodio listo', <BookOpen className="w-4 h-4 text-accent-lighter" />);
    } catch {
      toast.error('Error al cargar el episodio');
    } finally {
      setLoadingEmbed(false);
    }
  }, [selectedSerieId, selectedTemporada, selectedEpisodioIndex, serieDetail, roomId, loadStream, showRoomNotice]);

  // Load series list when room source is 'series'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeSource !== 'series' || seriesList.length > 0) return;
    setLoadingSeries(true);
    libraryApi.listSeries()
      .then(({ data }) => {
        setSeriesList(data);
        if (selectedSerieId === null && data.length > 0) {
          handleSerieChange(data[0].id);
        }
      })
      .catch(() => setSeriesError('Error al cargar las series'))
      .finally(() => setLoadingSeries(false));
  }, [activeSource]);

  async function copyRoomLink() {
    await copyToClipboard(window.location.href);
    setIsCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setIsCopied(false), 2000);
  }

  const roomShellClass = isCSSFullscreen
    ? 'fixed inset-0 z-[999] flex flex-col bg-base text-white overflow-hidden room-shell room-fullscreen'
    : `flex flex-col h-screen bg-base text-white overflow-hidden room-shell ${isFullscreen ? 'room-fullscreen' : ''}`;

  return (
    <div ref={roomContainerRef} className={roomShellClass}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.06] bg-base backdrop-blur-xl flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white leading-tight truncate">{room?.name ?? 'Sala'}</h1>
            <p className="text-xs text-white/35 flex items-center gap-1">
              <Users className="h-3 w-3" /> {users.length} espectador{users.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={handleResync}
            title="Sincronizar a todos a tu posición actual"
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${syncStatus === 'syncing'
              ? 'bg-yellow-500/15 text-yellow-400'
              : 'bg-white/5 text-white/50 hover:bg-accent-muted hover:text-accent-lighter hover:shadow-lg'
              }`}
          >
            {syncStatus === 'syncing'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{syncStatus === 'syncing' ? 'Sincronizando...' : 'Re-sincronizar'}</span>
          </button>
          {isFullscreen && (
            <button
              onClick={() => setHideSocialPanel((value) => !value)}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/45 hover:text-white hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {hideSocialPanel ? 'Mostrar chat' : 'Ocultar chat'}
            </button>
          )}
          <button onClick={copyRoomLink} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {isCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden room-body">
        {/* Player side — no flex-1 on mobile so chat gets the leftover space */}
        <div className="flex-shrink-0 md:flex-1 flex flex-col min-w-0">
          {/* Now playing title bar */}
          {nowTitle !== null && (
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-raised border-b border-white/[0.06] flex-shrink-0">
              {nowThumbnail && (
                <img src={nowThumbnail} alt="" className="h-9 w-16 object-cover rounded flex-shrink-0" />
              )}
              <span className="text-sm text-white/80 truncate flex-1">{nowTitle}</span>
            </div>
          )}

          {/* Video */}
          <div ref={playerContainerRef} className="bg-black relative w-full aspect-video md:aspect-auto md:flex-1 overflow-hidden">
            {/* Fullscreen button — always visible (no hover on touch devices). Lives inside the container so it shows in native fullscreen too. */}
            <button
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 z-[1001] bg-black/70 hover:bg-black/90 backdrop-blur-sm p-2 rounded-full text-white touch-manipulation shadow-lg transition-colors"
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            {/* YouTube player */}
            {activeSource === 'youtube' && (
              <>
                <div id="yt-player" className="w-full h-full transform-gpu" style={{ transform: 'translateZ(0)' }} />
                {!currentVideoId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2 pointer-events-none px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-1 shadow-2xl shadow-black/20">
                      <Play className="h-7 w-7 text-accent-lighter fill-current" />
                    </div>
                    <p className="text-sm text-white/60">Tu sala está lista</p>
                    <p className="text-xs text-white/30">Pega un video para verlo juntos</p>
                  </div>
                )}
                {embedError !== null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 gap-4 z-20">
                    <AlertCircle className="h-10 w-10 text-yellow-400" />
                    <p className="text-sm text-white/80 text-center px-8">Este video no permite reproducción embebida</p>
                    <div className="flex items-center gap-3">
                      <a
                        href={`https://www.youtube.com/watch?v=${embedError}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white transition-colors"
                      >
                        Abrir en YouTube
                      </a>
                      {queue.length > 0 && user && (
                        <button
                          onClick={() => { setEmbedError(null); socket.emit('queue-next', { roomId: roomId! }); }}
                          className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                        >
                          Siguiente →
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setEmbedError(null)}
                      className="text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>
                )}
              </>
            )}

            {/* IPTV / HLS player */}
            {(activeSource === 'iptv' || activeSource === 'movie') && (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full transform-gpu"
                  style={{ transform: 'translateZ(0)' }}
                  controls
                  playsInline
                />
                {isLive && (
                  <span className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold z-10">
                    EN VIVO
                  </span>
                )}
                {hlsError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 z-20">
                    <AlertCircle className="h-10 w-10 text-red-400" />
                    <p className="text-sm text-white/70">Error al cargar el stream</p>
                    <button
                      onClick={retryStream}
                      className="px-4 py-1.5 bg-accent hover:bg-accent-light rounded-lg text-sm text-white transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
                {!currentStreamUrl && !hlsError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2 pointer-events-none px-6 text-center">
                    <Tv className="h-11 w-11 text-white/25" />
                    <p className="text-sm text-white/55">Elige algo para compartir</p>
                    <p className="text-xs text-white/25">La sala espera contigo</p>
                  </div>
                )}
              </>
            )}

            {/* Series Classic player */}
            {activeSource === 'series' && (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  playsInline
                  style={{ display: urlActivePlayer === 'stream' ? 'block' : 'none' }}
                />
                {urlActivePlayer === 'iframe' && currentStreamUrl && (
                  <div className="absolute inset-0">
                    <SyncProvider
                      embedUrl={currentStreamUrl}
                      roomId={roomId!}
                      userId={user?.username ?? ''}
                      isHost={roomHostUsername === user?.username}
                      hostUsername={roomHostUsername}
                    />
                  </div>
                )}
                {urlActivePlayer === null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2 pointer-events-none px-6 text-center">
                    <Film className="h-11 w-11 text-white/25" />
                    <p className="text-sm text-white/55">Elige un episodio</p>
                    <p className="text-xs text-white/25">Todo listo para verlo juntos</p>
                  </div>
                )}

              </>
            )}

            {/* URL room: auto-detect player */}
            {activeSource === 'url' && (
              <>
                {/* YouTube layer (visible when urlActivePlayer === 'youtube') */}
                <div
                  id="yt-player"
                  className="w-full h-full"
                  style={{ display: urlActivePlayer === 'youtube' ? 'block' : 'none' }}
                />
                {/* Stream/video layer — always in DOM so videoRef is available */}
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  playsInline
                  style={{ display: urlActivePlayer === 'stream' ? 'block' : 'none' }}
                />
                {/* Iframe embed layer for non-stream web pages */}
                {urlActivePlayer === 'iframe' && currentStreamUrl && (
                  <div className="absolute inset-0 flex flex-col">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-black/70 backdrop-blur-sm flex-shrink-0 z-10">
                      <span className="text-xs text-white/50 truncate max-w-[60%]">{currentStreamUrl}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={currentStreamUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white/80 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          Nueva pestaña
                        </a>
                        <button
                          onClick={toggleFullscreen}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white/80 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                          Pantalla completa
                        </button>
                      </div>
                    </div>
                    <iframe
                      ref={iframeRef}
                      src={currentStreamUrl}
                      className="flex-1 border-0 w-full"
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
                {isLive && urlActivePlayer === 'stream' && (
                  <span className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold z-10">
                    EN VIVO
                  </span>
                )}
                {hlsError && urlActivePlayer === 'stream' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 z-20">
                    <AlertCircle className="h-10 w-10 text-red-400" />
                    <p className="text-sm text-white/70">Error al cargar el video</p>
                    <button onClick={retryStream} className="px-4 py-1.5 bg-accent hover:bg-accent-light rounded-lg text-sm text-white transition-colors">Reintentar</button>
                  </div>
                )}
                {urlActivePlayer === null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2 pointer-events-none px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-1">
                      <Link className="h-7 w-7 text-accent-lighter" />
                    </div>
                    <p className="text-sm text-white/60">Comparte algo para ver juntos</p>
                    <p className="text-xs text-white/25">YouTube, stream o una página de video</p>
                  </div>
                )}
                {embedError !== null && urlActivePlayer === 'youtube' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 gap-4 z-20">
                    <AlertCircle className="h-10 w-10 text-yellow-400" />
                    <p className="text-sm text-white/80 text-center px-8">Este video no permite reproducción embebida</p>
                    <a href={`https://www.youtube.com/watch?v=${embedError}`} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white transition-colors">Abrir en YouTube</a>
                    <button onClick={() => setEmbedError(null)} className="text-xs text-white/40 hover:text-white/70 transition-colors">Cerrar</button>
                  </div>
                )}
              </>
            )}

          </div>

          {/* URL + search bar */}
          <div className="bg-raised border-t border-white/[0.06] px-4 py-3 flex items-center gap-2 flex-shrink-0">
            {activeSource === 'iptv' ? (
              <button
                type="button"
                onClick={() => setIptvBrowserOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light rounded-lg text-sm text-white transition-colors"
              >
                <Tv className="h-4 w-4" />
                Cambiar canal
              </button>
            ) : activeSource === 'movie' ? (
              <button
                type="button"
                onClick={() => setJellyfinOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light rounded-lg text-sm text-white transition-colors"
              >
                <Film className="h-4 w-4" /> Jellyfin
              </button>
            ) : activeSource === 'series' ? (
              <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
                {selectedSerieId && serieDetail ? (
                  <span className="text-xs text-white/60 truncate shrink-0 max-w-[120px] sm:max-w-xs">
                    {serieDetail.name}
                    {selectedTemporada !== null ? ` · T${selectedTemporada}` : ''}
                    {selectedEpisodioIndex !== null ? ` E${selectedEpisodioIndex + 1}` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-white/35 shrink-0">Sin episodio</span>
                )}
                <button
                  onClick={() => setSeriesSelectorOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-xs text-white/70 hover:text-white transition-all shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Search className="h-3.5 w-3.5" />
                  Episodios
                </button>
                <button
                  onClick={handlePlay}
                  disabled={loadingEmbed || selectedEpisodioIndex === null}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-xs text-white transition-all shrink-0 cursor-pointer shadow-lg shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {loadingEmbed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  Ver
                </button>
                {hasNext && (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-accent-muted text-accent-lighter hover:bg-accent-muted text-xs transition-all shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Sig.
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleLoadUrl} className="flex-1 flex gap-2">
                <div className="flex-1 relative">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={activeSource === 'url' ? 'Pega una URL (YouTube, .m3u8, .mp4...)' : 'URL de YouTube, ID de video o término de búsqueda...'}
                    className="w-full px-3 py-2 bg-white/[0.055] border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent-muted pr-6 transition-shadow"
                  />
                  {urlInput && (
                    <button type="button" onClick={() => setUrlInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white leading-none">×</button>
                  )}
                </div>
                <button type="submit" className="px-3 py-2 bg-accent hover:bg-accent-light rounded-lg text-sm text-white transition-all flex items-center gap-1.5 whitespace-nowrap shadow-lg shadow-black/20 hover:shadow-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {activeSource === 'url'
                    ? <><Play className="h-3.5 w-3.5 fill-current" /> Reproducir</>
                    : urlInput && !extractVideoId(urlInput.trim())
                      ? <><Search className="h-3.5 w-3.5" /> Buscar</>
                      : <><Play className="h-3.5 w-3.5 fill-current" /> Cargar</>}
                </button>
              </form>
            )}
            {activeSource === 'youtube' && (
              <button type="button" onClick={() => { setSearchInitialQuery(''); setSearchOpen(true); }}
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" title="Buscar en YouTube">
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Queue & source controls */}
          <div className="bg-raised border-t border-white/[0.06] px-4 py-2 flex items-center gap-2 flex-shrink-0">
            {queue.length > 0 && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() => socket.emit('queue-next', { roomId: roomId! })}
              >
                <SkipForward className="h-3.5 w-3.5" /> Siguiente
              </Button>
            )}
            <button
              type="button"
              onClick={() => setQueueOpen((o) => !o)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${queueOpen ? 'bg-accent-muted text-accent-lighter' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              Cola{queue.length > 0 ? ` (${queue.length})` : ''}
            </button>
            <div className="flex-1" />
            {/* Source switcher */}
            <div className="flex items-center gap-1 overflow-x-auto flex-shrink-0 max-w-[55vw] sm:max-w-none pb-0.5 sm:pb-0">
              <button
                type="button"
                onClick={() => {
                  if (!room?.iptvListId) { alert('Esta sala no tiene una lista IPTV configurada'); return; }
                  socket.emit('switch-source', { roomId: roomId!, sourceType: 'iptv', iptvListId: room.iptvListId });
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSource === 'iptv' ? 'bg-accent text-white shadow-lg shadow-black/20' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Tv className="h-4 w-4 inline mr-1" />TV
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'youtube' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSource === 'youtube' ? 'bg-accent text-white shadow-lg shadow-black/20' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Youtube className="h-4 w-4 inline mr-1" />YouTube
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'movie' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSource === 'movie' ? 'bg-accent text-white shadow-lg shadow-black/20' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Film className="h-4 w-4 inline mr-1" />Películas
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'series' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSource === 'series' ? 'bg-accent text-white shadow-lg shadow-black/20' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <BookOpen className="h-4 w-4 inline mr-1" />Series
              </button>
            </div>
          </div>

          {/* Queue panel */}
          {queueOpen && (
            <QueuePanel
              queue={queue}
              roomId={roomId!}
              currentUsername={user?.username ?? null}
              isAdmin={user?.isAdmin ?? false}
            />
          )}
        </div>

        {/* Right panel — inline below controls on mobile, sidebar on desktop */}
        <div
          className={`${hideSocialPanel && isFullscreen ? 'hidden' : 'flex'} flex-1 md:flex-none md:w-72 lg:w-80 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-white/[0.08] flex-col bg-raised backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20 social-panel`}
        >
          {/* Tab bar */}
          <div className="p-2 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.025]">
            <div className="flex rounded-lg bg-black/20 p-1 border border-white/[0.05]">
            <PanelTabBtn active={panelTab === 'users'} onClick={() => switchTab('users')}
              icon={<Users className="h-3.5 w-3.5" />}
              label={`Usuarios${users.length > 0 ? ` (${users.length})` : ''}`} />
            <PanelTabBtn active={panelTab === 'chat'} onClick={() => switchTab('chat')}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Chat" badge={unreadCount > 0 ? unreadCount : undefined} />
            </div>
          </div>

          {/* Users tab */}
          {panelTab === 'users' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              {users.map((u) => (
                <div key={u.socketId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.055] transition-colors group">
                  <Avatar username={u.username} size="xs" />
                  <span className="text-sm text-white/80 truncate flex-1">{u.username}</span>
                  {u.username === user?.username && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-muted text-accent-lighter flex-shrink-0">Tú</span>
                  )}
                </div>
              ))}
              {users.length === 0 && <p className="text-xs text-white/30 text-center mt-8">Esperando compañía</p>}
            </div>
          )}

          {/* Chat tab */}
          {panelTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 chat-scroll">
                {messages.map((msg, i) => (
                  <ChatBubble key={i} msg={msg} isOwn={msg.username === user?.username} />
                ))}
                {messages.length === 0 && (
                  <div className="text-center mt-10 px-4">
                    <p className="text-sm text-white/45">La sala está lista.</p>
                    <p className="text-xs text-white/25 mt-1">Manda el primer mensaje.</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {typingUsers.length > 0 && (
                <div className="px-4 py-2 border-t border-white/[0.04] flex-shrink-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.055] border border-white/[0.06] px-2.5 py-1.5 shadow-lg shadow-black/10">
                    <Avatar username={typingUsers[0] ?? 'Alguien'} size="xs" />
                    <span className="text-xs text-white/45">
                      {typingUsers.length === 1 ? `${typingUsers[0]} está escribiendo` : 'Varios están escribiendo'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="typing-bubble-dot" />
                      <span className="typing-bubble-dot" />
                      <span className="typing-bubble-dot" />
                    </span>
                  </div>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-white/[0.06] flex gap-2 flex-shrink-0 bg-black/[0.08]">
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => { setChatInput(e.target.value); handleTyping(); }}
                  onFocus={() => { setTimeout(() => chatInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100); }}
                  placeholder="Mensaje..."
                  maxLength={500}
                  className="flex-1 px-3 py-2 bg-white/[0.055] border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent-muted transition-shadow"
                />
                <button type="submit" className="p-2 bg-accent hover:bg-accent-light rounded-lg transition-all flex-shrink-0 shadow-lg shadow-black/20 hover:shadow-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Series episode picker modal */}
      <Modal
        open={seriesSelectorOpen}
        onClose={() => setSeriesSelectorOpen(false)}
        title="Seleccionar episodio"
        maxWidth="max-w-lg"
      >
        <SeriesSelector
          roomId={roomId!}
          username={user?.username ?? ''}
          seriesList={seriesList}
          serieDetail={serieDetail}
          selectedSerieId={selectedSerieId}
          selectedTemporada={selectedTemporada}
          selectedEpisodioIndex={selectedEpisodioIndex}
          loadingEpisodes={loadingEpisodes}
          loadingSeries={loadingSeries}
          loadingEmbed={loadingEmbed}
          onSerieChange={handleSerieChange}
          onTemporadaChange={handleTemporadaChange}
          onEpisodioChange={handleEpisodioChange}
          onPlay={() => { void handlePlay(); setSeriesSelectorOpen(false); }}
          onNext={handleNext}
          hasNext={hasNext}
          watchProgress={watchProgress}
        />
      </Modal>

      <VideoSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleVideoSelect}
        initialQuery={searchInitialQuery}
        roomId={roomId!}
      />

      {activeSource === 'iptv' && (
        <IPTVBrowserModal
          open={iptvBrowserOpen}
          onClose={() => setIptvBrowserOpen(false)}
          listId={room?.iptvListId ?? ''}
          onSelect={handleIptvSelect}
          roomId={roomId!}
        />
      )}
      <JellyfinBrowserModal
        open={jellyfinOpen}
        onClose={() => setJellyfinOpen(false)}
        roomId={roomId!}
      />

    </div>
  );
}

function PanelTabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all relative focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'text-white bg-white/[0.08] shadow-sm' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
        }`}
    >
      {icon}{label}
      {badge !== undefined && (
        <span className="absolute top-1.5 right-2.5 h-4 min-w-[1rem] px-1 bg-accent text-white text-[10px] rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function ChatBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  const time = new Date(msg.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex gap-2 chat-message ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar username={msg.username} avatar={msg.avatar} size="xs" className="flex-shrink-0 mt-1 ring-1 ring-white/10" />
      <div className={`max-w-[82%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && <span className="text-[10px] text-white/35 mb-0.5 px-1">{msg.username}</span>}
        <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words shadow-lg shadow-black/10 ${isOwn ? 'bg-accent text-white rounded-tr-md' : 'bg-white/[0.075] text-white/90 rounded-tl-md border border-white/[0.045]'}`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-white/25 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}
