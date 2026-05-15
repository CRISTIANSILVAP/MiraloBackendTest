import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockCollection = () => ({
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
})

vi.mock('../src/config/mongo.js', () => ({
  getChatsCollection: async () => mockCollections.chats
}))

const mockCollections: any = {
  chats: mockCollection()
}

// import after mock
import chatRepository from '../src/modules/chats/chatRepository.js'

const mockId = new ObjectId()

describe('chatRepository (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createForRoom inserts a document and returns chat', async () => {
    mockCollections.chats.insertOne.mockResolvedValue({ insertedId: mockId })

    const res = await chatRepository.createForRoom('room-123')

    expect(mockCollections.chats.insertOne).toHaveBeenCalled()
    expect(res.roomId).toBe('room-123')
    expect(res.messages).toEqual([])
  })

  it('findByRoomId returns null when not found', async () => {
    mockCollections.chats.findOne.mockResolvedValue(null)

    const res = await chatRepository.findByRoomId('no-room')
    expect(res).toBeNull()
  })

  it('appendMessage pushes message and returns it', async () => {
    mockCollections.chats.findOne.mockResolvedValue({ _id: mockId, roomId: 'room-123', messages: [], isActive: true, createdAt: new Date(), updatedAt: new Date() })
    mockCollections.chats.updateOne.mockResolvedValue({ acknowledged: true })

    const msg = await chatRepository.appendMessage('room-123', 'user-1', 'hi', 'text')

    expect(mockCollections.chats.updateOne).toHaveBeenCalled()
    expect(msg.content).toBe('hi')
    expect(msg.userId).toBe('user-1')
  })
})
