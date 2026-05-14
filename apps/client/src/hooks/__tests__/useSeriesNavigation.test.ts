/// <reference types="vitest/globals" />
import { renderHook } from '@testing-library/react';
import { useSeriesNavigation } from '../useSeriesNavigation';
import type { LibrarySerieDetail } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ep = (capitulo_numero: number, titulo: string) => ({
    capitulo_numero,
    titulo,
    url: `/ep/${capitulo_numero}`,
});

/** A two-season series: S1 has 3 episodes, S2 has 2 episodes. */
const mockSerie: LibrarySerieDetail = {
    id: 'mock-serie',
    name: 'Mock Serie',
    active: true,
    temporadas: [
        {
            temporada: 1,
            episodios: [ep(1, 'S1E1'), ep(2, 'S1E2'), ep(3, 'S1E3')],
        },
        {
            temporada: 2,
            episodios: [ep(1, 'S2E1'), ep(2, 'S2E2')],
        },
    ],
};

const s1 = mockSerie.temporadas[0];
const s2 = mockSerie.temporadas[1];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSeriesNavigation', () => {
    describe('when serieDetail is null', () => {
        it('getNext() returns null', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: null,
                    selectedTemporada: null,
                    selectedEpisodioIndex: null,
                }),
            );
            expect(result.current.getNext()).toBeNull();
        });

        it('getPrev() returns null', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: null,
                    selectedTemporada: null,
                    selectedEpisodioIndex: null,
                }),
            );
            expect(result.current.getPrev()).toBeNull();
        });

        it('hasNext is false', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: null,
                    selectedTemporada: null,
                    selectedEpisodioIndex: null,
                }),
            );
            expect(result.current.hasNext).toBe(false);
        });

        it('hasPrev is false', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: null,
                    selectedTemporada: null,
                    selectedEpisodioIndex: null,
                }),
            );
            expect(result.current.hasPrev).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe('getNext()', () => {
        it('returns the next episode within the same season', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 0, // S1E1 → S1E2
                }),
            );
            expect(result.current.getNext()).toEqual({
                temporada: 1,
                episodioIndex: 1,
                episodio: s1.episodios[1],
            });
        });

        it('crosses to the first episode of the next season when at the end of the current season', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 2, // last ep of S1 → S2E1
                }),
            );
            expect(result.current.getNext()).toEqual({
                temporada: 2,
                episodioIndex: 0,
                episodio: s2.episodios[0],
            });
        });

        it('returns null at the very last episode of the last season', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 2,
                    selectedEpisodioIndex: 1, // last ep of S2
                }),
            );
            expect(result.current.getNext()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    describe('getPrev()', () => {
        it('returns the previous episode within the same season', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 2, // S1E3 → S1E2
                }),
            );
            expect(result.current.getPrev()).toEqual({
                temporada: 1,
                episodioIndex: 1,
                episodio: s1.episodios[1],
            });
        });

        it('crosses to the last episode of the previous season when at the start of the current season', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 2,
                    selectedEpisodioIndex: 0, // S2E1 → S1E3 (last)
                }),
            );
            expect(result.current.getPrev()).toEqual({
                temporada: 1,
                episodioIndex: 2,
                episodio: s1.episodios[2],
            });
        });

        it('returns null at episode index 0 of season 1', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 0,
                }),
            );
            expect(result.current.getPrev()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    describe('hasNext / hasPrev flags', () => {
        it('hasNext is true when getNext() would return a result', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 0,
                }),
            );
            expect(result.current.hasNext).toBe(true);
        });

        it('hasNext is false at the last episode of the series', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 2,
                    selectedEpisodioIndex: 1,
                }),
            );
            expect(result.current.hasNext).toBe(false);
        });

        it('hasPrev is true when getPrev() would return a result', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 1,
                }),
            );
            expect(result.current.hasPrev).toBe(true);
        });

        it('hasPrev is false at the first episode of the series', () => {
            const { result } = renderHook(() =>
                useSeriesNavigation({
                    serieDetail: mockSerie,
                    selectedTemporada: 1,
                    selectedEpisodioIndex: 0,
                }),
            );
            expect(result.current.hasPrev).toBe(false);
        });
    });
});
