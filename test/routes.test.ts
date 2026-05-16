import { beforeEach, describe, it, vi, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'

describe('Module Routes', () => {
  let fastify: FastifyInstance

  beforeEach(() => {
    // Configure JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key-' + Math.random().toString(36).substring(7)

    fastify = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    } as any
  })

  describe('userRoutes', () => {
    it('registers user routes', async () => {
      const userRoutes = await import('../src/modules/users/userRoutes.js')
      await userRoutes.default(fastify)

      expect(fastify.get).toHaveBeenCalledWith('/users', expect.any(Function))
      expect(fastify.get).toHaveBeenCalledWith('/users/:id', expect.any(Function))
      expect(fastify.post).toHaveBeenCalledWith('/users/create', expect.any(Function))
      expect(fastify.put).toHaveBeenCalledWith('/users/:id', expect.any(Function))
      expect(fastify.delete).toHaveBeenCalledWith('/users/:id', expect.any(Function))
    })
  })

  describe('roomRoutes', () => {
    it('registers room routes', async () => {
      const roomRoutes = await import('../src/modules/rooms/roomRoutes.js')
      await roomRoutes.default(fastify)

      expect(fastify.get).toHaveBeenCalledWith('/rooms', expect.any(Function))
      expect(fastify.get).toHaveBeenCalledWith('/rooms/users/:userId', expect.any(Function))
      expect(fastify.post).toHaveBeenCalledWith(
        '/rooms/create',
        expect.objectContaining({ config: expect.any(Object) }),
        expect.any(Function)
      )
      expect(fastify.post).toHaveBeenCalledWith(
        '/rooms/:roomId/users/:id/join',
        expect.any(Function)
      )
      expect(fastify.post).toHaveBeenCalledWith(
        '/rooms/:roomId/users/:id/leave',
        expect.any(Function)
      )
      expect(fastify.get).toHaveBeenCalledWith(
        '/rooms/:roomId/users/genres',
        expect.any(Function)
      )
      expect(fastify.patch).toHaveBeenCalledWith('/rooms/:roomId/:userId', expect.any(Function))
      expect(fastify.delete).toHaveBeenCalledWith('/rooms/:roomId/:userId', expect.any(Function))
      expect(fastify.get).toHaveBeenCalledWith(
        '/rooms/:roomId/watch-state',
        expect.any(Function)
      )
      expect(fastify.patch).toHaveBeenCalledWith(
        '/rooms/:roomId/watch-state',
        expect.any(Function)
      )
    })
  })

  describe('chatRoutes', () => {
    it('registers chat routes', async () => {
      const chatRoutes = await import('../src/modules/chats/chatRoutes.js')
      await chatRoutes.default(fastify)

      expect(fastify.get).toHaveBeenCalledWith('/rooms/:roomId/chat', expect.any(Function))
      expect(fastify.get).toHaveBeenCalledWith(
        '/rooms/:roomId/chat/messages',
        expect.any(Function)
      )
      expect(fastify.post).toHaveBeenCalledWith(
        '/rooms/:roomId/chat/messages',
        expect.any(Function)
      )
      expect(fastify.patch).toHaveBeenCalledWith(
        '/rooms/:roomId/chat/messages/:messageId/pin',
        expect.any(Function)
      )
      expect(fastify.delete).toHaveBeenCalledWith(
        '/rooms/:roomId/chat/messages',
        expect.any(Function)
      )
    })
  })
})


