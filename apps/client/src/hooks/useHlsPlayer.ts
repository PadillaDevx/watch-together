import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface UseHlsPlayerOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
}

export function useHlsPlayer({ videoRef, onPlay, onPause }: UseHlsPlayerOptions) {
  const hlsRef = useRef<Hls | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attach native video event listeners once (stable ref, never re-attach)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handlePlay() {
      onPlay?.(video!.currentTime);
    }
    function handlePause() {
      onPause?.(video!.currentTime);
    }

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup hls on unmount
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const loadStream = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;

    // Destroy previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);
    setIsLive(false);
    lastUrlRef.current = url;

    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(url)}`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        setIsLive(data.details.live === true);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError('Error al cargar el stream');
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = proxiedUrl;
    } else {
      setError('HLS no está soportado en este navegador');
    }
  }, [videoRef]);

  const remotePlay = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (!isLive) video.currentTime = time;
    video.play().catch(() => { /* ignore autoplay policy errors */ });
  }, [videoRef, isLive]);

  const remotePause = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (!isLive) video.currentTime = time;
  }, [videoRef, isLive]);

  const remoteSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, [videoRef]);

  const getCurrentTime = useCallback(() => {
    return videoRef.current?.currentTime ?? 0;
  }, [videoRef]);

  const retryStream = useCallback(() => {
    if (lastUrlRef.current) {
      setError(null);
      loadStream(lastUrlRef.current);
    }
  }, [loadStream]);

  return { loadStream, remotePlay, remotePause, remoteSeek, getCurrentTime, isLive, error, retryStream };
}
