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
const { execFile, spawn } = require("child_process");
const { start, registry } = require("../src/server");
const { startLauncher } = require("../src/launcher");
const pkg = require("../package.json");

const USAGE = `hotedit ${pkg.version} — edit any HTML file in your browser; changes are saved into the file

  hotedit report.html          open report.html for editing (click ✎ Edit, click text, type)
  hotedit                      list the HTML files in this folder; click one to edit
  hotedit some/folder          the same, for another folder
  hotedit demo                 try it on a sample report (a throwaway copy; or --demo)

  hotedit open report.html --background
                                open it and return at once (for agents and scripts); the
                                server stops by itself once the page has been closed a while

  hotedit skill install [--project] [--codex] [--no-auto]
                                install the agent skill for Claude Code (~/.claude, or
                                ./.claude with --project; --codex for Codex), plus a hook that
                                opens every HTML report the agent writes in hotedit
                                (--no-auto: the skill only)
  hotedit skill uninstall [--project] [--codex]
                                remove the skill and the hook
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
  if (process.env.HOTEDIT_NO_OPEN === "1") return; // tests, CI
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [url], () => {});
}

// ---------- agent skill + auto-open hook ----------

const HOOK_MARK = "hotedit-hook.js";

function readJson(f) {
  if (!fs.existsSync(f)) return {};
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    fail(`${f} isn't valid JSON; fix it first (nothing was changed)`);
  }
}

// Add (or with on=false remove) our PostToolUse entry, leaving every other
// setting and hook as it was.
function setHook(file, on, matcher, command) {
  const cfg = readJson(file);
  const hooks = (cfg.hooks ||= {});
  const list = (hooks.PostToolUse || []).filter(
    (e) => !(e.hooks || []).some((h) => String(h.command || "").includes(HOOK_MARK)),
  );
  if (on) list.push({ matcher, hooks: [{ type: "command", command, timeout: 120 }] });
  if (list.length) hooks.PostToolUse = list;
  else delete hooks.PostToolUse;
  if (!Object.keys(hooks).length) delete cfg.hooks;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}

const q = (s) => (/^[\w./:@\\-]+$/.test(s) ? s : JSON.stringify(s));

function cmdSkill(opt) {
  const src = path.join(__dirname, "..", "agent", "SKILL.md");
  const text = fs.readFileSync(src, "utf8");
  const act = opt._[1];
  if (act === "print") return process.stdout.write(text);
  if (act !== "install" && act !== "uninstall")
    fail("usage: hotedit skill install [--project] [--codex] [--no-auto] | hotedit skill uninstall | hotedit skill print");
  const codex = !!opt.codex;
  const home = codex
    ? process.env.CODEX_HOME || path.join(os.homedir(), ".codex")
    : opt.project
      ? path.join(process.cwd(), ".claude")
      : path.join(os.homedir(), ".claude");
  const who = codex ? "Codex" : "Claude Code";
  const dir = path.join(home, "skills", "hotedit");
  const settings = path.join(home, codex ? "hooks.json" : "settings.json");
  const state = process.env.HTMLEDIT_STATE_DIR || path.join(os.homedir(), ".htmledit");
  const hookFile = path.join(state, HOOK_MARK);
  if (act === "uninstall") {
    fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(settings)) setHook(settings, false);
    console.log(`Removed the hotedit skill and hook for ${who}.`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), text);
  console.log(`Installed the hotedit skill: ${path.join(dir, "SKILL.md")}`);
  console.log(`${who} will now write HTML reports that are easy to edit by hand.`);
  if (opt["no-auto"]) {
    if (fs.existsSync(settings)) setHook(settings, false);
    return;
  }
  // The hook runs a copy of agent/hook.js, given this hotedit if it will
  // still be here later (a global install or a clone, not an npx cache).
  fs.mkdirSync(state, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "..", "agent", "hook.js"), hookFile);
  const self = fs.realpathSync(__filename);
  const stable = !/[\\/]_npx[\\/]/.test(self);
  const command = `node ${q(hookFile)}${stable ? " " + q(self) : ""}`;
  setHook(settings, true, codex ? "Edit|Write|apply_patch" : "Write|Edit|MultiEdit", command);
  console.log(`Auto-open is on: every HTML report ${who} writes opens in hotedit in your browser.`);
  console.log(`  hook in ${settings} (turn off: hotedit skill install --no-auto${codex ? " --codex" : ""}, or HOTEDIT_AUTO=0)`);
  if (codex) console.log("  Codex asks you to trust new hooks once: approve the hotedit hook when it asks.");
}

// `hotedit open file --background`: hand the page to a detached server and
// return straight away. If the file is already open, just say where.
async function openBackground(file, opt) {
  const real = fs.realpathSync(path.resolve(file));
  const same = (f) => {
    try {
      return fs.realpathSync(f) === real;
    } catch {
      return false;
    }
  };
  const find = () => registry.list().find((e) => same(e.file));
  const have = find();
  if (have) return console.log(`Already open in hotedit at ${have.url}`);
  const args = [__filename, real, "--no-open", "--idle-exit"];
  if (opt.port) args.push("--port", String(opt.port));
  const state = process.env.HTMLEDIT_STATE_DIR || path.join(os.homedir(), ".htmledit");
  fs.mkdirSync(state, { recursive: true });
  const log = fs.openSync(path.join(state, "background.log"), "a");
  const child = spawn(process.execPath, args, { detached: true, stdio: ["ignore", log, log], windowsHide: true });
  child.unref();
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const e = find();
    if (e) {
      if (!opt["no-open"]) openBrowser(e.url);
      return console.log(`Opened ${real} in hotedit at ${e.url}`);
    }
    if (child.exitCode != null) break;
  }
  fail(`couldn't start hotedit in the background (see ${path.join(state, "background.log")})`);
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
  if (opt._[0] === "open" && opt._.length > 1) opt._.shift();
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
  if (opt.background) return openBackground(target, opt);
  if (!/\.html?$/i.test(target)) console.warn(`hotedit: ${target} doesn't end in .html; opening it anyway`);
  const { url, session } = await start(target, { port });
  console.log(`hotedit: editing ${session.file}`);
  console.log(`  open     ${url}`);
  console.log(`  backup   ${session.backupFile}`);
  console.log("  Ctrl+C to stop");
  if (!opt["no-open"]) openBrowser(url);
  // Background servers stop once no page has been open for a while.
  if (opt["idle-exit"]) {
    const wait = Number(process.env.HOTEDIT_IDLE_MS || 10 * 60 * 1000);
    let seen = Date.now();
    setInterval(() => {
      if (session.clients.size) seen = Date.now();
      else if (Date.now() - seen > wait) process.exit(0);
    }, Math.min(15000, wait / 4)).unref();
  }
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
