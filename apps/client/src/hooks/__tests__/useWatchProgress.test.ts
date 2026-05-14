/// <reference types="vitest/globals" />
import { renderHook, act } from '@testing-library/react';
import { useWatchProgress, resetProgressAllRooms } from '../useWatchProgress';

const ROOM = 'room1';
const USER = 'alice';
const STORAGE_KEY = `watchjunto_watched_${ROOM}_${USER}`;

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function getStored(key: string = STORAGE_KEY): Record<string, true> {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, true>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWatchProgress', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('isWatched() returns false for an unwatched episode', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));
        expect(result.current.isWatched('serie1', 1, 1)).toBe(false);
    });

    it('markWatched() stores the episode in state and in localStorage', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));

        act(() => {
            result.current.markWatched('serie1', 1, 1);
        });

        // React state
        expect(result.current.isWatched('serie1', 1, 1)).toBe(true);

        // localStorage
        expect(getStored()['serie1-1-1']).toBe(true);
    });

    it('isWatched() returns true after markWatched()', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));

        act(() => {
            result.current.markWatched('serie1', 2, 5);
        });

        expect(result.current.isWatched('serie1', 2, 5)).toBe(true);
    });

    it('resetProgress() clears all episodes for a serie and leaves other series intact', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));

        // Mark episodes for two different series (separate acts to avoid stale closure)
        act(() => { result.current.markWatched('serie1', 1, 1); });
        act(() => { result.current.markWatched('serie1', 1, 2); });
        act(() => { result.current.markWatched('serie2', 1, 1); });

        // Reset only serie1
        act(() => {
            result.current.resetProgress('serie1');
        });

        expect(result.current.isWatched('serie1', 1, 1)).toBe(false);
        expect(result.current.isWatched('serie1', 1, 2)).toBe(false);
        // serie2 must remain untouched
        expect(result.current.isWatched('serie2', 1, 1)).toBe(true);
    });

    it('getSeasonProgress() returns the correct watched count for a season', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));

        act(() => { result.current.markWatched('serie1', 1, 1); });
        act(() => { result.current.markWatched('serie1', 1, 2); });
        act(() => { result.current.markWatched('serie1', 2, 1); });

        // Season 1 has 2 watched episodes
        expect(result.current.getSeasonProgress('serie1', 1, 3)).toBe(2);
        // Season 2 has 1 watched episode
        expect(result.current.getSeasonProgress('serie1', 2, 1)).toBe(1);
        // Season 3 has 0 watched episodes
        expect(result.current.getSeasonProgress('serie1', 3, 5)).toBe(0);
    });

    it('initializes with empty state when localStorage.getItem throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
            throw new Error('localStorage access denied');
        });

        const { result } = renderHook(() => useWatchProgress(ROOM, USER));
        expect(result.current.isWatched('serie1', 1, 1)).toBe(false);

        vi.restoreAllMocks();
    });

    it('markWatched() does not throw when localStorage.setItem throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new Error('quota exceeded');
        });

        const { result } = renderHook(() => useWatchProgress(ROOM, USER));

        expect(() => {
            act(() => { result.current.markWatched('serie1', 1, 1); });
        }).not.toThrow();

        // State still updated in-memory even if localStorage failed
        expect(result.current.isWatched('serie1', 1, 1)).toBe(true);

        vi.restoreAllMocks();
    });

    it('resetProgress() does not throw when localStorage.setItem throws', () => {
        const { result } = renderHook(() => useWatchProgress(ROOM, USER));
        act(() => { result.current.markWatched('serie1', 1, 1); });

        vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new Error('quota exceeded');
        });

        expect(() => {
            act(() => { result.current.resetProgress('serie1'); });
        }).not.toThrow();

        vi.restoreAllMocks();
    });
});

// ---------------------------------------------------------------------------
// resetProgressAllRooms (standalone utility)
// ---------------------------------------------------------------------------

describe('resetProgressAllRooms()', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('clears the target serie across multiple storage keys while leaving other series intact', () => {
        const key1 = 'watchjunto_watched_room1_alice';
        const key2 = 'watchjunto_watched_room2_alice';

        localStorage.setItem(key1, JSON.stringify({ 'serie1-1-1': true, 'serie2-1-1': true }));
        localStorage.setItem(key2, JSON.stringify({ 'serie1-1-1': true }));

        resetProgressAllRooms('serie1', 'alice', ['room1', 'room2']);

        const room1 = getStored(key1);
        const room2 = getStored(key2);

        // serie1 entries removed in both rooms
        expect(room1['serie1-1-1']).toBeUndefined();
        expect(room2['serie1-1-1']).toBeUndefined();

        // serie2 entry in room1 must remain
        expect(room1['serie2-1-1']).toBe(true);
    });

    it('does not modify keys that do not exist in localStorage', () => {
        // room3 has no stored key — should not throw
        expect(() => {
            resetProgressAllRooms('serie1', 'alice', ['room3']);
        }).not.toThrow();
    });

    it('handles localStorage errors per-room without aborting other rooms', () => {
        const key1 = 'watchjunto_watched_room1_alice';
        localStorage.setItem(key1, JSON.stringify({ 'serie1-1-1': true }));

        // Make setItem throw only once (for room1)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new Error('quota exceeded');
        });

        expect(() => {
            resetProgressAllRooms('serie1', 'alice', ['room1']);
        }).not.toThrow();

        vi.restoreAllMocks();
    });
});
