<CUSTOM_PLAN>

# WatchJunto — Implementation Plan (Processed)

**Status:** Plan fully analyzed. Ready for implementation.
**Date processed:** 2026-05-14
**Plan version:** 1.0 (Original + Detailed)

---

## Codebase Pre-Implementation Audit

Before writing a single line of code, the following was verified against the
live workspace at `apps/client/src/` and `apps/server/src/`:

### Already Implemented (can skip or verify-only)

| Phase | Item | Status |
|-------|------|--------|
| Phase 0 | Emoji removal from `apps/client/src/` | DONE — no emoji characters found in any .tsx/.ts file |
| Phase 1 | `sourceType` union extended to include `series` in `client/types.ts` | DONE |
| Phase 1 | `sourceType` union includes `series` in all server type locations (`types.ts`) | DONE |
| Phase 1 | `player-load` discriminated union includes `{ type: series; embedUrl: string }` | DONE |
| Phase 1 | `series-episode-change` event in both `ServerToClientEvents` and `ClientToServerEvents` | DONE |
| Phase 2 | `apps/server/src/services/libraryService.ts` created | EXISTS |
| Phase 3 | `apps/server/src/routes/library.ts` created | EXISTS |
| Phase 7 | `apps/client/src/hooks/useWatchProgress.ts` created | EXISTS |
| Phase 7 | `apps/client/src/hooks/useSeriesNavigation.ts` created | EXISTS |
| Phase 8 | `apps/client/src/components/SeriesSelector.tsx` created | EXISTS |
| Phase 8 | `apps/client/src/components/NextEpisodeButton.tsx` created | EXISTS |

### Remaining Work (must be verified and completed)

- **Phase 3** — Verify `createLibraryRouter()` is registered in `apps/server/src/index.ts`
- **Phase 4** — Verify `series-episode-change` socket handler exists in `apps/server/src/socket/index.ts`
- **Phase 5** — Verify `series` is accepted in `routes/admin.ts` room creation handler
- **Phase 6** — Verify `CreateRoomModal.tsx` has been redesigned (4 cards with lucide-react icons, "Series Clasicas" option)
- **Phase 9** — Verify `RoomPage.tsx` integrates `SeriesSelector`, `NextEpisodeButton`, `useWatchProgress`, `useSeriesNavigation`
- **Phase 10** — Verify `AdminPage.tsx` has the progress-reset section for Classic Series
- **Phase 11** — Run `npx tsc --noEmit` in both `apps/client/` and `apps/server/`; run final emoji scan

---

## Critical Implementation Notes

### 1. LACartoons scraper selectors (Phase 2 — highest risk)
`libraryService.ts` exists but its cheerio selectors for
`fetchSerieDetail()` and `resolveEpisodeEmbed()` must be validated against
the live HTML of `https://www.lacartoons.com`. The selector for the cubeembed
iframe (`iframe[src*="cubeembed"]`) and season/episode DOM structure must match
the actual page. If the site has changed its HTML structure, update the selectors
and document them in `docs/lacartoons-scraper.md`.

### 2. `library.ts` route registration (Phase 3)
Confirm `app.use("/api/library", createLibraryRouter())` is present in
`apps/server/src/index.ts`. If missing, add it alongside the existing
`app.use("/api/...") ` lines.

### 3. `sync-state` sourceType bug (Phase 1)
The original plan noted that `ServerToClientEvents["sync-state"]` previously
narrowed `sourceType` to `youtube | iptv | movie` (missing `url`).
This bug has been fixed in the current `types.ts` which now includes all five
variants including `series`. No action needed if already confirmed.

### 4. Any-user episode control (intentional)
The `series-episode-change` socket handler does NOT require admin status.
Any authenticated user in the room can change the current episode.
This is intentional product behavior for Classic Series rooms.
Do not add an isAdmin guard to this handler.

### 5. Iframe playback sync limitation (known)
`player-play`, `player-pause`, and `player-seek` socket events are no-ops for
cross-origin iframe content (series embed URLs). This is the same known
limitation that already exists for `sourceType === "url"` rooms. Do not attempt
to fix this — it is out of scope for this plan.

### 6. Watch progress is local (localStorage only)
The `useWatchProgress` hook stores episode progress in `localStorage` keyed by
`watchjunto_watched_{roomId}_{username}`. This is intentionally not synced to
the database. The progress is per-device, per-user, per-room. The AdminPage
reset button only clears localStorage on the local device.

### 7. Ordered implementation sequence (from DETAILED_PLAN)
If implementing from scratch or completing remaining phases, follow this order
to minimize TypeScript errors:
  1. Phase 1 — Types (client + server)
  2. Phase 0 — Emoji audit
  3. Phase 2 — libraryService.ts
  4. Phase 3 — library.ts route + api.ts libraryApi
  5. Phase 4 — series-episode-change socket handler
  6. Phase 5 — Room creation with series sourceType
  7. Phase 6 — CreateRoomModal redesign
  8. Phase 7 — useWatchProgress + useSeriesNavigation hooks
  9. Phase 8 — SeriesSelector + NextEpisodeButton components
  10. Phase 9 — RoomPage.tsx full integration
  11. Phase 10 — AdminPage progress reset
  12. Phase 11 — tsc --noEmit + emoji scan

---

</CUSTOM_PLAN>

<ORIGINAL_PLAN>

Implementa las siguientes mejoras en WatchJunto. Todo completo y funcional.

## 1. Eliminar todos los emojis del proyecto
Busca en TODOS los archivos .tsx, .ts, .html, .css cualquier emoji 
(📺 🎬 🔗 ▶ 📚 🏠 etc.) y reemplázalos por iconos SVG inline o 
del paquete lucide-react. Usa lucide-react que ya está disponible.

Mapeo de reemplazos:
- 📺 TV         → <Tv /> de lucide-react
- ▶ YouTube     → <Youtube /> de lucide-react  
- 🎬 Movies     → <Film /> de lucide-react
- 🔗 URL        → <Library /> de lucide-react (renombrar a "Series")
- 📚 Biblioteca → <BookOpen /> de lucide-react
- ➕ Crear sala → <Plus /> de lucide-react
- 🔄 Resync     → <RefreshCw /> de lucide-react
- 💬 Chat       → <MessageSquare /> de lucide-react
- 👥 Usuarios   → <Users /> de lucide-react
- ⚙️ Admin      → <Settings /> de lucide-react
- cualquier otro emoji → busca el equivalente más cercano en lucide-react

## 2. Rediseño del modal "Nueva Sala"
El modal actual tiene 4 tarjetas con emojis. Rediseñarlo así:

