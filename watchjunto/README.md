# WatchJunto

App de watch-party self-hosted para red local. Mira videos de YouTube sincronizados con tus amigos en la misma red.

## Instalación y uso

### Requisitos
- Node.js 18 o superior

### Pasos

1. Instala las dependencias:
   ```
   npm install
   ```

2. Inicia el servidor:
   ```
   npm start
   ```

3. Abre en tu navegador:
   ```
   http://localhost:3000
   ```
   O desde otra computadora en la misma red:
   ```
   http://[tu-ip-local]:3000
   ```

## Cómo obtener tu IP local

**Windows:**
```
ipconfig | findstr "IPv4"
```

**macOS:**
```
ipconfig getifaddr en0
```

**Linux:**
```
ip a | grep 'inet ' | grep -v '127.0.0.1'
```

## Cómo usar WatchJunto

1. Abre `http://localhost:3000` en tu navegador
2. Ingresa tu nombre de usuario cuando se te pida
3. Para administrar la app, ve a `http://localhost:3000/admin.html`
4. En el panel admin, crea una sala y genera un link de invitación
5. Comparte el link con tus amigos (deben estar en la misma red local)
6. Cuando todos estén en la sala, pega una URL de YouTube en la barra superior
7. El video se sincronizará para todos los usuarios

## Panel de administrador

- Ruta: `/admin.html`
- Contraseña por defecto: `admin123`
- Para cambiar la contraseña, edita el archivo `.env`:
  ```
  ADMIN_PASSWORD=tu_nueva_contraseña
  ```

## Links de invitación

- Los links tienen el formato: `http://[ip-local]:3000/join/[token]`
- Cada token es válido por **24 horas**
- Los invitados solo necesitan abrir el link en su navegador
- El token se guarda automáticamente en su navegador

## Limitaciones conocidas

- Solo compatible con videos de YouTube (no funciona con videos privados ni con DRM)
- El estado del servidor no persiste — si reinicias el servidor, las salas y tokens se pierden
- Diseñado para red local únicamente (no tiene HTTPS por diseño)
- Se recomienda usar Chrome o Firefox

## Stack técnico

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express + Socket.IO |
| Frontend | HTML + CSS + Vanilla JS |
| Almacenamiento | Maps en memoria + localStorage |
| Player | YouTube IFrame API |
