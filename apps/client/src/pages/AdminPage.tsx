import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Trash2, RefreshCw, Copy, Check, Plus, Users, Radio, Key, Tv, List, Server, Library, Loader2, Menu,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Sidebar } from '../components/Sidebar';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { IPTVListManager } from '../components/IPTVListManager';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { MobileDrawer } from '../components/MobileDrawer';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import { adminApi, jellyfinApi, libraryApi } from '../lib/api';
import { resetProgressAllRooms } from '../hooks/useWatchProgress';
import { copyToClipboard } from '../lib/utils';
import { useStore } from '../store';
import type { AdminUser, Connection, Token, Room, LibrarySerie } from '../types';

type Tab = 'rooms' | 'users' | 'connections' | 'tokens' | 'iptv' | 'jellyfin';

export function AdminPage() {
  const { user, rooms } = useStore();
  const [tab, setTab] = useState<Tab>('rooms');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<LibrarySerie[]>([]);
  const [loadingSeriesLibrary, setLoadingSeriesLibrary] = useState(false);
  const sidebarDrawer = useMobileDrawer();

  useEffect(() => {
    setLoadingSeriesLibrary(true);
    libraryApi.listSeries()
      .then(({ data }) => setSeriesList(data))
      .catch(() => toast.error('Error al cargar la biblioteca'))
      .finally(() => setLoadingSeriesLibrary(false));
  }, []);

  if (!user?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen bg-base text-white overflow-hidden">
      <Sidebar />

      <MobileDrawer isOpen={sidebarDrawer.isOpen} onClose={sidebarDrawer.close} side="left">
        <Sidebar embedded onNavigate={sidebarDrawer.close} />
      </MobileDrawer>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="px-4 sm:px-6 md:px-8 py-4 md:py-6 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={sidebarDrawer.toggle}
                className="md:hidden p-2 -ml-2 rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-white truncate">Panel de administración</h1>
                <p className="text-xs md:text-sm text-white/40 mt-0.5 hidden sm:block">Gestiona salas, usuarios y conexiones</p>
              </div>
            </div>
            {tab === 'rooms' && (
              <Button onClick={() => setIsCreateOpen(true)} className="flex-shrink-0">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nueva sala</span>
              </Button>
            )}
          </div>

          {/* Tabs — horizontal scroll on mobile */}
          <div className="flex gap-1 mt-4 md:mt-5 overflow-x-auto -mx-1 px-1 pb-1">
            {([
              { id: 'rooms', label: 'Salas', icon: Tv },
              { id: 'users', label: 'Usuarios', icon: Users },
              { id: 'connections', label: 'Conexiones', icon: Radio },
              { id: 'tokens', label: 'Tokens', icon: Key },
              { id: 'iptv', label: 'Listas IPTV', icon: List },
              { id: 'jellyfin', label: 'Jellyfin', icon: Server },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap ${tab === id ? 'bg-accent-muted text-accent-lighter' : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 md:px-8 py-6 space-y-10">
          {tab === 'rooms' && <RoomsTab rooms={rooms} />}
          {tab === 'users' && <UsersTab />}
          {tab === 'connections' && <ConnectionsTab />}
          {tab === 'tokens' && <TokensTab />}
          {tab === 'iptv' && <IPTVListManager />}
          {tab === 'jellyfin' && <JellyfinTab />}

          {/* Series Clásicas — Mi Progreso */}
          <section className="border-t border-white/[0.06] pt-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <Library className="w-5 h-5" />
              Series Clásicas — Mi Progreso
            </h2>
            {loadingSeriesLibrary ? (
              <div className="flex items-center gap-2 text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando series...
              </div>
            ) : (
              <div className="space-y-2">
                {seriesList.map((serie) => (
                  <div key={serie.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-white text-sm">{serie.name}</span>
                    <button
                      onClick={() => {
                        resetProgressAllRooms(serie.id, user!.username, rooms.map((r) => r.id));
                        toast.success(`Progreso de ${serie.name} reseteado`);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
                    >
                      Resetear mi progreso
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <CreateRoomModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}

// ─── Rooms Tab ──────────────────────────────────────────────────────────────

function RoomsTab({ rooms }: { rooms: Room[] }) {
  async function handleDelete(id: string) {
    try {
      await adminApi.deleteRoom(id);
      toast.success('Sala eliminada');
    } catch { toast.error('Error al eliminar'); }
  }

  async function handleDeleteAll() {
    if (!confirm('¿Eliminar todas las salas?')) return;
    try {
      await adminApi.deleteAllRooms();
      toast.success('Todas las salas eliminadas');
    } catch { toast.error('Error'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={handleDeleteAll}>
          <Trash2 className="h-3.5 w-3.5" /> Eliminar todas
        </Button>
      </div>
      {rooms.length === 0 ? (
        <EmptyState message="No hay salas" />
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white truncate">{r.name}</p>
                  <button onClick={() => handleDelete(r.id)} className="p-1 text-white/30 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${r.isOpen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {r.isOpen ? 'Pública' : 'Privada'}
                  </span>
                  <span className="text-white/60">{r.users.length}/{r.maxUsers} usuarios</span>
                </div>
                {r.playerState.videoId && (
                  <p className="text-xs text-white/40 font-mono truncate">Video: {r.playerState.videoId}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="text-xs text-white/40 border-b border-white/[0.06]">
                <th className="text-left pb-3">Nombre</th>
                <th className="text-left pb-3">Estado</th>
                <th className="text-left pb-3">Usuarios</th>
                <th className="text-left pb-3">Video</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rooms.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 text-white font-medium">{r.name}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.isOpen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                      {r.isOpen ? 'Pública' : 'Privada'}
                    </span>
                  </td>
                  <td className="py-3 text-white/60">{r.users.length}/{r.maxUsers}</td>
                  <td className="py-3 text-white/40 font-mono text-xs">{r.playerState.videoId ?? '—'}</td>
                  <td className="py-3 text-right">
                    <button onClick={() => handleDelete(r.id)} className="p-1 text-white/30 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listUsers().then(({ data }) => setUsers(data.users)).catch(() => { }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-white/40">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
        <Button variant="ghost" size="sm" onClick={() => adminApi.listUsers().then(({ data }) => setUsers(data.users))}>
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>
      {loading ? <LoadingState /> : users.length === 0 ? <EmptyState message="No hay usuarios" /> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.username} className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
              <Avatar username={u.username} avatar={u.avatar} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{u.username}</p>
                <p className="text-xs text-white/30 font-mono">{u.recoveryCode}</p>
              </div>
              <p className="text-xs text-white/25">{new Date(u.createdAt).toLocaleDateString('es')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Connections Tab ─────────────────────────────────────────────────────────

function ConnectionsTab() {
  const [conns, setConns] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    adminApi.listConnections().then(({ data }) => setConns(data)).catch(() => { }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-white/40">{conns.length} conexión{conns.length !== 1 ? 'es' : ''}</p>
        <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /> Refrescar</Button>
      </div>
      {loading ? <LoadingState /> : conns.length === 0 ? <EmptyState message="No hay conexiones activas" /> : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {conns.map((c) => (
              <div key={c.socketId} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white truncate">{c.username}</p>
                  <span className="text-xs text-white/40 flex-shrink-0">{new Date(c.joinedAt).toLocaleTimeString('es')}</span>
                </div>
                <p className="text-xs text-white/60 truncate">Sala: {c.roomName}</p>
                <p className="text-xs text-white/30 font-mono truncate">{c.socketId}</p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="text-xs text-white/40 border-b border-white/[0.06]">
                <th className="text-left pb-3">Usuario</th>
                <th className="text-left pb-3">Sala</th>
                <th className="text-left pb-3">Socket ID</th>
                <th className="text-left pb-3">Conectado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {conns.map((c) => (
                <tr key={c.socketId} className="hover:bg-white/[0.02]">
                  <td className="py-3 text-white font-medium">{c.username}</td>
                  <td className="py-3 text-white/60">{c.roomName}</td>
                  <td className="py-3 text-white/30 font-mono text-xs">{c.socketId.slice(0, 12)}...</td>
                  <td className="py-3 text-white/40 text-xs">{new Date(c.joinedAt).toLocaleTimeString('es')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Tokens Tab ──────────────────────────────────────────────────────────────

function TokensTab() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    try {
      const { data } = await adminApi.generateInvite();
      setNewToken(data);
      setTokens((prev) => [{ token: data.token, createdAt: Date.now(), usedBy: null }, ...prev]);
    } catch { toast.error('Error al generar token'); }
  }

  async function handleRevokeAll() {
    if (!confirm('¿Revocar todos los tokens?')) return;
    await adminApi.revokeAllTokens();
    setTokens([]);
    setNewToken(null);
    toast.success('Tokens revocados');
  }

  async function copyUrl() {
    if (!newToken) return;
    await copyToClipboard(newToken.url);
    setCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {newToken && (
        <div className="p-4 bg-accent-muted border border-accent-muted rounded-xl">
          <p className="text-sm font-medium text-accent-lighter mb-2">Token de invitación generado</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-white/60 bg-white/5 rounded px-2 py-1.5 font-mono break-all">{newToken.url}</code>
            <button onClick={copyUrl} className="p-2 bg-white/8 hover:bg-white/12 rounded-lg transition-colors flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-white/60" />}
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <Button onClick={handleGenerate}><Key className="h-4 w-4" /> Generar invitación</Button>
        {tokens.length > 0 && <Button variant="danger" onClick={handleRevokeAll}><Trash2 className="h-4 w-4" /> Revocar todos</Button>}
      </div>
      {tokens.length === 0 ? <EmptyState message="No hay tokens" /> : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.token} className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
              <code className="text-xs font-mono text-white/50 flex-1 truncate">{t.token}</code>
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.usedBy ? 'bg-white/8 text-white/30' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {t.usedBy ? 'Usado' : 'Activo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Jellyfin Tab ───────────────────────────────────────────────────────────

function JellyfinTab() {
  const [jellyfinUrl, setJellyfinUrl] = useState('');
  const [jellyfinKey, setJellyfinKey] = useState('');
  const [jellyfinStatus, setJellyfinStatus] = useState<{
    configured: boolean;
    ok?: boolean;
    serverName?: string;
    baseUrl?: string;
  } | null>(null);
  const [jellyfinLoading, setJellyfinLoading] = useState(true);

  useEffect(() => {
    jellyfinApi.getStatus()
      .then(({ data }) => {
        setJellyfinStatus(data);
        if (data.baseUrl) setJellyfinUrl(data.baseUrl);
      })
      .catch(() => setJellyfinStatus(null))
      .finally(() => setJellyfinLoading(false));
  }, []);

  async function handleSave() {
    if (!jellyfinUrl.trim() || !jellyfinKey.trim()) {
      toast.error('La URL y la API key son obligatorias');
      return;
    }
    try {
      const { data } = await jellyfinApi.saveConfig(jellyfinUrl.trim(), jellyfinKey.trim());
      if (data.ok) {
        toast.success(`Conectado a ${data.serverName ?? 'Jellyfin'}`);
        setJellyfinStatus({ configured: true, ok: true, serverName: data.serverName, baseUrl: jellyfinUrl.trim() });
        setJellyfinKey('');
      } else {
        toast.error(data.error ?? 'No se pudo conectar al servidor');
        setJellyfinStatus((prev) => prev ? { ...prev, ok: false } : { configured: true, ok: false });
      }
    } catch {
      toast.error('Error al guardar la configuración');
    }
  }

  function StatusBadge() {
    if (jellyfinLoading) return <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/30">Cargando…</span>;
    if (!jellyfinStatus || !jellyfinStatus.configured)
      return <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/30">No configurado</span>;
    if (jellyfinStatus.ok)
      return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Conectado a {jellyfinStatus.serverName ?? 'Jellyfin'}</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">No alcanzable</span>;
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-white/70">Servidor Jellyfin</h2>
        <StatusBadge />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-white/70">URL del servidor</label>
          <input
            type="text"
            value={jellyfinUrl}
            onChange={(e) => setJellyfinUrl(e.target.value)}
            placeholder="http://192.168.1.x:8096"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent-muted"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-white/70">API Key</label>
          <input
            type="password"
            value={jellyfinKey}
            onChange={(e) => setJellyfinKey(e.target.value)}
            placeholder="••••••••••••••••"
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent-muted"
          />
          <p className="text-xs text-white/30">La clave nunca se muestra una vez guardada</p>
        </div>

        <Button onClick={handleSave}>
          <Server className="h-4 w-4" /> Guardar &amp; Verificar
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-white/25 text-center py-12">{message}</p>;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-5 w-5 text-white/20 animate-spin" />
    </div>
  );
}
