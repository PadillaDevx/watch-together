import { Router, type Request, type Response } from 'express';
import https from 'https';
import http from 'http';
import { sessionAuth } from '../middleware/auth';
import { getEntries, getAllLists } from '../services/iptv';

export const iptvRouter = Router();

/**
 * CDN hostnames discovered while rewriting manifests that were served from
 * already-whitelisted entry URLs. These are implicitly trusted because they
 * came from inside an authorized manifest (e.g. Akamai/MediaStream CDN edges).
 * The set grows at runtime as streams are played and never shrinks — acceptable
 * for a local/LAN-only admin tool.
 */
const _discoveredCdnHostnames = new Set<string>();

/**
 * Allow an external service (e.g. Jellyfin) to pre-register its hostname so
 * the proxy will accept requests to that host without requiring it to appear
 * in an IPTV list entry first.
 */
export function trustHostname(hostname: string): void {
    _discoveredCdnHostnames.add(hostname);
}

const HLS_MIME_TYPES = new Set([
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/x-mpegurl',
    'audio/mpegurl',
    'text/plain',
]);

/**
 * Returns true when the response is an HLS playlist that needs URL rewriting.
 * Checks both Content-Type and the original URL extension.
 */
function isHlsPlaylist(contentType: string, url: URL): boolean {
    const ct = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
    return HLS_MIME_TYPES.has(ct) || url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.m3u');
}

/**
 * Resolve a URL found inside an M3U8 against the manifest's base URL,
 * register its hostname as trusted (it came from inside an already-authorized
 * manifest), then wrap it in the proxy route.
 */
function proxify(rawLine: string, baseUrl: URL): string {
    try {
        const abs = new URL(rawLine, baseUrl);
        // Trust any hostname embedded inside an already-authorized manifest
        _discoveredCdnHostnames.add(abs.hostname);
        return `/api/iptv/proxy?url=${encodeURIComponent(abs.toString())}`;
    } catch {
        return rawLine; // leave malformed lines untouched
    }
}

/**
 * Rewrite all URLs inside an HLS manifest so every segment / sub-playlist
 * is fetched through our proxy instead of directly by hls.js.
 *
 * Handles:
 *  - Segment lines (non-# lines that look like URLs or paths)
 *  - #EXT-X-STREAM-INF / #EXT-X-I-FRAME-STREAM-INF URI= attribute
 *  - #EXT-X-MEDIA URI= attribute
 *  - #EXT-X-KEY URI= attribute (encryption key URLs)
 *  - #EXT-X-MAP URI= attribute (init segment)
 */
function rewriteM3u8(content: string, baseUrl: URL): string {
    const lines = content.split('\n');
    const out: string[] = [];
    let nextIsUri = false; // the line after #EXT-X-STREAM-INF is always the playlist URI

    for (const raw of lines) {
        const line = raw.trimEnd();

        // Blank lines / comment-only tags we don't need to touch
        if (line === '') {
            out.push(line);
            nextIsUri = false;
            continue;
        }

        // Non-tag lines = segment or sub-playlist URI
        if (!line.startsWith('#') || nextIsUri) {
            nextIsUri = false;
            if (line.startsWith('#')) {
                // Edge-case: nextIsUri was set but we got another tag — shouldn't happen but guard anyway
                out.push(line);
            } else {
                out.push(proxify(line, baseUrl));
            }
            continue;
        }

        // Tags with URI= attribute
        const rewritten = line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
            return `URI="${proxify(uri, baseUrl)}"`;
        });
        out.push(rewritten);

        // Mark that the next non-tag line is a URI (applies to #EXT-X-STREAM-INF etc.)
        if (
            line.startsWith('#EXT-X-STREAM-INF') ||
            line.startsWith('#EXT-X-I-FRAME-STREAM-INF') ||
            line.startsWith('#EXTINF')
        ) {
            nextIsUri = true;
        }
    }

    return out.join('\n');
}

