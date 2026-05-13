import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../../shared/appError.js'
import type { Chat, ChatMessage, CreateMessageInput, MessageType } from './chat.js'

type RoomParams = {
  roomId: string
}

type PinMessageParams = {
  roomId: string
  messageId: string
}

type SendMessageBody = {
  userId: string
  content: string
  type?: MessageType
}

type QueryLimit = {
  limit?: string
}

type ChatServiceLike = {
  getOrCreateChat: (roomId: string) => Promise<Chat>
  getMessages: (roomId: string, limit?: number) => Promise<ChatMessage[]>
  sendMessage: (input: CreateMessageInput) => Promise<ChatMessage>
  pinMessage: (roomId: string, messageId: string) => Promise<void>
  clearMessages: (roomId: string) => Promise<void>
}

export default class ChatController {
  constructor(private readonly chatService: ChatServiceLike) {}

  getOrCreateChat = async (
    request: FastifyRequest<{ Params: RoomParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const chat = await this.chatService.getOrCreateChat(request.params.roomId)
      reply.code(200).send(chat)
    } catch (error) {
      this.handleError(error, reply)
    }
  }

  getMessages = async (
    request: FastifyRequest<{ Params: RoomParams; Querystring: QueryLimit }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const parsedLimit = request.query.limit ? Number(request.query.limit) : 50
      const messages = await this.chatService.getMessages(request.params.roomId, parsedLimit)
      reply.code(200).send(messages)
    } catch (error) {
      this.handleError(error, reply)
    }
  }

  sendMessage = async (
    request: FastifyRequest<{ Params: RoomParams; Body: SendMessageBody }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const body = request.body

      const input: CreateMessageInput = {
        roomId: request.params.roomId,
        userId: body.userId,
        content: body.content
      }

      if (body.type) {
        input.type = body.type
      }

      const message = await this.chatService.sendMessage(input)
      reply.code(201).send(message)
    } catch (error) {
      this.handleError(error, reply)
    }
  }

  pinMessage = async (
    request: FastifyRequest<{ Params: PinMessageParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      await this.chatService.pinMessage(request.params.roomId, request.params.messageId)
      reply.code(204).send()
    } catch (error) {
      this.handleError(error, reply)
    }
  }

  clearMessages = async (
    request: FastifyRequest<{ Params: RoomParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      await this.chatService.clearMessages(request.params.roomId)
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
