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

import userService from '../src/modules/users/userService.js'
import userRepository from '../src/modules/users/userRepository.js'

const userId = '507f1f77bcf86cd799439021'

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

  it('getUserById retorna usuario cuando existe', async () => {
    const u = userFixture()
    vi.mocked(userRepository.findById).mockResolvedValue(u)
    await expect(userService.getUserById(userId)).resolves.toEqual(u)
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

  it('createUser valida googleId, name y email', async () => {
    // missing googleId
    await expect(userService.createUser({ googleId: '', name: 'Alice', email: 'a@b.com' } as any)).rejects.toMatchObject({ code: 'INVALID_GOOGLE_ID' })

    // invalid name
    await expect(userService.createUser({ googleId: 'g1', name: 'A', email: 'a@b.com' } as any)).rejects.toMatchObject({ code: 'INVALID_NAME' })

    // invalid email
    await expect(userService.createUser({ googleId: 'g1', name: 'Alice', email: 'not-an-email' } as any)).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  })

})

