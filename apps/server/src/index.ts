import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { searchRouter } from './routes/search';
import { iptvRouter } from './routes/iptv';
import { adminRouter as jellyfinAdminRouter, userRouter as jellyfinUserRouter } from './routes/jellyfin';
import { getRoomList } from './services/rooms';
import { validateToken } from './services/tokens';
import { setupSocket } from './socket/index';
import { getLocalIP } from './utils';
import { connectWithRetry } from './db/index';
import { initRooms } from './services/rooms';
import { initIptv } from './services/iptv';
import { initJellyfin } from './services/jellyfin';
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from './types';

const PORT = Number(process.env['PORT'] ?? 3001);
const isDev = process.env['NODE_ENV'] === 'development';

const app = express();
const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: isDev
    ? { origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }
    : { origin: false },
});

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', createAdminRouter(io));
app.use('/api/admin/jellyfin', jellyfinAdminRouter);
app.use('/api/search', searchRouter);
app.use('/api/iptv', iptvRouter);
app.use('/api/jellyfin', jellyfinUserRouter);
app.get('/api/rooms', (_req, res) => res.json({ rooms: getRoomList() }));
app.get('/join/:token', async (req, res) => {
  await validateToken(req.params['token'] ?? '');
  res.redirect('/');
});

// Serve built SPA in production
if (!isDev) {
  const dist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

setupSocket(io);

async function main() {
  await connectWithRetry();
  await Promise.all([
    initRooms(),
    initIptv(),
    initJellyfin(),
  ]);

  httpServer.listen(PORT, () => {
    const ip = getLocalIP();
    console.log(`[WJ] Server →  http://localhost:${PORT}  |  http://${ip}:${PORT}`);
  });
}

main().catch(err => {
  console.error('[WJ] Fatal startup error:', err);
  process.exit(1);
});
