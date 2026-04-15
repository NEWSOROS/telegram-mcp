import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Bot } from 'grammy'

export function registerReact(server: McpServer, bot: Bot): void {
  server.tool(
    'react',
    'Add an emoji reaction to a message in Telegram. The bot must have permission to react in the chat.',
    {
      chat_id: z.string().describe('Telegram chat ID'),
      message_id: z.number().int().describe('Message ID to react to'),
      emoji: z.string().describe('Emoji reaction (e.g. "👍", "❤️", "🔥")'),
    },
    async ({ chat_id, message_id, emoji }) => {
      await bot.api.setMessageReaction(chat_id, message_id, [
        { type: 'emoji', emoji } as any,
      ])

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, chat_id, message_id, emoji }, null, 2),
        }],
      }
    }
  )
}
