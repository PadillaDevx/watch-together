import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { authApi } from '../lib/api';
import { getApiError } from '../lib/utils';
import { useStore } from '../store';

type Tab = 'login' | 'register' | 'recover';

export function AuthModal({ open }: { open: boolean }) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useStore();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(username, password);
        toast.success(`¡Bienvenido, ${username}!`);
      } else if (tab === 'register') {
        const { recoveryCode: code } = await register(username, password);
        toast.success(
          `Cuenta creada. Guarda tu código de recuperación: ${code}`,
          { duration: 15000, icon: <KeyRound className="w-4 h-4 text-yellow-400" /> },
        );
      }
    } catch (err: unknown) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof LogIn }> = [
    { id: 'login', label: 'Iniciar sesión', icon: LogIn },
    { id: 'register', label: 'Registrarse', icon: UserPlus },
    { id: 'recover', label: 'Recuperar', icon: KeyRound },
  ];

  return (
    <Modal open={open} unclosable title="WatchJunto">
      <div className="flex bg-white/5 rounded-lg p-1 mb-6 gap-0.5">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tab === id ? 'bg-accent text-white shadow' : 'text-white/50 hover:text-white'}
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'recover' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Usuario"
            id="auth-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tu nombre de usuario"
            autoComplete="username"
            required
            autoFocus
          />
          <Input
            label="Contraseña"
            id="auth-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            required
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {tab === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </form>
      ) : (
        <RecoverForm
          username={username}
          recoveryCode={recoveryCode}
          newPassword={newPassword}
          onUsernameChange={setUsername}
          onCodeChange={setRecoveryCode}
          onPasswordChange={setNewPassword}
        />
      )}
    </Modal>
  );
}

function RecoverForm(props: {
  username: string; recoveryCode: string; newPassword: string;
  onUsernameChange: (v: string) => void; onCodeChange: (v: string) => void; onPasswordChange: (v: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.recover(props.username, props.recoveryCode, props.newPassword);
      toast.success(`Contraseña cambiada. Nuevo código: ${data.newRecoveryCode}`, { duration: 15000 });
    } catch (err: unknown) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Usuario" value={props.username} onChange={(e) => props.onUsernameChange(e.target.value)} required />
      <Input label="Código de recuperación" value={props.recoveryCode} onChange={(e) => props.onCodeChange(e.target.value)} placeholder="XXXXX-XXXXX" required />
      <Input label="Nueva contraseña" type="password" value={props.newPassword} onChange={(e) => props.onPasswordChange(e.target.value)} required />
      <Button type="submit" className="w-full" size="lg" loading={loading}>Cambiar contraseña</Button>
    </form>
  );
}
