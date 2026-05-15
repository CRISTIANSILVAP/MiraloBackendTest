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

  it('getUsersGenres lanza ROOM_NOT_FOUND si la sala no existe', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)

    await expect(roomService.getUsersGenres(roomId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('getUsersGenres conserva el orden y calcula el genero favorito por usuario', async () => {
    const room = {
      ...createRoomFixture(),
      userIds: [hostId, '507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016']
    }

    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(userRepository.findById)
      .mockResolvedValueOnce({
        id: hostId,
        googleId: 'google-1',
        name: 'Alice',
        email: 'alice@example.com',
        favoriteGenres: ['action', 'action', 'comedy'],
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .mockResolvedValueOnce({
        id: '507f1f77bcf86cd799439014',
        googleId: 'google-2',
        name: 'Bob',
        email: 'bob@example.com',
        favoriteGenres: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: '507f1f77bcf86cd799439016',
        googleId: 'google-4',
        name: 'Diana',
        email: 'diana@example.com',
        favoriteGenres: ['thriller', 'comedy', 'thriller', 'comedy'],
        createdAt: new Date(),
        updatedAt: new Date()
      })

    await expect(roomService.getUsersGenres(roomId)).resolves.toEqual([
      { userId: hostId, favoriteGenre: 'action' },
      { userId: '507f1f77bcf86cd799439014', favoriteGenre: null },
      { userId: '507f1f77bcf86cd799439015', favoriteGenre: null },
      { userId: '507f1f77bcf86cd799439016', favoriteGenre: 'thriller' }
    ])
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
    await expect(roomService.deleteRoom(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })

    vi.mocked(roomRepository.findById).mockResolvedValue(createRoomFixture())
    vi.mocked(roomRepository.delete).mockResolvedValue(true)

    await expect(roomService.deleteRoom(roomId, hostId)).resolves.toBeUndefined()
    expect(roomRepository.delete).toHaveBeenCalledWith(roomId)
  })

  it('lanza AppError para permitir assertions tipadas', () => {
    const error = new AppError(400, 'X', 'Y')
    expect(error.code).toBe('X')
  })

  it('getRoomById retorna la room cuando existe', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.getRoomById(roomId)).resolves.toEqual(room)
  })

  it('createRoom normaliza genres indefinido a "other"', async () => {
    const createdRoom = createRoomFixture()
    const linkedRoom = { ...createdRoom, chatId: '507f1f77bcf86cd799439013' }

    vi.mocked(roomRepository.create).mockResolvedValue(createdRoom)
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439013' } as never)
    vi.mocked(roomRepository.update).mockResolvedValue(linkedRoom)

    // Usamos any para poder omitir la propiedad types criptas en el literal
    await roomService.createRoom({
      name: 'Room',
      isPrivate: false,
      accessCode: '  ',
      maxUsers: 6,
      hostId,
      genres: undefined,
      contentUrl: 'https://example.com/watch'
    } as any)

    expect(roomRepository.create).toHaveBeenCalledWith(expect.objectContaining({ genres: 'other' }))
  })

  it('joinRoomForUser lanza USER_NOT_FOUND si addFavoriteGenre devuelve null', async () => {
    const room = createRoomFixture()
    const user = { id: hostId } as any

    vi.mocked(userRepository.findById).mockResolvedValue(user)
    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.addUser).mockResolvedValue(room)
    vi.mocked(userRepository.addFavoriteGenre).mockResolvedValue(null)
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439013' } as never)

    await expect(roomService.joinRoomForUser(hostId, roomId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('leaveRoomForUser lanza USER_NOT_FOUND si usuario no existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null)
    await expect(roomService.leaveRoomForUser(hostId, roomId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('addUser y removeUser lanzan si repo retorna null', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    vi.mocked(roomRepository.addUser).mockResolvedValue(null)
    await expect(roomService.addUser(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })

    vi.mocked(roomRepository.removeUser).mockResolvedValue(null)
    await expect(roomService.removeUser(roomId, hostId)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })

  it('getWatchState retorna playback cuando existe', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.getWatchState(roomId)).resolves.toEqual(room.playback)
  })

  it('updateRoom lanza ROOM_NOT_FOUND si la sala no existe', async () => {
    vi.mocked(roomRepository.findById).mockResolvedValue(null)

    await expect(roomService.updateRoom(roomId, hostId, { name: 'New Name' })).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND'
    })
  })

  it('updateRoom lanza ROOM_FORBIDDEN si no es el host', async () => {
    const room = createRoomFixture()
    const otherUserId = '507f1f77bcf86cd799439099'

    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.updateRoom(roomId, otherUserId, { name: 'Hack' })).rejects.toMatchObject({
      code: 'ROOM_FORBIDDEN'
    })
  })

  it('updateRoom exige accessCode si se cambia a privada', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.updateRoom(roomId, hostId, { isPrivate: true, accessCode: '   ' })).rejects.toMatchObject({
      code: 'ROOM_ACCESS_CODE_REQUIRED'
    })
  })

  it('updateRoom valida maxUsers', async () => {
    const room = createRoomFixture()
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.updateRoom(roomId, hostId, { maxUsers: 1 })).rejects.toMatchObject({
      code: 'ROOM_INVALID_MAX_USERS'
    })

    await expect(roomService.updateRoom(roomId, hostId, { maxUsers: 101 })).rejects.toMatchObject({
      code: 'ROOM_INVALID_MAX_USERS'
    })
  })

  it('updateRoom no permite reducir maxUsers por debajo del numero de usuarios actuales', async () => {
    const room = {
      ...createRoomFixture(),
      userIds: [hostId, '507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015']
    }
    vi.mocked(roomRepository.findById).mockResolvedValue(room)

    await expect(roomService.updateRoom(roomId, hostId, { maxUsers: 2 })).rejects.toMatchObject({
      code: 'ROOM_MAX_USERS_TOO_LOW'
    })
  })

  it('updateRoom actualiza nombre, privacidad, maxUsers, genero y contentUrl', async () => {
    const room = createRoomFixture()
    const updated = {
      ...room,
      name: 'Updated Room',
      isPrivate: true,
      accessCode: 'secret123',
      maxUsers: 10,
      genres: 'horror' as const,
      contentUrl: 'https://example.com/new-video'
    }

    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.update).mockResolvedValue(updated)

    const result = await roomService.updateRoom(roomId, hostId, {
      name: 'Updated Room',
      isPrivate: true,
      accessCode: 'secret123',
      maxUsers: 10,
      genres: 'horror',
      contentUrl: 'https://example.com/new-video'
    })

    expect(roomRepository.update).toHaveBeenCalledWith(roomId, {
      name: 'Updated Room',
      isPrivate: true,
      accessCode: 'secret123',
      maxUsers: 10,
      genres: 'horror',
      contentUrl: 'https://example.com/new-video'
    })
    expect(result).toEqual(updated)
  })

  it('updateRoom solo actualiza campos proporcionados', async () => {
    const room = createRoomFixture()
    const updated = { ...room, name: 'Just Name Changed' }

    vi.mocked(roomRepository.findById).mockResolvedValue(room)
    vi.mocked(roomRepository.update).mockResolvedValue(updated)

    await roomService.updateRoom(roomId, hostId, { name: 'Just Name Changed' })

    expect(roomRepository.update).toHaveBeenCalledWith(roomId, {
      name: 'Just Name Changed'
    })
  })

  it('updateRoom valida roomId y userId como ObjectId', async () => {
    await expect(roomService.updateRoom('123', hostId, { name: 'x' })).rejects.toMatchObject({
      code: 'INVALID_ROOM_ID'
    })

    vi.mocked(roomRepository.findById).mockResolvedValue(createRoomFixture())
    await expect(roomService.updateRoom(roomId, '123', { name: 'x' })).rejects.toMatchObject({
      code: 'INVALID_USER_ID'
    })
  })

   it('updateRoom retorna error si update falla', async () => {
     vi.mocked(roomRepository.findById).mockResolvedValue(createRoomFixture())
     vi.mocked(roomRepository.update).mockResolvedValue(null)

     await expect(roomService.updateRoom(roomId, hostId, { name: 'x' })).rejects.toMatchObject({
       code: 'ROOM_NOT_FOUND'
     })
   })

   it('deleteRoom lanza ROOM_NOT_FOUND si la sala no existe', async () => {
      vi.clearAllMocks()
      vi.mocked(roomRepository.findById).mockResolvedValue(null)

      await expect(roomService.deleteRoom(roomId, hostId)).rejects.toMatchObject({
        code: 'ROOM_NOT_FOUND'
      })
    })

    it('deleteRoom lanza ROOM_FORBIDDEN si no es el host', async () => {
      vi.clearAllMocks()
      const room = createRoomFixture()
      const otherUserId = '507f1f77bcf86cd799439099'

      vi.mocked(roomRepository.findById).mockResolvedValue(room)

      await expect(roomService.deleteRoom(roomId, otherUserId)).rejects.toMatchObject({
        code: 'ROOM_FORBIDDEN'
      })
    })

    it('deleteRoom valida roomId como ObjectId', async () => {
      vi.clearAllMocks()
      await expect(roomService.deleteRoom('123', hostId)).rejects.toMatchObject({
        code: 'INVALID_ROOM_ID'
      })
    })

    it('deleteRoom elimina la sala cuando autenticación es válida', async () => {
      vi.clearAllMocks()
      const room = createRoomFixture()
      vi.mocked(roomRepository.findById).mockResolvedValue(room)
      vi.mocked(roomRepository.delete).mockResolvedValue(true)

      await expect(roomService.deleteRoom(roomId, hostId)).resolves.toBeUndefined()
      expect(roomRepository.delete).toHaveBeenCalledWith(roomId)
    })
})
