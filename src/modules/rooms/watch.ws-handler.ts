import { AppError } from '../../shared/appError.js'
import roomService from './roomService.js'
import { publishWatchState, subscribeWatchState } from './watchSyncBus.js'

type WatchSocket = {
  readyState: number
  send: (data: string) => void
  close: () => void
  on(event: 'message', listener: (raw: unknown) => void | Promise<void>): void
  on(event: 'close', listener: () => void): void
}

type WatchEvent = 'play' | 'pause' | 'seek' | 'get_state'

const SOCKET_OPEN_STATE = 1
const roomWatchSockets = new Map<string, Set<WatchSocket>>()
const roomWatchSyncSubscriptions = new Map<string, () => Promise<void>>()
const roomSyncIntervals = new Map<string, NodeJS.Timeout>()
const WATCH_SYNC_INTERVAL_MS = Math.max(1000, Number(process.env.WATCH_SYNC_INTERVAL_MS ?? 5000))
const SYNC_DRIFT_THRESHOLD_MS = Number(process.env.SYNC_DRIFT_THRESHOLD_MS ?? 1000) // 1 segundo de desfase
const NUDGE_MAX_MS = Number(process.env.NUDGE_MAX_MS ?? 1000) // si el desfase está entre threshold y este, hacemos "nudge"
const BIG_DRIFT_MS = Number(process.env.BIG_DRIFT_MS ?? 5000) // si el desfase es mayor, forzamos full sync

const parseSocketPayload = (raw: unknown): string => {
  if (typeof raw === 'string') {
    return raw
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString()
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString()
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw.filter(Buffer.isBuffer)).toString()
  }

  throw new AppError(400, 'INVALID_PAYLOAD', 'Formato de mensaje no soportado')
}

const broadcastToRoom = (roomId: string, payload: unknown): void => {
  const sockets = roomWatchSockets.get(roomId)

  if (!sockets || sockets.size === 0) {
    return
  }

  const serialized = JSON.stringify(payload)
  for (const socket of sockets) {
    if (socket.readyState === SOCKET_OPEN_STATE) {
      socket.send(serialized)
    }
  }
}

const ensureRoomWatchSyncSubscription = async (roomId: string): Promise<void> => {
  if (roomWatchSyncSubscriptions.has(roomId)) {
    return
  }

  const unsubscribe = await subscribeWatchState(roomId, (playback) => {
    broadcastToRoom(roomId, {
      event: 'watch_state',
      data: playback
    })
  })

  roomWatchSyncSubscriptions.set(roomId, unsubscribe)
  await startRoomSyncInterval(roomId)
}

const releaseRoomWatchSyncSubscription = (roomId: string): void => {
  const unsubscribe = roomWatchSyncSubscriptions.get(roomId)
  if (!unsubscribe) {
    return
  }

  roomWatchSyncSubscriptions.delete(roomId)
  void unsubscribe().catch((error: unknown) => {
    console.error('[watch-sync] Error liberando suscripcion de sala', roomId, error)
  })
}

