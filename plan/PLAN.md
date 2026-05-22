<CUSTOM_PLAN />

<DETAILED_PLAN>

## Problem Statement

Implement a hybrid multimedia synchronization architecture in WatchJunto to support two categories of video providers:
1. **Smart Sync providers**: Support postMessage API (e.g., Power Rangers) — full playback control (play/pause/seek) with real-time `currentTime` reporting.
2. **Passive Sync providers**: No external API (e.g., Coraje/cubeembed) — synchronization possible only at episode start time.

Critical decisions confirmed by stakeholder:
- **Host Takeover**: When the current host disconnects, automatically promote next user by earliest `joinedAt` order.
- **Smart Sync Permissions**: Any authenticated room participant can emit `player-action` (free-for-all model). Server validates only that the sender is an authenticated participant of the room, NOT that the sender is host.
- **Host Metadata**: Maintain the host concept for UI/metadata. Discrete host badge visible to ALL users (not just the host).
- **Socket.IO Type Safety**: Add missing events (`host-changed`, `series-episode-change`, etc.) to `ClientToServerEvents` and `ServerToClientEvents` for full type coverage.

## Current State (verified in code)

- `apps/client/src/hooks/useProviderDetection.ts`: capability detection with domain-based caching exists.
- `apps/client/src/hooks/useSmartSync.ts`: handles iframe postMessage for compatible providers (heartbeat, drift correction: <2s ignore, 2–5s silent seek, >5s seek + brief spinner).
- `apps/client/src/hooks/usePassiveSync.ts`: passive flow with `LoadingOverlay`, `PlayInstruction`, manual resync via `request-resync`.
- `apps/client/src/components/SyncProvider.tsx`: orchestrates sync mode selection (smart vs passive).
- `apps/server/src/socket/index.ts`: socket handlers for `client-ready`, `player-action`, `series-episode-change`, `start-playback`, `resync-state`, etc.
- `apps/server/src/services/rooms.ts`: room state with `readyUsers` set and 8s fallback timeout.
- `apps/server/src/types.ts`: defines `ClientToServerEvents`, `ServerToClientEvents`, `SocketData`.
- `apps/client/src/pages/RoomPage.tsx`: integrates `SyncProvider` into player container.

**Implementation gaps:**
- Host takeover logic (next-by-joinedAt) not implemented.
- Host badge currently only visible to the host; must be visible to all with subtle styling.
- `player-action` lacks strict server validation enforcing "any authenticated participant of room".
- Several emitted socket events are not in the typed interfaces (`host-changed` is missing; verify also `series-episode-change`).

## Target Architecture

**Four cooperating layers:**

1. **Provider Detection Layer** — auto-detect smart vs passive on iframe load, with 2s silent fallback to passive and domain-based cache.
2. **Smart Sync Layer (Free-for-All)** — any authenticated participant emits `player-action` (play/pause/seek); server broadcasts via `player-sync`. Host role used only for UI badge + metadata. Viewers apply silent drift correction.
3. **Passive Sync Layer (Coordinated Start)** — all participants emit `client-ready`; server waits for all-ready OR 8s timeout; server emits `start-playback` with synchronized `playAt`. Manual resync via `request-resync` → `resync-state`.
4. **Host Management Layer** — first joiner is host; on host disconnect server selects next user by earliest `joinedAt`; server broadcasts `host-changed`.

## Sequential Phases

### Phase 1 — Host Takeover Logic (Server)
**Goal:** Track current host and transfer on disconnect.

**Files:**
- `apps/server/src/services/rooms.ts`: add `hostUserId` and `hostUsername` to Room; implement `promoteNextHost(roomId)` selecting the user with earliest `joinedAt`.
- `apps/server/src/socket/index.ts`: in `disconnect`/`leave-room` handler, if departing user is host call `promoteNextHost` and broadcast `host-changed`.
- `apps/server/src/types.ts`: extend `Room` and `RoomUser` interfaces accordingly.

**New socket event (S→C):**
```ts
'host-changed': (data: {
  newHostUsername: string;
  newHostSocketId: string;
  previousHostUsername?: string;
}) => void;
```