// ─── Fetch helper with redirect support ──────────────────────────────────────

function fetchWithRedirects(
    targetUrl: URL,
    hops: number,
    reqRes: Response,
    allowedHostnames: Set<string>,
): void {
    if (hops > 5) {
        if (!reqRes.headersSent) reqRes.status(502).json({ error: 'Too many redirects' });
        return;
    }

    const protocol = targetUrl.protocol === 'https:' ? https : http;
    const proxyReq = protocol.get(
        targetUrl.toString(),
        { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 WatchTogether/1.0' } },
        (upstream) => {
            const status = upstream.statusCode ?? 200;

            // Follow redirects (301/302/303/307/308)
            if (status >= 300 && status < 400 && upstream.headers['location']) {
                const location = upstream.headers['location'];
                upstream.resume(); // drain to free socket
                try {
                    const next = new URL(location, targetUrl);
                    // Persist redirect-target hostname so subsequent requests pass the whitelist
                    _discoveredCdnHostnames.add(next.hostname);
                    allowedHostnames.add(next.hostname);
                    fetchWithRedirects(next, hops + 1, reqRes, allowedHostnames);
                } catch {
                    if (!reqRes.headersSent) reqRes.status(502).json({ error: 'Bad redirect location' });
                }
                return;
            }

            const contentType = upstream.headers['content-type'] ?? 'application/octet-stream';

            if (isHlsPlaylist(contentType, targetUrl)) {
                // Buffer the manifest so we can rewrite its URLs
                const chunks: Buffer[] = [];
                upstream.on('data', (chunk: Buffer) => chunks.push(chunk));
                upstream.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf-8');
                    const rewritten = rewriteM3u8(raw, targetUrl);
                    reqRes.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    reqRes.setHeader('Cache-Control', 'max-age=3');
                    reqRes.setHeader('Access-Control-Allow-Origin', '*');
                    reqRes.end(rewritten);
                });
            } else {
                // Binary (TS segments, keys, etc.) — pipe straight through
                reqRes.setHeader('Content-Type', contentType);
                reqRes.setHeader('Cache-Control', 'max-age=5');
                reqRes.setHeader('Access-Control-Allow-Origin', '*');
                upstream.pipe(reqRes);
            }
        },
    );

    proxyReq.on('error', (err) => {
        if (!reqRes.headersSent) reqRes.status(502).json({ error: 'Upstream error', detail: err.message });
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!reqRes.headersSent) reqRes.status(504).json({ error: 'Upstream timeout' });
    });
}

// ─── Route ───────────────────────────────────────────────────────────────────

// GET /api/iptv/proxy?url=<encoded>
// Must come BEFORE /:id/entries to avoid route shadowing
iptvRouter.get('/proxy', sessionAuth, (req: Request, res: Response) => {
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

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        res.status(400).json({ error: 'Only http/https URLs are allowed' });
        return;
    }

    // Security: only relay URLs whose hostname appears in a registered IPTV list
    // or was discovered inside an already-authorized manifest (CDN edges, redirects).
    const allowedHostnames = new Set<string>(_discoveredCdnHostnames);
    for (const list of getAllLists()) {
        try { allowedHostnames.add(new URL(list.url).hostname); } catch { /* local list */ }
        for (const entry of getEntries(list.id)) {
            try { allowedHostnames.add(new URL(entry.url).hostname); } catch { /* skip */ }
        }
    }

    if (!allowedHostnames.has(targetUrl.hostname)) {
        res.status(403).json({ error: 'Domain not whitelisted' });
        return;
    }

    fetchWithRedirects(targetUrl, 0, res, allowedHostnames);
});

// GET /api/iptv/:id/entries — list parsed entries for a given IPTV list
iptvRouter.get('/:id/entries', sessionAuth, (req, res) => {
    const entries = getEntries(req.params['id'] ?? '');
    res.json(entries);
});
