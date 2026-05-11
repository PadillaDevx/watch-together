# Plan

## Problem

La aplicación watch-together tiene un sistema de reproducción básico (YouTube e IPTV) sin cola de reproducción, sin posibilidad de cambiar la fuente dentro de una sala activa, y sin integración con servidores de medios propios (Jellyfin). Los tipos de `PlayerState` y `Room` no tienen soporte para metadatos de reproducción (título, thumbnail), el middleware de socket no propaga el rol `isAdmin` al estado del socket (lo que bloquea la implementación de permisos), y los hooks `useYouTube` y `useHlsPlayer` no exponen el evento `onEnded`, impidiendo el auto-avance de cola.

## Solution

Se implementan tres fases encadenadas. **Fase A**: cola de reproducción en memoria, con handlers socket para añadir, eliminar, saltar y reordenar ítems, auto-avance al terminar el video, y UI de panel de cola con drag-and-drop para admin. **Fase B**: cambio de fuente en tiempo real dentro de la sala (`'youtube' | 'iptv' | 'movie'`), con reset de cola y estado al cambiar, selector en toolbar y soporte en `CreateRoomModal`. **Fase C**: integración con Jellyfin a través del proxy IPTV existente — servicio server-side para buscar y construir URLs proxificadas, rutas admin y de usuario, y modal de búsqueda en el cliente. La API key de Jellyfin nunca llega al cliente.

---

## Pre-work — Fix `isAdmin` en el middleware de socket

Prerequisito bloqueante para todas las comprobaciones de permisos de admin en la Fase A.

- [x] En `apps/server/src/types.ts`: añadir `isAdmin?: boolean` al interface `SocketData`
- [x] En `apps/server/src/socket/index.ts`: añadir `isAdminSession` al import existente de `../services/users` (junto a `validateSession` y `getUser`)
- [x] En `apps/server/src/socket/index.ts`: dentro del bloque `io.use(...)`, inmediatamente después de `socket.data.avatar = ...`, añadir `socket.data.isAdmin = isAdminSession(token)`
- [x] Build & syntax check
- [x] Commit

---

## Feature 1: Tipos nuevos (servidor y cliente)

Añadir todos los tipos necesarios para la cola, los metadatos de reproducción y los eventos socket antes de tocar cualquier lógica.

- [x] En `apps/server/src/types.ts`: añadir interface `QueueItem` con campos `id: string`, `type: 'youtube' | 'movie'`, `title: string`, `videoId?: string`, `streamUrl?: string`, `thumbnail?: string`, `addedBy: string`
- [x] En `apps/server/src/types.ts`: añadir `title: string | null` y `thumbnail: string | null` a la interface `PlayerState`
- [x] En `apps/server/src/types.ts`: añadir `queue: QueueItem[]` a la interface `Room`
- [x] En `apps/server/src/types.ts`: cambiar `sourceType: 'youtube' | 'iptv'` a `'youtube' | 'iptv' | 'movie'` en los interfaces `Room` y `RoomListItem`
- [x] En `apps/server/src/types.ts` — `ServerToClientEvents`: añadir `'queue-update': (queue: QueueItem[]) => void`; extender el payload de `'sync-state'` con `queue: QueueItem[]`, `title: string | null`, `thumbnail: string | null`; añadir `'source-switched': (data: { sourceType: 'youtube' | 'iptv' | 'movie'; iptvListId?: string }) => void`
- [x] En `apps/server/src/types.ts` — `ClientToServerEvents`: añadir `'queue-add'`, `'queue-remove'`, `'queue-next'`, `'queue-reorder'` y `'switch-source'` con sus payloads tal como describe el plan (`roomId`, `item: Omit<QueueItem, 'id'|'addedBy'>`, `itemId`, `fromIndex`, `toIndex`, `sourceType`, `iptvListId?`)
- [x] En `apps/client/src/types.ts`: añadir interface `QueueItem` (mismos campos que en servidor)
- [x] En `apps/client/src/types.ts`: añadir `queue: QueueItem[]` a `Room`; añadir `title: string | null` y `thumbnail: string | null` a `PlayerState`; cambiar `sourceType` de `Room` a `'youtube' | 'iptv' | 'movie'`
- [x] En `apps/client/src/types.ts`: añadir interface `JellyfinSearchResult` con `id: string`, `name: string`, `type: string`, `runtimeTicks?: number`, `imageUrl?: string`, `streamUrl: string`
- [x] Build & syntax check
- [x] Commit

