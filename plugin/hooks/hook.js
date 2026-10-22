#!/usr/bin/env node
// Agent hook (Claude Code / Codex PostToolUse): when the agent writes an HTML
// report, open it in hotedit so the person can edit it straight away.
// Installed by `hotedit skill install`; standalone so it survives npx caches.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Folders that hold a site or app's own pages, not reports.
const SKIP =
  /[\\/](node_modules|\.git|dist|public|static|src|templates|site-packages|vendor|coverage|\.next)[\\/]/i;

function files(input) {
  const out = new Set();
  const t = input.tool_input || {};
  for (const k of ["file_path", "path", "filePath"])
    if (typeof t[k] === "string") out.add(t[k]);
  // Codex apply_patch: "*** Add File: x.html" / "*** Update File: x.html".
  const text = JSON.stringify(t);
  for (const m of text.matchAll(
    /\*\*\* (?:Add|Update) File: ([^\\"\n]+?\.html?)(?=\\n|"|\n)/gi,
  ))
    out.add(m[1].trim());
  return [...out];
}

function main(raw) {
  if (process.env.HOTEDIT_AUTO === "0") return;
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return;
  }
  const cwd = input.cwd || process.cwd();
  const html = files(input)
    .map((f) => path.resolve(cwd, f))
    .filter((f) => /\.html?$/i.test(f) && !SKIP.test(f) && fs.existsSync(f))
    .filter(
      (f) => !/\{\{|\{%|<%/.test(fs.readFileSync(f, "utf8").slice(0, 200000)),
    );
  if (!html.length) return;
  const file = html[html.length - 1];
  const args = ["open", file, "--background"];
  // The hotedit the installer found (argv[2]), else the latest from npm.
  const bin = process.argv[2] || process.env.HOTEDIT_BIN;
  const opts = { encoding: "utf8", timeout: 90000, shell: process.platform === "win32" };
  const res =
    bin && fs.existsSync(bin)
      ? spawnSync(process.execPath, [bin, ...args], { ...opts, shell: false })
      : spawnSync("npx", ["-y", "hotedit@latest", ...args], opts);
  const said = (res.stdout || "").trim();
  if (res.status !== 0 || !said) return;
  // Tell the agent, so it hands over the page instead of a command.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `hotedit: ${said} The person can edit ${path.basename(file)} in their browser now (click ✎ Edit); later edits to the file show up there live.`,
      },
    }) + "\n",
  );
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    main(raw);
  } catch {}
});
