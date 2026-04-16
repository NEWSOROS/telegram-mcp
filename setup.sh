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
read -p "Custom domain (e.g. tg.example.com, leave empty for workers.dev): " CUSTOM_DOMAIN

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

echo "Configuring domain..."
bun -e "
const CF_ACCOUNT_ID = '${CF_ACCOUNT_ID}';
const CF_API_TOKEN = '${CF_API_TOKEN}';
const TG_BOT_TOKEN = '${TG_BOT_TOKEN}';
const WORKER_NAME = '${WORKER_NAME}';
const CUSTOM_DOMAIN = '${CUSTOM_DOMAIN}'.trim();

let base = '';

if (CUSTOM_DOMAIN) {
  // Find zone for the domain
  const rootDomain = CUSTOM_DOMAIN.split('.').slice(-2).join('.');
  const zoneRes = await fetch('https://api.cloudflare.com/client/v4/zones?name=' + rootDomain, {
    headers: { Authorization: 'Bearer ' + CF_API_TOKEN },
  });
  const zoneJson = await zoneRes.json();
  const zone = zoneJson.result?.[0];

  if (!zone) {
    console.error('Domain ' + rootDomain + ' not found in Cloudflare. Add it first.');
    console.error('Falling back to workers.dev...');
  } else {
    const zoneId = zone.id;
    const subdomain = CUSTOM_DOMAIN.replace('.' + rootDomain, '');

    // Create DNS record
    const dnsRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'AAAA', name: subdomain, content: '100::', proxied: true, ttl: 1 }),
    });
    const dnsJson = await dnsRes.json();
    if (dnsJson.success) {
      console.log('DNS record created: ' + CUSTOM_DOMAIN);
    } else if (dnsJson.errors?.[0]?.code === 81057) {
      console.log('DNS record already exists: ' + CUSTOM_DOMAIN);
    } else {
      console.log('DNS warning: ' + JSON.stringify(dnsJson.errors));
      console.log('You may need to create the DNS record manually:');
      console.log('  Type: AAAA, Name: ' + subdomain + ', Content: 100::, Proxied: on');
    }

    // Create worker route
    const routeRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/workers/routes', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: CUSTOM_DOMAIN + '/*', script: WORKER_NAME }),
    });
    const routeJson = await routeRes.json();
    if (routeJson.success) {
      console.log('Worker route created');
    } else if (routeJson.errors?.[0]?.code === 10020) {
      console.log('Worker route already exists');
    } else {
      console.log('Route warning: ' + JSON.stringify(routeJson.errors));
    }

    base = 'https://' + CUSTOM_DOMAIN;
  }
}

if (!base) {
  // Fallback: use workers.dev
  await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/workers/scripts/' + WORKER_NAME + '/subdomain', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  const sub = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/workers/subdomain', {
    headers: { Authorization: 'Bearer ' + CF_API_TOKEN },
  });
  const { result } = await sub.json();
  base = 'https://' + WORKER_NAME + '.' + result.subdomain + '.workers.dev';
}

console.log('');
console.log('Worker URL: ' + base);

// Setup Telegram webhook
const tg = await fetch('https://api.telegram.org/bot' + TG_BOT_TOKEN + '/setWebhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: base + '/webhook' }),
});
const tgJson = await tg.json();
console.log('Webhook: ' + (tgJson.ok ? 'set!' : tgJson.description));
console.log('');
console.log('=== READY ===');
console.log('MCP endpoint:  ' + base + '/mcp');
console.log('');
console.log('Add to Claude Code Desktop:');
console.log('  Settings → Connectors → Add custom connector');
console.log('  URL: ' + base + '/mcp');
"