---

## Feature 2: Servicio de sala — helpers de cola

Extender `apps/server/src/services/rooms.ts` con las funciones necesarias para manipular la cola y el nuevo campo `sourceType: 'movie'`.

- [x] En `createRoom`: añadir `queue: []` al objeto `Room` literal; cambiar el tipo del parámetro `sourceType` de `'youtube' | 'iptv'` a `'youtube' | 'iptv' | 'movie'`
- [x] Añadir `addToQueue(roomId: string, item: QueueItem): void` — recupera la sala con `_rooms.get(roomId)`; hace `room.queue.push(item)` si existe
- [x] Añadir `removeFromQueue(roomId: string, itemId: string): boolean` — busca el índice del ítem con `room.queue.findIndex(i => i.id === itemId)`, hace `splice` si lo encuentra, retorna `true`; retorna `false` si no se encuentra
- [x] Añadir `shiftQueue(roomId: string): QueueItem | undefined` — hace `room.queue.shift()`; si el ítem devuelto existe, llama `updatePlayerState(roomId, { title: item.title, thumbnail: item.thumbnail ?? null })` antes de retornar el ítem
- [x] Añadir `reorderQueue(roomId: string, fromIndex: number, toIndex: number): void` — valida que ambos índices estén dentro de `[0, room.queue.length - 1]`; extrae el elemento con `splice(fromIndex, 1)[0]`; lo inserta con `splice(toIndex, 0, element)`
- [x] Añadir `switchRoomSource(roomId: string, sourceType: 'youtube' | 'iptv' | 'movie', iptvListId?: string): boolean` — recupera la sala, asigna `room.sourceType` e `room.iptvListId`; resetea `room.playerState` a `{ videoId: null, streamUrl: null, currentTime: 0, isPlaying: false, updatedAt: Date.now(), title: null, thumbnail: null }`; limpia `room.queue = []`; retorna `true`; retorna `false` si la sala no existe
- [x] Actualizar los imports en `rooms.ts` para incluir `QueueItem` desde `../types`
- [x] Build & syntax check
- [x] Commit

---

## Feature 3: Handlers socket — cola y cambio de fuente

Añadir los handlers de socket en `apps/server/src/socket/index.ts` para gestionar la cola y el cambio de fuente.

