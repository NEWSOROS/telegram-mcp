// Telegram MCP Server on Cloudflare Workers — zero dependencies

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  STORE: DurableObjectNamespace;
}

// ── Telegram API ───────────────────────────────────────────
async function tgApi(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= max) { chunks.push(rest); break; }
    let at = rest.lastIndexOf("\n\n", max);
    if (at <= 0) at = rest.lastIndexOf("\n", max);
    if (at <= 0) at = rest.lastIndexOf(" ", max);
    if (at <= 0) at = max;
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  return chunks;
}

// ── MCP Tool Definitions ───────────────────────────────────
const TOOLS = [
  { name: "send_message", description: "Send a text message to a Telegram chat. Auto-splits long messages.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, text: { type: "string", minLength: 1 }, parse_mode: { type: "string", enum: ["HTML", "Markdown", "MarkdownV2"] } }, required: ["chat_id", "text"] } },
  { name: "read_messages", description: "Read recent incoming messages. Without chat_id returns all chats.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, limit: { type: "number", default: 20 } } } },
  { name: "react", description: "Add an emoji reaction to a message.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, message_id: { type: "number" }, emoji: { type: "string" } }, required: ["chat_id", "message_id", "emoji"] } },
  { name: "edit_message", description: "Edit a previously sent bot message.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, message_id: { type: "number" }, text: { type: "string" }, parse_mode: { type: "string", enum: ["HTML", "Markdown", "MarkdownV2"] } }, required: ["chat_id", "message_id", "text"] } },
  { name: "delete_message", description: "Delete a message from a Telegram chat.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, message_id: { type: "number" } }, required: ["chat_id", "message_id"] } },
  { name: "download_attachment", description: "Get download URL for a file attachment.", inputSchema: { type: "object", properties: { chat_id: { type: "string" }, message_id: { type: "number" } }, required: ["chat_id", "message_id"] } },
  { name: "manage_access", description: "Manage who can send messages to the bot. Use 'list' to see current access rules. Use 'allow' to add a user or group chat. Use 'deny' to remove access. Types: 'user' for DM users, 'chat' for group chats. If no users/chats are allowed, ALL messages are blocked.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "allow", "deny"] }, type: { type: "string", enum: ["user", "chat"], description: "Whether this is a user (DM) or group chat" }, id: { type: "string", description: "Telegram user ID or chat ID to allow/deny" }, label: { type: "string", description: "Optional label (username or chat title) for readability" } }, required: ["action"] } },
];

// ── Tool Execution ─────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>, token: string, store: DurableObjectStub): Promise<unknown> {
  switch (name) {
    case "send_message": {
      const chunks = chunkText(args.text as string, 4096);
      const ids: number[] = [];
      for (const chunk of chunks) {
        const r = (await tgApi(token, "sendMessage", { chat_id: args.chat_id, text: chunk, parse_mode: args.parse_mode })) as { message_id: number };
        ids.push(r.message_id);
      }
      return { ok: true, message_ids: ids };
    }
    case "read_messages": {
      const res = await store.fetch("http://do/read?" + new URLSearchParams({ chat_id: String(args.chat_id ?? ""), limit: String(args.limit ?? 20) }));
      return res.json();
    }
    case "react":
      await tgApi(token, "setMessageReaction", { chat_id: args.chat_id, message_id: args.message_id, reaction: [{ type: "emoji", emoji: args.emoji }] });
      return { ok: true };
    case "edit_message":
      await tgApi(token, "editMessageText", { chat_id: args.chat_id, message_id: args.message_id, text: args.text, parse_mode: args.parse_mode });
      return { ok: true };
    case "delete_message":
      await tgApi(token, "deleteMessage", { chat_id: args.chat_id, message_id: args.message_id });
      return { ok: true };
    case "download_attachment": {
      const res = await store.fetch("http://do/get-file?" + new URLSearchParams({ chat_id: String(args.chat_id), message_id: String(args.message_id) }));
      const msg = (await res.json()) as { file_id?: string; file_name?: string } | null;
      if (!msg?.file_id) return { ok: false, error: "No attachment found" };
      const file = (await tgApi(token, "getFile", { file_id: msg.file_id })) as { file_path?: string };
      if (!file.file_path) return { ok: false, error: "Cannot get file path" };
      return { ok: true, download_url: `https://api.telegram.org/file/bot${token}/${file.file_path}`, file_name: msg.file_name };
    }
    case "manage_access": {
      const action = args.action as string;
      if (action === "list") {
        const res = await store.fetch("http://do/access?action=list");
        return res.json();
      }
      if (action === "allow") {
        if (!args.id || !args.type) return { ok: false, error: "id and type are required" };
        const res = await store.fetch("http://do/access?" + new URLSearchParams({ action: "allow", type: args.type as string, id: args.id as string, label: (args.label as string) ?? "" }));
        return res.json();
      }
      if (action === "deny") {
        if (!args.id || !args.type) return { ok: false, error: "id and type are required" };
        const res = await store.fetch("http://do/access?" + new URLSearchParams({ action: "deny", type: args.type as string, id: args.id as string }));
        return res.json();
      }
      return { ok: false, error: "Unknown action" };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Message Store (Durable Object) ─────────────────────────
export class MessageStore implements DurableObject {
  private state: DurableObjectState;
  private dbReady = false;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  private ensureDb() {
    if (this.dbReady) return;
    this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, chat_id TEXT NOT NULL,
      chat_title TEXT, from_username TEXT, from_first_name TEXT, text TEXT, date INTEGER NOT NULL,
      has_photo INTEGER DEFAULT 0, has_document INTEGER DEFAULT 0, has_audio INTEGER DEFAULT 0,
      has_video INTEGER DEFAULT 0, has_voice INTEGER DEFAULT 0, file_id TEXT, file_name TEXT
    )`);
    this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS access_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      tg_id TEXT NOT NULL UNIQUE,
      label TEXT
    )`);
    this.dbReady = true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.ensureDb();

    if (url.pathname === "/store" && request.method === "POST") {
      const m = await request.json() as Record<string, unknown>;
      this.state.storage.sql.exec(
        `INSERT INTO messages (message_id,chat_id,chat_title,from_username,from_first_name,text,date,has_photo,has_document,has_audio,has_video,has_voice,file_id,file_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        m.message_id, m.chat_id, m.chat_title ?? null, m.from_username ?? null,
        m.from_first_name ?? null, m.text ?? null, m.date,
        m.has_photo ? 1 : 0, m.has_document ? 1 : 0, m.has_audio ? 1 : 0,
        m.has_video ? 1 : 0, m.has_voice ? 1 : 0, m.file_id ?? null, m.file_name ?? null,
      );
      this.state.storage.sql.exec(`DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 500)`);
      return new Response("ok");
    }

    if (url.pathname === "/read") {
      const chatId = url.searchParams.get("chat_id");
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const messages = chatId
        ? this.state.storage.sql.exec(`SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?`, chatId, limit).toArray().reverse()
        : this.state.storage.sql.exec(`SELECT * FROM messages ORDER BY id DESC LIMIT ?`, limit).toArray().reverse();
      const chats = this.state.storage.sql.exec(`SELECT chat_id, chat_title, COUNT(*) as count FROM messages GROUP BY chat_id ORDER BY MAX(id) DESC`).toArray();
      return Response.json({ messages, available_chats: chats });
    }

    if (url.pathname === "/get-file") {
      const rows = this.state.storage.sql.exec(`SELECT file_id, file_name FROM messages WHERE chat_id=? AND message_id=? LIMIT 1`,
        url.searchParams.get("chat_id")!, Number(url.searchParams.get("message_id"))).toArray();
      return Response.json(rows[0] ?? null);
    }

    // Access control: check if user/chat is allowed
    if (url.pathname === "/check-access") {
      const userId = url.searchParams.get("user_id");
      const chatId = url.searchParams.get("chat_id");
      const chatType = url.searchParams.get("chat_type"); // private, group, supergroup
      const total = this.state.storage.sql.exec(`SELECT COUNT(*) as c FROM access_list`).toArray()[0] as { c: number };
      if (total.c === 0) return Response.json({ allowed: true }); // no rules = allow all (initial setup)
      if (chatType === "private") {
        const rows = this.state.storage.sql.exec(`SELECT 1 FROM access_list WHERE type='user' AND tg_id=?`, userId!).toArray();
        return Response.json({ allowed: rows.length > 0 });
      } else {
        const rows = this.state.storage.sql.exec(`SELECT 1 FROM access_list WHERE type='chat' AND tg_id=?`, chatId!).toArray();
        return Response.json({ allowed: rows.length > 0 });
      }
    }

    // Access management
    if (url.pathname === "/access") {
      const action = url.searchParams.get("action");
      if (action === "list") {
        const rows = this.state.storage.sql.exec(`SELECT type, tg_id, label FROM access_list ORDER BY type, id`).toArray();
        return Response.json({ ok: true, access_list: rows });
      }
      if (action === "allow") {
        const type = url.searchParams.get("type")!;
        const tgId = url.searchParams.get("id")!;
        const label = url.searchParams.get("label") || null;
        this.state.storage.sql.exec(`INSERT OR REPLACE INTO access_list (type, tg_id, label) VALUES (?, ?, ?)`, type, tgId, label);
        return Response.json({ ok: true, message: `${type} ${tgId} allowed` });
      }
      if (action === "deny") {
        const type = url.searchParams.get("type")!;
        const tgId = url.searchParams.get("id")!;
        this.state.storage.sql.exec(`DELETE FROM access_list WHERE type=? AND tg_id=?`, type, tgId);
        return Response.json({ ok: true, message: `${type} ${tgId} removed` });
      }
      return Response.json({ ok: false, error: "Unknown action" });
    }

    return new Response("not found", { status: 404 });
  }
}

// ── Extract file from Telegram update ──────────────────────
function extractFile(m: Record<string, unknown>): { file_id?: string; file_name?: string } {
  if (m.photo) { const p = m.photo as { file_id: string }[]; return { file_id: p[p.length - 1]?.file_id }; }
  if (m.document) { const d = m.document as { file_id: string; file_name?: string }; return { file_id: d.file_id, file_name: d.file_name }; }
  if (m.audio) { const a = m.audio as { file_id: string; file_name?: string }; return { file_id: a.file_id, file_name: a.file_name }; }
  if (m.video) { const v = m.video as { file_id: string; file_name?: string }; return { file_id: v.file_id, file_name: v.file_name }; }
  if (m.voice) return { file_id: (m.voice as { file_id: string }).file_id };
  return {};
}

// ── Worker Entry Point ─────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Info
      if (url.pathname === "/" && request.method === "GET") {
        return Response.json({ name: "telegram-mcp", version: "1.0.0", mcp: "/mcp", webhook: "/webhook", setup: "/setup" });
      }

      // Setup webhook
      if (url.pathname === "/setup") {
        await tgApi(env.TELEGRAM_BOT_TOKEN, "setWebhook", { url: `${url.origin}/webhook` });
        return new Response(`Webhook set to: ${url.origin}/webhook`);
      }

      const getStore = () => env.STORE.get(env.STORE.idFromName("default"));

      // Telegram webhook
      if (url.pathname === "/webhook" && request.method === "POST") {
        const body = (await request.json()) as { message?: Record<string, unknown> };
        const msg = body.message;
        if (!msg) return new Response("ok");
        const chat = msg.chat as { id: number; title?: string; type?: string } | undefined;
        if (!chat) return new Response("ok");
        const from = msg.from as { id: number; username?: string; first_name?: string } | undefined;

        // Access check
        const store = getStore();
        const accessRes = await store.fetch("http://do/check-access?" + new URLSearchParams({
          user_id: String(from?.id ?? ""), chat_id: String(chat.id), chat_type: chat.type ?? "private",
        }));
        const { allowed } = (await accessRes.json()) as { allowed: boolean };
        if (!allowed) return new Response("ok"); // silently drop

        const { file_id, file_name } = extractFile(msg);
        await store.fetch("http://do/store", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: msg.message_id, chat_id: String(chat.id), chat_title: chat.title, from_username: from?.username, from_first_name: from?.first_name, text: msg.text ?? msg.caption, date: msg.date, has_photo: !!msg.photo, has_document: !!msg.document, has_audio: !!msg.audio, has_video: !!msg.video, has_voice: !!msg.voice, file_id, file_name }),
        });
        return new Response("ok");
      }

      // MCP endpoint
      if (url.pathname === "/mcp" && request.method === "POST") {
        const body = (await request.json()) as { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> };
        if (body.id === undefined) return new Response("", { status: 202 });

        let result: unknown;
        switch (body.method) {
          case "initialize":
            result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "telegram-mcp", version: "1.0.0" } };
            break;
          case "tools/list":
            result = { tools: TOOLS };
            break;
          case "tools/call": {
            const p = body.params ?? {};
            try {
              const r = await executeTool(p.name as string, (p.arguments ?? {}) as Record<string, unknown>, env.TELEGRAM_BOT_TOKEN, getStore());
              result = { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
            } catch (e) {
              result = { content: [{ type: "text", text: JSON.stringify({ error: String(e) }) }], isError: true };
            }
            break;
          }
          default:
            return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } });
        }
        return Response.json({ jsonrpc: "2.0", id: body.id, result });
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  },
};
