# Plan

## Problem

WatchJunto is a watch-together platform that currently supports YouTube, IPTV, and Jellyfin as source types. The project needs several improvements:

1. **Emoji pollution**: All `.tsx`, `.ts`, `.html`, and `.css` files contain Unicode emoji characters used as icons. These must be replaced with `lucide-react` SVG icons for a consistent, accessible, and professional UI.
2. **New "Series Clásicas" room type**: Integrate with LACartoons — a public Ruby on Rails website with no REST API — via server-side HTML scraping using `cheerio`. Users need to browse series, seasons, and episodes from inside a room.
3. **Modal redesign**: The `CreateRoomModal` uses emoji-based cards and lacks the new Series Clásicas option. It needs icon-based cards with violet hover styling and the new source type.
4. **Episode navigation UX**: Rooms of type `'series'` need dropdowns for selecting serie/season/episode, a next-episode button in the toolbar, and a floating next-episode button on the player canvas.
5. **Watch progress tracking**: Per-user, per-room watched episode state must be stored in `localStorage` with visual indicators in the episode dropdown.
6. **Real-time sync**: Any authenticated user in a series room can change the episode — triggering a new `series-episode-change` socket event broadcast to all room members.
7. **TypeScript gaps**: The existing `sourceType` union and `player-load` discriminated union are incomplete and must be extended before any downstream work begins.

## Solution

Implement changes in 11 features in strict dependency order to avoid cascading TypeScript errors:

- **Feature 1** (Emoji Removal): audit all files, replace emoji with `lucide-react` icons using the canonical icon mapping.
- **Feature 2** (TypeScript Types): extend `sourceType` unions, add new interfaces (`LibrarySerie`, `LibrarySerieDetail`, etc.), and add `series-episode-change` socket event types in both `client/types.ts` and `server/types.ts`.
- **Feature 3** (Backend Scraper): install `cheerio`, create `library.json` config, implement `libraryService.ts` with cheerio-based HTML scraping of `https://www.lacartoons.com`, cache results in memory (5–10 min TTL), expose via `/api/library/*` Express routes, and update the client's `api.ts` with a `libraryApi` object.
- **Feature 4** (Socket Handler): add `series-episode-change` handler in `socket/index.ts` — no admin restriction, any authenticated room member can trigger it.
- **Feature 5** (CreateRoomModal): replace emoji cards with icon-based cards, add `'series'` option, remove `'url'` from the flow, apply violet hover styles.
- **Feature 6** (Series Hooks): create `useWatchProgress.ts` (localStorage progress tracking) and `useSeriesNavigation.ts` (next/prev episode traversal logic).
- **Feature 7** (SeriesSelector): create `SeriesSelector.tsx` with three native `<select>` dropdowns, progress badge, and Ver/Siguiente buttons — accessible to all users.
- **Feature 8** (NextEpisodeButton): create floating `NextEpisodeButton.tsx` with opacity-based visibility and violet hover glow.
- **Feature 9** (RoomPage Integration): wire all new state, hooks, handlers, socket listeners, and conditional rendering into `RoomPage.tsx`.
- **Feature 10** (AdminPage Progress Reset): add a Series Clásicas section with per-series progress reset controls.
- **Feature 11** (Documentation): create `docs/series-architecture.md` and `docs/lacartoons-scraper.md`, add TSDoc to all new code.

---

### Feature 1: Emoji Removal

Remove every emoji character from all `.tsx`, `.ts`, `.html`, and `.css` files and replace with `lucide-react` icons or plain text. Icon sizing convention: `w-8 h-8` in cards, `w-4 h-4` in buttons/toolbars, `w-3 h-3` inline.