- [x] Actualizar los imports de `rooms.ts` al inicio del archivo para incluir `addToQueue`, `removeFromQueue`, `shiftQueue`, `reorderQueue`, `switchRoomSource`
- [x] Actualizar las tres emisiones de `sync-state` (`join-room`, `request-sync`, `resync-all`) añadiendo `queue: room.queue`, `title: room.playerState.title ?? null`, `thumbnail: room.playerState.thumbnail ?? null` al objeto emitido
- [x] Añadir handler `'queue-add'`: (1) guard `!socket.data.authenticated → return`; (2) recuperar sala; (3) construir `QueueItem` con `id: crypto.randomUUID()` y `addedBy: socket.data.username!` a partir del payload; (4) llamar `addToQueue(roomId, newItem)`; (5) emitir `queue-update` con `room.queue` a `io.to(roomId)`
- [x] Añadir handler `'queue-remove'`: (1) guard autenticado; (2) recuperar sala; (3) encontrar ítem en `room.queue`; (4) check: `item.addedBy === socket.data.username || socket.data.isAdmin === true`, si no cumple emitir `error: { code: 'FORBIDDEN' }` y return; (5) llamar `removeFromQueue`; (6) emitir `queue-update` a `io.to(roomId)`
- [x] Añadir handler `'queue-next'`: (1) guard autenticado; (2) recuperar sala; (3) llamar `shiftQueue(roomId)`; (4) si no hay ítem emitir `queue-update(room.queue)` y return; (5) si `item.type === 'youtube'` → `updatePlayerState` con `{videoId, streamUrl: null, currentTime: 0, isPlaying: false}` + emitir `player-load {type:'youtube', videoId}`; si `item.type === 'movie'` → `updatePlayerState` con `{streamUrl, videoId: null, currentTime: 0, isPlaying: false}` + emitir `player-load {type:'iptv', streamUrl}`; (6) emitir `queue-update` con `room.queue` a `io.to(roomId)`
- [x] Añadir handler `'queue-reorder'`: (1) guard `socket.data.isAdmin !== true → error FORBIDDEN`; (2) recuperar sala; (3) validar índices en bounds; (4) llamar `reorderQueue`; (5) emitir `queue-update`
- [x] Añadir handler `'switch-source'`: (1) guard autenticado; (2) recuperar sala; (3) llamar `switchRoomSource(roomId, sourceType, iptvListId)`; (4) emitir `source-switched {sourceType, iptvListId}` a `io.to(roomId)`; (5) emitir `queue-update([])` a `io.to(roomId)`; (6) emitir `room-list` global con `io.emit('room-list', getRoomList())`
- [x] Build & syntax check
- [x] Commit

---

## Feature 4: Rutas admin — actualizar `createRoom` y tipo `sourceType`

Propagar el nuevo tipo `'movie'` a las rutas del servidor y a la API del cliente.

- [x] En `apps/server/src/routes/admin.ts`: en el handler `POST /api/admin/rooms`, cambiar el tipo anotado de `sourceType` en la destructuración de `req.body` de `'youtube' | 'iptv'` a `'youtube' | 'iptv' | 'movie'`; verificar que la llamada a `createRoom` lo pase sin cambios
- [x] En `apps/client/src/lib/api.ts`: en `adminApi.createRoom`, cambiar el tipo del parámetro `sourceType` de `'youtube' | 'iptv'` a `'youtube' | 'iptv' | 'movie'`
- [x] Build & syntax check
- [x] Commit

---

## Feature 5: Hooks — evento `onEnded`

Exponer `onEnded` en `useYouTube` y `useHlsPlayer` para que `RoomPage` pueda disparar el auto-avance de cola al terminar el video.

- [x] En `apps/client/src/hooks/useYouTube.ts`: añadir `onEnded?: () => void` al interface `UseYouTubeOptions`
- [x] En `apps/client/src/hooks/useYouTube.ts`: en el callback `onStateChange` del constructor `new window.YT.Player(...)`, añadir `if (e.data === window.YT.PlayerState.ENDED) { onEnded?.(); }` — colocarlo antes del bloque que consume el flag `isRemoteUpdate`
- [x] En `apps/client/src/hooks/useYouTube.ts`: añadir `onEnded` al array de dependencias del `useCallback` de `loadVideo` (o al ref estabilizador si lo hay)
- [x] En `apps/client/src/hooks/useHlsPlayer.ts`: añadir `onEnded?: () => void` al interface `UseHlsPlayerOptions`
- [x] En `apps/client/src/hooks/useHlsPlayer.ts`: crear un ref `onEndedRef = useRef(onEnded)` actualizado con `useEffect(() => { onEndedRef.current = onEnded }, [onEnded])` para evitar re-attachs; en el `useEffect` que adjunta los listeners `'play'` y `'pause'`, añadir `const handleEnded = () => onEndedRef.current?.(); video.addEventListener('ended', handleEnded);` y en el cleanup `video.removeEventListener('ended', handleEnded)`
- [x] Build & syntax check
- [x] Commit

---

## Feature 6: RoomPage — estado de cola, título y source-switch

Actualizar `apps/client/src/pages/RoomPage.tsx` con el nuevo estado, listeners de socket, barra de título, botón "Siguiente" y selector de fuente.