- Quitar emojis, usar iconos SVG de lucide-react en cada tarjeta
- Cambiar "URL directa" → "Series Clásicas" con ícono <Library />
- Descripción de Series Clásicas: "Cartoons clásicos de tu biblioteca"
- Las 4 opciones quedan:
  1. YouTube      → ícono <Youtube />    → "Videos de YouTube"
  2. Lista IPTV   → ícono <Tv />         → "Canales en vivo y VOD"
  3. Jellyfin     → ícono <Film />       → "Tu servidor de películas"
  4. Series Clásicas → ícono <Library /> → "Cartoons clásicos de tu biblioteca"
- Estilo de tarjetas: borde sutil, hover con glow púrpura, 
  ícono centrado arriba, título bold, descripción pequeña abajo
- Al seleccionar una tarjeta: borde púrpura activo + fondo ligeramente 
  iluminado (como ya funciona con URL directa)

## 3. Sala de tipo "Series Clásicas" — experiencia completa

### 3.1 Estado de la sala
Cuando se crea una sala tipo 'series', agregar al estado:
- selectedSerie: { id, name, lacartoons_serie_id } | null
- selectedTemporada: number | null  
- selectedEpisodio: { titulo, url, capitulo_numero } | null
- episodiosCache: Map<serie_id, temporadas[]>
- watchedEpisodes: Set<string> (keys: "serie_id-temp-cap")
  Persistir watchedEpisodes en localStorage por sala+usuario

### 3.2 Reemplazar botón "Reproducir" por selector de episodio
En la barra inferior de la sala cuando el source es 'series', 
en lugar de input de URL + botón Reproducir, mostrar:

[Selector de Serie ▾] [Temporada ▾] [Capítulo ▾] [▶ Ver] [⏭ Siguiente]

- Selector de Serie: dropdown con las series activas de library.json
  Al cambiar serie → resetea temporada y capítulo, hace fetch de episodios
- Selector de Temporada: dropdown con Temporada 1, Temporada 2, etc.
  Al cambiar temporada → resetea capítulo y carga episodios de esa temporada
- Selector de Capítulo: lista de episodios de esa temporada
  Cada ítem muestra: ✓ si ya fue visto, título del episodio
  Al seleccionar → hace GET /api/library/episode?path=[url]
  Recibe embedUrl → emite socket player-load con el embedUrl
- Botón Ver: carga el episodio seleccionado
- Botón Siguiente (⏭): avanza al siguiente episodio en orden

### 3.3 Botón Siguiente — lógica de orden
Cuando se presiona Siguiente o el video termina (onEnded):
1. Buscar el índice del episodio actual en la temporada actual
2. Si hay siguiente episodio en la misma temporada → cargarlo
3. Si era el último de la temporada → pasar a Temporada N+1, Capítulo 1
4. Si era el último episodio de la última temporada → mostrar mensaje 
   "¡Terminaste la serie! 🎉" y no hacer nada más
5. Emitir socket player-load con el embedUrl del siguiente episodio
6. Actualizar selectedTemporada y selectedEpisodio en el estado

### 3.4 Botón Siguiente dentro del canvas de video
Agregar un botón flotante "⏭ Siguiente episodio" que aparezca:
- En la esquina inferior derecha del área del player
- Solo visible cuando hay un episodio cargado y hay siguiente disponible
- Estilo: pill oscuro con ícono <SkipForward /> de lucide-react + texto
- Al hacer hover se ilumina en púrpura
- Al hacer clic ejecuta la misma lógica del botón Siguiente de la barra

### 3.5 Progress tracking — episodios vistos
Sistema de check para saber qué episodios ya viste:

Storage: localStorage con key "watchjunto_watched_[roomId]_[userId]"
Formato: { "coraje-1-3": true, "coraje-1-4": true, ... }
Key format: "[serie_id]-[temporada]-[capitulo_numero]"

Cuándo marcar como visto:
- Cuando el video emite onEnded (terminó de forma natural)
- También al hacer clic en Siguiente manualmente (asume que lo vio)

Dónde mostrar el check:
- En el dropdown de capítulos: ✓ verde antes del título si ya fue visto
- En la barra inferior: pequeño badge "Ep. 3/13 ✓" mostrando progreso
  de la temporada actual

Reset de progreso:
- En el panel admin → sección de Series Clásicas → botón por serie:
  "Resetear mi progreso" que limpia el localStorage de esa serie
- Solo afecta al usuario que lo ejecuta (es localStorage, no DB)

### 3.6 Sincronización entre usuarios
Cuando el admin cambia de episodio (Siguiente o selector):
- Emitir nuevo evento socket: series-episode-change {
    roomId,
    serieId,
    temporada,
    episodioIndex,
    embedUrl
  }
- Todos los clientes reciben el evento y actualizan:
  selectedSerie, selectedTemporada, selectedEpisodio, y cargan el embedUrl
- El check de "visto" es LOCAL de cada usuario — no se sincroniza

## 4. Integración con el backend de biblioteca existente
(Usar el libraryService.ts del prompt anterior)

En el frontend, al abrir sala tipo 'series':
1. GET /api/library/series → cargar lista de series activas
2. Al elegir serie → GET /api/library/series/:serieId/episodes
3. Al elegir episodio → GET /api/library/episode?path=[url]
4. Mostrar loading spinner en los dropdowns mientras cargan

## 5. Archivos a modificar/crear
- Modificar: RoomPage.tsx (selector, botón siguiente, botón flotante)
- Modificar: CreateRoomModal.tsx (rediseño + cambio de textos/iconos)
- Modificar: todos los archivos con emojis → reemplazar por lucide-react
- Crear: components/SeriesSelector.tsx (los 3 dropdowns + lógica)
- Crear: components/NextEpisodeButton.tsx (botón flotante en el canvas)
- Crear: hooks/useWatchProgress.ts (lógica de localStorage de episodios vistos)
- Crear: hooks/useSeriesNavigation.ts (lógica de siguiente/anterior episodio)
- Modificar: server/index.ts → agregar handler para series-episode-change

## Reglas
- Todo el texto de UI en español
- Sin emojis en ningún lado — solo iconos SVG de lucide-react
- Los dropdowns deben ser accesibles con teclado (Enter selecciona, 
  flechas navegan)
- Loading states en todos los fetches (spinner o skeleton)
- Error states: si falla el fetch a LACartoons mostrar mensaje claro
- Mobile friendly: en pantalla pequeña los dropdowns se apilan verticalmente

Implementa todo completo. Cero placeholders.

</ORIGINAL_PLAN>

---

<DETAILED_PLAN>

# WatchJunto — Detailed Implementation Plan

**Version:** 1.0  
**Scope:** Emoji removal, CreateRoomModal redesign, Classic Series room type with full episode navigation, progress tracking, multi-user sync, and LACartoons library backend integration.

---

## Codebase Baseline

