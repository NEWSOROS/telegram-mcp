import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Bot } from 'grammy'
import type { MessageStore } from '../store.ts'
import { config } from '../config.ts'

export function registerDownloadAttachment(server: McpServer, bot: Bot, store: MessageStore): void {
  server.tool(
    'download_attachment',
    'Download a file attachment (photo, document, audio, video, voice) from a message. Returns the local file path where the file was saved.',
    {
      chat_id: z.string().describe('Telegram chat ID'),
      message_id: z.number().int().describe('Message ID that contains the attachment'),
      save_path: z.string().optional().describe('Custom save directory. Defaults to ./downloads/'),
    },
    async ({ chat_id, message_id, save_path }) => {
      const msg = store.getByMessageId(chat_id, message_id)
      if (!msg) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'Message not found in buffer' }, null, 2),
          }],
        }
      }

      if (!msg.fileId) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'Message has no attachment' }, null, 2),
          }],
        }
      }

      const file = await bot.api.getFile(msg.fileId)
      if (!file.file_path) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'Could not get file path from Telegram' }, null, 2),
          }],
        }
      }

      const url = `https://api.telegram.org/file/bot${config.token}/${file.file_path}`
      const response = await fetch(url)
      if (!response.ok) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `Download failed: ${response.status}` }, null, 2),
          }],
        }
      }

      const buffer = await response.arrayBuffer()
      const dir = save_path ?? config.downloadDir
      mkdirSync(dir, { recursive: true })

      const fileName = msg.fileName ?? file.file_path.split('/').pop() ?? `file_${message_id}`
      const filePath = join(dir, fileName)
      writeFileSync(filePath, Buffer.from(buffer))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            file_path: filePath,
            file_size: buffer.byteLength,
            file_name: fileName,
          }, null, 2),
        }],
      }
    }
  )
}