- [x] Añadir imports: `QueueItem` desde `../types`; `QueuePanel` desde `../components/QueuePanel` (creado en Feature 7)
- [x] Añadir estados: `const [queue, setQueue] = useState<QueueItem[]>([])`, `const [nowTitle, setNowTitle] = useState<string | null>(null)`, `const [nowThumbnail, setNowThumbnail] = useState<string | null>(null)`, `const [queueOpen, setQueueOpen] = useState(false)`, `const [activeSource, setActiveSource] = useState<'youtube' | 'iptv' | 'movie'>(room?.sourceType ?? 'youtube')`
- [x] Actualizar el tipo de `sourceTypeRef` de `useRef<'youtube' | 'iptv'>` a `useRef<'youtube' | 'iptv' | 'movie'>` y su valor inicial
- [x] Añadir `const isLiveRef = useRef<boolean>(false)` y actualizar `isLiveRef.current = isLive` dentro de un `useEffect([isLive])` (donde `isLive` viene de `useHlsPlayer`)
- [x] Definir `handleEnded` como `useCallback` que emite `socket.emit('queue-next', { roomId: roomId! })` solo si `!isLiveRef.current`; pasar `onEnded: handleEnded` a `useYouTube` y `useHlsPlayer`
- [x] En `onSyncState`: extraer y aplicar `queue`, `title`, `thumbnail` del payload → `setQueue(q)`, `setNowTitle(t)`, `setNowThumbnail(th)`
- [x] Registrar listener `socket.on('queue-update', q => setQueue(q))` dentro del `useEffect` de listeners de socket y limpiarlo en el cleanup
- [x] Registrar listener `socket.on('source-switched', data => { sourceTypeRef.current = data.sourceType; setActiveSource(data.sourceType); setQueue([]); setNowTitle(null); setNowThumbnail(null); })` y limpiarlo
- [x] Añadir barra de título encima del área del player: renderizar solo cuando `nowTitle !== null`; muestra `<img src={nowThumbnail}>` (si existe) y `<span>{nowTitle}</span>` con clases Tailwind apropiadas
- [x] Añadir botón "⏭ Siguiente" en el toolbar — visible solo cuando `queue.length > 0`; al hacer click emite `socket.emit('queue-next', { roomId: roomId! })`; usar el componente `Button` de `../components/ui/Button`
- [x] Añadir botón de cola en el toolbar que hace toggle de `queueOpen`; renderizar `<QueuePanel>` condicionalmente pasando `queue`, `roomId`, `currentUsername` (del store) e `isAdmin`
- [x] Añadir selector de fuente en el toolbar con 3 botones (`📺 TV`, `▶ YouTube`, `🎬 Movies`): YouTube y Movies emiten `socket.emit('switch-source', {roomId, sourceType})` directamente; TV verifica si la sala tiene `iptvListId` — si no, abre un selector de lista antes de emitir
- [x] Condicionar la visibilidad de los players según `activeSource`: mostrar `<div id="yt-player">` solo cuando `activeSource === 'youtube'`; mostrar `<video ref={videoRef}>` cuando `activeSource === 'iptv' || activeSource === 'movie'` (ambos hooks permanecen montados)
- [x] Build & syntax check
- [x] Commit

---

## Feature 7: Componente `QueuePanel`

Crear `apps/client/src/components/QueuePanel.tsx` — panel lateral de la cola de reproducción.

