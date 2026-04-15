---
name: configure
description: Configure or check Telegram bot token for telegram-mcp
user_invocable: true
allowed-tools: Read, Write, Bash(mkdir *)
arguments: "[token | clear | status]"
---

# Telegram MCP Configuration

Manage the Telegram bot token used by the telegram-mcp plugin.

## Usage

- **No arguments or `status`**: Show current configuration status (whether a token is set, NOT the token itself)
- **`<token>`**: Save the provided bot token
- **`clear`**: Remove the saved token

## Instructions

The token is stored at: `~/.claude/channels/telegram-mcp/.env`

### If argument is a token (starts with digits and contains `:`)

1. Create the directory: `mkdir -p ~/.claude/channels/telegram-mcp`
2. Write the file `~/.claude/channels/telegram-mcp/.env` with content:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   ```
3. Confirm: "Token saved. Restart Claude Code to apply."

### If argument is `clear`

1. Delete `~/.claude/channels/telegram-mcp/.env` if it exists
2. Confirm: "Token removed."

### If no argument or `status`

1. Check if `~/.claude/channels/telegram-mcp/.env` exists
2. If exists: "Telegram bot token is configured. Restart Claude Code to apply changes."
3. If not: "No token configured. Use `/telegram-mcp:configure <token>` to set up. Get a token from @BotFather in Telegram."

**IMPORTANT**: Never display the actual token value. Only confirm whether it's set or not.
