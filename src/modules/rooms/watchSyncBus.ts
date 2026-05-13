import type { PlaybackState } from './room.js'
import { getRedisPublisher, getRedisSubscriber } from '../../config/redis.js'

type WatchStateListener = (playback: PlaybackState) => void

type WatchSyncMessage = {
  event: 'watch_state'
  roomId: string
  data: PlaybackState
}

type WatchSyncMode = 'redis' | 'redis-with-fallback' | 'memory'

const WATCH_SYNC_MODE: WatchSyncMode = (() => {
  const configured = process.env.WATCH_SYNC_MODE
  if (configured === 'redis' || configured === 'redis-with-fallback' || configured === 'memory') {
    return configured
  }

  return 'redis-with-fallback'
})()

const channelNameForRoom = (roomId: string): string => {
  return `miralo:rooms:${roomId}:watch_state`
}

const roomListeners = new Map<string, Set<WatchStateListener>>()
const roomSubscriptionRefs = new Map<string, number>()
const roomRedisSubscribed = new Set<string>()
const roomFallbackMemoryMode = new Set<string>()

const safeParseWatchSyncMessage = (value: string): WatchSyncMessage | null => {
  try {
    const parsed = JSON.parse(value) as Partial<WatchSyncMessage>

    if (parsed.event !== 'watch_state' || typeof parsed.roomId !== 'string' || !parsed.data) {
      return null
    }

    return {
      event: 'watch_state',
      roomId: parsed.roomId,
      data: parsed.data as PlaybackState
    }
  } catch {
    return null
  }
}

const notifyRoomListeners = (roomId: string, playback: PlaybackState): void => {
  const listeners = roomListeners.get(roomId)
  if (!listeners || listeners.size === 0) {
    return
  }

  for (const listener of listeners) {
    listener(playback)
  }
}

const warnFallback = (roomId: string, error: unknown): void => {
  console.warn(`[watch-sync] Usando fallback en memoria para room ${roomId}`)
  console.warn(error)
}

const shouldUseOnlyMemory = (): boolean => {
  return WATCH_SYNC_MODE === 'memory'
}

const shouldUseFallback = (): boolean => {
  return WATCH_SYNC_MODE === 'redis-with-fallback'
}

const rollbackSubscriptionRegistration = (roomId: string, listener: WatchStateListener): void => {
  const activeListeners = roomListeners.get(roomId)
  if (activeListeners) {
    activeListeners.delete(listener)
    if (activeListeners.size === 0) {
      roomListeners.delete(roomId)
    }
  }

  const refs = roomSubscriptionRefs.get(roomId)
  if (refs === undefined) {
    return
  }

  if (refs <= 1) {
    roomSubscriptionRefs.delete(roomId)
    return
  }

  roomSubscriptionRefs.set(roomId, refs - 1)
}

export const publishWatchState = async (roomId: string, playback: PlaybackState): Promise<void> => {
  if (shouldUseOnlyMemory() || roomFallbackMemoryMode.has(roomId)) {
    notifyRoomListeners(roomId, playback)
    return
  }

  try {
    const publisher = await getRedisPublisher()
    const message: WatchSyncMessage = {
      event: 'watch_state',
      roomId,
      data: playback
    }

    await publisher.publish(channelNameForRoom(roomId), JSON.stringify(message))
  } catch (error) {
    if (!shouldUseFallback()) {
      throw error
    }

    roomFallbackMemoryMode.add(roomId)
    warnFallback(roomId, error)
    notifyRoomListeners(roomId, playback)
  }
}

export const subscribeWatchState = async (
  roomId: string,
  listener: WatchStateListener
): Promise<() => Promise<void>> => {
  const listeners = roomListeners.get(roomId) ?? new Set<WatchStateListener>()
  listeners.add(listener)
  roomListeners.set(roomId, listeners)

  const currentRefs = roomSubscriptionRefs.get(roomId) ?? 0
  const nextRefs = currentRefs + 1
  roomSubscriptionRefs.set(roomId, nextRefs)

  if (currentRefs === 0 && !shouldUseOnlyMemory()) {
    try {
      const subscriber = await getRedisSubscriber()
      await subscriber.subscribe(channelNameForRoom(roomId), (rawMessage: string) => {
        const parsed = safeParseWatchSyncMessage(rawMessage)
        if (!parsed || parsed.roomId !== roomId) {
          return
        }

        notifyRoomListeners(roomId, parsed.data)
      })

      roomRedisSubscribed.add(roomId)
      roomFallbackMemoryMode.delete(roomId)
    } catch (error) {
      if (!shouldUseFallback()) {
        rollbackSubscriptionRegistration(roomId, listener)
        throw error
      }

      roomFallbackMemoryMode.add(roomId)
      warnFallback(roomId, error)
    }
  }

  return async () => {
    const activeListeners = roomListeners.get(roomId)
    if (activeListeners) {
      activeListeners.delete(listener)
      if (activeListeners.size === 0) {
        roomListeners.delete(roomId)
      }
    }

    const refs = roomSubscriptionRefs.get(roomId)
    if (refs === undefined) {
      return
    }

    const next = refs - 1
    if (next > 0) {
      roomSubscriptionRefs.set(roomId, next)
      return
    }

    roomSubscriptionRefs.delete(roomId)
    roomFallbackMemoryMode.delete(roomId)

    if (!roomRedisSubscribed.has(roomId)) {
      return
    }

    roomRedisSubscribed.delete(roomId)

    try {
      const subscriber = await getRedisSubscriber()
      await subscriber.unsubscribe(channelNameForRoom(roomId))
    } catch (error) {
      console.warn(`[watch-sync] No se pudo desuscribir canal Redis para room ${roomId}`)
      console.warn(error)
    }
  }
}

