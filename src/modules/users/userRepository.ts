import { Collection, ObjectId, type WithId } from 'mongodb'
import { getUsersCollection } from '../../config/mongo.js'
import type { CreateUserInput, UpdateUserInput, User } from './user.js'
import type { RoomGenre } from '../rooms/room.js'

export interface UserDocument {
  _id?: ObjectId
  googleId: string
  name: string
  email: string
  picture?: string
  favoriteGenres: string[]
  createdAt: Date
  updatedAt: Date
}

let collection: Collection<UserDocument> | null = null

const resolveCollection = async (): Promise<Collection<UserDocument>> => {
  if (collection) {
    return collection
  }

  collection = await getUsersCollection()
  return collection
}

const toUser = (doc: WithId<UserDocument>): User => {
  const user: User = {
    id: doc._id.toString(),
    googleId: doc.googleId,
    name: doc.name,
    email: doc.email,
    favoriteGenres: doc.favoriteGenres,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }

  if (doc.picture) {
    user.picture = doc.picture
  }

  return user
}

const userRepository = {
  async findAll(): Promise<User[]> {
    const usersCollection = await resolveCollection()
    const documents = await usersCollection.find({}).sort({ createdAt: -1 }).toArray()
    return documents.map((doc) => toUser(doc))
  },

  async findById(id: string): Promise<User | null> {
    if (!ObjectId.isValid(id)) {
      return null
    }

    const usersCollection = await resolveCollection()
    const document = await usersCollection.findOne({ _id: new ObjectId(id) })
    return document ? toUser(document) : null
  },

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase()
    const usersCollection = await resolveCollection()
    const document = await usersCollection.findOne({ email: normalizedEmail })
    return document ? toUser(document) : null
  },

  async create(input: CreateUserInput): Promise<User> {
    const usersCollection = await resolveCollection()
    const now = new Date()
    const createPayload: UserDocument = {
      googleId: input.googleId,
      name: input.name,
      email: input.email.toLowerCase(),
      favoriteGenres: [],
      createdAt: now,
      updatedAt: now
    }

    if (input.picture) {
      createPayload.picture = input.picture
    }

    const result = await usersCollection.insertOne(createPayload)
    return toUser({ ...createPayload, _id: result.insertedId })
  },

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    if (!ObjectId.isValid(id)) {
      return null
    }

    const usersCollection = await resolveCollection()
    const updatePayload: Partial<UserDocument> = {
      updatedAt: new Date()
    }

    if (input.name !== undefined) {
      updatePayload.name = input.name
    }

    if (input.email !== undefined) {
      updatePayload.email = input.email.toLowerCase()
    }

    if (input.picture !== undefined) {
      updatePayload.picture = input.picture
    }

    const document = await usersCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updatePayload },
      { returnDocument: 'after' }
    )

    return document ? toUser(document) : null
  },

  async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false
    }

    const usersCollection = await resolveCollection()
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) })
    return result.deletedCount > 0
  },

  async addFavoriteGenre(id: string, genre: RoomGenre): Promise<User | null> {
    if (!ObjectId.isValid(id)) {
      return null
    }

    const usersCollection = await resolveCollection()
    const document = await usersCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $addToSet: { favoriteGenres: genre },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    return document ? toUser(document) : null
  }
}

export default userRepository



