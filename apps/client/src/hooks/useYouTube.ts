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
  const suppressUntilRef = useRef(0);
  const lastSeekTime = useRef(0);

  // Store callbacks in refs so loadVideo never depends on them and re-creating
  // inline functions in the parent (e.g. on recentMessages state change) does
  // NOT cause loadVideo to get a new reference — which would re-run the socket
  // effect and restart the YT player (visible as a black screen flash).
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onEmbedErrorRef = useRef(onEmbedError);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onEmbedErrorRef.current = onEmbedError; }, [onEmbedError]);

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
      suppressUntilRef.current = Date.now() + 2000;
      playerRef.current.loadVideoById(videoId);
    } else {
      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        height: '100%',
        width: '100%',
        // fs: 0 disables YT's own fullscreen button so our container-level fullscreen owns it
        playerVars: { controls: 1, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, fs: 0, origin: window.location.origin } as YT.PlayerVars,
        events: {
          onStateChange: (e: YT.OnStateChangeEvent) => {
            if (Date.now() < suppressUntilRef.current) return;
            const player = playerRef.current;
            if (!player) return;
            const time = player.getCurrentTime();
            if (e.data === window.YT.PlayerState.PLAYING) onPlayRef.current?.(time);
            if (e.data === window.YT.PlayerState.PAUSED) {
              const now = Date.now();
              if (now - lastSeekTime.current > 200) onPauseRef.current?.(time);
            }
            if (e.data === window.YT.PlayerState.ENDED) { onEndedRef.current?.(); }
          },
          onError: (e: { data: number }) => {
            // 101/150: owner disabled embedding; 153: sign-in / age restriction
            if (e.data === 101 || e.data === 150 || e.data === 153) {
              const vid = (playerRef.current as YT.Player & { getVideoData?: () => { video_id?: string } })?.getVideoData?.()?.video_id ?? videoId;
              onEmbedErrorRef.current?.(vid);
            }
          },
        },
      });
    }
  }, [isReady, containerId]); // callbacks excluded intentionally — read via refs

  // Generous threshold: small drifts from network latency are imperceptible and
  // not worth a seekTo() (which causes a YT buffer reload → visible black flash).
  // Large drifts (scrubbing, ad skips) snap correctly. Heartbeat catches anything else.
  const SEEK_THRESHOLD = 2;

  const remotePlay = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    suppressUntilRef.current = Date.now() + 700;
    if (Math.abs(player.getCurrentTime() - currentTime) > SEEK_THRESHOLD) {
      player.seekTo(currentTime, true);
    }
    player.playVideo();
  }, []);

  const remotePause = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    suppressUntilRef.current = Date.now() + 700;
    player.pauseVideo();
    if (Math.abs(player.getCurrentTime() - currentTime) > SEEK_THRESHOLD) {
      player.seekTo(currentTime, true);
    }
  }, []);

  const remoteSeek = useCallback((currentTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    lastSeekTime.current = Date.now();
    suppressUntilRef.current = Date.now() + 1200;
    player.seekTo(currentTime, true);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.setPlaybackRate(rate);
    } catch {
      // Some embeds ignore or reject playbackRate changes. Sync still falls
      // back to drift tolerance and cooldown-protected seeks.
    }
  }, []);

  const getCurrentTime = useCallback(() => {
    const p = playerRef.current;
    return typeof p?.getCurrentTime === 'function' ? p.getCurrentTime() : 0;
  }, []);

  return { isReady, loadVideo, remotePlay, remotePause, remoteSeek, setPlaybackRate, getCurrentTime };
}
