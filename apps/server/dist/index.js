"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = require("./routes/auth");
const admin_1 = require("./routes/admin");
const search_1 = require("./routes/search");
const iptv_1 = require("./routes/iptv");
const jellyfin_1 = require("./routes/jellyfin");
const library_1 = require("./routes/library");
const rooms_1 = require("./services/rooms");
const tokens_1 = require("./services/tokens");
const index_1 = require("./socket/index");
const utils_1 = require("./utils");
const index_2 = require("./db/index");
const rooms_2 = require("./services/rooms");
const iptv_2 = require("./services/iptv");
const jellyfin_2 = require("./services/jellyfin");
const PORT = Number(process.env['PORT'] ?? 3001);
const isDev = process.env['NODE_ENV'] === 'development';
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
const io = new socket_io_1.Server(httpServer, {
    cors: isDev
        ? { origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }
        : { origin: false },
});
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
// CSP: restrict frame-src to known embed domains
app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "frame-src 'self' cubeembed.rpmvid.com *.cubeembed.rpmvid.com");
    next();
});
// Routes
app.use('/api/auth', auth_1.authRouter);
app.use('/api/admin', (0, admin_1.createAdminRouter)(io));
app.use('/api/admin/jellyfin', jellyfin_1.adminRouter);
app.use('/api/search', search_1.searchRouter);
app.use('/api/iptv', iptv_1.iptvRouter);
app.use('/api/jellyfin', jellyfin_1.userRouter);
app.use('/api/library', (0, library_1.createLibraryRouter)());
app.get('/api/rooms', (_req, res) => res.json({ rooms: (0, rooms_1.getRoomList)() }));
app.get('/join/:token', async (req, res) => {
    await (0, tokens_1.validateToken)(req.params['token'] ?? '');
    res.redirect('/');
});
// Serve built SPA in production
if (!isDev) {
    const dist = path_1.default.resolve(__dirname, '../../client/dist');
    app.use(express_1.default.static(dist));
    app.get('*', (_req, res) => res.sendFile(path_1.default.join(dist, 'index.html')));
}
(0, index_1.setupSocket)(io);
async function main() {
    await (0, index_2.connectWithRetry)();
    await Promise.all([
        (0, rooms_2.initRooms)(),
        (0, iptv_2.initIptv)(),
        (0, jellyfin_2.initJellyfin)(),
    ]);
    httpServer.listen(PORT, () => {
        const ip = (0, utils_1.getLocalIP)();
        console.log(`[WJ] Server →  http://localhost:${PORT}  |  http://${ip}:${PORT}`);
    });
}
main().catch(err => {
    console.error('[WJ] Fatal startup error:', err);
    process.exit(1);
});
