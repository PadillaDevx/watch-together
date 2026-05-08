"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._iptvLists = void 0;
exports.getAllLists = getAllLists;
exports.getListById = getListById;
exports.getEntries = getEntries;
exports.addList = addList;
exports.updateList = updateList;
exports.deleteList = deleteList;
exports.refreshList = refreshList;
const crypto_1 = require("crypto");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
exports._iptvLists = new Map();
// ─── HTTP fetcher ─────────────────────────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https_1.default : http_1.default;
        const req = protocol.get(url, { timeout: 15000 }, (res) => {
            // Follow redirects (up to 3 hops)
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
    });
}
// ─── M3U parser ───────────────────────────────────────────────────────────────
function parseM3U(content) {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXTINF:'))
            continue;
        const urlLine = lines[i + 1];
        if (!urlLine || urlLine.startsWith('#'))
            continue;
        const nameMatch = line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        entries.push({
            name: nameMatch?.[1]?.trim() ?? 'Unknown',
            url: urlLine,
            group: groupMatch?.[1]?.trim() || 'General',
            logo: logoMatch?.[1]?.trim() || undefined,
        });
        i++; // skip the URL line on next iteration
    }
    return entries;
}
// ─── Public API ───────────────────────────────────────────────────────────────
function getAllLists() {
    return [...exports._iptvLists.values()].map((s) => s.list);
}
function getListById(id) {
    return exports._iptvLists.get(id)?.list;
}
function getEntries(id) {
    return exports._iptvLists.get(id)?.entries ?? [];
}
async function addList(name, url) {
    const id = (0, crypto_1.randomUUID)();
    const content = await fetchUrl(url);
    const entries = parseM3U(content);
    const list = {
        id,
        name,
        url,
        lastFetched: new Date(),
        entryCount: entries.length,
        enabled: true,
    };
    exports._iptvLists.set(id, { list, entries });
    return list;
}
async function updateList(id, name, url) {
    const store = exports._iptvLists.get(id);
    if (!store)
        throw new Error('Lista no encontrada');
    const newUrl = url ?? store.list.url;
    const content = await fetchUrl(newUrl);
    const entries = parseM3U(content);
    store.list = {
        ...store.list,
        name: name ?? store.list.name,
        url: newUrl,
        lastFetched: new Date(),
        entryCount: entries.length,
    };
    store.entries = entries;
    return store.list;
}
function deleteList(id) {
    return exports._iptvLists.delete(id);
}
async function refreshList(id) {
    const store = exports._iptvLists.get(id);
    if (!store)
        throw new Error('Lista no encontrada');
    const content = await fetchUrl(store.list.url);
    const entries = parseM3U(content);
    store.list = {
        ...store.list,
        lastFetched: new Date(),
        entryCount: entries.length,
    };
    store.entries = entries;
    return store.list;
}
