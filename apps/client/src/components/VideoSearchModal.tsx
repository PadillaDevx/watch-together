import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, X, Play, Loader2, ListVideo, Video } from 'lucide-react';
import { Modal } from './ui/Modal';
import { searchApi } from '../lib/api';
import { socket } from '../lib/socket';
import type { VideoSearchResult, PlaylistSearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (videoId: string) => void;
  initialQuery?: string;
  roomId: string;
}

export function VideoSearchModal({ open, onClose, onSelect, initialQuery = '', roomId }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'videos' | 'playlists'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (toastMsg) {
      const t = setTimeout(() => setToastMsg(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toastMsg]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setFilter('all');
    try {
      const { data } = await searchApi.search(q.trim());
      setResults(data.results);
      setPlaylists(data.playlists ?? []);
    } catch {
      setError('No se pudo conectar con YouTube. Intenta de nuevo.');
      setResults([]);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSearch(query);
  }

  function handlePlayNow(result: VideoSearchResult) {
    socket.emit('player-load', { roomId, type: 'youtube', videoId: result.videoId });
    onClose();
  }

  function handleAddToQueue(result: VideoSearchResult) {
    socket.emit('queue-add', {
      roomId,
      item: { type: 'youtube', title: result.title, videoId: result.videoId, thumbnail: result.thumbnail },
    });
    setToastMsg('Added to queue');
  }

  async function handlePlayPlaylist(playlist: PlaylistSearchResult) {
    setLoadingPlaylistId(playlist.playlistId);
    try {
      const { data } = await searchApi.getPlaylistItems(playlist.playlistId, playlist.seedVideoId);
      const items = data.items;
      if (!items.length) { setToastMsg('Playlist vacía'); return; }
      // Play first item immediately
      socket.emit('player-load', { roomId, type: 'youtube', videoId: items[0].videoId });
      // Queue the rest
      for (const item of items.slice(1)) {
        socket.emit('queue-add', {
          roomId,
          item: { type: 'youtube', title: item.title, videoId: item.videoId, thumbnail: item.thumbnail },
        });
      }
      setToastMsg(`Playlist cargada: ${items.length} videos`);
      onClose();
    } catch {
      setToastMsg('Error al cargar la playlist');
    } finally {
      setLoadingPlaylistId(null);
    }
  }

  async function handleQueuePlaylist(playlist: PlaylistSearchResult) {
    setLoadingPlaylistId(playlist.playlistId);
    try {
      const { data } = await searchApi.getPlaylistItems(playlist.playlistId, playlist.seedVideoId);
      const items = data.items;
      if (!items.length) { setToastMsg('Playlist vacía'); return; }
      for (const item of items) {
        socket.emit('queue-add', {
          roomId,
          item: { type: 'youtube', title: item.title, videoId: item.videoId, thumbnail: item.thumbnail },
        });
      }
      setToastMsg(`${items.length} videos añadidos a la cola`);
    } catch {
      setToastMsg('Error al cargar la playlist');
    } finally {
      setLoadingPlaylistId(null);
    }
  }

  // When user picks "Playlists" tab, always do a dedicated playlist search
  useEffect(() => {
    if (filter !== 'playlists' || !query.trim() || loading) return;
    let cancelled = false;
    setLoading(true);
    searchApi.searchPlaylists(query.trim())
      .then(({ data }) => { if (!cancelled) setPlaylists(data.playlists ?? []); })
      .catch(() => { /* keep current state */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setPlaylists([]); setSearched(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="px-4 py-2.5 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-xl text-sm text-white font-medium transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </form>

      {/* Filter tabs — only visible after a search */}
      {searched && !loading && (
        <div className="flex gap-1 mb-3">
          {([
            { key: 'all', label: 'Todo' },
            { key: 'videos', label: 'Videos', icon: <Video className="h-3 w-3" /> },
            { key: 'playlists', label: 'Playlists', icon: <ListVideo className="h-3 w-3" /> },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === key
                  ? 'bg-accent text-white'
                  : 'bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/10'
                }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="max-h-[420px] overflow-y-auto -mx-5 px-5 space-y-2 pb-1">
        {loading && (
          <div className="flex items-center justify-center py-16 text-white/25">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-10 text-sm text-red-400/80">{error}</div>
        )}

        {!loading && !error && searched && results.length === 0 && playlists.length === 0 && (
          <div className="text-center py-10 text-sm text-white/25">Sin resultados para &ldquo;{query}&rdquo;</div>
        )}

        {!loading && !error && searched && filter === 'playlists' && playlists.length === 0 && results.length > 0 && (
          <div className="text-center py-10 text-sm text-white/25">No se encontraron playlists para &ldquo;{query}&rdquo;</div>
        )}

        {!loading && !error && searched && filter === 'videos' && results.length === 0 && playlists.length > 0 && (
          <div className="text-center py-10 text-sm text-white/25">No se encontraron videos para &ldquo;{query}&rdquo;</div>
        )}

        {!loading && !searched && (
          <div className="text-center py-10 text-white/20">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Escribe algo para buscar</p>
          </div>
        )}

        {!loading && results.map((r) => (
          filter !== 'playlists' && <VideoResultRow key={r.videoId} result={r} onPlayNow={handlePlayNow} onAddToQueue={handleAddToQueue} />
        ))}

        {!loading && playlists.length > 0 && filter !== 'videos' && (
          <>
            {filter === 'all' && <p className="text-xs font-semibold text-white/30 uppercase tracking-wider pt-2 pb-1">Playlists</p>}
            {playlists.map((p) => (
              <PlaylistResultRow
                key={p.playlistId}
                playlist={p}
                loading={loadingPlaylistId === p.playlistId}
                onPlayNow={handlePlayPlaylist}
                onAddToQueue={handleQueuePlaylist}
              />
            ))}
          </>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="mt-3 flex justify-center">
          <span className="px-4 py-1.5 bg-emerald-600/90 text-white text-xs rounded-full shadow">
            {toastMsg}
          </span>
        </div>
      )}
    </Modal>
  );
}

function VideoResultRow({
  result,
  onPlayNow,
  onAddToQueue,
}: {
  result: VideoSearchResult;
  onPlayNow: (result: VideoSearchResult) => void;
  onAddToQueue: (result: VideoSearchResult) => void;
}) {
  const notEmbeddable = result.embeddable === false;
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group${notEmbeddable ? ' opacity-60' : ''}`}
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
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug">{result.title}</p>
        <p className="text-xs text-white/40 mt-1 truncate">{result.channelTitle}</p>
        {result.viewCount && (
          <p className="text-xs text-white/25 mt-0.5">{result.viewCount}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={() => onPlayNow(result)}
          title="Reproducir ahora"
          className="px-2.5 py-1 bg-accent hover:bg-accent-light text-white text-xs rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          <Play className="h-3 w-3 fill-white" />
          Reproducir
        </button>
        <button
          onClick={() => onAddToQueue(result)}
          title="Añadir a la cola"
          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white/80 text-xs rounded-lg transition-colors whitespace-nowrap"
        >
          + Cola
        </button>
      </div>
    </div>
  );
}

function PlaylistResultRow({
  playlist,
  loading,
  onPlayNow,
  onAddToQueue,
}: {
  playlist: PlaylistSearchResult;
  loading: boolean;
  onPlayNow: (playlist: PlaylistSearchResult) => void;
  onAddToQueue: (playlist: PlaylistSearchResult) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group">
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-white/5">
        <img
          src={playlist.thumbnail}
          alt={playlist.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-y-0 right-0 w-7 bg-black/60 flex flex-col items-center justify-center gap-0.5">
          <ListVideo className="h-3 w-3 text-white" />
          <span className="text-[9px] text-white font-mono leading-none">{playlist.videoCount}</span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug">{playlist.title}</p>
        <p className="text-xs text-white/40 mt-1 truncate">{playlist.channelTitle}</p>
        <p className="text-xs text-white/25 mt-0.5">{playlist.videoCount} videos</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={() => onPlayNow(playlist)}
          disabled={loading}
          title="Reproducir playlist"
          className="px-2.5 py-1 bg-accent hover:bg-accent-light disabled:opacity-40 text-white text-xs rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-white" />}
          Reproducir
        </button>
        <button
          onClick={() => onAddToQueue(playlist)}
          disabled={loading}
          title="Añadir playlist a la cola"
          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white/80 text-xs rounded-lg transition-colors whitespace-nowrap"
        >
          + Cola
        </button>
      </div>
    </div>
  );
}
