import { Router } from 'express';
import https from 'https';

export const searchRouter = Router();

interface VideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  embeddable: boolean;
}

interface PlaylistResult {
  playlistId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  videoCount: string;
  /** Seed videoId for Mix/Radio playlists (RD*) — tells the /next endpoint where to start */
  seedVideoId?: string;
}

function httpsPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Mozilla/5.0 (compatible)',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractText(obj: Record<string, unknown> | undefined): string {
  if (!obj) return '';
  if (typeof (obj as { simpleText?: unknown }).simpleText === 'string') return (obj as { simpleText: string }).simpleText;
  const runs = (obj as { runs?: Array<{ text?: string }> }).runs;
  if (Array.isArray(runs)) return runs.map((r) => r.text ?? '').join('');
  return '';
}

function extractThumb(pr: Record<string, unknown>, fallbackId = ''): string {
  const thumbArrays =
    (pr['thumbnails'] as Array<{ thumbnails?: Array<{ url: string }> }> | undefined)?.[0]?.thumbnails ??
    (pr['thumbnail'] as { thumbnails?: Array<{ url: string }> } | undefined)?.thumbnails ??
    [];
  const url =
    (thumbArrays[thumbArrays.length - 1] as { url?: string } | undefined)?.url ??
    (fallbackId ? `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg` : '');
  return url.startsWith('//') ? 'https:' + url : url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPlaylistItem(pr: any): PlaylistResult | null {
  if (!pr || !pr.playlistId) return null;
  return {
    playlistId: pr.playlistId,
    title: extractText(pr.title),
    channelTitle: extractText(pr.shortBylineText ?? pr.longBylineText),
    thumbnail: extractThumb(pr, pr.thumbnailVideoId ?? ''),
    videoCount: typeof pr.videoCount === 'string' ? pr.videoCount : extractText(pr.videoCount) || String(pr.videoCount ?? ''),
  };
}

// Newer YouTube responses encode playlists as `lockupViewModel`
// (contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST'). Parse that shape too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLockupPlaylist(lvm: any): PlaylistResult | null {
  if (!lvm || lvm.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') return null;
  const playlistId: string = lvm.contentId;
  if (!playlistId) return null;
  const thumbViewModel =
    lvm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel ??
    lvm.contentImage?.thumbnailViewModel;
  const sources: Array<{ url?: string }> = thumbViewModel?.image?.sources ?? [];
  const rawThumb = sources[sources.length - 1]?.url ?? '';
  const thumbnail = rawThumb.startsWith('//') ? 'https:' + rawThumb : rawThumb;

  const meta = lvm.metadata?.lockupMetadataViewModel;
  const title: string = meta?.title?.content ?? '';
  // First metadata row usually has the channel/artist name.
  const rows: Array<{ metadataParts?: Array<{ text?: { content?: string } }> }> =
    meta?.contentMetadataViewModel?.metadataRows ?? [];
  const channelTitle: string =
    rows[0]?.metadataParts?.[0]?.text?.content ?? '';

  // Try to find a videoCount-like badge ("Mix", "25 videos", etc.)
  const overlays: unknown[] = thumbViewModel?.overlays ?? [];
  let videoCount = '';
  for (const ov of overlays) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badge = (ov as any)?.thumbnailOverlayBadgeViewModel?.thumbnailBadges;
    if (Array.isArray(badge)) {
      for (const b of badge) {
        const t = b?.thumbnailBadgeViewModel?.text;
        if (typeof t === 'string' && t) { videoCount = t; break; }
      }
    }
    if (videoCount) break;
  }

  // Extract the seed videoId from the watch endpoint embedded in the lockup
  const watchEndpoint =
    lvm?.itemPlayback?.inlinePlayerData?.onSelect?.innertubeCommand?.watchEndpoint ??
    lvm?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;
  const seedVideoId: string | undefined =
    typeof watchEndpoint?.videoId === 'string' && watchEndpoint.videoId
      ? watchEndpoint.videoId
      : undefined;

  return { playlistId, title, channelTitle, thumbnail, videoCount, ...(seedVideoId ? { seedVideoId } : {}) };
}

