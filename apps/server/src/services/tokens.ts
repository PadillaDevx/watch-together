import crypto from 'crypto';
import type { TokenRecord } from '../types';

const tokens = new Map<string, TokenRecord>();
const TOKEN_TTL_MS = 86_400_000;

export function generateToken(baseUrl: string): { token: string; url: string } {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { createdAt: Date.now(), usedBy: null });
  return { token, url: `${baseUrl}/join/${token}` };
}

export function validateToken(token: string): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  return Date.now() - entry.createdAt <= TOKEN_TTL_MS;
}

export function revokeAllTokens(): void {
  tokens.clear();
}

export function listTokens() {
  return Array.from(tokens.entries()).map(([token, data]) => ({
    token,
    createdAt: data.createdAt,
    usedBy: data.usedBy,
  }));
}

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
