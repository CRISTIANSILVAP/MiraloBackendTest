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
  users: mockCollection()
}

vi.mock('../src/config/mongo.js', () => ({
  getUsersCollection: async () => mockCollections.users
}))

import userRepository from '../src/modules/users/userRepository.js'

const mockId = new ObjectId()

describe('userRepository (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create normalizes email and returns user', async () => {
    mockCollections.users.insertOne.mockResolvedValue({ insertedId: mockId })

    const res = await userRepository.create({ googleId: 'g', name: 'n', email: 'UPPER@EX.COM' })

    expect(mockCollections.users.insertOne).toHaveBeenCalledWith(expect.objectContaining({ email: 'upper@ex.com' }))
    expect(res.googleId).toBe('g')
  })

  it('findById returns null for invalid id', async () => {
    const res = await userRepository.findById('bad')
    expect(res).toBeNull()
  })

  it('delete returns true when deletedCount>0', async () => {
    mockCollections.users.deleteOne.mockResolvedValue({ deletedCount: 1 })
    const res = await userRepository.delete(mockId.toString())
    expect(res).toBe(true)
  })
})
