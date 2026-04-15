#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { bot, store, startBot, stopBot } from './bot.ts'
import { registerSendMessage } from './tools/send-message.ts'
import { registerReadMessages } from './tools/read-messages.ts'
import { registerReact } from './tools/react.ts'
import { registerEditMessage } from './tools/edit-message.ts'
import { registerDeleteMessage } from './tools/delete-message.ts'
import { registerDownloadAttachment } from './tools/download-attachment.ts'

// Safety net — log errors instead of crashing
process.on('unhandledRejection', (err) => {
  process.stderr.write(`telegram-mcp: unhandled rejection: ${err}\n`)
})
process.on('uncaughtException', (err) => {
  process.stderr.write(`telegram-mcp: uncaught exception: ${err}\n`)
})

const server = new McpServer({
  name: 'telegram-mcp',
  version: '1.0.0',
})

// Register all tools
registerSendMessage(server, bot)
registerReadMessages(server, store)
registerReact(server, bot)
registerEditMessage(server, bot)
registerDeleteMessage(server, bot)
registerDownloadAttachment(server, bot, store)

// Start bot polling in background, then connect MCP transport
async function main(): Promise<void> {
  await startBot()

  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.stderr.write('telegram-mcp: MCP server connected via stdio\n')
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  process.stderr.write('telegram-mcp: shutting down...\n')
  await stopBot()
  await server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((err) => {
  process.stderr.write(`telegram-mcp: fatal error: ${err}\n`)
  process.exit(1)
})