- [x] Run `grep -rn --include="*.tsx" --include="*.ts" --include="*.html" --include="*.css" -P "[\x{1F000}-\x{1FFFF}]|[\x{2600}-\x{27BF}]|▶|◀|⏭|✓|✅|🎉" apps/` to produce a full list of all emoji occurrences across the project
- [x] In `apps/client/src/components/CreateRoomModal.tsx`: replace `▶️`, `📺`, `🎬`, `🔗` inside source-type card `<span>` elements with `<Youtube className="w-8 h-8" />`, `<Tv className="w-8 h-8" />`, `<Film className="w-8 h-8" />`, `<Library className="w-8 h-8" />` from `lucide-react`
- [x] In `apps/client/src/components/CreateRoomModal.tsx`: replace back-button source badge emoji strings (`▶️ YouTube`, `🎬 Movies (Jellyfin)`, `🔗 URL directa`, `📺 Lista IPTV`) with inline `<Icon className="w-3 h-3 inline mr-1" /> Label` JSX using the same icon mapping
- [x] In `apps/client/src/components/CreateRoomModal.tsx`: replace `{ icon: '🔒' }` in the `toast.success()` PIN call with `{ icon: <Lock className="w-4 h-4 text-yellow-400" /> }` and import `Lock` from `lucide-react`
- [x] Scan and fix all emoji in `apps/client/src/pages/LobbyPage.tsx` — replace with matching `lucide-react` icons (`Plus`, `Home`, etc.)
- [x] Scan and fix all emoji in `apps/client/src/components/Sidebar.tsx` — replace with `MessageSquare`, `Users`, `Settings`, `Home` from `lucide-react`
- [x] Scan and fix all emoji in `apps/client/src/pages/AdminPage.tsx` — replace with matching `lucide-react` icons
- [x] Scan and fix all emoji in `apps/client/src/pages/RoomPage.tsx` — replace with `RefreshCw`, `SkipForward`, `Play`, and others from `lucide-react`
- [x] Scan and fix all emoji in `apps/client/src/components/QueuePanel.tsx` — replace with matching `lucide-react` icons
- [x] Scan and fix all emoji in `apps/client/src/components/IPTVBrowserModal.tsx` — replace with `lucide-react` icons
- [x] Scan and fix all emoji in `apps/client/src/components/VideoSearchModal.tsx` — replace with `lucide-react` icons
- [x] Scan and fix all emoji in `apps/client/src/components/JellyfinBrowserModal.tsx` — replace with `lucide-react` icons
- [x] Scan and fix remaining files in `apps/client/src/components/` (`IPTVListManager.tsx`, `ProfileModal.tsx`, `RoomCard.tsx`, `AuthModal.tsx`, all `ui/` files) for any emoji and replace
- [x] Scan `apps/server/src/` for any emoji inside string literals or comments and replace with plain text
- [x] Re-run the emoji grep to confirm zero occurrences remain across the entire `apps/` directory
- [x] Build & syntax check
- [x] Commit

---

### Feature 2: TypeScript Types Update

Extend type unions and add new interfaces in both `apps/client/src/types.ts` and `apps/server/src/types.ts` before any downstream implementation to avoid cascading TS errors.

- [x] In `apps/client/src/types.ts`: extend `Room.sourceType` union from `'youtube' | 'iptv' | 'movie' | 'url'` to `'youtube' | 'iptv' | 'movie' | 'url' | 'series'`
- [x] In `apps/client/src/types.ts`: add `LibrarySerie` interface — `{ id: string; name: string; thumbnail?: string; active: boolean }`
- [x] In `apps/client/src/types.ts`: add `LibraryEpisodio` interface — `{ capitulo_numero: number; titulo: string; url: string }` (where `url` is the raw path, NOT the embed URL)
- [x] In `apps/client/src/types.ts`: add `LibraryTemporada` interface — `{ temporada: number; episodios: LibraryEpisodio[] }`
- [x] In `apps/client/src/types.ts`: add `LibrarySerieDetail` interface extending `LibrarySerie` — `{ temporadas: LibraryTemporada[] }`
- [x] In `apps/client/src/types.ts`: add `LibraryEpisodeEmbed` interface — `{ embedUrl: string }`
- [x] In `apps/client/src/types.ts`: add `SeriesRoomState` interface — `{ selectedSerieId: string | null; selectedTemporada: number | null; selectedEpisodioIndex: number | null; embedUrl: string | null }`
- [x] In `apps/client/src/types.ts`: extend `QueueItem.type` union to include `| 'series'`
- [x] In `apps/server/src/types.ts`: extend `sourceType` in `Room` to include `| 'series'`
- [x] In `apps/server/src/types.ts`: extend `sourceType` in `RoomListItem` to include `| 'series'`
- [x] In `apps/server/src/types.ts`: extend the `sourceType` field in `ServerToClientEvents['sync-state']` payload to include `| 'series'` (fixes existing bug where `'url'` was also missing)
- [x] In `apps/server/src/types.ts`: extend `sourceType` in `ServerToClientEvents['source-switched']` payload to include `| 'series'`
- [x] In `apps/server/src/types.ts`: extend `sourceType` in `ClientToServerEvents['switch-source']` payload to include `| 'series'`
- [x] In `apps/server/src/types.ts`: extend the `player-load` discriminated union in both `ServerToClientEvents` and `ClientToServerEvents` to add `| { type: 'series'; embedUrl: string; title?: string; thumbnail?: string }`
- [x] In `apps/server/src/types.ts`: add `'series-episode-change'` to `ServerToClientEvents` with payload `{ serieId: string; serieName: string; temporada: number; episodioIndex: number; embedUrl: string; titulo: string }`
- [x] In `apps/server/src/types.ts`: add `'series-episode-change'` to `ClientToServerEvents` with payload adding `roomId: string` to the `ServerToClientEvents` payload above
- [x] In `apps/server/src/services/rooms.ts`: update the `createRoom` function `sourceType` parameter type to include `| 'series'`
- [x] In `apps/server/src/services/rooms.ts`: update the `buildRoomFromDb` helper cast to `sourceType: dbRoom.sourceType as 'youtube' | 'iptv' | 'movie' | 'url' | 'series'`
- [x] In `apps/server/src/routes/admin.ts`: update the `sourceType` validation in the `POST /rooms` handler to include `'series'` in the valid values
- [x] Build & syntax check
- [x] Commit

