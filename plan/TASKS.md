# Plan

## Problem

WatchJunto is a self-hosted, LAN-only watch-party web application for small groups (≤10 users). The core technical challenge is achieving real-time bidirectional synchronization of a YouTube IFrame player across multiple browser clients, all mediated through a single Node.js server running on a local network. There is no persistent database — all state lives in server memory (JavaScript `Map` objects) and browser `localStorage`. The app must handle the full lifecycle: invite-link auth, room management, player sync, and live chat, without any external dependencies beyond npm packages.

## Solution

A single-process Node.js v18+ server runs Express (HTTP + static file serving) and Socket.IO (WebSocket) on the same port (`3000`). All mutable state (rooms, users, player state, chat history, invite tokens) is held in module-level `Map` objects exported as singletons from `server/rooms.js` and `server/auth.js`. The frontend is pure HTML + CSS + Vanilla JS using a `window.WJ` global namespace to share helpers across pages without a bundler. YouTube playback is managed through the IFrame API via a `PlayerManager` object with an `_isSyncing` flag to prevent event echo loops. Admin authentication uses an HMAC-signed cookie; guest authentication uses 48-char hex invite tokens stored in `localStorage`.

---

### Feature 1: Project Setup & Server Foundation

Create the full directory tree, install dependencies, and implement all three server modules (`auth.js`, `rooms.js`, `index.js`) with every HTTP route and Socket.IO event handler fully functional.

- [x] Create the project directory structure: `server/`, `client/css/`, `client/js/` — all directories matching the spec tree exactly
- [x] Create `package.json` with `name: "watchjunto"`, `version: "1.0.0"`, `main: "server/index.js"`, scripts `"start": "node server/index.js"` and `"dev": "nodemon server/index.js"`, dependencies `express`, `socket.io`, `dotenv`, `cookie-parser`, and devDependency `nodemon`
- [x] Create `.env` file with `PORT=3000` and `ADMIN_PASSWORD=admin123`
- [x] Run `npm install` and verify `node_modules/` is created with `express`, `socket.io`, `dotenv`, `cookie-parser`, `nodemon`
- [x] Implement `server/auth.js`:
  - Module-level `tokens` Map: `Map<token:string, { createdAt:number, usedBy:string|null }>`
  - `generateToken()`: uses `crypto.randomBytes(24).toString('hex')` to produce a 48-char hex token, stores it in `tokens` Map with `{ createdAt: Date.now(), usedBy: null }`, returns `{ token, url }` where `url = http://${getLocalIP()}:${PORT}/join/${token}` (import `getLocalIP` lazily or accept `baseUrl` as param)
  - `validateToken(token)`: returns `false` if token not in Map or `Date.now() - createdAt > 86_400_000`, returns `true` otherwise
  - `markTokenUsed(token, socketId)`: sets `tokens.get(token).usedBy = socketId`
  - `revokeToken(token)`: deletes token from Map
  - `listTokens()`: returns array of `{ token, createdAt, usedBy }` from Map entries
  - `signAdminCookie(password)`: returns `crypto.createHmac('sha256', password).update('wj_admin').digest('hex')`
  - `verifyAdminCookie(cookieValue, password)`: computes expected HMAC and returns `crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cookieValue))` — use try/catch for length mismatch
  - Export all functions; do NOT export the raw `tokens` Map (keep it private)
- [x] Implement `server/rooms.js`:
  - Module-level `rooms` Map: `Map<roomId:string, Room>` where Room shape is `{ id, name, maxUsers, isOpen, createdAt, playerState: { videoId, currentTime, isPlaying, updatedAt }, users: Map<socketId, { username, joinedAt }>, chatHistory: [] }`
  - `createRoom(name, maxUsers, isOpen)`: generates `id = crypto.randomUUID()`, builds Room object with `playerState = { videoId: null, currentTime: 0, isPlaying: false, updatedAt: Date.now() }`, inserts into `rooms`, returns the full room object
  - `deleteRoom(roomId)`: removes from `rooms`, returns `boolean` indicating success
  - `deleteAllRooms()`: calls `rooms.clear()`
  - `getRoom(roomId)`: returns raw Room object or `undefined`
  - `getRoomList()`: converts `rooms` Map to JSON-safe array — for each room convert inner `users` Map to `[{ socketId, username, joinedAt }]` array, omit `chatHistory`, return array
  - `addUserToRoom(roomId, socketId, username)`: returns `{ ok: false, code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_CLOSED' }` on failure; on success adds `{ username, joinedAt: new Date() }` to `room.users`, returns `{ ok: true }`
  - `removeUserFromRoom(roomId, socketId)`: deletes `socketId` from `room.users` if room exists
  - `updatePlayerState(roomId, patch)`: merges patch into `room.playerState`, always sets `playerState.updatedAt = Date.now()`
  - `appendChatMessage(roomId, msg)`: pushes `msg` to `room.chatHistory`; if length > 100, calls `room.chatHistory.splice(0, room.chatHistory.length - 100)`
  - `getChatHistory(roomId)`: returns `room.chatHistory` array or `[]`
  - `getLiveCurrentTime(room)`: if `room.playerState.isPlaying` returns `room.playerState.currentTime + (Date.now() - room.playerState.updatedAt) / 1000`, else returns `room.playerState.currentTime`
  - Export all functions; do NOT export the raw `rooms` Map
