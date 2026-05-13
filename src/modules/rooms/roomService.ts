import roomRepository, { CreateRoomInput } from './roomRepository.js'
import type { PlaybackState, Room, RoomGenre } from './room.js'
import { AppError } from '../../shared/appError.js'
import chatService from '../chats/chatService.js'
import userRepository from '../users/userRepository.js'
import type { Chat } from '../chats/chat.js'

        type WatchAction = 'play' | 'pause' | 'seek'

        type UpdateWatchStateInput = {
            action: WatchAction
            positionMs: number
        }

        type JoinRoomResult = {
            room: Room
            chat: Chat
        }

        const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/

        const validateObjectId = (id: string, code: string): void => {
            if (!OBJECT_ID_REGEX.test(id)) {
                throw new AppError(400, code, 'El id debe ser un ObjectId valido')
            }
        }

        const validateContentUrl = (value: string): string => {
            const normalized = value.trim()

            try {
                const parsed = new URL(normalized)
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    throw new AppError(400, 'ROOM_INVALID_CONTENT_URL', 'La URL del contenido debe ser http o https')
                }
            } catch {
                throw new AppError(400, 'ROOM_INVALID_CONTENT_URL', 'La URL del contenido no es valida')
            }

            return normalized
        }

        const normalizeGenre = (genre: RoomGenre | undefined): RoomGenre => {
            return genre ?? 'other'
        }


