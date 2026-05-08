import { Router } from 'express';
import { parseCookies, sessionAuth } from '../middleware/auth';
import {
  registerUser, loginUser, validateSession, logoutSession,
  createAdminSession, isAdminSession, updateAvatar, getUser, changePassword,
} from '../services/users';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) { res.status(400).json({ error: 'Faltan campos' }); return; }
  if (username.length < 2 || username.length > 20) { res.status(400).json({ error: 'Nombre de 2-20 caracteres' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' }); return; }
  if (/[<>"'&]/.test(username)) { res.status(400).json({ error: 'Nombre contiene caracteres no permitidos' }); return; }

  const result = registerUser(username, password);
  if (!result.ok) {
    res.status(result.code === 'USERNAME_TAKEN' ? 409 : 400).json({ error: result.code === 'USERNAME_TAKEN' ? 'El nombre de usuario ya existe' : 'Error al registrar' });
    return;
  }
  const loginResult = loginUser(username, password);
  if (!loginResult.ok) { res.status(500).json({ error: 'Error al crear sesión' }); return; }
  res.cookie('wj_session', loginResult.sessionToken, { httpOnly: true, sameSite: 'strict' });
  res.json({ ok: true, username, recoveryCode: result.recoveryCode });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) { res.status(400).json({ error: 'Faltan campos' }); return; }
  if (username === process.env['ADMIN_USERNAME'] && password === process.env['ADMIN_PASSWORD']) {
    const token = createAdminSession(username);
    res.cookie('wj_session', token, { httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true, username, avatar: null, isAdmin: true });
    return;
  }
  const result = loginUser(username, password);
  if (!result.ok) { res.status(401).json({ error: 'Usuario o contraseña incorrectos' }); return; }
  res.cookie('wj_session', result.sessionToken, { httpOnly: true, sameSite: 'strict' });
  res.json({ ok: true, username: result.username, avatar: result.avatar, isAdmin: false });
});

authRouter.post('/logout', (req, res) => {
  logoutSession(parseCookies(req.headers.cookie)['wj_session']);
  res.clearCookie('wj_session');
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['wj_session'];
  const username = validateSession(token);
  if (!username) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const user = getUser(username);
  res.json({ username, avatar: user?.avatar ?? null, isAdmin: isAdminSession(token), recoveryCode: user?.recoveryCode ?? null });
});

authRouter.put('/password', sessionAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body as Record<string, string | undefined>;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Faltan campos' }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' }); return; }
  const user = getUser(req.sessionUsername);
  if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
  // Verify current password via login flow (reuse changePassword with recoveryCode = currentPassword hash check)
  // Instead: do a direct login check
  const loginResult = loginUser(req.sessionUsername, currentPassword);
  if (!loginResult.ok) { res.status(401).json({ error: 'Contraseña actual incorrecta' }); return; }
  const result = changePassword(req.sessionUsername, user.recoveryCode, newPassword);
  if (!result.ok) { res.status(400).json({ error: result.code }); return; }
  res.json({ ok: true, newRecoveryCode: result.newRecoveryCode });
});

authRouter.put('/avatar', sessionAuth, (req, res) => {
  const { avatar } = req.body as { avatar?: string | null };
  const result = updateAvatar(req.sessionUsername, avatar ?? null);
  if (!result.ok) {
    res.status(result.code === 'AVATAR_TOO_LARGE' ? 413 : 400).json({ error: result.code });
    return;
  }
  res.json({ ok: true });
});

authRouter.post('/recover', (req, res) => {
  const { username, recoveryCode, newPassword } = req.body as Record<string, string | undefined>;
  if (!username || !recoveryCode || !newPassword) { res.status(400).json({ error: 'Faltan campos' }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' }); return; }
  const result = changePassword(username, recoveryCode, newPassword);
  if (!result.ok) {
    const status = result.code === 'INVALID_CODE' ? 401 : result.code === 'USER_NOT_FOUND' ? 404 : 400;
    const msgs: Record<string, string> = { INVALID_CODE: 'Código de recuperación incorrecto', USER_NOT_FOUND: 'Usuario no encontrado' };
    res.status(status).json({ error: msgs[result.code] ?? 'Error al recuperar cuenta' });
    return;
  }
  res.json({ ok: true, newRecoveryCode: result.newRecoveryCode });
});