- [x] Implement `server/index.js`:
  - Imports at top: `require('dotenv').config()`, then `express`, `http`, `{ Server }` from `socket.io`, `os`, `cookieParser` from `cookie-parser`, `crypto`, and the exported functions from `./rooms` and `./auth`
  - Implement `getLocalIP()`: iterates `os.networkInterfaces()`, finds first non-internal IPv4 address using `!iface.internal && iface.family === 'IPv4'`, returns the address string or `'localhost'` as fallback
  - Create `app = express()`, `httpServer = http.createServer(app)`, `io = new Server(httpServer)`
  - Register middleware: `app.use(cookieParser())`, `app.use(express.json())`, `app.use(express.static(path.join(__dirname, '../client')))`
  - Implement `adminAuth` middleware: reads `req.cookies.wj_admin`, calls `verifyAdminCookie(cookie, process.env.ADMIN_PASSWORD)`, returns 401 JSON `{ error: 'Unauthorized' }` on failure
  - Register HTTP routes:
    - `GET /join/:token`: calls `validateToken(req.params.token)`, if valid redirects `res.redirect('/?token=' + req.params.token)`, else redirects to `/join-required.html`
    - `GET /api/rooms`: returns `res.json(getRoomList())`
    - `POST /api/admin/login`: reads `req.body.password`, compares with `process.env.ADMIN_PASSWORD`, on match sets `res.cookie('wj_admin', signAdminCookie(password), { httpOnly: true, sameSite: 'strict' })` and returns `{ ok: true }`, on mismatch returns 401 `{ error: 'Wrong password' }`
    - `POST /api/admin/rooms` (adminAuth): reads `{ name, maxUsers, isOpen }` from body, calls `createRoom(...)`, broadcasts `room-list` update via `io.emit('room-list', getRoomList())`, returns `res.json(room)`
    - `DELETE /api/admin/rooms/:id` (adminAuth): calls `deleteRoom(id)`, broadcasts `room-list`, returns `{ ok: true }`
    - `DELETE /api/admin/rooms` (adminAuth): calls `deleteAllRooms()`, broadcasts `room-list`, returns `{ ok: true }`
    - `POST /api/admin/invite` (adminAuth): calls `generateToken()` with base URL derived from `getLocalIP()` and `PORT`, returns `{ token, url }`
    - `GET /api/admin/tokens` (adminAuth): returns `{ tokens: listTokens() }`
    - `GET /api/admin/connections` (adminAuth): iterates all rooms, collects all users with roomId, returns array of `{ roomId, roomName, socketId, username, joinedAt }`
  - Register Socket.IO connection handler: inside `io.on('connection', socket => { ... })` implement all events:
    - `join-room { roomId, username, token }`: validate token with `validateToken`, call `addUserToRoom`, on success call `socket.join(roomId)`, mark socket metadata `socket.data = { roomId, username }`, compute `liveTime = getLiveCurrentTime(room)`, emit `sync-state { videoId, currentTime: liveTime, isPlaying }` to joining socket, broadcast `user-joined { username }` to rest of room via `socket.to(roomId).emit(...)`, broadcast `room-users` array to room via `io.to(roomId).emit(...)`, emit `room-list` to all via `io.emit(...)`, log `[WJ] ${username} joined room ${roomId}`
    - `leave-room { roomId }`: call `removeUserFromRoom`, `socket.leave(roomId)`, broadcast `user-left { username }` and `room-users` to room, emit `room-list` to all
    - `player-play { roomId, currentTime }`: call `updatePlayerState(roomId, { isPlaying: true, currentTime })`, broadcast `player-play { currentTime }` to rest of room via `socket.to(roomId).emit(...)`, log event
    - `player-pause { roomId, currentTime }`: call `updatePlayerState(roomId, { isPlaying: false, currentTime })`, broadcast `player-pause { currentTime }` to rest of room
    - `player-seek { roomId, currentTime }`: call `updatePlayerState(roomId, { currentTime })`, broadcast `player-seek { currentTime }` to rest of room
    - `player-load { roomId, videoId }`: call `updatePlayerState(roomId, { videoId, currentTime: 0, isPlaying: false })`, broadcast `player-load { videoId }` to full room via `io.to(roomId).emit(...)`, log event
    - `chat-message { roomId, username, text }`: sanitize text server-side (replace `<` and `>` with HTML entities, truncate to 500 chars), build `msg = { username, text, timestamp: Date.now() }`, call `appendChatMessage(roomId, msg)`, broadcast `chat-message msg` to full room via `io.to(roomId).emit(...)`
    - `request-sync { roomId }`: retrieve room, compute `liveTime = getLiveCurrentTime(room)`, emit `sync-state { videoId, currentTime: liveTime, isPlaying }` to requesting socket only
    - `disconnect`: iterate `rooms` Map, for any room where `socket.id` is in `room.users` call `removeUserFromRoom`, broadcast `user-left`, `room-users`, and `room-list` updates, log disconnect
  - Call `httpServer.listen(PORT, () => console.log('[WJ] Server running at http://' + getLocalIP() + ':' + PORT))`
- [x] Build check: verify syntax with `node --check server/auth.js && node --check server/rooms.js && node --check server/index.js`
- [x] Commit

---

### Feature 2: CSS Theme System

Implement the full CSS foundation: global reset, CSS custom properties for dark and light themes, typography, utility classes, and all four page-specific stylesheets.

