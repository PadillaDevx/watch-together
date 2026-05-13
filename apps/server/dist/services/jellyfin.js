"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initJellyfin = initJellyfin;
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.testConnection = testConnection;
exports.searchItems = searchItems;
exports.buildProxiedStreamUrl = buildProxiedStreamUrl;
exports.buildProxiedImageUrl = buildProxiedImageUrl;
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../db/index");
const schema_1 = require("../db/schema");
const proxy_trust_1 = require("./proxy-trust");
// ─── In-memory cache ──────────────────────────────────────────────────────────
let _config = null;
// ─── Initialization (load from DB on startup) ─────────────────────────────────
async function initJellyfin() {
    const [row] = await index_1.db.select()
        .from(schema_1.jellyfinConfig)
        .where((0, drizzle_orm_1.eq)(schema_1.jellyfinConfig.isActive, true))
        .limit(1);
    if (row) {
        const cleanBase = row.serverUrl.replace(/\/$/, '');
        _config = { id: row.id, baseUrl: cleanBase, apiKey: row.apiKey };
        (0, proxy_trust_1.trustHostname)(new URL(cleanBase).hostname);
        console.log('[Jellyfin] Config loaded from DB');
    }
}
// ─── Config ───────────────────────────────────────────────────────────────────
async function setConfig(baseUrl, apiKey) {
    const cleanBase = baseUrl.replace(/\/$/, '');
    if (_config) {
        await index_1.db.update(schema_1.jellyfinConfig)
            .set({ serverUrl: cleanBase, apiKey, isActive: true, verifiedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.jellyfinConfig.id, _config.id));
        _config = { id: _config.id, baseUrl: cleanBase, apiKey };
    }
    else {
        const [row] = await index_1.db.insert(schema_1.jellyfinConfig)
            .values({ serverUrl: cleanBase, apiKey, isActive: true, verifiedAt: new Date() })
            .returning();
        _config = { id: row.id, baseUrl: cleanBase, apiKey };
    }
    (0, proxy_trust_1.trustHostname)(new URL(cleanBase).hostname);
}
function getConfig() {
    if (!_config)
        return null;
    return { baseUrl: _config.baseUrl, apiKey: _config.apiKey };
}
// ─── Connectivity ─────────────────────────────────────────────────────────────
async function testConnection() {
    if (_config === null)
        return { ok: false, error: 'Jellyfin not configured' };
    const { baseUrl, apiKey } = _config;
    try {
        const res = await fetch(`${baseUrl}/System/Info`, {
            headers: { 'X-Emby-Token': apiKey },
        });
        if (!res.ok)
            return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json());
        return { ok: true, serverName: data.ServerName };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}
async function searchItems(query, limit = 20) {
    if (_config === null)
        return [];
    const { baseUrl, apiKey } = _config;
    const url = `${baseUrl}/Items` +
        `?searchTerm=${encodeURIComponent(query)}` +
        `&IncludeItemTypes=Movie,Episode` +
        `&Recursive=true` +
        `&Fields=Overview,RunTimeTicks,ImageTags` +
        `&Limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'X-Emby-Token': apiKey } });
        if (!res.ok)
            return [];
        const data = (await res.json());
        return (data.Items ?? []).map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            runtimeTicks: item.RunTimeTicks,
            hasPrimaryImage: !!item.ImageTags?.Primary,
        }));
    }
    catch {
        return [];
    }
}
// ─── Proxy URL builders ───────────────────────────────────────────────────────
function buildProxiedStreamUrl(itemId) {
    if (_config === null)
        return '';
    const { baseUrl, apiKey } = _config;
    const rawUrl = `${baseUrl}/Videos/${itemId}/master.m3u8?api_key=${apiKey}`;
    return `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
}
function buildProxiedImageUrl(itemId) {
    if (_config === null)
        return '';
    const { baseUrl, apiKey } = _config;
    const rawUrl = `${baseUrl}/Items/${itemId}/Images/Primary?api_key=${apiKey}`;
    return `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
}
