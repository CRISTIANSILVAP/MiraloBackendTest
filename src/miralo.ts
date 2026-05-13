import 'dotenv/config'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { connectMongo, getMongoConnectionStatus } from './config/mongo.js'
import { closeRedis, connectRedis, getRedisConnectionStatus } from './config/redis.js'
import corsPlugin from './plugins/cors.js'
import userRoutes from './modules/users/userRoutes.js'
import roomRoutes from './modules/rooms/roomRoutes.js'
import chatRoutes from './modules/chats/chatRoutes.js'

const isStrictRedisMode = (): boolean => {
  return process.env.WATCH_SYNC_MODE === 'redis'
}

const app = Fastify({ logger: true })

app.register(websocket)
app.register(corsPlugin)
app.register(userRoutes)
app.register(roomRoutes)
app.register(chatRoutes)

app.get('/health', async () => {
  return {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      mongo: getMongoConnectionStatus(),
      redis: getRedisConnectionStatus()
    }
  }
})

app.get('/ready', async (request, reply) => {
  const mongoStatus = getMongoConnectionStatus()
  const redisStatus = getRedisConnectionStatus()
  const strictRedis = isStrictRedisMode()

  const isMongoReady = mongoStatus === 'connected'
  const isRedisReady = strictRedis ? redisStatus === 'connected' : true
  const isReady = isMongoReady && isRedisReady

  if (!isReady) {
    return reply.code(503).send({
      status: 'not_ready',
      strictRedis,
      services: {
        mongo: mongoStatus,
        redis: redisStatus
      }
    })
  }

  return {
    status: 'ready',
    strictRedis,
    services: {
      mongo: mongoStatus,
      redis: redisStatus
    }
  }
})


const start = async (): Promise<void> => {
  try {
    await connectMongo()

    try {
      await connectRedis()
    } catch (error) {
      if (isStrictRedisMode()) {
        throw error
      }

      console.warn('[watch-sync] Redis no disponible. Se usara fallback en memoria para watch_state')
      console.warn(error)
    }

    const port = Number(process.env.PORT ?? 5000)
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`Servidor corriendo en http://localhost:${port}`)
  } catch (err) {
    await closeRedis()
    console.error('Error iniciando la aplicación:', err)
    app.log.error(err)
    process.exit(1)
  }
}

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  try {
    console.log(`Cerrando servidor por señal ${signal}`)
    await app.close()
    await closeRedis()
    process.exit(0)
  } catch (error) {
    console.error('Error durante el cierre del servidor:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

start()