import crypto from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/index';
import { inviteTokens } from '../db/schema';

const TOKEN_TTL_MS = 86_400_000; // 24 hours

export async function generateToken(baseUrl: string): Promise<{ token: string; url: string }> {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(inviteTokens).values({ token, expiresAt });

  return { token, url: `${baseUrl}/join/${token}` };
}

export async function validateToken(token: string): Promise<boolean> {
  const [entry] = await db.select({ expiresAt: inviteTokens.expiresAt })
    .from(inviteTokens)
    .where(eq(inviteTokens.token, token))
    .limit(1);

  if (!entry) return false;
  return entry.expiresAt.getTime() > Date.now();
}

export async function revokeAllTokens(): Promise<void> {
  await db.delete(inviteTokens);
}

export async function listTokens() {
  const rows = await db.select({
    token: inviteTokens.token,
    createdAt: inviteTokens.createdAt,
    usedBy: inviteTokens.usedBy,
    expiresAt: inviteTokens.expiresAt,
  }).from(inviteTokens);

  return rows.map(r => ({
    token: r.token,
    createdAt: r.createdAt.getTime(),
    usedBy: r.usedBy,
    expiresAt: r.expiresAt.getTime(),
  }));
}

// ─── Admin cookie helpers (no DB needed) ─────────────────────────────────────

export function signAdminCookie(password: string): string {
  return crypto.createHmac('sha256', password).update('wj_admin').digest('hex');
}

export function verifyAdminCookie(cookie: string, password: string): boolean {
  const expected = signAdminCookie(password);
  try {
    return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Cleanup expired tokens ───────────────────────────────────────────────────

export async function purgeExpiredTokens(): Promise<void> {
  await db.delete(inviteTokens).where(lt(inviteTokens.expiresAt, new Date()));
}
