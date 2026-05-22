import { Router, type Request, type Response } from 'express';
import { sessionAuth, adminAuth } from '../middleware/auth';
import { fetchSeriesList, fetchSerieDetail, resolveEpisodeEmbed, fetchAllSeries, toggleSerieActive } from '../services/libraryService';

/**
 * Creates the Express router for the `/api/library` namespace.
 *
 * Routes:
 * - `GET /series` — list active series
 * - `GET /series/:serieId/episodes` — get episodes for a serie
 * - `GET /episode?path=...` — resolve iframe embed URL for an episode
 *
 * All routes require session authentication.
 *
 * @returns Configured Express `Router`.
 */
export function createLibraryRouter(): Router {
    const router = Router();

    // GET /api/library/series — list all active series
    router.get('/series', sessionAuth, async (_req: Request, res: Response) => {
        try {
            const series = await fetchSeriesList();
            res.json(series);
        } catch {
            res.status(502).json({ error: 'No se pudo conectar a la biblioteca' });
        }
    });

    // GET /api/library/series/catalog — full catalog (admin only)
    router.get('/series/catalog', adminAuth, (_req: Request, res: Response) => {
        res.json(fetchAllSeries());
    });

    // PATCH /api/library/series/:serieId — toggle active state (admin only)
    router.patch('/series/:serieId', adminAuth, (req: Request, res: Response) => {
        const { serieId } = req.params;
        const { active } = req.body as { active?: boolean };

        if (!serieId || !/^[a-z0-9-]{1,100}$/.test(serieId)) {
            res.status(400).json({ error: 'ID de serie inválido' });
            return;
        }
        if (typeof active !== 'boolean') {
            res.status(400).json({ error: 'El campo "active" debe ser boolean' });
            return;
        }

        try {
            const updated = toggleSerieActive(serieId, active);
            res.json(updated);
        } catch {
            res.status(404).json({ error: 'Serie no encontrada' });
        }
    });

    // GET /api/library/series/:serieId/episodes — get episodes for a series
    router.get('/series/:serieId/episodes', sessionAuth, async (req: Request, res: Response) => {
        const { serieId } = req.params;

        if (!serieId || !/^[a-z0-9-]{1,100}$/.test(serieId)) {
            res.status(400).json({ error: 'ID de serie inválido' });
            return;
        }

        try {
            const detail = await fetchSerieDetail(serieId);
            res.json(detail);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('no encontrada en library.json')) {
                res.status(404).json({ error: 'Serie no encontrada' });
            } else {
                res.status(502).json({ error: 'No se pudieron obtener los episodios de la serie' });
            }
        }
    });

    // GET /api/library/episode?path=... — resolve iframe embed URL for an episode
    router.get('/episode', sessionAuth, async (req: Request, res: Response) => {
        const { path: episodePath } = req.query;

        if (typeof episodePath !== 'string' || episodePath.length === 0 || episodePath.length > 500) {
            res.status(400).json({ error: 'Parámetro path inválido' });
            return;
        }

        try {
            const embedUrl = await resolveEpisodeEmbed(episodePath);
            res.json({ embedUrl });
        } catch (err) {
            console.error('[Library] resolveEpisodeEmbed error:', err instanceof Error ? err.message : err);
            res.status(502).json({ error: 'No se pudo obtener el embed del episodio' });
        }
    });

    return router;
}