- [x] Implement `client/css/main.css`:
  - Full CSS reset: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`
  - `:root` dark theme custom properties: `--bg-primary: #080810`, `--bg-secondary: #0f0f1a`, `--bg-surface: #1a1a2e`, `--accent: #7c3aed`, `--accent-hover: #6d28d9`, `--text-primary: #f0f0ff`, `--text-secondary: #a0a0c0`, `--border: #2a2a4a`, `--success: #10b981`, `--warning: #f59e0b`, `--error: #ef4444`
  - `[data-theme="light"]` overrides: `--bg-primary: #ffffff`, `--bg-secondary: #f5f5ff`, `--bg-surface: #ececff`, `--accent: #7c3aed`, `--text-primary: #1a1a2e`, `--text-secondary: #4a4a6a`, `--border: #d0d0e8`
  - `body`: `background-color: var(--bg-primary)`, `color: var(--text-primary)`, `font-family: 'Inter', system-ui, -apple-system, sans-serif`, `font-size: 16px`, `line-height: 1.5`, `transition: background 0.2s ease, color 0.2s ease`
  - Typography: `h1`–`h3` font-weight 700, `h1` 2rem, `h2` 1.5rem, `h3` 1.125rem, all using `var(--text-primary)`
  - `.btn` base style: `display: inline-flex`, `align-items: center`, `gap: 0.5rem`, `padding: 0.5rem 1rem`, `border-radius: 6px`, `font-size: 0.875rem`, `font-weight: 500`, `cursor: pointer`, `border: none`, `transition: background 0.15s ease, opacity 0.15s ease`
  - `.btn-primary`: `background: var(--accent)`, `color: #fff`, hover `background: var(--accent-hover)`
  - `.btn-secondary`: `background: var(--bg-surface)`, `color: var(--text-primary)`, `border: 1px solid var(--border)`, hover `border-color: var(--accent)`
  - `.btn-danger`: `background: var(--error)`, `color: #fff`, hover `opacity: 0.85`
  - `.btn-ghost`: `background: transparent`, `color: var(--text-secondary)`, hover `color: var(--text-primary)`
  - `.badge`: `display: inline-block`, `padding: 0.125rem 0.5rem`, `border-radius: 999px`, `font-size: 0.75rem`, `font-weight: 600`
  - `.badge-accent`: `background: var(--accent)`, `color: #fff`
  - `.badge-success`: `background: var(--success)`, `color: #fff`
  - `.badge-warning`: `background: var(--warning)`, `color: #000`
  - `.card`: `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: 10px`, `padding: 1.25rem`
  - `.input`: `width: 100%`, `padding: 0.5rem 0.75rem`, `background: var(--bg-secondary)`, `border: 1px solid var(--border)`, `border-radius: 6px`, `color: var(--text-primary)`, `font-size: 0.875rem`, focus `border-color: var(--accent)`, `outline: none`
  - `.modal-backdrop`: `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.6)`, `backdrop-filter: blur(2px)`, `display: flex`, `align-items: center`, `justify-content: center`, `z-index: 1000`
  - `.modal`: `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 2rem`, `min-width: 320px`, `max-width: 480px`, `width: 90%`
  - `.overlay-error`: `position: fixed`, `inset: 0`, `background: var(--bg-primary)`, `display: flex`, `flex-direction: column`, `align-items: center`, `justify-content: center`, `gap: 1rem`, `z-index: 2000`
  - Utility classes: `.text-secondary { color: var(--text-secondary) }`, `.text-accent { color: var(--accent) }`, `.flex { display: flex }`, `.flex-col { flex-direction: column }`, `.items-center { align-items: center }`, `.justify-between { justify-content: space-between }`, `.gap-1 { gap: 0.25rem }` through `.gap-4 { gap: 1rem }`, `.hidden { display: none !important }`
  - Scrollbar styling for webkit: `scrollbar-width: thin`, `scrollbar-color: var(--border) transparent`
- [x] Implement `client/css/lobby.css`:
  - `.lobby-header`: `display: flex`, `align-items: center`, `justify-content: space-between`, `padding: 1rem 1.5rem`, `border-bottom: 1px solid var(--border)`, `background: var(--bg-secondary)`
  - `.lobby-header .logo`: `font-size: 1.5rem`, `font-weight: 700`, `color: var(--accent)`, letter-spacing
  - `.lobby-user-info`: `display: flex`, `align-items: center`, `gap: 0.75rem`
  - `.theme-toggle`: circular button 36px, `background: var(--bg-surface)`, `border: 1px solid var(--border)`, hover accent border
  - `.lobby-main`: `max-width: 900px`, `margin: 0 auto`, `padding: 2rem 1.5rem`
  - `.lobby-actions`: flex row with space-between, margin bottom 1.5rem
  - `.rooms-grid`: `display: grid`, `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, `gap: 1rem`
  - `.room-card`: extends `.card`, relative position, flex column, gap 0.75rem
  - `.room-card-header`: flex with space-between
  - `.room-card-meta`: `font-size: 0.8125rem`, `color: var(--text-secondary)`, flex items with gap
  - `.room-card-footer`: margin-top auto, flex with justify-content end
  - `.room-status-open`: `color: var(--success)`
  - `.room-status-closed`: `color: var(--error)`
  - `.rooms-empty`: centered placeholder text, secondary color, padding 3rem
  - Username modal styles: form layout with label + input + submit button
  - `@media (max-width: 768px)`: header wraps, rooms-grid single column
- [x] Implement `client/css/room.css`:
  - `.room-layout`: `display: grid`, `grid-template-columns: 1fr 320px`, `height: calc(100vh - 56px)`, `overflow: hidden`
  - `.room-navbar`: `height: 56px`, `display: flex`, `align-items: center`, `padding: 0 1rem`, `gap: 1rem`, `background: var(--bg-secondary)`, `border-bottom: 1px solid var(--border)`
  - `.room-title`: flex-1, font-weight 600, truncate with text-overflow ellipsis
  - `.user-count`: `font-size: 0.8125rem`, `color: var(--text-secondary)`, flex with icon
  - `.player-area`: `display: flex`, `flex-direction: column`, `overflow: hidden`
  - `.url-bar`: `display: flex`, `gap: 0.5rem`, `padding: 0.75rem 1rem`, `background: var(--bg-secondary)`, `border-bottom: 1px solid var(--border)`, input takes `flex: 1`
  - `.player-container`: `flex: 1`, `background: #000`, `position: relative`
  - `.player-container iframe`: `width: 100%`, `height: 100%`, `aspect-ratio: 16/9`, `border: none`
  - `.player-placeholder`: centered text in player-container when no video loaded
  - `.sync-pill`: `position: absolute`, `bottom: 1rem`, `left: 1rem`, `padding: 0.25rem 0.75rem`, `border-radius: 999px`, `font-size: 0.75rem`, `font-weight: 600`, `backdrop-filter: blur(4px)`
  - `.sync-pill.synced`: `background: rgba(16,185,129,0.2)`, `color: var(--success)`, `border: 1px solid var(--success)`
  - `.sync-pill.syncing`: `background: rgba(245,158,11,0.2)`, `color: var(--warning)`, `border: 1px solid var(--warning)`
  - `.sidebar`: `display: flex`, `flex-direction: column`, `border-left: 1px solid var(--border)`, `background: var(--bg-secondary)`, `overflow: hidden`
  - `.sidebar-tabs`: flex row, each tab `flex: 1`, `padding: 0.75rem`, `border-bottom: 1px solid var(--border)`, `cursor: pointer`, `text-align: center`, `font-size: 0.875rem`, active tab `border-bottom: 2px solid var(--accent)`, `color: var(--accent)`
  - `.tab-panel`: `flex: 1`, `overflow-y: auto`, `display: none`; `.tab-panel.active { display: flex; flex-direction: column }`
  - `.chat-messages`: `flex: 1`, `overflow-y: auto`, `padding: 0.75rem`, `display: flex`, `flex-direction: column`, `gap: 0.5rem`
  - `.chat-msg`: `font-size: 0.8125rem`; `.chat-msg-author`: `font-weight: 600`, `color: var(--accent)`, followed by space; `.chat-msg-time`: `font-size: 0.6875rem`, `color: var(--text-secondary)`, float right
  - `.chat-input-area`: `padding: 0.75rem`, `border-top: 1px solid var(--border)`, `display: flex`, `gap: 0.5rem`
  - `.users-list`: `padding: 0.75rem`, `display: flex`, `flex-direction: column`, `gap: 0.5rem`
  - `.user-item`: flex, align-center, gap 0.5rem; `.user-dot`: 8px circle, `background: var(--success)`, `border-radius: 50%`
  - `.resync-btn`: small secondary button, positioned in navbar
  - FAB button `.chat-fab`: `display: none`, circular 52px, accent background, fixed bottom-right, `box-shadow: 0 4px 12px rgba(0,0,0,0.4)`
  - `.bottom-drawer`: `display: none`, `position: fixed`, `bottom: 0`, `left: 0`, `right: 0`, `height: 60vh`, `background: var(--bg-secondary)`, `border-top: 1px solid var(--border)`, `border-radius: 16px 16px 0 0`, `transform: translateY(100%)`, `transition: transform 0.25s ease`, `z-index: 500`; `.bottom-drawer.open { transform: translateY(0) }`
  - `@media (max-width: 768px)`: `.room-layout { grid-template-columns: 1fr }`, `.sidebar { display: none }`, `.chat-fab { display: flex }`, `.bottom-drawer { display: flex; flex-direction: column }`
