import { useState, useCallback } from 'react';

type WatchedMap = Record<string, true>;

export function useWatchProgress(roomId: string, username: string) {
  const STORAGE_KEY = `watchjunto_watched_${roomId}_${username}`;

  const [watched, setWatched] = useState<WatchedMap>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WatchedMap;
    } catch {
      return {};
    }
  });

  const isWatched = useCallback(
    (serieId: string, temporada: number, capituloNumero: number): boolean => {
      return !!watched[`${serieId}-${temporada}-${capituloNumero}`];
    },
    [watched],
  );

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

  const getSeasonProgress = useCallback(
    (serieId: string, temporada: number, _total: number): number => {
      const prefix = `${serieId}-${temporada}-`;
      return Object.keys(watched).filter((k) => k.startsWith(prefix)).length;
    },
    [watched],
  );

  return { isWatched, markWatched, resetProgress, getSeasonProgress };
}

/** Standalone (non-hook) utility to clear progress for a serie across multiple rooms */
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
