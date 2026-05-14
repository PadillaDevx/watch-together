# Plan

## Problem
WatchJunto lacked a "Classic Series" room type for watching curated cartoon series from LACartoons.
All emoji icons in the UI needed replacement with lucide-react SVG icons. The CreateRoomModal needed
redesigning with proper icon-based cards. Backend needed a scraping service to fetch series episode
data from LACartoons. Frontend needed episode navigation, watch progress tracking, and real-time
multi-user sync for series rooms.

## Solution
Implemented across 11 phases:
- Replaced all emojis with lucide-react icons throughout the client codebase
- Extended TypeScript type unions to include `'series'` as a valid `sourceType`
- Added new socket events (`series-episode-change`, `player-sync`, `player-heartbeat`, typing events)
- Created `libraryService.ts` — an HTML scraper for LACartoons using cheerio with in-memory caching
- Added `/api/library/*` routes for series listing, episode data, and embed URL resolution
- Redesigned `CreateRoomModal` with 4 icon-based cards (YouTube, IPTV, Jellyfin, Series Clásicas)
- Created `useWatchProgress` hook — localStorage-backed episode tracking per room+user
- Created `useSeriesNavigation` hook — cross-season next/prev episode computation
- Created `SeriesSelector` component — dropdown selectors for serie/season/episode with loading states
- Created `NextEpisodeButton` — floating button inside the player area
- Integrated everything in `RoomPage.tsx` with full series playback, socket sync, and progress tracking
- Added "Resetear mi progreso" per-serie in `AdminPage`
- Added CSS-based fake fullscreen for iOS Chrome compatibility
- Added design improvements (CSS variables, scrollbar styling, LobbyPage redesign)
- Added typing indicators, sentAt latency compensation on player events

---

### Feature 1: TypeScript Types — sourceType + socket events
Extended all type unions to include `'series'`. Added `LibrarySerie`, `LibrarySerieDetail`,
`LibraryEpisodio`, `LibraryTemporada` interfaces. Extended `player-load` discriminated union.
Added `series-episode-change`, `player-sync`, `player-heartbeat`, `typing-update`,
`typing-start`, `typing-stop`, `player-action` socket events.

  - [x] Add `'series'` to `sourceType` union in `apps/server/src/types.ts` (Room, RoomListItem, sync-state, source-switched, switch-source)
  - [x] Add `'series'` to `sourceType` union in `apps/client/src/types.ts`
  - [x] Add `LibrarySerie`, `LibrarySerieDetail`, `LibraryEpisodio`, `LibraryTemporada` interfaces to `apps/server/src/types.ts`
  - [x] Extend `player-load` discriminated union with `{ type: 'series'; embedUrl: string; title?: string; thumbnail?: string }` in both client and server types
  - [x] Add `series-episode-change` to `ServerToClientEvents` and `ClientToServerEvents`
  - [x] Add `player-sync`, `player-heartbeat`, `typing-update`, `typing-start`, `typing-stop`, `player-action` events
  - [x] Add `createdByUsername` field to `Room` and `RoomListItem`
  - [x] Add `sentAt` optional field to `player-play` and `player-pause` events

---

### Feature 2: Emoji Removal
Replaced all emoji characters in `.tsx`, `.ts`, `.html`, `.css` files with lucide-react icons
or plain text alternatives. Applied canonical icon mapping from the plan.

  - [x] Grep all client source files for emoji code points and identify locations
  - [x] Replace `📺` → `<Tv />`, `▶️` → `<Youtube />` / `<Play />`, `🎬` → `<Film />`, `🔗` → `<Library />`, `📚` → `<BookOpen />`, `➕` → `<Plus />`, `🔄` → `<RefreshCw />`, `💬` → `<MessageSquare />`, `👥` → `<Users />`, `⚙️` → `<Settings />`, `🔒` → `<Lock />`, `⏭` → `<SkipForward />`
  - [x] Remove `🎉` and replace with plain Spanish text "¡Terminaste la serie!"
  - [x] Replace `toast.success` emoji `icon` prop with JSX lucide-react icon node
  - [x] Verify zero emoji remain with `grep -rP "[\x{1F300}-\x{1FFFF}]|[\x{2600}-\x{27BF}]" apps/`

---

