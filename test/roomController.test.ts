import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomController from '../src/modules/rooms/roomController.js'
import { AppError } from '../src/shared/appError.js'

const mockRequest = (overrides?: any) => ({
  params: {},
  query: {},
  body: {},
  ...overrides
})

const mockReply = () => {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis()
  }
  return reply as any
}

const roomFixture = {
  id: '507f1f77bcf86cd799439012',
  name: 'Room test',
  isPrivate: false,
  accessCode: '',
  maxUsers: 5,
  hostId: '507f1f77bcf86cd799439011',
  userIds: ['507f1f77bcf86cd799439011'],
  chatId: '',
  state: 'waiting' as const,
  genres: 'other' as const,
  contentUrl: 'https://example.com/video',
  playback: {
    isPlaying: false,
    positionMs: 0,
    updatedAt: new Date(),
    updatedBy: '507f1f77bcf86cd799439011',
    version: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
}

describe('RoomController', () => {
  let controller: RoomController
  let mockRoomService: any

  beforeEach(() => {
    mockRoomService = {
      getRooms: vi.fn(),
      createRoom: vi.fn(),
      joinRoomForUser: vi.fn(),
      leaveRoomForUser: vi.fn(),
      getWatchState: vi.fn(),
      updateWatchState: vi.fn(),
      getUsersGenres: vi.fn(),
      updateRoom: vi.fn(),
      deleteRoom: vi.fn()
    }
    controller = new RoomController(mockRoomService)
  })

  describe('getRooms', () => {
    it('returns all rooms', async () => {
      const request = mockRequest()
      const reply = mockReply()
      const rooms = [roomFixture]

      mockRoomService.getRooms.mockResolvedValue(rooms)

      await controller.getRooms(request, reply)

      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(rooms)
    })

    it('handles service errors', async () => {
      const request = mockRequest()
      const reply = mockReply()

      mockRoomService.getRooms.mockRejectedValue(new Error('DB error'))

      await controller.getRooms(request, reply)

      expect(reply.code).toHaveBeenCalledWith(500)
    })
  })

  describe('createRoom', () => {
    it('creates room successfully', async () => {
      const request = mockRequest({
        body: {
          name: 'New Room',
          isPrivate: false,
          accessCode: undefined,
          maxUsers: 5,
          hostId: '507f1f77bcf86cd799439011',
          genres: 'action',
          contentUrl: 'https://example.com/video'
        }
      })
      const reply = mockReply()

      mockRoomService.createRoom.mockResolvedValue(roomFixture)

      await controller.createRoom(request, reply)

      expect(mockRoomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Room',
          isPrivate: false,
          maxUsers: 5,
          hostId: '507f1f77bcf86cd799439011',
          accessCode: '',
          genres: 'action',
          contentUrl: 'https://example.com/video'
        })
      )
      expect(reply.code).toHaveBeenCalledWith(201)
    })

    it('sets default accessCode and genres if not provided', async () => {
      const request = mockRequest({
        body: {
          name: 'New Room',
          isPrivate: false,
          maxUsers: 5,
          hostId: '507f1f77bcf86cd799439011',
          contentUrl: 'https://example.com/video'
        }
      })
      const reply = mockReply()

      mockRoomService.createRoom.mockResolvedValue(roomFixture)

      await controller.createRoom(request, reply)

      expect(mockRoomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          accessCode: '',
          genres: 'other'
        })
      )
    })

    it('handles AppError from service', async () => {
      const request = mockRequest({ body: {} })
      const reply = mockReply()

      mockRoomService.createRoom.mockRejectedValue(
        new AppError(400, 'INVALID_HOST_ID', 'Invalid host ID')
      )

      await controller.createRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'INVALID_HOST_ID',
        message: 'Invalid host ID'
      })
    })
  })

  describe('joinRoom', () => {
    it('joins room successfully', async () => {
      const request = mockRequest({
        params: {
          roomId: '507f1f77bcf86cd799439012',
          id: '507f1f77bcf86cd799439011'
        },
        body: { accessCode: undefined }
      })
      const reply = mockReply()
      const result = { room: roomFixture, chat: { id: 'chat-id' } }

      mockRoomService.joinRoomForUser.mockResolvedValue(result)

      await controller.joinRoom(request, reply)

      expect(mockRoomService.joinRoomForUser).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        undefined
      )
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(result)
    })

    it('passes access code when joining private room', async () => {
      const request = mockRequest({
        params: {
          roomId: '507f1f77bcf86cd799439012',
          id: '507f1f77bcf86cd799439011'
        },
        body: { accessCode: '1234' }
      })
      const reply = mockReply()

      mockRoomService.joinRoomForUser.mockResolvedValue({ room: roomFixture, chat: { id: 'chat-id' } })

      await controller.joinRoom(request, reply)

      expect(mockRoomService.joinRoomForUser).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '1234'
      )
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012', id: '507f1f77bcf86cd799439011' },
        body: {}
      })
      const reply = mockReply()

      mockRoomService.joinRoomForUser.mockRejectedValue(
        new AppError(403, 'ROOM_INVALID_ACCESS_CODE', 'Invalid access code')
      )

      await controller.joinRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(403)
    })
  })

  describe('leaveRoom', () => {
    it('leaves room successfully', async () => {
      const request = mockRequest({
        params: {
          roomId: '507f1f77bcf86cd799439012',
          id: '507f1f77bcf86cd799439011'
        }
      })
      const reply = mockReply()
      const updatedRoom = { ...roomFixture, userIds: [] }

      mockRoomService.leaveRoomForUser.mockResolvedValue(updatedRoom)

      await controller.leaveRoom(request, reply)

      expect(mockRoomService.leaveRoomForUser).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012'
      )
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(updatedRoom)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012', id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()

      mockRoomService.leaveRoomForUser.mockRejectedValue(
        new AppError(404, 'ROOM_NOT_FOUND', 'Room not found')
      )

      await controller.leaveRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('getWatchState', () => {
    it('returns watch state successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()
      const playback = roomFixture.playback

      mockRoomService.getWatchState.mockResolvedValue(playback)

      await controller.getWatchState(request, reply)

      expect(mockRoomService.getWatchState).toHaveBeenCalledWith('507f1f77bcf86cd799439012')
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(playback)
    })

    it('handles not found error', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()

      mockRoomService.getWatchState.mockRejectedValue(
        new AppError(404, 'ROOM_NOT_FOUND', 'Room not found')
      )

      await controller.getWatchState(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('updateWatchState', () => {
    it('updates watch state successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          userId: '507f1f77bcf86cd799439011',
          action: 'play',
          positionMs: 1234
        }
      })
      const reply = mockReply()
      const updatedPlayback = { ...roomFixture.playback, isPlaying: true, positionMs: 1234 }

      mockRoomService.updateWatchState.mockResolvedValue(updatedPlayback)

      await controller.updateWatchState(request, reply)

      expect(mockRoomService.updateWatchState).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
        {
          action: 'play',
          positionMs: 1234
        }
      )
      expect(reply.code).toHaveBeenCalledWith(200)
    })

    it('handles validation errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          userId: '507f1f77bcf86cd799439011',
          action: 'play',
          positionMs: -1
        }
      })
      const reply = mockReply()

      mockRoomService.updateWatchState.mockRejectedValue(
        new AppError(400, 'INVALID_POSITION_MS', 'positionMs must be positive')
      )

      await controller.updateWatchState(request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
    })
  })

  describe('getUsersGenres', () => {
    it('returns users genres successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()
      const usersGenres = [
        { userId: '507f1f77bcf86cd799439011', favoriteGenre: 'action' }
      ]

      mockRoomService.getUsersGenres.mockResolvedValue(usersGenres)

      await controller.getUsersGenres(request, reply)

      expect(mockRoomService.getUsersGenres).toHaveBeenCalledWith('507f1f77bcf86cd799439012')
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(usersGenres)
    })

    it('handles not found error', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()

      mockRoomService.getUsersGenres.mockRejectedValue(
        new AppError(404, 'ROOM_NOT_FOUND', 'Room not found')
      )

      await controller.getUsersGenres(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('updateRoom', () => {
    it('updates room successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          name: 'Updated Room',
          maxUsers: 10
        },
        user: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()
      const updatedRoom = { ...roomFixture, name: 'Updated Room', maxUsers: 10 }

      mockRoomService.updateRoom.mockResolvedValue(updatedRoom)

      // Mock the user in request
      ;(request as any).user = { id: '507f1f77bcf86cd799439011' }

      await controller.updateRoom(request, reply)

      expect(mockRoomService.updateRoom).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
        {
          name: 'Updated Room',
          maxUsers: 10
        }
      )
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(updatedRoom)
    })

    it('returns 401 if user is not authenticated', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: { name: 'Updated Room' }
      })
      const reply = mockReply()

      await controller.updateRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(401)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'UNAUTHORIZED',
        message: 'Debe estar autenticado'
      })
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: { isPrivate: true },
        user: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()
      ;(request as any).user = { id: '507f1f77bcf86cd799439011' }

      mockRoomService.updateRoom.mockRejectedValue(
        new AppError(403, 'ROOM_FORBIDDEN', 'Solo el host puede actualizar la sala')
      )

      await controller.updateRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(403)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'ROOM_FORBIDDEN',
        message: 'Solo el host puede actualizar la sala'
      })
    })
  })

  describe('deleteRoom', () => {
    it('deletes room successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        user: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()
      ;(request as any).user = { id: '507f1f77bcf86cd799439011' }

      mockRoomService.deleteRoom.mockResolvedValue(undefined)

      await controller.deleteRoom(request, reply)

      expect(mockRoomService.deleteRoom).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011'
      )
      expect(reply.code).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('returns 401 if user is not authenticated', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()

      await controller.deleteRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(401)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'UNAUTHORIZED',
        message: 'Debe estar autenticado'
      })
    })

    it('handles service errors (ROOM_FORBIDDEN)', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        user: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()
      ;(request as any).user = { id: '507f1f77bcf86cd799439011' }

      mockRoomService.deleteRoom.mockRejectedValue(
        new AppError(403, 'ROOM_FORBIDDEN', 'Solo el host puede eliminar la sala')
      )

      await controller.deleteRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(403)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'ROOM_FORBIDDEN',
        message: 'Solo el host puede eliminar la sala'
      })
    })

    it('handles service errors (ROOM_NOT_FOUND)', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        user: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()
      ;(request as any).user = { id: '507f1f77bcf86cd799439011' }

      mockRoomService.deleteRoom.mockRejectedValue(
        new AppError(404, 'ROOM_NOT_FOUND', 'Sala no encontrada')
      )

      await controller.deleteRoom(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'ROOM_NOT_FOUND',
        message: 'Sala no encontrada'
      })
    })
  })
})