- [x] Definir props: `queue: QueueItem[]`, `roomId: string`, `currentUsername: string`, `isAdmin: boolean`; importar `socket` desde `../lib/socket` y `QueueItem` desde `../types`
- [x] Renderizar lista scrollable de ítems; cada ítem muestra: `<img src={item.thumbnail}>` (si existe, tamaño 48×28 px aprox.), `<span>{item.title}</span>`, `<span className="text-xs text-gray-400">{item.addedBy}</span>`
- [x] Añadir botón eliminar en cada ítem — visible si `item.addedBy === currentUsername || isAdmin`; al click emite `socket.emit('queue-remove', { roomId, itemId: item.id })`
- [x] Para usuarios admin, hacer ítems arrastrables usando atributos HTML5 nativos: `draggable`, `onDragStart` (guarda `fromIndex` en `event.dataTransfer.setData('text/plain', index)`), `onDragOver` (previene default para permitir drop), `onDrop` (extrae `fromIndex` de `dataTransfer`, calcula `toIndex`, emite `socket.emit('queue-reorder', { roomId, fromIndex, toIndex })`)
- [x] Estilizar con Tailwind: fondo oscuro, bordes, scroll vertical, indicador visual de drag activo
- [x] Build & syntax check
- [x] Commit

---

## Feature 8: Modales — botones "Play Now" y "+ Queue"

Actualizar `VideoSearchModal` e `IPTVBrowserModal` para soportar añadir a cola sin cerrar el modal.

- [ ] En `apps/client/src/components/VideoSearchModal.tsx`: en cada fila de resultado, reemplazar el botón único de acción por dos botones — **"▶ Play Now"** (emite `socket.emit('player-load', {roomId, type: 'youtube', videoId: result.videoId})` y cierra modal) y **"+ Queue"** (emite `socket.emit('queue-add', {roomId, item: {type: 'youtube', title: result.title, videoId: result.videoId, thumbnail: result.thumbnail}})` y muestra un toast breve sin cerrar el modal)
- [ ] En `apps/client/src/components/IPTVBrowserModal.tsx`: en cada entrada IPTV, reemplazar acción única por dos botones — **"▶ Play Now"** (comportamiento actual) y **"+ Queue"** (emite `socket.emit('queue-add', {roomId, item: {type: 'movie', title: entry.name, streamUrl: entry.url, thumbnail: entry.thumbnail ?? undefined}})` — nota: `entry.url` es la URL cruda, no proxificada; el servidor almacena la URL cruda)
- [ ] Implementar el toast de confirmación para "añadido a cola" en ambos modales (estado local `const [toastMsg, setToastMsg] = useState<string|null>(null)` + `useEffect` de 2s para limpiarlo) o reusar el mecanismo de toast existente si ya existe en el proyecto
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 9: `CreateRoomModal` — soporte `'movie'`

Añadir la opción de sala de tipo Jellyfin/Movies en el modal de creación de sala.

- [ ] En `apps/client/src/components/CreateRoomModal.tsx`: cambiar el tipo del estado `sourceType` de `'youtube' | 'iptv'` a `'youtube' | 'iptv' | 'movie'`
- [ ] En el paso 1 (selector de tipo de sala), añadir un tercer botón **"🎬 Movies (Jellyfin)"** que establece `sourceType = 'movie'`
- [ ] Cuando `sourceType === 'movie'`, en el paso 2 omitir el selector de lista IPTV y mostrar directamente el formulario de nombre/configuración de sala
- [ ] En la llamada final a `adminApi.createRoom`, asegurarse de que `sourceType: 'movie'` se pasa y que no se envía `iptvListId` cuando el tipo es `'movie'`
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 10: Proxy IPTV — exportar `trustHostname`

Prerequisito para que el servicio Jellyfin pueda agregar su hostname al allowlist del proxy.

- [ ] En `apps/server/src/routes/iptv.ts`: localizar el `Set<string>` privado `_discoveredCdnHostnames`
- [ ] Exportar una función nueva `export function trustHostname(hostname: string): void { _discoveredCdnHostnames.add(hostname); }` — añadirla justo después de la declaración del Set, sin modificar nada más del módulo
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 11: Servicio Jellyfin (servidor)

Crear `apps/server/src/services/jellyfin.ts` con toda la lógica de comunicación con el servidor Jellyfin.