**Acceptance criteria:**
- First joiner becomes host automatically.
- When host disconnects, next user (earliest `joinedAt`) is promoted.
- `host-changed` broadcast to room with new host info.
- `readyUsers` not affected by host change.

---

### Phase 2 — Strict Server-Side `player-action` Validation (Free-for-All)
**Goal:** Validate `player-action` only checks authenticated participant; not host-only.

**Files:**
- `apps/server/src/socket/index.ts`: update `player-action` handler to verify `socket.data.authenticated === true` AND `socket.data.roomId === payload.roomId`. Reject otherwise (emit `error` event). Forward via `player-sync` with latency compensation `adjustedTime = currentTime + (latencyMs / 2000)`.
- `apps/server/src/middleware/auth.ts`: ensure socket auth context populates `socket.data.userId`, `socket.data.username`, `socket.data.authenticated`.

**Acceptance criteria:**
- Non-host authenticated participants can emit play/pause/seek and others receive `player-sync`.
- Unauthenticated emits are rejected with `error` event.
- Host check is NOT performed for `player-action`.

---

### Phase 3 — Discrete Host Badge Visible to All
**Goal:** Show subtle "Host" indicator on player, visible to everyone.

**Files:**
- `apps/client/src/store.ts`: add `roomHostUsername` field; reducer/setter updated on `host-changed`.
- `apps/client/src/components/SyncProvider.tsx`: render badge based on `roomHostUsername`.
- `apps/client/src/pages/RoomPage.tsx`: register `host-changed` listener and dispatch store update; initialize host from `room-users` payload on join.
- `apps/server/src/socket/index.ts`: include `hostUsername` in `room-users` payload so newcomers know current host.

**UI spec:**
- Position: top-left of player, `z-20`, `pointer-events-none`.
- Style: small pill `bg-violet-700/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-full`, icon `Crown` from lucide-react (size 10), tooltip on host name.
- Visible to all users in room (no host-only gating).

**Acceptance criteria:**
- Badge always reflects current host.
- Updates instantly on `host-changed`.
- Style is discrete (does not overlap controls).

---

### Phase 4 — Socket.IO Type Safety Hardening
**Goal:** Full type coverage for emitted/received socket events.

**Files:**
- `apps/server/src/types.ts`: add missing events to `ClientToServerEvents` and `ServerToClientEvents`.
- `apps/client/src/lib/socket.ts`: mirror typed Socket.IO client using the same shared types.

**Events to verify/add:**
- S→C add: `host-changed`.
- C→S/S→C verify (and add if missing): `series-episode-change`, `client-ready`, `request-resync`, `resync-state`, `start-playback`, `player-sync`, `player-heartbeat`.

**Acceptance criteria:**
- `npx tsc --noEmit` passes on both `apps/server` and `apps/client` in strict mode.
- No `@ts-ignore` or `as any` in socket handlers.

---

### Phase 5 — Client Integration of Free-for-All + Host Badge
**Goal:** Wire everything in the UI without regressions.

**Files:**
- `apps/client/src/hooks/useSmartSync.ts`: remove any `isHost`-gated emit guards so any participant can emit `player-action`. Keep host info only for UI/badge.
- `apps/client/src/hooks/usePassiveSync.ts`: no functional change required; verify it works regardless of host status.
- `apps/client/src/pages/RoomPage.tsx`: subscribe to `host-changed`; pass current host info to `SyncProvider`.
- `apps/client/src/components/SyncProvider.tsx`: pass through `hostUsername` to badge.

**Acceptance criteria:**
- User A creates room → becomes host → badge "Host" visible to all.
- User B joins → both see badge on A.
- A disconnects → B promoted → badge moves to B for everyone.
- B emits play/pause/seek → A and others sync without permission errors.

---

### Phase 6 — Verification & Regression Pass
**Goal:** End-to-end manual + automated verification.

**Tasks:**
- Run `npx tsc --noEmit` in both apps.
- Run existing client tests in `apps/client/src/hooks/__tests__/`.
- Manual smoke: smart-sync provider (Power Rangers), passive provider (Coraje), forced disconnect of host.

## Socket Event Type Reference

