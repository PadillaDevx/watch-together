import { useEffect, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Sidebar } from '../components/Sidebar';
import { RoomCard } from '../components/RoomCard';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { Button } from '../components/ui/Button';
import { useStore } from '../store';
import { socket } from '../lib/socket';
import { roomsApi, adminApi } from '../lib/api';
import type { Room } from '../types';

export function LobbyPage() {
  const { user, rooms, setRooms } = useStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    // Fetch initial room list
    roomsApi.list().then(({ data }) => setRooms(data.rooms)).catch(() => {});

    // Real-time updates
    const onRoomList = (updated: Room[]) => setRooms(updated);
    socket.on('room-list', onRoomList);
    return () => { socket.off('room-list', onRoomList); };
  }, [setRooms]);

  async function handleDelete(id: string) {
    try {
      await adminApi.deleteRoom(id);
      toast.success('Sala eliminada');
    } catch {
      toast.error('Error al eliminar la sala');
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="flex h-screen bg-[#0d0d1f] text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">
                {greeting}, {user?.username} 👋
              </h1>
              <p className="text-white/40 mt-1 text-sm">
                {rooms.length === 0 ? 'No hay salas disponibles' : `${rooms.length} sala${rooms.length > 1 ? 's' : ''} disponible${rooms.length > 1 ? 's' : ''}`}
              </p>
            </div>
            {user?.isAdmin && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Nueva sala
              </Button>
            )}
          </div>

          {/* Rooms grid */}
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-white/20" />
              </div>
              <p className="text-white/30 font-medium">No hay salas todavía</p>
              {user?.isAdmin && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="mt-3 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Crea la primera sala →
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  isAdmin={user?.isAdmin}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateRoomModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
