"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = exports.adminRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const jellyfin_1 = require("../services/jellyfin");
exports.adminRouter = (0, express_1.Router)();
exports.userRouter = (0, express_1.Router)();
const ITEM_ID_RE = /^[a-zA-Z0-9]+$/;
// ─── Admin routes ─────────────────────────────────────────────────────────────
exports.adminRouter.post('/config', auth_1.adminAuth, async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    if (typeof baseUrl !== 'string' || baseUrl.trim() === '' ||
        typeof apiKey !== 'string' || apiKey.trim() === '') {
        res.status(400).json({ error: 'baseUrl and apiKey are required and must be non-empty strings' });
        return;
    }
    try {
        await (0, jellyfin_1.setConfig)(baseUrl.trim(), apiKey.trim());
        const result = await (0, jellyfin_1.testConnection)();
        if (!result.ok) {
            res.status(400).json({ error: result.error ?? 'Connection failed' });
            return;
        }
        res.json({ ok: true, serverName: result.serverName });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.adminRouter.get('/status', auth_1.adminAuth, async (_req, res) => {
    const config = (0, jellyfin_1.getConfig)();
    if (config === null) {
        res.json({ configured: false });
        return;
    }
    const result = await (0, jellyfin_1.testConnection)();
    res.json({
        configured: true,
        ok: result.ok,
        serverName: result.serverName,
        baseUrl: config.baseUrl,
    });
});
// ─── User routes ──────────────────────────────────────────────────────────────
exports.userRouter.get('/search', auth_1.sessionAuth, async (req, res) => {
    const q = req.query['q'];
    if (typeof q !== 'string' || q.trim() === '' || q.length > 100) {
        res.status(400).json({ error: 'Query param "q" must be a non-empty string with max 100 characters' });
        return;
    }
    if ((0, jellyfin_1.getConfig)() === null) {
        res.status(503).json({ error: 'Jellyfin not configured' });
        return;
    }
    const items = await (0, jellyfin_1.searchItems)(q.trim());
    const results = items.map((item) => ({
        ...item,
        imageUrl: (0, jellyfin_1.buildProxiedImageUrl)(item.id),
        streamUrl: (0, jellyfin_1.buildProxiedStreamUrl)(item.id),
    }));
    res.json(results);
});
exports.userRouter.get('/stream-url/:itemId', auth_1.sessionAuth, (req, res) => {
    const itemId = req.params['itemId'] ?? '';
    if (!ITEM_ID_RE.test(itemId)) {
        res.status(400).json({ error: 'Invalid itemId' });
        return;
    }
    if ((0, jellyfin_1.getConfig)() === null) {
        res.status(503).json({ error: 'Jellyfin not configured' });
        return;
    }
    res.json({ streamUrl: (0, jellyfin_1.buildProxiedStreamUrl)(itemId) });
});