---

### Feature 3: Backend HTML Scraper Service

Create `libraryService.ts` using `cheerio` to scrape LACartoons HTML pages (no REST API exists). Expose results via `/api/library/*` Express routes and update the client's `api.ts`.

- [x] In `apps/server/package.json`: add `"cheerio": "^1.0.0"` to `dependencies` and run `npm install` inside `apps/server/`
- [x] Create `apps/server/src/db/library.json`: static config array listing known series — each entry has `id` (slug, e.g. `"coraje"`), `name` (display name), `lacartoons_serie_id` (numeric, used in lacartoons.com URL paths), `thumbnail` (optional string), `active: true`
- [x] Create `apps/server/src/services/libraryService.ts`: declare module-level constant `LACARTOONS_BASE_URL = 'https://www.lacartoons.com'` and import `cheerio`
- [x] In `libraryService.ts`: declare cache Maps — `seriesCache: Map<string, LibrarySerie[]>` (key `'all'`), `episodesCache: Map<string, LibrarySerieDetail>` (key is serieId slug), `cacheTimestamps: Map<string, number>`; declare `TTL_SERIES = 5 * 60 * 1000` and `TTL_EPISODES = 10 * 60 * 1000`
- [x] In `libraryService.ts`: implement `fetchSeriesList(): Promise<LibrarySerie[]>` — reads `library.json` (via `require` or `fs.readFileSync`), filters `active === true`, caches result under key `'all'` with 5-min TTL, returns cached data if within TTL
- [x] In `libraryService.ts`: implement `fetchSerieDetail(serieId: string): Promise<LibrarySerieDetail>` — looks up `lacartoons_serie_id` from `library.json` for the given slug; fetches `https://www.lacartoons.com/serie/{lacartoons_serie_id}` using `fetch(url, { signal: AbortSignal.timeout(10000) })`; throws on non-2xx; parses HTML with `const $ = cheerio.load(await res.text())`; extracts season containers and episode links from the DOM; constructs `LibrarySerieDetail`; caches with 10-min TTL
- [x] In `libraryService.ts`: document (as inline comments) the exact cheerio selectors chosen for the LACartoons series page — season container selector, episode `<a>` selector, title extraction, capitulo number extraction, and the `href` stored as `LibraryEpisodio.url`
- [x] In `libraryService.ts`: implement `resolveEpisodeEmbed(episodePath: string): Promise<string>` — prepends `LACARTOONS_BASE_URL` if `episodePath` starts with `/`; fetches the episode page (URL format: `https://www.lacartoons.com/serie/capitulo/[id]?t=[temporada]`) with 10s timeout; parses HTML with cheerio; selects `iframe[src*="cubeembed"]` attribute `src`; throws `new Error('LACartoons embed not found: ...')` if iframe is absent; returns `embedUrl`
- [x] In `libraryService.ts`: wrap all `fetch` calls in try/catch; re-throw as `new Error('LACartoons: <descriptive context message>')` so route handlers can surface it as a 502
- [x] Create `apps/server/src/routes/library.ts`: export `createLibraryRouter()` function returning an Express `Router`; import `fetchSeriesList`, `fetchSerieDetail`, `resolveEpisodeEmbed` from `../services/libraryService`; import `requireAuth` from `../middleware/auth`
- [x] In `library.ts`: implement `GET /series` — call `fetchSeriesList()`, return JSON; on error respond `502 { error: 'No se pudo conectar a la biblioteca' }`; protect with `requireAuth`
- [x] In `library.ts`: implement `GET /series/:serieId/episodes` — validate `req.params.serieId` matches `/^[a-z0-9-]{1,100}$/` regex; call `fetchSerieDetail(serieId)`; respond 404 `{ error: 'Serie no encontrada' }` if serie not in `library.json`; respond 502 on scraping error; protect with `requireAuth`
- [x] In `library.ts`: implement `GET /episode` — validate `req.query.path` is a non-empty string with max 500 chars; call `resolveEpisodeEmbed(path)`; return `{ embedUrl }`; respond 502 on error; protect with `requireAuth`
- [x] In `apps/server/src/index.ts`: import `createLibraryRouter` and add `app.use('/api/library', createLibraryRouter())` alongside existing route registrations
- [x] In `apps/client/src/lib/api.ts`: add exported `libraryApi` object with three methods — `listSeries: () => api.get<LibrarySerie[]>('/api/library/series')`, `getSerieDetail: (serieId: string) => api.get<LibrarySerieDetail>(\`/api/library/series/${serieId}/episodes\`)`, `resolveEmbed: (path: string) => api.get<{ embedUrl: string }>('/api/library/episode', { params: { path } })`; import `LibrarySerie`, `LibrarySerieDetail` from `'../types'`
- [x] Build & syntax check
- [x] Commit