- [x] Implement `client/css/admin.css`:
  - `.admin-layout`: `max-width: 1000px`, `margin: 0 auto`, `padding: 2rem 1.5rem`
  - `.admin-header`: flex space-between with title and logout button
  - `.admin-section`: margin-bottom 2rem; `.admin-section-title`: h2 style, accent underline border-bottom
  - `.admin-login-page`: full-height centered form, same card style
  - `.create-room-form`: grid 2 cols on desktop, gap 0.75rem, form labels above inputs
  - `.rooms-table`: `width: 100%`, `border-collapse: collapse`; `th, td`: `padding: 0.75rem 1rem`, `text-align: left`, `border-bottom: 1px solid var(--border)`; `th`: `color: var(--text-secondary)`, `font-size: 0.8125rem`, `font-weight: 600`; `tr:last-child td { border-bottom: none }`
  - `.connections-list`: flex column, each row `.connection-item` flex space-between, padding 0.75rem, border-bottom
  - `.invite-result`: flex row with readonly input (flex-1) + copy button, padding 1rem, bg-surface, border-radius 8px, margin-top 0.75rem
  - `.admin-danger-zone`: margin-top 2rem, padding 1.5rem, border 1px solid `var(--error)`, border-radius 10px
  - `@media (max-width: 768px)`: create-room-form single column, rooms-table font-size smaller, hide some table columns
- [x] Build check: validate HTML structure is implied by CSS class names — verify CSS files have no syntax errors by loading `node -e "require('fs').readFileSync('client/css/main.css', 'utf8')"` for each file to confirm they are readable
- [x] Commit

---

### Feature 3: Lobby Page

Implement the complete lobby experience: `client/index.html`, `client/js/app.js` (shared WJ namespace), `client/js/lobby.js`, and the static `client/join-required.html` error page.

- [x] Create `client/join-required.html`: minimal standalone HTML page (no external CSS, inline styles matching dark theme) with heading "Necesitas una invitación", paragraph "Tu link de invitación ha expirado o no es válido. Pide un nuevo link al administrador.", and a button linking back to `/`
- [x] Implement `client/js/app.js`:
  - Declare `window.WJ = {}` namespace at top of file
  - `WJ.STORAGE_KEYS`: object constant with keys `USERNAME: 'wj_username'`, `TOKEN: 'wj_token'`, `THEME: 'wj_theme'`, `ADMIN_SESSION: 'wj_admin_session'`
  - `WJ.username`: getter returning `localStorage.getItem(WJ.STORAGE_KEYS.USERNAME)`
  - `WJ.token`: getter returning `localStorage.getItem(WJ.STORAGE_KEYS.TOKEN)`
  - `WJ.theme`: getter returning `localStorage.getItem(WJ.STORAGE_KEYS.THEME) || 'dark'`
  - `WJ.isAdmin`: getter returning `!!localStorage.getItem(WJ.STORAGE_KEYS.ADMIN_SESSION)`
  - `WJ.applyTheme(theme)`: calls `document.documentElement.setAttribute('data-theme', theme)`, saves to `localStorage`
  - `WJ.toggleTheme()`: reads current theme, toggles between `'dark'` and `'light'`, calls `WJ.applyTheme()`
  - `WJ.sanitize(str)`: returns `String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500)`
  - `WJ.formatTimestamp(ms)`: returns time string formatted as `HH:MM` using `new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`
  - `WJ.copyToClipboard(text)`: uses `navigator.clipboard.writeText(text)`, returns Promise; shows a temporary "Copiado!" tooltip near the triggering element if called with `(text, buttonEl)` as optional second arg
  - `WJ.chatKey(roomId)`: returns `` `wj_chat_${roomId}` ``
  - `WJ.loadChatHistory(roomId)`: returns `JSON.parse(localStorage.getItem(WJ.chatKey(roomId)) || '[]')`
  - `WJ.saveChatMessage(roomId, msg)`: loads history, pushes `msg`, splices to max 100, saves back to localStorage
  - `WJ.handleTokenParam()`: reads `new URLSearchParams(location.search).get('token')`, if present saves to `localStorage[WJ.STORAGE_KEYS.TOKEN]`, removes `?token=...` from URL via `history.replaceState`
  - `WJ.init()`: calls `WJ.applyTheme(WJ.theme)`, calls `WJ.handleTokenParam()`, returns early if no further action needed; exported to be called from each page's `DOMContentLoaded`
