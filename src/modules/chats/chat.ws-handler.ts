import { AppError } from '../../shared/appError.js'
import chatService from './chatService.js'
import type { CreateMessageInput } from './chat.js'

type ChatSocket = {
  readyState: number
  send: (data: string) => void
  close: () => void
  on(event: 'message', listener: (raw: unknown) => void | Promise<void>): void
  on(event: 'close', listener: () => void): void
}

const SOCKET_OPEN_STATE = 1

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

// --- Estado Global ---
const roomSockets = new Map<string, Set<ChatSocket>>()

// --- Utilidades ---
const broadcastToRoom = (roomId: string, payload: unknown): void => {
      const sockets = roomSockets.get(roomId)

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

const sendError = (socket: ChatSocket, error: unknown): void => {
      const appError = error instanceof AppError
        ? error
        : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error procesando evento del socket')

      socket.send(JSON.stringify({
        event: 'error',
        code: appError.code,
        message: appError.message
      }))
}

// --- Handler Principal ---
export const handleChatWebSocket = (socket: ChatSocket, roomId: string, userId: string): void => {
  const joinRoom = async (): Promise<void> => {
    try {
      await chatService.ensureChatAccess(roomId, userId)
      await chatService.getOrCreateChat(roomId)

      const sockets = roomSockets.get(roomId) ?? new Set<ChatSocket>()
      sockets.add(socket)
      roomSockets.set(roomId, sockets)

      socket.send(JSON.stringify({
        event: 'connected',
        roomId,
        userId
      }))
    } catch (error) {
      sendError(socket, error)
      socket.close()
    }
  }

  socket.on('message', async (raw: unknown) => {
    try {
      const payload = JSON.parse(parseSocketPayload(raw)) as {
        event: 'send_message' | 'get_history' | 'pin_message' | 'clear_messages'
        content?: string
        type?: 'text' | 'system' | 'reaction'
        messageId?: string
        limit?: number
      }

      // --- send_message ---
      if (payload.event === 'send_message') {
        const input: CreateMessageInput = {
          roomId,
          userId,
          content: payload.content ?? ''
        }

        if (payload.type) {
          input.type = payload.type
        }

        const message = await chatService.sendMessage(input)

        broadcastToRoom(roomId, {
          event: 'new_message',
          data: message
        })

        return
      }

      // --- get_history ---
      if (payload.event === 'get_history') {
        const limit = Number.isInteger(payload.limit) ? Number(payload.limit) : 50
        const messages = await chatService.getMessages(roomId, limit)

        socket.send(JSON.stringify({
          event: 'history',
          data: messages
        }))

        return
      }

      // --- pin_message ---
      if (payload.event === 'pin_message') {
        await chatService.pinMessage(roomId, payload.messageId ?? '')

        broadcastToRoom(roomId, {
          event: 'message_pinned',
          data: {
            messageId: payload.messageId
          }
        })

        return
      }

      // --- clear_messages ---
      if (payload.event === 'clear_messages') {
        await chatService.clearMessages(roomId)

        broadcastToRoom(roomId, {
          event: 'messages_cleared'
        })

        return
      }

      // --- evento desconocido ---
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
    const sockets = roomSockets.get(roomId)

    if (!sockets) {
      return
    }

    sockets.delete(socket)

    if (sockets.size === 0) {
      roomSockets.delete(roomId)
    }
  })

  void joinRoom()
}

