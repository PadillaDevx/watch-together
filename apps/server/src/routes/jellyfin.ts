import { Router } from 'express';
import { adminAuth, sessionAuth } from '../middleware/auth';
import {
    setConfig,
    getConfig,
    testConnection,
    searchItems,
    buildProxiedStreamUrl,
    buildProxiedImageUrl,
} from '../services/jellyfin';

export const adminRouter = Router();
export const userRouter = Router();

const ITEM_ID_RE = /^[a-zA-Z0-9]+$/;

// ─── Admin routes ─────────────────────────────────────────────────────────────

adminRouter.post('/config', adminAuth, async (req, res) => {
    const { baseUrl, apiKey } = req.body as { baseUrl?: unknown; apiKey?: unknown };

    if (typeof baseUrl !== 'string' || baseUrl.trim() === '' ||
        typeof apiKey !== 'string' || apiKey.trim() === '') {
        res.status(400).json({ error: 'baseUrl and apiKey are required and must be non-empty strings' });
        return;
    }

    try {
        await setConfig(baseUrl.trim(), apiKey.trim());

        const result = await testConnection();
        if (!result.ok) {
            res.status(400).json({ error: result.error ?? 'Connection failed' });
            return;
        }

        res.json({ ok: true, serverName: result.serverName });
    } catch { res.status(500).json({ error: 'Error interno' }); }
});

adminRouter.get('/status', adminAuth, async (_req, res) => {
    const config = getConfig();

    if (config === null) {
        res.json({ configured: false });
        return;
    }

    const result = await testConnection();
    res.json({
        configured: true,
        ok: result.ok,
        serverName: result.serverName,
        baseUrl: config.baseUrl,
    });
});

// ─── User routes ──────────────────────────────────────────────────────────────

userRouter.get('/search', sessionAuth, async (req, res) => {
    const q = req.query['q'];

    if (typeof q !== 'string' || q.trim() === '' || q.length > 100) {
        res.status(400).json({ error: 'Query param "q" must be a non-empty string with max 100 characters' });
        return;
    }

    if (getConfig() === null) {
        res.status(503).json({ error: 'Jellyfin not configured' });
        return;
    }

    const items = await searchItems(q.trim());
    const results = items.map((item) => ({
        ...item,
        imageUrl: buildProxiedImageUrl(item.id),
        streamUrl: buildProxiedStreamUrl(item.id),
    }));

    res.json(results);
});

userRouter.get('/stream-url/:itemId', sessionAuth, (req, res) => {
    const itemId = req.params['itemId'] ?? '';

    if (!ITEM_ID_RE.test(itemId)) {
        res.status(400).json({ error: 'Invalid itemId' });
        return;
    }

    if (getConfig() === null) {
        res.status(503).json({ error: 'Jellyfin not configured' });
        return;
    }

    res.json({ streamUrl: buildProxiedStreamUrl(itemId) });
});
