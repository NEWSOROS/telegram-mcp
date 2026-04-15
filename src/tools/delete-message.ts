import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Bot } from 'grammy'

export function registerDeleteMessage(server: McpServer, bot: Bot): void {
  server.tool(
    'delete_message',
    'Delete a message from a Telegram chat. The bot can delete its own messages, and in groups it can delete others\' messages if it has admin rights.',
    {
      chat_id: z.string().describe('Telegram chat ID'),
      message_id: z.number().int().describe('Message ID to delete'),
    },
    async ({ chat_id, message_id }) => {
      await bot.api.deleteMessage(chat_id, message_id)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, chat_id, message_id, deleted: true }, null, 2),
        }],
      }
    }
  )
}
