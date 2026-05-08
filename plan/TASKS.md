# Plan

## Problem

La app solo soporta reproducción sincronizada de YouTube via IFrame API. Dos problemas críticos: (1) algunos videos de YouTube tienen `embeddable: false` (F1 replays, deportes con licencia) causando error codes `101`/`150` sin fallback; (2) servicios premium (Netflix, Disney+, F1 TV Pro) bloquean iframes via `X-Frame-Options: DENY` y usan DRM Widevine, haciendo imposible su integración.

## Solution

Integrar reproducción HLS mediante `hls.js` con listas IPTV comunitarias (`.m3u`/`.m3u8`) que agregan miles de canales live y VOD sin DRM. El servidor actúa como proxy CORS para los streams. Se añade un gestor de listas IPTV en el admin, selector de fuente al crear salas, y browser de canales en la sala. YouTube se mejora con dominio `nocookie` y fallback de error.

---

### Feature 1: Admin IPTV List Manager

Backend service + CRUD routes + admin UI para gestionar listas IPTV. El admin puede añadir URLs de listas `.m3u`/`.m3u8`, el servidor las descarga y parsea, almacenando entradas en memoria. El cliente expone una nueva pestaña "Listas IPTV" en `AdminPage` con tabla CRUD completa.

  - [x] Instalar `iptv-playlist-parser` como dependencia en `apps/server/` — añadir a `apps/server/package.json` con `npm install iptv-playlist-parser` desde `apps/server/`
  - [x] Añadir interfaces `IPTVList` e `IPTVEntry` a `apps/server/src/types.ts` — `IPTVList`: `{ id: string; name: string; url: string; lastFetched: Date; entryCount: number; enabled: boolean }`, `IPTVEntry`: `{ name: string; url: string; group: string; logo?: string }`
  - [x] Crear `apps/server/src/services/iptv.ts` — estructura interna: `Map<string, { list: IPTVList; entries: IPTVEntry[] }>` exportado como `_iptvLists`; funciones exportadas: `getAllLists(): IPTVList[]`, `getListById(id): IPTVList | undefined`, `getEntries(id): IPTVEntry[]`, `addList(name, url): Promise<IPTVList>` (fetch URL + parsear con `iptv-playlist-parser` + guardar en Map), `updateList(id, name, url): Promise<IPTVList>` (re-fetch + re-parse), `deleteList(id): boolean`, `refreshList(id): Promise<IPTVList>` (re-fetch misma URL)
  - [x] Añadir 5 endpoints IPTV a `apps/server/src/routes/admin.ts` importando funciones de `../services/iptv`: `GET /iptv` → `adminAuth` → `res.json(getAllLists())`; `POST /iptv` → `adminAuth` → validar body `{ name, url }` → llamar `addList()` → devolver lista creada; `PUT /iptv/:id` → `adminAuth` → llamar `updateList()` → devolver lista actualizada; `DELETE /iptv/:id` → `adminAuth` → llamar `deleteList()` → `res.json({ ok: true })`; `POST /iptv/:id/refresh` → `adminAuth` → llamar `refreshList()` → devolver lista actualizada
  - [x] Crear `apps/server/src/routes/iptv.ts` — exportar `iptvRouter = Router()`; añadir `GET /:id/entries` con `auth` middleware que llama `getEntries(req.params.id)` y devuelve array; añadir `GET /proxy` con `auth` middleware que: valida que `req.query.url` sea string no vacío, extrae hostname del URL, verifica que el hostname esté en la lista blanca de dominios de los IPTV lists registrados (`getAllLists().some(l => new URL(l.url).hostname === requestedHostname)`), si no está en whitelist responde 403, si sí hace `https.get()` del URL real, pipe de la respuesta al cliente con headers `Cache-Control: max-age=5` y sin propagar Cookie/Authorization
  - [x] Registrar rutas en `apps/server/src/index.ts` — añadir `import { iptvRouter } from './routes/iptv'` y `app.use('/api/iptv', iptvRouter)` después de la línea de `searchRouter`
  - [x] Añadir interfaces `IPTVList` e `IPTVEntry` a `apps/client/src/types.ts` — `IPTVList`: `{ id: string; name: string; url: string; entryCount: number; enabled: boolean; lastFetched: string }`, `IPTVEntry`: `{ name: string; url: string; group: string; logo?: string }`
  - [x] Añadir objeto `iptvApi` a `apps/client/src/lib/api.ts` usando la instancia `api` existente — métodos: `listAll: () => api.get<IPTVList[]>('/api/admin/iptv')`, `add: (name, url) => api.post<IPTVList>('/api/admin/iptv', { name, url })`, `update: (id, data) => api.put<IPTVList>('/api/admin/iptv/${id}', data)`, `remove: (id) => api.delete('/api/admin/iptv/${id}')`, `refresh: (id) => api.post<IPTVList>('/api/admin/iptv/${id}/refresh')`, `getEntries: (id) => api.get<IPTVEntry[]>('/api/iptv/${id}/entries')`; importar `IPTVList, IPTVEntry` desde `../types`
  - [x] Crear `apps/client/src/components/IPTVListManager.tsx` — estado: `lists: IPTVList[]`, `loading: boolean`, `modalOpen: boolean`, `editTarget: IPTVList | null`, `modalName: string`, `modalUrl: string`; cargar listas en `useEffect` vía `iptvApi.listAll()`; tabla con columnas: Nombre, URL (truncada con `truncate` de Tailwind), Entradas, Activa (toggle que llama `iptvApi.update(id, { enabled: !list.enabled })`), acciones (botón refresh con `RotateCcw`, editar con `Pencil`, eliminar con `Trash2`); botón "Nueva lista" abre modal; modal reutilizado para crear/editar con inputs `name` y `url`; al guardar: si `editTarget` llama `iptvApi.update()`, si no llama `iptvApi.add()`; delete llama `window.confirm()` antes de `iptvApi.remove()` con toast resultado; refresh muestra toast `"Lista actualizada — X entradas"`
  - [x] En `apps/client/src/pages/AdminPage.tsx`: extender tipo `Tab` de `'rooms' | 'users' | 'connections' | 'tokens'` a incluir `'iptv'`; añadir botón de pestaña con icono `List` de `lucide-react` y label `"Listas IPTV"` en el array de tabs; añadir `{tab === 'iptv' && <IPTVListManager />}` en la sección de contenido de tabs; importar `IPTVListManager` desde `../components/IPTVListManager`; importar `List` desde `lucide-react`
  - [x] Build check: ejecutar `npm run build` en la raíz y verificar que no hay errores de TypeScript/compilación
  - [ ] Commit