- [x] Implement `client/index.html`:
  - Valid HTML5 document, `lang="es"`, charset UTF-8, viewport meta tag
  - `<title>WatchJunto</title>`
  - Link all CSS in `<head>`: `<link rel="stylesheet" href="css/main.css">`, `<link rel="stylesheet" href="css/lobby.css">`
  - `<header class="lobby-header">`: left side logo `<span class="logo">WatchJunto</span>`, right side `.lobby-user-info` div containing `<span id="username-display">`, `<span id="admin-badge" class="badge badge-accent hidden">Admin</span>`, `<button id="theme-toggle" class="theme-toggle btn-ghost">` with inline SVG sun/moon icons, `<button id="copy-invite-btn" class="btn btn-secondary">Copiar Link</button>`
  - `<main class="lobby-main">`: `.lobby-actions` div with h2 "Salas activas" and `<button id="create-room-btn" class="btn btn-primary hidden">+ Crear sala</button>`
  - `<div id="rooms-container" class="rooms-grid"></div>` with fallback `<div class="rooms-empty">No hay salas activas</div>` inside
  - Username setup `<dialog id="username-modal">` with `.modal` inner div: heading "¿Cómo te llamas?", `<input id="username-input" class="input" placeholder="Tu nombre de usuario" maxlength="20">`, `<button id="username-submit" class="btn btn-primary">Entrar</button>`; dialog opens automatically if no username in localStorage
  - Create room `<dialog id="create-room-modal">` with form: input `name` (text, required, max 40), input `maxUsers` (number, min 2 max 10, default 10), toggle `isOpen` (checkbox, default checked), submit button
  - At bottom of `<body>`: `<script src="js/app.js"></script>`, `<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>`, `<script src="js/lobby.js"></script>`
- [x] Implement `client/js/lobby.js`:
  - `DOMContentLoaded` listener calls `WJ.init()`
  - Show/hide `#admin-badge` based on `WJ.isAdmin`
  - Show/hide `#create-room-btn` based on `WJ.isAdmin`
  - Render `#username-display` from `WJ.username`
  - Open `#username-modal` as modal (`.showModal()`) if `!WJ.username`
  - `#username-submit` click handler: trims input, validates non-empty and no HTML chars, saves to `localStorage[WJ.STORAGE_KEYS.USERNAME]`, closes dialog, re-renders username display
  - Initialize Socket.IO: `const socket = io()`
  - `socket.on('room-list', rooms => renderRooms(rooms))`: on connect, also fetch `GET /api/rooms` for initial render
  - `renderRooms(rooms)`: clears `#rooms-container`, if empty shows `.rooms-empty`, else for each room creates a card using `document.createElement`, sets innerHTML with room name, `${room.users.length}/${room.maxUsers}` users, status badge (open/closed), Enter button with `data-room-id` attribute
  - Room card "Enter" button click: navigates to `room.html?roomId=${roomId}` via `window.location.href`
  - `#theme-toggle` click: calls `WJ.toggleTheme()`, updates button icon (swap SVG or text)
  - `#copy-invite-btn` click: calls `WJ.copyToClipboard(window.location.origin, event.currentTarget)`
  - `#create-room-btn` click: opens `#create-room-modal`
  - Create room form submit: reads form fields, calls `fetch('/api/admin/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, maxUsers, isOpen }) })`, closes modal on success, logs error on 4xx/5xx
  - Handle `socket.on('connect_error', ...)` and `socket.on('error', ...)` with console logging
- [x] Build check: verify syntax with `node --check client/js/app.js && node --check client/js/lobby.js` and validate `client/index.html` is well-formed (check for unclosed tags manually or via `node -e "const d=require('fs').readFileSync('client/index.html','utf8'); console.log(d.includes('</html>') ? 'OK' : 'MISSING')"`)
- [x] Commit

---

### Feature 4: Room/Watch Page

Implement the complete room experience: `client/room.html`, `client/js/player.js` (YouTube IFrame wrapper), and `client/js/room.js` (full sync engine + chat + user list).

