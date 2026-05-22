import { useEffect, useRef, useCallback } from 'react';
import { socket } from '../lib/socket';

/**
 * Smart sync hook for providers that expose a postMessage API (HTML5 video,
 * Plyr, custom WatchJunto provider, etc.).
 *
 * Playback control model — free-for-all
 * --------------------------------------
 * Per the host-takeover spec (see `docs/playback-control-model.md`), ANY
 * authenticated participant can drive playback. Concretely:
 *
 *   • `play` / `pause` postMessage events from the iframe are broadcast
 *     via `socket.emit('player-action', …)` regardless of `isHost`. The
 *     server validates auth, not host role.
 *   • Manual seeks performed by a non-host bubble up through the same
 *     `play` / `pause` emit path (the iframe re-fires `play` with the new
 *     time after a scrub).
 *
 * Role of `isHost`
 * ----------------
 * `isHost` is NOT a permission gate — it selects the role this client plays
 * in continuous drift correction:
 *
 *   • The current host is the drift *reference*: it broadcasts its
 *     `timeupdate` position as `action: 'seek'` so every other peer can
 *     silently correct drift towards it.
 *   • Non-hosts apply drift correction towards the reference and never
 *     broadcast their own `timeupdate` position (this avoids an O(N²)
 *     emit storm and a feedback loop, since drift correction itself
 *     triggers `timeupdate` events).
 *   • The heartbeat (15 s `getTime` poll into the iframe) is also a host
 *     role: it forces a `timeupdate` so reference broadcasts keep flowing
 *     during idle playback.
 *
 * Because host is dynamic (`host-changed` event), the reference role
 * automatically migrates with the host without any extra wiring.
 */
interface UseSmartSyncOptions {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  roomId: string;
  /** Whether this client currently holds the host role. Selects the drift
   *  broadcaster, NOT a permission gate for play/pause/seek emits. */
  isHost: boolean;
  enabled: boolean;
}

const DRIFT_IGNORE = 0.5; // seconds — ignore drifts smaller than this
const DRIFT_SILENT = 5;   // seconds — seek silently below this threshold
const HEARTBEAT_INTERVAL = 15_000; // ms
const PLAY_SCHEDULE_MS = 1500; // ms — must match server constant
const SEEK_BROADCAST_INTERVAL = 4_000; // ms — throttle host seek emits

export function useSmartSync({
  iframeRef,
  roomId,
  isHost,
  enabled,
}: UseSmartSyncOptions) {
  const hostTimeRef = useRef<number>(0);
  const hostTimeUpdatedAtRef = useRef<number>(0);
  const hostIsPlayingRef = useRef<boolean>(false);
  const syncReceivedRef = useRef<boolean>(false);
  const lastSeekBroadcastRef = useRef<number>(0);
  const playScheduleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const showSpinnerRef = useRef<((show: boolean) => void)>(() => {});
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const registerSpinnerCallback = useCallback((cb: (show: boolean) => void) => {
    showSpinnerRef.current = cb;
  }, []);

  const sendToPlayer = useCallback((command: string, value?: number) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: command, value, source: 'watchjunto' },
      '*',
    );
  }, [iframeRef]);

  const silentSeek = useCallback((targetTime: number, diff: number) => {
    sendToPlayer('seek', targetTime);
    if (diff > DRIFT_SILENT) {
      clearTimeout(spinnerTimerRef.current);
      showSpinnerRef.current(true);
      spinnerTimerRef.current = setTimeout(() => {
        showSpinnerRef.current(false);
      }, 1000);
    }
  }, [sendToPlayer]);

  // Listen to iframe postMessage events
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const { type, currentTime } = e.data as { type?: string; currentTime?: number };

      if (type === 'timeupdate' && typeof currentTime === 'number') {
        // Host = drift reference. See module JSDoc — this is role selection,
        // not a permission gate. Non-hosts converge silently towards the
        // host's broadcast position.
        if (isHost) {
          const now = Date.now();
          if (now - lastSeekBroadcastRef.current >= SEEK_BROADCAST_INTERVAL) {
            lastSeekBroadcastRef.current = now;
            socket.emit('player-action', {
              roomId,
              action: 'seek',
              currentTime,
              timestamp: now,
            });
          }
        } else {
          // Drift correction for non-hosts — skip until first sync event received
          if (!syncReceivedRef.current) return;
          const elapsed = hostIsPlayingRef.current ? (Date.now() - hostTimeUpdatedAtRef.current) / 1000 : 0;
          const estimatedHostTime = hostTimeRef.current + elapsed;
          const diff = Math.abs(currentTime - estimatedHostTime);
          if (diff >= DRIFT_IGNORE) {
            silentSeek(estimatedHostTime, diff);
          }
        }
      } else if (type === 'play' && typeof currentTime === 'number') {
        // Force seek first so providers don't resume from a cached position
        sendToPlayer('seek', currentTime);
        // Free-for-all: any authenticated participant can play.
        socket.emit('player-action', { roomId, action: 'play', currentTime, timestamp: Date.now() });
      } else if (type === 'pause' && typeof currentTime === 'number') {
        // Free-for-all: any authenticated participant can pause.
        socket.emit('player-action', { roomId, action: 'pause', currentTime, timestamp: Date.now() });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [enabled, iframeRef, roomId, isHost, silentSeek, sendToPlayer]);

  // Heartbeat: host broadcasts every 15s so viewers stay in sync
  useEffect(() => {
    if (!enabled || !isHost) return;

    const id = setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'getTime', source: 'watchjunto' },
        '*',
      );
    }, HEARTBEAT_INTERVAL);

    return () => clearInterval(id);
  }, [enabled, isHost, iframeRef]);

  // Cleanup scheduled play timers on unmount
  useEffect(() => {
    return () => { clearTimeout(playScheduleTimerRef.current); };
  }, []);

  // Reset syncReceivedRef when hook is disabled (e.g. navigating away)
  useEffect(() => {
    if (!enabled) { syncReceivedRef.current = false; }
  }, [enabled]);

  // Receive sync from host
  const onPlayerSync = useCallback((data: { action: string; currentTime: number; playAt?: number }) => {
    if (!enabled || isHost) return;
    hostTimeRef.current = data.currentTime;
    hostTimeUpdatedAtRef.current = Date.now();
    syncReceivedRef.current = true;

    if (data.action === 'play') {
      hostIsPlayingRef.current = true;
      // Force seek to target before scheduled play — prevents providers from
      // resuming from a cached/localStorage position
      sendToPlayer('seek', data.currentTime);
      const msUntilPlay = data.playAt ? data.playAt - Date.now() : 0;
      clearTimeout(playScheduleTimerRef.current);
      playScheduleTimerRef.current = setTimeout(() => {
        sendToPlayer('play', data.currentTime);
      }, Math.max(0, msUntilPlay));
    } else if (data.action === 'pause') {
      hostIsPlayingRef.current = false;
      sendToPlayer('pause', data.currentTime);
    } else if (data.action === 'seek') {
      hostIsPlayingRef.current = true;
      // Only update reference — drift correction in postMessage handler handles actual seek
    }
  }, [enabled, isHost, sendToPlayer]);

  const requestResync = useCallback(() => {
    socket.emit('request-sync', { roomId });
  }, [roomId]);

  return { registerSpinnerCallback, sendToPlayer, onPlayerSync, requestResync };
}
