"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._iptvLists = void 0;
exports.initIptv = initIptv;
exports.getAllLists = getAllLists;
exports.getListById = getListById;
exports.getEntries = getEntries;
exports.addList = addList;
exports.addListFromContent = addListFromContent;
exports.updateList = updateList;
exports.deleteList = deleteList;
exports.refreshList = refreshList;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../db/index");
const schema_1 = require("../db/schema");
exports._iptvLists = new Map();
// ─── Initialization (load from DB on startup) ─────────────────────────────────
async function initIptv() {
    const dbLists = await index_1.db.select().from(schema_1.iptvLists).where((0, drizzle_orm_1.eq)(schema_1.iptvLists.isActive, true));
    const fetchPromises = dbLists.map(async (row) => {
        const list = {
            id: row.id,
            name: row.name,
            url: row.url,
            lastFetched: row.lastFetched ?? new Date(0),
            entryCount: row.entryCount,
            enabled: row.isActive,
        };
        let entries = [];
        if (row.url !== LOCAL_MARKER) {
            try {
                const content = await fetchUrl(row.url);
                entries = parseM3U(content);
                list.lastFetched = new Date();
                list.entryCount = entries.length;
                // Update DB with fresh fetch info
                await index_1.db.update(schema_1.iptvLists)
                    .set({ lastFetched: list.lastFetched, entryCount: entries.length })
                    .where((0, drizzle_orm_1.eq)(schema_1.iptvLists.id, row.id));
            }
            catch (err) {
                console.warn(`[IPTV] Failed to refresh list '${row.name}' on startup:`, err.message);
            }
        }
        exports._iptvLists.set(row.id, { list, entries });
    });
    await Promise.allSettled(fetchPromises);
    console.log(`[IPTV] Loaded ${dbLists.length} list(s) from DB`);
}
// ─── HTTP fetcher ─────────────────────────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https_1.default : http_1.default;
        const req = protocol.get(url, { timeout: 15000 }, (res) => {
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
        i++;
    }
    return entries;
}
// ─── Public API ───────────────────────────────────────────────────────────────
const LOCAL_MARKER = '(archivo local)';
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
    const content = await fetchUrl(url);
    const entries = parseM3U(content);
    const [dbRow] = await index_1.db.insert(schema_1.iptvLists).values({
        name,
        url,
        isActive: true,
        lastFetched: new Date(),
        entryCount: entries.length,
    }).returning();
    const list = {
        id: dbRow.id,
        name: dbRow.name,
        url: dbRow.url,
        lastFetched: new Date(),
        entryCount: entries.length,
        enabled: true,
    };
    exports._iptvLists.set(list.id, { list, entries });
    return list;
}
async function addListFromContent(name, content) {
    const entries = parseM3U(content);
    const [dbRow] = await index_1.db.insert(schema_1.iptvLists).values({
        name,
        url: LOCAL_MARKER,
        isActive: true,
        lastFetched: new Date(),
        entryCount: entries.length,
    }).returning();
    const list = {
        id: dbRow.id,
        name: dbRow.name,
        url: LOCAL_MARKER,
        lastFetched: new Date(),
        entryCount: entries.length,
        enabled: true,
    };
    exports._iptvLists.set(list.id, { list, entries });
    return list;
}
async function updateList(id, name, url) {
    const store = exports._iptvLists.get(id);
    if (!store)
        throw new Error('Lista no encontrada');
    const isCurrentlyLocal = store.list.url === LOCAL_MARKER;
    const newUrl = url && url !== LOCAL_MARKER ? url : (isCurrentlyLocal ? null : store.list.url);
    if (newUrl) {
        const content = await fetchUrl(newUrl);
        const entries = parseM3U(content);
        const [updated] = await index_1.db.update(schema_1.iptvLists)
            .set({ name: name ?? store.list.name, url: newUrl, lastFetched: new Date(), entryCount: entries.length })
            .where((0, drizzle_orm_1.eq)(schema_1.iptvLists.id, id))
            .returning();
        store.list = {
            ...store.list,
            name: updated.name,
            url: newUrl,
            lastFetched: new Date(),
            entryCount: entries.length,
        };
        store.entries = entries;
    }
    else {
        const [updated] = await index_1.db.update(schema_1.iptvLists)
            .set({ name: name ?? store.list.name })
            .where((0, drizzle_orm_1.eq)(schema_1.iptvLists.id, id))
            .returning();
        store.list = { ...store.list, name: updated.name };
    }
    return store.list;
}
async function deleteList(id) {
    const result = await index_1.db.delete(schema_1.iptvLists)
        .where((0, drizzle_orm_1.eq)(schema_1.iptvLists.id, id))
        .returning({ id: schema_1.iptvLists.id });
    exports._iptvLists.delete(id);
    return result.length > 0;
}
async function refreshList(id) {
    const store = exports._iptvLists.get(id);
    if (!store)
        throw new Error('Lista no encontrada');
    if (store.list.url === LOCAL_MARKER) {
        throw new Error('Las listas cargadas desde archivo no se pueden actualizar remotamente');
    }
    const content = await fetchUrl(store.list.url);
    const entries = parseM3U(content);
    const [updated] = await index_1.db.update(schema_1.iptvLists)
        .set({ lastFetched: new Date(), entryCount: entries.length })
        .where((0, drizzle_orm_1.eq)(schema_1.iptvLists.id, id))
        .returning();
    store.list = { ...store.list, lastFetched: updated.lastFetched, entryCount: entries.length };
    store.entries = entries;
    return store.list;
}