const roomService = {
    getRooms: (): Promise<Room[]> =>
        roomRepository.findAll(),

    getRoomById: async (id: string): Promise<Room> => {
        const room = await roomRepository.findById(id)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        return room
    },

    createRoom: async (data: CreateRoomInput): Promise<Room> => {
        validateObjectId(data.hostId, 'INVALID_HOST_ID')

        if (data.isPrivate && !data.accessCode?.trim()) {
            throw new AppError(400, 'ROOM_ACCESS_CODE_REQUIRED', 'Las salas privadas requieren un codigo de acceso')
        }
        if (data.maxUsers < 2 || data.maxUsers > 100) {
            throw new AppError(400, 'ROOM_INVALID_MAX_USERS', 'maxUsers debe estar entre 2 y 100')
        }

        const room = await roomRepository.create({
            ...data,
            accessCode: data.accessCode.trim(),
            genres: normalizeGenre(data.genres),
            contentUrl: data.contentUrl
        })

        try {
            const chat = await chatService.getOrCreateChat(room.id)
            const linkedRoom = await roomRepository.update(room.id, { chatId: chat.id })

            if (!linkedRoom) {
                throw new AppError(500, 'ROOM_CHAT_LINK_FAILED', 'No se pudo enlazar la sala con su chat')
            }

            return linkedRoom
        } catch (error) {
            // Evita dejar rooms huerfanas sin chat si falla la creacion del chat.
            await roomRepository.delete(room.id)
            throw error
        }
    },

    validateJoinEligibility: async (roomId: string, accessCode?: string): Promise<Room> => {
        const room = await roomRepository.findById(roomId)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        if (room.state === 'finished') throw new AppError(400, 'ROOM_FINISHED', 'La sala ya termino')
        if (room.userIds.length >= room.maxUsers) throw new AppError(400, 'ROOM_FULL', 'Sala llena')
        if (room.isPrivate && room.accessCode !== accessCode) {
            throw new AppError(403, 'ROOM_INVALID_ACCESS_CODE', 'Codigo de acceso incorrecto')
        }

        return room
    },

    joinRoomForUser: async (userId: string, roomId: string, accessCode?: string): Promise<JoinRoomResult> => {
        validateObjectId(userId, 'INVALID_ID')
        validateObjectId(roomId, 'INVALID_ID')

        const user = await userRepository.findById(userId)
        if (!user) {
            throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
        }

        await roomService.validateJoinEligibility(roomId, accessCode?.trim())
        const room = await roomService.addUser(roomId, user.id)

        const userWithGenre = await userRepository.addFavoriteGenre(user.id, room.genres)
        if (!userWithGenre) {
            throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
        }

        const chat = await chatService.getOrCreateChat(roomId)

        return {
            room,
            chat
        }
    },

    leaveRoomForUser: async (userId: string, roomId: string): Promise<Room> => {
        validateObjectId(userId, 'INVALID_ID')
        validateObjectId(roomId, 'INVALID_ID')

        const user = await userRepository.findById(userId)
        if (!user) {
            throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
        }

        return roomService.removeUser(roomId, user.id)
    },

    addUser: async (roomId: string, userId: string): Promise<Room> => {
        const room = await roomRepository.findById(roomId)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')

        const updatedRoom = await roomRepository.addUser(roomId, userId)
        if (!updatedRoom) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        return updatedRoom
    },

    removeUser: async (roomId: string, userId: string): Promise<Room> => {
        const room = await roomRepository.findById(roomId)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')

        const updatedRoom = await roomRepository.removeUser(roomId, userId)
        if (!updatedRoom) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        return updatedRoom
    },

    ensureUserInRoom: async (roomId: string, userId: string): Promise<Room> => {
        const room = await roomRepository.findById(roomId)
        if (!room) {
            throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        }

        if (!room.userIds.includes(userId)) {
            throw new AppError(403, 'ROOM_FORBIDDEN', 'El usuario no pertenece a la sala')
        }

        return room
    },

    getWatchState: async (roomId: string): Promise<PlaybackState> => {
        const room = await roomRepository.findById(roomId)
        if (!room) {
            throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        }

        return room.playback
    },

    /**
     * Devuelve para cada usuario de la sala su "género favorito".
     * Definimos el género favorito de un usuario como el que más aparece en su
     * lista `favoriteGenres`. Si la lista está vacía, se devuelve null.
     * Resultado: Array<{ userId: string, favoriteGenre: string | null }>
     */
    getUsersGenres: async (roomId: string): Promise<{ userId: string; favoriteGenre: string | null }[]> => {
        const room = await roomRepository.findById(roomId)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')

        // Traer todos los usuarios en paralelo (manteniendo el orden de userIds)
        const users = await Promise.all(room.userIds.map((id) => userRepository.findById(id)))

        const result: { userId: string; favoriteGenre: string | null }[] = []

        for (let i = 0; i < room.userIds.length; i++) {
            // Afirmamos que el índice existe (no null/undefined) porque el bucle
            // itera hasta room.userIds.length
            const userId = room.userIds[i]!
            const user = users[i]

            if (!user || !Array.isArray(user.favoriteGenres) || user.favoriteGenres.length === 0) {
                result.push({ userId, favoriteGenre: null })
                continue
            }

            // Calcular frecuencia por género dentro del usuario
            const counts: Record<string, number> = {}
            for (const g of user.favoriteGenres) {
                counts[g] = (counts[g] || 0) + 1
            }

            // Seleccionar el género con mayor frecuencia; en empate se elige el primero encontrado
            let topGenre: string | null = null
            let topCount = -1
            for (const [g, c] of Object.entries(counts)) {
                if (c > topCount) {
                    topCount = c
                    topGenre = g
                }
            }

            result.push({ userId, favoriteGenre: topGenre })
        }

        return result
    },

    updateWatchState: async (roomId: string, userId: string, input: UpdateWatchStateInput): Promise<PlaybackState> => {
        const room = await roomService.ensureUserInRoom(roomId, userId)

        if (!Number.isFinite(input.positionMs) || input.positionMs < 0) {
            throw new AppError(400, 'INVALID_POSITION_MS', 'positionMs debe ser un numero positivo')
        }

        const nextPlayback: PlaybackState = {
            isPlaying: input.action === 'play',
            positionMs: Math.floor(input.positionMs),
            updatedAt: new Date(),
            updatedBy: userId,
            version: room.playback.version + 1
        }

        if (input.action === 'seek') {
            nextPlayback.isPlaying = room.playback.isPlaying
        }

        const updatedRoom = await roomRepository.update(roomId, { playback: nextPlayback })
        if (!updatedRoom) {
            throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        }

        return updatedRoom.playback
    },

    deleteRoom: async (id: string): Promise<void> => {
        const room = await roomRepository.findById(id)
        if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
        await roomRepository.delete(id)
    }
}

export default roomService