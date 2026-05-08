<CUSTOM_PLAN>

# Watch Together — IPTV + YouTube Unified Streaming

## Problem

The current implementation only supports synchronized YouTube playback via the YouTube IFrame API. Two problems arise:

1. **YouTube embedding restrictions** — Some videos (official F1 replays, licensed sports) have `embeddable: false`, causing error codes `101`/`150` in the IFrame API. The app has no fallback.
2. **Premium services are completely unsupported** — Netflix, F1 TV Pro, Disney+, etc. block iframes via `X-Frame-Options: DENY` and CSP `frame-ancestors`. Their streams are also Widevine DRM-encrypted, making any iframe bypass technically and legally impossible from a web app.

### Why IPTV m3u8 Lists Solve This

Community-maintained IPTV lists (`.m3u` / `.m3u8` playlists) aggregate thousands of live channels and VOD entries (movies, series) re-encoded without DRM. These include:
- F1 broadcast channels (Sky Sports F1, Channel 4, DAZN feeds) as live HLS streams.
- Movie/series VOD libraries in standard HLS or MP4 format.
- No authentication required — the stream URL is enough.

The browser cannot fetch these streams directly due to CORS restrictions on most IPTV sources. The solution is a **server-side CORS proxy** built into the existing Express server, which fetches the m3u8 manifest and TS segments on behalf of the client. `hls.js` on the client then handles playback entirely in-browser — no Electron, no extension needed.

---

## Chosen Solution: HLS Player + IPTV List Manager (Webapp Only)

### Technical Architecture

```
Admin uploads/adds m3u8 list URL
        ↓
Server fetches & parses the .m3u8 playlist (m3u-parser)
Entries stored in memory (or JSON file) keyed by list ID
        ↓
Client creates room → picks "IPTV" mode → browses categories/entries
        ↓
Client requests stream → server CORS proxy fetches manifest + segments
        ↓
hls.js renders stream in <video> tag inside RoomPage
        ↓
Existing socket events (player-play / player-pause / player-seek) sync playback
```

### Libraries

| Role | Library |
|------|---------|
| HLS playback | `hls.js` |
| MPEG-DASH playback | `dash.js` (optional, for `.mpd` sources) |
| M3U playlist parsing | `iptv-playlist-parser` or custom regex parser |
| CORS proxy | Express route `/api/proxy?url=` (server-side `node-fetch`) |

### CORS Proxy Security Constraints

The proxy endpoint `/api/proxy` must:
- Only be accessible to authenticated users (reuse existing `auth` middleware).
- Only relay URLs that match domains registered in the admin-managed IPTV list — no arbitrary URL proxying.
- Strip sensitive request headers before forwarding.
- Set a short response cache (`Cache-Control: max-age=5`) to avoid hammering upstream sources.

---

## Feature 1 — Admin IPTV List Manager

A new tab **"Listas IPTV"** is added to the existing `AdminPage.tsx` alongside the current tabs (Salas, Usuarios, Conexiones, Tokens).

### Data Model

Each list entry stored server-side:

```
IPTVList {
  id: string          // uuid
  name: string        // display name, e.g. "F1 & Sports HD"
  url: string         // URL to the .m3u / .m3u8 file
  lastFetched: Date   // when the server last fetched+parsed it
  entryCount: number  // total number of channels/VOD entries parsed
  enabled: boolean    // toggleable without deleting
}
```

Parsed entries from the m3u file are cached in memory (or a JSON sidecar file) and re-fetched on demand or by admin action.

### Admin UI Flows

**Add a new list:**
1. Admin clicks "Nueva lista" button.
2. Modal opens with fields: `name` (text) + `url` (text, must end in `.m3u` or `.m3u8` or return m3u content-type).
3. On save, server fetches the URL, parses it, stores the list and entry count.
4. Toast shows: `"Lista 'F1 & Sports HD' cargada — 312 entradas"`.

**Edit a list:**
- Inline edit of `name` and `url`.
- "Actualizar" button triggers a re-fetch and re-parse.

**Delete a list:**
- Confirmation dialog before delete.
- All rooms currently using entries from this list are not affected (they hold the stream URL directly).

**Toggle enabled/disabled:**
- Disabled lists do not appear in the room creation picker.

**View entries (optional preview):**
- Expandable row showing first 20 entries grouped by `group-title` M3U attribute.

### New API Endpoints (server)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/iptv` | List all IPTV lists |
| `POST` | `/api/admin/iptv` | Add new list (body: `{ name, url }`) |
| `PUT` | `/api/admin/iptv/:id` | Update list name/url + re-fetch |
| `DELETE` | `/api/admin/iptv/:id` | Delete list |
| `POST` | `/api/admin/iptv/:id/refresh` | Force re-fetch and re-parse |
| `GET` | `/api/iptv/:id/entries` | Get parsed entries for a list (auth required) |

---

## Feature 2 — Room Creation: Source Type Selection

The existing `CreateRoomModal.tsx` is extended with a **source type selector** shown before other fields.

### Updated Room Creation Flow

**Step 1 — Choose source type:**