---

### Feature 4: Socket Event for Series Navigation

Add the `series-episode-change` handler in `apps/server/src/socket/index.ts`. Any authenticated user in the room can trigger this event — no admin restriction.

- [x] In `apps/server/src/socket/index.ts`: inside the `io.on('connection', ...)` block, add `socket.on('series-episode-change', async (data) => { ... })` after the existing `player-load` handler
- [x] In the handler: destructure `{ roomId, serieId, serieName, temporada, episodioIndex, embedUrl, titulo }` from the event data
- [x] In the handler: guard — if `!socket.data.authenticated`, return early (ignore unauthenticated events)
- [x] In the handler: guard — if `socket.data.roomId !== roomId`, return early (socket must be in the specified room)
- [x] In the handler: do NOT add any `socket.data.isAdmin` check — any authenticated room member can change the episode
- [x] In the handler: call `updatePlayerState(roomId, { streamUrl: embedUrl, videoId: null, currentTime: 0, isPlaying: false, title: titulo, thumbnail: null })` to persist the new state
- [x] In the handler: broadcast `io.to(roomId).emit('series-episode-change', { serieId, serieName, temporada, episodioIndex, embedUrl, titulo })` to all room members including the sender
- [x] In the handler: also emit `io.to(roomId).emit('player-load', { type: 'series', embedUrl, title: titulo })` so the existing player machinery loads the embed for all clients
- [x] Build & syntax check
- [x] Commit

---

### Feature 5: CreateRoomModal Redesign

Replace the emoji-based source-type cards with icon cards, add the `'series'` option, remove `'url'`, and apply violet hover glow styles.

- [x] In `apps/client/src/components/CreateRoomModal.tsx`: change the `sourceType` local state type to `'youtube' | 'iptv' | 'movie' | 'series'`; update the `useState` initial value and `handleSourceSelect` parameter type accordingly
- [x] In `CreateRoomModal.tsx`: replace the entire `<div className="grid grid-cols-2 gap-3">` card section with 4 new cards: YouTube (`<Youtube />`), Lista IPTV (`<Tv />`), Jellyfin (`<Film />`), Series Clásicas (`<Library />`) — remove the `'url'` card entirely
- [x] In `CreateRoomModal.tsx`: apply base card Tailwind: `flex flex-col items-center gap-3 p-5 rounded-xl border transition-all text-white border-white/10 bg-white/5 hover:bg-violet-600/20 hover:border-violet-500 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]`
- [x] In `CreateRoomModal.tsx`: apply selected-state classes when `sourceType === option`: `border-violet-500 bg-violet-600/20 shadow-[0_0_12px_rgba(139,92,246,0.3)]` — merge with base classes conditionally
- [x] In `CreateRoomModal.tsx`: wrap each icon in `<div className="p-3 rounded-full bg-white/10">` before the icon component
- [x] In `CreateRoomModal.tsx`: replace the back-button source badge ternary chain with a `const sourceLabels: Record<string, ReactNode>` map keyed by `sourceType` that maps to `<><Icon className="w-3 h-3 inline mr-1" /> Label</>` and render as `sourceLabels[sourceType]`
- [x] In `CreateRoomModal.tsx`: ensure the IPTV list selector block is guarded strictly by `sourceType === 'iptv'` so it never renders for `'series'` rooms
- [x] In `CreateRoomModal.tsx`: verify the `adminApi.createRoom(name, maxUsers, isOpen, sourceType, iptvListId)` call passes `sourceType` correctly — `iptvListId` will be `undefined` for `'series'` which is correct; no change needed to the call itself
- [x] Build & syntax check
- [x] Commit

