import * as cheerio from 'cheerio';
import type { LibrarySerie, LibrarySerieDetail, LibraryTemporada, LibraryEpisodio } from '../types';

const LACARTOONS_BASE_URL = 'https://www.lacartoons.com';

// ── Static config ────────────────────────────────────────────────────────────
import * as fs from 'fs';
import * as path from 'path';

const LIBRARY_PATH = path.join(__dirname, '../db/library.json');

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

/**
 * Returns the full catalog (active + inactive) from `library.json`.
 * Used by the admin panel to display and manage all series.
 */
export function fetchAllSeries(): LibrarySerie[] {
    return libraryData;
}

/**
 * Toggles the `active` flag of a serie and persists the change to `library.json`.
 * Clears the series list cache so the next request picks up the change.
 *
 * @param serieId - Slug matching an `id` in `library.json`.
 * @param active  - New active state.
 * @throws `Error` if the serie is not found.
 */
export function toggleSerieActive(serieId: string, active: boolean): LibrarySerie {
    const serie = libraryData.find((s) => s.id === serieId);
    if (!serie) throw new Error(`Serie "${serieId}" no encontrada en library.json`);

    serie.active = active;

    // Persist to disk
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(libraryData, null, 4), 'utf8');

    // Invalidate series list cache
    seriesCache.delete('all');
    cacheTimestamps.delete('all');

    return serie;
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

    // ── Attempt 1: LACartoons structure ───────────────────────────────────────
    // Season headers: <h4 class="accordion estilo-temporada" data-temporada-id="N">
    // Episodes panel: <div class="episodio-panel"> (immediately next sibling of h4)
    const seasonHeaders = $('h4[data-temporada-id]');

    if (seasonHeaders.length > 0) {
        seasonHeaders.each((_i, el) => {
            const $header = $(el);
            const temporadaId = $header.attr('data-temporada-id');
            const temporadaNum = temporadaId ? parseInt(temporadaId, 10) : temporadas.length + 1;

            // Episodes are in the next sibling div.episodio-panel
            const $panel = $header.next('.episodio-panel');
            const episodios: LibraryEpisodio[] = [];

            $panel.find('a[href*="/serie/capitulo/"]').each((_j, anchor) => {
                const $a = $(anchor);
                const href = $a.attr('href') ?? '';
                if (!href) return;

                // Normalize whitespace: span + text nodes produce extra spaces
                const titulo = $a.text().trim().replace(/\s+/g, ' ');

                // Chapter number: "Capitulo X" in title takes priority over URL id
                const capMatch = titulo.match(/Capitulo[s]?\s+(\d+)/i)
                    ?? titulo.match(/Cap\.?\s*(\d+)/i);
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
// The embed iframe has src from ok.ru:
//   <iframe src="https://ok.ru/videoembed/..."></iframe>

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

    // LACartoons uses ok.ru/videoembed iframes, but we try multiple known patterns
    // to be resilient to future changes:
    //   1. ok.ru/videoembed (current, confirmed May 2026)
    //   2. Any <iframe> inside the main content area as fallback
    let embedSrc: string | undefined;

    // Pattern 1: ok.ru embed (confirmed)
    embedSrc = $('iframe[src*="ok.ru"]').attr('src');

    // Pattern 2: any iframe with a video embed src (cubeembed, rutube, etc.)
    if (!embedSrc) {
        embedSrc = $('iframe[src*="embed"]').attr('src');
    }

    // Pattern 3: any iframe at all (last resort)
    if (!embedSrc) {
        embedSrc = $('iframe').first().attr('src');
    }

    if (!embedSrc) {
        throw new Error(`LACartoons: embed no encontrado en ${fullUrl}`);
    }

    return embedSrc;
}
