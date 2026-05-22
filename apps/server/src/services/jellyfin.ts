import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { jellyfinConfig } from '../db/schema';
import { trustHostname } from './proxy-trust';

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _config: { id: string; baseUrl: string; apiKey: string } | null = null;

// ─── Initialization (load from DB on startup) ─────────────────────────────────

export async function initJellyfin(): Promise<void> {
  const [row] = await db.select()
    .from(jellyfinConfig)
    .where(eq(jellyfinConfig.isActive, true))
    .limit(1);

  if (row) {
    const cleanBase = row.serverUrl.replace(/\/$/, '');
    _config = { id: row.id, baseUrl: cleanBase, apiKey: row.apiKey };
    trustHostname(new URL(cleanBase).hostname);
    console.log('[Jellyfin] Config loaded from DB');
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function setConfig(baseUrl: string, apiKey: string): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');

  if (_config) {
    await db.update(jellyfinConfig)
      .set({ serverUrl: cleanBase, apiKey, isActive: true, verifiedAt: new Date() })
      .where(eq(jellyfinConfig.id, _config.id));
    _config = { id: _config.id, baseUrl: cleanBase, apiKey };
  } else {
    const [row] = await db.insert(jellyfinConfig)
      .values({ serverUrl: cleanBase, apiKey, isActive: true, verifiedAt: new Date() })
      .returning();
    _config = { id: row!.id, baseUrl: cleanBase, apiKey };
  }

  trustHostname(new URL(cleanBase).hostname);
}

export function getConfig(): { baseUrl: string; apiKey: string } | null {
  if (!_config) return null;
  return { baseUrl: _config.baseUrl, apiKey: _config.apiKey };
}

// ─── Connectivity ─────────────────────────────────────────────────────────────

export async function testConnection(): Promise<{ ok: boolean; serverName?: string; error?: string }> {
  if (_config === null) return { ok: false, error: 'Jellyfin not configured' };

  const { baseUrl, apiKey } = _config;
  try {
    const res = await fetch(`${baseUrl}/System/Info`, {
      headers: { 'X-Emby-Token': apiKey },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { ServerName?: string };
    return { ok: true, serverName: data.ServerName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

interface JellyfinItemRaw {
  Id: string;
  Name: string;
  Type: string;
  RunTimeTicks?: number;
  ImageTags?: { Primary?: string };
}

export async function searchItems(
  query: string,
  limit = 20,
): Promise<Array<{ id: string; name: string; type: string; runtimeTicks?: number; hasPrimaryImage: boolean }>> {
  if (_config === null) return [];

  const { baseUrl, apiKey } = _config;
  const url =
    `${baseUrl}/Items` +
    `?searchTerm=${encodeURIComponent(query)}` +
    `&IncludeItemTypes=Movie,Episode` +
    `&Recursive=true` +
    `&Fields=Overview,RunTimeTicks,ImageTags` +
    `&Limit=${limit}`;

  try {
    const res = await fetch(url, { headers: { 'X-Emby-Token': apiKey } });
    if (!res.ok) return [];
    const data = (await res.json()) as { Items?: JellyfinItemRaw[] };
    return (data.Items ?? []).map((item) => ({
      id: item.Id,
      name: item.Name,
      type: item.Type,
      runtimeTicks: item.RunTimeTicks,
      hasPrimaryImage: !!item.ImageTags?.Primary,
    }));
  } catch {
    return [];
  }
}

// ─── Proxy URL builders ───────────────────────────────────────────────────────

export function buildProxiedStreamUrl(itemId: string): string {
  if (_config === null) return '';
  const { baseUrl, apiKey } = _config;
  const rawUrl = `${baseUrl}/Videos/${itemId}/master.m3u8?api_key=${apiKey}`;
  return `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
}

export function buildProxiedImageUrl(itemId: string): string {
  if (_config === null) return '';
  const { baseUrl, apiKey } = _config;
  const rawUrl = `${baseUrl}/Items/${itemId}/Images/Primary?api_key=${apiKey}`;
  return `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
}
