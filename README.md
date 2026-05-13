# MIRALO-BACKEND

Backend de MIRALO para gestionar usuarios, rooms, chat y watchparty sincronizado.

## Estado actual del proyecto

Actualmente el backend tiene estos modulos activos:

- `users`: CRUD de usuarios y flujo de registro/login con token Google JWT.
- `rooms`: creacion/listado de salas, join/leave por room y estado de reproduccion compartido.
- `chats`: chat por sala (HTTP y WebSocket) con historial, pin y limpieza de mensajes.
- `watchparty`: sincronizacion de reproduccion por sala (`play`, `pause`, `seek`) por HTTP y WebSocket.

### Cambios funcionales importantes

- `join` y `leave` estan centralizados en `rooms`:
  - `POST /rooms/:roomId/users/:id/join`
  - `POST /rooms/:roomId/users/:id/leave`
- La room se crea con `contentUrl` (URL del contenido a sincronizar).
- El estado de reproduccion se guarda en la room (`playback`) con versionado.
- Se agrego un endpoint WebSocket unificado para chat + watchparty en una sola conexion.

## Stack tecnico

- Node.js + TypeScript
- Fastify
- `@fastify/websocket`
- MongoDB
- Vitest + cobertura V8

> Nota: la sincronizacion de `watch_state` usa Redis Pub/Sub y soporta fallback a memoria local por instancia.

## Estructura principal

- `src/miralo.ts`: punto de entrada, registro de plugins y rutas.
- `src/config/mongo.ts`: conexion a MongoDB e indices.
- `src/modules/users/*`: rutas, controlador, servicio y repositorio de usuarios.
- `src/modules/rooms/*`: rutas, controlador, servicio, repositorio y WS de watchparty.
- `src/modules/chats/*`: rutas, controlador, servicio, repositorio y WS de chat.
- `src/modules/realtime/*`: WS unificado para eventos de chat y watchparty.
- `src/shared/*`: utilidades compartidas (`AppError`, `JwtService`).
- `test/*.test.ts`: pruebas unitarias de servicios/core.

## API principal (resumen)

### Users

- `GET /users`
- `GET /users/:id`
- `POST /users/create`
- `PUT /users/:id`
- `DELETE /users/:id`

### Rooms

- `GET /rooms`
- `POST /rooms/create`
- `POST /rooms/:roomId/users/:id/join`
- `POST /rooms/:roomId/users/:id/leave`
- `GET /rooms/:roomId/watch-state`
- `PATCH /rooms/:roomId/watch-state`

### Chat (HTTP)

- `GET /rooms/:roomId/chat`
- `GET /rooms/:roomId/chat/messages`
- `POST /rooms/:roomId/chat/messages`
- `PATCH /rooms/:roomId/chat/messages/:messageId/pin`
- `DELETE /rooms/:roomId/chat/messages`

### WebSocket

Recomendado (una sola conexion por sala):

- Realtime: `ws://localhost:5000/ws/rooms/:roomId/realtime?userId=<USER_ID>`

Compatibilidad (endpoints separados):

- Watchparty: `ws://localhost:5000/ws/rooms/:roomId/watch?userId=<USER_ID>`
- Chat: `ws://localhost:5000/ws/rooms/:roomId/chat?userId=<USER_ID>`

Ejemplos de eventos para realtime:

```json
{ "event": "watch.play", "positionMs": 42000 }
```

```json
{ "event": "watch.pause", "positionMs": 43000 }
```

```json
{ "event": "chat.send_message", "content": "Hola a todos" }
```

```json
{ "event": "chat.get_history", "limit": 50 }
```

## Variables de entorno

Crea un archivo `.env` con base en `.env.example`:

```env
JWT_SECRET=super_secreto_largo
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=miralo
MONGO_DEBUG=true
REDIS_URL=redis://localhost:6379
WATCH_SYNC_MODE=redis-with-fallback
```

Valores de `WATCH_SYNC_MODE`:

- `redis`: modo estricto. Si Redis falla, no hay fallback y la app puede no iniciar.
- `redis-with-fallback` (default): intenta Redis y cae a memoria local si hay error.
- `memory`: usa solo memoria local (sin Redis).

## Como ejecutar en local

1. Instala dependencias:

```bash
npm install
```

2. Inicia en modo desarrollo:

```bash
npm run dev
```

3. El servidor corre en:

- `http://localhost:5000`

## Build y ejecucion en produccion local

1. Compilar TypeScript:

```bash
npm run build
```

2. Ejecutar compilado:

```bash
npm run start
```

## Tests y cobertura

Comandos disponibles:

```bash
npm run test
npm run test:watch
npm run test:coverage
```

Configuracion actual de cobertura en `vitest.config.mjs`:

- Umbral minimo global: `80%` en `lines`, `branches`, `functions`, `statements`.
- Cobertura enfocada en servicios y utilidades core (`userService`, `roomService`, `chatService`, `jwtService`, `appError`).

## Flujo rapido de prueba (Postman)

1. Crear 2 usuarios con `POST /users/create`.
2. Crear room con `POST /rooms/create` usando `hostId` del usuario A y `contentUrl`.
3. Unir usuario B con `POST /rooms/:roomId/users/:id/join`.
4. Conectar por WebSocket a `ws://localhost:5000/ws/rooms/:roomId/realtime?userId=<USER_ID>`.
5. Enviar eventos `watch.play` / `watch.pause` y `chat.send_message` para validar ambas funciones en una sola conexion.
6. Salir de la sala con `POST /rooms/:roomId/users/:id/leave`.
