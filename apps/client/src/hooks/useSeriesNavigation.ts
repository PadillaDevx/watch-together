import { useMemo, useCallback } from 'react';
import type { LibrarySerieDetail, LibraryEpisodio } from '../types';

interface UseSeriesNavigationParams {
  serieDetail: LibrarySerieDetail | null;
  selectedTemporada: number | null;
  selectedEpisodioIndex: number | null;
}

interface NavigationResult {
  temporada: number;
  episodioIndex: number;
  episodio: LibraryEpisodio;
}

/**
 * Computes next/previous episode navigation for a series room.
 *
 * @param params.serieDetail - Currently loaded serie with all seasons/episodes.
 * @param params.selectedTemporada - Active season number.
 * @param params.selectedEpisodioIndex - Active episode index within the season.
 * @returns `{ hasNext, getNext, hasPrev, getPrev }`
 */
export function useSeriesNavigation({
  serieDetail,
  selectedTemporada,
  selectedEpisodioIndex,
}: UseSeriesNavigationParams) {
  const sortedTemporadas = useMemo(
    () => [...(serieDetail?.temporadas ?? [])].sort((a, b) => a.temporada - b.temporada),
    [serieDetail],
  );

  /** Returns the next episode across seasons, or `null` if at the end of the series. */
  const getNext = useCallback((): NavigationResult | null => {
    if (!serieDetail || selectedTemporada === null || selectedEpisodioIndex === null) {
      return null;
    }

    const currentTemp = sortedTemporadas.find((t) => t.temporada === selectedTemporada);
    if (!currentTemp) return null;

    // Next episode in same season
    const nextIndex = selectedEpisodioIndex + 1;
    if (nextIndex < currentTemp.episodios.length) {
      return {
        temporada: selectedTemporada,
        episodioIndex: nextIndex,
        episodio: currentTemp.episodios[nextIndex],
      };
    }

    // First episode of next season
    const currentTempIndex = sortedTemporadas.indexOf(currentTemp);
    const nextTemp = sortedTemporadas[currentTempIndex + 1];
    if (nextTemp && nextTemp.episodios.length > 0) {
      return {
        temporada: nextTemp.temporada,
        episodioIndex: 0,
        episodio: nextTemp.episodios[0],
      };
    }

    return null;
  }, [sortedTemporadas, selectedTemporada, selectedEpisodioIndex, serieDetail]);

  /** Returns the previous episode across seasons, or `null` if at the start of the series. */
  const getPrev = useCallback((): NavigationResult | null => {
    if (!serieDetail || selectedTemporada === null || selectedEpisodioIndex === null) {
      return null;
    }

    const currentTemp = sortedTemporadas.find((t) => t.temporada === selectedTemporada);
    if (!currentTemp) return null;

    // Previous episode in same season
    const prevIndex = selectedEpisodioIndex - 1;
    if (prevIndex >= 0) {
      return {
        temporada: selectedTemporada,
        episodioIndex: prevIndex,
        episodio: currentTemp.episodios[prevIndex],
      };
    }

    // Last episode of previous season
    const currentTempIndex = sortedTemporadas.indexOf(currentTemp);
    const prevTemp = sortedTemporadas[currentTempIndex - 1];
    if (prevTemp && prevTemp.episodios.length > 0) {
      const lastIndex = prevTemp.episodios.length - 1;
      return {
        temporada: prevTemp.temporada,
        episodioIndex: lastIndex,
        episodio: prevTemp.episodios[lastIndex],
      };
    }

    return null;
  }, [sortedTemporadas, selectedTemporada, selectedEpisodioIndex, serieDetail]);

  const hasNext = useMemo(() => getNext() !== null, [getNext]);
  const hasPrev = useMemo(() => getPrev() !== null, [getPrev]);

  return { hasNext, getNext, hasPrev, getPrev };
}
