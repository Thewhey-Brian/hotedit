#!/usr/bin/env node
// Stands in for Claude Code in tests: talks to the hotedit MCP server it is
// given, makes the edit named in FAKE_FIND / FAKE_REPLACE, and prints
// stream-json like `claude -p --output-format stream-json`.
"use strict";
const { spawn } = require("child_process");
const args = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
if (process.env.FAKE_FAIL === "login") {
  out({ type: "result", is_error: true, result: "Not logged in · Please run /login" });
  process.exit(1);
}
if (process.env.FAKE_PROMPT_FILE) require("fs").appendFileSync(process.env.FAKE_PROMPT_FILE, args[args.indexOf("-p") + 1] + "\n----\n");
out({ type: "system", subtype: "init", model: "claude-opus-5-5" });
const cfg = JSON.parse(args[args.indexOf("--mcp-config") + 1]).mcpServers.hotedit;
const allowed = args[args.indexOf("--allowedTools") + 1];
const p = spawn(cfg.command, cfg.args, { env: { ...process.env, ...cfg.env } });
let buf = "";
const waiting = [];
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    waiting.shift()(JSON.parse(line));
  }
});
let n = 0;
const rpc = (method, params) =>
  new Promise((r) => {
    waiting.push(r);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) + "\n");
  });
(async () => {
  await rpc("initialize", { protocolVersion: "2025-06-18" });
  const names = (await rpc("tools/list")).result.tools.map((t) => "mcp__hotedit__" + t.name);
  if (names.join(",") !== allowed) throw new Error(`tools ${names} vs allowed ${allowed}`);
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__hotedit__outline", input: {} }] } });
  await rpc("tools/call", { name: "outline", arguments: {} });
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__hotedit__edit", input: {} }] } });
  if (process.env.FAKE_DELAY) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_DELAY)));
  const r = await rpc("tools/call", { name: "edit", arguments: { find: process.env.FAKE_FIND, replace: process.env.FAKE_REPLACE } });
  const text = r.result.content[0].text;
  out({ type: "assistant", message: { content: [{ type: "text", text: r.result.isError ? "Couldn't: " + text : "I made the change." }] } });
  out({ type: "result", is_error: false, result: "ok" });
  p.kill();
})().catch((e) => {
  out({ type: "result", is_error: true, result: e.message });
  p.kill();
  process.exit(1);
});
