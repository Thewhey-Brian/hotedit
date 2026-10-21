#!/usr/bin/env node
// Stands in for `codex exec --json` in tests: starts the hotedit MCP server
// from its -c mcp_servers.hotedit.* overrides, makes the FAKE_FIND /
// FAKE_REPLACE edit and prints Codex-style JSONL events.
"use strict";
const { spawn } = require("child_process");
const args = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const cfg = {};
args.forEach((a, i) => {
  const m = args[i - 1] === "-c" && /^mcp_servers\.hotedit\.(\w+)=(.*)$/.exec(a);
  if (!m) return;
  cfg[m[1]] = m[1] === "env"
    ? Object.fromEntries([...m[2].matchAll(/(\w+)=("(?:[^"\\]|\\.)*")/g)].map((x) => [x[1], JSON.parse(x[2])]))
    : JSON.parse(m[2]);
});
if (args[0] !== "exec" || !args.includes("--json")) process.exit(2);
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
  out({ type: "thread.started", thread_id: "t" });
  await rpc("initialize", { protocolVersion: "2025-06-18" });
  const input = { find: process.env.FAKE_FIND, replace: process.env.FAKE_REPLACE };
  out({ type: "item.started", item: { id: "1", type: "mcp_tool_call", server: "hotedit", tool: "edit", arguments: input } });
  const r = await rpc("tools/call", { name: "edit", arguments: input });
  out({ type: "item.completed", item: { id: "2", type: "agent_message", text: r.result.isError ? "Couldn't: " + r.result.content[0].text : "Done." } });
  out({ type: "turn.completed", usage: {} });
  p.kill();
})();
