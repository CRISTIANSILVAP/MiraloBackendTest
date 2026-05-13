import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/rooms/roomRepository.js', () => ({
  default: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addUser: vi.fn(),
    removeUser: vi.fn()
  }
}))

vi.mock('../src/modules/chats/chatService.js', () => ({
  default: {
    getOrCreateChat: vi.fn()
  }
}))

vi.mock('../src/modules/users/userRepository.js', () => ({
  default: {
    findById: vi.fn(),
    addFavoriteGenre: vi.fn()
  }
}))

import roomService from '../src/modules/rooms/roomService.js'
import roomRepository from '../src/modules/rooms/roomRepository.js'
import chatService from '../src/modules/chats/chatService.js'
import userRepository from '../src/modules/users/userRepository.js'
import { AppError } from '../src/shared/appError.js'

const hostId = '507f1f77bcf86cd799439011'
const roomId = '507f1f77bcf86cd799439012'

const createRoomFixture = () => ({
  id: roomId,
  name: 'Room test',
  isPrivate: false,
  accessCode: '',
  maxUsers: 5,
  hostId,
  userIds: [hostId],
  chatId: '',
  state: 'waiting' as const,
  genres: 'other' as const,
  contentUrl: 'https://example.com/video',
  playback: {
    isPlaying: false,
    positionMs: 0,
    updatedAt: new Date(),
    updatedBy: hostId,
    version: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
})

describe('roomService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getRooms retorna datos del repositorio', async () => {
    const rooms = [createRoomFixture()]
    vi.mocked(roomRepository.findAll).mockResolvedValue(rooms)

    await expect(roomService.getRooms()).resolves.toEqual(rooms)
  })

  it('getRoomById lanza ROOM_NOT_FOUND si no existe', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)

    await expect(roomService.getRoomById(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('createRoom valida hostId', async () => {
    await expect(roomService.createRoom({
      name: 'x',
      isPrivate: false,
      accessCode: '',
      maxUsers: 5,
      hostId: '123',
      genres: 'other',
      contentUrl: 'https://example.com'
    })).rejects.toMatchObject({ code: 'INVALID_HOST_ID' })
  })

  it('createRoom exige codigo en sala privada', async () => {
    await expect(roomService.createRoom({
      name: 'x',
      isPrivate: true,
      accessCode: '   ',
      maxUsers: 5,
      hostId,
      genres: 'other',
      contentUrl: 'https://example.com'
    })).rejects.toMatchObject({ code: 'ROOM_ACCESS_CODE_REQUIRED' })
  })

  it('createRoom valida maxUsers', async () => {
    await expect(roomService.createRoom({
      name: 'x',
      isPrivate: false,
      accessCode: '',
      maxUsers: 1,
      hostId,
      genres: 'other',
      contentUrl: 'https://example.com'
    })).rejects.toMatchObject({ code: 'ROOM_INVALID_MAX_USERS' })
  })

  it('createRoom crea sala, crea chat y enlaza chatId', async () => {
    const createdRoom = createRoomFixture()
    const linkedRoom = { ...createdRoom, chatId: '507f1f77bcf86cd799439013' }

    vi.mocked(roomRepository.create).mockResolvedValue(createdRoom)
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439013' } as never)
    vi.mocked(roomRepository.update).mockResolvedValue(linkedRoom)

    const result = await roomService.createRoom({
      name: 'Room',
      isPrivate: false,
      accessCode: '  abc  ',
      maxUsers: 6,
      hostId,
      genres: 'other',
      contentUrl: 'https://example.com/watch'
    })

    expect(roomRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      accessCode: 'abc',
      genres: 'other'
    }))
    expect(result.chatId).toBe('507f1f77bcf86cd799439013')
  })

  it('createRoom revierte si no puede enlazar chat', async () => {
    const createdRoom = createRoomFixture()
    vi.mocked(roomRepository.create).mockResolvedValue(createdRoom)
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439013' } as never)
    vi.mocked(roomRepository.update).mockResolvedValue(null)
    vi.mocked(roomRepository.delete).mockResolvedValue(true)

    await expect(roomService.createRoom({
      name: 'Room',
      isPrivate: false,
      accessCode: '',
      maxUsers: 6,
      hostId,
      genres: 'other',
      contentUrl: 'https://example.com/watch'
    })).rejects.toMatchObject({ code: 'ROOM_CHAT_LINK_FAILED' })

    expect(roomRepository.delete).toHaveBeenCalledWith(roomId)
  })

  it('createRoom revierte si falla chatService', async () => {
    const createdRoom = createRoomFixture()
    vi.mocked(roomRepository.create).mockResolvedValue(createdRoom)
    vi.mocked(chatService.getOrCreateChat).mockRejectedValue(new Error('chat down'))
    vi.mocked(roomRepository.delete).mockResolvedValue(true)

    await expect(roomService.createRoom({
      name: 'Room',
      isPrivate: false,
      accessCode: '',
      maxUsers: 6,
      hostId,
      genres: 'other',
      contentUrl: 'https://example.com/watch'
    })).rejects.toThrowError('chat down')

    expect(roomRepository.delete).toHaveBeenCalledWith(roomId)
  })

  it('validateJoinEligibility valida estados y codigo', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(roomService.validateJoinEligibility(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })

    vi.mocked(roomRepository.findById).mockResolvedValue({ ...createRoomFixture(), state: 'finished' })
    await expect(roomService.validateJoinEligibility(roomId)).rejects.toMatchObject({ code: 'ROOM_FINISHED' })

    vi.mocked(roomRepository.findById).mockResolvedValue({ ...createRoomFixture(), maxUsers: 1, userIds: [hostId] })
    await expect(roomService.validateJoinEligibility(roomId)).rejects.toMatchObject({ code: 'ROOM_FULL' })

    vi.mocked(roomRepository.findById).mockResolvedValue({ ...createRoomFixture(), isPrivate: true, accessCode: '1234' })
    await expect(roomService.validateJoinEligibility(roomId, '9999')).rejects.toMatchObject({ code: 'ROOM_INVALID_ACCESS_CODE' })
  })

  it('validateJoinEligibility retorna room cuando pasa validacion', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.validateJoinEligibility(roomId)).resolves.toEqual(room)
  })

  it('joinRoomForUser valida ids y usuario', async () => {
    await expect(roomService.joinRoomForUser('123', roomId)).rejects.toMatchObject({ code: 'INVALID_ID' })
    await expect(roomService.joinRoomForUser(hostId, '123')).rejects.toMatchObject({ code: 'INVALID_ID' })

    vi.mocked(userRepository.findById).mockResolvedValue(null)
    await expect(roomService.joinRoomForUser(hostId, roomId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('joinRoomForUser agrega usuario, genero favorito y retorna room+chat', async () => {
    const room = createRoomFixture()
    const user = {
      id: hostId,
      googleId: 'google-1',
      name: 'Alice',
      email: 'alice@example.com',
      favoriteGenres: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    vi.mocked(userRepository.findById).mockResolvedValue(user)
    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.addUser).mockResolvedValue(room)
    vi.mocked(userRepository.addFavoriteGenre).mockResolvedValue({ ...user, favoriteGenres: ['other'] })
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439013' } as never)

    const result = await roomService.joinRoomForUser(hostId, roomId, ' 1234 ')

    expect(userRepository.addFavoriteGenre).toHaveBeenCalledWith(hostId, 'other')
    expect(result.room).toEqual(room)
    expect(result.chat.id).toBe('507f1f77bcf86cd799439013')
  })

  it('leaveRoomForUser valida usuario y remueve de sala', async () => {
    const room = createRoomFixture()
    const user = {
      id: hostId,
      googleId: 'google-1',
      name: 'Alice',
      email: 'alice@example.com',
      favoriteGenres: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    vi.mocked(userRepository.findById).mockResolvedValue(user)
    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.removeUser).mockResolvedValue({ ...room, userIds: [] })

    await expect(roomService.leaveRoomForUser(hostId, roomId)).resolves.toEqual({ ...room, userIds: [] })
  })

  it('addUser y removeUser validan existencia de sala', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(roomService.addUser(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
    await expect(roomService.removeUser(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('addUser y removeUser retornan sala actualizada', async () => {
    const room = createRoomFixture()
    const updated = { ...room, userIds: [hostId, '507f1f77bcf86cd799439014'] }
    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.addUser).mockResolvedValue(updated)

    await expect(roomService.addUser(roomId, '507f1f77bcf86cd799439014')).resolves.toEqual(updated)

    vi.mocked(roomRepository.removeUser).mockResolvedValue(room)
    await expect(roomService.removeUser(roomId, '507f1f77bcf86cd799439014')).resolves.toEqual(room)
  })

  it('ensureUserInRoom valida membresia', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(roomService.ensureUserInRoom(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })

    vi.mocked(roomRepository.findById).mockResolvedValue({ ...createRoomFixture(), userIds: [] })
    await expect(roomService.ensureUserInRoom(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_FORBIDDEN' })
  })

  it('getWatchState valida existencia', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(roomService.getWatchState(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('updateWatchState valida posicion y actualiza reproduccion', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.updateWatchState(roomId, hostId, {
      action: 'play',
      positionMs: -1
    })).rejects.toMatchObject({ code: 'INVALID_POSITION_MS' })

    vi.mocked(roomRepository.update).mockResolvedValue({
      ...room,
      playback: {
        isPlaying: true,
        positionMs: 1234,
        updatedAt: new Date(),
        updatedBy: hostId,
        version: 1
      }
    })

    const playback = await roomService.updateWatchState(roomId, hostId, {
      action: 'play',
      positionMs: 1234.8
    })

    expect(playback.isPlaying).toBe(true)
    expect(playback.positionMs).toBe(1234)
    expect(roomRepository.update).toHaveBeenCalledWith(roomId, {
      playback: expect.objectContaining({
        isPlaying: true,
        updatedBy: hostId,
        version: 1
      })
    })
  })

  it('updateWatchState en seek conserva estado isPlaying previo', async () => {
    const room = {
      ...createRoomFixture(),
      playback: {
        ...createRoomFixture().playback,
        isPlaying: true,
        version: 5
      }
    }

    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.update).mockResolvedValue({
      ...room,
      playback: {
        isPlaying: true,
        positionMs: 999,
        updatedAt: new Date(),
        updatedBy: hostId,
        version: 6
      }
    })

    const result = await roomService.updateWatchState(roomId, hostId, {
      action: 'seek',
      positionMs: 999
    })

    expect(result.isPlaying).toBe(true)
  })

  it('updateWatchState lanza error si update falla', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(createRoomFixture())
    vi.mocked(roomRepository.update).mockResolvedValue(null)

    await expect(roomService.updateWatchState(roomId, hostId, {
      action: 'pause',
      positionMs: 50
    })).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('deleteRoom valida existencia y elimina', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)
    await expect(roomService.deleteRoom(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })

    vi.mocked(roomRepository.findById).mockResolvedValue(createRoomFixture())
    vi.mocked(roomRepository.delete).mockResolvedValue(true)

    await expect(roomService.deleteRoom(roomId)).resolves.toBeUndefined()
    expect(roomRepository.delete).toHaveBeenCalledWith(roomId)
  })

  it('lanza AppError para permitir assertions tipadas', () => {
    const error = new AppError(400, 'X', 'Y')
    expect(error.code).toBe('X')
  })
})