```ts
// apps/server/src/types.ts (additions)

export interface ServerToClientEvents {
  // ...existing...
  'host-changed': (data: {
    newHostUsername: string;
    newHostSocketId: string;
    previousHostUsername?: string;
  }) => void;
}

export interface Room {
  // ...existing...
  hostUserId?: string;    // socket.id of current host
  hostUsername?: string;  // cached username
}

export interface RoomUser {
  username: string;
  joinedAt: Date; // used for host takeover ordering
}
```

## Global Acceptance Criteria

- Host takeover works end-to-end with no manual intervention.
- Any authenticated participant can drive smart-sync playback.
- Discrete host badge visible to all participants and updates live.
- TypeScript strict passes; no `any` in socket handlers.
- No regression in passive sync flow (LoadingOverlay, PlayInstruction, manual resync).

</DETAILED_PLAN>

<ORIGINAL_PLAN>

Implementar arquitectura híbrida de sincronización multimedia en WatchJunto.

## Contexto técnico confirmado

Dos tipos de providers detectados en producción:

SMART SYNC (postMessage funcional):
- Power Rangers y algunas series responden a postMessage
- Retornan currentTime, aceptan comandos play/pause/seek

PASSIVE SYNC (iframe cerrado):
- Coraje El Perro Cobarde (cubeembed) NO responde postMessage
- No tiene API de control externo
- Solo podemos sincronizar el momento de inicio

## 1. Detección automática de capacidades

Crear: hooks/useProviderDetection.ts

```typescript
const detectProviderCapabilities = async (
  iframeRef: RefObject<HTMLIFrameElement>
): Promise<'smart' | 'passive'> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('passive'), 2000);
    
    const handler = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve('smart');
      }
    };
    
    window.addEventListener('message', handler);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'ping', source: 'watchjunto' }, '*'
    );
  });
};
```

- Detección ocurre automáticamente al cargar el iframe
- Usuario nunca ve este proceso — solo ve spinner de carga
- Cachear resultado por provider domain para no repetir detección:
  const cache = new Map<string, 'smart' | 'passive'>();

## 2. SMART SYNC — providers compatibles

### Hook: hooks/useSmartSync.ts

```typescript
// Escuchar eventos del iframe
window.addEventListener('message', (e) => {
  const { type, currentTime } = e.data;
  
  switch(type) {
    case 'timeupdate':
      if (isHost) {
        socket.emit('player-action', { action: 'timeupdate', currentTime, roomId });
      }
      break;
    case 'play':
      socket.emit('player-action', { action: 'play', currentTime, roomId });
      break;
    case 'pause':
      socket.emit('player-action', { action: 'pause', currentTime, roomId });
      break;
  }
});

// Enviar comandos al iframe
const sendToPlayer = (command: string, value?: number) => {
  iframeRef.current?.contentWindow?.postMessage(
    { type: command, value, source: 'watchjunto' }, '*'
  );
};
```

### Drift silencioso cada 15 segundos
- Diferencia < 2s → ignorar completamente
- Diferencia 2-5s → seek silencioso sin interrumpir
- Diferencia > 5s → seek + micro spinner púrpura 1 segundo, 
  desaparece solo, sin texto

### Host mode
- Creador de la sala = host por defecto
- Host controla play/pause/seek, viewers siguen automáticamente
- Si host sale → siguiente usuario en sala se vuelve host automáticamente
- Badge discreto "Host" visible SOLO para el host mismo

## 3. PASSIVE SYNC — providers cerrados

### Hook: hooks/usePassiveSync.ts

### Estado del hook
```typescript
const userAlreadyPlaying = useRef(false);
const playInstructionTimer = useRef<NodeJS.Timeout>();
```

### Flujo completo

**Al seleccionar episodio:**
1. Servidor registra episodio
2. Todos los clientes cargan iframe simultáneamente
3. Mostrar LoadingOverlay con textos rotativos cada 2s:
   "Cargando..." → "Preparando episodio..." → "Casi listo..."
   Sin mencionar usuarios ni estados técnicos

**Ready state:**
```typescript
iframe.onload = () => {
  socket.emit('client-ready', { roomId, userId });
};
```

