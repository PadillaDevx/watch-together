import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Shield, Play, LogOut, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { Avatar } from './ui/Avatar';
import { ProfileModal } from './ProfileModal';
import { useStore } from '../store';

export function Sidebar() {
  const { user, logout } = useStore();
  const [profileOpen, setProfileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    toast.success('Sesión cerrada');
  }

  return (
    <aside className="w-56 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-surface">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5 mb-0.5">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
          <span className="font-bold text-white text-base tracking-tight">WatchJunto</span>
        </div>
        <p className="text-xs text-white/30 pl-10">Cine Privado</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        <NavItem to="/" icon={Home} label="Inicio" end />
        {user?.isAdmin && <NavItem to="/admin" icon={Shield} label="Panel Admin" />}
      </nav>

      {/* User */}
      {user && (
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors group text-left"
          >
            <Avatar username={user.username} avatar={user.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{user.username}</p>
              <p className="text-xs text-white/35 leading-tight">{user.isAdmin ? 'Admin' : 'Miembro'}</p>
            </div>
            <Settings className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
          </button>
          <button
            onClick={handleLogout}
            className="mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors text-xs"
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      )}

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  );
}

function NavItem({ to, icon: Icon, label, end }: { to: string; icon: typeof Home; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-violet-600/20 text-violet-300'
            : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}
