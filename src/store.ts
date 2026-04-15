export interface StoredMessage {
  messageId: number
  chatId: string
  chatTitle?: string
  fromId?: string
  fromUsername?: string
  fromFirstName?: string
  text?: string
  date: number
  hasPhoto: boolean
  hasDocument: boolean
  hasAudio: boolean
  hasVideo: boolean
  hasVoice: boolean
  fileId?: string
  fileName?: string
}

export class MessageStore {
  private buffer: StoredMessage[] = []
  private maxSize: number

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize
  }

  add(msg: StoredMessage): void {
    this.buffer.push(msg)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  getRecent(limit: number = 20): StoredMessage[] {
    return this.buffer.slice(-limit)
  }

  getByChat(chatId: string, limit: number = 20): StoredMessage[] {
    return this.buffer
      .filter(m => m.chatId === chatId)
      .slice(-limit)
  }

  getByMessageId(chatId: string, messageId: number): StoredMessage | undefined {
    return this.buffer.find(m => m.chatId === chatId && m.messageId === messageId)
  }

  getChats(): { chatId: string; chatTitle?: string; messageCount: number }[] {
    const chats = new Map<string, { chatTitle?: string; count: number }>()
    for (const msg of this.buffer) {
      const entry = chats.get(msg.chatId) ?? { chatTitle: msg.chatTitle, count: 0 }
      entry.count++
      if (msg.chatTitle) entry.chatTitle = msg.chatTitle
      chats.set(msg.chatId, entry)
    }
    return Array.from(chats.entries()).map(([chatId, { chatTitle, count }]) => ({
      chatId,
      chatTitle,
      messageCount: count,
    }))
  }
}