---

### Feature 2: Room Creation Source Type Selection

Extender el modelo de sala con `sourceType` e `iptvListId`. Actualizar `CreateRoomModal` con selector de fuente en Step 1 (YouTube vs IPTV) y dropdown de lista IPTV en Step 2b. Propagar `sourceType` y `streamUrl` en eventos socket `sync-state` y `player-load`.

  - [x] Añadir `sourceType: 'youtube' | 'iptv'` e `iptvListId?: string` a la interfaz `Room` en `apps/server/src/types.ts`
  - [x] Añadir `sourceType: 'youtube' | 'iptv'` e `iptvListId?: string` a la interfaz `RoomListItem` en `apps/server/src/types.ts`
  - [x] Añadir `streamUrl: string | null` a la interfaz `PlayerState` en `apps/server/src/types.ts` para almacenar la URL del stream IPTV activo en el estado de la sala
  - [x] Extender payload de `ServerToClientEvents['sync-state']` en `apps/server/src/types.ts`: añadir `sourceType: 'youtube' | 'iptv'` y `streamUrl: string | null` al objeto del evento
  - [x] Actualizar `ClientToServerEvents['player-load']` en `apps/server/src/types.ts`: cambiar payload de `{ roomId: string; videoId: string }` a `{ roomId: string } & ({ type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string })`
  - [x] Actualizar función `createRoom()` en `apps/server/src/services/rooms.ts`: añadir parámetros `sourceType: 'youtube' | 'iptv' = 'youtube'` e `iptvListId?: string`; asignarlos al objeto `room`; inicializar `playerState.streamUrl = null`
  - [x] Actualizar función `getRoomList()` en `apps/server/src/services/rooms.ts`: incluir `sourceType: room.sourceType` e `iptvListId: room.iptvListId` en cada objeto `RoomListItem` del `.map()`
  - [x] Actualizar `updatePlayerState()` en `apps/server/src/services/rooms.ts`: el tipo `Partial<PlayerState>` ya acepta `streamUrl` al extender la interfaz; verificar que el patch se aplica correctamente con `Object.assign`
  - [x] Actualizar handler `POST /api/admin/rooms` en `apps/server/src/routes/admin.ts`: destructurar `sourceType` e `iptvListId` del `req.body`; pasarlos a `createRoom(name, maxUsers, isOpen, sourceType, iptvListId)`
  - [x] Actualizar handlers `join-room` y `request-sync` en `apps/server/src/socket/index.ts`: en la emisión de `sync-state`, incluir `sourceType: room.sourceType` y `streamUrl: room.playerState.streamUrl ?? null` junto a los campos existentes
  - [x] Actualizar handler `player-load` en `apps/server/src/socket/index.ts`: si `data.type === 'iptv'` llamar `updatePlayerState(roomId, { streamUrl: data.streamUrl, videoId: null, currentTime: 0, isPlaying: false })` y emitir `io.to(roomId).emit('player-load', { type: 'iptv', streamUrl: data.streamUrl })`; si `data.type === 'youtube'` mantener comportamiento actual pero emitir también `type: 'youtube'` en el payload; actualizar `ServerToClientEvents['player-load']` en `apps/server/src/types.ts` para aceptar union type `{ type: 'youtube'; videoId: string } | { type: 'iptv'; streamUrl: string }`
  - [x] Añadir `sourceType: 'youtube' | 'iptv'` e `iptvListId?: string` a la interfaz `Room` en `apps/client/src/types.ts`
  - [x] Actualizar `adminApi.createRoom()` en `apps/client/src/lib/api.ts`: añadir parámetros `sourceType: 'youtube' | 'iptv' = 'youtube'` e `iptvListId?: string`; incluirlos en el body del `api.post()`
  - [x] Reescribir `apps/client/src/components/CreateRoomModal.tsx`: añadir estados `step: 1 | 2`, `sourceType: 'youtube' | 'iptv'`, `selectedIptvListId: string`, `enabledLists: IPTVList[]`; en Step 1 renderizar dos botones card "🎬 YouTube" / "📺 Lista IPTV" que asignan `sourceType` y avanzan `step` a 2; en Step 2 mantener los campos actuales (nombre, maxUsers, isOpen) más, si `sourceType === 'iptv'`, un `<select>` con las listas enabled (cargadas vía `iptvApi.listAll()` al montar el modal); en `handleSubmit` pasar `sourceType` y `selectedIptvListId` a `adminApi.createRoom()`; importar `IPTVList` desde `../types` e `iptvApi` desde `../lib/api`
  - [x] Build check: ejecutar `npm run build` en la raíz y verificar que no hay errores de TypeScript/compilación
  - [ ] Commit

