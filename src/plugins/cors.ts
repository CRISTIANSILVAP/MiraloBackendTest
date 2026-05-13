import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'

const corsPlugin = async (app: FastifyInstance): Promise<void> => {
  await app.register(cors, {
    origin: true, // permite cualquier origin temporalmente
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    preflight: true
  })
}

export default corsPlugin