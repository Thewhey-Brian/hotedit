#!/usr/bin/env node
// Stands in for any other agent CLI: reaches the page through HOTEDIT_URL /
// HOTEDIT_TOKEN (as its hotedit MCP server would) and prints plain text.
"use strict";
const prompt = process.argv.at(-1);
(async () => {
  if (!/Request: /.test(prompt)) throw new Error("no prompt");
  console.log("\x1b[1mworking\x1b[0m");
  const r = await fetch(process.env.HOTEDIT_URL + "__he/api/agent/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-HE-Token": process.env.HOTEDIT_TOKEN },
    body: JSON.stringify({ name: "edit", input: { find: process.env.FAKE_FIND, replace: process.env.FAKE_REPLACE } }),
  });
  console.log((await r.json()).text);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
