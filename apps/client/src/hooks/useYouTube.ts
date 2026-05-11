import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiReady = false;
let apiCallbacks: Array<() => void> = [];

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiReady) { resolve(); return; }
    apiCallbacks.push(resolve);
    if (document.getElementById('yt-api-script')) return;
    const script = document.createElement('script');
    script.id = 'yt-api-script';
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      apiCallbacks.forEach(cb => cb());
      apiCallbacks = [];
    };
  });
}

interface UseYouTubeOptions {
  containerId: string;
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
  onEnded?: () => void;
  onEmbedError?: (videoId: string) => void;
}

export function useYouTube({ containerId, onPlay, onPause, onEnded, onEmbedError }: UseYouTubeOptions) {
  const playerRef = useRef<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isRemoteUpdate = useRef(false);
  const lastSeekTime = useRef(0);

  useEffect(() => {
    loadYouTubeAPI().then(() => setIsReady(true));
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const loadVideo = useCallback((videoId: string) => {
    if (!isReady) return;
    if (playerRef.current) {
      isRemoteUpdate.current = true;
      playerRef.current.loadVideoById(videoId);
    } else {
      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        height: '100%',
        width: '100%',
        playerVars: { controls: 1, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, origin: window.location.origin, host: 'https://www.youtube-nocookie.com' } as YT.PlayerVars,
        events: {
          onStateChange: (e: YT.OnStateChangeEvent) => {
            if (isRemoteUpdate.current) {
              isRemoteUpdate.current = false;
              return;
            }
            const player = playerRef.current;
            if (!player) return;
            const time = player.getCurrentTime();
            if (e.data === window.YT.PlayerState.PLAYING) onPlay?.(time);
            if (e.data === window.YT.PlayerState.PAUSED) {
              const now = Date.now();
              if (now - lastSeekTime.current > 200) onPause?.(time);
            }
            if (e.data === window.YT.PlayerState.ENDED) { onEnded?.(); }
          },
          onError: (e: { data: number }) => {
            if (e.data === 101 || e.data === 150) {
              const vid = (playerRef.current as YT.Player & { getVideoData?: () => { video_id?: string } })?.getVideoData?.()?.video_id ?? videoId;
              onEmbedError?.(vid);
            }
          },
        },
      });
    }
  }, [isReady, containerId, onPlay, onPause, onEnded]);

  const remotePlay = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    isRemoteUpdate.current = true;
    player.seekTo(currentTime, true);
    player.playVideo();
  }, []);

  const remotePause = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    isRemoteUpdate.current = true;
    player.seekTo(currentTime, true);
    player.pauseVideo();
  }, []);

  const remoteSeek = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    lastSeekTime.current = Date.now();
    isRemoteUpdate.current = true;
    player.seekTo(currentTime, true);
  }, []);

  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);

  return { isReady, loadVideo, remotePlay, remotePause, remoteSeek, getCurrentTime };
}
