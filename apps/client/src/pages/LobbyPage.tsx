import { useEffect, useState } from 'react';
import { Plus, Clapperboard, Menu, Search, Tv, Server, ListVideo, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sidebar } from '../components/Sidebar';
import { RoomCard } from '../components/RoomCard';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { Button } from '../components/ui/Button';
import { MobileDrawer } from '../components/MobileDrawer';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import { useStore } from '../store';
import { socket } from '../lib/socket';
import { roomsApi } from '../lib/api';
import type { Room } from '../types';

const FEATURES = [
  {
    icon: Search,
    title: 'Búsqueda de videos',
    description: 'Busca y reproduce cualquier video de YouTube directamente en la sala, sin salir de la app.',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10 border-blue-500/15',
  },
  {
    icon: Tv,
    title: 'Canales IPTV',
    description: 'Reproduce listas M3U con miles de canales en vivo y VOD desde cualquier fuente compatible.',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/15',
  },
  {
    icon: Server,
    title: 'Biblioteca Jellyfin',
    description: 'Conecta tu servidor Jellyfin y accede a tu colección personal de películas y series.',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/15',
  },
  {
    icon: ListVideo,
    title: 'Cola de reproducción',
    description: 'Añade videos en secuencia y disfruta de una sesión continua sin interrupciones entre títulos.',
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10 border-orange-500/15',
  },
] as const;

export function LobbyPage() {
  const { user, rooms, setRooms } = useStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();
  const sidebarDrawer = useMobileDrawer();

  useEffect(() => {
    roomsApi.list().then(({ data }) => setRooms(data.rooms)).catch(() => { });

    const onRoomList = (updated: Room[]) => setRooms(updated);
    socket.on('room-list', onRoomList);
    return () => { socket.off('room-list', onRoomList); };
  }, [setRooms]);

  async function handleDelete(id: string) {
    try {
      await roomsApi.deleteRoom(id);
      toast.success('Sala eliminada');
    } catch {
      toast.error('Error al eliminar la sala');
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateFormatted = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  return (
    <div className="flex h-screen bg-base text-white overflow-hidden">
      <Sidebar />

      <MobileDrawer isOpen={sidebarDrawer.isOpen} onClose={sidebarDrawer.close} side="left">
        <Sidebar embedded onNavigate={sidebarDrawer.close} />
      </MobileDrawer>

      <main className="flex-1 overflow-auto">
        {/* Mobile-only top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] sticky top-0 bg-base backdrop-blur-md z-10">
          <button
            onClick={sidebarDrawer.toggle}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-white">Watch Together</span>
          <span className="w-9" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">

          {/* ── Hero ── */}
          <div className="mb-10 md:mb-12">
            <p className="text-xs font-medium text-accent-lighter mb-2 uppercase tracking-widest">
              {dateFormatted}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight">
              {greeting}, {user?.username}
            </h1>
            <p className="text-white/40 text-sm mb-7 max-w-md">
              Tu espacio privado para ver contenido en grupo, en perfecta sincronía.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/salas')}>
                <Clapperboard className="h-4 w-4" />
                Ver salas activas
              </Button>
              <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Crear sesión
              </Button>
            </div>
          </div>

          {/* ── Features ── */}
          <div className="mb-10 md:mb-12">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              ¿Qué puedes hacer?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map(({ icon: Icon, title, description, iconColor, iconBg }) => (
                <div
                  key={title}
                  className="flex gap-3.5 p-4 rounded-xl bg-raised border border-white/[0.06] hover:border-white/[0.10] transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg border ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
                    <p className="text-xs text-white/40 leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Active rooms preview ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                  Salas activas
                </h2>
                {rooms.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-accent-muted text-accent-lighter">
                    {rooms.length}
                  </span>
                )}
              </div>
              {rooms.length > 0 && (
                <button
                  onClick={() => navigate('/salas')}
                  className="flex items-center gap-1 text-xs text-accent-light hover:text-accent-lighter transition-colors"
                >
                  Ver todas <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-raised border border-white/[0.05] text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <Clapperboard className="h-6 w-6 text-white/20" />
                </div>
                <p className="text-white/30 text-sm font-medium">No hay salas disponibles</p>
                {user?.isAdmin && (
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="mt-2.5 text-sm text-accent-light hover:text-accent-lighter transition-colors"
                  >
                    Crea la primera sesión →
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.slice(0, 3).map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    isAdmin={user?.isAdmin}
                    currentUsername={user?.username}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {rooms.length > 3 && (
              <button
                onClick={() => navigate('/salas')}
                className="mt-4 w-full py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] text-sm text-white/40 hover:text-white/60 transition-all flex items-center justify-center gap-2"
              >
                Ver {rooms.length - 3} sala{rooms.length - 3 !== 1 ? 's' : ''} más
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

        </div>
      </main>

      <CreateRoomModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
