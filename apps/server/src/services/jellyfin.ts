import { trustHostname } from './proxy-trust';

// ─── Internal state ───────────────────────────────────────────────────────────

let _config: { baseUrl: string; apiKey: string } | null = null;

// ─── Config ───────────────────────────────────────────────────────────────────

export function setConfig(baseUrl: string, apiKey: string): void {
    const cleanBase = baseUrl.replace(/\/$/, '');
    _config = { baseUrl: cleanBase, apiKey };
    trustHostname(new URL(cleanBase).hostname);
}

export function getConfig(): { baseUrl: string; apiKey: string } | null {
    return _config;
}

// ─── Connectivity ─────────────────────────────────────────────────────────────

export async function testConnection(): Promise<{ ok: boolean; serverName?: string; error?: string }> {
    if (_config === null) return { ok: false, error: 'Jellyfin not configured' };

    const { baseUrl, apiKey } = _config;
    try {
        const res = await fetch(`${baseUrl}/System/Info`, {
            headers: { 'X-Emby-Token': apiKey },
        });
        if (!res.ok) {
            return { ok: false, error: `HTTP ${res.status}` };
        }
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