```
┌─────────────────────────────────────────────┐
│  ¿Qué quieres ver?                          │
│                                             │
│  [ 🎬 YouTube ]    [ 📺 Lista IPTV ]        │
└─────────────────────────────────────────────┘
```

**Step 2a — YouTube selected (current behavior, unchanged):**
- Room is created normally, VideoSearchModal works as before.

**Step 2b — IPTV selected:**
- Dropdown to pick which IPTV list to use (only `enabled: true` lists shown).
- Room is created with `sourceType: 'iptv'` and `iptvListId` stored on the room object.

### Room Data Model Extension

```
Room {
  ...existing fields...
  sourceType: 'youtube' | 'iptv'
  iptvListId?: string   // only when sourceType === 'iptv'
}
```

The `sourceType` is stored server-side in the room object (in `services/rooms.ts`) and sent to clients via the existing room state sync.

---

## Feature 3 — In-Room IPTV Content Browser & Player

### Content Browser (replaces VideoSearchModal for IPTV rooms)

When the room's `sourceType === 'iptv'`, clicking "Cambiar video" opens an **IPTVBrowserModal** instead of `VideoSearchModal`.

**Browser layout:**

```
┌────────────────────────────────────────────────────────┐
│  🔍 Buscar...                                          │
│                                                        │
│  Categorías          Contenido                         │
│  ──────────          ──────────────────────────────    │
│  📡 F1 & Motor  →   🏎  F1 Live Stream - Sky Sports   │
│  🎬 Películas        🏎  F1 Channel 4 HD               │
│  📺 Series           🏎  DAZN F1 ES                    │
│  🌍 Noticias         🏎  Movistar F1                   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- Left panel: unique `group-title` values extracted from the M3U entries (categories like "Películas", "Series", "Deportes", "F1", etc.).
- Right panel: entries filtered by selected category, with `tvg-name` and optional `tvg-logo` thumbnail.
- Search bar filters across all entries by name.
- Clicking an entry emits a `change-video` socket event with `{ type: 'iptv', streamUrl: entry.url }` and closes the modal.

### IPTV Player in RoomPage

`RoomPage.tsx` currently renders a `useYouTube` hook that mounts the YouTube IFrame. When `sourceType === 'iptv'`, a new `useHlsPlayer` hook is used instead.

**`useHlsPlayer` behavior:**
- Receives a `streamUrl`.
- Constructs the proxied URL: `/api/proxy?url=<encoded streamUrl>`.
- Creates an `Hls` instance pointing to the proxied URL and attaches it to a `<video ref>`.
- Exposes `play(time)`, `pause(time)`, `seek(time)`, `getCurrentTime()` — same interface as `useYouTube` so socket event handlers require minimal changes.
- On `Hls.Events.ERROR` (fatal), shows an inline error state with a "Reintentar" button.

**Player UI differences for IPTV:**
- Live streams (`#EXT-X-ENDLIST` absent in manifest) show a "EN VIVO" badge and disable the seek bar.
- VOD streams show the seek bar and duration normally.
- A "Cambiar canal" button replaces "Cambiar video" in the room toolbar.

### Socket Events Extension

No new socket event names are needed. The existing events are reused:

| Event | Extended payload |
|-------|-----------------|
| `change-video` | `{ type: 'youtube', videoId } \| { type: 'iptv', streamUrl }` |
| `sync-state` | Adds `sourceType` and `streamUrl` fields alongside existing `videoId` |

---

## Feature 4 — YouTube Embed Fallback

Some YouTube videos have `embeddable: false`, returning IFrame API error codes `101`/`150`.

- Switch embed domain to `youtube-nocookie.com` (reduces false positives).
- On error `101`/`150`, show an inline warning inside the player area: _"Este video no permite reproducción embebida. Abre YouTube directamente."_ with a link.
- In `VideoSearchModal`, filter or visually flag results where `snippet.thumbnails` exists but `status.embeddable === false` (requires YouTube Data API v3 `part=status` in the search query at `apps/server/src/routes/search.ts`).

---

## Summary: What Changes Per Layer

| Layer | File(s) | Change |
|-------|---------|--------|
| Server — data | `services/rooms.ts` | Add `sourceType`, `iptvListId` to Room type |
| Server — new service | `services/iptv.ts` (new) | Parse + cache m3u lists, refresh logic |
| Server — routes | `routes/admin.ts` | New IPTV CRUD endpoints |
| Server — routes | `routes/iptv.ts` (new) | `GET /api/iptv/:id/entries`, `GET /api/proxy` |
| Server — types | `types.ts` | Extend `Room`, add `IPTVList`, `IPTVEntry` types |
| Client — admin | `pages/AdminPage.tsx` | New "Listas IPTV" tab |
| Client — admin | `components/IPTVListManager.tsx` (new) | Full CRUD UI for lists |
| Client — room creation | `components/CreateRoomModal.tsx` | Source type selector + IPTV list picker |
| Client — room | `hooks/useHlsPlayer.ts` (new) | hls.js hook, same interface as useYouTube |
| Client — room | `components/IPTVBrowserModal.tsx` (new) | Category + entry browser |
| Client — room | `pages/RoomPage.tsx` | Conditional player swap + updated socket handlers |
| Client — types | `types.ts` | Extend `Room`, add `IPTVEntry` |
