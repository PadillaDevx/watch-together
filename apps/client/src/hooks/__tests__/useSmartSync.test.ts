/// <reference types="vitest/globals" />
import { renderHook } from '@testing-library/react';
import { useSmartSync } from '../useSmartSync';
import { socket } from '../../lib/socket';

// ---------------------------------------------------------------------------
// Mock the socket singleton — every test inspects `emit`.
// ---------------------------------------------------------------------------
vi.mock('../../lib/socket', () => ({
  socket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an iframeRef whose contentWindow is a deterministic stand-in. The
 * postMessage handler installed by `useSmartSync` only fires when
 * `e.source === iframeRef.current.contentWindow`, so we reuse the same
 * object when dispatching synthetic MessageEvents below.
 */
function makeIframeRef() {
  const contentWindow = { postMessage: vi.fn() } as unknown as Window;
  const iframe = { contentWindow } as unknown as HTMLIFrameElement;
  return { current: iframe } as React.RefObject<HTMLIFrameElement>;
}

function dispatchProviderMessage(
  source: Window,
  data: { type: string; currentTime?: number },
) {
  // Construct a MessageEvent without relying on the constructor's `source`
  // option (jsdom ignores it). We override the getter directly.
  const ev = new MessageEvent('message', { data });
  Object.defineProperty(ev, 'source', { value: source, configurable: true });
  window.dispatchEvent(ev);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSmartSync — free-for-all playback control', () => {
  beforeEach(() => {
    vi.mocked(socket.emit).mockClear();
  });

  it('emits player-action "play" when a NON-host user clicks play in the iframe', () => {
    const iframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-1', isHost: false, enabled: true }),
    );

    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'play',
      currentTime: 42,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'player-action',
      expect.objectContaining({
        roomId: 'room-1',
        action: 'play',
        currentTime: 42,
      }),
    );
  });

  it('emits player-action "pause" when a NON-host user pauses', () => {
    const iframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-2', isHost: false, enabled: true }),
    );

    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'pause',
      currentTime: 17,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'player-action',
      expect.objectContaining({
        roomId: 'room-2',
        action: 'pause',
        currentTime: 17,
      }),
    );
  });

  it('emits player-action "play" when the host clicks play (host has no special gate)', () => {
    const iframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-3', isHost: true, enabled: true }),
    );

    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'play',
      currentTime: 5,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'player-action',
      expect.objectContaining({ action: 'play', currentTime: 5 }),
    );
  });

  it('only the host broadcasts continuous timeupdate as the drift reference (non-hosts stay silent)', () => {
    // Non-host: should NOT emit on timeupdate (drift-correction only).
    const iframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-4', isHost: false, enabled: true }),
    );
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 10,
    });
    expect(socket.emit).not.toHaveBeenCalled();

    // Host: SHOULD emit timeupdate as seek (drift reference).
    vi.mocked(socket.emit).mockClear();
    const hostIframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({
        iframeRef: hostIframeRef,
        roomId: 'room-4',
        isHost: true,
        enabled: true,
      }),
    );
    dispatchProviderMessage(hostIframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 10,
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'player-action',
      expect.objectContaining({ action: 'seek', currentTime: 10 }),
    );
  });

  it('does NOT emit when the hook is disabled, even for the host', () => {
    const iframeRef = makeIframeRef();
    renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-5', isHost: true, enabled: false }),
    );

    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'play',
      currentTime: 1,
    });

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('requestResync emits "request-sync" with the room id regardless of host status', () => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-6', isHost: false, enabled: true }),
    );

    result.current.requestResync();

    expect(socket.emit).toHaveBeenCalledWith('request-sync', { roomId: 'room-6' });
  });
});

