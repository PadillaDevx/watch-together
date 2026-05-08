import type { Request, Response, NextFunction } from 'express';
import { validateSession, isAdminSession } from '../services/users';
import { verifyAdminCookie } from '../services/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionUsername: string;
    }
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return cookies;
}

export function sessionAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const username = validateSession(cookies['wj_session']);
  if (!username) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.sessionUsername = username;
  next();
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  if (isAdminSession(cookies['wj_session'])) { next(); return; }
  const adminCookie = cookies['wj_admin'];
  if (adminCookie && verifyAdminCookie(adminCookie, process.env['ADMIN_PASSWORD'] ?? '')) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}