- [ ] Crear el archivo con estado interno `let _config: { baseUrl: string; apiKey: string } | null = null`
- [ ] Implementar `setConfig(baseUrl: string, apiKey: string): void` — elimina slash final de `baseUrl`, guarda `_config`; llama `trustHostname(new URL(baseUrl).hostname)` importando `trustHostname` de `../routes/iptv`
- [ ] Implementar `getConfig(): { baseUrl: string; apiKey: string } | null` — retorna `_config`
- [ ] Implementar `testConnection(): Promise<{ok: boolean; serverName?: string; error?: string}>` — hace `GET {baseUrl}/System/Info` con header `X-Emby-Token: {apiKey}` usando `fetch` nativo de Node 18+ (o `https`/`http` si la versión del servidor no lo soporta); retorna `{ok: true, serverName: data.ServerName}` en HTTP 200, `{ok: false, error: string}` en cualquier error; no expone el `apiKey` en ninguna respuesta
- [ ] Definir tipo local `JellyfinSearchResult` con `{id: string; name: string; type: string; runtimeTicks?: number; hasPrimaryImage: boolean}`
- [ ] Implementar `searchItems(query: string, limit = 20): Promise<JellyfinSearchResult[]>` — URL: `{baseUrl}/Items?searchTerm={encodeURIComponent(query)}&IncludeItemTypes=Movie,Episode&Recursive=true&Fields=Overview,RunTimeTicks,ImageTags&Limit={limit}`; header `X-Emby-Token`; mapear `Items` al tipo local
- [ ] Implementar `buildProxiedStreamUrl(itemId: string): string` — construye `{baseUrl}/Videos/{itemId}/master.m3u8?api_key={apiKey}` y lo envuelve como `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`
- [ ] Implementar `buildProxiedImageUrl(itemId: string): string` — construye `{baseUrl}/Items/{itemId}/Images/Primary?api_key={apiKey}` y lo envuelve igual que el stream URL
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 12: Rutas Jellyfin (servidor)

Crear `apps/server/src/routes/jellyfin.ts` y registrarlo en `apps/server/src/index.ts`.

- [ ] Crear el archivo; importar `Router` de `express`, `adminAuth` y `sessionAuth` de `../middleware/auth`, las funciones del servicio Jellyfin
- [ ] Crear `adminRouter = Router()` y `userRouter = Router()`
- [ ] Implementar `POST /config` en `adminRouter` protegido por `adminAuth`: validar `baseUrl` y `apiKey` son strings no vacíos (400 si falta); llamar `setConfig`; llamar `testConnection()`; si falla → 400 `{error}`; si ok → 200 `{ok: true, serverName}` (nunca retornar `apiKey`)
- [ ] Implementar `GET /status` en `adminRouter` protegido por `adminAuth`: si `getConfig()` es null → `{configured: false}`; si no, llamar `testConnection()` y retornar `{configured: true, ok, serverName, baseUrl: config.baseUrl}` (sin `apiKey`)
- [ ] Implementar `GET /search` en `userRouter` protegido por `sessionAuth`: validar query param `q` — no vacío y `<= 100` chars (400 si inválido); si no configurado → 503; llamar `searchItems(q)`, añadir a cada resultado `imageUrl: buildProxiedImageUrl(item.id)` y `streamUrl: buildProxiedStreamUrl(item.id)`; retornar el array
- [ ] Implementar `GET /stream-url/:itemId` en `userRouter` protegido por `sessionAuth`: validar `itemId` con `/^[a-zA-Z0-9]+$/` (400 si inválido); si no configurado → 503; retornar `{streamUrl: buildProxiedStreamUrl(itemId)}`
- [ ] Exportar `{ adminRouter, userRouter }` desde el módulo
- [ ] En `apps/server/src/index.ts`: importar `{adminRouter as jellyfinAdminRouter, userRouter as jellyfinUserRouter}` desde `./routes/jellyfin`; añadir `app.use('/api/admin/jellyfin', jellyfinAdminRouter)` y `app.use('/api/jellyfin', jellyfinUserRouter)` junto a las demás rutas existentes
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 13: API cliente Jellyfin + UI Admin

Añadir los métodos de API al cliente y la sección de configuración en la página de admin.

