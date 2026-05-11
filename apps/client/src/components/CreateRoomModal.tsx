import { useState, useEffect, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { adminApi, iptvApi } from '../lib/api';
import type { IPTVList } from '../types';

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateRoomModal({ open, onClose }: CreateRoomModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceType, setSourceType] = useState<'youtube' | 'iptv' | 'movie'>('youtube');
  const [name, setName] = useState('');
  const [maxUsers, setMaxUsers] = useState('10');
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [enabledLists, setEnabledLists] = useState<IPTVList[]>([]);
  const [selectedIptvListId, setSelectedIptvListId] = useState('');
  const [listsLoading, setListsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSourceType('youtube');
      setName('');
      setMaxUsers('10');
      setIsOpen(true);
      setSelectedIptvListId('');
    }
  }, [open]);

  useEffect(() => {
    if (open && step === 2 && sourceType === 'iptv') {
      setListsLoading(true);
      iptvApi.listAll()
        .then(({ data }) => {
          const filtered = data.filter(l => l.enabled);
          setEnabledLists(filtered);
          if (filtered.length > 0) setSelectedIptvListId(filtered[0]!.id);
        })
        .catch(() => toast.error('Error al cargar listas IPTV'))
        .finally(() => setListsLoading(false));
    }
  }, [open, step, sourceType]);

  function handleSourceSelect(type: 'youtube' | 'iptv' | 'movie') {
    setSourceType(type);
    setStep(2);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (sourceType === 'iptv' && !selectedIptvListId) {
      toast.error('Selecciona una lista IPTV');
      return;
    }
    setLoading(true);
    try {
      const { data } = await adminApi.createRoom(
        name.trim(),
        Number(maxUsers) || 10,
        isOpen,
        sourceType,
        sourceType === 'iptv' ? selectedIptvListId : undefined,
      );
      if (data.pin) {
        toast.success(
          <span>Sala <b>"{name.trim()}"</b> creada — PIN: <b className="font-mono tracking-widest">{data.pin}</b></span>,
          { duration: 15000, icon: '🔒' }
        );
      } else {
        toast.success(`Sala "${name.trim()}" creada`);
      }
      setName('');
      onClose();
    } catch {
      toast.error('Error al crear la sala');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva sala">
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-white/60">Elige el tipo de fuente para esta sala:</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSourceSelect('youtube')}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-violet-600/20 hover:border-violet-500 transition-all text-white"
            >
              <span className="text-4xl">▶️</span>
              <span className="font-semibold">YouTube</span>
              <span className="text-xs text-white/50 text-center">Videos y búsqueda de YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => handleSourceSelect('iptv')}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-violet-600/20 hover:border-violet-500 transition-all text-white"
            >
              <span className="text-4xl">📺</span>
              <span className="font-semibold">Lista IPTV</span>
              <span className="text-xs text-white/50 text-center">Canales HLS y VOD</span>
            </button>
            <button
              type="button"
              onClick={() => handleSourceSelect('movie')}
              className="col-span-2 flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-violet-600/20 hover:border-violet-500 transition-all text-white"
            >
              <span className="text-4xl">🎬</span>
              <span className="font-semibold">Movies (Jellyfin)</span>
              <span className="text-xs text-white/50 text-center">Películas y series desde tu servidor Jellyfin</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors mb-1"
          >
            ← Cambiar fuente
            <span className="text-violet-400 font-medium">
              {sourceType === 'youtube' ? '▶️ YouTube' : sourceType === 'movie' ? '🎬 Movies (Jellyfin)' : '📺 Lista IPTV'}
            </span>
          </button>
          <Input
            label="Nombre de la sala"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Pelis de los viernes"
            required
            autoFocus
          />
          <Input
            label="Máximo de usuarios"
            type="number"
            min={1}
            max={50}
            value={maxUsers}
            onChange={(e) => setMaxUsers(e.target.value)}
          />
          {sourceType === 'iptv' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">Lista IPTV</label>
              {listsLoading ? (
                <p className="text-sm text-white/50">Cargando listas…</p>
              ) : enabledLists.length === 0 ? (
                <p className="text-sm text-amber-400/80 bg-amber-400/10 rounded-lg px-3 py-2">
                  No hay listas IPTV configuradas. Pídele al admin que agregue una.
                </p>
              ) : (
                <select
                  value={selectedIptvListId}
                  onChange={(e) => setSelectedIptvListId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                >
                  {enabledLists.map(list => (
                    <option key={list.id} value={list.id} className="bg-[#1a1a2e]">
                      {list.name} ({list.entryCount} entradas)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsOpen(!isOpen)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isOpen ? 'bg-violet-600' : 'bg-white/15'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isOpen ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-white/70">{isOpen ? 'Sala pública' : 'Sala privada (con PIN)'}</span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={loading}
              disabled={sourceType === 'iptv' && enabledLists.length === 0}
            >
              Crear sala
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

