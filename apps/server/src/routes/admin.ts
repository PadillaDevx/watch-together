import { Router } from 'express';
import type { Server } from 'socket.io';
import { adminAuth, sessionAuth, parseCookies } from '../middleware/auth';
import { isAdminSession } from '../services/users';
import { listUsers } from '../services/users';
import { createRoom, deleteRoom, deleteAllRooms, getRoomList, _rooms } from '../services/rooms';
import { generateToken, listTokens, revokeAllTokens, signAdminCookie } from '../services/tokens';
import { getAllLists, addList, addListFromContent, updateList, deleteList, refreshList } from '../services/iptv';
import { getLocalIP } from '../utils';
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function createAdminRouter(io: IO) {
  const router = Router();

  router.get('/users', adminAuth, async (_req, res) => {
    try { res.json({ users: await listUsers() }); }
    catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (username !== process.env['ADMIN_USERNAME'] || password !== process.env['ADMIN_PASSWORD']) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }
    res.cookie('wj_admin', signAdminCookie(password ?? ''), { httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });

  router.post('/rooms', sessionAuth, async (req, res) => {
    const { name, maxUsers, isOpen, sourceType, iptvListId } = req.body as { name?: string; maxUsers?: number; isOpen?: boolean; sourceType?: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'; iptvListId?: string };
    if (!name) { res.status(400).json({ error: 'Falta nombre de sala' }); return; }
    try {
      const room = await createRoom(name, Number(maxUsers) || 10, isOpen !== false, sourceType ?? 'youtube', iptvListId, req.sessionUsername);
      io.emit('room-list', getRoomList());
      res.json(room);
    } catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.delete('/rooms/:id', sessionAuth, async (req, res) => {
    const roomId = req.params['id'] ?? '';
    const room = _rooms.get(roomId);
    const cookies = parseCookies(req.headers.cookie);
    const isAdmin = isAdminSession(cookies['wj_session']);
    const isCreator = room?.createdByUsername === req.sessionUsername;
    if (!isAdmin && !isCreator) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      await deleteRoom(roomId);
      io.emit('room-list', getRoomList());
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.delete('/rooms', adminAuth, async (_req, res) => {
    try {
      await deleteAllRooms();
      io.emit('room-list', getRoomList());
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.post('/invite', adminAuth, async (_req, res) => {
    const baseUrl = `http://${getLocalIP()}:${process.env['PORT'] ?? 3000}`;
    try { res.json(await generateToken(baseUrl)); }
    catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.get('/tokens', adminAuth, async (_req, res) => {
    try { res.json({ tokens: await listTokens() }); }
    catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.delete('/tokens', adminAuth, async (_req, res) => {
    try { await revokeAllTokens(); res.json({ ok: true }); }
    catch { res.status(500).json({ error: 'Error interno' }); }
  });

  router.get('/connections', adminAuth, (_req, res) => {
    const connections = [];
    for (const room of _rooms.values()) {
      for (const [socketId, userData] of room.users.entries()) {
        connections.push({ roomId: room.id, roomName: room.name, socketId, username: userData.username, joinedAt: userData.joinedAt });
      }
    }
    res.json(connections);
  });

  // ─── IPTV List Management ──────────────────────────────────────────────────

  router.get('/iptv', adminAuth, (_req, res) => {
    res.json(getAllLists());
  });

  router.post('/iptv', adminAuth, async (req, res) => {
    const { name, url } = req.body as { name?: string; url?: string };
    if (!name || !url) { res.status(400).json({ error: 'Faltan campos name y url' }); return; }
    try { new URL(url); } catch { res.status(400).json({ error: 'URL inválida — debe incluir el protocolo (https://...)' }); return; }
    if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'Solo se permiten URLs con protocolo http:// o https://' }); return; }
    try {
      const list = await addList(name, url);
      res.json(list);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.post('/iptv/upload', adminAuth, async (req, res) => {
    const { name, content } = req.body as { name?: string; content?: string };
    if (!name || !content) { res.status(400).json({ error: 'Faltan campos name y content' }); return; }
    try {
      const list = await addListFromContent(name.trim(), content);
      res.json(list);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.put('/iptv/:id', adminAuth, async (req, res) => {
    const { name, url } = req.body as { name?: string; url?: string };
    if (url) {
      try { new URL(url); } catch { res.status(400).json({ error: 'URL inválida — debe incluir el protocolo (https://...)' }); return; }
      if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'Solo se permiten URLs con protocolo http:// o https://' }); return; }
    }
    try {
      const list = await updateList(req.params['id'] ?? '', name, url);
      res.json(list);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.delete('/iptv/:id', adminAuth, async (req, res) => {
    try { await deleteList(req.params['id'] ?? ''); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.post('/iptv/:id/refresh', adminAuth, async (req, res) => {
    try {
      const list = await refreshList(req.params['id'] ?? '');
      res.json(list);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  return router;
}
