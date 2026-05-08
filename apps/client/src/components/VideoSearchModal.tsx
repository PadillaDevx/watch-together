import { useState, useRef, useCallback } from 'react';
import { Search, X, Play, Loader2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { searchApi } from '../lib/api';
import type { VideoSearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (videoId: string) => void;
  initialQuery?: string;
}

export function VideoSearchModal({ open, onClose, onSelect, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const { data } = await searchApi.search(q.trim());
      setResults(data.results);
    } catch {
      setError('No se pudo conectar con YouTube. Intenta de nuevo.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSearch(query);
  }

  function handleSelect(videoId: string) {
    onSelect(videoId);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Buscar en YouTube" maxWidth="max-w-2xl">
      {/* Search input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca un video, artista, película..."
            autoFocus
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl text-sm text-white font-medium transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </form>

      {/* Results */}
      <div className="max-h-[420px] overflow-y-auto -mx-5 px-5 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-16 text-white/25">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-10 text-sm text-red-400/80">{error}</div>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <div className="text-center py-10 text-sm text-white/25">Sin resultados para &ldquo;{query}&rdquo;</div>
        )}

        {!loading && !searched && (
          <div className="text-center py-10 text-white/20">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Escribe algo para buscar</p>
          </div>
        )}

        {!loading && results.map((r) => (
          <VideoResultRow key={r.videoId} result={r} onSelect={handleSelect} />
        ))}
      </div>
    </Modal>
  );
}

function VideoResultRow({ result, onSelect }: { result: VideoSearchResult; onSelect: (id: string) => void }) {
  const notEmbeddable = result.embeddable === false;
  return (
    <button
      onClick={() => onSelect(result.videoId)}
      title={notEmbeddable ? 'Este video no permite reproducción embebida' : undefined}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group text-left${notEmbeddable ? ' opacity-60' : ''}`}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-white/5">
        <img
          src={result.thumbnail}
          alt={result.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {result.duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 py-0.5 rounded font-mono">
            {result.duration}
          </span>
        )}
        {notEmbeddable && (
          <span className="absolute bottom-1 left-1 bg-orange-500/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            No embebible
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <Play className="h-6 w-6 text-white fill-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug">{result.title}</p>
        <p className="text-xs text-white/40 mt-1 truncate">{result.channelTitle}</p>
        {result.viewCount && (
          <p className="text-xs text-white/25 mt-0.5">{result.viewCount}</p>
        )}
      </div>
    </button>
  );
}
