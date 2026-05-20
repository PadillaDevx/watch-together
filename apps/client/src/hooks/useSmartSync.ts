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

const DRIFT_IGNORE = 2;   // seconds — ignore drifts smaller than this
const DRIFT_SILENT = 5;   // seconds — seek silently below this threshold
const HEARTBEAT_INTERVAL = 15_000; // ms

export function useSmartSync({
  iframeRef,
  roomId,
  isHost,
  enabled,
}: UseSmartSyncOptions) {
  const hostTimeRef = useRef<number>(0);
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
          socket.emit('player-action', {
            roomId,
            action: 'seek',
            currentTime,
            timestamp: Date.now(),
          });
        } else {
          // Drift correction for non-hosts
          const diff = Math.abs(currentTime - hostTimeRef.current);
          if (diff >= DRIFT_IGNORE) {
            silentSeek(hostTimeRef.current, diff);
          }
        }
      } else if (type === 'play' && typeof currentTime === 'number') {
        // Free-for-all: any authenticated participant can play.
        socket.emit('player-action', { roomId, action: 'play', currentTime, timestamp: Date.now() });
      } else if (type === 'pause' && typeof currentTime === 'number') {
        // Free-for-all: any authenticated participant can pause.
        socket.emit('player-action', { roomId, action: 'pause', currentTime, timestamp: Date.now() });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [enabled, iframeRef, roomId, isHost, silentSeek]);

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

  // Receive sync from host
  const onPlayerSync = useCallback((data: { action: string; currentTime: number }) => {
    if (!enabled || isHost) return;
    hostTimeRef.current = data.currentTime;
    if (data.action === 'play') sendToPlayer('play', data.currentTime);
    else if (data.action === 'pause') sendToPlayer('pause', data.currentTime);
    else if (data.action === 'seek') sendToPlayer('seek', data.currentTime);
  }, [enabled, isHost, sendToPlayer]);

  const requestResync = useCallback(() => {
    socket.emit('request-sync', { roomId });
  }, [roomId]);

  return { registerSpinnerCallback, sendToPlayer, onPlayerSync, requestResync };
}
