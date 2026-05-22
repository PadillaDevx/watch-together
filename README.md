# Watch Together

Watch videos in perfect sync with your friends — YouTube and live IPTV streams, all in one place.

## Features

- **Synchronized YouTube playback** — play, pause, seek, and resync all viewers together in real time.
- **youtube-nocookie.com embed** — videos are loaded via `youtube-nocookie.com` for enhanced privacy. If a video has embedding disabled, an overlay with a direct YouTube link is shown instead of a blank screen.
- **IPTV / HLS streams** — load any `.m3u8` or `.m3u` playlist from a URL and browse hundreds of live channels and VOD entries directly inside a room.
- **Server-side CORS proxy** — HLS manifests and segments are fetched server-side (`/api/iptv/proxy`), bypassing CORS restrictions. The proxy is authenticated and domain-whitelisted to registered IPTV lists only.
- **Admin panel** — manage users, active rooms, connection tokens, IPTV playlists, and Jellyfin configuration from a dedicated admin interface.
- **Room creation with source selection** — when creating a room, choose between YouTube, IPTV, or Movies (Jellyfin) as the source type.
- **In-room channel browser** — browse and filter IPTV entries by group or search term without leaving the room.
- **Jellyfin integration** — connect a self-hosted Jellyfin media server; search movies and episodes directly from the room via the 🎬 Jellyfin browser. Stream URLs are proxied server-side so the API key never reaches the client.
- **Playback queue** — add videos, IPTV channels, or Jellyfin titles to an ordered queue; auto-advances on video end. Admins can reorder items via drag-and-drop, any user can remove their own entries.
- **Source switching** — change the room's playback source (YouTube / IPTV / Movies) at any time without leaving the room; resets queue and player state for all viewers.
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

---

## Deployment

WatchJunto is deployed as a Docker stack. PostgreSQL is used for persistent storage.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24 with the Compose plugin
- A domain name (optional — required for Cloudflare Tunnel)

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env` with secure values:

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password (used internally by docker-compose) |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |
| `SECRET_KEY` | Random string ≥ 32 chars for cookie signing |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token (see below) |

### 2. Start the stack

```bash
npm run docker:up
```

This builds the image, starts PostgreSQL, runs DB migrations + seed, and starts the app on port 3000.

| Script | Action |
|--------|--------|
| `npm run docker:up` | Build & start all services in background |
| `npm run docker:down` | Stop all services |
| `npm run docker:logs` | Follow app container logs |
| `npm run docker:reset` | Destroy volumes + rebuild from scratch |

### 3. Cloudflare Tunnel (remote access)

Cloudflare Tunnel lets you expose WatchJunto on the internet without opening firewall ports.

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create a tunnel**.
2. Choose **Cloudflared** as the connector type.
3. Copy the **Tunnel Token** shown during setup and paste it in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
4. Set the tunnel's **Public Hostname** to point to `http://app:3000` (the internal Docker service name).
5. Run `npm run docker:up` — the `cloudflared` service will automatically connect.

> If you don't need remote access, comment out the `cloudflared` service in `docker-compose.yml` and leave `CLOUDFLARE_TUNNEL_TOKEN` empty.

### 4. Database management

| Command | Description |
|---------|-------------|
| `npm run db:generate --workspace=apps/server` | Generate a new migration from schema changes |
| `npm run db:migrate --workspace=apps/server` | Apply pending migrations |
| `npm run db:seed --workspace=apps/server` | Re-run the seed (idempotent) |
| `npm run db:studio --workspace=apps/server` | Open Drizzle Studio (DB browser UI) |

### Architecture

```
┌─────────────────────────────────────────────┐
│  docker-compose                              │
│                                              │
│  ┌──────────┐    ┌──────────┐               │
│  │  app     │───▶│    db    │  postgres:16   │
│  │  :3000   │    │  :5432   │               │
│  └────▲─────┘    └──────────┘               │
│       │                                      │
│  ┌────┴─────────┐                            │
│  │ cloudflared  │  Cloudflare Tunnel         │
│  └──────────────┘                            │
└─────────────────────────────────────────────┘
         │
         ▼
   Internet (via Cloudflare)
```
