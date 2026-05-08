"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRouter = createAdminRouter;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const users_1 = require("../services/users");
const rooms_1 = require("../services/rooms");
const tokens_1 = require("../services/tokens");
const iptv_1 = require("../services/iptv");
const utils_1 = require("../utils");
function createAdminRouter(io) {
    const router = (0, express_1.Router)();
    router.get('/users', auth_1.adminAuth, (_req, res) => {
        res.json({ users: (0, users_1.listUsers)() });
    });
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (username !== process.env['ADMIN_USERNAME'] || password !== process.env['ADMIN_PASSWORD']) {
            res.status(401).json({ error: 'Credenciales incorrectas' });
            return;
        }
        res.cookie('wj_admin', (0, tokens_1.signAdminCookie)(password ?? ''), { httpOnly: true, sameSite: 'strict' });
        res.json({ ok: true });
    });
    router.post('/rooms', auth_1.adminAuth, (req, res) => {
        const { name, maxUsers, isOpen, sourceType, iptvListId } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Falta nombre de sala' });
            return;
        }
        const room = (0, rooms_1.createRoom)(name, Number(maxUsers) || 10, isOpen !== false, sourceType ?? 'youtube', iptvListId);
        io.emit('room-list', (0, rooms_1.getRoomList)());
        res.json(room);
    });
    router.delete('/rooms/:id', auth_1.adminAuth, (req, res) => {
        (0, rooms_1.deleteRoom)(req.params['id'] ?? '');
        io.emit('room-list', (0, rooms_1.getRoomList)());
        res.json({ ok: true });
    });
    router.delete('/rooms', auth_1.adminAuth, (_req, res) => {
        (0, rooms_1.deleteAllRooms)();
        io.emit('room-list', (0, rooms_1.getRoomList)());
        res.json({ ok: true });
    });
    router.post('/invite', auth_1.adminAuth, (_req, res) => {
        const baseUrl = `http://${(0, utils_1.getLocalIP)()}:${process.env['PORT'] ?? 3000}`;
        res.json((0, tokens_1.generateToken)(baseUrl));
    });
    router.get('/tokens', auth_1.adminAuth, (_req, res) => {
        res.json({ tokens: (0, tokens_1.listTokens)() });
    });
    router.delete('/tokens', auth_1.adminAuth, (_req, res) => {
        (0, tokens_1.revokeAllTokens)();
        res.json({ ok: true });
    });
    router.get('/connections', auth_1.adminAuth, (_req, res) => {
        const connections = [];
        for (const room of rooms_1._rooms.values()) {
            for (const [socketId, userData] of room.users.entries()) {
                connections.push({ roomId: room.id, roomName: room.name, socketId, username: userData.username, joinedAt: userData.joinedAt });
            }
        }
        res.json(connections);
    });
    // ─── IPTV List Management ──────────────────────────────────────────────────
    router.get('/iptv', auth_1.adminAuth, (_req, res) => {
        res.json((0, iptv_1.getAllLists)());
    });
    router.post('/iptv', auth_1.adminAuth, async (req, res) => {
        const { name, url } = req.body;
        if (!name || !url) {
            res.status(400).json({ error: 'Faltan campos name y url' });
            return;
        }
        try {
            const list = await (0, iptv_1.addList)(name, url);
            res.json(list);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.put('/iptv/:id', auth_1.adminAuth, async (req, res) => {
        const { name, url } = req.body;
        try {
            const list = await (0, iptv_1.updateList)(req.params['id'] ?? '', name, url);
            res.json(list);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.delete('/iptv/:id', auth_1.adminAuth, (req, res) => {
        (0, iptv_1.deleteList)(req.params['id'] ?? '');
        res.json({ ok: true });
    });
    router.post('/iptv/:id/refresh', auth_1.adminAuth, async (req, res) => {
        try {
            const list = await (0, iptv_1.refreshList)(req.params['id'] ?? '');
            res.json(list);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
