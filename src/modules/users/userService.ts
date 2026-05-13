import { AppError } from '../../shared/appError.js'
import type {
  CreateUserInput,
  UpdateUserInput,
  User
} from './user.js'
import userRepository from './userRepository.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validateId = (id: string): void => {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw new AppError(400, 'INVALID_ID', 'El id debe ser un ObjectId valido')
  }
}

const validateGoogleId = (googleId: string | undefined): void => {
  if (!googleId || googleId.length === 0) {
    throw new AppError(400, 'INVALID_GOOGLE_ID', 'El Google ID es obligatorio')
  }
}

const validateName = (name: string | undefined): void => {
  if (!name || name.length < 2) {
    throw new AppError(400, 'INVALID_NAME', 'El nombre debe tener al menos 2 caracteres')
  }
}

const validateEmail = (email: string | undefined): void => {
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new AppError(400, 'INVALID_EMAIL', 'El email no es valido')
  }
}

const userService = {
  async getUsers(): Promise<User[]> {
    return userRepository.findAll()
  },

  async getUserById(id: string): Promise<User> {
      validateId(id)

      const user = await userRepository.findById(id)

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
      }

      return user
  },

  async createUser(input: CreateUserInput): Promise<User> {

    const normalizedInput = {
      googleId: input.googleId?.trim(),
      name: input.name?.trim(),
      email: input.email?.trim().toLowerCase(),
      picture: input.picture?.trim()
    }

    validateGoogleId(normalizedInput.googleId)
    validateName(normalizedInput.name)
    validateEmail(normalizedInput.email)

    const existingUser = await userRepository.findByEmail(normalizedInput.email)

    if (existingUser) {
      return existingUser
    }

    const createInput: CreateUserInput = {
      googleId: normalizedInput.googleId,
      name: normalizedInput.name,
      email: normalizedInput.email
    }

    if (normalizedInput.picture) {
      createInput.picture = normalizedInput.picture
    }

    return userRepository.create(createInput)
  },

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    validateId(id)

    const normalizedInput: UpdateUserInput = {}

    if (input.name !== undefined) {
      normalizedInput.name = input.name.trim()
    }

    if (input.email !== undefined) {
      normalizedInput.email = input.email.trim().toLowerCase()
    }

    if (!normalizedInput.name && !normalizedInput.email) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Debe enviar al menos un campo para actualizar')
    }

    if (normalizedInput.name !== undefined) {
      validateName(normalizedInput.name)
    }

    if (normalizedInput.email !== undefined) {
      validateEmail(normalizedInput.email)

      const existingUser = await userRepository.findByEmail(normalizedInput.email)

      if (existingUser && existingUser.id !== id) {
        throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'El email ya esta en uso')
      }
    }

    const updatedUser = await userRepository.update(id, normalizedInput)

    if (!updatedUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
    }

    return updatedUser
  },

  async deleteUser(id: string): Promise<void> {
    validateId(id)

    const deleted = await userRepository.delete(id)

    if (!deleted) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado')
    }
  }
}

export default userService
