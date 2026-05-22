import { randomUUID } from 'crypto';
import https from 'https';
import http from 'http';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { iptvLists as iptvListsTable } from '../db/schema';
import type { IPTVList, IPTVEntry } from '../types';

// ─── In-memory entry cache ────────────────────────────────────────────────────

interface IPTVStore {
  list: IPTVList;
  entries: IPTVEntry[];
}

export const _iptvLists = new Map<string, IPTVStore>();

// ─── Initialization (load from DB on startup) ─────────────────────────────────

export async function initIptv(): Promise<void> {
  const dbLists = await db.select().from(iptvListsTable).where(eq(iptvListsTable.isActive, true));

  const fetchPromises = dbLists.map(async (row) => {
    const list: IPTVList = {
      id: row.id,
      name: row.name,
      url: row.url,
      lastFetched: row.lastFetched ?? new Date(0),
      entryCount: row.entryCount,
      enabled: row.isActive,
    };

    let entries: IPTVEntry[] = [];
    if (row.url !== LOCAL_MARKER) {
      try {
        const content = await fetchUrl(row.url);
        entries = parseM3U(content);
        list.lastFetched = new Date();
        list.entryCount = entries.length;
        // Update DB with fresh fetch info
        await db.update(iptvListsTable)
          .set({ lastFetched: list.lastFetched, entryCount: entries.length })
          .where(eq(iptvListsTable.id, row.id));
      } catch (err) {
        console.warn(`[IPTV] Failed to refresh list '${row.name}' on startup:`, (err as Error).message);
      }
    }

    _iptvLists.set(row.id, { list, entries });
  });

  await Promise.allSettled(fetchPromises);
  console.log(`[IPTV] Loaded ${dbLists.length} list(s) from DB`);
}

// ─── HTTP fetcher ─────────────────────────────────────────────────────────────

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
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

function parseM3U(content: string): IPTVEntry[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: IPTVEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('#EXTINF:')) continue;

    const urlLine = lines[i + 1];
    if (!urlLine || urlLine.startsWith('#')) continue;

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

export function getAllLists(): IPTVList[] {
  return [..._iptvLists.values()].map((s) => s.list);
}

export function getListById(id: string): IPTVList | undefined {
  return _iptvLists.get(id)?.list;
}

export function getEntries(id: string): IPTVEntry[] {
  return _iptvLists.get(id)?.entries ?? [];
}

export async function addList(name: string, url: string): Promise<IPTVList> {
  const content = await fetchUrl(url);
  const entries = parseM3U(content);

  const [dbRow] = await db.insert(iptvListsTable).values({
    name,
    url,
    isActive: true,
    lastFetched: new Date(),
    entryCount: entries.length,
  }).returning();

  const list: IPTVList = {
    id: dbRow!.id,
    name: dbRow!.name,
    url: dbRow!.url,
    lastFetched: new Date(),
    entryCount: entries.length,
    enabled: true,
  };

  _iptvLists.set(list.id, { list, entries });
  return list;
}

export async function addListFromContent(name: string, content: string): Promise<IPTVList> {
  const entries = parseM3U(content);

  const [dbRow] = await db.insert(iptvListsTable).values({
    name,
    url: LOCAL_MARKER,
    isActive: true,
    lastFetched: new Date(),
    entryCount: entries.length,
  }).returning();

  const list: IPTVList = {
    id: dbRow!.id,
    name: dbRow!.name,
    url: LOCAL_MARKER,
    lastFetched: new Date(),
    entryCount: entries.length,
    enabled: true,
  };

  _iptvLists.set(list.id, { list, entries });
  return list;
}

export async function updateList(id: string, name?: string, url?: string): Promise<IPTVList> {
  const store = _iptvLists.get(id);
  if (!store) throw new Error('Lista no encontrada');

  const isCurrentlyLocal = store.list.url === LOCAL_MARKER;
  const newUrl = url && url !== LOCAL_MARKER ? url : (isCurrentlyLocal ? null : store.list.url);

  if (newUrl) {
    const content = await fetchUrl(newUrl);
    const entries = parseM3U(content);

    const [updated] = await db.update(iptvListsTable)
      .set({ name: name ?? store.list.name, url: newUrl, lastFetched: new Date(), entryCount: entries.length })
      .where(eq(iptvListsTable.id, id))
      .returning();

    store.list = {
      ...store.list,
      name: updated!.name,
      url: newUrl,
      lastFetched: new Date(),
      entryCount: entries.length,
    };
    store.entries = entries;
  } else {
    const [updated] = await db.update(iptvListsTable)
      .set({ name: name ?? store.list.name })
      .where(eq(iptvListsTable.id, id))
      .returning();

    store.list = { ...store.list, name: updated!.name };
  }

  return store.list;
}

export async function deleteList(id: string): Promise<boolean> {
  const result = await db.delete(iptvListsTable)
    .where(eq(iptvListsTable.id, id))
    .returning({ id: iptvListsTable.id });

  _iptvLists.delete(id);
  return result.length > 0;
}

export async function refreshList(id: string): Promise<IPTVList> {
  const store = _iptvLists.get(id);
  if (!store) throw new Error('Lista no encontrada');
  if (store.list.url === LOCAL_MARKER) {
    throw new Error('Las listas cargadas desde archivo no se pueden actualizar remotamente');
  }

  const content = await fetchUrl(store.list.url);
  const entries = parseM3U(content);

  const [updated] = await db.update(iptvListsTable)
    .set({ lastFetched: new Date(), entryCount: entries.length })
    .where(eq(iptvListsTable.id, id))
    .returning();

  store.list = { ...store.list, lastFetched: updated!.lastFetched!, entryCount: entries.length };
  store.entries = entries;

  return store.list;
}
