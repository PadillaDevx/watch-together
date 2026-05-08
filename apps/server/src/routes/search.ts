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

searchRouter.get('/', async (req, res) => {
  const q = String(req.query['q'] ?? '').trim().slice(0, 200);
  if (!q) { res.status(400).json({ error: 'Query requerida' }); return; }

  try {
    const payload = JSON.stringify({
      query: q,
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
    // Navigate into the nested response structure
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents ?? [];

    for (const section of contents) {
      const itemSection = section?.itemSectionRenderer?.contents ?? [];
      for (const item of itemSection) {
        const vr = item?.videoRenderer;
        if (!vr || !vr.videoId) continue;

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

        if (items.length >= 20) break;
      }
      if (items.length >= 20) break;
    }

    res.json({ results: items });
  } catch (err) {
    console.error('[search]', err);
    res.status(502).json({ error: 'Error al buscar en YouTube' });
  }
});