**Servidor — lógica de ready:**
```typescript
const allReady = room.users.every(u => room.readyUsers.has(u.id));

if (allReady) {
  const playAt = Date.now() + 2000;
  io.to(roomId).emit('start-playback', { 
    playAt, 
    serverNow: Date.now() 
  });
}

// Timeout: si alguien no está listo en 8s → iniciar igual
setTimeout(() => {
  if (!allReady) {
    io.to(roomId).emit('start-playback', { 
      playAt: Date.now() + 1000,
      serverNow: Date.now()
    });
  }
}, 8000);
```

**Cliente — al recibir start-playback:**
```typescript
socket.on('start-playback', ({ playAt, serverNow }) => {
  const offset = Date.now() - serverNow;
  const msUntilPlay = playAt - Date.now() + offset;

  // Resetear estado — nuevo episodio, nueva sincronía
  userAlreadyPlaying.current = false;
  setShowSpinner(false);

  playInstructionTimer.current = setTimeout(() => {
    // Verificar JUSTO ANTES de mostrar si ya está reproduciendo
    if (!userAlreadyPlaying.current) {
      showPlayInstruction();
    }
    // Si ya está reproduciendo → no mostrar nada, experiencia natural
  }, msUntilPlay);
});
```

### Detección de reproducción manual (antes del overlay)

```typescript
// Opción A — mensaje del iframe si lo emite
window.addEventListener('message', (e) => {
  if (e.source !== iframeRef.current?.contentWindow) return;
  const { type } = e.data;
  if (type === 'play' || type === 'timeupdate') {
    userAlreadyPlaying.current = true;
  }
});

// Opción B — fallback: primer click del usuario sobre el iframe
const handleUserInteraction = () => {
  userAlreadyPlaying.current = true;
};
// Overlay invisible pointer-events-auto sobre iframe durante countdown
// Se desmonta automáticamente al llegar el momento de play
```

Usar ambas opciones — la que dispare primero gana.

### Reset de estado — evitar race conditions

```typescript
const resetSyncState = () => {
  userAlreadyPlaying.current = false;
  clearTimeout(playInstructionTimer.current);
  setShowPlayInstruction(false);
  setShowSpinner(false);
};

// Llamar resetSyncState en:
useEffect(() => {
  return () => resetSyncState();
}, [embedUrl]); // embedUrl cambia = nuevo episodio

// También al recibir episode-change o request-resync del socket
```

### Passive resync manual
- Botón ResyncButton siempre visible
- Al presionar: modal con solo el timestamp estimado "⏱ 12:34"
- Sin explicaciones — el usuario busca ese minuto manualmente
- Cerrar con tap/click en cualquier lado del modal

## 4. Componentes a crear

### SyncProvider.tsx
```tsx
<SyncProvider 
  iframeSrc={embedUrl}
  roomId={roomId}
  isHost={isHost}
>
  {({ syncMode, controls }) => (
    <PlayerWithOverlay 
      syncMode={syncMode}
      controls={controls}
    />
  )}
</SyncProvider>
```

### LoadingOverlay.tsx
- Fondo negro con backdrop-blur suave
- Spinner circular fino color púrpura (#7c3aed)
- Texto rotativo centrado debajo
- Fade out suave al desaparecer (transition opacity 400ms)

### PlayInstruction.tsx
- Solo ícono Play de lucide-react, 80px, blanco
- Fondo rgba(0,0,0,0.6)
- Aparece 300ms antes del momento de play
- Animación: pulse suave 2 veces → fade out automático en 1.5s
- pointer-events: none — no bloquea clicks del usuario
- NO se muestra si userAlreadyPlaying.current === true

### ResyncButton.tsx
- Esquina inferior izquierda del player, siempre visible
- Solo ícono RefreshCw 14px, color white/50
- Hover: white/100, transición 150ms
- Smart sync → seek silencioso al tiempo del host
- Passive sync → modal con timestamp "⏱ MM:SS"

## 5. Eventos Socket.IO

C→S:
- client-ready { roomId, userId }
- player-action { roomId, action, currentTime, timestamp: Date.now() }
- request-resync { roomId }

S→C:
- start-playback { playAt, serverNow }
- player-sync { action, currentTime, serverNow }
- resync-state { currentTime, isPlaying, serverNow, syncMode }

</ORIGINAL_PLAN>