---

### Feature 6: Series Hooks

Create `useWatchProgress.ts` and `useSeriesNavigation.ts` to encapsulate watch-progress storage and episode traversal logic.

- [x] Create `apps/client/src/hooks/useWatchProgress.ts` with exported function `useWatchProgress(roomId: string, username: string)` returning `{ isWatched, markWatched, resetProgress, getSeasonProgress }`
- [x] In `useWatchProgress.ts`: define `STORAGE_KEY = \`watchjunto_watched_${roomId}_${username}\``; initialize `useState<Record<string, true>>` by parsing `localStorage.getItem(STORAGE_KEY)` — default to `{}` on missing or invalid JSON
- [x] In `useWatchProgress.ts`: implement `isWatched(serieId: string, temporada: number, capituloNumero: number): boolean` — returns `!!watched[\`${serieId}-${temporada}-${capituloNumero}\`]`
- [x] In `useWatchProgress.ts`: implement `markWatched(serieId: string, temporada: number, capituloNumero: number): void` — builds new map `{ ...watched, [key]: true }`, calls `setWatched`, and synchronously calls `localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap))`; wrap `setItem` in try/catch for storage quota exceptions
- [x] In `useWatchProgress.ts`: implement `resetProgress(serieId: string): void` — filters all keys not starting with `"${serieId}-"` from the map, calls `setWatched`, saves reduced map to `localStorage`
- [x] In `useWatchProgress.ts`: implement `getSeasonProgress(serieId: string, temporada: number, total: number): number` — counts entries in `watched` matching keys `"${serieId}-${temporada}-*"` using a filter over `Object.keys(watched)`
- [x] In `useWatchProgress.ts`: export a standalone utility function (not a hook) `resetProgressAllRooms(serieId: string, username: string, roomIds: string[]): void` that iterates over `roomIds`, constructs each `STORAGE_KEY`, reads, filters, and re-saves reduced maps directly via `localStorage` without React state
- [x] Create `apps/client/src/hooks/useSeriesNavigation.ts` with exported function `useSeriesNavigation({ serieDetail, selectedTemporada, selectedEpisodioIndex })` returning `{ hasNext, getNext, hasPrev, getPrev }`
- [x] In `useSeriesNavigation.ts`: compute `sortedTemporadas` using `useMemo(() => [...(serieDetail?.temporadas ?? [])].sort((a, b) => a.temporada - b.temporada), [serieDetail])`
- [x] In `useSeriesNavigation.ts`: implement `getNext()` — find current temporada by `temporada.temporada === selectedTemporada`; if `selectedEpisodioIndex + 1 < currentTemporada.episodios.length`, return `{ temporada: selectedTemporada, episodioIndex: selectedEpisodioIndex + 1, episodio }`; else find the next temporada in `sortedTemporadas` and return `{ temporada: next.temporada, episodioIndex: 0, episodio: next.episodios[0] }`; return `null` if end of series
- [x] In `useSeriesNavigation.ts`: compute `hasNext: boolean = getNext() !== null` using `useMemo`
- [x] In `useSeriesNavigation.ts`: implement `getPrev()` with symmetric logic (prev in season, or last of previous season) and compute `hasPrev: boolean`
- [x] Build & syntax check
- [x] Commit

---

### Feature 7: SeriesSelector Component

Create `SeriesSelector.tsx` with three native `<select>` dropdowns (serie, season, episode), a season progress badge, and Ver/Siguiente action buttons. Accessible to all authenticated users.