### Feature 3: Backend — LACartoons Library Service
Created `apps/server/src/services/libraryService.ts` — scrapes LACartoons HTML pages
using `cheerio`. Implements in-memory TTL cache to avoid hammering the external site.
Series config lives in `apps/server/src/db/library.json`.

  - [x] Add `cheerio` dependency to `apps/server/package.json`
  - [x] Create `apps/server/src/db/library.json` with known series (id, name, lacartoons_serie_id, thumbnail, active)
  - [x] Implement `listSeries()` — reads library.json and returns only active series
  - [x] Implement `fetchSerieDetail(serieId)` — fetches and scrapes LACartoons HTML to extract seasons and episode links, with cheerio selectors documented in `docs/lacartoons-scraper.md`
  - [x] Implement `resolveEpisodeEmbed(episodePath)` — fetches episode page and extracts iframe src embed URL
  - [x] Add in-memory TTL cache (5 min for series list, 30 min for episode details)
  - [x] Add `/api/library/series` GET route in `apps/server/src/routes/library.ts`
  - [x] Add `/api/library/series/:serieId/episodes` GET route
  - [x] Add `/api/library/episode` GET route with `?path=` query param
  - [x] Register library router in `apps/server/src/index.ts`

---

### Feature 4: Socket Handler — series-episode-change
Added server-side handler for `series-episode-change` client event. Server
broadcasts to all room members and updates the room's player state with the embedUrl.

  - [x] Add `series-episode-change` handler in `apps/server/src/socket/index.ts`
  - [x] Broadcast `series-episode-change` to all sockets in the room via `io.to(roomId).emit`
  - [x] Add `player-sync`, `player-heartbeat`, `typing-start`, `typing-stop` handlers
  - [x] Update room player state (`streamUrl`, `title`) when a series episode loads

---

### Feature 5: CreateRoomModal Redesign
Replaced the emoji-based 4-card source selector with icon-based cards using lucide-react.
Changed "URL directa" to "Series Clásicas" with `<Library />` icon.

  - [x] Import lucide-react icons (`Youtube`, `Tv`, `Film`, `Library`) in `CreateRoomModal.tsx`
  - [x] Replace emoji `<span>` elements in 4 source type cards with lucide-react `<Icon className="w-8 h-8" />`
  - [x] Change card 4 label from "URL directa" / "🔗" to "Series Clásicas" + `<Library />`
  - [x] Update card description to "Cartoons clásicos de tu biblioteca"
  - [x] Apply hover glow style (purple border + background on selected/hover)
  - [x] Add `'series'` to `sourceType` state union in `CreateRoomModal.tsx`
  - [x] Update step-2 back-button badge to show series icon + label without emojis

---

### Feature 6: Hooks — useWatchProgress + useSeriesNavigation
Created two custom hooks for the series room type.

  - [x] Create `apps/client/src/hooks/useWatchProgress.ts` — localStorage-backed watch tracking
    - `isWatched(serieId, temporada, capituloNumero)` predicate
    - `markWatched(serieId, temporada, capituloNumero)` persists to localStorage
    - `resetProgress(serieId)` clears entries for one serie
    - `getSeasonProgress(serieId, temporada, totalEpisodes)` returns `{ watched, total }`
    - `resetProgressAllRooms(serieId, username, roomIds[])` utility exported separately for AdminPage
  - [x] Create `apps/client/src/hooks/useSeriesNavigation.ts` — cross-season navigation
    - `hasNext` / `hasPrev` boolean flags
    - `getNext()` / `getPrev()` returning `{ temporada, episodioIndex, episodio }` or null
    - Handles season boundary transitions (last ep of season → first ep of next season)

---

### Feature 7: Components — SeriesSelector + NextEpisodeButton
Created two new client components for the series room experience.

  - [x] Create `apps/client/src/components/SeriesSelector.tsx`
    - Three `<select>` dropdowns: Serie, Temporada, Capítulo
    - Shows loading spinner / skeleton while fetching
    - Shows error message if library fetch fails
    - Episode dropdown shows `✓` check (via `<Check />` icon) for watched episodes
    - Season progress badge "Ep. X/Y ✓" in bottom bar
    - `[▶ Ver]` and `[⏭ Siguiente]` buttons
    - Keyboard accessible (Enter selects, arrows navigate)
    - Mobile: dropdowns stack vertically with `flex-col sm:flex-row`
  - [x] Create `apps/client/src/components/NextEpisodeButton.tsx`
    - Floating pill in bottom-right of player area
    - Visible only when `visible` prop is true (CSS opacity transition, never unmounted)
    - Uses `<SkipForward />` icon from lucide-react
    - Hover: purple glow

---

