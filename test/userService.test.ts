import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/users/userRepository.js', () => ({
  default: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}))

<<<<<<< HEAD
vi.mock('../src/modules/rooms/roomService.js', () => ({
  default: {
    validateJoinEligibility: vi.fn(),
    addUser: vi.fn(),
    removeUser: vi.fn()
  }
}))

vi.mock('../src/modules/chats/chatService.js', () => ({
  default: {
    getOrCreateChat: vi.fn()
  }
}))

import userService from '../src/modules/users/userService.js'
import userRepository from '../src/modules/users/userRepository.js'
import roomService from '../src/modules/rooms/roomService.js'
import chatService from '../src/modules/chats/chatService.js'

const userId = '507f1f77bcf86cd799439021'
const roomId = '507f1f77bcf86cd799439022'
=======
import userService from '../src/modules/users/userService.js'
import userRepository from '../src/modules/users/userRepository.js'

const userId = '507f1f77bcf86cd799439021'
>>>>>>> 91c5b0f (feat: add Redis, Docker, WebSocket real-time, and SonarCloud CI/CD)

const userFixture = () => ({
  id: userId,
  googleId: 'google-1',
  name: 'Alice',
  email: 'alice@example.com',
  favoriteGenres: [],
  createdAt: new Date(),
  updatedAt: new Date()
})

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getUsers devuelve lista desde repositorio', async () => {
    vi.mocked(userRepository.findAll).mockResolvedValue([userFixture()])
    await expect(userService.getUsers()).resolves.toHaveLength(1)
  })

  it('getUserById valida ObjectId', async () => {
    await expect(userService.getUserById('123')).rejects.toMatchObject({ code: 'INVALID_ID' })
  })

  it('getUserById lanza USER_NOT_FOUND', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null)
    await expect(userService.getUserById(userId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('createUser retorna usuario existente por email', async () => {
    const existing = userFixture()
    vi.mocked(userRepository.findByEmail).mockResolvedValue(existing)

    const result = await userService.createUser({
      googleId: 'google-2',
      name: 'Alice',
      email: 'alice@example.com'
    })

    expect(result).toEqual(existing)
    expect(userRepository.create).not.toHaveBeenCalled()
  })

  it('createUser normaliza datos y crea', async () => {
    const created = { ...userFixture(), picture: 'https://img/p.png' }
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(userRepository.create).mockResolvedValue(created)

    await expect(userService.createUser({
      googleId: '  google-2  ',
      name: '  Alice  ',
      email: '  ALICE@EXAMPLE.COM  ',
      picture: '  https://img/p.png  '
    })).resolves.toEqual(created)

    expect(userRepository.create).toHaveBeenCalledWith({
      googleId: 'google-2',
      name: 'Alice',
      email: 'alice@example.com',
      picture: 'https://img/p.png'
    })
  })

  it('updateUser exige al menos un campo', async () => {
    await expect(userService.updateUser(userId, {})).rejects.toMatchObject({ code: 'EMPTY_UPDATE' })
  })

  it('updateUser valida colision de email', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...userFixture(), id: '507f1f77bcf86cd799439099' })

    await expect(userService.updateUser(userId, { email: 'other@example.com' })).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS'
    })
  })

  it('updateUser lanza USER_NOT_FOUND cuando update devuelve null', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(userRepository.update).mockResolvedValue(null)

    await expect(userService.updateUser(userId, { email: 'alice2@example.com' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND'
    })
  })

  it('updateUser normaliza y retorna usuario actualizado', async () => {
    const updated = { ...userFixture(), name: 'Alice Updated', email: 'new@example.com' }
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(userRepository.update).mockResolvedValue(updated)

    await expect(userService.updateUser(userId, {
      name: '  Alice Updated  ',
      email: '  NEW@EXAMPLE.COM '
    })).resolves.toEqual(updated)

    expect(userRepository.update).toHaveBeenCalledWith(userId, {
      name: 'Alice Updated',
      email: 'new@example.com'
    })
  })

  it('deleteUser lanza USER_NOT_FOUND si no borra', async () => {
    vi.mocked(userRepository.delete).mockResolvedValue(false)
    await expect(userService.deleteUser(userId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

<<<<<<< HEAD
  it('joinRoomForUser valida usuario y retorna room+chat', async () => {
    const user = userFixture()
    const room = {
      id: roomId,
      name: 'room',
      isPrivate: false,
      accessCode: '',
      maxUsers: 5,
      hostId: userId,
      userIds: [userId],
      chatId: '507f1f77bcf86cd799439023',
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
    }

    vi.mocked(userRepository.findById).mockResolvedValue(user)
    vi.mocked(roomService.validateJoinEligibility).mockResolvedValue(room)
    vi.mocked(roomService.addUser).mockResolvedValue(room)
    vi.mocked(chatService.getOrCreateChat).mockResolvedValue({ id: '507f1f77bcf86cd799439023' } as never)

    const result = await userService.joinRoomForUser(userId, roomId, ' 1234 ')

    expect(roomService.validateJoinEligibility).toHaveBeenCalledWith(roomId, '1234')
    expect(result.room).toEqual(room)
    expect(result.chat.id).toBe('507f1f77bcf86cd799439023')
  })

  it('joinRoomForUser falla si usuario no existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null)
    await expect(userService.joinRoomForUser(userId, roomId)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('leaveRoomForUser remueve usuario de la sala', async () => {
    const user = userFixture()
    const room = {
      id: roomId,
      name: 'room',
      isPrivate: false,
      accessCode: '',
      maxUsers: 5,
      hostId: userId,
      userIds: [],
      chatId: '507f1f77bcf86cd799439023',
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
    }

    vi.mocked(userRepository.findById).mockResolvedValue(user)
    vi.mocked(roomService.removeUser).mockResolvedValue(room)

    await expect(userService.leaveRoomForUser(userId, roomId)).resolves.toEqual(room)
    expect(roomService.removeUser).toHaveBeenCalledWith(roomId, userId)
  })
=======
>>>>>>> 91c5b0f (feat: add Redis, Docker, WebSocket real-time, and SonarCloud CI/CD)
})

