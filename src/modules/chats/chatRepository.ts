import type { Collection, WithId } from 'mongodb'
import type { Chat, ChatMessage, MessageType } from './chat.js'
import { ObjectId } from 'mongodb'
import { getChatsCollection } from '../../config/mongo.js'

export interface ChatMessageDocument {
    id: string
    userId: string
    content: string
    type: MessageType
    timestamp: Date
    isPinned: boolean
}

export interface ChatDocument {
    _id?: ObjectId
    roomId: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    messages: ChatMessageDocument[]
    pinnedMessageId?: string
}

let collection: Collection<ChatDocument> | null = null

const resolveCollection = async (): Promise<Collection<ChatDocument>> => {
    if (collection) {
        return collection
    }

    collection = await getChatsCollection()
    return collection
}

const toChat = (document: WithId<ChatDocument>): Chat => {
    const chat: Chat = {
        id: document._id.toString(),
        roomId: document.roomId,
        isActive: document.isActive,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        messages: document.messages.map((message) => ({
            id: message.id,
            userId: message.userId,
            content: message.content,
            type: message.type,
            timestamp: message.timestamp,
            isPinned: message.isPinned
        }))
    }

    if (document.pinnedMessageId) {
        chat.pinnedMessageId = document.pinnedMessageId
    }

    return chat
}

const chatRepository = {
    async findByRoomId(roomId: string): Promise<Chat | null> {
        const chatsCollection = await resolveCollection()
        const document = await chatsCollection.findOne({ roomId })

        if (!document) {
            return null
        }

        return toChat(document)
    },

    async createForRoom(roomId: string): Promise<Chat> {
        const chatsCollection = await resolveCollection()
        const now = new Date()

        const document: ChatDocument = {
            roomId,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            messages: []
        }

        const result = await chatsCollection.insertOne(document)

        return {
            id: result.insertedId.toString(),
            roomId,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            messages: []
        }
    },

    async ensureByRoomId(roomId: string): Promise<Chat> {
        const existing = await chatRepository.findByRoomId(roomId)

        if (existing) {
            return existing
        }

        return chatRepository.createForRoom(roomId)
    },

    async appendMessage(roomId: string, userId: string, content: string, type: MessageType): Promise<ChatMessage> {
        const chatsCollection = await resolveCollection()
        const now = new Date()

        const message: ChatMessageDocument = {
            id: new ObjectId().toHexString(),
            userId,
            content,
            type,
            timestamp: now,
            isPinned: false
        }

        await chatRepository.ensureByRoomId(roomId)

        await chatsCollection.updateOne(
            { roomId },
            {
                $push: { messages: message },
                $set: { updatedAt: now }
            }
        )

        return {
            id: message.id,
            userId: message.userId,
            content: message.content,
            type: message.type,
            timestamp: message.timestamp,
            isPinned: message.isPinned
        }
    },

    async getMessages(roomId: string, limit: number): Promise<ChatMessage[]> {
        const chat = await chatRepository.findByRoomId(roomId)

        if (!chat) {
            return []
        }

        if (limit <= 0) {
            return []
        }

        return chat.messages.slice(-limit)
    },

    async pinMessage(roomId: string, messageId: string): Promise<boolean> {
        const chatsCollection = await resolveCollection()
        const now = new Date()

        await chatRepository.ensureByRoomId(roomId)

        await chatsCollection.updateOne(
            { roomId },
            {
                $set: {
                    'messages.$[].isPinned': false,
                    updatedAt: now
                } as never,
                $unset: {
                    pinnedMessageId: ''
                }
            }
        )

        const result = await chatsCollection.updateOne(
            { roomId, 'messages.id': messageId },
            {
                $set: {
                    'messages.$.isPinned': true,
                    pinnedMessageId: messageId,
                    updatedAt: now
                } as never
            }
        )

        return result.matchedCount > 0
    },

    async clearMessages(roomId: string): Promise<void> {
        const chatsCollection = await resolveCollection()

        await chatRepository.ensureByRoomId(roomId)

        await chatsCollection.updateOne(
            { roomId },
            {
                $set: {
                    messages: [],
                    updatedAt: new Date()
                },
                $unset: {
                    pinnedMessageId: ''
                }
            }
        )
    }
}

export default chatRepository