### Feature 8: RoomPage Integration
Wired `SeriesSelector`, `NextEpisodeButton`, `useWatchProgress`, and `useSeriesNavigation`
into `apps/client/src/pages/RoomPage.tsx`.

  - [x] Add series state (`seriesList`, `serieDetail`, `selectedSerieId`, `selectedTemporada`, `selectedEpisodioIndex`, loading/error flags)
  - [x] Initialize `useWatchProgress` and `useSeriesNavigation` hooks
  - [x] `useEffect` to fetch series list when `activeSource === 'series'` (auto-selects first serie)
  - [x] `handleSerieChange()` — fetches episode detail via `libraryApi.getSerieDetail()`
  - [x] `handlePlay()` — resolves embed URL via `libraryApi.resolveEmbed()`, emits `series-episode-change` socket
  - [x] `handleNext()` — advances to next episode, marks current as watched, emits socket
  - [x] `handleEnded` updated to call `handleNext()` for series rooms instead of `queue-next`
  - [x] Socket listener for `series-episode-change` — updates state and loads embed in player
  - [x] `onPlayerLoad` handler updated with `type: 'series'` branch
  - [x] `onSyncState` handler updated with `sourceType === 'series'` branch
  - [x] Conditional render: shows `<SeriesSelector />` in bottom toolbar for series rooms
  - [x] `<NextEpisodeButton />` added to player area container
  - [x] Fake CSS fullscreen implemented (`isCSSFullscreen` state with `position: fixed; inset: 0; z-index: 9999`)
  - [x] `toggleFullscreen()` tries native API first, falls back to CSS fullscreen for iOS
  - [x] Episode watched marking on `handleEnded`

---

### Feature 9: AdminPage — Series Progress Reset
Added "Series Clásicas" section to AdminPage with per-serie progress reset.

  - [x] Fetch `libraryApi.listSeries()` on AdminPage mount
  - [x] Render series list with "Resetear mi progreso" button per serie
  - [x] Button calls `resetProgressAllRooms(serie.id, user.username, rooms.map(r => r.id))`
  - [x] Toast confirmation on reset

---

### Feature 10: Documentation
Created docs and code comments for the new features.

  - [x] Create `docs/lacartoons-scraper.md` — documents cheerio selectors and scraping strategy
  - [x] Create `docs/series-architecture.md` — documents the series room architecture, socket events, data flow
  - [x] JSDoc comments on all exported hook functions and service methods

---

### Feature 11: Tests — Hooks and Utility Functions
Set up Vitest testing framework and write unit tests for the pure logic hooks and utilities.
Coverage target: >= 80% for tested files.

  - [x] Add `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@types/node` to `apps/client/package.json` devDependencies
  - [x] Configure Vitest in `apps/client/vite.config.ts` (test environment: jsdom, coverage provider: v8)
  - [x] Create `apps/client/src/hooks/__tests__/useSeriesNavigation.test.ts`
    - Test `getNext()` returns next episode in same season
    - Test `getNext()` crosses to next season when at end of current season
    - Test `getNext()` returns null at the very last episode of the series
    - Test `getPrev()` returns previous episode in same season
    - Test `getPrev()` crosses to previous season when at start of current season
    - Test `getPrev()` returns null at episode 0 of season 1
    - Test `hasNext` / `hasPrev` flags match `getNext()` / `getPrev()` nullness
    - Test returns null when `serieDetail` is null
  - [x] Create `apps/client/src/hooks/__tests__/useWatchProgress.test.ts`
    - Mock `localStorage` (vitest fake timers + manual mock)
    - Test `isWatched()` returns false for unwatched episode
    - Test `markWatched()` sets the episode key in state and localStorage
    - Test `isWatched()` returns true after `markWatched()`
    - Test `resetProgress()` clears all episodes for a serie, leaves others intact
    - Test `getSeasonProgress()` returns correct `{ watched, total }` counts
    - Test `resetProgressAllRooms()` utility clears keys across multiple storage keys
  - [x] Run `vitest run --coverage` from `apps/client/` and confirm >= 80% coverage on tested files
  - [x] Fix any failing tests
  - [x] **Build check**: run `tsc --noEmit` from `apps/client/` — zero TypeScript errors
  - [x] **Commit**: `feat: add vitest test suite for series hooks`

---

### Feature 12: Commit All Pending Changes
There are 42 files with uncommitted changes representing improvements to all series
features, design system (CSS variables, scrollbar), LobbyPage redesign, typing indicators,
latency compensation (`sentAt`), and fake fullscreen. Consolidate into a clean commit.

  - [x] Run `tsc --noEmit` in both `apps/client/` and `apps/server/` — confirm zero errors
  - [x] Run `npm run build` from project root — confirm build succeeds
  - [x] Review `git diff --stat HEAD` to confirm all expected files are staged
  - [x] Commit all changes: `feat: improvements — fake fullscreen, design system, typing indicators, latency compensation`