- [x] Implement `client/js/player.js`:
  - Declare `window.PlayerManager = {}` (plain object, not a class)
  - Internal state properties: `_player: null`, `_ready: false`, `_queue: []`, `_isSyncing: false`, `_lastTime: 0`, `_seekPollInterval: null`, `_containerId: null`
  - Public callback properties (set by room.js): `PlayerManager.onPlay = null`, `PlayerManager.onPause = null`, `PlayerManager.onSeek = null`
  - `PlayerManager.init(containerId)`: stores `_containerId`, appends `<script src="https://www.youtube.com/iframe_api">` to `document.head` (only once, check if script already exists), sets `window.onYouTubeIframeAPIReady = () => PlayerManager._createPlayer()`
  - `PlayerManager._createPlayer()`: calls `new YT.Player(_containerId, { width: '100%', height: '100%', playerVars: { autoplay: 0, rel: 0, modestbranding: 1 }, events: { onReady: PlayerManager._onReady.bind(PlayerManager), onStateChange: PlayerManager._onStateChange.bind(PlayerManager) } })`, stores result in `_player`
  - `PlayerManager._onReady(event)`: sets `_ready = true`, flushes `_queue` by calling each queued command function, starts seek poll via `_seekPollInterval = setInterval(() => PlayerManager._checkSeek(), 500)`
  - `PlayerManager._enqueue(fn)`: if `_ready` calls `fn()` immediately, else pushes to `_queue`
  - `PlayerManager._onStateChange(event)`: checks `event.data`:
    - `YT.PlayerState.PLAYING`: if `!_isSyncing && onPlay` call `onPlay(event.target.getCurrentTime())`
    - `YT.PlayerState.PAUSED`: if `!_isSyncing && onPause` call `onPause(event.target.getCurrentTime())`
  - `PlayerManager._checkSeek()`: reads `_player.getCurrentTime()`, if `Math.abs(current - _lastTime) > 1.5 && !_isSyncing && PlayerManager.getState() === YT.PlayerState.PAUSED && onSeek` call `onSeek(current)`; always sets `_lastTime = current`
  - `PlayerManager.loadVideo(videoId)`: calls `_enqueue(() => _player.loadVideoById({ videoId, startSeconds: 0 }))`, resets `_lastTime = 0`
  - `PlayerManager.play(time)`: sets `_isSyncing = true`, calls `_enqueue(() => { _player.seekTo(time, true); _player.playVideo(); })`, schedules `setTimeout(() => PlayerManager._isSyncing = false, 400)`
  - `PlayerManager.pause(time)`: sets `_isSyncing = true`, calls `_enqueue(() => { _player.seekTo(time, true); _player.pauseVideo(); })`, schedules reset of `_isSyncing` after 400ms
  - `PlayerManager.seekTo(time)`: sets `_isSyncing = true`, calls `_enqueue(() => _player.seekTo(time, true))`, schedules reset of `_isSyncing` after 400ms
  - `PlayerManager.getCurrentTime()`: returns `_ready ? _player.getCurrentTime() : 0`
  - `PlayerManager.getState()`: returns `_ready ? _player.getPlayerState() : -1`
  - `PlayerManager.extractVideoId(input)`: applies regex `(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})` to extract ID from full URL; if no match and input is exactly 11 chars matching `[a-zA-Z0-9_-]{11}` treat as raw ID; returns `videoId` string or `null`
- [x] Implement `client/room.html`:
  - Valid HTML5, `lang="es"`, charset UTF-8, viewport meta
  - `<title>WatchJunto — Sala</title>`
  - Link CSS: `css/main.css`, `css/room.css`
  - `<nav class="room-navbar">`: back button (← Lobby), `<span id="room-title" class="room-title">Cargando...</span>`, `<span id="user-count" class="user-count">0 usuarios</span>`, `<button id="resync-btn" class="btn btn-secondary resync-btn">Resync</button>`
  - `<div class="room-layout">`:
    - `.player-area`: `.url-bar` with `<input id="video-url" class="input" placeholder="URL de YouTube o ID del video">` and `<button id="load-video-btn" class="btn btn-primary">Ir</button>`; then `.player-container` with `<div id="yt-player"></div>` (target for YT IFrame) and `<div id="sync-pill" class="sync-pill synced">Sincronizados</div>`
    - `.sidebar`: `.sidebar-tabs` with two tab buttons (data-tab="chat" and data-tab="users"); `.tab-panel#chat-panel.active` containing `.chat-messages#chat-messages` and `.chat-input-area` with `<input id="chat-input" class="input" placeholder="Mensaje...">` + `<button id="chat-send" class="btn btn-primary">Enviar</button>`; `.tab-panel#users-panel` with `<ul id="users-list" class="users-list"></ul>`
  - `<button id="chat-fab" class="chat-fab btn btn-primary">💬</button>`
  - `<div id="bottom-drawer" class="bottom-drawer">` with same tabs/chat structure as sidebar (duplicate for mobile)
  - `<div id="error-overlay" class="overlay-error hidden">` with `<h2 id="error-title">Error</h2>`, `<p id="error-message"></p>`, `<a href="/" class="btn btn-primary">← Volver al lobby</a>`
  - At bottom: `<script src="js/app.js"></script>`, `<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>`, `<script src="js/player.js"></script>`, `<script src="js/room.js"></script>`