### Monorepo structure
- `apps/client/` — React 18 + TypeScript + Vite + TailwindCSS. State via Zustand (`store.ts`). Real-time via Socket.io client (singleton in `lib/socket.ts`).
- `apps/server/` — Node.js + Express + Socket.io. Postgres via Drizzle ORM. In-memory ephemeral room state in `services/rooms.ts` (`_rooms` Map), persisted room metadata in DB.

### Critical existing constraints
- `sourceType` union in `apps/server/src/types.ts` is currently `'youtube' | 'iptv' | 'movie' | 'url'`. The `ServerToClientEvents['sync-state']` incorrectly narrows it to `'youtube' | 'iptv' | 'movie'` (missing `'url'`). This existing bug must be fixed in the same PR.
- The `player-load` socket event discriminated union only covers `{ type: 'youtube'; videoId: string }` and `{ type: 'iptv'; streamUrl: string }`. To play series episodes (which resolve to embed URLs / iframes), a third branch `{ type: 'series'; embedUrl: string }` must be added.
- The DB column `rooms.source_type` is `varchar(20)`. Adding `'series'` (6 chars) is within the limit — no DB migration needed for that column alone.
- `lucide-react` is already installed in the client package. No new icon dependency needed.
- All UI text must remain in Spanish. All code, comments, and identifiers in English.

---

## Phase 0 — Pre-implementation Audit (Emoji Removal)

**Goal:** Remove every emoji character from all `.tsx`, `.ts`, `.html`, and `.css` files and replace with lucide-react icons or plain text as appropriate.

### 0.1 Files confirmed to contain emojis

Run a grep over `apps/client/src/` for Unicode emoji code points to find all occurrences. Based on code review, confirmed emoji locations are:

- `apps/client/src/components/CreateRoomModal.tsx`  
  - Lines with `▶️`, `📺`, `🎬`, `🔗` inside button `<span>` elements (the 4 source type cards).  
  - Line with `🔒` inside a `toast.success()` call's `icon` prop.  
  - Lines in step 2 back-button where source name badge shows `▶️ YouTube`, `🎬 Movies (Jellyfin)`, `🔗 URL directa`, `📺 Lista IPTV`.

- Scan all other files in `apps/client/src/` and `apps/server/src/` for any other emoji occurrences before making changes. Check `LobbyPage.tsx`, `Sidebar.tsx`, `AdminPage.tsx`, `RoomPage.tsx`, `QueuePanel.tsx`, `IPTVBrowserModal.tsx`, `VideoSearchModal.tsx`, `JellyfinBrowserModal.tsx`.

### 0.2 Replacement strategy

Where an emoji appears inside a button/card that already renders JSX, replace the `<span>emoji</span>` with the corresponding `<IconName className="w-8 h-8" />` lucide-react icon.

Where an emoji appears inside a string literal (e.g., `toast.success('...')` or a template literal), replace with a plain text equivalent or remove if purely decorative. The `toast.success` PIN message `icon: '🔒'` can be replaced with `icon: <Lock className="w-4 h-4 text-yellow-400" />` since react-hot-toast accepts a ReactNode.

Canonical icon mapping (already listed in original plan — use this):
- `▶️` / `▶` → `<Youtube />` in YouTube context, `<Play />` in generic play context  
- `📺` → `<Tv />`  
- `🎬` → `<Film />`  
- `🔗` → `<Library />`  
- `📚` → `<BookOpen />`  
- `➕` → `<Plus />`  
- `🔄` → `<RefreshCw />`  
- `💬` → `<MessageSquare />`  
- `👥` → `<Users />`  
- `⚙️` → `<Settings />`  
- `🔒` → `<Lock />`  
- `🏠` → `<Home />`  
- `⏭` → `<SkipForward />`  
- `✓` / `✅` → `<Check />` with `className="text-green-400"`  
- `🎉` → remove or replace with plain text "¡Terminaste la serie!"

### 0.3 Icon sizing convention
- In cards (CreateRoomModal step 1): `w-8 h-8` (32px)  
- In buttons/toolbars: `w-4 h-4` (16px)  
- In badges/inline: `w-3 h-3` (12px)

---

## Phase 1 — TypeScript Types

All types must be updated before any implementation begins to avoid cascading TS errors.

### 1.1 `apps/client/src/types.ts`

**Extend `Room.sourceType`:**
Change union from `'youtube' | 'iptv' | 'movie' | 'url'` to `'youtube' | 'iptv' | 'movie' | 'url' | 'series'`.

**Add new interfaces:**

```ts
export interface LibrarySerie {
  id: string;           // slug used as serieId (e.g., "coraje")
  name: string;         // display name (e.g., "Coraje el Perro Cobarde")
  thumbnail?: string;   // optional poster URL
  active: boolean;      // only active ones are shown in dropdowns
}

export interface LibraryEpisodio {
  capitulo_numero: number;
  titulo: string;
  url: string;          // raw path/URL; NOT the embed URL
}

export interface LibraryTemporada {
  temporada: number;
  episodios: LibraryEpisodio[];
}

export interface LibrarySerieDetail extends LibrarySerie {
  temporadas: LibraryTemporada[];
}

export interface LibraryEpisodeEmbed {
  embedUrl: string;     // resolved playable URL or iframe src
}

export interface SeriesRoomState {
  selectedSerieId: string | null;
  selectedTemporada: number | null;
  selectedEpisodioIndex: number | null;   // index within the temporada's episodios array
  embedUrl: string | null;
}
```

**Extend `QueueItem.type`:** Add `'series'` to the union (for future queue support, not required by this plan but keeps consistency).

### 1.2 `apps/server/src/types.ts`

**Extend all `sourceType` unions** from `'youtube' | 'iptv' | 'movie' | 'url'` to include `| 'series'` in:
- `Room.sourceType`  
- `RoomListItem.sourceType`  
- `ServerToClientEvents['sync-state']` payload `sourceType` field  
- `ServerToClientEvents['source-switched']` payload `sourceType` field  
- `ClientToServerEvents['switch-source']` payload `sourceType` field  
- The `createRoom` function signature in `services/rooms.ts`  
- The `buildRoomFromDb` helper cast in `services/rooms.ts`  
- The route handler in `routes/admin.ts` where sourceType is validated

**Extend `player-load` discriminated union:**

In both `ServerToClientEvents` and `ClientToServerEvents`, change:
```
'player-load': (data: { type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string }) => void;
```
to:
```
'player-load': (data:
  | { type: 'youtube'; videoId: string }
  | { type: 'iptv'; streamUrl: string }
  | { type: 'series'; embedUrl: string; title?: string; thumbnail?: string }
) => void;
```

**Add new socket events:**

