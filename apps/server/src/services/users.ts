import crypto from 'crypto';
import { sql, lt, gte } from 'drizzle-orm';
import { db } from '../db/index';
import { users, sessions as sessionsTable } from '../db/schema';

// ─── Session store (in-memory + DB-backed for persistence) ────────────────

interface SessionData {
  username: string;
  isAdmin?: boolean;
  createdAt: number;
}

const sessionsMap = new Map<string, SessionData>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Called at startup: loads valid sessions from the DB into the in-memory map */
export async function initSessions(): Promise<void> {
  try {
    const now = new Date();
    await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now));
    const rows = await db.select().from(sessionsTable).where(gte(sessionsTable.expiresAt, now));
    for (const row of rows) {
      sessionsMap.set(row.token, {
        username: row.username,
        isAdmin: row.isAdmin,
        createdAt: row.createdAt.getTime(),
      });
    }
    console.log(`[WJ] Restored ${rows.length} session(s) from DB`);
  } catch (err) {
    console.error('[WJ] Failed to load sessions from DB (non-fatal):', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha256').toString('hex');
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[bytes[i]! % chars.length];
  return code.slice(0, 5) + '-' + code.slice(5);
}

// ─── User CRUD ────────────────────────────────────────────────────────────────

export async function registerUser(username: string, password: string) {
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (existing.length > 0) return { ok: false as const, code: 'USERNAME_TAKEN' };

  const salt = crypto.randomBytes(16).toString('hex');
  const recoveryCode = generateRecoveryCode();

  await db.insert(users).values({
    username,
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    recoveryCode,
    avatar: null,
    isAdmin: false,
  });

  return { ok: true as const, recoveryCode };
}

export async function loginUser(username: string, password: string) {
  const [user] = await db.select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

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
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  sessionsMap.set(token, { username: user.username, createdAt: Date.now() });
  // Persist to DB (fire-and-forget; in-memory map is the authoritative source during runtime)
  db.insert(sessionsTable).values({ token, username: user.username, isAdmin: false, expiresAt }).catch((err: unknown) => console.error('[WJ] Failed to persist session:', err));
  return { ok: true as const, sessionToken: token, username: user.username, avatar: user.avatar };
}

export function validateSession(token: string | undefined): string | null {
  if (!token) return null;
  const s = sessionsMap.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessionsMap.delete(token);
    db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date())).catch(() => {});
    return null;
  }
  return s.username;
}

export function logoutSession(token: string | undefined): void {
  if (!token) return;
  sessionsMap.delete(token);
  db.delete(sessionsTable).where(sql`${sessionsTable.token} = ${token}`).catch((err: unknown) => console.error('[WJ] Failed to delete session from DB:', err));
}

export function createAdminSession(username: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  sessionsMap.set(token, { username, isAdmin: true, createdAt: Date.now() });
  db.insert(sessionsTable).values({ token, username, isAdmin: true, expiresAt }).catch((err: unknown) => console.error('[WJ] Failed to persist admin session:', err));
  // Garantiza que el admin tenga un registro en users para poder guardar avatar, etc.
  db.insert(users).values({
    username,
    passwordHash: '',
    passwordSalt: '',
    recoveryCode: '',
    avatar: null,
    isAdmin: true,
  }).onConflictDoNothing().catch((err: unknown) => console.error('[WJ] Failed to ensure admin user record:', err));
  return token;
}

export function isAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return sessionsMap.get(token)?.isAdmin === true;
}

export async function updateAvatar(username: string, avatarDataUrl: string | null) {
  const MAX_AVATAR_SIZE = 700_000;
  const MAX_URL_LENGTH = 2048;
  if (avatarDataUrl) {
    const isDataUrl = avatarDataUrl.startsWith('data:image/');
    const isHttpsUrl = avatarDataUrl.startsWith('https://');
    if (!isDataUrl && !isHttpsUrl) {
      console.warn('[WJ Avatar] Invalid avatar payload', {
        username,
        prefix: avatarDataUrl.slice(0, 32),
      });
      return { ok: false as const, code: 'INVALID_AVATAR' };
    }
    if (isHttpsUrl && avatarDataUrl.length > MAX_URL_LENGTH) {
      return { ok: false as const, code: 'INVALID_AVATAR' };
    }
  }
  if (avatarDataUrl && avatarDataUrl.startsWith('data:image/') && avatarDataUrl.length > MAX_AVATAR_SIZE) {
    console.warn('[WJ Avatar] Avatar too large', {
      username,
      length: avatarDataUrl.length,
      max: MAX_AVATAR_SIZE,
    });
    return { ok: false as const, code: 'AVATAR_TOO_LARGE' };
  }

  const result = await db.update(users)
    .set({ avatar: avatarDataUrl ?? null })
    .where(sql`lower(${users.username}) = lower(${username})`)
    .returning({ id: users.id });

  if (result.length === 0) return { ok: false as const, code: 'USER_NOT_FOUND' };
  console.log('[WJ Avatar] DB avatar updated', {
    username,
    hasAvatar: avatarDataUrl !== null,
  });
  return { ok: true as const };
}

export async function getUser(username: string) {
  const [u] = await db.select({
    username: users.username,
    avatar: users.avatar,
    recoveryCode: users.recoveryCode,
    createdAt: users.createdAt,
  })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!u) return null;
  return { username: u.username, avatar: u.avatar, recoveryCode: u.recoveryCode, createdAt: u.createdAt.getTime() };
}

export async function listUsers() {
  const all = await db.select({
    username: users.username,
    avatar: users.avatar,
    recoveryCode: users.recoveryCode,
    createdAt: users.createdAt,
  }).from(users);

  return all.map(u => ({
    username: u.username,
    avatar: u.avatar,
    recoveryCode: u.recoveryCode,
    createdAt: u.createdAt.getTime(),
  }));
}

export async function changePassword(username: string, recoveryCode: string, newPassword: string) {
  const [user] = await db.select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!user) return { ok: false as const, code: 'USER_NOT_FOUND' };
  if (user.recoveryCode !== recoveryCode) return { ok: false as const, code: 'INVALID_CODE' };

  const salt = crypto.randomBytes(16).toString('hex');
  const newRecoveryCode = generateRecoveryCode();

  await db.update(users)
    .set({
      passwordHash: hashPassword(newPassword, salt),
      passwordSalt: salt,
      recoveryCode: newRecoveryCode,
    })
    .where(sql`lower(${users.username}) = lower(${username})`);

  return { ok: true as const, newRecoveryCode };
}
