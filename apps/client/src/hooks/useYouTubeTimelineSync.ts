import { useCallback, useEffect, useRef } from 'react';
import { socket } from '../lib/socket';
import type { YouTubeTimelineState } from '../lib/socket-types';

interface UseYouTubeTimelineSyncOptions {
  roomId: string;
  enabled: boolean;
  isReady: boolean;
  getCurrentTime: () => number;
  remotePlay: (currentTime: number) => void;
  remotePause: (currentTime: number) => void;
  remoteSeek: (currentTime: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const CORRECTION_INTERVAL_MS = 750;
const SOFT_DRIFT_SECONDS = 0.25;
const RATE_DRIFT_SECONDS = 1.0;
const SEEK_DRIFT_SECONDS = 2.5;
const SEEK_COOLDOWN_MS = 3_000;
const REMOTE_SUPPRESS_MS = 1_200;
const LOCAL_SETTLE_MS = 1_200;
const LOAD_SETTLE_MS = 1_500;

function clampTime(time: number): number {
  return Math.max(0, time);
}

function expectedTime(snapshot: YouTubeTimelineState, serverOffsetMs: number): number {
  if (!snapshot.playing) return snapshot.currentTime;
  const elapsedMs = Date.now() - (snapshot.updatedAt + serverOffsetMs);
  return clampTime(snapshot.currentTime + (elapsedMs / 1000) * snapshot.playbackRate);
}

export function useYouTubeTimelineSync({
  roomId,
  enabled,
  isReady,
  getCurrentTime,
  remotePlay,
  remotePause,
  remoteSeek,
  setPlaybackRate,
}: UseYouTubeTimelineSyncOptions) {
  const timelineRef = useRef<YouTubeTimelineState | null>(null);
  const pendingTimelineRef = useRef<YouTubeTimelineState | null>(null);
  const serverOffsetMsRef = useRef(0);
  const lastAppliedRevisionRef = useRef(-1);
  const suppressLocalEventsUntilRef = useRef(0);
  const settleCorrectionUntilRef = useRef(0);
  const lastSeekAtRef = useRef(0);
  const lastRateRef = useRef(1);

  const setRateSafely = useCallback((rate: number) => {
    if (Math.abs(lastRateRef.current - rate) < 0.001) return;
    lastRateRef.current = rate;
    setPlaybackRate(rate);
  }, [setPlaybackRate]);

  const applyTimelineSnapshot = useCallback((snapshot: YouTubeTimelineState) => {
    if (!enabled) return;
    if (!isReady) {
      pendingTimelineRef.current = snapshot;
      return;
    }
    if (snapshot.revision < lastAppliedRevisionRef.current) return;

    lastAppliedRevisionRef.current = snapshot.revision;
    timelineRef.current = snapshot;
    pendingTimelineRef.current = null;
    serverOffsetMsRef.current = Date.now() - snapshot.serverNow;
    suppressLocalEventsUntilRef.current = Date.now() + REMOTE_SUPPRESS_MS;
    settleCorrectionUntilRef.current = Date.now() + LOAD_SETTLE_MS;
    setRateSafely(1);

    const targetTime = expectedTime(snapshot, serverOffsetMsRef.current);
    const localTime = getCurrentTime();
    const drift = Math.abs(localTime - targetTime);

    if (snapshot.playing) {
      if (drift > SOFT_DRIFT_SECONDS) {
        remoteSeek(targetTime);
        lastSeekAtRef.current = Date.now();
      }
      remotePlay(targetTime);
    } else {
      remotePause(targetTime);
      if (drift > SOFT_DRIFT_SECONDS) {
        remoteSeek(targetTime);
        lastSeekAtRef.current = Date.now();
      }
    }
  }, [enabled, getCurrentTime, isReady, remotePause, remotePlay, remoteSeek, setRateSafely]);

  useEffect(() => {
    if (!enabled || !isReady || !pendingTimelineRef.current) return;
    applyTimelineSnapshot(pendingTimelineRef.current);
  }, [applyTimelineSnapshot, enabled, isReady]);

  const requestTimeline = useCallback(() => {
    if (!enabled) return;
    socket.emit('youtube-request-timeline', { roomId });
  }, [enabled, roomId]);

  const emitIntent = useCallback((type: 'play' | 'pause' | 'seek', currentTime: number) => {
    if (!enabled) return;
    const now = Date.now();
    if (now < suppressLocalEventsUntilRef.current) return;
    settleCorrectionUntilRef.current = now + LOCAL_SETTLE_MS;
    setRateSafely(1);
    socket.emit('youtube-intent', {
      roomId,
      type,
      currentTime: clampTime(currentTime),
      clientSentAt: now,
      playbackRate: 1,
    });
  }, [enabled, roomId, setRateSafely]);

  const handleLocalPlay = useCallback((currentTime: number) => {
    emitIntent('play', currentTime);
  }, [emitIntent]);

  const handleLocalPause = useCallback((currentTime: number) => {
    emitIntent('pause', currentTime);
  }, [emitIntent]);

  const handleLocalSeek = useCallback((currentTime: number) => {
    emitIntent('seek', currentTime);
  }, [emitIntent]);

  useEffect(() => {
    if (!enabled || !isReady) return;
    const id = setInterval(() => {
      const snapshot = timelineRef.current;
      if (!snapshot) return;
      if (Date.now() < settleCorrectionUntilRef.current) return;

      const targetTime = expectedTime(snapshot, serverOffsetMsRef.current);
      const localTime = getCurrentTime();
      const drift = targetTime - localTime;
      const absDrift = Math.abs(drift);

      if (!snapshot.playing) {
        setRateSafely(1);
        if (absDrift > SEEK_DRIFT_SECONDS && Date.now() - lastSeekAtRef.current > SEEK_COOLDOWN_MS) {
          remoteSeek(targetTime);
          lastSeekAtRef.current = Date.now();
        }
        return;
      }

      if (absDrift < SOFT_DRIFT_SECONDS) {
        setRateSafely(1);
        return;
      }

      if (absDrift >= SEEK_DRIFT_SECONDS && Date.now() - lastSeekAtRef.current > SEEK_COOLDOWN_MS) {
        setRateSafely(1);
        remoteSeek(targetTime);
        lastSeekAtRef.current = Date.now();
        settleCorrectionUntilRef.current = Date.now() + REMOTE_SUPPRESS_MS;
        return;
      }

      const rate = absDrift < RATE_DRIFT_SECONDS
        ? (drift > 0 ? 1.03 : 0.97)
        : (drift > 0 ? 1.08 : 0.92);
      setRateSafely(rate);
    }, CORRECTION_INTERVAL_MS);

    return () => {
      clearInterval(id);
      setRateSafely(1);
    };
  }, [enabled, getCurrentTime, isReady, remoteSeek, setRateSafely]);

  useEffect(() => {
    if (!enabled) {
      timelineRef.current = null;
      pendingTimelineRef.current = null;
      lastAppliedRevisionRef.current = -1;
      setRateSafely(1);
    }
  }, [enabled, setRateSafely]);

  return {
    applyTimelineSnapshot,
    handleLocalPlay,
    handleLocalPause,
    handleLocalSeek,
    requestTimeline,
  };
}