In `ServerToClientEvents`:
```ts
'series-episode-change': (data: {
  serieId: string;
  serieName: string;
  temporada: number;
  episodioIndex: number;
  embedUrl: string;
  titulo: string;
}) => void;
```

In `ClientToServerEvents`:
```ts
'series-episode-change': (data: {
  roomId: string;
  serieId: string;
  serieName: string;
  temporada: number;
  episodioIndex: number;
  embedUrl: string;
  titulo: string;
}) => void;
```

---

## Phase 2 — Backend: Library Service

**File to create:** `apps/server/src/services/libraryService.ts`

This service is the sole point of contact with the external LACartoons API. It abstracts HTTP calls and provides in-memory caching so repeated requests for the same data don't hammer the external API.

### 2.1 Scraping Configuration

LACartoons has no public REST API. The service scrapes HTML pages directly using `cheerio`.

Add `cheerio` to `apps/server/package.json` dependencies.

Create a static config file `apps/server/src/db/library.json` listing known series with the shape:
```json
[
  { "id": "coraje", "name": "Coraje el Perro Cobarde", "lacartoons_serie_id": 42, "thumbnail": "...", "active": true }
]
```
The `lacartoons_serie_id` is the numeric ID used in lacartoons.com URL paths. The `id` field is a human-readable slug used as the key in all frontend/backend operations.

No environment variable is required for the LACartoons base URL. The base URL `https://www.lacartoons.com` is hardcoded as a module constant `LACARTOONS_BASE_URL` in `libraryService.ts`.

### 2.2 Cache design

Use two `Map` instances as module-level variables:
- `seriesCache: Map<string, LibrarySerie[]>` — key `'all'`, stores the full list.  
- `episodesCache: Map<string, LibrarySerieDetail>` — key is `serieId`, stores full detail with temporadas.

Add a `cacheTimestamps: Map<string, number>` to implement TTL. TTL for series list: 5 minutes. TTL for individual series detail: 10 minutes. If within TTL, return cached value directly without hitting the external API.

### 2.3 Functions to export

```
fetchSeriesList(): Promise<LibrarySerie[]>
  - Reads apps/server/src/db/library.json (require/import)
  - Filters entries where active === true
  - Returns: LibrarySerie[]

fetchSerieDetail(serieId: string): Promise<LibrarySerieDetail>
  - Looks up lacartoons_serie_id for the given slug in library.json
  - Fetches https://www.lacartoons.com/serie/{lacartoons_serie_id} using global fetch (Node 18+) with 10s AbortSignal timeout
  - Parses response HTML with cheerio.load()
  - Extracts season groups and episode entries from the DOM (Ruby on Rails standard HTML structure)
  - Constructs LibrarySerieDetail with temporadas array
  - Returns: LibrarySerieDetail

resolveEpisodeEmbed(episodePath: string): Promise<string>
  - Constructs full URL: if episodePath starts with '/', prepend LACARTOONS_BASE_URL
    → Full URL format: https://www.lacartoons.com/serie/capitulo/[id]?t=[temporada]
  - Fetches the episode page with global fetch (Node 18+), 10s timeout
  - Parses HTML with cheerio.load()
  - Selects iframe[src*="cubeembed"] and returns its src attribute as the embedUrl
  - Throws descriptive error if cubeembed iframe is not found
  - Returns: string (the embedUrl)
```

### 2.4 HTTP client and HTML parser

Use the built-in global `fetch` (available in Node 18+) for all HTTP requests to lacartoons.com. No additional HTTP client dependency is needed.

Use `cheerio` (added to `apps/server/package.json`) for HTML parsing. Import as `import * as cheerio from 'cheerio'` and use `cheerio.load(html)` to get a jQuery-like `$` selector function.

Set a 10-second timeout on all external fetch requests using `AbortSignal.timeout(10000)`. On timeout or non-2xx response, throw an error with a descriptive message that the route handlers can catch and forward as a 502.

### 2.5 CORS / Proxy considerations

The browser cannot call the LACartoons API directly due to CORS. All requests from the frontend must go through the WatchJunto backend (`/api/library/*`). This is already the architecture described in the plan. The backend service calls the external API server-side.

The `embedUrl` returned for series episodes may be:
- An iframe embed URL (e.g., `https://lacartoons.com/embed/12345`) — rendered via `<iframe>` in the client.  
- An HLS `.m3u8` stream URL — loaded via the existing `useHlsPlayer` hook.  
- A direct MP4 URL — loaded via the `<video>` element through `useHlsPlayer`.

The client should inspect the `embedUrl` format using the existing `isDirectVideoUrl()` helper in `RoomPage.tsx` to decide which player to use, treating non-direct URLs as iframes. The same pattern already exists for the `'url'` sourceType.

---

## Phase 3 — Backend: Library Routes

**File to create:** `apps/server/src/routes/library.ts`

This module exports a `createLibraryRouter()` function that returns an Express `Router`.

### 3.1 Route definitions

```
GET /api/library/series
  Auth: requireAuth (user must be logged in — same middleware used by other protected routes)
  Handler: call fetchSeriesList(), return JSON array of LibrarySerie
  On error: 502 { error: 'No se pudo conectar a la biblioteca' }

GET /api/library/series/:serieId/episodes
  Auth: requireAuth
  Param: serieId — validate it's alphanumeric + hyphens, max 100 chars (prevent path traversal)
  Handler: call fetchSerieDetail(serieId), return LibrarySerieDetail
  On 404 from external: 404 { error: 'Serie no encontrada' }
  On other error: 502

GET /api/library/episode
  Auth: requireAuth
  Query param: path (required, string)
  Validate: path is not empty, max 500 chars
  Handler: call resolveEpisodeEmbed(path), return { embedUrl: string }
  On error: 502
```

### 3.2 Auth middleware

Use the existing `auth` middleware from `apps/server/src/middleware/auth.ts`. Check how other non-admin routes use it (e.g., `routes/search.ts`, `routes/iptv.ts`). The library routes are user-level, not admin-level, so use the user session check not `adminAuth`.

### 3.3 Registration in `apps/server/src/index.ts`

Import `createLibraryRouter` and mount it:
```
app.use('/api/library', createLibraryRouter());
```
This line goes alongside the other `app.use('/api/...')` registrations already in `index.ts`.

### 3.4 Frontend API client update

In `apps/client/src/lib/api.ts`, add:

```
export const libraryApi = {
  listSeries: () => api.get<LibrarySerie[]>('/api/library/series'),
  getSerieDetail: (serieId: string) => api.get<LibrarySerieDetail>(`/api/library/series/${serieId}/episodes`),
  resolveEmbed: (path: string) => api.get<{ embedUrl: string }>('/api/library/episode', { params: { path } }),
};
```

Import the new types from `../types` at the top of `api.ts`.

---

## Phase 4 — Backend: Socket Handler for `series-episode-change`

