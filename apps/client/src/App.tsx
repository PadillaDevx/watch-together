import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';
import { AdminPage } from './pages/AdminPage';
import { AuthModal } from './components/AuthModal';
import { useStore } from './store';
import { socket } from './lib/socket';

export default function App() {
  const { user, isLoading, fetchMe } = useStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (user) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d1f]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center animate-pulse">
            <svg className="h-5 w-5 text-white fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
          <p className="text-white/30 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#1d1d46', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '14px' },
          success: { iconTheme: { primary: '#a78bfa', secondary: '#0d0d1f' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#0d0d1f' } },
        }}
      />

      {!user && <AuthModal open />}

      {user && (
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
