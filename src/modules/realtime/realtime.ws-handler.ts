import { AppError } from '../../shared/appError.js'
import roomService from '../rooms/roomService.js'
import chatService from '../chats/chatService.js'
import type { MessageType } from '../chats/chat.js'
import { publishWatchState, subscribeWatchState } from '../rooms/watchSyncBus.js'

type RealtimeSocket = {
  readyState: number
  send: (data: string) => void
  close: () => void
  on(event: 'message', listener: (raw: unknown) => void | Promise<void>): void
  on(event: 'close', listener: () => void): void
}

type RealtimeEvent =
  | 'watch.get_state'
  | 'watch.play'
  | 'watch.pause'
  | 'watch.seek'
  | 'chat.get_history'
  | 'chat.send_message'
  | 'chat.pin_message'
  | 'chat.clear_messages'
  | 'get_state'
  | 'play'
  | 'pause'
  | 'seek'
  | 'get_history'
  | 'send_message'
  | 'pin_message'
  | 'clear_messages'

const SOCKET_OPEN_STATE = 1
const roomRealtimeSockets = new Map<string, Set<RealtimeSocket>>()
const roomWatchSyncSubscriptions = new Map<string, () => Promise<void>>()

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

const sendError = (socket: RealtimeSocket, error: unknown): void => {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error procesando evento del socket')

  socket.send(JSON.stringify({
    event: 'error',
    code: appError.code,
    message: appError.message
  }))
}

const broadcastToRoom = (roomId: string, payload: unknown): void => {
  const sockets = roomRealtimeSockets.get(roomId)

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
}

const releaseRoomWatchSyncSubscription = (roomId: string): void => {
  const unsubscribe = roomWatchSyncSubscriptions.get(roomId)
  if (!unsubscribe) {
    return
  }

  roomWatchSyncSubscriptions.delete(roomId)
  void unsubscribe().catch((error: unknown) => {
    console.error('[watch-sync] Error liberando suscripcion realtime de sala', roomId, error)
  })
}

const WATCH_EVENT_ACTION_MAP: Partial<Record<RealtimeEvent, 'play' | 'pause' | 'seek'>> = {
  'watch.play': 'play',
  'watch.pause': 'pause',
  'watch.seek': 'seek',
  play: 'play',
  pause: 'pause',
  seek: 'seek'
}

export const handleRealtimeWebSocket = (socket: RealtimeSocket, roomId: string, userId: string): void => {
  const joinRoom = async (): Promise<void> => {
    try {
      await roomService.ensureUserInRoom(roomId, userId)
      await chatService.getOrCreateChat(roomId)

      const playback = await roomService.getWatchState(roomId)
      const messages = await chatService.getMessages(roomId, 50)

      const sockets = roomRealtimeSockets.get(roomId) ?? new Set<RealtimeSocket>()
      sockets.add(socket)
      roomRealtimeSockets.set(roomId, sockets)
      await ensureRoomWatchSyncSubscription(roomId)

      socket.send(JSON.stringify({
        event: 'connected',
        roomId,
        userId,
        data: {
          playback,
          messages
        }
      }))
    } catch (error) {
      sendError(socket, error)
      socket.close()
    }
  }

  socket.on('message', async (raw: unknown) => {
    try {
      const payload = JSON.parse(parseSocketPayload(raw)) as {
        event: RealtimeEvent
        positionMs?: number
        content?: string
        type?: MessageType
        messageId?: string
        limit?: number
      }

      if (payload.event === 'watch.get_state' || payload.event === 'get_state') {
        const playback = await roomService.getWatchState(roomId)
        socket.send(JSON.stringify({
          event: 'watch_state',
          data: playback
        }))
        return
      }

      const watchAction = WATCH_EVENT_ACTION_MAP[payload.event]
      if (watchAction) {
        const playback = await roomService.updateWatchState(roomId, userId, {
          action: watchAction,
          positionMs: Number(payload.positionMs ?? 0)
        })

        await publishWatchState(roomId, playback)
        return
      }

      if (payload.event === 'chat.get_history' || payload.event === 'get_history') {
        const limit = Number.isInteger(payload.limit) ? Number(payload.limit) : 50
        const messages = await chatService.getMessages(roomId, limit)

        socket.send(JSON.stringify({
          event: 'history',
          data: messages
        }))
        return
      }

      if (payload.event === 'chat.send_message' || payload.event === 'send_message') {
        const messageInput: {
          roomId: string
          userId: string
          content: string
          type?: MessageType
        } = {
          roomId,
          userId,
          content: payload.content ?? ''
        }

        if (payload.type) {
          messageInput.type = payload.type
        }

        const message = await chatService.sendMessage(messageInput)

        broadcastToRoom(roomId, {
          event: 'new_message',
          data: message
        })
        return
      }

      if (payload.event === 'chat.pin_message' || payload.event === 'pin_message') {
        await chatService.pinMessage(roomId, payload.messageId ?? '')

        broadcastToRoom(roomId, {
          event: 'message_pinned',
          data: {
            messageId: payload.messageId
          }
        })
        return
      }

      if (payload.event === 'chat.clear_messages' || payload.event === 'clear_messages') {
        await chatService.clearMessages(roomId)

        broadcastToRoom(roomId, {
          event: 'messages_cleared'
        })
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
    const sockets = roomRealtimeSockets.get(roomId)
    if (!sockets) {
      return
    }

    sockets.delete(socket)
    if (sockets.size === 0) {
      roomRealtimeSockets.delete(roomId)
      releaseRoomWatchSyncSubscription(roomId)
    }
  })

  void joinRoom()
}