**File to modify:** `apps/server/src/socket/index.ts`

### 4.1 Handler logic

Add a new `socket.on('series-episode-change', ...)` handler inside the `io.on('connection', ...)` block, after the existing `player-load` handler.

Steps inside the handler:
1. Destructure `{ roomId, serieId, serieName, temporada, episodioIndex, embedUrl, titulo }` from the event data.
2. Verify `socket.data.authenticated` — return early if not.
3. Verify the socket is in the specified room (check `socket.data.roomId === roomId`) — return early if not.
4. Do NOT check for admin status — any authenticated user in the room can change the episode. This is an intentional product decision.
5. Update the room's `playerState` via `updatePlayerState(roomId, { streamUrl: embedUrl, videoId: null, currentTime: 0, isPlaying: false, title: titulo, thumbnail: null })`.
6. Broadcast to all clients in the room (including sender):
   `io.to(roomId).emit('series-episode-change', { serieId, serieName, temporada, episodioIndex, embedUrl, titulo })`
7. Also emit `player-load` with type `series` so the existing player machinery loads the embed:
   `io.to(roomId).emit('player-load', { type: 'series', embedUrl, title: titulo })`

### 4.2 Update `sync-state` for series rooms

When a client joins a series room, the existing `sync-state` handler emits `room.playerState.streamUrl`. If a series episode is loaded, `streamUrl` will contain the `embedUrl`. The client receiving `sync-state` for a `series` sourceType should treat `streamUrl` as an `embedUrl` and render it as an iframe if it's not a direct video URL. The client-side logic for this already exists in the `'url'` sourceType path in `RoomPage.tsx` and can be reused.

No additional server-side changes needed for `sync-state` beyond having the `sourceType` union include `'series'`.

---

## Phase 5 — Backend: Room Creation with `'series'` Source Type

**File to modify:** `apps/server/src/routes/admin.ts`

In the `POST /rooms` handler, the `sourceType` value from `req.body` is cast and passed to `createRoom()`. Update the TypeScript type assertion to include `'series'`:

```
sourceType?: 'youtube' | 'iptv' | 'movie' | 'url' | 'series'
```

No other logic changes needed here since series rooms have no IPTV list ID and the `iptvListId` field is already optional.

**File to modify:** `apps/server/src/services/rooms.ts`

Update the `createRoom` function signature's `sourceType` parameter type to include `| 'series'`.

Update the `buildRoomFromDb` function cast:
```
sourceType: dbRoom.sourceType as 'youtube' | 'iptv' | 'movie' | 'url' | 'series',
```

---

## Phase 6 — Frontend: CreateRoomModal Redesign

**File to modify:** `apps/client/src/components/CreateRoomModal.tsx`

### 6.1 State type change

The `sourceType` state currently has type `'youtube' | 'iptv' | 'movie' | 'url'`. Change it to include `| 'series'`. Change the initial value and the `handleSourceSelect` parameter type accordingly.

### 6.2 Step 1 — Source type cards

Replace the existing `<div className="grid grid-cols-2 gap-3">` content entirely. The four new cards are:

| Option | Icon | Title | Description |
|---|---|---|---|
| youtube | `<Youtube className="w-8 h-8" />` | YouTube | Videos de YouTube |
| iptv | `<Tv className="w-8 h-8" />` | Lista IPTV | Canales en vivo y VOD |
| movie | `<Film className="w-8 h-8" />` | Jellyfin | Tu servidor de películas |
| series | `<Library className="w-8 h-8" />` | Series Clásicas | Cartoons clásicos de tu biblioteca |

Remove the `'url'` option entirely from the modal. The `'url'` sourceType is no longer user-creatable from this flow (though existing 'url' rooms remain functional).

**Card styling** (Tailwind):
```
flex flex-col items-center gap-3 p-5 rounded-xl border transition-all text-white
border-white/10 bg-white/5 hover:bg-violet-600/20 hover:border-violet-500 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]
```

Selected state (when `sourceType === option`):
```
border-violet-500 bg-violet-600/20 shadow-[0_0_12px_rgba(139,92,246,0.3)]
```

The icon wrapper should be a `<div className="p-3 rounded-full bg-white/10">` containing the icon.

### 6.3 Step 2 — Back button badge

The source name badge in the "← Cambiar fuente" back button currently uses emoji strings. Replace with an inline component pattern using a `Map<string, ReactNode>` keyed by `sourceType` that maps to `<><IconComponent className="w-3 h-3 inline mr-1" /> Label</>`. Render this from the map instead of a ternary chain.

### 6.4 Step 2 — Series rooms have no extra config

For `sourceType === 'series'`, step 2 should show only the room name input and max users/access controls — no IPTV list selector, no additional fields. Ensure the `sourceType === 'iptv'` block with list selector is guarded properly and doesn't render for `'series'`.

### 6.5 adminApi.createRoom call

The existing call signature `adminApi.createRoom(name, maxUsers, isOpen, sourceType, iptvListId)` already passes `sourceType`. Since 'series' is now in the union, no change to the call itself is needed. The `iptvListId` will be `undefined` for series rooms which is correct.

### 6.6 Fix toast icon

Replace `{ icon: '🔒' }` in the PIN toast with `{ icon: <Lock className="w-4 h-4 text-yellow-400" /> }`. Import `Lock` from `lucide-react`.

---

## Phase 7 — Frontend: New Hooks

### 7.1 `apps/client/src/hooks/useWatchProgress.ts`

**Purpose:** Manages per-user, per-room watched episodes tracking in `localStorage`.

**localStorage key format:** `watchjunto_watched_{roomId}_{username}`  
**Value format:** `Record<string, true>` where keys are `"{serieId}-{temporada}-{capitulo_numero}"`.

**Exports:**
```
function useWatchProgress(roomId: string, username: string): {
  isWatched: (serieId: string, temporada: number, capituloNumero: number) => boolean;
  markWatched: (serieId: string, temporada: number, capituloNumero: number) => void;
  resetProgress: (serieId: string) => void;       // clears all keys matching serieId prefix
  getSeasonProgress: (serieId: string, temporada: number, total: number) => number; // watched count
}
```

**Implementation notes:**
- Initialize state from `localStorage.getItem(key)` on mount, parse JSON, default to `{}` if missing or invalid.
- `markWatched` updates the state map and immediately calls `localStorage.setItem` with the serialized map.
- `resetProgress` filters out all keys starting with `"{serieId}-"` and saves the reduced map.
- Use `useState` for the in-memory map so components re-render when progress changes. Avoid `useEffect` for the write path — write synchronously in the callback.
- Handle `localStorage` quota exceptions with a try/catch (rare but possible on mobile).

### 7.2 `apps/client/src/hooks/useSeriesNavigation.ts`

