import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../../shared/appError.js'
import roomServiceModule from './roomService.js'
import type { RoomGenre } from './room.js'


type RoomUserParams = { roomId: string; id: string }
type RoomParams = { roomId: string }
type RoomUserQueryParams = { roomId: string; userId: string }
type UserParams = { userId: string }
type JoinRoomBody = { accessCode?: string }
type WatchAction = 'play' | 'pause' | 'seek'

type UpdateWatchBody = {
    userId: string
    action: WatchAction
    positionMs: number
}

export default class RoomController {
    constructor(
        private readonly roomService: typeof roomServiceModule
    ) {}

    getRooms = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        try {
            const rooms = await this.roomService.getRooms()
            reply.code(200).send(rooms)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    getRoomsByUser = async (
        request: FastifyRequest<{ Params: UserParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const userId = String(request.params.userId)
            const rooms = await this.roomService.getRoomsByUser(userId)
            reply.code(200).send(rooms)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    createRoom = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        try {
            const body = request.body as {
                name: string
                isPrivate: boolean
                accessCode?: string
                maxUsers: number
                hostId: string
                genres?: RoomGenre
                contentUrl: string
            }

            const room = await this.roomService.createRoom({
                ...body,
                accessCode: body.accessCode ?? '',
                genres: body.genres ?? 'other'
            })
            reply.code(201).send(room)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    joinRoom = async (
        request: FastifyRequest<{ Params: RoomUserParams; Body: JoinRoomBody }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const userId = String(request.params.id)
            const accessCode = request.body?.accessCode

            const result = await this.roomService.joinRoomForUser(userId, roomId, accessCode)
            reply.code(200).send(result)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    leaveRoom = async (
        request: FastifyRequest<{ Params: RoomUserParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const userId = String(request.params.id)

            const room = await this.roomService.leaveRoomForUser(userId, roomId)
            reply.code(200).send(room)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    getWatchState = async (
        request: FastifyRequest<{ Params: RoomParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const playback = await this.roomService.getWatchState(roomId)
            reply.code(200).send(playback)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    updateWatchState = async (
        request: FastifyRequest<{ Params: RoomParams; Body: UpdateWatchBody }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const userId = String(request.body.userId)
            const playback = await this.roomService.updateWatchState(roomId, userId, {
                action: request.body.action,
                positionMs: Number(request.body.positionMs)
            })

            reply.code(200).send(playback)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    getUsersGenres = async (
        request: FastifyRequest<{ Params: RoomParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const data = await this.roomService.getUsersGenres(roomId)
            // Devolver en formato { userId, favoriteGenre }
            reply.code(200).send(data)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    updateRoom = async (
        request: FastifyRequest<{
            Params: RoomUserQueryParams
            Body: {
                name?: string
                isPrivate?: boolean
                accessCode?: string
                maxUsers?: number
                genres?: RoomGenre
                contentUrl?: string
            }
        }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const userId = String(request.params.userId)

            await this.ensureRoomHost(roomId, userId)

            const room = await this.roomService.updateRoom(roomId, userId, request.body)
            reply.code(200).send(room)
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    deleteRoom = async (
        request: FastifyRequest<{ Params: RoomUserQueryParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
            const roomId = String(request.params.roomId)
            const userId = String(request.params.userId)

            await this.ensureRoomHost(roomId, userId)

            await this.roomService.deleteRoom(roomId, userId)
            reply.code(204).send()
        } catch (error) {
            this.handleError(error, reply)
        }
    }

    private async ensureRoomHost(roomId: string, userId: string): Promise<void> {
        const room = await this.roomService.getRoomById(roomId)

        if (!userId) {
            throw new AppError(400, 'INVALID_USER_ID', 'El userId es obligatorio')
        }

        if (room.hostId !== userId) {
            throw new AppError(403, 'ROOM_FORBIDDEN', 'Solo el host puede modificar la sala')
        }
    }

    private handleError(error: unknown, reply: FastifyReply): void {
        if (error instanceof AppError) {
            reply.code(error.statusCode).send({
                code: error.code,
                message: error.message
            })
            return
        }

        reply.code(500).send({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Ocurrio un error inesperado'
        })
    }

}

