<CUSTOM_PLAN>

<ORIGINAL_PLAN>
Construye una web app local completa llamada "WatchJunto" desde cero.
Analiza el alcance completo e implementa todo de una vez sin detenerte a preguntar.

## Qué es
Una app privada de watch-party para un grupo pequeño de amigos (máximo 10 usuarios)
en red local. Los usuarios se unen por link de invitación. Un admin controla todo.
Inspiración: app tipo "Rave" pero self-hosted, local y simple.

## Stack tecnológico
- Backend: Node.js + Express + Socket.IO
- Frontend: HTML + CSS + Vanilla JS (single page app, sin framework)
- Almacenamiento: localStorage para sesión y datos de usuario (sin base de datos por ahora)
- Sin Docker, sin cloud, sin auth externa — solo `npm start` y corre

## Estructura de archivos a crear
watchjunto/
├── server/
│   ├── index.js          ← Servidor Express + Socket.IO
│   ├── rooms.js          ← Lógica de salas (crear, borrar, listar)
│   └── auth.js           ← Generación de tokens/links de invitación
├── client/
│   ├── index.html        ← Pantalla del Lobby
│   ├── room.html         ← Pantalla de sala/watch
│   ├── admin.html        ← Panel de administrador
│   ├── css/
│   │   ├── main.css      ← Estilos globales + variables de tema claro/oscuro
│   │   ├── lobby.css
│   │   ├── room.css
│   │   └── admin.css
│   └── js/
│       ├── app.js        ← Lógica compartida, helpers de localStorage, toggle de tema
│       ├── lobby.js      ← Lógica del lobby
│       ├── room.js       ← Sincronización del player + lógica del chat
│       ├── player.js     ← Wrapper de YouTube IFrame API + motor de sincronía
│       └── admin.js      ← Lógica del panel admin
├── .env
├── package.json
└── README.md

## Funcionalidades a implementar — TODAS, sin omitir ninguna

### Auth (simple, sin complejidad de JWT)
- El admin define ADMIN_PASSWORD en .env
- En la primera visita, el usuario ingresa un nombre de usuario (guardado en localStorage)
- El admin genera tokens de invitación (guardados en memoria del servidor como Map)
- Formato del link: http://[ip-local]:3000/join/[token]
- El token otorga acceso por 24h, se guarda en localStorage tras el primer uso
- Panel admin protegido por ADMIN_PASSWORD mediante un formulario simple

