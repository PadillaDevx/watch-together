import * as cheerio from 'cheerio';
import type { LibrarySerie, LibrarySerieDetail, LibraryTemporada, LibraryEpisodio } from '../types';

const LACARTOONS_BASE_URL = 'https://www.lacartoons.com';

// ── Static config ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const libraryData: LibrarySerie[] = require('../db/library.json') as LibrarySerie[];

// ── In-memory cache ──────────────────────────────────────────────────────────
const seriesCache = new Map<string, LibrarySerie[]>();
const episodesCache = new Map<string, LibrarySerieDetail>();
const cacheTimestamps = new Map<string, number>();

const TTL_SERIES = 5 * 60 * 1000;    // 5 minutes
const TTL_EPISODES = 10 * 60 * 1000; // 10 minutes

function isFresh(key: string, ttl: number): boolean {
  const ts = cacheTimestamps.get(key);
  return ts !== undefined && Date.now() - ts < ttl;
}

// ── fetchSeriesList ──────────────────────────────────────────────────────────

/**
 * Returns the list of active series from `library.json`.
 * Results are cached for {@link TTL_SERIES} ms.
 *
 * @returns Active `LibrarySerie` entries.
 */
export async function fetchSeriesList(): Promise<LibrarySerie[]> {
  const CACHE_KEY = 'all';

  if (isFresh(CACHE_KEY, TTL_SERIES) && seriesCache.has(CACHE_KEY)) {
    return seriesCache.get(CACHE_KEY)!;
  }

  const activeSeries = libraryData.filter((s) => s.active === true);
  seriesCache.set(CACHE_KEY, activeSeries);
  cacheTimestamps.set(CACHE_KEY, Date.now());
  return activeSeries;
}

// ── fetchSerieDetail ─────────────────────────────────────────────────────────
// LACartoons HTML structure (estimated from typical Rails scaffold patterns):
//
//   Serie page: https://www.lacartoons.com/serie/{lacartoons_serie_id}
//
//   Season containers:
//     .temporada  or  [data-temporada]  — each wrapping one season's episode list
//     Alternative: <div class="season"> or <section class="season">
//
//   Episode links inside each season container:
//     a[href^="/serie/capitulo/"]  — anchors pointing to episode pages
//     The href format is:  /serie/capitulo/{episodeId}?t={temporada}
//     Episode title: link text content (trimmed)
//     Capitulo number: extracted from URL or preceding text/attribute
//
//   Fallback (flat list with no season wrappers):
//     If no season containers are found, all episode links are grouped into
//     a single Temporada 1.

/**
 * Fetches and parses episode data for a serie by scraping LACartoons HTML.
 * Results are cached for {@link TTL_EPISODES} ms.
 *
 * @param serieId - Slug matching an `id` in `library.json`.
 * @returns Parsed `LibrarySerieDetail` with seasons and episodes.
 * @throws `Error` if the serie is not in `library.json` or scraping fails.
 */
