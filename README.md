# Watch Together

Watch videos in perfect sync with your friends — YouTube and live IPTV streams, all in one place.

## Features

- **Synchronized YouTube playback** — play, pause, seek, and resync all viewers together in real time.
- **youtube-nocookie.com embed** — videos are loaded via `youtube-nocookie.com` for enhanced privacy. If a video has embedding disabled, an overlay with a direct YouTube link is shown instead of a blank screen.
- **IPTV / HLS streams** — load any `.m3u8` or `.m3u` playlist from a URL and browse hundreds of live channels and VOD entries directly inside a room.
- **Server-side CORS proxy** — HLS manifests and segments are fetched server-side (`/api/iptv/proxy`), bypassing CORS restrictions. The proxy is authenticated and domain-whitelisted to registered IPTV lists only.
- **Admin panel** — manage users, active rooms, connection tokens, and IPTV playlists from a dedicated admin interface.
- **Room creation with source selection** — when creating a room, choose between YouTube mode or IPTV mode and optionally link a specific IPTV list.
- **In-room channel browser** — browse and filter IPTV entries by group or search term without leaving the room.
- **Live badge** — streams detected as live (`HLS.Events.LEVEL_LOADED` with `details.live`) display an **EN VIVO** badge over the player.
- **Real-time chat** — per-room chat with avatar support.
- **PIN-protected rooms** — optional PIN lock for private rooms.
- **Non-embeddable video indicator** — search results that cannot be embedded are marked with an "No embebible" badge so users can decide before loading.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Client | React 18 + TypeScript + Vite + Tailwind CSS |
| Server | Node.js + Express + Socket.IO |
| HLS playback | hls.js |
| YouTube playback | YouTube IFrame API (nocookie domain) |
| M3U parsing | iptv-playlist-parser |
| Real-time | Socket.IO |

## Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install dependencies

```bash
npm install
```

This runs `npm install` in both `apps/client` and `apps/server` via the root workspace setup.

### Environment variables

Create `apps/server/.env`:

```env
PORT=3001
JWT_SECRET=your_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
```

### Development

```bash
npm run dev
```

Starts both the Vite dev server (client, port 5173) and the Express server (port 3001) concurrently.

### Production build

```bash
npm run build
```

Compiles the TypeScript server and builds the Vite client bundle. Outputs:
- Server: `apps/server/dist/`
- Client: `apps/client/dist/`

### Start production server

```bash
npm start
```

## Basic Usage

### Create a room

1. Log in (or register with an invite token).
2. Click **Nueva sala** in the admin panel, or ask an admin to create one.
3. Choose **YouTube** or **Lista IPTV** as the source type.

### YouTube room

1. Paste a YouTube URL or video ID in the input bar at the bottom of the room, or click the search icon to search by title.
2. All viewers sync automatically when play/pause/seek events are fired.
3. Use **Re-sincronizar** to push your current playback position to everyone.

### IPTV room

1. Click **Cambiar canal** to open the channel browser.
2. Filter by group or search by name, then click an entry to load the stream.
3. All viewers receive the new stream URL and start playing simultaneously.
4. A red **EN VIVO** badge appears on live streams.

### Invite friends

Click the **link icon** in the room header to copy the room URL. Share it with friends — they can join directly or enter a PIN if the room is protected.

## IPTV Lists

IPTV lists are managed by admins from the **Listas IPTV** tab in the admin panel.

- **Add a list** — paste any public `.m3u` or `.m3u8` URL. The server fetches and parses it immediately.
- **Refresh** — re-download and re-parse a list at any time.
- **Enable / Disable** — disabled lists are hidden from the room creation picker but their data is preserved.

### CORS Proxy Security

The proxy endpoint `/api/iptv/proxy` requires authentication and only forwards requests to domains that belong to admin-registered IPTV list URLs. Arbitrary URL proxying is rejected with `403 Forbidden`.
