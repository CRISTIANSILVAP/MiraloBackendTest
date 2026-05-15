import { beforeEach, describe, it, vi, expect } from 'vitest'
import type { WebSocket } from 'ws'

const mockSocket = (overrides?: any) => ({
  send: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  close: vi.fn(),
  terminate: vi.fn(),
  ...overrides
})

// Mock Redis
vi.mock('../../src/config/redis.js', () => ({
  redis: {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn()
  },
  getRedis: vi.fn()
}))

// Mock repositories
vi.mock('../../src/modules/rooms/roomRepository.js', () => ({
  default: {
    findById: vi.fn(),
    update: vi.fn()
  }
}))

vi.mock('../../src/modules/users/userRepository.js', () => ({
  default: {
    findById: vi.fn()
  }
}))

vi.mock('../../src/modules/chats/chatRepository.js', () => ({
  default: {
    findByRoomId: vi.fn(),
    appendMessage: vi.fn()
  }
}))

describe('WebSocket Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('chat.ws-handler', () => {
    it('exports handleChatWebSocket function', async () => {
      const handler = await import('../src/modules/chats/chat.ws-handler.js')
      expect(handler.handleChatWebSocket).toBeDefined()
      expect(typeof handler.handleChatWebSocket).toBe('function')
    })
  })

  describe('watch.ws-handler', () => {
    it('exports handleWatchWebSocket function', async () => {
      const handler = await import('../src/modules/rooms/watch.ws-handler.js')
      expect(handler.handleWatchWebSocket).toBeDefined()
      expect(typeof handler.handleWatchWebSocket).toBe('function')
    })
  })

  describe('realtime.ws-handler', () => {
    it('exports handleRealtimeWebSocket function', async () => {
      const handler = await import('../src/modules/realtime/realtime.ws-handler.js')
      expect(handler.handleRealtimeWebSocket).toBeDefined()
      expect(typeof handler.handleRealtimeWebSocket).toBe('function')
    })
  })
})