export async function fetchSerieDetail(serieId: string): Promise<LibrarySerieDetail> {
  const cached = episodesCache.get(serieId);
  if (cached && isFresh(serieId, TTL_EPISODES)) {
    return cached;
  }

  const serieConfig = libraryData.find((s) => s.id === serieId);
  if (!serieConfig) {
    throw new Error(`Serie "${serieId}" no encontrada en library.json`);
  }

  const url = `${LACARTOONS_BASE_URL}/serie/${serieConfig.lacartoons_serie_id}`;
  let html: string;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`LACartoons: respuesta ${res.status} para serie ${serieId}`);
    }
    html = await res.text();
  } catch (err) {
    throw new Error(`LACartoons: no se pudo obtener la página de la serie "${serieId}": ${String(err)}`);
  }

  const $ = cheerio.load(html);
  const temporadas: LibraryTemporada[] = [];

  // ── Attempt 1: season containers with class .temporada ────────────────────
  // Expected markup:
  //   <div class="temporada" data-temporada="1">
  //     <h3>Temporada 1</h3>
  //     <ul>
  //       <li><a href="/serie/capitulo/42?t=1">Título del episodio</a></li>
  //     </ul>
  //   </div>
  const seasonContainers = $('.temporada, [data-temporada], .season, .capitulos-temporada');

  if (seasonContainers.length > 0) {
    seasonContainers.each((_i, el) => {
      const $el = $(el);

      // Determine season number from data attribute, heading text, or index
      const dataTem = $el.attr('data-temporada') ?? $el.attr('data-season');
      let temporadaNum = dataTem ? parseInt(dataTem, 10) : NaN;

      if (isNaN(temporadaNum)) {
        // Try to read it from a heading inside the container
        const headingText = $el.find('h1, h2, h3, h4').first().text();
        const match = headingText.match(/\d+/);
        temporadaNum = match ? parseInt(match[0], 10) : temporadas.length + 1;
      }

      const episodios: LibraryEpisodio[] = [];

      // Episode links: <a href="/serie/capitulo/ID?t=N">Title</a>
      $el.find('a[href*="/serie/capitulo/"]').each((_j, anchor) => {
        const $a = $(anchor);
        const href = $a.attr('href') ?? '';
        const titulo = $a.text().trim();
        if (!href) return;

        // Extract capitulo number from URL path or title prefix (e.g. "Cap. 3 - ...")
        const urlMatch = href.match(/\/serie\/capitulo\/(\d+)/);
        let capNum: number | undefined;

        const capMatch = titulo.match(/^(?:Cap(?:ítulo)?\.?\s*)?(\d+)/i);
        if (capMatch) {
          capNum = parseInt(capMatch[1], 10);
        } else if (urlMatch) {
          capNum = parseInt(urlMatch[1], 10);
        } else {
          capNum = episodios.length + 1;
        }

        episodios.push({
          capitulo_numero: capNum,
          titulo,
          url: href.startsWith('/') ? href : `/${href}`,
        });
      });

      if (episodios.length > 0) {
        temporadas.push({ temporada: temporadaNum, episodios });
      }
    });
  }

  // ── Fallback: flat list — all episode links on the page ───────────────────
  if (temporadas.length === 0) {
    const episodios: LibraryEpisodio[] = [];

    $('a[href*="/serie/capitulo/"]').each((_i, anchor) => {
      const $a = $(anchor);
      const href = $a.attr('href') ?? '';
      const titulo = $a.text().trim();
      if (!href || !titulo) return;

      const capMatch = titulo.match(/^(?:Cap(?:ítulo)?\.?\s*)?(\d+)/i);
      const urlMatch = href.match(/\/serie\/capitulo\/(\d+)/);
      let capNum: number;

      if (capMatch) {
        capNum = parseInt(capMatch[1], 10);
      } else if (urlMatch) {
        capNum = parseInt(urlMatch[1], 10);
      } else {
        capNum = episodios.length + 1;
      }

      episodios.push({
        capitulo_numero: capNum,
        titulo,
        url: href.startsWith('/') ? href : `/${href}`,
      });
    });

    if (episodios.length > 0) {
      temporadas.push({ temporada: 1, episodios });
    }
  }

  const detail: LibrarySerieDetail = {
    ...serieConfig,
    temporadas,
  };

  episodesCache.set(serieId, detail);
  cacheTimestamps.set(serieId, Date.now());
  return detail;
}

// ── resolveEpisodeEmbed ──────────────────────────────────────────────────────
// Episode page URL format: https://www.lacartoons.com/serie/capitulo/{id}?t={temporada}
// The embed iframe has src containing "cubeembed":
//   <iframe src="https://cubeembed.com/embed/..."></iframe>

/**
 * Fetches an episode page and extracts the cubeembed iframe `src` URL.
 *
 * @param episodePath - Raw path from `LibraryEpisodio.url` (e.g. `/serie/capitulo/42?t=1`).
 *   May also be a full URL.
 * @returns The embed URL string.
 * @throws `Error` if the page is unreachable or no cubeembed iframe is found.
 */
export async function resolveEpisodeEmbed(episodePath: string): Promise<string> {
  const fullUrl = episodePath.startsWith('/')
    ? `${LACARTOONS_BASE_URL}${episodePath}`
    : episodePath;

  let html: string;

  try {
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`LACartoons: respuesta ${res.status} al obtener episodio`);
    }
    html = await res.text();
  } catch (err) {
    throw new Error(`LACartoons: no se pudo obtener la página del episodio: ${String(err)}`);
  }

  const $ = cheerio.load(html);

  // Expected: <iframe src="https://...cubeembed..."> anywhere in body
  const iframe = $('iframe[src*="cubeembed"]');
  const embedSrc = iframe.attr('src');

  if (!embedSrc) {
    throw new Error(`LACartoons: embed no encontrado en ${fullUrl}`);
  }

  return embedSrc;
}
