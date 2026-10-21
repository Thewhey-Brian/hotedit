#!/usr/bin/env node
"use strict";
// Keep this file free of newer syntax until the version check has run.
var major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error("hotedit needs Node.js 18 or newer (you have " + process.version + "). Get it at https://nodejs.org");
  process.exit(1);
}

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { start } = require("../src/server");
const { startLauncher } = require("../src/launcher");
const pkg = require("../package.json");

const USAGE = `hotedit ${pkg.version} — edit any HTML file in your browser; changes are saved into the file

  hotedit report.html          open report.html for editing (press E, click text, type)
  hotedit                      list the HTML files in this folder; click one to edit
  hotedit some/folder          the same, for another folder
  hotedit demo                 try it on a sample report (a throwaway copy; or --demo)

  hotedit skill install [--project]
                                install the agent skill for Claude Code
                                (~/.claude/skills/hotedit, or ./.claude/skills with --project)
  hotedit skill print          print the skill text (for other agents, e.g. AGENTS.md)

  hotedit mcp                  MCP server: lets a coding agent open pages and edit them live
                                (claude mcp add hotedit -- npx -y hotedit mcp)

options: --port N   --no-open   --version   --help
`;

function parse(args) {
  const opt = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--") && !(a === "-h" || a === "-v")) opt._.push(a);
    else if (["--port"].includes(a)) opt[a.slice(2)] = args[++i];
    else opt[a.replace(/^-+/, "")] = true;
  }
  return opt;
}

function fail(msg) {
  console.error("hotedit: " + msg);
  process.exit(1);
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [url], () => {});
}

function cmdSkill(opt) {
  const src = path.join(__dirname, "..", "agent", "SKILL.md");
  const text = fs.readFileSync(src, "utf8");
  if (opt._[1] === "print") return process.stdout.write(text);
  if (opt._[1] !== "install") fail("usage: hotedit skill install [--project] | hotedit skill print");
  const base = opt.project ? path.join(process.cwd(), ".claude") : path.join(os.homedir(), ".claude");
  const dir = path.join(base, "skills", "hotedit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), text);
  console.log(`Installed the hotedit skill: ${path.join(dir, "SKILL.md")}`);
  console.log("Claude Code will now write HTML reports that are easy to edit by hand.");
}

async function cmdDemo(opt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hotedit-demo-"));
  const file = path.join(dir, "aurora_report.html");
  fs.copyFileSync(path.join(__dirname, "..", "demo", "showcase.html"), file);
  console.log("hotedit demo: a sample AI-generated report with charts, maths and diagrams.");
  console.log(`  It's a throwaway copy (${file}); edit anything.`);
  opt._ = [file];
  return cmdOpen(opt);
}

async function cmdOpen(opt) {
  const target = opt._[0] || ".";
  if (!fs.existsSync(target)) fail(`no such file or folder: ${target}`);
  const port = Number(opt.port || 0);
  if (fs.statSync(target).isDirectory()) {
    const l = await startLauncher(target, { port });
    console.log(`hotedit: pick a file to edit in ${path.resolve(target)}`);
    console.log(`  open  ${l.url}`);
    console.log("  Ctrl+C to stop");
    if (!opt["no-open"]) openBrowser(l.url);
    return;
  }
  if (!/\.html?$/i.test(target)) console.warn(`hotedit: ${target} doesn't end in .html; opening it anyway`);
  const { url, session } = await start(target, { port });
  console.log(`hotedit: editing ${session.file}`);
  console.log(`  open     ${url}`);
  console.log(`  backup   ${session.backupFile}`);
  console.log("  Ctrl+C to stop");
  if (!opt["no-open"]) openBrowser(url);
}

function cmdMcp() {
  const { createMcp, serveStdio } = require("../src/mcp");
  const { registry } = require("../src/server");
  // Started by the in-app agent: pinned to that one page.
  const pinned = process.env.HOTEDIT_URL ? { file: null, url: process.env.HOTEDIT_URL, token: process.env.HOTEDIT_TOKEN } : null;
  // stdout is the protocol; keep server logs off it.
  console.log = console.error;
  serveStdio(createMcp({ registry, start: (f) => start(f), openBrowser, pinned, version: pkg.version }));
}

async function main(argv) {
  const opt = parse(argv.slice(2));
  if (opt.help || opt.h) return process.stdout.write(USAGE);
  if (opt.version || opt.v) return console.log(pkg.version);
  if (opt._[0] === "skill") return cmdSkill(opt);
  if (opt._[0] === "mcp") return cmdMcp();
  // `hotedit demo` (unless ./demo is a folder you meant to open) or --demo.
  if (opt.demo || (opt._[0] === "demo" && !fs.existsSync("demo"))) return cmdDemo(opt);
  return cmdOpen(opt);
}

main(process.argv).catch((e) => fail(e.message));