---

### Feature 3: In-Room IPTV Content Browser & Player

Nuevo hook `useHlsPlayer` que reutiliza la misma interfaz que `useYouTube`. Nuevo componente `IPTVBrowserModal` con browser de categorías y entradas. `RoomPage` renderiza condicionalmente el player HLS o YouTube según `room.sourceType`, y muestra badge "EN VIVO", overlay de error y botón "Cambiar canal".

  - [x] Instalar `hls.js` en `apps/client/` — ejecutar `npm install hls.js` desde `apps/client/`; verificar que aparece en `apps/client/package.json` como dependencia
  - [x] Crear `apps/client/src/hooks/useHlsPlayer.ts` — interfaz `UseHlsPlayerOptions { containerId: string; onPlay?: (t: number) => void; onPause?: (t: number) => void }`; usar `useRef<Hls | null>` para la instancia y `useRef<HTMLVideoElement | null>` para el elemento video (obtenido via `document.getElementById(containerId)`); función `loadStream(streamUrl: string)`: destruir Hls previo si existe, construir URL proxiada `/api/proxy?url=${encodeURIComponent(streamUrl)}`, crear `new Hls()`, llamar `hls.loadSource(proxiedUrl)` y `hls.attachMedia(videoEl)`; en `Hls.Events.LEVEL_LOADED` detectar si el manifest tiene `details.live === true` y actualizar estado `isLive`; en `Hls.Events.ERROR` con `data.fatal === true` actualizar estado `hlsError = true`; exponer `play(time)` (sets `videoEl.currentTime = time`, llama `videoEl.play()`), `pause(time)` (sets `videoEl.currentTime = time`, llama `videoEl.pause()`), `seek(time)` (sets `videoEl.currentTime = time`), `getCurrentTime()` (devuelve `videoEl.currentTime`); exponer `isLive: boolean`, `hlsError: boolean`, `retryStream()` (resetea `hlsError` y vuelve a llamar `loadStream` con el último URL); limpiar en `useEffect` return destruyendo la instancia Hls
  - [x] Crear `apps/client/src/components/IPTVBrowserModal.tsx` — props: `listId: string`, `open: boolean`, `onClose: () => void`, `onSelect: (streamUrl: string) => void`; usar `useEffect` con dep `[open, listId]` para cargar entradas vía `iptvApi.getEntries(listId)` cuando `open === true`; estado: `entries: IPTVEntry[]`, `loading: boolean`, `selectedGroup: string | 'all'`, `searchQuery: string`; left panel: lista de grupos únicos (`[...new Set(entries.map(e => e.group))]`) con "Todos" como primer ítem; right panel: entradas filtradas por `selectedGroup` (o todas si `'all'`) y `searchQuery` (case-insensitive sobre `entry.name`); cada fila muestra `<img src={entry.logo}>` con fallback `Tv` icon de lucide + nombre; al clic: `onSelect(entry.url)` seguido de `onClose()`; usar componente `Modal` de `../ui/Modal`; importar `IPTVEntry` de `../../types` e `iptvApi` de `../../lib/api`
  - [x] Actualizar `apps/client/src/pages/RoomPage.tsx`:
    - Añadir estados `currentStreamUrl: string | null` e `iptvBrowserOpen: boolean`
    - Importar `useHlsPlayer` desde `../hooks/useHlsPlayer` e `IPTVBrowserModal` desde `../components/IPTVBrowserModal`
    - Llamar `useHlsPlayer({ containerId: 'hls-player', onPlay: (t) => socket.emit('player-play', ...), onPause: (t) => socket.emit('player-pause', ...) })` siempre (hooks no condicionales); desestructurar `loadStream, play: hlsPlay, pause: hlsPause, seek: hlsSeek, getCurrentTime: hlsGetTime, isLive, hlsError, retryStream`
    - En el área de video: renderizar `<div id="yt-player" className="w-full h-full" />` solo si `room?.sourceType !== 'iptv'`; renderizar `<video id="hls-player" className="w-full h-full" />` solo si `room?.sourceType === 'iptv'`
    - En `onSyncState`: si `state.sourceType === 'iptv'` y `state.streamUrl`, llamar `setCurrentStreamUrl(state.streamUrl)` y `loadStream(state.streamUrl)`; si `state.sourceType === 'youtube'` mantener comportamiento actual
    - En `onPlayerLoad`: si payload `type === 'iptv'` llamar `setCurrentStreamUrl(data.streamUrl)` y `loadStream(data.streamUrl)`; si `type === 'youtube'` mantener `setCurrentVideoId(data.videoId)` y `loadVideo(data.videoId)`
    - Función `handleVideoSelect` para IPTV: `setCurrentStreamUrl(streamUrl)` y `socket.emit('player-load', { roomId: roomId!, type: 'iptv', streamUrl })`
    - En `handleResync`: si `room?.sourceType === 'iptv'` usar `hlsGetTime()` en lugar de `getCurrentTime()` de YouTube
    - En la barra inferior: si `room?.sourceType === 'iptv'` reemplazar el form de URL por un botón "Cambiar canal" que llama `setIptvBrowserOpen(true)`; ocultar el input de búsqueda de YouTube
    - Sobre el `<video id="hls-player">`: añadir badge "EN VIVO" (`<span className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">EN VIVO</span>`) condicionado a `isLive`
    - Overlay de error HLS: cuando `hlsError === true`, mostrar div absoluto centrado con texto "Error al cargar el stream" y botón "Reintentar" que llama `retryStream()`
    - Renderizar `<IPTVBrowserModal open={iptvBrowserOpen} onClose={() => setIptvBrowserOpen(false)} listId={room?.iptvListId ?? ''} onSelect={handleVideoSelect} />` condicionado a `room?.sourceType === 'iptv'`
  - [x] Build check: ejecutar `npm run build` en la raíz y verificar que no hay errores de TypeScript/compilación
  - [ ] Commit

