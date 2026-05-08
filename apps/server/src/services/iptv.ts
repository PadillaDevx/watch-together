import { randomUUID } from 'crypto';
import https from 'https';
import http from 'http';
import type { IPTVList, IPTVEntry } from '../types';

// ─── Internal store ──────────────────────────────────────────────────────────

interface IPTVStore {
  list: IPTVList;
  entries: IPTVEntry[];
}

export const _iptvLists = new Map<string, IPTVStore>();

// ─── HTTP fetcher ─────────────────────────────────────────────────────────────

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
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

function parseM3U(content: string): IPTVEntry[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: IPTVEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

    i++; // skip the URL line on next iteration
  }

  return entries;
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
  const id = randomUUID();
  const content = await fetchUrl(url);
  const entries = parseM3U(content);

  const list: IPTVList = {
    id,
    name,
    url,
    lastFetched: new Date(),
    entryCount: entries.length,
    enabled: true,
  };

  _iptvLists.set(id, { list, entries });
  return list;
}

export async function updateList(id: string, name?: string, url?: string): Promise<IPTVList> {
  const store = _iptvLists.get(id);
  if (!store) throw new Error('Lista no encontrada');

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

export function deleteList(id: string): boolean {
  return _iptvLists.delete(id);
}

export async function refreshList(id: string): Promise<IPTVList> {
  const store = _iptvLists.get(id);
  if (!store) throw new Error('Lista no encontrada');

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
