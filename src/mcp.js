// `hotedit mcp`: a stdio MCP server, so coding agents (Claude Code, Codex,
// Cursor…) can open a page in hotedit and edit it live while the person
// watches. Tools act on pages open in any hotedit on this machine; `open`
// starts one here if needed.
"use strict";
const fs = require("fs");
const path = require("path");
const { TOOLS } = require("./agent");

const fileProp = {
  file: {
    type: "string",
    description: "path of the HTML file; optional when only one page is open",
  },
};
const withFile = (t) => ({
  name: t.name,
  description: t.description,
  inputSchema: {
    ...t.input_schema,
    properties: { ...fileProp, ...t.input_schema.properties },
  },
});

const EXTRA = [
  {
    name: "open",
    description:
      "Open an HTML file in hotedit so the person can watch and edit it in their browser. Returns the page URL. Call this before outline/read/edit when the page isn't open yet.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "path of the HTML file" },
        browser: {
          type: "boolean",
          description: "open the browser (default true)",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "notes",
    description:
      "The notes the person left on the page (💬) for you, with where each one is pinned. Resolve each with resolve_note once done.",
    inputSchema: { type: "object", properties: { ...fileProp } },
  },
  {
    name: "resolve_note",
    description: "Mark a note as done.",
    inputSchema: {
      type: "object",
      properties: {
        ...fileProp,
        id: { type: "string" },
        note: { type: "string", description: "optional reply" },
      },
      required: ["id"],
    },
  },
];

function createMcp({ registry, start, openBrowser, pinned, version }) {
  const local = new Map(); // file → session started by this process

  const pages = () => {
    if (pinned) return [pinned];
    const seen = new Map();
    for (const e of registry.list()) seen.set(e.file, e);
    for (const [file, s] of local)
      seen.set(file, { file, url: s.session.url, token: s.session.token });
    return [...seen.values()];
  };

  const pick = (file) => {
    const list = pages();
    if (pinned) return list[0];
    if (file) {
      const want = path.resolve(file);
      const real = fs.existsSync(want) ? fs.realpathSync(want) : want;
      const hit = list.find((p) => p.file === want || p.file === real);
      if (!hit)
        throw new Error(`${file} isn't open in hotedit; call open first`);
      return hit;
    }
    if (list.length === 1) return list[0];
    if (!list.length)
      throw new Error(
        "No page is open in hotedit; call open with a file first",
      );
    throw new Error(
      `Several pages are open; pass file (one of: ${list.map((p) => p.file).join(", ")})`,
    );
  };

  const call = async (page, p, body) => {
    const r = await fetch(page.url + "__he/api" + p, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-HE-Token": page.token },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || r.statusText);
    return j;
  };

  const tools = {
    async open({ file, browser = true }) {
      if (!file) throw new Error("open needs a file");
      const f = fs.realpathSync(path.resolve(file));
      const have = pages().find((p) => p.file === f);
      if (have) return `Already open at ${have.url}`;
      const s = await start(f);
      local.set(f, s);
      if (browser && openBrowser) openBrowser(s.url);
      return `Opened ${f} at ${s.url}${browser ? " (in the person's browser)" : ""}. Edits you make with edit show up there live.`;
    },
    async notes({ file }) {
      return (await call(pick(file), "/agent/notes")).markdown;
    },
    async resolve_note({ file, id, note }) {
      const page = pick(file);
      await call(page, "/comments", { action: "resolve", cid: id, ...(note ? { note } : {}) });
      return `Resolved ${id}.`;
    },
  };
  for (const t of TOOLS) {
    tools[t.name] = async ({ file, ...input }) => {
      const r = await call(pick(file), "/agent/tool", { name: t.name, input });
      if (r.isError) throw new Error(r.text);
      return r.text;
    };
  }

  const list = pinned
    ? TOOLS.map(withFile).map((t) => ({
        ...t,
        inputSchema: {
          ...t.inputSchema,
          properties: Object.fromEntries(
            Object.entries(t.inputSchema.properties).filter(
              ([k]) => k !== "file",
            ),
          ),
        },
      }))
    : [...EXTRA.slice(0, 1), ...TOOLS.map(withFile), ...EXTRA.slice(1)];

  async function handle(msg) {
    const { id, method, params = {} } = msg;
    if (method === "initialize")
      return {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "hotedit", version },
        instructions:
          "hotedit shows an HTML page live in the person's browser. Use open, then outline/read/edit; each edit is saved and appears immediately. Keep edits small and leave the rest of the file as it is.",
      };
    if (method === "ping") return {};
    if (method === "tools/list") return { tools: list };
    if (method === "tools/call") {
      const fn = tools[params.name];
      if (!fn || !list.some((t) => t.name === params.name))
        return {
          content: [{ type: "text", text: `unknown tool ${params.name}` }],
          isError: true,
        };
      try {
        return {
          content: [
            { type: "text", text: String(await fn(params.arguments || {})) },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
    }
    if (id === undefined) return undefined; // notification
    throw Object.assign(new Error(`method not found: ${method}`), {
      code: -32601,
    });
  }

  return { handle, local };
}

// Newline-delimited JSON-RPC over stdin/stdout.
function serveStdio(
  mcp,
  { input = process.stdin, output = process.stdout } = {},
) {
  let buf = "";
  input.setEncoding("utf8");
  input.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        output.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "parse error" },
          }) + "\n",
        );
        continue;
      }
      Promise.resolve(mcp.handle(msg)).then(
        (result) => {
          if (msg.id !== undefined && result !== undefined)
            output.write(
              JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n",
            );
        },
        (e) => {
          if (msg.id !== undefined)
            output.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                error: { code: e.code || -32603, message: e.message },
              }) + "\n",
            );
        },
      );
    }
  });
}

module.exports = { createMcp, serveStdio };