- [x] Create `apps/client/src/components/SeriesSelector.tsx` and define `SeriesSelectorProps` interface with all props: `roomId`, `username`, `isAdmin`, `serieDetail`, `seriesList`, `selectedSerieId`, `selectedTemporada`, `selectedEpisodioIndex`, `loadingEpisodes`, `loadingSeries`, `onSerieChange`, `onTemporadaChange`, `onEpisodioChange`, `onPlay`, `onNext`, `hasNext`, `watchProgress` (typed as `ReturnType<typeof useWatchProgress>`)
- [x] In `SeriesSelector.tsx`: render outer container `<div className="flex flex-col sm:flex-row gap-2 items-center w-full">`
- [x] In `SeriesSelector.tsx`: render Serie `<select>` — iterate `seriesList` producing `<option value={s.id}>{s.name}</option>`; when `loadingSeries` render a single disabled `<option>Cargando...</option>` instead; call `onSerieChange(e.target.value)` on `onChange`
- [x] In `SeriesSelector.tsx`: render Temporada `<select>` — iterate `[...serieDetail.temporadas].sort((a,b) => a.temporada - b.temporada)` producing `<option value={t.temporada}>Temporada {t.temporada}</option>`; disabled when `selectedSerieId === null`; show `<Loader2 className="w-4 h-4 animate-spin inline ml-1" />` next to the label when `loadingEpisodes`; call `onTemporadaChange(Number(e.target.value))` on `onChange`
- [x] In `SeriesSelector.tsx`: render Episodio `<select>` — iterate the current temporada's `episodios`; each `<option>` text: `"${isWatched ? '[✓] ' : ''}Cap. ${ep.capitulo_numero} — ${ep.titulo}"`; disabled when `selectedTemporada === null`; call `onEpisodioChange(Number(e.target.value))` on `onChange`
- [x] In `SeriesSelector.tsx`: apply dark Tailwind styling to all `<select>` elements: `bg-gray-800 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500`
- [x] In `SeriesSelector.tsx`: render season progress badge between Episodio select and Ver button: `<span className="text-xs text-white/50 whitespace-nowrap">Ep. {watchProgress.getSeasonProgress(...)}/{total}</span>` — compute `total` from the selected temporada's `episodios.length`
- [x] In `SeriesSelector.tsx`: render Ver `<button>` that calls `onPlay` — do NOT disable for non-admin users (any user can play); apply violet filled button styles
- [x] In `SeriesSelector.tsx`: render Siguiente `<button>` that calls `onNext` — disabled when `!hasNext`; do NOT add any isAdmin condition; apply violet outline button styles
- [x] In `SeriesSelector.tsx`: when series list fails to load, render `<span className="flex items-center gap-1 text-red-400 text-sm"><AlertCircle className="w-4 h-4" />Error al cargar series</span>` — import `AlertCircle` from `lucide-react`
- [x] Build & syntax check
- [x] Commit

---

### Feature 8: NextEpisodeButton Component

Create the `NextEpisodeButton.tsx` floating button that appears in the bottom-right of the video player canvas for all users when there is a next episode available.

- [x] Create `apps/client/src/components/NextEpisodeButton.tsx` and define `NextEpisodeButtonProps` interface: `{ visible: boolean; onClick: () => void; nextEpisodeTitulo?: string }`
- [x] In `NextEpisodeButton.tsx`: render a `<button>` with positioning classes `absolute bottom-4 right-4 z-20` (parent must have `relative`)
- [x] In `NextEpisodeButton.tsx`: apply pill styling: `flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-violet-600/80 hover:border-violet-500 hover:shadow-[0_0_16px_rgba(139,92,246,0.5)] transition-all duration-200 cursor-pointer`
- [x] In `NextEpisodeButton.tsx`: apply visibility classes dynamically — `${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity duration-300` — never unmount the element to avoid layout shifts
- [x] In `NextEpisodeButton.tsx`: render `<SkipForward className="w-4 h-4" />` icon followed by text `"Siguiente episodio"`; import `SkipForward` from `lucide-react`
- [x] Build & syntax check
- [x] Commit

---

### Feature 9: RoomPage Integration

Wire all new series state, hooks, components, socket events, and player branches into `apps/client/src/pages/RoomPage.tsx`.