### Lobby (index.html)
- Mostrar nombre "WatchJunto" con botón de toggle claro/oscuro arriba a la derecha
- Mostrar nombre de usuario y badge "eres admin" si aplica
- Lista de salas activas con: nombre, usuarios actuales / máximo, estado (abierta/cerrada), botón Entrar
- Botón "Crear sala" (solo admin, oculto para invitados)
- Actualización en tiempo real de la lista de salas vía eventos Socket.IO
- Botón para copiar link de invitación (http://[ip-local]:3000) al portapapeles

### Vista de sala (room.html)
- Navbar superior: volver al lobby, nombre de sala, contador de usuarios en vivo
- Barra de URL estilo browser: el usuario pega cualquier URL o ID de YouTube, presiona Enter o botón Ir
- YouTube IFrame Player embebido abajo, ancho completo, ratio 16:9
- Motor de sincronía vía Socket.IO:
  - Cuando el admin reproduce/pausa/busca → emite evento → todos los clientes sincronizan
  - Cuando un usuario nuevo entra a mitad del video → el servidor envía el timestamp actual → el cliente hace seek
  - Botón "Resync" fuerza a todos a hacer seek al tiempo actual del admin
  - Pill de estado de sincronía: verde "Sincronizados" o amarillo "Sincronizando..."
- Sidebar derecho (colapsable en pantallas pequeñas):
  - Tab 1: Chat — mensajes en tiempo real con nombre de usuario, texto, timestamp
  - Tab 2: Usuarios — lista de conectados con punto de color (en línea/ausente)
- Chat: input de texto + botón enviar, Enter envía, mensajes hacen scroll automático al final
- Todos los mensajes del chat guardados en localStorage por sala (últimos 100 mensajes)

### Panel admin (admin.html)
- Acceso protegido por contraseña
- Formulario para crear sala: nombre, máximo de usuarios, toggle abierta/cerrada
- Lista de todas las salas con: conteo de usuarios, botón eliminar, botón copiar link
- Lista de todas las conexiones activas (nombre de usuario + hora de entrada)
- Botón para generar link de invitación → crea token → muestra URL completa para copiar
- Botón para limpiar todas las salas

### Sistema de temas
- CSS custom properties para todos los colores definidos en :root y [data-theme="dark"]
- Tema oscuro por defecto: navy/purple oscuro (#080810 bg, #7c3aed acento)
- Tema claro: blanco limpio con acentos púrpura
- El botón toggle guarda preferencia en localStorage
- Transición suave al cambiar (transition: background 0.2s, color 0.2s)

### Eventos Socket.IO a implementar (lista completa)
Cliente → Servidor:
- join-room { roomId, username }
- leave-room { roomId }
- player-play { roomId, currentTime }
- player-pause { roomId, currentTime }
- player-seek { roomId, currentTime }
- player-load { roomId, videoId }
- chat-message { roomId, username, text }
- request-sync { roomId }

Servidor → Cliente:
- room-list (lista completa de salas)
- room-users { roomId, users[] }
- player-play { currentTime }
- player-pause { currentTime }
- player-seek { currentTime }
- player-load { videoId }
- chat-message { username, text, timestamp }
- sync-state { videoId, currentTime, isPlaying }
- user-joined { username }
- user-left { username }

### Archivo .env
PORT=3000
ADMIN_PASSWORD=admin123

### Scripts en package.json
- "start": "node server/index.js"
- "dev": "nodemon server/index.js"

### README.md en español
Incluir:
1. npm install && npm start
2. Abrir http://localhost:3000 o http://[tu-ip-local]:3000
3. Cómo obtener la IP local en Windows/Mac/Linux
4. Cómo generar links de invitación
5. Limitaciones conocidas (solo YouTube por ahora, sin soporte DRM)

## Reglas de implementación
- Usar YouTube IFrame API (cargada desde youtube.com/iframe_api) para el player
- El servidor mantiene el estado de salas en memoria (Map de salas, Map de sockets por sala)
- Sin TypeScript, sin build tools, sin bundlers — JS plano que corre directamente
- Express sirve todos los archivos de client/ como estáticos
- Socket.IO servido desde el mismo servidor Express
- No usar ningún framework CSS — escribir todo el CSS desde cero
- Layout mobile-friendly (sidebar colapsa a drawer inferior en pantallas pequeñas)
- Todos los estados de error manejados: sala no encontrada, token expirado, sala llena
- Console.log de eventos importantes del servidor (usuario entró, sala creada, etc.)

## Orden de implementación
1. Crear package.json e instalar dependencias
2. Crear server/index.js (servidor Express + Socket.IO completo con todos los eventos)
3. Crear server/rooms.js y server/auth.js
4. Crear client/css/main.css con sistema de temas completo
5. Crear todos los archivos CSS restantes
6. Crear client/index.html (lobby) con JS completo
7. Crear client/room.html con player de YouTube + sincronía + chat
8. Crear client/admin.html con panel admin completo
9. Crear .env y README.md

Implementa todo completamente. No uses comentarios placeholder como
"// agregar lógica aquí". Cada función debe estar completamente implementada.
</ORIGINAL_PLAN>

<DETAILED_PLAN>

## Technical Problem Description

WatchJunto is a self-hosted, LAN-only watch-party web application for small groups (≤10 users). The core technical challenge is achieving **real-time bidirectional synchronization** of a YouTube IFrame player across multiple browser clients, all mediated through a single Node.js server running on a local network. There is no persistent database — all state lives in server memory (JavaScript `Map` objects) and browser `localStorage`. The app must handle the full lifecycle: invite-link auth, room management, player sync, and live chat, without any external dependencies beyond npm packages.

---

## Technical Solution Description

### Runtime and Transport Layer
- **Node.js v18+** runs a single-process Express HTTP server that also bootstraps a Socket.IO WebSocket server on the same port (`3000`).
- All static assets under `client/` are served by Express via `express.static(__dirname + '/../client')`.
- Socket.IO uses the default WebSocket transport with HTTP long-polling fallback, ensuring compatibility across browsers on the LAN.
- `dotenv` loads `.env` at startup so `process.env.PORT` and `process.env.ADMIN_PASSWORD` are available everywhere in the server process.

### In-Memory State (server/rooms.js + server/auth.js)
All mutable state is held in module-level `Map` objects, exported as singletons:

```
// server/rooms.js
rooms: Map<roomId:string, Room>
  Room = {
    id: string,           // uuid v4
    name: string,
    maxUsers: number,
    isOpen: boolean,
    createdAt: Date,
    playerState: {
      videoId: string | null,
      currentTime: number,   // seconds (float)
      isPlaying: boolean,
      updatedAt: number      // Date.now() — used to extrapolate live time
    },
    users: Map<socketId:string, { username:string, joinedAt:Date }>
  }

// server/auth.js
tokens: Map<token:string, { createdAt:number, usedBy:string|null }>
  — token TTL: 86_400_000 ms (24 h)
  — token format: crypto.randomBytes(24).toString('hex') → 48-char hex string
```

No external IDs library is needed for rooms — use `crypto.randomUUID()` (Node 14.17+).

### Server Entry Point (server/index.js)
Responsibilities in order of registration:
1. `require('dotenv').config()`
2. Create Express app, attach `http.createServer`, attach `new Server(httpServer)` (Socket.IO).
3. Register `express.static` for `client/`.
4. Register HTTP routes:
   - `GET /join/:token` — validates token, redirects to `/?token=<token>` (client handles it).
   - `GET /api/rooms` — returns serialized room list (used for initial load).
   - `POST /api/admin/login` — body `{ password }`, returns `{ ok: true }` or 401.
   - `POST /api/admin/rooms` — create room (requires admin header).
   - `DELETE /api/admin/rooms/:id` — delete room.
   - `DELETE /api/admin/rooms` — delete all rooms.
   - `POST /api/admin/invite` — generate token, returns `{ token, url }`.
5. Register Socket.IO `connection` handler — all real-time logic lives here.
6. `httpServer.listen(PORT)` and log local IP via `os.networkInterfaces()`.

### Socket.IO Event Architecture

All events scoped to a room use Socket.IO's native **room** feature (`socket.join(roomId)`), so broadcasts can be targeted with `io.to(roomId).emit(...)`.

**Client → Server events (received in `io.on('connection', socket => { ... })`):**

| Event | Payload | Server action |
|---|---|---|
| `join-room` | `{ roomId, username, token }` | Validate token, check room exists & not full & open, call `socket.join(roomId)`, add user to `room.users`, emit `sync-state` to joining socket, broadcast `user-joined` + `room-users` to room, emit `room-list` to all. |
| `leave-room` | `{ roomId }` | Remove user from `room.users`, `socket.leave(roomId)`, broadcast `user-left` + `room-users`, emit `room-list` to all. |
| `player-play` | `{ roomId, currentTime }` | Guard: only admin socket may emit. Update `room.playerState`, broadcast `player-play { currentTime }` to rest of room. |
| `player-pause` | `{ roomId, currentTime }` | Same guard. Update state, broadcast. |
| `player-seek` | `{ roomId, currentTime }` | Same guard. Update state, broadcast. |
| `player-load` | `{ roomId, videoId }` | Same guard. Update `playerState.videoId`, reset `currentTime=0`, broadcast `player-load { videoId }` to room. |
| `chat-message` | `{ roomId, username, text }` | Sanitize `text` (strip HTML tags, max 500 chars). Append `{ username, text, timestamp: Date.now() }` to an in-memory ring buffer (last 100 msgs per room). Broadcast `chat-message { username, text, timestamp }` to room. |
| `request-sync` | `{ roomId }` | Compute live `currentTime` = `playerState.currentTime + (Date.now() - playerState.updatedAt)/1000` if playing. Emit `sync-state { videoId, currentTime, isPlaying }` to requesting socket only. |

**Admin identification:** When admin logs in via `POST /api/admin/login`, the server sets a signed session token in a `Set-Cookie` header (using `cookie-parser` + `crypto.createHmac('sha256', ADMIN_PASSWORD)`). All protected routes and socket events check this cookie. The admin socket is identified by inspecting `socket.handshake.headers.cookie` on the server side.

**`disconnect` handler:** Iterate all rooms in `rooms` map, remove the socket from any room it was in, broadcast `user-left` + `room-users` + `room-list` updates.

### YouTube IFrame Player Wrapper (client/js/player.js)

Exposes a `PlayerManager` class/object:

```js
// Lifecycle
PlayerManager.init(containerElementId)   // injects <iframe> + loads YT API script once
PlayerManager.loadVideo(videoId)          // calls player.loadVideoById(videoId)
PlayerManager.play(time)                  // seekTo(time, true) + playVideo()
PlayerManager.pause(time)                 // seekTo(time, true) + pauseVideo()
PlayerManager.seekTo(time)               // seekTo(time, true)
PlayerManager.getCurrentTime()           // player.getCurrentTime()
PlayerManager.getState()                 // player.getPlayerState() → YT.PlayerState int

// Callbacks set by room.js
PlayerManager.onPlay  = fn(currentTime)
PlayerManager.onPause = fn(currentTime)
PlayerManager.onSeek  = fn(currentTime)  // fired via polling diff every 500 ms
```

**Critical detail — YT API async init:** `window.onYouTubeIframeAPIReady` callback must call `PlayerManager._createPlayer()`. All calls to `loadVideo/play/pause` queue commands if the player is not ready yet (simple array-based command queue that flushes on ready).

**Preventing echo:** A boolean flag `PlayerManager._isSyncing` is set to `true` whenever the server pushes a sync command. While `true`, state-change callbacks are suppressed so the client does not re-emit the event back to the server.

### Sync State Flow (room.js)

```
[Admin presses play]
  → YT onStateChange fires PlayerManager.onPlay(currentTime)
  → room.js: if isAdmin && !_isSyncing: socket.emit('player-play', { roomId, currentTime })

[Server receives player-play]
  → updates playerState
  → broadcasts player-play to room (excluding sender via socket.to(roomId))

[Guest receives player-play]
  → room.js: PlayerManager._isSyncing = true
  → PlayerManager.play(currentTime)
  → setTimeout(() => PlayerManager._isSyncing = false, 300)
```

**New user join sync:** Server computes live `currentTime` as described above, emits `sync-state` only to the new socket. Client handles `sync-state` identically to a seek+play/pause combo.

**Resync button:** Client emits `request-sync { roomId }`. Server replies with `sync-state` to that socket only. No broadcast.

### Token / Auth Flow (client/js/app.js + server/auth.js)

1. First visit → no `username` in `localStorage` → show username modal → save to `localStorage['wj_username']`.
2. If URL contains `?token=<value>`, call `POST /api/auth/validate` with `{ token }`. Server checks `tokens` map (TTL + not-yet-invalidated). On success, save `localStorage['wj_token'] = token`. Redirect to `index.html`.
3. Subsequent page loads → read token from `localStorage`, attach to every Socket.IO `join-room` payload and to HTTP request headers as `X-WJ-Token`.
4. Server validates token on `join-room`; if invalid/expired → emit `error { code: 'TOKEN_INVALID' }` → client shows error page.

### localStorage Schema (client/js/app.js)

| Key | Type | Description |
|---|---|---|
| `wj_username` | `string` | Chosen display name |
| `wj_token` | `string` | Invite token (48-char hex) |
| `wj_theme` | `'dark' \| 'light'` | UI theme preference |
| `wj_admin_session` | `string` | Admin session cookie mirror (for JS reads) |
| `wj_chat_<roomId>` | `JSON string` | Array of last 100 chat messages for that room |

### CSS Architecture (client/css/main.css)

All color tokens are defined as CSS custom properties:

```css
:root {
  --bg-primary: #080810;
  --bg-secondary: #0f0f1a;
  --bg-surface: #1a1a2e;
  --accent: #7c3aed;
  --accent-hover: #6d28d9;
  --text-primary: #f0f0ff;
  --text-secondary: #a0a0c0;
  --border: #2a2a4a;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5ff;
  --bg-surface: #ececff;
  --accent: #7c3aed;
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a6a;
  --border: #d0d0e8;
}
```

Theme is toggled by setting `document.documentElement.setAttribute('data-theme', theme)` and saved to `localStorage['wj_theme']`.

### File-by-File Implementation Map

#### `server/index.js`
- Imports: `express`, `http`, `socket.io`, `dotenv`, `os`, `cookie-parser`, `crypto`.
- Functions: `getLocalIP()` using `os.networkInterfaces()` (returns first non-internal IPv4).
- `adminAuth` middleware: reads `wj_admin` cookie, verifies HMAC.
- Socket.IO `connection` handler: registers all 8 client→server events + `disconnect`.
- On startup: logs `Server running at http://<localIP>:PORT`.

#### `server/rooms.js`
- Exports: `rooms` (Map), `createRoom(name, maxUsers)`, `deleteRoom(id)`, `deleteAllRooms()`, `getRoomList()` (serialized, strips internal socket Maps), `addUserToRoom(roomId, socketId, username)`, `removeUserFromRoom(roomId, socketId)`, `updatePlayerState(roomId, patch)`, `appendChatMessage(roomId, msg)`, `getChatHistory(roomId)`.

#### `server/auth.js`
- Exports: `tokens` (Map), `generateToken()` → `{ token, url }`, `validateToken(token)` → `boolean`, `signAdminCookie(password)`, `verifyAdminCookie(cookie, password)`.

#### `client/js/app.js`
- Exports to `window.WJ` namespace: `WJ.username`, `WJ.token`, `WJ.isAdmin`, `WJ.theme`.
- Functions: `WJ.init()` (called on every page load), `WJ.toggleTheme()`, `WJ.copyToClipboard(text)`, `WJ.formatTimestamp(ms)`, `WJ.sanitize(str)` (strips `<>` for XSS mitigation).
- On `DOMContentLoaded`: calls `WJ.init()`, applies saved theme, shows username modal if needed, handles token query param.

#### `client/js/lobby.js`
- Connects to Socket.IO at page load: `const socket = io()`.
- Listens for `room-list` event → re-renders room cards.
- "Create room" button: opens modal → submits `POST /api/admin/rooms`.
- "Copy invite link" button: calls `WJ.copyToClipboard(window.location.origin)`.
- Room card "Enter" button: navigates to `room.html?roomId=<id>`.

#### `client/js/room.js`
- On load: parse `?roomId` from URL, emit `join-room { roomId, username: WJ.username, token: WJ.token }`.
- Handles all server→client player events: calls `PlayerManager.*` with `_isSyncing = true` guard.
- Chat: on `chat-message` event, append to DOM + save to `localStorage['wj_chat_<roomId>']` (ring buffer of 100).
- On page unload (`beforeunload`): emit `leave-room { roomId }`.
- Resync button: `socket.emit('request-sync', { roomId })`.
- Sync pill: set to "Sincronizando..." on seek/load, set back to "Sincronizados" 1.5 s after last sync event.
- URL bar: extract video ID from YouTube URLs via regex `(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})`, or treat 11-char strings as raw video IDs.

#### `client/js/admin.js`
- On load: check `localStorage['wj_admin_session']`; if absent, show password form → `POST /api/admin/login` → save cookie.
- Fetches room list + connection list on load and after any mutation.
- Generate invite: `POST /api/admin/invite` → display full URL in a copyable input.
- Delete room: `DELETE /api/admin/rooms/:id` → re-fetch list.
- Delete all: `DELETE /api/admin/rooms` → re-fetch list.

#### `client/js/player.js`
- `PlayerManager` object (not a class, to avoid `new` confusion in vanilla JS).
- `_queue: []` — commands queued before player ready.
- `_ready: false` — set to `true` in `onReady` callback.
- `_lastTime: 0` — used for seek detection (polled every 500 ms via `setInterval`).
- `_isSyncing: false` — suppresses outbound events during server-driven sync.

### Error States and UX Handling

| Scenario | Server behavior | Client behavior |
|---|---|---|
| Room not found | emit `error { code: 'ROOM_NOT_FOUND' }` | Show overlay "Esta sala no existe" with Back button |
| Room full | emit `error { code: 'ROOM_FULL' }` | Show overlay "La sala está llena (X/X)" |
| Room closed | emit `error { code: 'ROOM_CLOSED' }` | Show overlay "La sala está cerrada" |
| Token expired/invalid | emit `error { code: 'TOKEN_INVALID' }` | Clear `localStorage`, redirect to `/join-required.html` (a minimal page explaining they need a new invite) |
| Admin wrong password | HTTP 401 | Show "Contraseña incorrecta" inline error |

### Mobile Layout (responsive breakpoint: 768 px)
- Room page: sidebar (chat + users) collapses to a **bottom drawer** triggered by a FAB (floating action button) with a chat bubble icon.
- Drawer uses CSS `transform: translateY(100%)` → `translateY(0)` with `transition: transform 0.25s ease`.
- Player maintains `aspect-ratio: 16/9` via CSS, width 100%.

### Security Notes
- Admin HMAC cookie prevents trivial password replay: `crypto.createHmac('sha256', ADMIN_PASSWORD).update('wj_admin').digest('hex')`.
- Chat text is stripped of `<>` characters on both client (`WJ.sanitize`) and server before broadcasting.
- Invite tokens are single-use-trackable (token stores `usedBy` socketId on first `join-room`) but not strictly invalidated after first use — the plan explicitly states simplicity over security.
- This app is LAN-only; no HTTPS is required per spec.

---

## Implementation Sequence (detailed)

### Step 1 — Project scaffold
- Create `watchjunto/` directory tree matching the spec exactly.
- Write `package.json` with `name`, `version: "1.0.0"`, `main: "server/index.js"`, `scripts: { start, dev }`, `dependencies: { express, socket.io, dotenv, cookie-parser, nodemon (devDependency) }`.
- Write `.env` with `PORT=3000` and `ADMIN_PASSWORD=admin123`.
- Run `npm install`.

### Step 2 — server/auth.js
Implement token generation and admin cookie signing. No external dependencies beyond Node `crypto`.

### Step 3 — server/rooms.js
Implement all room CRUD functions and the chat ring buffer. The `getRoomList()` function converts the `rooms` Map to a JSON-safe array, converting inner `users` Maps to arrays of `{ socketId, username, joinedAt }`.

### Step 4 — server/index.js
Wire Express routes and all Socket.IO events. Log every significant event with `[WJ]` prefix: room created, user joined, video loaded, etc.

### Step 5 — client/css/main.css
Full CSS reset (`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }`), CSS custom properties, typography (`font-family: 'Inter', system-ui, sans-serif`), utility classes, and transitions.

### Step 6 — client/css/lobby.css, room.css, admin.css
Page-specific layout rules. Room layout uses CSS Grid: `grid-template-columns: 1fr 320px` (player | sidebar), collapses to single column on mobile.

### Step 7 — client/index.html + lobby.js
Full lobby page with inline `<script type="module">` loading `app.js` then `lobby.js`. No bundler — script tags suffice. Username modal uses a `<dialog>` element.

### Step 8 — client/room.html + room.js + player.js
Full room page. YouTube IFrame API loaded via `<script src="https://www.youtube.com/iframe_api">`. PlayerManager initialized in `room.js` after DOM ready. Socket events wired up.

### Step 9 — client/admin.html + admin.js
Admin panel page. Fetches initial data via REST, then subscribes to `room-list` Socket.IO event for live updates.

### Step 10 — README.md
English README with setup instructions, local IP discovery commands (`ipconfig` / `ifconfig` / `ip a`), invite flow, and known limitations.

---

## Key Technical Decisions

1. **No database**: All state in `Map` objects. Server restart resets all rooms/tokens. Acceptable per spec.
2. **No JWT**: HMAC-signed cookie for admin; plain token string for guests. Keeps auth code under 50 lines.
3. **No framework**: Vanilla JS with `WJ` global namespace to share helpers across pages without a bundler.
4. **Socket.IO rooms as namespace**: Each `roomId` maps 1:1 to a Socket.IO room, enabling targeted broadcasts without maintaining manual socket arrays.
5. **`crypto.randomUUID()`**: Used for room IDs (Node 14.17+ built-in). No `uuid` npm package needed.
6. **Player echo prevention**: `_isSyncing` flag pattern avoids feedback loops between the YT player's state-change events and Socket.IO emissions.
7. **Live time extrapolation**: Server stores `updatedAt: Date.now()` on every player state change. When a new user joins, server computes `liveTime = storedTime + (now - updatedAt) / 1000` if `isPlaying`, giving accurate seek without continuous server-side polling.
8. **Chat ring buffer**: `Array.splice(0, messages.length - 100)` keeps the array at max 100 entries server-side. Client mirrors in localStorage with the same cap.
9. **Mobile sidebar as bottom drawer**: CSS-only approach (transform + transition) with a single JS toggle class, no library needed.
10. **YouTube video ID extraction**: A single regex handles all common YouTube URL formats plus raw 11-char IDs, making the URL bar robust without a URL parsing library.

</DETAILED_PLAN>
