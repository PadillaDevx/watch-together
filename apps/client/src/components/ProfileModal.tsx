import { useState, useRef } from 'react';
import { Camera, Eye, EyeOff, Key, Lock, Palette, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from './ui/Modal';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { authApi } from '../lib/api';
import { copyToClipboard, getApiError } from '../lib/utils';
import { useStore } from '../store';
import { ACCENT_COLORS, DEFAULT_ACCENT, applyAccent } from '../lib/theme';
import type { User } from '../types';

type Tab = 'perfil' | 'seguridad' | 'tema';

// ACCENT_COLORS is imported from lib/theme.ts — single source of truth

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: Props) {
  const { user, fetchMe } = useStore();
  const [tab, setTab] = useState<Tab>('perfil');

  if (!user) return null;

  return (
    <Modal open={open} onClose={onClose} title="Mi perfil" maxWidth="max-w-md">
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 -mx-1">
        {([
          { id: 'perfil', label: 'Perfil' },
          { id: 'seguridad', label: 'Seguridad' },
          { id: 'tema', label: 'Tema' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-accent-muted text-accent-lighter' : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'perfil' && <PerfilTab user={user} onUpdated={fetchMe} />}
      {tab === 'seguridad' && <SeguridadTab user={user} onUpdated={fetchMe} />}
      {tab === 'tema' && <TemaTab />}
    </Modal>
  );
}

// ─── Perfil Tab ───────────────────────────────────────────────────────────────

function PerfilTab({ user, onUpdated }: { user: NonNullable<User>; onUpdated: () => Promise<void> }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatar ?? '');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSaveAvatar() {
    setSaving(true);
    try {
      await authApi.updateAvatar(avatarUrl.trim() || null);
      await onUpdated();
      toast.success('Avatar actualizado');
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Error al actualizar'));
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_200_000) { toast.error('La imagen es muy grande (máx ~1 MB)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') setAvatarUrl(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-5">
      {/* Avatar preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative group">
          <Avatar username={user.username} avatar={avatarUrl || null} size="xl" />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <p className="text-xs text-white/30">Haz clic para subir imagen o pega una URL</p>
      </div>

      {/* Username display */}
      <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
        <p className="text-xs text-white/35 mb-0.5">Nombre de usuario</p>
        <p className="text-sm font-medium text-white">{user.username}</p>
      </div>

      {/* Avatar URL input */}
      <Input
        label="URL de avatar"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="https://... o sube una imagen arriba"
        hint="JPEG, PNG o GIF. Máximo 1 MB"
      />

      <Button onClick={handleSaveAvatar} loading={saving} className="w-full">
        Guardar avatar
      </Button>
    </div>
  );
}

// ─── Seguridad Tab ────────────────────────────────────────────────────────────

function SeguridadTab({ user, onUpdated }: { user: NonNullable<User>; onUpdated: () => Promise<void> }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const recoveryCode = user.recoveryCode;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error('Las contraseñas nuevas no coinciden'); return; }
    if (newPw.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setSaving(true);
    try {
      const { data } = await authApi.changePassword(currentPw, newPw);
      // Update recoveryCode in store after password change
      await onUpdated();
      toast.success(`Contraseña cambiada. Nuevo código: ${data.newRecoveryCode}`);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Error al cambiar contraseña'));
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    if (!recoveryCode) return;
    await copyToClipboard(recoveryCode);
    setCopiedCode(true);
    toast.success('Código copiado');
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Recovery code */}
      {recoveryCode && (
        <div className="p-3.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-xs font-semibold text-amber-400">Código de recuperación</p>
            </div>
            <button onClick={copyCode} className="p-1 text-amber-400/60 hover:text-amber-400 transition-colors">
              {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <code className="text-xs font-mono text-white/70 break-all">{recoveryCode}</code>
          <p className="text-xs text-white/30 mt-1.5">Guarda este código. Lo necesitas para recuperar tu cuenta si olvidas tu contraseña.</p>
        </div>
      )}

      {/* Change password form */}
      <form onSubmit={handleChangePassword} className="space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Cambiar contraseña</p>

        <div className="relative">
          <Input
            label="Contraseña actual"
            type={showPw ? 'text' : 'password'}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-8 text-white/30 hover:text-white"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <Input
          label="Nueva contraseña"
          type={showPw ? 'text' : 'password'}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          hint="Mínimo 6 caracteres"
          required
        />

        <Input
          label="Confirmar nueva contraseña"
          type={showPw ? 'text' : 'password'}
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          error={confirmPw && newPw !== confirmPw ? 'Las contraseñas no coinciden' : undefined}
          required
        />

        <Button type="submit" loading={saving} className="w-full">
          <Lock className="h-4 w-4" /> Cambiar contraseña
        </Button>
      </form>
    </div>
  );
}

// ─── Tema Tab ─────────────────────────────────────────────────────────────────

function TemaTab() {
  const saved = localStorage.getItem('wj_accent') ?? DEFAULT_ACCENT;
  const [accent, setAccent] = useState(saved);

  function handleSelect(value: string) {
    setAccent(value);
    localStorage.setItem('wj_accent', value);
    applyAccent(value);
    toast.success('Tema guardado');
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Color de acento</p>
        <div className="grid grid-cols-3 gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleSelect(c.value)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${accent === c.value
                ? 'border-white/30 bg-white/8'
                : 'border-white/[0.06] hover:bg-white/[0.04]'
                }`}
            >
              <span
                className="w-5 h-5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: c.hex,
                  outline: accent === c.value ? `2px solid ${c.hex}` : '2px solid transparent',
                  outlineOffset: '2px',
                }}
              />
              <span className="text-xs text-white/70">{c.name}</span>
              {accent === c.value && <Check className="h-3 w-3 text-white/60 ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="h-3.5 w-3.5 text-white/40" />
          <p className="text-xs font-medium text-white/40">Fondo oscuro</p>
        </div>
        <p className="text-xs text-white/25">El fondo siempre es oscuro para una mejor experiencia de visualización.</p>
      </div>
    </div>
  );
}
