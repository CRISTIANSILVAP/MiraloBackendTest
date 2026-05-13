export type RoomGenre =
  | 'action'
  | 'adventure'
  | 'comedy'
  | 'drama'
  | 'fantasy'
  | 'horror'
  | 'romance'
  | 'sci-fi'
  | 'thriller'
  | 'western'
  | 'other'

export interface PlaybackState {
  isPlaying: boolean
  positionMs: number
  updatedAt: Date
  updatedBy: string
  version: number
}

export interface Room {
  id: string
  name: string
  isPrivate: boolean
  accessCode: string
  maxUsers: number
  hostId: string
  userIds: string[]
  chatId: string
  state: 'waiting' | 'active' | 'finished'
  genres: RoomGenre
  contentUrl: string
  playback: PlaybackState
  createdAt: Date
  updatedAt: Date
}