- [x] In `apps/client/src/pages/RoomPage.tsx`: add `useState` declarations for: `seriesList: LibrarySerie[]` (default `[]`), `serieDetail: LibrarySerieDetail | null` (default `null`), `selectedSerieId: string | null`, `selectedTemporada: number | null`, `selectedEpisodioIndex: number | null`, `loadingSeries: boolean`, `loadingEpisodes: boolean`, `seriesError: string | null`, `loadingEmbed: boolean`
- [x] In `RoomPage.tsx`: initialize `const watchProgress = useWatchProgress(roomId!, user!.username)` near the top of the component and import `useWatchProgress` from `'../hooks/useWatchProgress'`
- [x] In `RoomPage.tsx`: initialize `const { hasNext, getNext } = useSeriesNavigation({ serieDetail, selectedTemporada, selectedEpisodioIndex })` and import `useSeriesNavigation` from `'../hooks/useSeriesNavigation'`
- [x] In `RoomPage.tsx`: add `useEffect` triggered when `activeSource === 'series'` — sets `loadingSeries(true)`, calls `libraryApi.listSeries()`, on success sets `seriesList` and auto-calls `handleSerieChange(data[0].id)` if `selectedSerieId` is null, on error sets `seriesError`, finally sets `loadingSeries(false)`
- [x] In `RoomPage.tsx`: implement `handleSerieChange(serieId: string)` — sets `selectedSerieId`, resets `selectedTemporada` and `selectedEpisodioIndex` to null, clears `serieDetail`, sets `loadingEpisodes(true)`, calls `libraryApi.getSerieDetail(serieId)`, on success sets `serieDetail` and auto-selects `data.temporadas[0]?.temporada`, on error sets `seriesError`, finally sets `loadingEpisodes(false)`
- [x] In `RoomPage.tsx`: implement `handleTemporadaChange(temporada: number)` — sets `selectedTemporada`, resets `selectedEpisodioIndex` to null
- [x] In `RoomPage.tsx`: implement `handleEpisodioChange(index: number)` — sets `selectedEpisodioIndex`
- [x] In `RoomPage.tsx`: implement `handlePlay()` — guard: return if `selectedSerieId == null || selectedTemporada == null || selectedEpisodioIndex == null`; no isAdmin check; find `LibraryEpisodio` from `serieDetail.temporadas`; set `loadingEmbed(true)` and disable Ver/Siguiente buttons; call `libraryApi.resolveEmbed(episodio.url)`; on success emit `socket.emit('series-episode-change', { roomId, serieId, serieName, temporada, episodioIndex, embedUrl, titulo })`; on error call `toast.error('Error al cargar el episodio')`; finally set `loadingEmbed(false)`
- [x] In `RoomPage.tsx`: implement `handleNext()` — guard: `if (!hasNext) return`; no isAdmin check; call `getNext()`, if null call `toast('¡Terminaste la serie!')` and return; call `markWatched` for the current episode; set `selectedTemporada(next.temporada)` and `selectedEpisodioIndex(next.episodioIndex)`; call `libraryApi.resolveEmbed(next.episodio.url)`, emit `series-episode-change` with new data
- [x] In `RoomPage.tsx`: update `handleEnded` `useCallback` — add branch at the start: if `activeSource === 'series' && selectedSerieId && selectedTemporada != null && selectedEpisodioIndex != null`, extract current `LibraryEpisodio` from `serieDetail`, call `markWatched`, then call `handleNext()`; else fall through to existing `queue-next` logic; update the dependency array to include all new series state vars and `handleNext`
- [x] In `RoomPage.tsx`: in the socket subscriptions `useEffect`, add `socket.on('series-episode-change', onSeriesEpisodeChange)` where `onSeriesEpisodeChange(data)` updates `selectedSerieId`, `selectedTemporada`, `selectedEpisodioIndex`, and loads the embed (using `isDirectVideoUrl(data.embedUrl)` to decide between `loadStream` / iframe path); add `socket.off('series-episode-change', onSeriesEpisodeChange)` in the cleanup return
- [x] In `RoomPage.tsx`: in the `onPlayerLoad` handler, add `else if (data.type === 'series')` branch — set `currentStreamUrl(data.embedUrl)`, check `isDirectVideoUrl` to set `urlActivePlayer` to `'stream'` or `'iframe'`, call `loadStream` if stream, optionally set `nowTitle(data.title)`
- [x] In `RoomPage.tsx`: in the `onSyncState` handler, add `else if (state.sourceType === 'series')` branch — if `state.streamUrl`, treat as `embedUrl`, use `isDirectVideoUrl` to choose player path
- [x] In `RoomPage.tsx`: in the bottom-toolbar JSX, replace the URL/stream controls section with a conditional: `{activeSource === 'series' ? <SeriesSelector ... /> : /* existing controls */}`
- [x] In `RoomPage.tsx`: verify the player container `<div>` has `className="relative ..."` and add `<NextEpisodeButton visible={activeSource === 'series' && hasNext} onClick={handleNext} />` as the last child of the player container (no isAdmin condition)
- [x] In `RoomPage.tsx`: import all new types (`LibrarySerie`, `LibrarySerieDetail`, `LibraryEpisodio`), new hooks, new components, and `libraryApi` at the top of the file
- [x] Build & syntax check
- [x] Commit

