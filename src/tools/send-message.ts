import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Bot } from 'grammy'
import { config } from '../config.ts'

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // Try to split on paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLen)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLen)
    if (splitAt <= 0) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  return chunks
}

export function registerSendMessage(server: McpServer, bot: Bot): void {
  server.tool(
    'send_message',
    'Send a text message to a Telegram chat. Automatically splits long messages at paragraph boundaries. Returns the message_id of each sent message.',
    {
      chat_id: z.string().describe('Telegram chat ID to send the message to'),
      text: z.string().min(1).describe('Message text to send'),
      parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional().describe('Message formatting mode'),
    },
    async ({ chat_id, text, parse_mode }) => {
      const chunks = chunkText(text, config.maxChunkSize)
      const messageIds: number[] = []

      for (const chunk of chunks) {
        const sent = await bot.api.sendMessage(chat_id, chunk, {
          parse_mode,
        })
        messageIds.push(sent.message_id)
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, message_ids: messageIds, chunks: chunks.length }, null, 2),
        }],
      }
    }
  )
}
