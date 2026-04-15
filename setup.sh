#!/bin/bash
# Telegram MCP — quick setup script
# Deploys your own instance to Cloudflare Workers

set -e

echo "=== Telegram MCP Setup ==="
echo ""

# Check prerequisites
if ! command -v bun &> /dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Get user inputs
read -p "Cloudflare Account ID: " CF_ACCOUNT_ID
read -p "Cloudflare API Token (Edit Workers): " CF_API_TOKEN
read -p "Telegram Bot Token (from @BotFather): " TG_BOT_TOKEN
read -p "Worker name [telegram-mcp]: " WORKER_NAME
WORKER_NAME=${WORKER_NAME:-telegram-mcp}

echo ""
echo "Installing dependencies..."
bun install

echo "Building..."
rm -rf dist
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" \
  bunx wrangler deploy --dry-run --outdir=dist --experimental-autoconfig=false 2>&1 | tail -5

echo "Deploying to Cloudflare Workers..."
bun -e "
const code = await Bun.file('dist/index.js').text();
const metadata = JSON.stringify({
  main_module: 'index.js',
  compatibility_date: '2025-03-10',
  compatibility_flags: ['nodejs_compat'],
  bindings: [
    { type: 'durable_object_namespace', name: 'STORE', class_name: 'MessageStore' },
    { type: 'secret_text', name: 'TELEGRAM_BOT_TOKEN', text: '${TG_BOT_TOKEN}' },
  ],
  migrations: { new_sqlite_classes: ['MessageStore'], tag: 'v1' },
});
const form = new FormData();
form.append('metadata', new Blob([metadata], { type: 'application/json' }));
form.append('index.js', new Blob([code], { type: 'application/javascript+module' }), 'index.js');
const res = await fetch('https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}', {
  method: 'PUT', headers: { Authorization: 'Bearer ${CF_API_TOKEN}' }, body: form,
});
const json = await res.json();
if (!json.success) { console.error('Deploy failed:', JSON.stringify(json.errors)); process.exit(1); }
console.log('Deployed!');
"

# Enable workers.dev subdomain
echo "Enabling workers.dev route..."
bun -e "
await fetch('https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain', {
  method: 'POST',
  headers: { Authorization: 'Bearer ${CF_API_TOKEN}', 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: true }),
});
const sub = await fetch('https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/subdomain', {
  headers: { Authorization: 'Bearer ${CF_API_TOKEN}' },
});
const { result } = await sub.json();
const base = 'https://${WORKER_NAME}.' + result.subdomain + '.workers.dev';
console.log('Worker URL: ' + base);

// Setup Telegram webhook
const tg = await fetch('https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: base + '/webhook' }),
});
const tgJson = await tg.json();
console.log('Webhook:', tgJson.ok ? 'set!' : tgJson.description);
console.log('');
console.log('=== READY ===');
console.log('MCP endpoint:  ' + base + '/mcp');
console.log('');
console.log('Add to Claude Code Desktop:');
console.log('  Settings → Connectors → Add custom connector');
console.log('  URL: ' + base + '/mcp');
console.log('');
console.log('Or if you have a custom domain, add a DNS AAAA record');
console.log('pointing to 100:: (proxied) and create a route in CF dashboard.');
"
