# telegram-mcp

Telegram MCP server for Claude Code. Deploy your own instance on Cloudflare Workers in 2 minutes. Free.

Claude Code gets 7 tools: `send_message`, `read_messages`, `react`, `edit_message`, `delete_message`, `download_attachment`, `manage_access`.

## Quick Start

### 1. Get credentials (3 min)

| What | Where | How |
|------|-------|-----|
| **Cloudflare Account ID** | [dash.cloudflare.com](https://dash.cloudflare.com) | Right sidebar on main page, copy "Account ID" |
| **Cloudflare API Token** | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) | Create Token → template **"Edit Cloudflare Workers"** → Continue → Create Token |
| **Telegram Bot Token** | [@BotFather](https://t.me/BotFather) in Telegram | Send `/newbot`, follow prompts, copy token like `123456789:AAH...` |

### 2. Deploy (1 min)

```bash
git clone https://github.com/NEWSOROS/telegram-mcp.git
cd telegram-mcp
bash setup.sh
```

The script asks:

```
Cloudflare Account ID: xxxxxxxxxxxxxxxxx
Cloudflare API Token:  cfut_xxxxxxxxxxxxx
Telegram Bot Token:    123456789:AAH...
Worker name [telegram-mcp]: <enter>
Custom domain (e.g. tg.example.com, leave empty for workers.dev): <enter or your domain>
```

- **Worker name** — any name, default is fine
- **Custom domain** — optional. If you have a domain on Cloudflare, enter subdomain like `tg.yourdomain.com`. Leave empty to use free `*.workers.dev` URL

Output:

```
=== READY ===
MCP endpoint:  https://telegram-mcp.xxx.workers.dev/mcp
```

### 3. Connect to Claude Code (30 sec)

1. Open **Claude Code Desktop**
2. **Settings** → **Connectors** → **Add custom connector**
3. Paste the MCP endpoint URL from step 2

Done! Send a message to your bot in Telegram, then ask Claude to `read_messages`.

## Prerequisites

- [Bun](https://bun.sh) — installed automatically by setup.sh if missing
- [Cloudflare account](https://dash.cloudflare.com/sign-up) — free, no credit card
- Telegram account

## Tools

| Tool | What it does |
|------|-------------|
| `send_message` | Send text to a chat. Auto-splits at 4096 chars |
| `read_messages` | Read recent incoming messages from buffer (up to 500) |
| `react` | Add emoji reaction to a message |
| `edit_message` | Edit a message sent by the bot |
| `delete_message` | Delete a message |
| `download_attachment` | Get download URL for photo/doc/audio/video |
| `manage_access` | Allowlist: control who can message the bot |

## Access Control

By default the bot accepts messages from **everyone** (so you can test it right away).

Once you add the first entry to the allowlist, **only listed users/chats are accepted** — everyone else is silently ignored.

### Manage via Claude Code

Tell Claude:
- "Allow user 144802793 (@username) to message the bot"
- "Show me the access list"
- "Remove user 144802793 from the allowlist"
- "Allow group chat -100123456789"

Or use tools directly:

```
manage_access(action: "list")
manage_access(action: "allow", type: "user", id: "144802793", label: "@username")
manage_access(action: "allow", type: "chat", id: "-100123456", label: "My Group")
manage_access(action: "deny",  type: "user", id: "144802793")
```

- `type: "user"` — for DM conversations
- `type: "chat"` — for group chats where the bot is a member

### How to find IDs

- **Your user ID** — send any message to the bot, then `read_messages` — see `chat_id` field
- **Group chat ID** — add bot to the group, send a message, then `read_messages` — groups have negative IDs like `-100123456789`

## Custom Domain

The setup script handles this automatically if you enter a domain. What it does:

1. Finds your domain's zone in Cloudflare
2. Creates DNS record: `AAAA tg → 100:: (proxied)`
3. Creates worker route: `tg.yourdomain.com/* → telegram-mcp`
4. Sets Telegram webhook to `https://tg.yourdomain.com/webhook`

**Requirements:** domain must be added to Cloudflare (nameservers pointing to CF). The API token needs **Zone:DNS:Edit** permission if you want automatic DNS setup — otherwise the script will tell you to create the record manually.

## Manual Deploy (no script)

If `setup.sh` doesn't work on your OS:

```bash
# Install deps
bun install

# Build
bunx wrangler deploy --dry-run --outdir=dist --experimental-autoconfig=false

# Set your values
CF_ACCOUNT_ID="your_account_id"
CF_API_TOKEN="your_api_token"
TG_BOT_TOKEN="your_bot_token"

# Deploy via API
bun -e "
const code = await Bun.file('dist/index.js').text();
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'index.js',
  compatibility_date: '2025-03-10',
  compatibility_flags: ['nodejs_compat'],
  bindings: [
    { type: 'durable_object_namespace', name: 'STORE', class_name: 'MessageStore' },
    { type: 'secret_text', name: 'TELEGRAM_BOT_TOKEN', text: '$TG_BOT_TOKEN' },
  ],
  migrations: { new_sqlite_classes: ['MessageStore'], tag: 'v1' },
})], { type: 'application/json' }));
form.append('index.js', new Blob([code], { type: 'application/javascript+module' }), 'index.js');
const r = await fetch('https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/telegram-mcp', {
  method: 'PUT', headers: { Authorization: 'Bearer $CF_API_TOKEN' }, body: form,
});
console.log((await r.json()).success ? 'Deployed!' : 'Failed');
"

# Set Telegram webhook (replace URL with yours)
curl "https://api.telegram.org/bot$TG_BOT_TOKEN/setWebhook?url=https://YOUR-WORKER-URL/webhook"
```

## Architecture

```
Telegram User
     ↓ sends message
Telegram API
     ↓ webhook POST
Cloudflare Worker (tg.yourdomain.com/webhook)
     ↓ stores in
Durable Object (SQLite: messages + access_list)
     ↑ reads from
Cloudflare Worker (tg.yourdomain.com/mcp)
     ↑ JSON-RPC calls
Claude Code Desktop
```

- **Cloudflare Workers** — serverless, free tier, runs on 300+ edge locations
- **Durable Objects** — persistent SQLite per instance (messages + allowlist)
- **Telegram Webhooks** — push-based, instant delivery, no polling
- **Zero runtime dependencies** — just Workers APIs and `fetch()`

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/mcp` | POST | MCP JSON-RPC endpoint (for Claude Code) |
| `/webhook` | POST | Telegram sends updates here |
| `/setup` | GET | One-time webhook registration |
| `/` | GET | Server info |

## Troubleshooting

**Bot doesn't receive messages:**
- Check webhook: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Re-set webhook: visit `https://your-url/setup`

**"No messages" in read_messages:**
- Send a message to the bot in Telegram first
- If access list is not empty, make sure your user ID is in it

**Deploy fails:**
- Check API token has "Edit Cloudflare Workers" permissions
- Check Account ID is correct (from CF dashboard sidebar)

**Custom domain not working:**
- Verify DNS record exists: `AAAA` record, proxied (orange cloud)
- Worker route must match: `tg.yourdomain.com/*`
- API token may need Zone:DNS:Edit permission for automatic setup