**Purpose:** Encapsulates the "next episode" traversal logic across seasons, keeping `RoomPage.tsx` clean.

**Parameters:**
```
function useSeriesNavigation(params: {
  serieDetail: LibrarySerieDetail | null;
  selectedTemporada: number | null;
  selectedEpisodioIndex: number | null;
}): {
  hasNext: boolean;
  getNext: () => { temporada: number; episodioIndex: number; episodio: LibraryEpisodio } | null;
  hasPrev: boolean;
  getPrev: () => { temporada: number; episodioIndex: number; episodio: LibraryEpisodio } | null;
}
```

**Implementation notes:**
- `hasNext`: returns true if there is a next episode (either next in current season, or first of next season).
- `getNext()`: 
  1. Find the current `temporada` object in `serieDetail.temporadas` by matching `temporada.temporada === selectedTemporada`.
  2. If `selectedEpisodioIndex + 1 < temporada.episodios.length` → return same temporada, index + 1.
  3. Else find the next `temporada` in `serieDetail.temporadas` (sort by `temporada.temporada`, find the one after current).
  4. If next temporada exists → return `{ temporada: nextSeason.temporada, episodioIndex: 0, episodio: nextSeason.episodios[0] }`.
  5. Else → return `null` (end of series).
- This hook is pure computation, no side effects. The caller (`RoomPage`) handles emitting socket events.
- Sort `serieDetail.temporadas` by `temporada.temporada` ascending before traversal to guarantee correct order regardless of API response order.

---

## Phase 8 — Frontend: New Components

### 8.1 `apps/client/src/components/SeriesSelector.tsx`

**Props:**
```ts
interface SeriesSelectorProps {
  roomId: string;
  username: string;
  isAdmin: boolean;
  serieDetail: LibrarySerieDetail | null;
  seriesList: LibrarySerie[];
  selectedSerieId: string | null;
  selectedTemporada: number | null;
  selectedEpisodioIndex: number | null;
  loadingEpisodes: boolean;
  loadingSeries: boolean;
  onSerieChange: (serieId: string) => void;
  onTemporadaChange: (temporada: number) => void;
  onEpisodioChange: (index: number) => void;
  onPlay: () => void;
  onNext: () => void;
  hasNext: boolean;
  watchProgress: ReturnType<typeof useWatchProgress>;
}
```

**Layout (desktop):** Single horizontal flex row:
```
[Serie dropdown] [Temporada dropdown] [Episodio dropdown] [Ver button] [Siguiente button]
```

**Layout (mobile, `sm:` breakpoint):** Stack vertically:
```
[Serie dropdown full width]
[Temporada | Episodio side by side]
[Ver button | Siguiente button side by side]
```

**Dropdowns:** Each is a `<select>` element (native) for accessibility (keyboard navigation comes for free). Style with Tailwind to match the dark theme: `bg-gray-800 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500`.

All dropdowns and buttons are enabled for any authenticated user in the room — any user can change the current episode. The `isAdmin` prop is retained in the interface for potential future use but does not gate interactivity.

**Serie dropdown:** `<option>` for each entry in `seriesList`. If `loadingSeries`, show a single disabled `<option>Cargando...</option>`.

**Temporada dropdown:** Derives options from `serieDetail.temporadas` sorted ascending. If `loadingEpisodes`, show loading option. Disabled when `selectedSerieId === null`.

**Episodio dropdown:** Derives options from the selected `temporada`'s `episodios` array. Each option text: `Cap. {capitulo_numero} — {titulo}`. Prefix with `✓ ` (text, not emoji) if `watchProgress.isWatched(serieId, temporada, capituloNumero)`. Disabled when `selectedTemporada === null`.

**Season progress badge:** Between the Episodio dropdown and the Ver button, show a small badge: `Ep. {watched}/{total}`. Compute via `watchProgress.getSeasonProgress(serieId, temporada, total)`.

**Loading spinner:** When `loadingEpisodes`, render a `<Loader2 className="w-4 h-4 animate-spin" />` icon next to the Temporada dropdown label.

**Error state:** If series list fails to load, show an inline message with `<AlertCircle className="w-4 h-4" />` and text "Error al cargar series" in red.

**Keyboard accessibility:** Since native `<select>` elements are used, keyboard navigation (arrow keys, Enter, Tab) is provided by the browser natively.

### 8.2 `apps/client/src/components/NextEpisodeButton.tsx`

**Props:**
```ts
interface NextEpisodeButtonProps {
  visible: boolean;   // only render when hasNext && isAdmin && episodio is loaded
  onClick: () => void;
  nextEpisodeTitulo?: string;
}
```

**Positioning:** This component must be placed inside the player container in `RoomPage.tsx` with `absolute` positioning. The player container already has `relative` positioning for the overlay controls. Place the button at `bottom-4 right-4`.

**Styling:**
```
absolute bottom-4 right-4 z-20
flex items-center gap-2 px-4 py-2 rounded-full
bg-black/70 backdrop-blur-sm border border-white/20
text-white text-sm font-medium
hover:bg-violet-600/80 hover:border-violet-500 hover:shadow-[0_0_16px_rgba(139,92,246,0.5)]
transition-all duration-200 cursor-pointer
```

**Content:** `<SkipForward className="w-4 h-4" /> Siguiente episodio`

**Visibility:** Use CSS `opacity-0 pointer-events-none` when `!visible` and `opacity-100` when `visible`, with a `transition-opacity duration-300`. Never unmount it (avoids layout shifts); just hide with opacity.

---

## Phase 9 — Frontend: RoomPage Integration

**File to modify:** `apps/client/src/pages/RoomPage.tsx`

This is the most complex change. Follow these steps sequentially.

### 9.1 Add series-specific state

Inside the `RoomPage` function body, after the existing state declarations, add:

```
const [seriesList, setSeriesList] = useState<LibrarySerie[]>([]);
const [serieDetail, setSerieDetail] = useState<LibrarySerieDetail | null>(null);
const [selectedSerieId, setSelectedSerieId] = useState<string | null>(null);
const [selectedTemporada, setSelectedTemporada] = useState<number | null>(null);
const [selectedEpisodioIndex, setSelectedEpisodioIndex] = useState<number | null>(null);
const [loadingSeries, setLoadingSeries] = useState(false);
const [loadingEpisodes, setLoadingEpisodes] = useState(false);
const [seriesError, setSeriesError] = useState<string | null>(null);
```

### 9.2 Initialize hooks

Add calls for the two new hooks near the top of the component:

```
const watchProgress = useWatchProgress(roomId!, user!.username);
const { hasNext, getNext } = useSeriesNavigation({
  serieDetail,
  selectedTemporada,
  selectedEpisodioIndex,
});
```

### 9.3 Load series list on mount for series rooms