searchRouter.get('/', async (req, res) => {
  const q = String(req.query['q'] ?? '').trim().slice(0, 200);
  const type = String(req.query['type'] ?? '').trim();
  if (!q) { res.status(400).json({ error: 'Query requerida' }); return; }

  // YouTube's "filter=playlists" protobuf param
  const params = type === 'playlists' ? { params: 'EgIQAw%3D%3D' } : {};

  try {
    const payload = JSON.stringify({
      query: q,
      ...params,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'es',
          gl: 'ES',
        },
      },
    });

    const raw = await httpsPost(
      'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
      payload
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(raw) as any;

    const items: VideoResult[] = [];
    const playlists: PlaylistResult[] = [];
    const seenPlaylists = new Set<string>();
    const pushPlaylist = (pl: PlaylistResult | null) => {
      if (!pl || seenPlaylists.has(pl.playlistId)) return;
      seenPlaylists.add(pl.playlistId);
      playlists.push(pl);
    };
    // Navigate into the nested response structure
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents ?? [];

    for (const section of contents) {
      const itemSection = section?.itemSectionRenderer?.contents ?? [];
      for (const item of itemSection) {
        // --- Video ---
        const vr = item?.videoRenderer;
        if (vr && vr.videoId) {
          const thumbs: Array<{ url: string; width: number }> = vr.thumbnail?.thumbnails ?? [];
          const thumb = thumbs[thumbs.length - 1]?.url ?? `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
          const duration = extractText(vr.lengthText);
          const views = extractText(vr.viewCountText);

          items.push({
            videoId: vr.videoId,
            title: extractText(vr.title),
            channelTitle: extractText(vr.ownerText ?? vr.longBylineText),
            thumbnail: thumb.startsWith('//') ? 'https:' + thumb : thumb,
            duration,
            viewCount: views,
            embeddable: true,
          });
        }

        // --- Playlist (direct) ---
        const pr = item?.playlistRenderer;
        if (pr && pr.playlistId) {
          pushPlaylist(extractPlaylistItem(pr));
        }

        // --- Playlist (new lockupViewModel shape) ---
        const lvm = item?.lockupViewModel;
        if (lvm) {
          pushPlaylist(extractLockupPlaylist(lvm));
        }

        // --- Shelf (YouTube groups playlists here for artist searches) ---
        const sr = item?.shelfRenderer;
        if (sr) {
          const shelfItems: unknown[] =
            sr.content?.verticalListRenderer?.items ??
            sr.content?.horizontalListRenderer?.items ??
            sr.content?.expandedShelfContentsRenderer?.items ?? [];
          for (const shelfItem of shelfItems) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const spr = (shelfItem as any)?.playlistRenderer;
            if (spr && spr.playlistId) {
              pushPlaylist(extractPlaylistItem(spr));
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const slvm = (shelfItem as any)?.lockupViewModel;
            if (slvm) {
              pushPlaylist(extractLockupPlaylist(slvm));
            }
          }
        }

        // --- Grid shelf (also seen in artist results) ---
        const gsvm = item?.gridShelfViewModel;
        if (gsvm) {
          const gridItems: unknown[] = gsvm.items ?? [];
          for (const gi of gridItems) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const glvm = (gi as any)?.lockupViewModel;
            if (glvm) {
              pushPlaylist(extractLockupPlaylist(glvm));
            }
          }
        }

        const maxPl = type === 'playlists' ? 20 : 5;
        if (items.length >= 20 && playlists.length >= maxPl) break;
      }
      const maxPl = type === 'playlists' ? 20 : 5;
      if (items.length >= 20 && playlists.length >= maxPl) break;
    }

    res.json({ results: items, playlists });
  } catch (err) {
    console.error('[search]', err);
    res.status(502).json({ error: 'Error al buscar en YouTube' });
  }
});

// GET /api/search/playlist?playlistId=PLxxxxx[&videoId=...]
searchRouter.get('/playlist', async (req, res) => {
  const playlistId = String(req.query['playlistId'] ?? '').trim().slice(0, 100);
  const videoIdHint = String(req.query['videoId'] ?? '').trim().slice(0, 20);
  if (!playlistId) { res.status(400).json({ error: 'playlistId requerido' }); return; }

  // YouTube Mix/Radio playlists (RD*) only work via the `next` endpoint with a videoId.
  const isMix = /^RD/.test(playlistId);
  const context = {
    client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'es', gl: 'ES' },
  };

  try {
    const items: VideoResult[] = [];

    if (isMix) {
      // Need a seed videoId — fall back to deriving one from the playlistId
      // (RDMM<videoId>, RDEM... uses ID after, etc.)
      const seed = videoIdHint || playlistId.replace(/^RD(MM|EM|AMVM)?/, '').slice(0, 11);
      const raw = await httpsPost(
        'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
        JSON.stringify({ videoId: seed, playlistId, context })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(raw) as any;
      const contents: unknown[] =
        data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents ?? [];
      for (const item of contents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = item as any;
        // Some entries are wrapped in playlistPanelVideoWrapperRenderer
        const pvr = raw?.playlistPanelVideoRenderer ??
          raw?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
        if (!pvr?.videoId) continue;
        items.push({
          videoId: pvr.videoId,
          title: extractText(pvr.title),
          channelTitle: extractText(pvr.shortBylineText ?? pvr.longBylineText),
          thumbnail: extractThumb(pvr, pvr.videoId),
          duration: extractText(pvr.lengthText),
          viewCount: '',
          embeddable: true,
        });
        if (items.length >= 50) break;
      }
    } else {
      const raw = await httpsPost(
        'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
        JSON.stringify({ browseId: `VL${playlistId}`, context })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(raw) as any;
      const tab =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content;
      const contents: unknown[] =
        tab?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
          ?.playlistVideoListRenderer?.contents ?? [];
      for (const item of contents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pvr = (item as any)?.playlistVideoRenderer;
        if (!pvr?.videoId) continue;
        items.push({
          videoId: pvr.videoId,
          title: extractText(pvr.title),
          channelTitle: extractText(pvr.shortBylineText),
          thumbnail: extractThumb(pvr, pvr.videoId),
          duration: extractText(pvr.lengthText),
          viewCount: '',
          embeddable: true,
        });
        if (items.length >= 50) break;
      }
    }

    res.json({ items });
  } catch (err) {
    console.error('[search/playlist]', err);
    res.status(502).json({ error: 'Error al obtener la playlist' });
  }
});