describe('useSmartSync — drift correction on non-host (M2)', () => {
  beforeEach(() => {
    vi.mocked(socket.emit).mockClear();
  });

  it('silently seeks the iframe towards the host reference when drift >= 2s', () => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-d1', isHost: false, enabled: true }),
    );

    // Prime the host reference via onPlayerSync
    result.current.onPlayerSync({ action: 'seek', currentTime: 100 });
    // Clear postMessage calls triggered by onPlayerSync's sendToPlayer('seek', 100)
    const postMessage = iframeRef.current!.contentWindow!.postMessage as ReturnType<typeof vi.fn>;
    postMessage.mockClear();

    // Drift of 3s (>= DRIFT_IGNORE=2) → silent seek towards 100
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 103,
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'seek', value: 100, source: 'watchjunto' },
      '*',
    );
    // Non-host must never emit a player-action from timeupdate
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('ignores drifts strictly below DRIFT_IGNORE (no seek)', () => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-d2', isHost: false, enabled: true }),
    );

    result.current.onPlayerSync({ action: 'seek', currentTime: 50 });
    const postMessage = iframeRef.current!.contentWindow!.postMessage as ReturnType<typeof vi.fn>;
    postMessage.mockClear();

    // Drift of 1s → ignore
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 51,
    });

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('shows the spinner when drift > DRIFT_SILENT (5s) and hides it after 1s', () => {
    vi.useFakeTimers();
    try {
      const iframeRef = makeIframeRef();
      const { result } = renderHook(() =>
        useSmartSync({ iframeRef, roomId: 'room-d3', isHost: false, enabled: true }),
      );

      const spinner = vi.fn();
      result.current.registerSpinnerCallback(spinner);
      result.current.onPlayerSync({ action: 'seek', currentTime: 30 });

      // Drift of 7s → silent seek + spinner ON
      dispatchProviderMessage(iframeRef.current!.contentWindow!, {
        type: 'timeupdate',
        currentTime: 37,
      });

      expect(spinner).toHaveBeenCalledWith(true);
      expect(spinner).not.toHaveBeenCalledWith(false);

      // After 1s the spinner should auto-hide
      vi.advanceTimersByTime(1000);
      expect(spinner).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useSmartSync — onPlayerSync bridge (M3)', () => {
  beforeEach(() => {
    vi.mocked(socket.emit).mockClear();
  });

  it.each([
    ['play' as const, 'play' as const],
    ['pause' as const, 'pause' as const],
    ['seek' as const, 'seek' as const],
  ])('forwards server "%s" actions into the iframe via postMessage (non-host)', (action, expected) => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-s1', isHost: false, enabled: true }),
    );

    result.current.onPlayerSync({ action, currentTime: 42 });

    expect(iframeRef.current!.contentWindow!.postMessage).toHaveBeenCalledWith(
      { type: expected, value: 42, source: 'watchjunto' },
      '*',
    );
  });

  it('does NOT forward player-sync into the iframe when this client is the host (avoid echo)', () => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-s2', isHost: true, enabled: true }),
    );

    result.current.onPlayerSync({ action: 'play', currentTime: 12 });

    expect(iframeRef.current!.contentWindow!.postMessage).not.toHaveBeenCalled();
  });

  it('does NOT forward player-sync when the hook is disabled', () => {
    const iframeRef = makeIframeRef();
    const { result } = renderHook(() =>
      useSmartSync({ iframeRef, roomId: 'room-s3', isHost: false, enabled: false }),
    );

    result.current.onPlayerSync({ action: 'play', currentTime: 12 });

    expect(iframeRef.current!.contentWindow!.postMessage).not.toHaveBeenCalled();
  });
});

describe('useSmartSync — heartbeat (M4)', () => {
  it('host emits a getTime postMessage every HEARTBEAT_INTERVAL (15s)', () => {
    vi.useFakeTimers();
    try {
      const iframeRef = makeIframeRef();
      renderHook(() =>
        useSmartSync({ iframeRef, roomId: 'room-h1', isHost: true, enabled: true }),
      );

      vi.advanceTimersByTime(15_000);

      expect(iframeRef.current!.contentWindow!.postMessage).toHaveBeenCalledWith(
        { type: 'getTime', source: 'watchjunto' },
        '*',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('non-host never runs the heartbeat', () => {
    vi.useFakeTimers();
    try {
      const iframeRef = makeIframeRef();
      renderHook(() =>
        useSmartSync({ iframeRef, roomId: 'room-h2', isHost: false, enabled: true }),
      );

      vi.advanceTimersByTime(60_000);

      expect(iframeRef.current!.contentWindow!.postMessage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useSmartSync — host migration mid-playback (M5)', () => {
  beforeEach(() => {
    vi.mocked(socket.emit).mockClear();
  });

  it('promotes the drift-reference role when isHost flips false → true → false', () => {
    const iframeRef = makeIframeRef();
    const { rerender } = renderHook(
      ({ isHost }) =>
        useSmartSync({ iframeRef, roomId: 'room-m1', isHost, enabled: true }),
      { initialProps: { isHost: false } },
    );

    // Phase 1: non-host → no emit on timeupdate
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 5,
    });
    expect(socket.emit).not.toHaveBeenCalled();

    // Phase 2: promoted to host → timeupdate broadcasts as seek
    rerender({ isHost: true });
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 10,
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'player-action',
      expect.objectContaining({ action: 'seek', currentTime: 10 }),
    );

    // Phase 3: demoted back to non-host → silent again
    vi.mocked(socket.emit).mockClear();
    rerender({ isHost: false });
    dispatchProviderMessage(iframeRef.current!.contentWindow!, {
      type: 'timeupdate',
      currentTime: 15,
    });
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