---

### Feature 10: AdminPage Progress Reset

Add a "Series Clásicas" section to `apps/client/src/pages/AdminPage.tsx` with per-series progress reset controls.

- [x] In `apps/client/src/pages/AdminPage.tsx`: add `useState<LibrarySerie[]>([])` for `seriesList` and `useState(false)` for `loadingSeriesLibrary`
- [x] In `AdminPage.tsx`: add `useEffect` on mount that calls `libraryApi.listSeries()`, sets `seriesList`, sets `loadingSeriesLibrary` during load, handles error with `toast.error('Error al cargar la biblioteca')`
- [x] In `AdminPage.tsx`: import `resetProgressAllRooms` from `'../hooks/useWatchProgress'` (the standalone utility function, not the hook)
- [x] In `AdminPage.tsx`: get `rooms` from the Zustand store with `useStore(state => state.rooms)` for use in `resetProgressAllRooms`
- [x] In `AdminPage.tsx`: add a "Series Clásicas" section with a heading using `<Library className="w-5 h-5 inline mr-2" />` icon from `lucide-react`
- [x] In `AdminPage.tsx`: render a list row per `serie` in `seriesList` showing `serie.name` and a "Resetear mi progreso" `<button>` that calls `resetProgressAllRooms(serie.id, user!.username, rooms.map(r => r.id))` on click; show a brief `toast.success` confirmation after reset
- [x] In `AdminPage.tsx`: show a loading spinner or skeleton while `loadingSeriesLibrary` is true
- [x] Build & syntax check
- [x] Commit

---

### Feature 11: Documentation

Create architecture documentation in `docs/` and add TSDoc comments to all new code files.

- [x] Create `docs/series-architecture.md` documenting: overview of the Series Clásicas room type, full data flow (frontend dropdown selection → `handlePlay` → `libraryApi.resolveEmbed` → socket `series-episode-change` emission → server broadcast → all clients update), state management decisions (local `useState` + localStorage for progress, not Zustand), player type detection using `isDirectVideoUrl()`, socket event payloads (`series-episode-change`, `player-load` with `type: 'series'`), and the `library.json` config schema
- [x] Create `docs/lacartoons-scraper.md` documenting: scraping strategy overview, target URLs (`https://www.lacartoons.com/serie/[lacartoons_serie_id]` for episode lists, `https://www.lacartoons.com/serie/capitulo/[id]?t=[temporada]` for embed URL extraction), the cheerio selectors used and why, cache TTL values (5 min series list, 10 min episode detail), `library.json` config schema with a complete example entry, and instructions for adding a new serie (add entry to `library.json`, find the `lacartoons_serie_id` from the LACartoons URL, set `active: true`)
- [x] Add TSDoc comments to `fetchSeriesList`, `fetchSerieDetail`, `resolveEpisodeEmbed` in `apps/server/src/services/libraryService.ts` — include `@param`, `@returns`, and `@throws` tags
- [x] Add TSDoc comments to `useWatchProgress`, `isWatched`, `markWatched`, `resetProgress`, `getSeasonProgress`, and `resetProgressAllRooms` in `apps/client/src/hooks/useWatchProgress.ts`
- [x] Add TSDoc comments to `useSeriesNavigation`, `getNext`, `getPrev`, `hasNext`, `hasPrev` in `apps/client/src/hooks/useSeriesNavigation.ts`
- [x] Add TSDoc comment to the `SeriesSelectorProps` interface and the `SeriesSelector` component export in `apps/client/src/components/SeriesSelector.tsx`
- [x] Add TSDoc comments to `createLibraryRouter` and each route handler in `apps/server/src/routes/library.ts`
- [x] Build & syntax check
- [x] Commit
