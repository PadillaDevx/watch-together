import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Users, RotateCcw, Send, Link, Check,
  Play, Loader2, MessageSquare, Search, Tv, AlertCircle,
  Film, Youtube, SkipForward,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useYouTube } from '../hooks/useYouTube';
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
import type { ChatMessage, RoomUser, IPTVEntry, QueueItem } from '../types';

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
  // For 'url' rooms: tracks what player is currently active
  const [urlActivePlayer, setUrlActivePlayer] = useState<'youtube' | 'stream' | 'iframe' | null>(null);
  const urlActivePlayerRef = useRef<'youtube' | 'stream' | 'iframe' | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Track sourceType in a ref to avoid stale closures in socket handlers
  const sourceTypeRef = useRef<'youtube' | 'iptv' | 'movie' | 'url' | 'series'>(room?.sourceType ?? 'youtube');
  useEffect(() => {
    sourceTypeRef.current = room?.sourceType ?? 'youtube';
  }, [room?.sourceType]);

  const isLiveRef = useRef<boolean>(false);
  const handleEnded = useCallback(() => {
    if (!isLiveRef.current) {
      socket.emit('queue-next', { roomId: roomId! });
    }
  }, [roomId]);

  // YouTube player
  const { loadVideo, remotePlay, remotePause, remoteSeek, getCurrentTime } = useYouTube({
    containerId: 'yt-player',
    onPlay: (t) => socket.emit('player-play', { roomId: roomId!, currentTime: t }),
    onPause: (t) => socket.emit('player-pause', { roomId: roomId!, currentTime: t }),
    onEnded: handleEnded,
    onEmbedError: (vid) => setEmbedError(vid),
  });

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
    onPlay: (t) => socket.emit('player-play', { roomId: roomId!, currentTime: t }),
    onPause: (t) => socket.emit('player-pause', { roomId: roomId!, currentTime: t }),
    onEnded: handleEnded,
  });
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);

  // Join room on mount, leave on unmount
  useEffect(() => {
    if (!roomId) return;
    socket.emit('join-room', { roomId, ...(pin ? { pin } : {}) });

    return () => {
      socket.emit('leave-room', { roomId });
    };
  }, [roomId]);

  // Socket events
  useEffect(() => {
    function onRoomUsers(list: RoomUser[]) { setUsers(list); }
    function onSyncState(state: { videoId: string | null; streamUrl: string | null; currentTime: number; isPlaying: boolean; sourceType: 'youtube' | 'iptv' | 'movie' | 'url'; queue?: QueueItem[]; title?: string | null; thumbnail?: string | null }) {
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
        setTimeout(() => {
          if (state.isPlaying) remotePlay(state.currentTime);
          else remotePause(state.currentTime);
        }, 1000);
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
          setTimeout(() => {
            if (state.isPlaying) remotePlay(state.currentTime);
            else remotePause(state.currentTime);
          }, 1000);
        }
      }
    }
    function onPlayerPlay({ currentTime }: { currentTime: number }) {
      const st = sourceTypeRef.current;
      if (st === 'iptv' || st === 'movie') hlsPlay(currentTime);
      else if (st === 'url') {
        if (urlActivePlayerRef.current === 'youtube') remotePlay(currentTime);
        else if (urlActivePlayerRef.current === 'stream') hlsPlay(currentTime);
        // iframe: no-op, can't control programmatically
      } else remotePlay(currentTime);
    }
    function onPlayerPause({ currentTime }: { currentTime: number }) {
      const st = sourceTypeRef.current;
      if (st === 'iptv' || st === 'movie') hlsPause(currentTime);
      else if (st === 'url') {
        if (urlActivePlayerRef.current === 'youtube') remotePause(currentTime);
        else if (urlActivePlayerRef.current === 'stream') hlsPause(currentTime);
      } else remotePause(currentTime);
    }
    function onPlayerSeek({ currentTime }: { currentTime: number }) {
      const st = sourceTypeRef.current;
      if (st === 'iptv' || st === 'movie') hlsSeek(currentTime);
      else if (st === 'url') {
        if (urlActivePlayerRef.current === 'youtube') remoteSeek(currentTime);
        else if (urlActivePlayerRef.current === 'stream') hlsSeek(currentTime);
      } else remoteSeek(currentTime);
    }
    function onPlayerLoad(data: { type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string }) {
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
      toast(`${username} se unió`, { duration: 3000 });
    }
    function onUserLeft({ username }: { username: string }) {
      toast(`${username} salió`, { duration: 3000 });
    }
    function onError({ code }: { code: string }) {
      if (code === 'ROOM_NOT_FOUND') { toast.error('Sala no encontrada'); navigate('/'); }
      if (code === 'ROOM_FULL') { toast.error('La sala está llena'); navigate('/'); }
      if (code === 'ROOM_CLOSED') { toast.error('La sala está cerrada'); navigate('/'); }
      if (code === 'WRONG_PIN') { toast.error('PIN incorrecto'); navigate('/'); }
    }
    function onQueueUpdate(q: QueueItem[]) { setQueue(q); }
    function onSourceSwitched(data: { sourceType: 'youtube' | 'iptv' | 'movie' | 'url' }) {
      sourceTypeRef.current = data.sourceType;
      setActiveSource(data.sourceType);
      setQueue([]);
      setNowTitle(null);
      setNowThumbnail(null);
      if (data.sourceType === 'url') {
        setUrlActivePlayer(null);
        urlActivePlayerRef.current = null;
      }
    }

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
    };
  }, [loadVideo, remotePlay, remotePause, remoteSeek, loadStream, hlsPlay, hlsPause, hlsSeek, navigate]);

  // Auto-scroll chat
  useEffect(() => {
    if (panelTab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, panelTab]);

  function switchTab(t: PanelTab) {
    setPanelTab(t);
    if (t === 'chat') setUnreadCount(0);
  }

  function handleLoadUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const videoId = extractVideoId(trimmed);
    if (videoId) {
      setCurrentVideoId(videoId);
      if (activeSource === 'url') { setUrlActivePlayer('youtube'); urlActivePlayerRef.current = 'youtube'; }
      socket.emit('player-load', { roomId: roomId!, type: 'youtube', videoId });
      setUrlInput('');
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
  }

  function handleIptvSelect(entry: IPTVEntry) {
    setCurrentStreamUrl(entry.url);
    socket.emit('player-load', { roomId: roomId!, type: 'iptv', streamUrl: entry.url });
  }

  function handleResync() {
    const isStreamPlayer = activeSource === 'iptv' || activeSource === 'movie' ||
      (activeSource === 'url' && urlActivePlayer === 'stream');
    const currentTime = isStreamPlayer ? hlsGetTime() : getCurrentTime();
    setSyncStatus('syncing');
    socket.emit('resync-all', { roomId: roomId!, currentTime, isPlaying: true });
    setTimeout(() => setSyncStatus('synced'), 2500);
    toast('Sincronizando a todos...', { icon: <RotateCcw className="w-4 h-4 text-violet-400" />, duration: 2000 });
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat-message', { roomId: roomId!, text: chatInput.trim() });
    setChatInput('');
  }

  async function copyRoomLink() {
    await copyToClipboard(window.location.href);
    setIsCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setIsCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d0d1f] text-white overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">{room?.name ?? 'Sala'}</h1>
            <p className="text-xs text-white/35 flex items-center gap-1">
              <Users className="h-3 w-3" /> {users.length} espectador{users.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResync}
            title="Sincronizar a todos a tu posición actual"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${syncStatus === 'syncing'
              ? 'bg-yellow-500/15 text-yellow-400'
              : 'bg-white/5 text-white/50 hover:bg-violet-600/20 hover:text-violet-300'
              }`}
          >
            {syncStatus === 'syncing'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="h-3.5 w-3.5" />}
            {syncStatus === 'syncing' ? 'Sincronizando...' : 'Re-sincronizar'}
          </button>
          <button onClick={copyRoomLink} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
            {isCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Player side */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Now playing title bar */}
          {nowTitle !== null && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[#13132b] border-b border-white/[0.06] flex-shrink-0">
              {nowThumbnail && (
                <img src={nowThumbnail} alt="" className="h-9 w-16 object-cover rounded flex-shrink-0" />
              )}
              <span className="text-sm text-white/80 truncate flex-1">{nowTitle}</span>
            </div>
          )}

          {/* Video */}
          <div className="flex-1 bg-black relative">
            {/* YouTube player */}
            {activeSource === 'youtube' && (
              <>
                <div id="yt-player" className="w-full h-full" />
                {!currentVideoId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 gap-3 pointer-events-none">
                    <Play className="h-12 w-12" />
                    <p className="text-sm">Pega una URL de YouTube abajo para empezar</p>
                  </div>
                )}
                {embedError !== null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 gap-4 z-20">
                    <AlertCircle className="h-10 w-10 text-yellow-400" />
                    <p className="text-sm text-white/80 text-center px-8">Este video no permite reproducción embebida</p>
                    <a
                      href={`https://www.youtube.com/watch?v=${embedError}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white transition-colors"
                    >
                      Abrir en YouTube
                    </a>
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
                  className="w-full h-full"
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
                      className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
                {!currentStreamUrl && !hlsError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 gap-3 pointer-events-none">
                    <Tv className="h-12 w-12" />
                    <p className="text-sm">Elige un canal para comenzar</p>
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
                          onClick={() => iframeRef.current?.requestFullscreen?.()}
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
                    <button onClick={retryStream} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors">Reintentar</button>
                  </div>
                )}
                {urlActivePlayer === null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 gap-3 pointer-events-none">
                    <Link className="h-12 w-12" />
                    <p className="text-sm">Pega una URL abajo para reproducir</p>
                    <p className="text-xs text-white/15">YouTube, .m3u8, .mp4, página de embed...</p>
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
          <div className="bg-[#13132b] border-t border-white/[0.06] px-4 py-3 flex items-center gap-2 flex-shrink-0">
            {activeSource === 'iptv' ? (
              <button
                type="button"
                onClick={() => setIptvBrowserOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
              >
                <Tv className="h-4 w-4" />
                Cambiar canal
              </button>
            ) : activeSource === 'movie' ? (
              <button
                type="button"
                onClick={() => setJellyfinOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
              >
                <Film className="h-4 w-4" /> Jellyfin
              </button>
            ) : (
              <form onSubmit={handleLoadUrl} className="flex-1 flex gap-2">
                <div className="flex-1 relative">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={activeSource === 'url' ? 'Pega una URL (YouTube, .m3u8, .mp4...)' : 'URL de YouTube, ID de video o término de búsqueda...'}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50 pr-6"
                  />
                  {urlInput && (
                    <button type="button" onClick={() => setUrlInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white leading-none">×</button>
                  )}
                </div>
                <button type="submit" className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors flex items-center gap-1.5 whitespace-nowrap">
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
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors" title="Buscar en YouTube">
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Queue & source controls */}
          <div className="bg-[#13132b] border-t border-white/[0.06] px-4 py-2 flex items-center gap-2 flex-shrink-0">
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
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${queueOpen ? 'bg-violet-600/30 text-violet-300' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              Cola{queue.length > 0 ? ` (${queue.length})` : ''}
            </button>
            <div className="flex-1" />
            {/* Source switcher */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!room?.iptvListId) { alert('Esta sala no tiene una lista IPTV configurada'); return; }
                  socket.emit('switch-source', { roomId: roomId!, sourceType: 'iptv', iptvListId: room.iptvListId });
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeSource === 'iptv' ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Tv className="h-4 w-4 inline mr-1" />TV
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'youtube' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeSource === 'youtube' ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Youtube className="h-4 w-4 inline mr-1" />YouTube
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'movie' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeSource === 'movie' ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Film className="h-4 w-4 inline mr-1" />Movies
              </button>
              <button
                type="button"
                onClick={() => socket.emit('switch-source', { roomId: roomId!, sourceType: 'url' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeSource === 'url' ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                <Link className="h-4 w-4 inline mr-1" />URL
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

        {/* Right panel */}
        <div className="w-72 flex-shrink-0 border-l border-white/[0.06] flex flex-col bg-[#13132b]">
          {/* Tab bar */}
          <div className="flex border-b border-white/[0.06] flex-shrink-0">
            <PanelTabBtn active={panelTab === 'users'} onClick={() => switchTab('users')}
              icon={<Users className="h-3.5 w-3.5" />}
              label={`Usuarios${users.length > 0 ? ` (${users.length})` : ''}`} />
            <PanelTabBtn active={panelTab === 'chat'} onClick={() => switchTab('chat')}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Chat" badge={unreadCount > 0 ? unreadCount : undefined} />
          </div>

          {/* Users tab */}
          {panelTab === 'users' && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              {users.map((u) => (
                <div key={u.socketId} className="flex items-center gap-2.5 py-1">
                  <Avatar username={u.username} size="xs" />
                  <span className="text-sm text-white/80 truncate flex-1">{u.username}</span>
                  {u.username === user?.username && (
                    <span className="text-xs text-violet-400 flex-shrink-0">Tú</span>
                  )}
                </div>
              ))}
              {users.length === 0 && <p className="text-xs text-white/25 text-center mt-8">Nadie en la sala</p>}
            </div>
          )}

          {/* Chat tab */}
          {panelTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((msg, i) => (
                  <ChatBubble key={i} msg={msg} isOwn={msg.username === user?.username} />
                ))}
                {messages.length === 0 && (
                  <p className="text-xs text-white/20 text-center mt-8">El chat está vacío</p>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="p-3 border-t border-white/[0.06] flex gap-2 flex-shrink-0">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Mensaje..."
                  maxLength={500}
                  className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                />
                <button type="submit" className="p-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors flex-shrink-0">
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

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
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative border-b-2 ${active ? 'text-violet-300 border-violet-500' : 'text-white/35 hover:text-white/60 border-transparent'
        }`}
    >
      {icon}{label}
      {badge !== undefined && (
        <span className="absolute top-1.5 right-2.5 h-4 min-w-[1rem] px-1 bg-violet-600 text-white text-[10px] rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function ChatBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  const time = new Date(msg.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar username={msg.username} avatar={msg.avatar} size="xs" className="flex-shrink-0 mt-0.5" />
      <div className={`max-w-[80%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`px-3 py-1.5 rounded-xl text-sm leading-snug break-words ${isOwn ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-white/8 text-white/90 rounded-tl-sm'}`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-white/25 mt-0.5 px-1">{time}</span>
      </div>
    </div>
  );
}
