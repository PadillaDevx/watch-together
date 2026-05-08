import { Router } from 'express';
import https from 'https';
import http from 'http';
import { sessionAuth } from '../middleware/auth';
import { getEntries, getAllLists } from '../services/iptv';

export const iptvRouter = Router();

// GET /api/iptv/proxy?url=<encoded> — CORS proxy for stream manifests and segments
// Must come BEFORE /:id/entries to avoid route shadowing
iptvRouter.get('/proxy', sessionAuth, (req, res) => {
  const rawUrl = req.query['url'];

  if (typeof rawUrl !== 'string' || !rawUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Security: only relay URLs whose hostname is registered in an IPTV list
  const allowedHostnames = getAllLists().flatMap((list) => {
    try { return [new URL(list.url).hostname]; } catch { return []; }
  });

  if (!allowedHostnames.includes(targetUrl.hostname)) {
    res.status(403).json({ error: 'Domain not whitelisted' });
    return;
  }

  const protocol = targetUrl.protocol === 'https:' ? https : http;
  const reqOptions = {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 WatchTogether/1.0',
    },
  };

  const proxyReq = protocol.get(targetUrl.toString(), reqOptions, (upstream) => {
    const contentType = upstream.headers['content-type'] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'max-age=5');
    // Do not forward sensitive response headers
    upstream.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream error', detail: err.message });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Upstream timeout' });
    }
  });
});

// GET /api/iptv/:id/entries — list parsed entries for a given IPTV list
iptvRouter.get('/:id/entries', sessionAuth, (req, res) => {
  const entries = getEntries(req.params['id'] ?? '');
  res.json(entries);
});
