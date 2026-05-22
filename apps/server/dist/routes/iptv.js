"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.iptvRouter = exports.trustHostname = void 0;
const express_1 = require("express");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const auth_1 = require("../middleware/auth");
const iptv_1 = require("../services/iptv");
const proxy_trust_1 = require("../services/proxy-trust");
Object.defineProperty(exports, "trustHostname", { enumerable: true, get: function () { return proxy_trust_1.trustHostname; } });
exports.iptvRouter = (0, express_1.Router)();
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
function isHlsPlaylist(contentType, url) {
    const ct = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
    return HLS_MIME_TYPES.has(ct) || url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.m3u');
}
/**
 * Resolve a URL found inside an M3U8 against the manifest's base URL,
 * register its hostname as trusted (it came from inside an already-authorized
 * manifest), then wrap it in the proxy route.
 */
function proxify(rawLine, baseUrl) {
    try {
        const abs = new URL(rawLine, baseUrl);
        // Trust any hostname embedded inside an already-authorized manifest
        proxy_trust_1._discoveredCdnHostnames.add(abs.hostname);
        return `/api/iptv/proxy?url=${encodeURIComponent(abs.toString())}`;
    }
    catch {
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
function rewriteM3u8(content, baseUrl) {
    const lines = content.split('\n');
    const out = [];
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
            }
            else {
                out.push(proxify(line, baseUrl));
            }
            continue;
        }
        // Tags with URI= attribute
        const rewritten = line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            return `URI="${proxify(uri, baseUrl)}"`;
        });
        out.push(rewritten);
        // Mark that the next non-tag line is a URI (applies to #EXT-X-STREAM-INF etc.)
        if (line.startsWith('#EXT-X-STREAM-INF') ||
            line.startsWith('#EXT-X-I-FRAME-STREAM-INF') ||
            line.startsWith('#EXTINF')) {
            nextIsUri = true;
        }
    }
    return out.join('\n');
}
// ─── Fetch helper with redirect support ──────────────────────────────────────
function fetchWithRedirects(targetUrl, hops, reqRes, allowedHostnames) {
    if (hops > 5) {
        if (!reqRes.headersSent)
            reqRes.status(502).json({ error: 'Too many redirects' });
        return;
    }
    const protocol = targetUrl.protocol === 'https:' ? https_1.default : http_1.default;
    const proxyReq = protocol.get(targetUrl.toString(), { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 WatchTogether/1.0' } }, (upstream) => {
        const status = upstream.statusCode ?? 200;
        // Follow redirects (301/302/303/307/308)
        if (status >= 300 && status < 400 && upstream.headers['location']) {
            const location = upstream.headers['location'];
            upstream.resume(); // drain to free socket
            try {
                const next = new URL(location, targetUrl);
                // Persist redirect-target hostname so subsequent requests pass the whitelist
                proxy_trust_1._discoveredCdnHostnames.add(next.hostname);
                allowedHostnames.add(next.hostname);
                fetchWithRedirects(next, hops + 1, reqRes, allowedHostnames);
            }
            catch {
                if (!reqRes.headersSent)
                    reqRes.status(502).json({ error: 'Bad redirect location' });
            }
            return;
        }
        const contentType = upstream.headers['content-type'] ?? 'application/octet-stream';
        if (isHlsPlaylist(contentType, targetUrl)) {
            // Buffer the manifest so we can rewrite its URLs
            const chunks = [];
            upstream.on('data', (chunk) => chunks.push(chunk));
            upstream.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                const rewritten = rewriteM3u8(raw, targetUrl);
                reqRes.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                reqRes.setHeader('Cache-Control', 'max-age=3');
                reqRes.setHeader('Access-Control-Allow-Origin', '*');
                reqRes.end(rewritten);
            });
        }
        else {
            // Binary (TS segments, keys, etc.) — pipe straight through
            reqRes.setHeader('Content-Type', contentType);
            reqRes.setHeader('Cache-Control', 'max-age=5');
            reqRes.setHeader('Access-Control-Allow-Origin', '*');
            upstream.pipe(reqRes);
        }
    });
    proxyReq.on('error', (err) => {
        if (!reqRes.headersSent)
            reqRes.status(502).json({ error: 'Upstream error', detail: err.message });
    });
    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!reqRes.headersSent)
            reqRes.status(504).json({ error: 'Upstream timeout' });
    });
}
// ─── Route ───────────────────────────────────────────────────────────────────
// GET /api/iptv/proxy?url=<encoded>
// Must come BEFORE /:id/entries to avoid route shadowing
exports.iptvRouter.get('/proxy', auth_1.sessionAuth, (req, res) => {
    const rawUrl = req.query['url'];
    if (typeof rawUrl !== 'string' || !rawUrl) {
        res.status(400).json({ error: 'Missing url parameter' });
        return;
    }
    let targetUrl;
    try {
        targetUrl = new URL(rawUrl);
    }
    catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        res.status(400).json({ error: 'Only http/https URLs are allowed' });
        return;
    }
    // Security: only relay URLs whose hostname appears in a registered IPTV list
    // or was discovered inside an already-authorized manifest (CDN edges, redirects).
    const allowedHostnames = new Set(proxy_trust_1._discoveredCdnHostnames);
    for (const list of (0, iptv_1.getAllLists)()) {
        try {
            allowedHostnames.add(new URL(list.url).hostname);
        }
        catch { /* local list */ }
        for (const entry of (0, iptv_1.getEntries)(list.id)) {
            try {
                allowedHostnames.add(new URL(entry.url).hostname);
            }
            catch { /* skip */ }
        }
    }
    if (!allowedHostnames.has(targetUrl.hostname)) {
        res.status(403).json({ error: 'Domain not whitelisted' });
        return;
    }
    fetchWithRedirects(targetUrl, 0, res, allowedHostnames);
});
// GET /api/iptv/:id/entries — list parsed entries for a given IPTV list
exports.iptvRouter.get('/:id/entries', auth_1.sessionAuth, (req, res) => {
    const entries = (0, iptv_1.getEntries)(req.params['id'] ?? '');
    res.json(entries);
});