Add a `useEffect` that fires when `activeSource === 'series'` becomes true (or on mount if the room is already series type). Inside:
1. Set `loadingSeries = true`.
2. Call `libraryApi.listSeries()`.
3. On success: `setSeriesList(data)`. If list has items and `selectedSerieId` is null, auto-select the first series: call `handleSerieChange(data[0].id)`.
4. On error: `setSeriesError('No se pudo cargar la biblioteca')`.
5. `finally`: `setLoadingSeries = false`.

### 9.4 `handleSerieChange(serieId: string)`

1. Set `selectedSerieId(serieId)`, reset `selectedTemporada(null)`, `selectedEpisodioIndex(null)`, `setSerieDetail(null)`.
2. Set `loadingEpisodes(true)`.
3. Call `libraryApi.getSerieDetail(serieId)`.
4. On success: `setSerieDetail(data)`. Auto-select first temporada: `setSelectedTemporada(data.temporadas[0]?.temporada ?? null)`.
5. On error: `setSeriesError(...)`.
6. `finally`: `setLoadingEpisodes(false)`.

### 9.5 `handleTemporadaChange(temporada: number)`

1. `setSelectedTemporada(temporada)`, `setSelectedEpisodioIndex(null)`.

### 9.6 `handleEpisodioChange(index: number)`

1. `setSelectedEpisodioIndex(index)`.

### 9.7 `handlePlay()`

1. Guard: if `selectedSerieId == null` or `selectedTemporada == null` or `selectedEpisodioIndex == null`, return. No isAdmin check — any authenticated user can play.
2. Find the `LibraryEpisodio` from `serieDetail`.
3. Call `libraryApi.resolveEmbed(episodio.url)`.
4. On success: extract `embedUrl`. Emit socket:
   ```
   socket.emit('series-episode-change', {
     roomId: roomId!,
     serieId: selectedSerieId,
     serieName: seriesList.find(s => s.id === selectedSerieId)?.name ?? '',
     temporada: selectedTemporada,
     episodioIndex: selectedEpisodioIndex,
     embedUrl,
     titulo: episodio.titulo,
   });
   ```
5. On error: `toast.error('Error al cargar el episodio')`.

### 9.8 `handleNext()`

1. Guard: `if (!hasNext) return`. No isAdmin check — any authenticated user can advance to the next episode.
2. Get `const next = getNext()`. If null, `toast('¡Terminaste la serie!')`, return.
3. Mark current episode as watched: `watchProgress.markWatched(selectedSerieId!, selectedTemporada!, currentEpisodio.capitulo_numero)`.
4. Update state: `setSelectedTemporada(next.temporada)`, `setSelectedEpisodioIndex(next.episodioIndex)`.
5. Call `libraryApi.resolveEmbed(next.episodio.url)` to get `embedUrl`.
6. Emit `series-episode-change` socket event with the new episode data.

### 9.9 Update `handleEnded` callback

The existing `handleEnded` calls `socket.emit('queue-next', ...)`. For series rooms, it must instead call `handleNext()` and mark the current episode as watched. Use a `if (activeSource === 'series') { handleNext(); } else { socket.emit('queue-next', ...); }` branch.

Since `handleEnded` is a `useCallback` with `[roomId]` dependency, add the series-related state variables and `handleNext` to its dependency array.

### 9.10 Socket listener for `series-episode-change`

Inside the `useEffect` where socket events are subscribed, add:

```
function onSeriesEpisodeChange(data: SeriesEpisodeChangePayload) {
  setSelectedSerieId(data.serieId);
  setSelectedTemporada(data.temporada);
  setSelectedEpisodioIndex(data.episodioIndex);
  // Load the embed in the player:
  setCurrentStreamUrl(data.embedUrl);
  if (isDirectVideoUrl(data.embedUrl)) {
    setUrlActivePlayer('stream');
    urlActivePlayerRef.current = 'stream';
    loadStream(data.embedUrl);
  } else {
    setUrlActivePlayer('iframe');
    urlActivePlayerRef.current = 'iframe';
  }
  setNowTitle(data.titulo);
}
socket.on('series-episode-change', onSeriesEpisodeChange);
```

Clean up in the return function: `socket.off('series-episode-change', onSeriesEpisodeChange)`.

### 9.11 Update `onPlayerLoad` socket handler

Add the `type: 'series'` branch:
```
} else if (data.type === 'series') {
  setCurrentStreamUrl(data.embedUrl);
  setEmbedError(null);
  if (isDirectVideoUrl(data.embedUrl)) {
    setUrlActivePlayer('stream');
    urlActivePlayerRef.current = 'stream';
    loadStream(data.embedUrl);
  } else {
    setUrlActivePlayer('iframe');
    urlActivePlayerRef.current = 'iframe';
  }
  if (data.title) setNowTitle(data.title);
}
```

### 9.12 Update `onSyncState` handler

Add a case for `sourceType === 'series'`:
```
} else if (state.sourceType === 'series') {
  // Treat streamUrl as embedUrl (same as 'url' type)
  if (state.streamUrl) {
    setCurrentStreamUrl(state.streamUrl);
    if (isDirectVideoUrl(state.streamUrl)) {
      setUrlActivePlayer('stream');
      urlActivePlayerRef.current = 'stream';
      loadStream(state.streamUrl);
    } else {
      setUrlActivePlayer('iframe');
      urlActivePlayerRef.current = 'iframe';
    }
  }
}
```

### 9.13 Conditional render of bottom controls

In the bottom toolbar JSX, find the section that renders the URL input + play button (currently rendered for `activeSource !== 'youtube'`). Add a conditional:

```jsx
{activeSource === 'series' ? (
  <SeriesSelector
    roomId={roomId!}
    username={user!.username}
    isAdmin={user!.isAdmin}
    seriesList={seriesList}
    serieDetail={serieDetail}
    selectedSerieId={selectedSerieId}
    selectedTemporada={selectedTemporada}
    selectedEpisodioIndex={selectedEpisodioIndex}
    loadingEpisodes={loadingEpisodes}
    loadingSeries={loadingSeries}
    onSerieChange={handleSerieChange}
    onTemporadaChange={handleTemporadaChange}
    onEpisodioChange={handleEpisodioChange}
    onPlay={handlePlay}
    onNext={handleNext}
    hasNext={hasNext}
    watchProgress={watchProgress}
  />
) : (
  {/* existing URL input / IPTV / Jellyfin controls */}
)}
```

### 9.14 Add `NextEpisodeButton` to player area

In the JSX block where the player is rendered (the `<div>` containing the YouTube container, HLS video element, and iframe), add at the end (before closing tag):

```jsx
<NextEpisodeButton
  visible={activeSource === 'series' && hasNext}
  onClick={handleNext}
  nextEpisodeTitulo={nextEpisodeTitle}
/>
```

