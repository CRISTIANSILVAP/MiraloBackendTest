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

type WatchEvent = 'play' | 'pause' | 'seek' | 'get_state' | 'pong'

const SOCKET_OPEN_STATE = 1
const HEARTBEAT_INTERVAL_MS = 30000 // 30s
const roomWatchSockets = new Map<string, Set<WatchSocket>>()
const roomWatchSyncSubscriptions = new Map<string, () => Promise<void>>()
const roomSyncIntervals = new Map<string, NodeJS.Timeout>()
const roomHeartbeatIntervals = new Map<string, NodeJS.Timeout>()

// Fallback check interval: only detects state changes (play/pause/seek), never modifies position
const WATCH_SYNC_INTERVAL_MS = Math.max(30000, Number(process.env.WATCH_SYNC_INTERVAL_MS ?? 60000)) // 60s default


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
   startRoomHeartbeat(roomId)
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

       // === FALLBACK: Only sync on STATE CHANGES (play/pause/seek by other users) ===
       // Never send partial updates - those cause pause issues
       const stateChanged =
         currentPlayback.isPlaying !== lastBroadcastedPlayback.isPlaying ||
         currentPlayback.version !== lastBroadcastedPlayback.version

       if (stateChanged) {
         // State change detected (someone played/paused/seeked) - broadcast complete state
         await publishWatchState(roomId, currentPlayback)
         lastBroadcastedPlayback = currentPlayback
       }
     } catch (error) {
       console.error('[watch-sync] Error en fallback check de sala', roomId, error)
     }
   }, WATCH_SYNC_INTERVAL_MS)

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

const startRoomHeartbeat = (roomId: string): void => {
   if (roomHeartbeatIntervals.has(roomId)) {
     return
   }

   const heartbeat = setInterval(() => {
     const sockets = roomWatchSockets.get(roomId)
     if (!sockets || sockets.size === 0) {
       clearInterval(heartbeat)
       roomHeartbeatIntervals.delete(roomId)
       return
     }

     const ping = JSON.stringify({ event: 'ping' })
     for (const socket of sockets) {
       if (socket.readyState === SOCKET_OPEN_STATE) {
         try {
           socket.send(ping)
         } catch (error) {
           console.error('[watch-heartbeat] Error enviando ping', roomId, error)
         }
       }
     }
   }, HEARTBEAT_INTERVAL_MS)

   roomHeartbeatIntervals.set(roomId, heartbeat)
}

const stopRoomHeartbeat = (roomId: string): void => {
   const heartbeat = roomHeartbeatIntervals.get(roomId)
   if (!heartbeat) {
     return
   }

   clearInterval(heartbeat)
   roomHeartbeatIntervals.delete(roomId)
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
         event: WatchEvent | 'pong'
         positionMs?: number
       }

       if (payload.event === 'pong') {
         // Heartbeat response, connection is alive
         return
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

         // Publish immediately - this is the primary sync mechanism
         // Event-driven is much smoother than polling-based sync
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

     // Notify other users about disconnection
     if (sockets.size > 0) {
       broadcastToRoom(roomId, {
         event: 'user_disconnected',
         userId
       })
     } else {
       // If no users left, cleanup everything
       roomWatchSockets.delete(roomId)
       releaseRoomWatchSyncSubscription(roomId)
       stopRoomSyncInterval(roomId)
       stopRoomHeartbeat(roomId)
     }
   })
  void joinRoom()
}

