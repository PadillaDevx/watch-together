/// <reference types="vitest/globals" />
import { act, renderHook } from '@testing-library/react';
import { useYouTubeTimelineSync } from '../useYouTubeTimelineSync';
import { socket } from '../../lib/socket';
import type { YouTubeTimelineState } from '../../lib/socket-types';

vi.mock('../../lib/socket', () => ({
  socket: {
    emit: vi.fn(),
  },
}));

function makeSnapshot(overrides: Partial<YouTubeTimelineState> = {}): YouTubeTimelineState {
  return {
    videoId: 'abc123abc12',
    playing: true,
    currentTime: 10,
    updatedAt: 1_000,
    serverNow: 1_000,
    playbackRate: 1,
    revision: 1,
    reason: 'intent',
    ...overrides,
  };
}

function renderTimeline(getCurrentTime = vi.fn(() => 10)) {
  const controls = {
    getCurrentTime,
    remotePlay: vi.fn(),
    remotePause: vi.fn(),
    remoteSeek: vi.fn(),
    setPlaybackRate: vi.fn(),
  };
  const hook = renderHook(() =>
    useYouTubeTimelineSync({
      roomId: 'room-1',
      enabled: true,
      isReady: true,
      ...controls,
    }),
  );
  return { ...hook, controls };
}

describe('useYouTubeTimelineSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi.mocked(socket.emit).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses local echoes immediately after applying a remote timeline', () => {
    const { result } = renderTimeline();

    act(() => {
      result.current.applyTimelineSnapshot(makeSnapshot());
      result.current.handleLocalPlay(10);
    });

    expect(socket.emit).not.toHaveBeenCalledWith(
      'youtube-intent',
      expect.anything(),
    );
  });

  it('uses playbackRate for microdrift instead of seeking', () => {
    const { result, controls } = renderTimeline(vi.fn(() => 10.8));

    act(() => {
      result.current.applyTimelineSnapshot(makeSnapshot());
    });
    controls.remoteSeek.mockClear();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(controls.setPlaybackRate).toHaveBeenLastCalledWith(1.03);
    expect(controls.remoteSeek).not.toHaveBeenCalled();
  });

  it('uses cooldown-protected seek for severe drift', () => {
    const { result, controls } = renderTimeline(vi.fn(() => 2));

    act(() => {
      result.current.applyTimelineSnapshot(makeSnapshot());
    });
    controls.remoteSeek.mockClear();

    act(() => {
      vi.advanceTimersByTime(3_750);
    });

    expect(controls.remoteSeek).toHaveBeenCalledWith(expect.any(Number));
    controls.remoteSeek.mockClear();

    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(controls.remoteSeek).not.toHaveBeenCalled();
  });
});