- [x] Implement `client/js/room.js`:
  - `DOMContentLoaded` listener: calls `WJ.init()`, reads `roomId = new URLSearchParams(location.search).get('roomId')`, if no `roomId` shows error overlay with "Sala no encontrada"
  - Initialize Socket.IO: `const socket = io()`
  - Call `PlayerManager.init('yt-player')`
  - Wire `PlayerManager.onPlay = (currentTime) => { if (!PlayerManager._isSyncing) socket.emit('player-play', { roomId, currentTime }) }`
  - Wire `PlayerManager.onPause = (currentTime) => { if (!PlayerManager._isSyncing) socket.emit('player-pause', { roomId, currentTime }) }`
  - Wire `PlayerManager.onSeek = (currentTime) => { if (!PlayerManager._isSyncing) socket.emit('player-seek', { roomId, currentTime }) }`
  - `socket.on('connect')`: emit `join-room { roomId, username: WJ.username, token: WJ.token }`
  - `socket.on('sync-state', { videoId, currentTime, isPlaying })`: if `videoId` call `PlayerManager.loadVideo(videoId)` then after short delay if `isPlaying` `PlayerManager.play(currentTime)` else `PlayerManager.pause(currentTime)`, show sync pill as "Sincronizando...", reset to "Sincronizados" after 1500ms
  - `socket.on('player-play', { currentTime })`: call `PlayerManager.play(currentTime)`, show sync pill cycle
  - `socket.on('player-pause', { currentTime })`: call `PlayerManager.pause(currentTime)`, show sync pill cycle
  - `socket.on('player-seek', { currentTime })`: call `PlayerManager.seekTo(currentTime)`, show sync pill cycle
  - `socket.on('player-load', { videoId })`: call `PlayerManager.loadVideo(videoId)`
  - `socket.on('room-users', users)`: render `#users-list` — for each user create `<li class="user-item"><span class="user-dot"></span>${WJ.sanitize(user.username)}</li>`; also update `#user-count` text
  - `socket.on('user-joined', { username })`: append system message to chat: `-- ${WJ.sanitize(username)} se unió --`
  - `socket.on('user-left', { username })`: append system message to chat: `-- ${WJ.sanitize(username)} salió --`
  - `socket.on('chat-message', msg)`: call `appendChatMessage(msg)` and `WJ.saveChatMessage(roomId, msg)`
  - `socket.on('error', { code })`: show error overlay based on code: `ROOM_NOT_FOUND` → "Esta sala no existe", `ROOM_FULL` → "La sala está llena", `ROOM_CLOSED` → "La sala está cerrada", `TOKEN_INVALID` → clear localStorage and `location.href = '/join-required.html'`
  - `socket.on('room-list', ...)`: update page title room name if found in list (handle room rename edge case)
  - `appendChatMessage(msg)` function: creates `.chat-msg` element with `<span class="chat-msg-author">${WJ.sanitize(msg.username)}</span> ${WJ.sanitize(msg.text)} <span class="chat-msg-time">${WJ.formatTimestamp(msg.timestamp)}</span>`, appends to `#chat-messages`, scrolls container to bottom via `el.scrollTop = el.scrollHeight`
  - On load, render existing `WJ.loadChatHistory(roomId)` into chat
  - `#load-video-btn` click (and `#video-url` Enter keypress): extract video ID via `PlayerManager.extractVideoId(input.value)`, if valid `socket.emit('player-load', { roomId, videoId })`, else show brief "URL inválida" inline error
  - `#resync-btn` click: `socket.emit('request-sync', { roomId })`
  - Sidebar tab switching: clicking a `.sidebar-tabs` button removes `.active` from all `.tab-panel`, adds `.active` to the corresponding panel
  - `#chat-send` click and `#chat-input` Enter keypress: trim text, skip if empty, `socket.emit('chat-message', { roomId, username: WJ.username, text })`, clear input
  - `#chat-fab` click: toggles `#bottom-drawer` class `open`
  - `window.addEventListener('beforeunload', () => socket.emit('leave-room', { roomId }))`
  - Update `#room-title` from `room-list` event (find room by roomId, show its name) or from `sync-state` if room name is included
- [x] Build check: verify syntax with `node --check client/js/player.js && node --check client/js/room.js` and validate `client/room.html` has closing `</html>` tag
- [x] Commit

---

### Feature 5: Admin Panel

Implement the complete admin panel: `client/admin.html` and `client/js/admin.js` with full room management, invite generation, and live connection monitoring.

- [ ] Implement `client/admin.html`:
  - Valid HTML5, `lang="es"`, charset UTF-8, viewport meta
  - `<title>WatchJunto — Admin</title>`
  - Link CSS: `css/main.css`, `css/admin.css`
  - `<div id="login-page" class="admin-login-page">`: heading "Panel de Administrador", `<input id="admin-password" class="input" type="password" placeholder="Contraseña">`, `<button id="admin-login-btn" class="btn btn-primary">Entrar</button>`, `<p id="login-error" class="hidden" style="color:var(--error)">Contraseña incorrecta</p>`
  - `<div id="admin-panel" class="hidden">`:
    - `.admin-header`: `<h1>Panel Admin — WatchJunto</h1>`, `<button id="admin-logout" class="btn btn-secondary">Cerrar sesión</button>`
    - `<section class="admin-section">` for "Crear Sala": form with inputs for name (text), maxUsers (number 2–10), isOpen (checkbox), submit button "Crear Sala"
    - `<section class="admin-section">` for "Salas activas": `<table id="rooms-table" class="rooms-table">` with `<thead>` columns (Nombre, Usuarios, Estado, Acciones) and `<tbody id="rooms-tbody">`; below table `<button id="delete-all-btn" class="btn btn-danger">Eliminar todas las salas</button>`
    - `<section class="admin-section">` for "Generar invitación": `<button id="generate-invite-btn" class="btn btn-primary">Generar link de invitación</button>`, `<div id="invite-result" class="invite-result hidden">` with readonly input and copy button
    - `<section class="admin-section">` for "Conexiones activas": `<button id="refresh-connections-btn" class="btn btn-ghost">Actualizar</button>`, `<div id="connections-list" class="connections-list"></div>`
    - `.admin-danger-zone`: heading "Zona de peligro", `<button id="clear-tokens-btn" class="btn btn-danger">Revocar todos los tokens</button>` (calls DELETE /api/admin/tokens if you add that endpoint, or shows a message)
  - At bottom: `<script src="js/app.js"></script>`, `<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>`, `<script src="js/admin.js"></script>`
- [ ] Add `DELETE /api/admin/tokens` route to `server/index.js`: protected by `adminAuth`, calls a new `revokeAllTokens()` function in `auth.js` that calls `tokens.clear()`, returns `{ ok: true }`
  - Add `revokeAllTokens()` export to `server/auth.js`
