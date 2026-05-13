export interface User {
  id: string
  googleId: string
  name: string
  email: string
  picture?: string
  favoriteGenres: string[]
  createdAt: Date
  updatedAt: Date
}

export interface GoogleJwtPayload {
  sub: string
  email: string
  name: string
  picture?: string
}

export type CreateUserInput = Pick<User, 'googleId' | 'name' | 'email' | 'picture'>
export type UpdateUserInput = Partial<Pick<User, 'name' | 'email' | 'picture'>>

