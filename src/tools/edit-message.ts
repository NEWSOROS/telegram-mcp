import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Bot } from 'grammy'

export function registerEditMessage(server: McpServer, bot: Bot): void {
  server.tool(
    'edit_message',
    'Edit a previously sent message. Only messages sent by the bot can be edited.',
    {
      chat_id: z.string().describe('Telegram chat ID'),
      message_id: z.number().int().describe('Message ID to edit'),
      text: z.string().min(1).describe('New message text'),
      parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional().describe('Message formatting mode'),
    },
    async ({ chat_id, message_id, text, parse_mode }) => {
      await bot.api.editMessageText(chat_id, message_id, text, {
        parse_mode,
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, chat_id, message_id, edited: true }, null, 2),
        }],
      }
    }
  )
}
