import { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { Modal } from './ui/Modal';
import { jellyfinApi } from '../lib/api';
import { socket } from '../lib/socket';

interface JellyfinBrowserModalProps {
    open: boolean;
    onClose: () => void;
    roomId: string;
}

type JellyfinItem = {
    id: string;
    name: string;
    type: string;
    runtimeTicks?: number;
    imageUrl?: string;
    streamUrl: string;
};

export function JellyfinBrowserModal({ open, onClose, roomId }: JellyfinBrowserModalProps) {
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<JellyfinItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-dismiss toast after 2 s
    useEffect(() => {
        if (!toastMsg) return;
        const t = setTimeout(() => setToastMsg(null), 2000);
        return () => clearTimeout(t);
    }, [toastMsg]);

    // On open: check Jellyfin status, reset search
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setResults([]);
        setConfigured(null);
        jellyfinApi.getStatus()
            .then(({ data }) => setConfigured(data.configured))
            .catch(() => setConfigured(false));
    }, [open]);

    // Debounced search: fire when query has >= 2 chars
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (query.trim().length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        debounceRef.current = setTimeout(() => {
            jellyfinApi.search(query.trim())
                .then(({ data }) => setResults(data))
                .catch(() => setResults([]))
                .finally(() => setLoading(false));
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    function formatDuration(ticks?: number): string {
        if (!ticks) return '—';
        const mins = Math.floor(ticks / 600_000_000);
        return mins > 0 ? `${mins} min` : '—';
    }

    function handlePlay(item: JellyfinItem) {
        socket.emit('player-load', { roomId, type: 'iptv', streamUrl: item.streamUrl });
        onClose();
    }

    function handleQueue(item: JellyfinItem) {
        socket.emit('queue-add', {
            roomId,
            item: {
                type: 'movie',
                title: item.name,
                streamUrl: item.streamUrl,
                thumbnail: item.imageUrl,
            },
        });
        setToastMsg(`"${item.name}" added to queue`);
    }

    return (
        <Modal open={open} onClose={onClose} title="Jellyfin Browser" maxWidth="max-w-3xl">
            <div className="flex flex-col" style={{ minHeight: '56vh' }}>
                {/* Loading Jellyfin status */}
                {configured === null && (
                    <div className="flex items-center justify-center h-40 text-white/40 text-sm">
                        Connecting to Jellyfin…
                    </div>
                )}

                {/* Not configured */}
                {configured === false && (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-6">
                        <Film className="h-10 w-10 text-white/20" />
                        <p className="text-sm text-white/50">
                            Jellyfin is not configured. An administrator must configure it in the admin panel.
                        </p>
                    </div>
                )}

                {/* Configured: show search */}
                {configured === true && (
                    <>
                        {/* Search input */}
                        <div className="pb-4">
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search movies, episodes…"
                                autoFocus
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                            />
                        </div>

                        {/* Loading skeleton */}
                        {loading && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="animate-pulse rounded-xl bg-white/5 h-52" />
                                ))}
                            </div>
                        )}

                        {/* Prompt: type more */}
                        {!loading && query.trim().length < 2 && (
                            <div className="flex flex-col items-center justify-center h-40 text-white/20 gap-2">
                                <Film className="h-8 w-8" />
                                <p className="text-sm">Type at least 2 characters to search</p>
                            </div>
                        )}

                        {/* No results */}
                        {!loading && query.trim().length >= 2 && results.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 text-white/25 gap-2">
                                <Film className="h-8 w-8" />
                                <p className="text-sm">No results found</p>
                            </div>
                        )}

                        {/* Results grid */}
                        {!loading && results.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[50vh]">
                                {results.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex flex-col rounded-xl bg-white/5 border border-white/[0.06] overflow-hidden hover:border-violet-500/30 transition-colors"
                                    >
                                        {/* Poster */}
                                        <div className="aspect-[2/3] bg-white/5 relative overflow-hidden">
                                            {item.imageUrl ? (
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Film className="h-10 w-10 text-white/15" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info + buttons */}
                                        <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                                            <p className="text-xs font-medium text-white/90 leading-snug line-clamp-2">
                                                {item.name}
                                            </p>
                                            <p className="text-[10px] text-white/35">
                                                {formatDuration(item.runtimeTicks)}
                                            </p>
                                            <div className="flex gap-1.5 mt-auto pt-1">
                                                <button
                                                    onClick={() => handlePlay(item)}
                                                    className="flex-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                                                >
                                                    ▶ Play
                                                </button>
                                                <button
                                                    onClick={() => handleQueue(item)}
                                                    className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white/80 text-xs rounded-lg transition-colors whitespace-nowrap"
                                                >
                                                    + Queue
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
