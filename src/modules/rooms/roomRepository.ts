import { Collection, ObjectId, type WithId } from 'mongodb'
import { getRoomsCollection } from '../../config/mongo.js'
import type { PlaybackState, Room } from './room.js'

export interface RoomDocument {
    _id?: ObjectId
    name: string
    isPrivate: boolean
    accessCode: string
    maxUsers: number
    hostId: string
    userIds: string[]
    chatId?: string
    state: 'waiting' | 'active' | 'finished'
    genres: 'action' | 'adventure' | 'comedy' | 'drama' | 'fantasy' | 'horror' | 'romance' | 'sci-fi' | 'thriller' | 'western' | 'other'
    contentUrl: string
    playback: PlaybackState
    createdAt: Date
    updatedAt: Date
}

export type CreateRoomInput = Pick<Room,
    'name' | 'isPrivate' | 'accessCode' | 'maxUsers' | 'hostId' | 'genres' | 'contentUrl'
>

export type UpdateRoomInput = Partial<Pick<Room,
    'name' | 'isPrivate' | 'accessCode' | 'maxUsers' | 'hostId' | 'userIds' | 'chatId' | 'state' | 'contentUrl' | 'playback'
>>

let collection: Collection<RoomDocument> | null = null

const resolveCollection = async (): Promise<Collection<RoomDocument>> => {
    if (collection) {
        return collection
    }

    collection = await getRoomsCollection()
    return collection
}

const toRoom = (doc: WithId<RoomDocument>): Room => ({
    id: doc._id.toString(),
    name: doc.name,
    isPrivate: doc.isPrivate,
    accessCode: doc.accessCode,
    maxUsers: doc.maxUsers,
    hostId: doc.hostId,
    userIds: doc.userIds,
    chatId: doc.chatId ?? '',
    state: doc.state,
    genres: doc.genres,
    contentUrl: doc.contentUrl,
    playback: doc.playback,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
})

const roomRepository = {
    async findAll(): Promise<Room[]> {
        const roomsCollection = await resolveCollection()
        const documents = await roomsCollection.find({}).sort({ createdAt: -1 }).toArray()
        return documents.map((doc) => toRoom(doc))
    },

    async findByUserId(userId: string): Promise<Room[]> {
        if (!ObjectId.isValid(userId)) {
            return []
        }

        const roomsCollection = await resolveCollection()
        const documents = await roomsCollection
            .find({ userIds: userId })
            .sort({ createdAt: -1 })
            .toArray()

        return documents.map((doc) => toRoom(doc))
    },

    async findById(id: string): Promise<Room | null> {
        if (!ObjectId.isValid(id)) {
            return null
        }

        const roomsCollection = await resolveCollection()
        const document = await roomsCollection.findOne({ _id: new ObjectId(id) })
        return document ? toRoom(document) : null
    },

    async create(data: CreateRoomInput): Promise<Room> {
        const roomsCollection = await resolveCollection()
        const now = new Date()
        const document: RoomDocument = {
            name: data.name,
            isPrivate: data.isPrivate,
            accessCode: data.accessCode,
            maxUsers: data.maxUsers,
            hostId: data.hostId,
            userIds: [data.hostId],
            state: 'waiting',
            genres: data.genres,
            contentUrl: data.contentUrl,
            playback: {
                isPlaying: false,
                positionMs: 0,
                updatedAt: now,
                updatedBy: data.hostId,
                version: 0
            },
            createdAt: now,
            updatedAt: now
        }

        const result = await roomsCollection.insertOne(document)
        return toRoom({ ...document, _id: result.insertedId })
    },

    async update(id: string, data: UpdateRoomInput): Promise<Room | null> {
        if (!ObjectId.isValid(id)) {
            return null
        }

        const roomsCollection = await resolveCollection()
        const document = await roomsCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            {
                $set: {
                    ...data,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        )

        return document ? toRoom(document) : null
    },

    async delete(id: string): Promise<boolean> {
        if (!ObjectId.isValid(id)) {
            return false
        }

        const roomsCollection = await resolveCollection()
        const result = await roomsCollection.deleteOne({ _id: new ObjectId(id) })
        return result.deletedCount > 0
    },

    async addUser(roomId: string, userId: string): Promise<Room | null> {
        if (!ObjectId.isValid(roomId)) {
            return null
        }

        const roomsCollection = await resolveCollection()
        const document = await roomsCollection.findOneAndUpdate(
            { _id: new ObjectId(roomId) },
            {
                $addToSet: { userIds: userId },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        )

        return document ? toRoom(document) : null
    },

    async addUserAtomically(roomId: string, userId: string): Promise<Room | null> {
        if (!ObjectId.isValid(roomId)) {
            return null
        }

        const roomsCollection = await resolveCollection()
        const document = await roomsCollection.findOneAndUpdate(
            {
                _id: new ObjectId(roomId),
                state: { $ne: 'finished' },
                $or: [
                    { userIds: userId },
                    { $expr: { $lt: [{ $size: '$userIds' }, '$maxUsers'] } }
                ]
            },
            {
                $addToSet: { userIds: userId },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        )

        return document ? toRoom(document) : null
    },

    async removeUser(roomId: string, userId: string): Promise<Room | null> {
        if (!ObjectId.isValid(roomId)) {
            return null
        }

        const roomsCollection = await resolveCollection()
        const document = await roomsCollection.findOneAndUpdate(
            { _id: new ObjectId(roomId) },
            {
                $pull: { userIds: userId },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        )

        return document ? toRoom(document) : null
    }
}


export default roomRepository