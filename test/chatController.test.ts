import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatController from '../src/modules/chats/chatController.js'
import { AppError } from '../src/shared/appError.js'

const mockRequest = (overrides?: any) => ({
  params: {},
  query: {},
  body: {},
  ...overrides
})

const mockReply = () => {
  const reply = {
    status: vi.fn(),
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis()
  }
  return reply as any
}

const chatFixture = {
  id: '507f1f77bcf86cd799439011',
  roomId: '507f1f77bcf86cd799439012',
  messages: []
}

const messageFixture = {
  id: '507f1f77bcf86cd799439013',
  roomId: '507f1f77bcf86cd799439012',
  userId: '507f1f77bcf86cd799439014',
  content: 'Hello',
  type: 'text' as const,
  createdAt: new Date()
}

describe('ChatController', () => {
  let controller: ChatController
  let mockChatService: any

  beforeEach(() => {
    mockChatService = {
      getOrCreateChat: vi.fn(),
      getMessages: vi.fn(),
      sendMessage: vi.fn(),
      pinMessage: vi.fn(),
      clearMessages: vi.fn()
    }
    controller = new ChatController(mockChatService)
  })

  describe('getOrCreateChat', () => {
    it('returns chat successfully', async () => {
      const request = mockRequest({ params: { roomId: '507f1f77bcf86cd799439012' } })
      const reply = mockReply()

      mockChatService.getOrCreateChat.mockResolvedValue(chatFixture)

      await controller.getOrCreateChat(request, reply)

      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(chatFixture)
    })

    it('handles AppError from service', async () => {
      const request = mockRequest({ params: { roomId: '507f1f77bcf86cd799439012' } })
      const reply = mockReply()
      const error = new AppError(404, 'NOT_FOUND', 'Chat not found')

      mockChatService.getOrCreateChat.mockRejectedValue(error)

      await controller.getOrCreateChat(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'NOT_FOUND',
        message: 'Chat not found'
      })
    })

    it('handles generic errors with 500', async () => {
      const request = mockRequest({ params: { roomId: '507f1f77bcf86cd799439012' } })
      const reply = mockReply()

      mockChatService.getOrCreateChat.mockRejectedValue(new Error('DB error'))

      await controller.getOrCreateChat(request, reply)

      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocurrió un error inesperado'
      })
    })
  })

  describe('getMessages', () => {
    it('returns messages with default limit', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        query: {}
      })
      const reply = mockReply()
      const messages = [messageFixture]

      mockChatService.getMessages.mockResolvedValue(messages)

      await controller.getMessages(request, reply)

      expect(mockChatService.getMessages).toHaveBeenCalledWith('507f1f77bcf86cd799439012', 50)
      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith(messages)
    })

    it('returns messages with custom limit', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        query: { limit: '10' }
      })
      const reply = mockReply()
      const messages = [messageFixture]

      mockChatService.getMessages.mockResolvedValue(messages)

      await controller.getMessages(request, reply)

      expect(mockChatService.getMessages).toHaveBeenCalledWith('507f1f77bcf86cd799439012', 10)
      expect(reply.code).toHaveBeenCalledWith(200)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        query: {}
      })
      const reply = mockReply()

      mockChatService.getMessages.mockRejectedValue(new AppError(404, 'ROOM_NOT_FOUND', 'Room not found'))

      await controller.getMessages(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('sendMessage', () => {
    it('sends message successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          userId: '507f1f77bcf86cd799439014',
          content: 'Hello'
        }
      })
      const reply = mockReply()

      mockChatService.sendMessage.mockResolvedValue(messageFixture)

      await controller.sendMessage(request, reply)

      expect(mockChatService.sendMessage).toHaveBeenCalledWith({
        roomId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439014',
        content: 'Hello'
      })
      expect(reply.code).toHaveBeenCalledWith(201)
      expect(reply.send).toHaveBeenCalledWith(messageFixture)
    })

    it('includes message type if provided', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          userId: '507f1f77bcf86cd799439014',
          content: 'Hello',
          type: 'system'
        }
      })
      const reply = mockReply()

      mockChatService.sendMessage.mockResolvedValue({
        ...messageFixture,
        type: 'system'
      })

      await controller.sendMessage(request, reply)

      expect(mockChatService.sendMessage).toHaveBeenCalledWith({
        roomId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439014',
        content: 'Hello',
        type: 'system'
      })
      expect(reply.code).toHaveBeenCalledWith(201)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' },
        body: {
          userId: '507f1f77bcf86cd799439014',
          content: 'Hello'
        }
      })
      const reply = mockReply()

      mockChatService.sendMessage.mockRejectedValue(new AppError(400, 'INVALID_INPUT', 'Invalid message'))

      await controller.sendMessage(request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
    })
  })

  describe('pinMessage', () => {
    it('pins message successfully', async () => {
      const request = mockRequest({
        params: {
          roomId: '507f1f77bcf86cd799439012',
          messageId: '507f1f77bcf86cd799439013'
        }
      })
      const reply = mockReply()

      mockChatService.pinMessage.mockResolvedValue(undefined)

      await controller.pinMessage(request, reply)

      expect(mockChatService.pinMessage).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013'
      )
      expect(reply.code).toHaveBeenCalledWith(204)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: {
          roomId: '507f1f77bcf86cd799439012',
          messageId: '507f1f77bcf86cd799439013'
        }
      })
      const reply = mockReply()

      mockChatService.pinMessage.mockRejectedValue(new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found'))

      await controller.pinMessage(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })

  describe('clearMessages', () => {
    it('clears messages successfully', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()

      mockChatService.clearMessages.mockResolvedValue(undefined)

      await controller.clearMessages(request, reply)

      expect(mockChatService.clearMessages).toHaveBeenCalledWith('507f1f77bcf86cd799439012')
      expect(reply.code).toHaveBeenCalledWith(204)
    })

    it('handles service errors', async () => {
      const request = mockRequest({
        params: { roomId: '507f1f77bcf86cd799439012' }
      })
      const reply = mockReply()

      mockChatService.clearMessages.mockRejectedValue(new AppError(404, 'ROOM_NOT_FOUND', 'Room not found'))

      await controller.clearMessages(request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })
  })
})

