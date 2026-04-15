import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load .env from project root
try {
  const envPath = join(PROJECT_ROOT, '.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]
  }
} catch {}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN

if (!TOKEN) {
  process.stderr.write(
    'telegram-mcp: TELEGRAM_BOT_TOKEN is required.\n' +
    `  Create a .env file in ${PROJECT_ROOT} with:\n` +
    '  TELEGRAM_BOT_TOKEN=123456789:AAH...\n'
  )
  process.exit(1)
}

export const config = {
  token: TOKEN,
  maxBufferSize: 500,
  maxChunkSize: 4096,
  downloadDir: join(PROJECT_ROOT, 'downloads'),
} as const