- [ ] En `apps/client/src/lib/api.ts`: añadir grupo `jellyfinApi` con los métodos `saveConfig(baseUrl, apiKey)` → `POST /api/admin/jellyfin/config`, `getStatus()` → `GET /api/admin/jellyfin/status`, `search(q)` → `GET /api/jellyfin/search?q=`, `getStreamUrl(itemId)` → `GET /api/jellyfin/stream-url/{itemId}`; tipar las respuestas usando `JellyfinSearchResult` de `../../types`
- [ ] En `apps/client/src/pages/AdminPage.tsx`: añadir una sección o tab "Jellyfin" al lado de las secciones existentes
- [ ] En la sección Jellyfin de `AdminPage.tsx`: añadir estado local `const [jellyfinUrl, setJellyfinUrl] = useState('')`, `const [jellyfinKey, setJellyfinKey] = useState('')`, `const [jellyfinStatus, setJellyfinStatus] = useState<{configured: boolean; ok?: boolean; serverName?: string; baseUrl?: string} | null>(null)`
- [ ] Cargar el estado al montar la sección con `jellyfinApi.getStatus()` en un `useEffect`; mostrar badge: verde "Conectado a {serverName}" si `configured && ok`, rojo "No alcanzable" si `configured && !ok`, gris "No configurado" si `!configured`
- [ ] Renderizar input de texto para URL (placeholder `http://192.168.1.x:8096`) enlazado a `jellyfinUrl`; input `type="password"` para API key enlazado a `jellyfinKey` — nunca pre-poblar con datos del servidor
- [ ] Botón "Guardar & Verificar" que llama `jellyfinApi.saveConfig(jellyfinUrl, jellyfinKey)`; en éxito muestra toast verde con nombre del servidor y actualiza el badge; en error muestra toast rojo
- [ ] Build & syntax check
- [ ] Commit

---

## Feature 14: Modal `JellyfinBrowserModal` + integración en `RoomPage`

Crear el modal de búsqueda Jellyfin y conectarlo en la toolbar de la sala.

- [ ] Crear `apps/client/src/components/JellyfinBrowserModal.tsx`; props: `open: boolean`, `onClose: () => void`, `roomId: string`; importar `jellyfinApi` de `../lib/api`, `socket` de `../lib/socket`, `JellyfinSearchResult` de `../types`, el componente `Modal` de `./ui/Modal`
- [ ] Al abrir el modal (`open === true`), llamar `jellyfinApi.getStatus()` y si `!configured` mostrar inline: "Jellyfin no está configurado. Un administrador debe configurarlo en el panel de admin." sin mostrar el buscador
- [ ] Añadir input de búsqueda con debounce de 300ms; cuando el valor tenga `>= 2` caracteres llamar `jellyfinApi.search(q)` y actualizar estado `results`
- [ ] Renderizar resultados como grid responsive de tarjetas; cada tarjeta muestra: `<img src={item.imageUrl}>` (poster), `{item.name}` (título), duración calculada con `Math.floor((item.runtimeTicks ?? 0) / 600_000_000)` minutos
- [ ] En cada tarjeta, botón **"▶ Play"**: emite `socket.emit('player-load', {roomId, type: 'iptv', streamUrl: item.streamUrl})` y llama `onClose()`
- [ ] En cada tarjeta, botón **"+ Queue"**: emite `socket.emit('queue-add', {roomId, item: {type: 'movie', title: item.name, streamUrl: item.streamUrl, thumbnail: item.imageUrl}})` y muestra toast breve sin cerrar el modal
- [ ] En `apps/client/src/pages/RoomPage.tsx`: añadir `const [jellyfinOpen, setJellyfinOpen] = useState(false)`; añadir botón **"🎬"** en el toolbar que hace `setJellyfinOpen(true)`; renderizar `<JellyfinBrowserModal open={jellyfinOpen} onClose={() => setJellyfinOpen(false)} roomId={roomId!} />`
- [ ] Build & syntax check
- [ ] Commit
