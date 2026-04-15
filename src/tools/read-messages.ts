import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MessageStore } from '../store.ts'

export function registerReadMessages(server: McpServer, store: MessageStore): void {
  server.tool(
    'read_messages',
    'Read recent incoming messages from the buffer. Without chat_id returns messages from all chats. Returns message metadata including sender, text, date, and attachment info.',
    {
      chat_id: z.string().optional().describe('Filter messages by chat ID. Omit to get messages from all chats'),
      limit: z.number().int().min(1).max(100).default(20).describe('Number of recent messages to return (1-100)'),
    },
    async ({ chat_id, limit }) => {
      const messages = chat_id
        ? store.getByChat(chat_id, limit)
        : store.getRecent(limit)

      const chats = store.getChats()

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            messages,
            total_in_buffer: messages.length,
            available_chats: chats,
          }, null, 2),
        }],
      }
    }
  )
}
