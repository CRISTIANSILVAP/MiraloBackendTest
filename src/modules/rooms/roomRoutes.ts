import type { FastifyInstance } from 'fastify'
import RoomController from './roomController.js'
import roomService from './roomService.js'
import { handleWatchWebSocket } from './watch.ws-handler.js'
import { handleRealtimeWebSocket } from '../realtime/realtime.ws-handler.js'
import { AppError } from '../../shared/appError.js'

export default async function roomRoutes(fastify: FastifyInstance) {
    const controller = new RoomController(roomService)
    const objectIdRegex = /^[a-fA-F0-9]{24}$/

    fastify.get('/rooms', controller.getRooms)
    fastify.post('/rooms/create', controller.createRoom)

    fastify.post('/rooms/:roomId/users/:id/join', controller.joinRoom)
    fastify.post('/rooms/:roomId/users/:id/leave', controller.leaveRoom)

    // Obtener lista de géneros favoritos de los usuarios dentro de una sala
    fastify.get('/rooms/:roomId/users/genres', controller.getUsersGenres)

    fastify.get('/rooms/:roomId/watch-state', controller.getWatchState)
    fastify.patch('/rooms/:roomId/watch-state', controller.updateWatchState)

    fastify.get<{ Params: { roomId: string }; Querystring: { userId?: string } }>(
        '/ws/rooms/:roomId/realtime',
        { websocket: true },
        (socket, request) => {
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

                handleRealtimeWebSocket(socket, roomId, userId)
            } catch (error) {
                const appError = error instanceof AppError
                    ? error
                    : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error al conectar al WebSocket realtime')

                socket.send(JSON.stringify({
                    event: 'error',
                    code: appError.code,
                    message: appError.message
                }))

                socket.close()
            }
        }
    )

    fastify.get<{ Params: { roomId: string }; Querystring: { userId?: string } }>(
        '/ws/rooms/:roomId/watch',
        { websocket: true },
        (socket, request) => {
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

                handleWatchWebSocket(socket, roomId, userId)
            } catch (error) {
                const appError = error instanceof AppError
                    ? error
                    : new AppError(500, 'INTERNAL_SERVER_ERROR', 'Error al conectar al WebSocket de watch party')

                socket.send(JSON.stringify({
                    event: 'error',
                    code: appError.code,
                    message: appError.message
                }))

                socket.close()
            }
        }
    )
}