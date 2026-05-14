import { useState, useCallback } from 'react';

type WatchedMap = Record<string, true>;

/**
 * Tracks which episodes a user has watched in a specific room.
 * State is backed by `localStorage` so it persists across page reloads.
 *
 * @param roomId - The room ID (used as part of the storage key).
 * @param username - The user's username (used as part of the storage key).
 * @returns `{ isWatched, markWatched, resetProgress, getSeasonProgress }`
 */
export function useWatchProgress(roomId: string, username: string) {
    const STORAGE_KEY = `watchjunto_watched_${roomId}_${username}`;

    const [watched, setWatched] = useState<WatchedMap>(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WatchedMap;
        } catch {
            return {};
        }
    });

    /** Returns `true` if the episode has been marked as watched. */
    const isWatched = useCallback(
        (serieId: string, temporada: number, capituloNumero: number): boolean => {
            return !!watched[`${serieId}-${temporada}-${capituloNumero}`];
        },
        [watched],
    );

    /** Marks an episode as watched and persists the change to `localStorage`. */
    const markWatched = useCallback(
        (serieId: string, temporada: number, capituloNumero: number): void => {
            const key = `${serieId}-${temporada}-${capituloNumero}`;
            const newMap: WatchedMap = { ...watched, [key]: true };
            setWatched(newMap);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
            } catch {
                // localStorage may be unavailable (private mode, quota exceeded, etc.)
            }
        },
        [watched, STORAGE_KEY],
    );

    /** Removes all watched entries for a serie from state and `localStorage`. */
    const resetProgress = useCallback(
        (serieId: string): void => {
            const prefix = `${serieId}-`;
            const newMap: WatchedMap = Object.fromEntries(
                Object.entries(watched).filter(([k]) => !k.startsWith(prefix)),
            ) as WatchedMap;
            setWatched(newMap);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
            } catch {
                // ignore
            }
        },
        [watched, STORAGE_KEY],
    );

    /** Returns the number of watched episodes in the given season. */
    const getSeasonProgress = useCallback(
        (serieId: string, temporada: number, _total: number): number => {
            const prefix = `${serieId}-${temporada}-`;
            return Object.keys(watched).filter((k) => k.startsWith(prefix)).length;
        },
        [watched],
    );

    return { isWatched, markWatched, resetProgress, getSeasonProgress };
}

/**
 * Clears watch progress for a given serie across all specified rooms.
 * Operates directly on `localStorage` — safe to call outside React components.
 *
 * @param serieId - The serie slug to reset.
 * @param username - The user whose progress to clear.
 * @param roomIds - List of room IDs to clear progress in.
 */
export function resetProgressAllRooms(
    serieId: string,
    username: string,
    roomIds: string[],
): void {
    const prefix = `${serieId}-`;
    for (const roomId of roomIds) {
        const key = `watchjunto_watched_${roomId}_${username}`;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const map = JSON.parse(raw) as Record<string, true>;
            const cleaned = Object.fromEntries(
                Object.entries(map).filter(([k]) => !k.startsWith(prefix)),
            );
            localStorage.setItem(key, JSON.stringify(cleaned));
        } catch {
            // ignore per-room errors
        }
    }
}
