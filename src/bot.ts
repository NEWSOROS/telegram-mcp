import { Bot } from 'grammy'
import { config } from './config.ts'
import { MessageStore, type StoredMessage } from './store.ts'

export const store = new MessageStore(config.maxBufferSize)
export const bot = new Bot(config.token)

function extractFileInfo(ctx: any): { fileId?: string; fileName?: string } {
  if (ctx.message?.photo) {
    const photos = ctx.message.photo
    const largest = photos[photos.length - 1]
    return { fileId: largest.file_id }
  }
  if (ctx.message?.document) {
    return {
      fileId: ctx.message.document.file_id,
      fileName: ctx.message.document.file_name,
    }
  }
  if (ctx.message?.audio) {
    return {
      fileId: ctx.message.audio.file_id,
      fileName: ctx.message.audio.file_name,
    }
  }
  if (ctx.message?.video) {
    return {
      fileId: ctx.message.video.file_id,
      fileName: ctx.message.video.file_name,
    }
  }
  if (ctx.message?.voice) {
    return { fileId: ctx.message.voice.file_id }
  }
  return {}
}

bot.on('message', (ctx) => {
  const msg = ctx.message
  const { fileId, fileName } = extractFileInfo(ctx)

  const stored: StoredMessage = {
    messageId: msg.message_id,
    chatId: String(msg.chat.id),
    chatTitle: 'title' in msg.chat ? msg.chat.title : undefined,
    fromId: msg.from ? String(msg.from.id) : undefined,
    fromUsername: msg.from?.username,
    fromFirstName: msg.from?.first_name,
    text: msg.text ?? msg.caption ?? undefined,
    date: msg.date,
    hasPhoto: !!msg.photo,
    hasDocument: !!msg.document,
    hasAudio: !!msg.audio,
    hasVideo: !!msg.video,
    hasVoice: !!msg.voice,
    fileId,
    fileName,
  }

  store.add(stored)
})

export async function startBot(): Promise<void> {
  // Don't log to stdout — MCP uses stdout for protocol messages
  process.stderr.write('telegram-mcp: starting bot polling...\n')
  bot.start({
    onStart: () => {
      process.stderr.write('telegram-mcp: bot is running\n')
    },
  })
}

export async function stopBot(): Promise<void> {
  await bot.stop()
}
