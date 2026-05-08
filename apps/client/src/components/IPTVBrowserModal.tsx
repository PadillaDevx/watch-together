import { useEffect, useState } from 'react';
import { Tv } from 'lucide-react';
import { Modal } from './ui/Modal';
import { iptvApi } from '../lib/api';
import type { IPTVEntry } from '../types';

interface IPTVBrowserModalProps {
  open: boolean;
  onClose: () => void;
  listId: string;
  onSelect: (entry: IPTVEntry) => void;
}

export function IPTVBrowserModal({ open, onClose, listId, onSelect }: IPTVBrowserModalProps) {
  const [entries, setEntries] = useState<IPTVEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('__all__');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open || !listId) return;
    setLoading(true);
    setEntries([]);
    setSelectedGroup('__all__');
    setSearchQuery('');
    iptvApi.getEntries(listId)
      .then(({ data }) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, listId]);

  const groups = [...new Set(entries.map((e) => e.group).filter(Boolean))].sort();

  const isSearching = searchQuery.trim().length > 0;
  const filteredEntries = entries.filter((e) => {
    const matchesSearch = isSearching
      ? e.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesGroup = !isSearching && selectedGroup !== '__all__'
      ? e.group === selectedGroup
      : true;
    return matchesSearch && matchesGroup;
  });

  function handleSelect(entry: IPTVEntry) {
    onSelect(entry);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Elegir canal" maxWidth="max-w-3xl">
      <div className="flex flex-col h-[70vh]">
        {/* Search */}
        <div className="px-6 pt-2 pb-3 flex-shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar canal..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>

        <div className="flex flex-1 min-h-0 border-t border-white/[0.06]">
          {/* Left: categories (hidden when searching) */}
          {!isSearching && (
            <div className="w-44 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-2">
              <button
                onClick={() => setSelectedGroup('__all__')}
                className={`w-full text-left px-4 py-2 text-xs truncate transition-colors ${
                  selectedGroup === '__all__'
                    ? 'text-violet-300 bg-violet-600/15 font-medium'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                Todos
              </button>
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g)}
                  className={`w-full text-left px-4 py-2 text-xs truncate transition-colors ${
                    selectedGroup === g
                      ? 'text-violet-300 bg-violet-600/15 font-medium'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {g || 'Sin categoría'}
                </button>
              ))}
            </div>
          )}

          {/* Right: entries */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading && (
              <div className="flex flex-col gap-2 px-4 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 animate-pulse">
                    <div className="w-7 h-7 rounded bg-white/10 flex-shrink-0" />
                    <div className="h-3 bg-white/10 rounded w-40" />
                  </div>
                ))}
              </div>
            )}

            {!loading && filteredEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-white/25 gap-2">
                <Tv className="h-8 w-8" />
                <p className="text-sm">
                  {isSearching ? 'Sin resultados para tu búsqueda' : 'No hay canales en esta categoría'}
                </p>
              </div>
            )}

            {!loading && filteredEntries.map((entry, i) => (
              <button
                key={i}
                onClick={() => handleSelect(entry)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors"
              >
                {entry.logo ? (
                  <img
                    src={entry.logo}
                    alt=""
                    className="w-7 h-7 rounded object-contain flex-shrink-0 bg-white/5"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Tv className="w-7 h-7 text-white/20 flex-shrink-0" />
                )}
                <span className="text-sm text-white/80 truncate">{entry.name}</span>
                {isSearching && entry.group && (
                  <span className="ml-auto text-xs text-white/25 flex-shrink-0">{entry.group}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