const startRoomSyncInterval = async (roomId: string): Promise<void> => {
   if (roomSyncIntervals.has(roomId)) {
     return
   }

   let lastBroadcastedPlayback = await roomService.getWatchState(roomId)

   const interval = setInterval(async () => {
     try {
       const currentPlayback = await roomService.getWatchState(roomId)
       const now = new Date()

       // Calcula la posición actual con exactitud
       let calculatedPositionMs = currentPlayback.positionMs
       const timeSinceLastUpdate = now.getTime() - currentPlayback.updatedAt.getTime()
       if (currentPlayback.isPlaying && timeSinceLastUpdate > 0) {
         calculatedPositionMs += timeSinceLastUpdate
       }

       // Calcula drift actual
       let lastBroadcastedPositionMs = lastBroadcastedPlayback.positionMs
       const timeSinceLastBroadcast = now.getTime() - lastBroadcastedPlayback.updatedAt.getTime()
       if (lastBroadcastedPlayback.isPlaying && timeSinceLastBroadcast > 0) {
         lastBroadcastedPositionMs += timeSinceLastBroadcast
       }

       const drift = Math.abs(calculatedPositionMs - lastBroadcastedPositionMs)

       // Solo sincroniza si:
       // 1. Hay cambio de estado (play/pause/seek)
       // 2. El desfase supera el threshold
       // 3. Es la sincronización de fallback (cada 30s aproximadamente)
       const stateChanged =
         currentPlayback.isPlaying !== lastBroadcastedPlayback.isPlaying ||
         currentPlayback.version !== lastBroadcastedPlayback.version

        if (stateChanged || drift > SYNC_DRIFT_THRESHOLD_MS) {
          // Si el desfase es pequeño/medio, preferimos hacer un "nudge" (ajuste suave)
          if (!stateChanged && drift <= NUDGE_MAX_MS) {
            // enviamos un ajuste incremental en ms para que el cliente lo aplique suavemente
            const adjustMs = Math.round(calculatedPositionMs - lastBroadcastedPositionMs)
            try {
              await publishWatchState(roomId, {
                // usamos un formato ligero indicando ajuste; el cliente puede interpretar
                // cuando viene 'adjustMs' como un nudge en lugar de un seek completo
                adjustMs,
                positionMs: calculatedPositionMs,
                updatedAt: now
              } as any)
            } catch (err) {
              console.error('[watch-sync] Error publicando nudge', roomId, err)
            }

            // no actualizamos lastBroadcastedPlayback para evitar considerar
            // este pequeño ajuste como la nueva referencia completa
          } else {
            // drift grande o cambio de estado: publicar estado completo (seek/play/pause)
            const playbackToPublish = {
              ...currentPlayback,
              positionMs: calculatedPositionMs,
              updatedAt: now
            }
            await publishWatchState(roomId, playbackToPublish)
            lastBroadcastedPlayback = playbackToPublish
          }
        }
     } catch (error) {
       console.error('[watch-sync] Error en sincronizacion on-demand de sala', roomId, error)
     }
   }, WATCH_SYNC_INTERVAL_MS) // Chequea cada 5s (default) para detectar desincronización

   roomSyncIntervals.set(roomId, interval)
}

const stopRoomSyncInterval = (roomId: string): void => {
  const interval = roomSyncIntervals.get(roomId)
  if (!interval) {
    return
  }

  clearInterval(interval)
  roomSyncIntervals.delete(roomId)
}

const sendError = (socket: WatchSocket, error: unknown): void => {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error procesando evento del socket')

  socket.send(JSON.stringify({
    event: 'error',
    code: appError.code,
    message: appError.message
  }))
}

export const handleWatchWebSocket = (socket: WatchSocket, roomId: string, userId: string): void => {
  const joinRoom = async (): Promise<void> => {
    try {
      await roomService.ensureUserInRoom(roomId, userId)
      const playback = await roomService.getWatchState(roomId)

      const sockets = roomWatchSockets.get(roomId) ?? new Set<WatchSocket>()
      sockets.add(socket)
      roomWatchSockets.set(roomId, sockets)
      await ensureRoomWatchSyncSubscription(roomId)

      socket.send(JSON.stringify({
        event: 'connected',
        roomId,
        userId,
        data: playback
      }))
    } catch (error) {
      sendError(socket, error)
      socket.close()
    }
  }

  socket.on('message', async (raw: unknown) => {
    try {
      const payload = JSON.parse(parseSocketPayload(raw)) as {
        event: WatchEvent
        positionMs?: number
      }

      if (payload.event === 'get_state') {
        const playback = await roomService.getWatchState(roomId)
        socket.send(JSON.stringify({
          event: 'watch_state',
          data: playback
        }))
        return
      }

      if (payload.event === 'play' || payload.event === 'pause' || payload.event === 'seek') {
        const playback = await roomService.updateWatchState(roomId, userId, {
          action: payload.event,
          positionMs: Number(payload.positionMs ?? 0)
        })

        await publishWatchState(roomId, playback)
        return
      }

      socket.send(JSON.stringify({
        event: 'error',
        code: 'INVALID_EVENT',
        message: 'Evento no soportado'
      }))
    } catch (error) {
      sendError(socket, error)
    }
  })

  socket.on('close', () => {
    const sockets = roomWatchSockets.get(roomId)
    if (!sockets) {
      return
    }

    sockets.delete(socket)
    if (sockets.size === 0) {
      roomWatchSockets.delete(roomId)
      releaseRoomWatchSyncSubscription(roomId)
      stopRoomSyncInterval(roomId)
    }
  })

  void joinRoom()
}

