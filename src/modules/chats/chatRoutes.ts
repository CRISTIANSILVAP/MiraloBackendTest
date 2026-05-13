import type { FastifyInstance } from 'fastify'
import ChatController from './chatController.js'
import chatService from './chatService.js'
import { handleChatWebSocket } from './chat.ws-handler.js'
import { AppError } from '../../shared/appError.js'

export default async function chatRoutes(fastify: FastifyInstance) {
  const chatController = new  ChatController(chatService)
  const objectIdRegex = /^[a-fA-F0-9]{24}$/

  // --- Rutas HTTP ---
  fastify.get('/rooms/:roomId/chat', chatController.getOrCreateChat)
  fastify.get('/rooms/:roomId/chat/messages', chatController.getMessages)
  fastify.post('/rooms/:roomId/chat/messages', chatController.sendMessage)
  fastify.patch('/rooms/:roomId/chat/messages/:messageId/pin', chatController.pinMessage)
  fastify.delete('/rooms/:roomId/chat/messages', chatController.clearMessages)

  // --- WebSocket ---
  fastify.get<{ Params: { roomId: string }; Querystring: { userId?: string } }>('/ws/rooms/:roomId/chat', { websocket: true }, (socket, request) => {
    try {
      const roomId = request.params.roomId
      const queryUserId = request.query?.userId?.trim()
      const jwtUserId = (request as any).user?.id
      const userId = queryUserId ?? jwtUserId

      if (!userId || !objectIdRegex.test(userId)) {
        throw new AppError(
          400,
          'INVALID_USER_ID',
          'Debe enviar un userId valido (ObjectId) por query (?userId=...) o autenticacion JWT'
        )
      }

      // Pasar socket y parámetros al handler
      handleChatWebSocket(socket, roomId, userId)
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error al conectar al WebSocket')

      socket.send(JSON.stringify({
        event: 'error',
        code: appError.code,
        message: appError.message
      }))

      socket.close()
    }
  })
}

