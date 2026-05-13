export type MessageType = 'text' | 'system' | 'reaction'

export interface ChatMessage {
  id: string
  userId: string
  content: string
  type: MessageType
  timestamp: Date
  isPinned: boolean
}

export interface Chat {
  id: string
  roomId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  messages: ChatMessage[]
  pinnedMessageId?: string
}

export interface CreateMessageInput {
  roomId: string
  userId: string
  content: string
  type?: MessageType
}
