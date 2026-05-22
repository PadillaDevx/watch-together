import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Users, Play, Lock, X } from 'lucide-react';
import type { Room } from '../types';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

interface RoomCardProps {
  room: Room;
  isAdmin?: boolean;
  currentUsername?: string;
  onDelete?: (id: string) => void;
}

export function RoomCard({ room, isAdmin, currentUsername, onDelete }: RoomCardProps) {
  const navigate = useNavigate();
  const count = room.users.length;
  const isFull = count >= room.maxUsers;
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  function handleJoinClick() {
    if (room.pinProtected) {
      setShowPin(true);
      setPinInput('');
      setPinError(false);
    } else {
      navigate(`/room/${room.id}`);
    }
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput.length < 4) { setPinError(true); return; }
    navigate(`/room/${room.id}`, { state: { pin: pinInput } });
  }

  return (
    <div className="group relative bg-raised border border-white/[0.07] hover:border-accent-muted rounded-xl p-5 flex flex-col gap-4 transition-all duration-200 hover:bg-card">
      {/* Delete button — visible for admin or room creator */}
      {(isAdmin || (currentUsername && room.createdByUsername === currentUsername)) && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(room.id); }}
          className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Title + badges */}
      <div>
        <h3 className="font-semibold text-white text-sm leading-snug truncate pr-8">{room.name}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${room.isOpen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {!room.isOpen && <Lock className="h-2.5 w-2.5" />}
            {room.isOpen ? 'Pública' : 'PIN'}
          </span>
          {room.playerState.videoId && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-accent-subtle text-accent-light flex items-center gap-1">
              <Play className="h-2.5 w-2.5 fill-current" /> Reproduciendo
            </span>
          )}
        </div>
      </div>

      {/* Users + action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {room.users.slice(0, 5).map((u) => (
              <Avatar key={u.socketId} username={u.username} size="xs" className="ring-1 ring-surface-raised" />
            ))}
          </div>
          <span className="text-xs text-white/40 flex items-center gap-1">
            <Users className="h-3 w-3" /> {count}/{room.maxUsers}
          </span>
        </div>
        <Button size="xs" disabled={isFull} onClick={handleJoinClick}>
          {isFull ? 'Llena' : room.pinProtected ? <><Lock className="h-3 w-3" /> Entrar</> : 'Unirse'}
        </Button>
      </div>

      {/* Inline PIN entry */}
      {showPin && (
        <form onSubmit={handlePinSubmit} className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
          <p className="text-xs text-white/50">Ingresa el PIN numérico de la sala:</p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
              placeholder="000000"
              className={`flex-1 px-3 py-1.5 bg-white/5 border rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 font-mono tracking-widest ${pinError ? 'border-red-500/60 focus:ring-red-500/50' : 'border-white/10 focus:ring-accent'}`}
            />
            <button type="submit" className="px-3 py-1.5 bg-accent hover:bg-accent-light rounded-lg text-xs text-white transition-colors">
              OK
            </button>
            <button type="button" onClick={() => setShowPin(false)} className="px-2 py-1.5 text-white/30 hover:text-white text-xs transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {pinError && <p className="text-xs text-red-400">PIN demasiado corto</p>}
        </form>
      )}
    </div>
  );
}
