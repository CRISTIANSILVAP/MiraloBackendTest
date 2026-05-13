import 'dotenv/config'
import { createClient } from 'redis'

type RedisConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type RedisClient = ReturnType<typeof createClient>

let publisherClient: RedisClient | null = null
let subscriberClient: RedisClient | null = null
let connectionPromise: Promise<void> | null = null
let connectionStatus: RedisConnectionStatus = 'idle'

const getRedisUrl = (): string => {
  // 127.0.0.1 evita resolucion IPv6 (::1) que puede fallar en algunos entornos locales
  return process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
}

const configureRedisErrorLogs = (client: RedisClient, name: string): void => {
  client.on('error', (error: unknown) => {
    console.error(`[redis:${name}]`, error)
  })
}

const createRedisClients = (): { publisher: RedisClient; subscriber: RedisClient } => {
  const publisher = createClient({
    url: getRedisUrl()
  })

  const subscriber = publisher.duplicate()

  configureRedisErrorLogs(publisher, 'pub')
  configureRedisErrorLogs(subscriber, 'sub')

  return {
    publisher,
    subscriber
  }
}

export const getRedisConnectionStatus = (): RedisConnectionStatus => {
  return connectionStatus
}

export const connectRedis = async (): Promise<void> => {
  if (publisherClient && subscriberClient) {
    connectionStatus = 'connected'
    return
  }

  if (connectionPromise) {
    return connectionPromise
  }

  connectionStatus = 'connecting'
  connectionPromise = (async () => {
    const { publisher, subscriber } = createRedisClients()

    try {
      await Promise.all([publisher.connect(), subscriber.connect()])
      publisherClient = publisher
      subscriberClient = subscriber
      connectionStatus = 'connected'
      console.log('[redis] Conectado para Pub/Sub')
    } catch (error) {
      connectionStatus = 'error'
      publisherClient = null
      subscriberClient = null

      try {
        if (publisher.isOpen) {
          await publisher.quit()
        }
      } catch {
        publisher.disconnect()
      }

      try {
        if (subscriber.isOpen) {
          await subscriber.quit()
        }
      } catch {
        subscriber.disconnect()
      }

      throw error
    } finally {
      connectionPromise = null
    }
  })()

  return connectionPromise
}

export const getRedisPublisher = async (): Promise<RedisClient> => {
  await connectRedis()

  if (!publisherClient) {
    throw new Error('Cliente Redis publisher no disponible')
  }

  return publisherClient
}

export const getRedisSubscriber = async (): Promise<RedisClient> => {
  await connectRedis()

  if (!subscriberClient) {
    throw new Error('Cliente Redis subscriber no disponible')
  }

  return subscriberClient
}

export const closeRedis = async (): Promise<void> => {
  const clients = [publisherClient, subscriberClient]
  publisherClient = null
  subscriberClient = null

  await Promise.all(clients.map(async (client) => {
    if (!client) {
      return
    }

    try {
      if (client.isOpen) {
        await client.quit()
      }
    } catch {
      client.disconnect()
    }
  }))

  if (connectionStatus !== 'idle') {
    console.log('[redis] Conexion cerrada')
  }
  connectionStatus = 'idle'
}

