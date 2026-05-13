import type { FastifyInstance } from 'fastify'
import UserController from './userController.js'
import JwtService from '../../shared/jwtService.js'
import userService from './userService.js'

export default async function userRoutes(fastify: FastifyInstance) {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET no está configurado')
  }

  const jwtService = new JwtService(jwtSecret)
  const userController = new UserController(userService, jwtService)

  // rutas de usuario
  fastify.get('/users', userController.getUsers)

  fastify.get('/users/:id', userController.getUserById)

  fastify.post('/users/create', userController.createUser)

  fastify.put('/users/:id', userController.updateUser)

  fastify.delete('/users/:id', userController.deleteUser)
}