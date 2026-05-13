import React, { useMemo } from 'react';
import { Play, SkipForward, Loader2, AlertCircle } from 'lucide-react';
import { useWatchProgress } from '../hooks/useWatchProgress';
import type { LibrarySerie, LibrarySerieDetail } from '../types';

interface SeriesSelectorProps {
  roomId: string;
  username: string;
  seriesList: LibrarySerie[];
  serieDetail: LibrarySerieDetail | null;
  selectedSerieId: string | null;
  selectedTemporada: number | null;
  selectedEpisodioIndex: number | null;
  loadingEpisodes: boolean;
  loadingSeries: boolean;
  onSerieChange: (serieId: string) => void;
  onTemporadaChange: (temporada: number) => void;
  onEpisodioChange: (index: number) => void;
  onPlay: () => void;
  onNext: () => void;
  hasNext: boolean;
  watchProgress: ReturnType<typeof useWatchProgress>;
  loadingEmbed?: boolean;
}

const selectClass =
  'bg-gray-800 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer min-w-0';

export default function SeriesSelector({
  seriesList,
  serieDetail,
  selectedSerieId,
  selectedTemporada,
  selectedEpisodioIndex,
  loadingEpisodes,
  loadingSeries,
  onSerieChange,
  onTemporadaChange,
  onEpisodioChange,
  onPlay,
  onNext,
  hasNext,
  watchProgress,
  loadingEmbed = false,
}: SeriesSelectorProps) {
  const sortedTemporadas = useMemo(
    () => [...(serieDetail?.temporadas ?? [])].sort((a, b) => a.temporada - b.temporada),
    [serieDetail],
  );

  const currentTemporadaEpisodios = useMemo(() => {
    if (selectedTemporada === null) return [];
    return (
      serieDetail?.temporadas.find((t) => t.temporada === selectedTemporada)?.episodios ?? []
    );
  }, [serieDetail, selectedTemporada]);

  const currentTemporadaTotal = currentTemporadaEpisodios.length;

  if (seriesList.length === 0 && !loadingSeries) {
    return (
      <span className="flex items-center gap-1 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4" />
        Error al cargar series
      </span>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-center w-full">
      {/* Serie select */}
      <select
        className={selectClass}
        value={selectedSerieId ?? ''}
        onChange={(e) => onSerieChange(e.target.value)}
      >
        {loadingSeries ? (
          <option disabled>Cargando series...</option>
        ) : (
          <>
            <option value="" disabled>
              Seleccionar serie
            </option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </>
        )}
      </select>

      {/* Temporada select */}
      <select
        className={selectClass}
        value={selectedTemporada ?? ''}
        disabled={!selectedSerieId || loadingEpisodes}
        onChange={(e) => onTemporadaChange(Number(e.target.value))}
      >
        {loadingEpisodes ? (
          <option disabled>Cargando...</option>
        ) : (
          <>
            <option value="" disabled>
              Temporada
            </option>
            {sortedTemporadas.map((t) => (
              <option key={t.temporada} value={t.temporada}>
                Temporada {t.temporada}
              </option>
            ))}
          </>
        )}
      </select>

      {/* Capítulo select */}
      <select
        className={selectClass}
        value={selectedEpisodioIndex ?? ''}
        disabled={selectedTemporada === null}
        onChange={(e) => onEpisodioChange(Number(e.target.value))}
      >
        <option value="" disabled>
          Capítulo
        </option>
        {currentTemporadaEpisodios.map((ep, idx) => {
          const watched =
            selectedSerieId !== null && selectedTemporada !== null
              ? watchProgress.isWatched(selectedSerieId, selectedTemporada, ep.capitulo_numero)
              : false;
          return (
            <option key={idx} value={idx}>
              {`${watched ? '[✓] ' : ''}Cap. ${ep.capitulo_numero} — ${ep.titulo}`}
            </option>
          );
        })}
      </select>

      {/* Progress badge */}
      {selectedSerieId !== null && selectedTemporada !== null && (
        <span className="text-xs text-white/50 whitespace-nowrap">
          Ep.{' '}
          {watchProgress.getSeasonProgress(
            selectedSerieId,
            selectedTemporada,
            currentTemporadaTotal,
          )}
          /{currentTemporadaTotal}
        </span>
      )}

      {/* Ver button */}
      <button
        onClick={onPlay}
        disabled={loadingEmbed || selectedEpisodioIndex === null}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loadingEmbed ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {loadingEmbed ? 'Cargando...' : 'Ver'}
      </button>

      {/* Siguiente button */}
      <button
        onClick={onNext}
        disabled={!hasNext || loadingEmbed}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-violet-500 text-violet-400 hover:bg-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
      >
        <SkipForward className="w-4 h-4" />
        Siguiente
      </button>
    </div>
  );
}
