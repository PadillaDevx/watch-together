# Series Clásicas — Architecture

## Overview

"Series Clásicas" is a room source type (`sourceType: 'series'`) that streams classic cartoons from LACartoons. The server scrapes HTML from `lacartoons.com` using `cheerio` and resolves iframe embed URLs on demand. Any authenticated room member can change the current episode (no admin restriction).

---

## Data Flow

```
User selects serie/season/episode (SeriesSelector dropdowns)
  └─> onPlay()
        └─> libraryApi.resolveEmbed(episode.url)    [GET /api/library/episode?path=...]
              └─> server: resolveEpisodeEmbed()       [scrapes LACartoons episode page]
                    └─> returns { embedUrl }
  └─> socket.emit('series-episode-change', payload)  [client → server]
        └─> server: updatePlayerState(roomId, ...)   [persists state in memory]
        └─> io.to(roomId).emit('series-episode-change', payload)  [broadcast to all]
        └─> io.to(roomId).emit('player-load', { type: 'series', embedUrl, title })
              └─> all clients: load iframe embed in player
```

---

## State Management

Series state lives **locally in `RoomPage.tsx`** using `useState`. It is NOT stored in Zustand.

| State variable          | Type                      | Description                            |
|-------------------------|---------------------------|----------------------------------------|
| `seriesList`            | `LibrarySerie[]`          | Active series from `/api/library/series` |
| `serieDetail`           | `LibrarySerieDetail\|null` | Episodes for the selected serie        |
| `selectedSerieId`       | `string\|null`            | Currently selected serie slug          |
| `selectedTemporada`     | `number\|null`            | Currently selected season number       |
| `selectedEpisodioIndex` | `number\|null`            | Currently selected episode index       |
| `embedUrl`              | `string\|null`            | Active iframe embed URL                |

Watch progress is stored in **`localStorage`** per user per room (key: `watchjunto_watched_{roomId}_{username}`). The hook `useWatchProgress` manages reads/writes without Zustand.

---

## Socket Events

### `series-episode-change`

**Client → Server** (`ClientToServerEvents`):
```ts
{
  roomId: string;
  serieId: string;
  serieName: string;
  temporada: number;
  episodioIndex: number;
  embedUrl: string;
  titulo: string;
}
```

**Server → Client** (`ServerToClientEvents`) — same payload minus `roomId`:
```ts
{
  serieId: string;
  serieName: string;
  temporada: number;
  episodioIndex: number;
  embedUrl: string;
  titulo: string;
}
```

### `player-load` (type: 'series')
```ts
{
  type: 'series';
  embedUrl: string;
  title?: string;
  thumbnail?: string;
}
```

---

## `library.json` Schema

Located at `apps/server/src/db/library.json`. Static config — add entries here to activate new series.

```ts
interface LibraryJsonEntry {
  id: string;                  // slug, used in API routes (e.g. "coraje")
  name: string;                // Display name
  lacartoons_serie_id: number; // Numeric ID used in lacartoons.com URL paths
  thumbnail: string | null;    // Optional thumbnail URL
  active: boolean;             // Only active: true entries are served
}
```

---

## Player Type Detection

In `RoomPage.tsx`, `isDirectVideoUrl(url)` determines whether to load an `<iframe>` or an HLS/video player:

```ts
function isDirectVideoUrl(url: string): boolean {
  return /\.(m3u8|mp4|webm|ogg)(\?|$)/i.test(url);
}
```

Series embed URLs (from cubeembed.com) are NOT direct video URLs, so they render as `<iframe src={embedUrl}>`. All other source types either produce a direct video URL or use the YouTube player.
