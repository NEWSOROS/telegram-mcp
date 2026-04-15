import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_DIR = process.env.TELEGRAM_STATE_DIR ?? join(homedir(), '.claude', 'channels', 'telegram-mcp')

// Load .env — try Claude Code channel dir first, then project root as fallback
function loadEnv(path: string): void {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^(\w+)=(.*)$/)
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]
    }
  } catch {}
}

loadEnv(join(STATE_DIR, '.env'))
loadEnv(join(PROJECT_ROOT, '.env'))

const TOKEN = process.env.TELEGRAM_BOT_TOKEN

if (!TOKEN) {
  process.stderr.write(
    'telegram-mcp: TELEGRAM_BOT_TOKEN is required.\n' +
    '  Configure via: /telegram-mcp:configure <token>\n' +
    `  Or create ${join(STATE_DIR, '.env')} with:\n` +
    '  TELEGRAM_BOT_TOKEN=123456789:AAH...\n'
  )
  process.exit(1)
}

export const config = {
  token: TOKEN,
  stateDir: STATE_DIR,
  maxBufferSize: 500,
  maxChunkSize: 4096,
  downloadDir: join(STATE_DIR, 'downloads'),
} as const
