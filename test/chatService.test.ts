import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/chats/chatRepository.js', () => ({
  default: {
    ensureByRoomId: vi.fn(),
    getMessages: vi.fn(),
    appendMessage: vi.fn(),
    pinMessage: vi.fn(),
    clearMessages: vi.fn()
  }
}))

vi.mock('../src/modules/rooms/roomRepository.js', () => ({
  default: {
    findById: vi.fn()
  }
}))

import chatService from '../src/modules/chats/chatService.js'
import chatRepository from '../src/modules/chats/chatRepository.js'
import roomRepository from '../src/modules/rooms/roomRepository.js'

const roomId = '507f1f77bcf86cd799439031'
const userId = '507f1f77bcf86cd799439032'

const roomFixture = () => ({
  id: roomId,
  name: 'room',
  isPrivate: false,
  accessCode: '',
  maxUsers: 4,
  hostId: userId,
  userIds: [userId],
  chatId: '507f1f77bcf86cd799439033',
  state: 'waiting' as const,
  genres: 'other' as const,
  contentUrl: 'https://example.com',
  playback: {
    isPlaying: false,
    positionMs: 0,
    updatedAt: new Date(),
    updatedBy: userId,
    version: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
})

describe('chatService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getOrCreateChat valida roomId', async () => {
    await expect(chatService.getOrCreateChat('123')).rejects.toMatchObject({ code: 'INVALID_ROOM_ID' })
  })

  it('getOrCreateChat falla si sala no existe', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(chatService.getOrCreateChat(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('getOrCreateChat retorna chat cuando sala existe', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    vi.mocked(chatRepository.ensureByRoomId).mockResolvedValue({ id: 'chat-1', roomId, messages: [] } as never)

    const result = await chatService.getOrCreateChat(roomId)
    expect(result.id).toBe('chat-1')
  })

  it('ensureChatAccess valida membresia', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue({ ...roomFixture(), userIds: [] })
    await expect(chatService.ensureChatAccess(roomId, userId)).rejects.toMatchObject({ code: 'ROOM_MEMBERSHIP_REQUIRED' })
  })

  it('getMessages valida limit', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    await expect(chatService.getMessages(roomId, 0)).rejects.toMatchObject({ code: 'INVALID_LIMIT' })
  })

  it('getMessages retorna mensajes del repositorio', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    vi.mocked(chatRepository.getMessages).mockResolvedValue([{ id: 'm1' }] as never)

    await expect(chatService.getMessages(roomId, 10)).resolves.toEqual([{ id: 'm1' }])
  })

  it('sendMessage valida contenido y tipo', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())

    await expect(chatService.sendMessage({ roomId, userId, content: '   ' })).rejects.toMatchObject({ code: 'EMPTY_MESSAGE' })

    await expect(chatService.sendMessage({
      roomId,
      userId,
      content: 'a'.repeat(501)
    })).rejects.toMatchObject({ code: 'MESSAGE_TOO_LONG' })

    await expect(chatService.sendMessage({
      roomId,
      userId,
      content: 'hola',
      type: 'otro' as never
    })).rejects.toMatchObject({ code: 'INVALID_MESSAGE_TYPE' })
  })

  it('sendMessage envia mensaje con type default text', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    vi.mocked(chatRepository.appendMessage).mockResolvedValue({ id: 'm1', content: 'hola' } as never)

    await expect(chatService.sendMessage({
      roomId,
      userId,
      content: ' hola '
    })).resolves.toEqual({ id: 'm1', content: 'hola' })

    expect(chatRepository.appendMessage).toHaveBeenCalledWith(roomId, userId, 'hola', 'text')
  })

  it('pinMessage valida messageId y existencia', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())

    await expect(chatService.pinMessage(roomId, 'xyz')).rejects.toMatchObject({ code: 'INVALID_MESSAGE_ID' })

    vi.mocked(chatRepository.pinMessage).mockResolvedValue(false)
    await expect(chatService.pinMessage(roomId, '507f1f77bcf86cd799439034')).rejects.toMatchObject({
      code: 'MESSAGE_NOT_FOUND'
    })
  })

  it('pinMessage y clearMessages ejecutan flujo feliz', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    vi.mocked(chatRepository.pinMessage).mockResolvedValue(true)
    vi.mocked(chatRepository.clearMessages).mockResolvedValue()

    await expect(chatService.pinMessage(roomId, '507f1f77bcf86cd799439034')).resolves.toBeUndefined()
    await expect(chatService.clearMessages(roomId)).resolves.toBeUndefined()
    expect(chatRepository.clearMessages).toHaveBeenCalledWith(roomId)
  })

  it('ensureChatAccess permite acceso cuando el usuario es miembro', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(roomFixture())
    await expect(chatService.ensureChatAccess(roomId, userId)).resolves.toBeUndefined()
  })
})

