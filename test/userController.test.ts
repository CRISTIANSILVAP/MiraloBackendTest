import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserController from '../src/modules/users/userController.js'
import { AppError } from '../src/shared/appError.js'
import JwtService from '../src/shared/jwtService.js'

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

const userFixture = {
  id: '507f1f77bcf86cd799439011',
  googleId: 'google-1',
  name: 'Alice',
  email: 'alice@example.com',
  picture: 'https://example.com/pic.jpg',
  favoriteGenres: [],
  createdAt: new Date(),
  updatedAt: new Date()
}

describe('UserController', () => {
  let controller: UserController
  let mockUserService: any
  let mockJwtService: any

  beforeEach(() => {
    mockUserService = {
      getUsers: vi.fn(),
      getUserById: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn()
    }
    mockJwtService = {
      decodeGoogleToken: vi.fn()
    }
    controller = new UserController(mockUserService, mockJwtService as any)
  })

  describe('getUsers', () => {
    it('returns all users', async () => {
      const request = mockRequest()
      const reply = mockReply()
      const users = [userFixture]

      mockUserService.getUsers.mockResolvedValue(users)

      await controller.getUsers(request, reply)

      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(users)
    })

    it('handles service errors', async () => {
      const request = mockRequest()
      const reply = mockReply()

      mockUserService.getUsers.mockRejectedValue(new Error('DB error'))

      await controller.getUsers(request, reply)

      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocurrió un error inesperado'
      })
    })
  })

  describe('getUserById', () => {
    it('returns user by id', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()

      mockUserService.getUserById.mockResolvedValue(userFixture)

      await controller.getUserById(request, reply)

      expect(mockUserService.getUserById).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(userFixture)
    })

    it('handles not found error', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()

      mockUserService.getUserById.mockRejectedValue(
        new AppError(404, 'USER_NOT_FOUND', 'User not found')
      )

      await controller.getUserById(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      })
    })
  })

  describe('createUser', () => {
    it('creates user from token successfully', async () => {
      const request = mockRequest({
        body: {
          token: 'valid-jwt-token'
        }
      })
      const reply = mockReply()

      mockJwtService.decodeGoogleToken.mockReturnValue({
        sub: 'google-1',
        email: 'alice@example.com',
        name: 'Alice'
      })
      mockUserService.createUser.mockResolvedValue(userFixture)

      await controller.createUser(request, reply)

      expect(mockJwtService.decodeGoogleToken).toHaveBeenCalledWith('valid-jwt-token')
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        googleId: 'google-1',
        email: 'alice@example.com',
        name: 'Alice'
      })
      expect(reply.code).toHaveBeenCalledWith(201)
      expect(reply.send).toHaveBeenCalledWith(userFixture)
    })

    it('includes picture if provided in token', async () => {
      const request = mockRequest({
        body: {
          token: 'valid-jwt-token'
        }
      })
      const reply = mockReply()

      mockJwtService.decodeGoogleToken.mockReturnValue({
        sub: 'google-1',
        email: 'alice@example.com',
        name: 'Alice',
        picture: 'https://example.com/pic.jpg'
      })
      mockUserService.createUser.mockResolvedValue(userFixture)

      await controller.createUser(request, reply)

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        googleId: 'google-1',
        email: 'alice@example.com',
        name: 'Alice',
        picture: 'https://example.com/pic.jpg'
      })
    })

    it('throws error if token is missing', async () => {
      const request = mockRequest({
        body: {}
      })
      const reply = mockReply()

      await controller.createUser(request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'MISSING_TOKEN',
        message: 'El token es obligatorio'
      })
    })

    it('handles JWT decode errors', async () => {
      const request = mockRequest({
        body: {
          token: 'invalid-jwt-token'
        }
      })
      const reply = mockReply()

      mockJwtService.decodeGoogleToken.mockImplementation(() => {
        throw new AppError(400, 'INVALID_TOKEN', 'Invalid token')
      })

      await controller.createUser(request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        body: {
          token: 'valid-jwt-token'
        }
      })
      const reply = mockReply()

      mockJwtService.decodeGoogleToken.mockReturnValue({
        sub: 'google-1',
        email: 'alice@example.com',
        name: 'Alice'
      })
      mockUserService.createUser.mockRejectedValue(new Error('DB error'))

      await controller.createUser(request, reply)

      expect(reply.code).toHaveBeenCalledWith(500)
    })
  })

  describe('updateUser', () => {
    it('updates user successfully', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' },
        body: {
          name: 'Alice Updated',
          email: 'alice.updated@example.com'
        }
      })
      const reply = mockReply()
      const updatedUser = { ...userFixture, name: 'Alice Updated' }

      mockUserService.updateUser.mockResolvedValue(updatedUser)

      await controller.updateUser(request, reply)

      expect(mockUserService.updateUser).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
        name: 'Alice Updated',
        email: 'alice.updated@example.com'
      })
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(updatedUser)
    })

    it('handles not found error', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' },
        body: { name: 'Alice' }
      })
      const reply = mockReply()

      mockUserService.updateUser.mockRejectedValue(
        new AppError(404, 'USER_NOT_FOUND', 'User not found')
      )

      await controller.updateUser(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('deleteUser', () => {
    it('deletes user successfully', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()

      mockUserService.deleteUser.mockResolvedValue(undefined)

      await controller.deleteUser(request, reply)

      expect(mockUserService.deleteUser).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
      expect(reply.code).toHaveBeenCalledWith(204)
    })

    it('handles not found error', async () => {
      const request = mockRequest({
        params: { id: '507f1f77bcf86cd799439011' }
      })
      const reply = mockReply()

      mockUserService.deleteUser.mockRejectedValue(
        new AppError(404, 'USER_NOT_FOUND', 'User not found')
      )

      await controller.deleteUser(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })
})

