import crypto from 'crypto';
import type { UserRecord, SessionData } from '../types';

const users = new Map<string, UserRecord>();
const sessions = new Map<string, SessionData>();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AVATAR_SIZE = 700_000;

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha256').toString('hex');
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[bytes[i] % chars.length];
  return code.slice(0, 5) + '-' + code.slice(5);
}

export function registerUser(username: string, password: string) {
  const key = username.toLowerCase();
  if (users.has(key)) return { ok: false as const, code: 'USERNAME_TAKEN' };
  const salt = crypto.randomBytes(16).toString('hex');
  const recoveryCode = generateRecoveryCode();
  users.set(key, {
    username,
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    recoveryCode,
    avatar: null,
    createdAt: Date.now(),
  });
  return { ok: true as const, recoveryCode };
}

export function loginUser(username: string, password: string) {
  const user = users.get(username.toLowerCase());
  if (!user) return { ok: false as const, code: 'INVALID_CREDENTIALS' };
  const hash = hashPassword(password, user.passwordSalt);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) {
      return { ok: false as const, code: 'INVALID_CREDENTIALS' };
    }
  } catch {
    return { ok: false as const, code: 'INVALID_CREDENTIALS' };
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: user.username, createdAt: Date.now() });
  return { ok: true as const, sessionToken: token, username: user.username, avatar: user.avatar };
}

export function validateSession(token: string | undefined): string | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s.username;
}

export function logoutSession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function createAdminSession(username: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, isAdmin: true, createdAt: Date.now() });
  return token;
}

export function isAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return sessions.get(token)?.isAdmin === true;
}

export function updateAvatar(username: string, avatarDataUrl: string | null) {
  const user = users.get(username.toLowerCase());
  if (!user) return { ok: false as const, code: 'USER_NOT_FOUND' };
  if (avatarDataUrl && !avatarDataUrl.startsWith('data:image/')) {
    return { ok: false as const, code: 'INVALID_AVATAR' };
  }
  if (avatarDataUrl && avatarDataUrl.length > MAX_AVATAR_SIZE) {
    return { ok: false as const, code: 'AVATAR_TOO_LARGE' };
  }
  user.avatar = avatarDataUrl ?? null;
  return { ok: true as const };
}

export function getUser(username: string) {
  const u = users.get(username.toLowerCase());
  if (!u) return null;
  return { username: u.username, avatar: u.avatar, recoveryCode: u.recoveryCode, createdAt: u.createdAt };
}

export function listUsers() {
  return Array.from(users.values()).map(u => ({
    username: u.username,
    avatar: u.avatar,
    recoveryCode: u.recoveryCode,
    createdAt: u.createdAt,
  }));
}

export function changePassword(username: string, recoveryCode: string, newPassword: string) {
  const user = users.get(username.toLowerCase());
  if (!user) return { ok: false as const, code: 'USER_NOT_FOUND' };
  if (user.recoveryCode !== recoveryCode) return { ok: false as const, code: 'INVALID_CODE' };
  const salt = crypto.randomBytes(16).toString('hex');
  user.passwordHash = hashPassword(newPassword, salt);
  user.passwordSalt = salt;
  const newRecoveryCode = generateRecoveryCode();
  user.recoveryCode = newRecoveryCode;
  return { ok: true as const, newRecoveryCode };
}
