import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

export default async function registerRateLimitPlugin(fastify: FastifyInstance) {
  // Rate limiting global: 300 requests por 15 minutos por IP
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '15 minutes'
  })

  // Rate limits específicos por ruta se pueden aplicar directamente en las rutas
  // Usando: config: { rateLimit: { max: N } }
}

