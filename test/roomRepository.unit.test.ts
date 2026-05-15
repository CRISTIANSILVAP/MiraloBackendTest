import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockCollection = () => ({
  find: vi.fn(),
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn()
})

const mockCollections: any = {
  rooms: mockCollection()
}

vi.mock('../src/config/mongo.js', () => ({
  getRoomsCollection: async () => mockCollections.rooms
}))

import roomRepository from '../src/modules/rooms/roomRepository.js'

const mockId = new ObjectId()

describe('roomRepository (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create inserts and returns room', async () => {
    mockCollections.rooms.insertOne.mockResolvedValue({ insertedId: mockId })

    const res = await roomRepository.create({
      name: 'R', isPrivate: false, accessCode: '', maxUsers: 5, hostId: 'h', genres: 'other', contentUrl: 'u'
    })

    expect(mockCollections.rooms.insertOne).toHaveBeenCalled()
    expect(res.name).toBe('R')
  })

  it('findById returns null for invalid id', async () => {
    const res = await roomRepository.findById('bad-id')
    expect(res).toBeNull()
  })

  it('delete returns true when deletedCount>0', async () => {
    mockCollections.rooms.deleteOne.mockResolvedValue({ deletedCount: 1 })
    const res = await roomRepository.delete(mockId.toString())
    expect(res).toBe(true)
  })
})
