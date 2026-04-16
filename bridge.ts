#!/usr/bin/env bun
/**
 * Telegram ↔ Claude Code Bridge
 *
 * Polls the telegram-mcp Worker for new messages and forwards them
 * to Claude Code CLI. Sends Claude's response back to Telegram.
 *
 * Usage:
 *   bun run bridge.ts
 *
 * Environment variables (or .env file):
 *   MCP_URL       - Your Worker's base URL (e.g. https://tg.tlinks.online)
 *   CLAUDE_PATH   - Path to claude CLI (auto-detected if not set)
 *   POLL_INTERVAL - Polling interval in ms (default: 2000)
 *   WORK_DIR      - Working directory for Claude Code (default: current dir)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { spawnSync } from "child_process";

// ── Load .env ──────────────────────────────────────────────
try {
  for (const line of readFileSync(join(import.meta.dir, ".env"), "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
  }
} catch {}

const MCP_URL = process.env.MCP_URL;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL ?? 2000);
const WORK_DIR = process.env.WORK_DIR ?? process.cwd();

if (!MCP_URL) {
  console.error("MCP_URL is required. Set it in .env or environment:");
  console.error("  MCP_URL=https://your-worker.workers.dev");
  process.exit(1);
}

// ── Find Claude CLI ────────────────────────────────────────
function findClaude(): string {
  if (process.env.CLAUDE_PATH) return process.env.CLAUDE_PATH;

  const candidates = [
    // Windows
    ...(function* () {
      const base = join(homedir(), "AppData", "Roaming", "Claude", "claude-code");
      try {
        const { readdirSync } = require("fs");
        for (const ver of readdirSync(base).sort().reverse()) {
          yield join(base, ver, "claude.exe");
        }
      } catch {}
    })(),
    // macOS
    "/usr/local/bin/claude",
    join(homedir(), ".claude", "bin", "claude"),
    // Linux
    "/usr/bin/claude",
  ];

  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {}
  }

  console.error("Claude CLI not found. Set CLAUDE_PATH in .env");
  process.exit(1);
}

const CLAUDE = findClaude();
console.log(`Bridge started`);
console.log(`  MCP:    ${MCP_URL}`);
console.log(`  Claude: ${CLAUDE}`);
console.log(`  Dir:    ${WORK_DIR}`);
console.log(`  Poll:   ${POLL_INTERVAL}ms`);
console.log("");

// ── MCP helpers ────────────────────────────────────────────
let rpcId = 0;
async function mcpCall(method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const json = (await res.json()) as { result?: { content?: { text?: string }[] }; error?: unknown };
  if (json.error) throw new Error(JSON.stringify(json.error));
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

async function sendMessage(chatId: string, text: string) {
  return mcpCall("tools/call", { name: "send_message", arguments: { chat_id: chatId, text } });
}

async function readMessages(limit = 20) {
  return mcpCall("tools/call", { name: "read_messages", arguments: { limit } });
}

// ── Run Claude CLI ─────────────────────────────────────────
function runClaude(prompt: string): string {
  console.log(`  → Claude: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);

  const result = spawnSync(CLAUDE, ["--print", prompt], {
    cwd: WORK_DIR,
    timeout: 300_000, // 5 min max
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    return `Error: ${result.error.message}`;
  }

  const output = (result.stdout ?? "").trim();
  if (!output && result.stderr) {
    return `Error: ${result.stderr.trim().slice(0, 500)}`;
  }

  return output || "(no output)";
}

// ── Main loop ──────────────────────────────────────────────
let lastSeenId = 0;
let processing = false;

// Get initial last message ID so we don't process old messages
try {
  const data = await readMessages(1);
  if (data.messages?.length > 0) {
    lastSeenId = data.messages[data.messages.length - 1].id;
    console.log(`Skipping ${lastSeenId} existing messages`);
  }
} catch (e) {
  console.error("Failed to get initial messages:", e);
}

console.log("Listening for Telegram messages...\n");

setInterval(async () => {
  if (processing) return;

  try {
    const data = await readMessages(50);
    const messages = (data.messages ?? []) as {
      id: number;
      chat_id: string;
      from_username?: string;
      from_first_name?: string;
      text?: string;
    }[];

    // Filter new messages only
    const newMessages = messages.filter((m) => m.id > lastSeenId && m.text);
    if (newMessages.length === 0) return;

    processing = true;

    for (const msg of newMessages) {
      lastSeenId = msg.id;
      const sender = msg.from_username ? `@${msg.from_username}` : msg.from_first_name ?? "Unknown";
      console.log(`[${sender}] ${msg.text}`);

      // Skip bot commands that aren't meant for Claude
      if (msg.text!.startsWith("/start")) continue;

      // Send typing indicator
      await sendMessage(msg.chat_id, "⏳");

      // Run through Claude
      const response = runClaude(msg.text!);

      // Send response back (delete typing indicator not possible without message_id tracking)
      await sendMessage(msg.chat_id, response);
      console.log(`  ← Sent ${response.length} chars\n`);
    }
  } catch (e) {
    console.error("Poll error:", e);
  } finally {
    processing = false;
  }
}, POLL_INTERVAL);

// Keep alive
process.on("SIGINT", () => {
  console.log("\nBridge stopped.");
  process.exit(0);
});
