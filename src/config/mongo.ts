import { Collection, Db, MongoClient } from 'mongodb'
import type { RoomDocument } from '../modules/rooms/roomRepository.js'
import type { ChatDocument } from '../modules/chats/chatRepository.js'
import type { UserDocument } from '../modules/users/userRepository.js'
import 'dotenv/config'

type MongoConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

let client: MongoClient | null = null
let db: Db | null = null
let roomsCollection: Collection<RoomDocument> | null = null
let chatsCollection: Collection<ChatDocument> | null = null
let usersCollection: Collection<UserDocument> | null = null
let roomsIndexesPromise: Promise<void> | null = null
let chatsIndexesPromise: Promise<void> | null = null
let usersIndexesPromise: Promise<void> | null = null
let connectionStatus: MongoConnectionStatus = 'idle'

    const shouldLogMongoDebug = (): boolean => {
            return process.env.MONGO_DEBUG === 'true'
    }

    const logMongoDebug = (message: string): void => {
        if (shouldLogMongoDebug()) {
            console.log(`[mongo] ${message}`)
        }
    }

    const getMongoUri = (): string => {
        const uri = process.env.MONGODB_URI
        if (!uri) {
            throw new Error('MONGODB_URI no está configurado')
        }
        return uri
    }

    const getMongoDbName = (): string => {
        return process.env.MONGODB_DB_NAME ?? 'miralo'
    }

    export const getMongoConnectionStatus = (): MongoConnectionStatus => {
        return connectionStatus
    }

    export const connectMongo = async (): Promise<Db> => {
    if (db) {
        connectionStatus = 'connected'
        return db
    }

    connectionStatus = 'connecting'
    logMongoDebug('Conectando a MongoDB...')

    try {
        client = new MongoClient(getMongoUri(), {
        serverSelectionTimeoutMS: 8000
        })
        await client.connect()
        db = client.db(getMongoDbName())
        connectionStatus = 'connected'
        logMongoDebug(`Conectado a MongoDB. DB: ${getMongoDbName()}`)

        return db
    } catch (error) {
        connectionStatus = 'error'
        logMongoDebug('Error conectando a MongoDB')
        throw error
    }
    }


    export const getRoomsCollection = async (): Promise<Collection<RoomDocument>> => {
        if (roomsCollection) {
            connectionStatus = 'connected'
            return roomsCollection
        }

        const database = await connectMongo()
        roomsCollection = database.collection<RoomDocument>('rooms')

        // Opcional: índices (ajústalos a tu modelo)
        if (!roomsIndexesPromise) {
            roomsIndexesPromise = Promise.all([
                roomsCollection.createIndex({ name: 1 }),
                roomsCollection.createIndex({ state: 1 }),
                roomsCollection.createIndex({ createdAt: -1 })
            ]).then(() => undefined)
        }

        await roomsIndexesPromise

        return roomsCollection
    }

    export const getChatsCollection = async (): Promise<Collection<ChatDocument>> => {
        if (chatsCollection) {
            connectionStatus = 'connected'
            return chatsCollection
        }

        const database = await connectMongo()
        chatsCollection = database.collection<ChatDocument>('chats')

        if (!chatsIndexesPromise) {
            chatsIndexesPromise = Promise.all([
                chatsCollection.createIndex({ roomId: 1 }, { unique: true }),
                chatsCollection.createIndex({ 'messages.id': 1 })
            ]).then(() => undefined)
        }

        await chatsIndexesPromise

        return chatsCollection
    }

export const getUsersCollection = async (): Promise<Collection<UserDocument>> => {
    if (usersCollection) {
        connectionStatus = 'connected'
        return usersCollection
    }

    const database = await connectMongo()
    usersCollection = database.collection<UserDocument>('users')

    if (!usersIndexesPromise) {
        usersIndexesPromise = Promise.all([
            usersCollection.createIndex({ email: 1 }, { unique: true }),
            usersCollection.createIndex({ googleId: 1 }, { unique: true }),
            usersCollection.createIndex({ createdAt: -1 })
        ]).then(() => undefined)
    }

    await usersIndexesPromise

    return usersCollection
}

