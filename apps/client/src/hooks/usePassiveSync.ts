import { useEffect, useRef, useCallback, useState } from 'react';
import { socket } from '../lib/socket';

interface UsePassiveSyncOptions {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  roomId: string;
  userId: string;
  embedUrl: string | null;
  enabled: boolean;
}

export interface PassiveSyncState {
  showLoading: boolean;
  loadingText: string;
  showPlayInstruction: boolean;
  estimatedTime: number;
}

const LOADING_TEXTS = ['Cargando...', 'Preparando episodio...', 'Casi listo...'];
const READY_TIMEOUT_MS = 8000;

export function usePassiveSync({
  iframeRef,
  roomId,
  userId,
  embedUrl,
  enabled,
}: UsePassiveSyncOptions) {
  const [showLoading, setShowLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0]!);
  const [showPlayInstruction, setShowPlayInstruction] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState(0);

  const userAlreadyPlaying = useRef(false);
  const playInstructionTimer = useRef<ReturnType<typeof setTimeout>>();
  const loadingTextTimer = useRef<ReturnType<typeof setInterval>>();
  const loadingTextIndex = useRef(0);

  const resetSyncState = useCallback(() => {
    userAlreadyPlaying.current = false;
    clearTimeout(playInstructionTimer.current);
    clearInterval(loadingTextTimer.current);
    setShowPlayInstruction(false);
    setShowLoading(false);
    loadingTextIndex.current = 0;
    setLoadingText(LOADING_TEXTS[0]!);
  }, []);

  // Reset when embedUrl changes (new episode)
  useEffect(() => {
    if (!enabled || !embedUrl) return;
    resetSyncState();
    setShowLoading(true);

    // Start rotating loading texts
    loadingTextTimer.current = setInterval(() => {
      loadingTextIndex.current = (loadingTextIndex.current + 1) % LOADING_TEXTS.length;
      setLoadingText(LOADING_TEXTS[loadingTextIndex.current]!);
    }, 2000);

    return () => {
      clearInterval(loadingTextTimer.current);
    };
  }, [embedUrl, enabled, resetSyncState]);

  // Signal ready when iframe loads
  useEffect(() => {
    if (!enabled || !embedUrl) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      socket.emit('client-ready', { roomId, userId });
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [enabled, embedUrl, iframeRef, roomId, userId]);

  // Detect manual play via postMessage (option A)
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const { type } = e.data as { type?: string };
      if (type === 'play' || type === 'timeupdate') {
        userAlreadyPlaying.current = true;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [enabled, iframeRef]);

  // Receive start-playback from server
  useEffect(() => {
    if (!enabled) return;

    const handleStartPlayback = ({ playAt, serverNow }: { playAt: number; serverNow: number }) => {
      const offset = Date.now() - serverNow;
      const msUntilPlay = playAt - Date.now() + offset;

      clearInterval(loadingTextTimer.current);
      setShowLoading(false);
      userAlreadyPlaying.current = false;

      playInstructionTimer.current = setTimeout(() => {
        if (!userAlreadyPlaying.current) {
          setShowPlayInstruction(true);
          // Auto-hide after 1.5s
          setTimeout(() => setShowPlayInstruction(false), 1500);
        }
      }, Math.max(0, msUntilPlay - 300));
    };

    socket.on('start-playback', handleStartPlayback);
    return () => { socket.off('start-playback', handleStartPlayback); };
  }, [enabled]);

  // Receive resync-state (on manual resync request)
  useEffect(() => {
    if (!enabled) return;
    const handleResyncState = ({ currentTime }: { currentTime: number; isPlaying: boolean; serverNow: number; syncMode: string }) => {
      setEstimatedTime(currentTime);
      setShowPlayInstruction(true);
      setTimeout(() => setShowPlayInstruction(false), 3000);
      // Attempt a postMessage seek — works for providers that implement it;
      // harmless for purely passive providers that ignore unknown messages.
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'seek', value: currentTime, source: 'watchjunto' },
        '*',
      );
    };
    socket.on('resync-state', handleResyncState);
    return () => { socket.off('resync-state', handleResyncState); };
  }, [enabled, iframeRef]);

  // Manual interaction detection (option B) — called from overlay click
  const markUserPlaying = useCallback(() => {
    userAlreadyPlaying.current = true;
  }, []);

  const requestResync = useCallback(() => {
    socket.emit('request-resync', { roomId });
  }, [roomId]);

  return {
    showLoading,
    loadingText,
    showPlayInstruction,
    estimatedTime,
    markUserPlaying,
    requestResync,
    resetSyncState,
  };
}
