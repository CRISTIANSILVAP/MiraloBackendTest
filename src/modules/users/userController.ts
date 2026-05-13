 import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../../shared/appError.js'
import type { CreateUserInput, UpdateUserInput } from './user.js'
import JwtService from '../../shared/jwtService.js'
import userServiceModule from './userService.js'

type IdParams = { id: string }
type CreateUserBody = { token: string }

export default class UserController {
    constructor(
        private readonly userService: typeof userServiceModule,
        private readonly jwtService: JwtService
    ) {}

    getUsers = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        try {
        const users = await this.userService.getUsers()
        reply.code(200).send(users)
        } catch (error) {
        this.handleError(error, reply)
        }
    }

    getUserById = async (
        request: FastifyRequest<{ Params: IdParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
        const id = String(request.params.id)
        const user = await this.userService.getUserById(id)
        reply.code(200).send(user)
        } catch (error) {
        this.handleError(error, reply)
        }
    }

    createUser = async (
        request: FastifyRequest<{ Body: CreateUserBody }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
        const { token } = request.body

        if (!token) {
            throw new AppError(400, 'MISSING_TOKEN', 'El token es obligatorio')
        }

        // Decodificar el token JWT
        const payload = this.jwtService.decodeGoogleToken(token)

        // Crear o obtener el usuario con los datos del token
        const createInput: CreateUserInput = {
            googleId: payload.sub,
            name: payload.name,
            email: payload.email
        }

        if (payload.picture) {
            createInput.picture = payload.picture
        }

        const user = await this.userService.createUser(createInput)

        reply.code(201).send(user)
        } catch (error) {
        this.handleError(error, reply)
        }
    }

    updateUser = async (
        request: FastifyRequest<{ Params: IdParams; Body: UpdateUserInput }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
        const id = String(request.params.id)
        const user = await this.userService.updateUser(id, request.body)
        reply.code(200).send(user)
        } catch (error) {
        this.handleError(error, reply)
        }
    }

    deleteUser = async (
        request: FastifyRequest<{ Params: IdParams }>,
        reply: FastifyReply
    ): Promise<void> => {
        try {
        const id = String(request.params.id)
        await this.userService.deleteUser(id)
        reply.code(204).send()
        } catch (error) {
        this.handleError(error, reply)
        }
    }

    private handleError(error: unknown, reply: FastifyReply): void {
        if (error instanceof AppError) {
        reply.code(error.statusCode).send({
            code: error.code,
            message: error.message
        })
        return
        }

        reply.code(500).send({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocurrió un error inesperado'
        })
    }
}
