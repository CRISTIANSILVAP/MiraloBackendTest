import { AppError } from '../../shared/appError.js'
import type { Chat, ChatMessage, CreateMessageInput, MessageType } from './chat.js'
import chatRepository from './chatRepository.js'
import roomRepository from '../rooms/roomRepository.js'
import type { Room } from '../rooms/room.js'

const VALID_MESSAGE_TYPES: MessageType[] = ['text', 'system', 'reaction']

const validateObjectId = (id: string | undefined, code: string, message: string): void => {
  if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
    throw new AppError(400, code, message)
  }
}

const ensureRoomExists = async (roomId: string): Promise<Room> => {
  const room = await roomRepository.findById(roomId)

  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
  }

  return room
}

const ensureRoomMembership = async (roomId: string, userId: string): Promise<void> => {
  const room = await ensureRoomExists(roomId)

  if (!room.userIds.includes(userId)) {
    throw new AppError(403, 'ROOM_MEMBERSHIP_REQUIRED', 'Debes unirte a la sala antes de chatear')
  }
}

const chatService = {
  async getOrCreateChat(roomId: string): Promise<Chat> {
    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    await ensureRoomExists(roomId)
    return chatRepository.ensureByRoomId(roomId)
  },

  async ensureChatAccess(roomId: string, userId: string): Promise<void> {
    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    validateObjectId(userId, 'INVALID_USER_ID', 'El userId debe ser un ObjectId valido')
    await ensureRoomMembership(roomId, userId)
  },

  async getMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    await ensureRoomExists(roomId)

    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new AppError(400, 'INVALID_LIMIT', 'El parametro limit debe estar entre 1 y 200')
    }

    return chatRepository.getMessages(roomId, limit)
  },

  async sendMessage(input: CreateMessageInput): Promise<ChatMessage> {
    const roomId = input.roomId?.trim()
    const userId = input.userId?.trim()
    const content = input.content?.trim()
    const type = input.type ?? 'text'

    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    validateObjectId(userId, 'INVALID_USER_ID', 'El userId debe ser un ObjectId valido')
    await ensureRoomMembership(roomId, userId)

    if (!content || content.length === 0) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'El contenido del mensaje es obligatorio')
    }

    if (content.length > 500) {
      throw new AppError(400, 'MESSAGE_TOO_LONG', 'El mensaje no puede superar 500 caracteres')
    }

    if (!VALID_MESSAGE_TYPES.includes(type)) {
      throw new AppError(400, 'INVALID_MESSAGE_TYPE', 'Tipo de mensaje no valido')
    }

    return chatRepository.appendMessage(roomId, userId, content, type)
  },

  async pinMessage(roomId: string, messageId: string): Promise<void> {
    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    await ensureRoomExists(roomId)

    if (!/^[a-fA-F0-9]{24}$/.test(messageId)) {
      throw new AppError(400, 'INVALID_MESSAGE_ID', 'El messageId debe ser un ObjectId valido')
    }

    const pinned = await chatRepository.pinMessage(roomId, messageId)

    if (!pinned) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Mensaje no encontrado en la sala')
    }
  },

  async clearMessages(roomId: string): Promise<void> {
    validateObjectId(roomId, 'INVALID_ROOM_ID', 'El roomId debe ser un ObjectId valido')
    await ensureRoomExists(roomId)
    await chatRepository.clearMessages(roomId)
  }
}

export default chatService
