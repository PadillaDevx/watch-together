import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface UseHlsPlayerOptions {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onPlay?: (currentTime: number) => void;
    onPause?: (currentTime: number) => void;
    onEnded?: () => void;
}

export function useHlsPlayer({ videoRef, onPlay, onPause, onEnded }: UseHlsPlayerOptions) {
    const hlsRef = useRef<Hls | null>(null);
    const lastUrlRef = useRef<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const onPlayRef = useRef(onPlay);
    const onPauseRef = useRef(onPause);
    const onEndedRef = useRef(onEnded);
    // Suppress local play/pause events for a short window after a remote command
    // to prevent infinite feedback loops between connected clients
    const suppressUntilRef = useRef(0);
    useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
    useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
    useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

    // Attach native video event listeners once (stable ref, never re-attach)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        function handlePlay() {
            if (Date.now() < suppressUntilRef.current) return;
            onPlayRef.current?.(video!.currentTime);
        }
        function handlePause() {
            if (Date.now() < suppressUntilRef.current) return;
            onPauseRef.current?.(video!.currentTime);
        }

        const handleEnded = () => onEndedRef.current?.();

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('ended', handleEnded);
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

        const proxiedUrl = `/api/iptv/proxy?url=${encodeURIComponent(url)}`;

        if (Hls.isSupported()) {
            const hls = new Hls();
            hlsRef.current = hls;

            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => { /* autoplay policy — user must interact first */ });
            });

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

    // Generous threshold avoids HLS re-buffering / black flash on small drifts.
    const SEEK_THRESHOLD = 2;

    const remotePlay = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        suppressUntilRef.current = Date.now() + 700;
        if (!isLive && Math.abs(video.currentTime - time) > SEEK_THRESHOLD) video.currentTime = time;
        video.play().catch(() => { /* ignore autoplay policy errors */ });
    }, [videoRef, isLive]);

    const remotePause = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        suppressUntilRef.current = Date.now() + 700;
        video.pause();
        if (!isLive && Math.abs(video.currentTime - time) > SEEK_THRESHOLD) video.currentTime = time;
    }, [videoRef, isLive]);

    const remoteSeek = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        suppressUntilRef.current = Date.now() + 800;
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