- [ ] Implement `client/js/admin.js`:
  - `DOMContentLoaded` listener calls `WJ.init()`
  - `checkSession()`: if `localStorage.getItem(WJ.STORAGE_KEYS.ADMIN_SESSION)` exists, show `#admin-panel`, hide `#login-page`, call `loadAll()`
  - `#admin-login-btn` click: `fetch('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: input.value }) })`, on 200 save `localStorage[WJ.STORAGE_KEYS.ADMIN_SESSION] = 'true'`, show panel, call `loadAll()`; on 401 show `#login-error`; also listen for Enter keypress on `#admin-password`
  - `#admin-logout` click: `localStorage.removeItem(WJ.STORAGE_KEYS.ADMIN_SESSION)`, show login page, hide panel
  - `loadAll()`: calls `loadRooms()` and `loadConnections()` in parallel
  - `loadRooms()`: `fetch('/api/rooms')`, renders `#rooms-tbody` — for each room creates `<tr>` with `<td>${room.name}</td>`, `<td>${room.users.length}/${room.maxUsers}</td>`, `<td>${room.isOpen ? 'Abierta' : 'Cerrada'}</td>`, `<td>` with delete button (`data-room-id`) and copy-link button; if no rooms shows `<tr><td colspan="4">No hay salas</td></tr>`
  - `loadConnections()`: `fetch('/api/admin/connections')`, renders `#connections-list` — for each connection creates `.connection-item` with `<span>${WJ.sanitize(conn.username)}</span>`, `<span>${conn.roomName}</span>`, `<span>${WJ.formatTimestamp(conn.joinedAt)}</span>`; if none shows "No hay conexiones activas"
  - Create room form submit: reads name, maxUsers, isOpen, `fetch('/api/admin/rooms', { method: 'POST', ... })`, on success calls `loadRooms()`, resets form
  - Rooms table delete button click (event delegation on `#rooms-table`): `fetch('/api/admin/rooms/${roomId}', { method: 'DELETE' })`, on success calls `loadRooms()`
  - Rooms table copy-link button: calls `WJ.copyToClipboard('${location.origin}/join-room?roomId=${roomId}')` — note: this copies a navigable URL (lobby filters to room or room page handles roomId param)
  - `#delete-all-btn` click: confirm with `window.confirm('¿Eliminar TODAS las salas?')`, if confirmed `fetch('/api/admin/rooms', { method: 'DELETE' })`, then `loadRooms()`
  - `#generate-invite-btn` click: `fetch('/api/admin/invite', { method: 'POST' })`, on success show `#invite-result`, set readonly input value to `data.url`, copy button calls `WJ.copyToClipboard(data.url)`
  - `#refresh-connections-btn` click: calls `loadConnections()`
  - `#clear-tokens-btn` click: confirm with `window.confirm(...)`, `fetch('/api/admin/tokens', { method: 'DELETE' })`, log result
  - Subscribe to Socket.IO `room-list` event: `socket.on('room-list', () => loadRooms())` for live updates — initialize `const socket = io()` at top of the DOMContentLoaded handler
- [ ] Build check: verify syntax with `node --check client/js/admin.js && node --check server/auth.js && node --check server/index.js`
- [ ] Commit

---

### Feature 6: README & Final Polish

Write the README.md in Spanish, add the missing `join-required.html` error assets, verify mobile layout, and do a final end-to-end syntax sweep.

- [ ] Create `README.md` in the project root with the following sections in Spanish:
  - `# WatchJunto`: one-line description "App de watch-party self-hosted para red local"
  - `## Instalación y uso`: numbered steps: `1. npm install`, `2. npm start`, `3. Abrir http://localhost:3000 o http://[tu-ip-local]:3000`
  - `## Cómo obtener tu IP local`: subsections for Windows (`ipconfig | findstr IPv4`), macOS (`ipconfig getifaddr en0`), Linux (`ip a show | grep 'inet '`)
  - `## Cómo usar WatchJunto`: step-by-step: open lobby, set username, admin goes to `/admin.html`, creates room, generates invite link, share invite link, guests open link and join room, admin loads YouTube video, all sync
  - `## Panel de administrador`: path `/admin.html`, default password `admin123`, how to change via `ADMIN_PASSWORD` in `.env`
  - `## Links de invitación`: explain token format, 24h expiry, how guests use them
  - `## Limitaciones conocidas`: only YouTube (no DRM, no private videos), no persistence on server restart, no HTTPS (LAN-only by design), Chrome/Firefox recommended
  - `## Stack técnico`: brief table — Backend: Node.js + Express + Socket.IO, Frontend: HTML + CSS + Vanilla JS, Storage: In-memory Maps + localStorage
- [ ] Verify `client/index.html` has correct `<script>` load order: `app.js` first, then `socket.io.min.js`, then `lobby.js` — fix if incorrect
- [ ] Verify `client/room.html` has correct `<script>` load order: `app.js`, `socket.io.min.js`, `player.js`, `room.js` — fix if incorrect
- [ ] Verify `client/admin.html` has correct `<script>` load order: `app.js`, `socket.io.min.js`, `admin.js` — fix if incorrect
- [ ] Verify all `fetch()` calls in `admin.js` and `lobby.js` handle non-2xx HTTP responses (check `if (!res.ok) throw new Error(...)` pattern)
- [ ] Verify `server/index.js` `disconnect` handler properly iterates all rooms and cleans up: ensure the loop uses `for (const [roomId, room] of rooms)` and accesses the exported `rooms` Map from `rooms.js` — fix any scoping issues
- [ ] Verify mobile layout: inspect `client/css/room.css` that `@media (max-width: 768px)` block sets `.sidebar { display: none }` and `.chat-fab { display: flex }` — add if missing
- [ ] Verify `WJ.sanitize` is called before any user content is inserted into the DOM via `.innerHTML` in `lobby.js`, `room.js`, and `admin.js` — patch any call sites that use unsanitized string interpolation inside `innerHTML`
- [ ] Final syntax sweep: run `node --check server/auth.js && node --check server/rooms.js && node --check server/index.js && node --check client/js/app.js && node --check client/js/lobby.js && node --check client/js/room.js && node --check client/js/player.js && node --check client/js/admin.js`
- [ ] Start the server with `npm start` and verify it logs `[WJ] Server running at http://...` without throwing
- [ ] Build check: verify syntax with `node --check` on all server files and validate HTML structure (confirm each HTML file has `<!DOCTYPE html>` and closing `</html>`)
- [ ] Commit
