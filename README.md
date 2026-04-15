# telegram-mcp

Telegram MCP server for Claude Code — deploy your own instance on Cloudflare Workers in 2 minutes.

Gives Claude Code 7 tools: `send_message`, `read_messages`, `react`, `edit_message`, `delete_message`, `download_attachment`, `manage_access`.

## Quick Setup

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
2. Telegram bot token — message [@BotFather](https://t.me/BotFather), send `/newbot`
3. Cloudflare API token — [create here](https://dash.cloudflare.com/profile/api-tokens) using **"Edit Cloudflare Workers"** template

### Deploy (one command)

```bash
git clone https://github.com/NEWSOROS/telegram-mcp.git
cd telegram-mcp
bash setup.sh
```

The script will ask for your Cloudflare Account ID, API token, and Telegram bot token, then deploy everything automatically.

### Connect to Claude Code

After setup, copy the MCP endpoint URL from the output and:

1. Open **Claude Code Desktop**
2. Go to **Settings** → **Connectors** → **Add custom connector**
3. Paste the URL (e.g. `https://telegram-mcp.your-subdomain.workers.dev/mcp`)

Done! Claude Code now has Telegram tools.

## Manual Setup

If the script doesn't work on your system:

```bash
# 1. Install deps
bun install

# 2. Build
bun x wrangler deploy --dry-run --outdir=dist --experimental-autoconfig=false

# 3. Deploy (replace values)
export CF_ACCOUNT_ID="your_account_id"
export CF_API_TOKEN="your_api_token"
export TG_BOT_TOKEN="your_bot_token"

# Upload to Cloudflare
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/telegram-mcp" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F "metadata=@-;type=application/json" <<< '{"main_module":"index.js","compatibility_date":"2025-03-10","compatibility_flags":["nodejs_compat"],"bindings":[{"type":"durable_object_namespace","name":"STORE","class_name":"MessageStore"},{"type":"secret_text","name":"TELEGRAM_BOT_TOKEN","text":"'$TG_BOT_TOKEN'"}],"migrations":{"new_sqlite_classes":["MessageStore"],"tag":"v1"}}' \
  -F "index.js=@dist/index.js;type=application/javascript+module"

# 4. Set Telegram webhook
curl "https://api.telegram.org/bot$TG_BOT_TOKEN/setWebhook?url=https://telegram-mcp.YOUR-SUBDOMAIN.workers.dev/webhook"
```

## Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send text to a chat (auto-splits at 4096 chars) |
| `read_messages` | Read incoming messages from buffer |
| `react` | Add emoji reaction to a message |
| `edit_message` | Edit a bot's sent message |
| `delete_message` | Delete a message |
| `download_attachment` | Get download URL for photo/doc/audio/video |
| `manage_access` | Control who can message the bot (allowlist) |

## Access Control

By default, the bot accepts messages from everyone. Once you add the first user/chat to the allowlist, only allowed senders are accepted.

```
manage_access(action: "allow", type: "user", id: "123456789", label: "@username")
manage_access(action: "allow", type: "chat", id: "-100123456", label: "My Group")
manage_access(action: "deny", type: "user", id: "123456789")
manage_access(action: "list")
```

## Architecture

- **Cloudflare Workers** — serverless, free tier, global edge
- **Durable Objects** — SQLite storage for messages and access list
- **Telegram Webhooks** — push-based, no polling
- **Zero dependencies** — no npm packages in runtime, just Workers APIs

## Custom Domain (optional)

Instead of `*.workers.dev`, use your own domain:

1. Add domain to Cloudflare DNS
2. Create `AAAA` record: name=`tg`, content=`100::`, proxied=on
3. In Workers & Pages → telegram-mcp → Settings → Domains, add `tg.yourdomain.com`
4. Update webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tg.yourdomain.com/webhook`
