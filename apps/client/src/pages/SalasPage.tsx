import { useEffect, useMemo, useState } from 'react';
import { Plus, Clapperboard, Menu, Search, X } from 'lucide-react';
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

export function SalasPage() {
    const { user, rooms, setRooms } = useStore();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [query, setQuery] = useState('');
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

    const filtered = useMemo(() => {
        if (!query.trim()) return rooms;
        const q = query.toLowerCase();
        return rooms.filter((r) => r.name.toLowerCase().includes(q));
    }, [rooms, query]);

    return (
        <div className="flex h-screen bg-base text-white overflow-hidden">
            <Sidebar />

            <MobileDrawer isOpen={sidebarDrawer.isOpen} onClose={sidebarDrawer.close} side="left">
                <Sidebar embedded onNavigate={sidebarDrawer.close} />
            </MobileDrawer>

            <main className="flex-1 overflow-auto">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] sticky top-0 bg-base backdrop-blur-md z-10">
                    <button
                        onClick={sidebarDrawer.toggle}
                        className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                        aria-label="Abrir menú"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <span className="text-sm font-semibold text-white">Salas</span>
                    <span className="w-9" />
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 md:mb-8">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-1">
                                <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center">
                                    <Clapperboard className="h-3.5 w-3.5 text-accent-light" />
                                </div>
                                <h1 className="text-xl sm:text-2xl font-bold text-white">Salas</h1>
                            </div>
                            <p className="text-white/40 text-sm">
                                {rooms.length === 0
                                    ? 'No hay salas disponibles ahora mismo'
                                    : `${rooms.length} sala${rooms.length !== 1 ? 's' : ''} disponible${rooms.length !== 1 ? 's' : ''}`}
                            </p>
                        </div>

                        {user && (
                            <Button onClick={() => setIsCreateOpen(true)} className="flex-shrink-0">
                                <Plus className="h-4 w-4" />
                                Nueva sala
                            </Button>
                        )}
                    </div>

                    {/* Search bar */}
                    {rooms.length > 0 && (
                        <div className="relative mb-6">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar sala por nombre..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full sm:w-80 pl-10 pr-9 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent-muted transition-colors"
                            />
                            {query && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                    aria-label="Limpiar búsqueda"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Results count when filtering */}
                    {query.trim() && (
                        <p className="text-xs text-white/35 mb-4">
                            {filtered.length === 0
                                ? `Sin resultados para "${query}"`
                                : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} para "${query}"`}
                        </p>
                    )}

                    {/* Rooms grid */}
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                <Clapperboard className="h-7 w-7 text-white/20" />
                            </div>
                            {query ? (
                                <>
                                    <p className="text-white/30 font-medium mb-1">Sin resultados</p>
                                    <p className="text-white/20 text-sm mb-4">Prueba con otro nombre</p>
                                    <button
                                        onClick={() => setQuery('')}
                                        className="text-sm text-accent-light hover:text-accent-lighter transition-colors"
                                    >
                                        Limpiar búsqueda
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="text-white/30 font-medium">No hay salas todavía</p>
                                    {user && (
                                        <button
                                            onClick={() => setIsCreateOpen(true)}
                                            className="mt-3 text-sm text-accent-light hover:text-accent-lighter transition-colors"
                                        >
                                            Crea la primera sala →
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered.map((room) => (
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
                </div>
            </main>

            <CreateRoomModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        </div>
    );
}