---

### Feature 4: YouTube Embed Fallback

Cambiar el embed de YouTube a dominio `youtube-nocookie.com`. Añadir handler de error codes `101`/`150` con overlay de advertencia en `RoomPage`. Añadir campo `embeddable` en la respuesta de búsqueda del servidor y marcar visualmente videos no embeddables en `VideoSearchModal`.

  - [x] Actualizar `apps/client/src/hooks/useYouTube.ts` — añadir `onEmbedError?: (videoId: string) => void` a la interfaz `UseYouTubeOptions`; en la llamada `new window.YT.Player(containerId, { ..., playerVars: { ..., host: 'https://www.youtube-nocookie.com' } })` añadir la clave `host`; añadir handler `onError: (event: { data: number }) => { if (event.data === 101 || event.data === 150) { const videoId = playerRef.current?.getVideoData()?.video_id ?? ''; onEmbedError?.(videoId); } }` al objeto `events` del constructor del player
  - [x] Actualizar `apps/client/src/pages/RoomPage.tsx` — añadir estado `embedError: string | null`; pasar `onEmbedError: (videoId) => setEmbedError(videoId)` al hook `useYouTube`; en el área del player, cuando `embedError !== null`, renderizar overlay absoluto con mensaje "Este video no permite reproducción embebida. Abre YouTube directamente.", enlace `<a href={'https://youtu.be/' + embedError} target="_blank" rel="noopener noreferrer">` y botón "×" que ejecuta `setEmbedError(null)`; limpiar `embedError` al cargar un nuevo video en `onPlayerLoad`
  - [x] Añadir campo `embeddable?: boolean` a la interfaz local `VideoResult` en `apps/server/src/routes/search.ts`; en el proceso de mapping de resultados de YouTube asignar `embeddable: true` por defecto (o extraer el valor del campo `isPlayable`/`playabilityStatus` si está disponible en el JSON interno de la respuesta de YouTube scraping)
  - [x] Añadir `embeddable?: boolean` a la interfaz `VideoSearchResult` en `apps/client/src/types.ts`
  - [x] Actualizar `apps/client/src/components/VideoSearchModal.tsx` — en el renderizado de cada resultado de búsqueda, si `result.embeddable === false`: añadir badge semitransparente naranja sobre el thumbnail con texto "No embeddable" (`<span className="absolute bottom-1 left-1 bg-orange-500/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">`); reducir opacidad del card con `opacity-60`; añadir `title="Este video no permite reproducción embebida"` al elemento raíz del item
  - [x] Build check: ejecutar `npm run build` en la raíz y verificar que no hay errores de TypeScript/compilación
  - [x] Update README with new IPTV functionality description — añadir sección "Funcionalidades" con: soporte IPTV m3u8 con hls.js, proxy CORS server-side seguro, gestor de listas IPTV en el panel de admin, selector de fuente al crear salas, browser de canales/VOD en sala, badge EN VIVO para streams en directo, embed de YouTube vía youtube-nocookie.com con fallback de error
  - [ ] Commit
