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