The player container must have `className="relative ..."` (it likely already does for overlay controls). Confirm and add `relative` if missing.

### 9.15 `onEnded` for watched progress

The `handleEnded` callback must mark the current episode as watched before advancing. Add:
```
if (activeSource === 'series' && selectedSerieId && selectedTemporada != null && selectedEpisodioIndex != null) {
  const ep = serieDetail?.temporadas
    .find(t => t.temporada === selectedTemporada)
    ?.episodios[selectedEpisodioIndex];
  if (ep) watchProgress.markWatched(selectedSerieId, selectedTemporada, ep.capitulo_numero);
}
```

---

## Phase 10 — Frontend: AdminPage Progress Reset

**File to modify:** `apps/client/src/pages/AdminPage.tsx`

Add a new collapsible section "Series Clásicas" in the admin panel. This section:

1. Fetches `libraryApi.listSeries()` on component mount (reuse existing pattern for fetching admin data).
2. Renders a list of series names with a "Resetear mi progreso" button next to each.
3. The button calls `watchProgress.resetProgress(serie.id)` where `watchProgress` is initialized with `useWatchProgress(roomId, user.username)`. 

**Note on roomId:** The progress reset in AdminPage is scoped per-room. If the admin is not currently in a room, you'll need to show the series list without room scoping, or add a room selector. The simplest approach: in `AdminPage`, iterate over `rooms` from the store and for each series, show all rooms where that series could have been watched. Alternatively, scope it to the current session's room only and display nothing if not in a room. 

**Recommended minimal approach:** Add a `"Resetear progreso en todas las salas"` button per serie that iterates over `useStore().rooms`, builds the localStorage key for each roomId, and clears the serie's entries. This way it doesn't require being inside a room.

Implement `resetProgressAllRooms(serieId: string, username: string, roomIds: string[])` as a utility function (not a hook) in `useWatchProgress.ts` that can be called with arbitrary roomIds.

---

## Phase 11 — Final Audit & Quality

### 11.1 TypeScript strict check

After all changes, run `npx tsc --noEmit` in both `apps/client/` and `apps/server/` to confirm zero type errors.

### 11.2 Remaining emoji scan

Run: `grep -rn --include="*.tsx" --include="*.ts" --include="*.html" --include="*.css" -P "[\x{1F000}-\x{1FFFF}]|[\x{2600}-\x{27BF}]" apps/` to confirm no emoji code points remain. Note that some emoji are multi-codepoint sequences; also scan for common ones manually (`▶`, `◀`, `⏭`, `🎉`, etc.).

### 11.3 Mobile responsiveness

Verify `SeriesSelector.tsx` stacks properly at `sm:` breakpoint (< 640px). Use Tailwind's responsive prefix `sm:flex-row` / `flex-col` on the outer container. Each `<select>` should have `w-full sm:w-auto`.

### 11.4 Loading states checklist

Verify each async operation shows a loading indicator:
- `SeriesSelector`: Loader2 spinner on serie/temporada dropdowns while fetching.
- `AdminPage` library section: skeleton or spinner while `listSeries()` loads.
- `handlePlay()` / `handleNext()`: disable the "Ver" and "Siguiente" buttons while resolving embed URL (add `loadingEmbed: boolean` state).

### 11.5 Error boundaries

No new error boundaries required. The existing `toast.error()` pattern is sufficient for all error states in this plan.

---

## Ordered Implementation Sequence

For a single agent working sequentially, implement in this order to minimize TS compilation errors at each step:

1. **Phase 1** — Extend TypeScript types in both `client/types.ts` and `server/types.ts`. Fix the existing `sync-state` sourceType bug.
2. **Phase 0** — Emoji audit and replacement across all files.
3. **Phase 2** — Create `apps/server/src/services/libraryService.ts`.
4. **Phase 3** — Create `apps/server/src/routes/library.ts` and register in `index.ts`. Update `apps/client/src/lib/api.ts` with `libraryApi`.
5. **Phase 4** — Add `series-episode-change` socket handler in `apps/server/src/socket/index.ts`.
6. **Phase 5** — Update `createRoom` + admin route to accept `'series'` sourceType.
7. **Phase 6** — Redesign `CreateRoomModal.tsx`.
8. **Phase 7** — Create `useWatchProgress.ts` and `useSeriesNavigation.ts`.
9. **Phase 8** — Create `SeriesSelector.tsx` and `NextEpisodeButton.tsx`.
10. **Phase 9** — Integrate everything into `RoomPage.tsx`.
11. **Phase 10** — Add progress reset to `AdminPage.tsx`.
12. **Phase 11** — Run TypeScript checks and final emoji scan.

---

## Risk Notes and Potential Issues

### LACartoons HTML scraping
LACartoons has no public REST API. The `libraryService.ts` scrapes HTML pages using `cheerio`. The exact DOM structure of https://www.lacartoons.com must be inspected before writing selectors in `fetchSerieDetail` and `resolveEpisodeEmbed`. The site is Ruby on Rails standard HTML. Before implementing the selectors, fetch the live pages and inspect the rendered HTML to determine the correct cheerio selectors for: season containers, episode links, episode titles, capitulo numbers, and the `iframe[src*="cubeembed"]` embed element. Document the chosen selectors in `docs/lacartoons-scraper.md`.

### Embed URL player compatibility
The `embedUrl` returned for series episodes may be an iframe URL (e.g., a cartoons hosting site). The existing `isDirectVideoUrl()` helper in `RoomPage.tsx` correctly distinguishes HLS/MP4 from iframes. The iframe path reuses `iframeRef` which already exists. Playback sync (play/pause/seek) is not possible inside cross-origin iframes. This is a known limitation — the `player-play`, `player-pause`, and `player-seek` socket events will be no-ops for iframe content. This matches the existing behavior for 'url' rooms with iframe content.

### Any-user episode control
The socket handler does NOT enforce an `isAdmin` check for `series-episode-change`. Any authenticated user in the room can change the episode. This is an intentional product decision for Series Clásicas rooms. The `SeriesSelector` component does not disable its controls based on `isAdmin`. The `NextEpisodeButton` is visible to all users when `hasNext` is true.

### Zustand store not extended
The series state (`selectedSerieId`, `selectedTemporada`, etc.) is kept as local `useState` inside `RoomPage.tsx` rather than in the global Zustand store. This is intentional: the series navigation state is ephemeral, per-room-session, and does not need to be shared with other pages. The global store only holds user session data and the rooms list.

### Database: no migration needed
Adding `'series'` to `sourceType` does not require a DB migration. The column is `varchar(20)` and already stores string values without a DB-level enum constraint. Existing rooms are unaffected.

</DETAILED_PLAN>