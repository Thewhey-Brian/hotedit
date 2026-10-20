#!/usr/bin/env node
"use strict";
// Keep this file free of newer syntax until the version check has run.
var major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error("htmledit needs Node.js 18 or newer (you have " + process.version + "). Get it at https://nodejs.org");
  process.exit(1);
}

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { start } = require("../src/server");
const { startLauncher } = require("../src/launcher");
const { Doc } = require("../src/doc");
const comments = require("../src/comments");
const pkg = require("../package.json");

const USAGE = `htmledit ${pkg.version} — edit any HTML file in your browser; changes are saved into the file

  htmledit report.html          open report.html for editing (press E, click text, type)
  htmledit                      list the HTML files in this folder; click one to edit
  htmledit some/folder          the same, for another folder

  htmledit comments report.html [--json] [--all]
                                notes left with 💬 (markdown for your AI agent)
  htmledit comments report.html --wait [--timeout SECONDS]
                                wait until a note arrives, then print it
  htmledit comments report.html --resolve <id> [--note TEXT]
  htmledit comments report.html --clear-resolved

  htmledit skill install [--project]
                                install the agent skill for Claude Code
                                (~/.claude/skills/htmledit, or ./.claude/skills with --project)
  htmledit skill print          print the skill text (for other agents, e.g. AGENTS.md)

options: --port N   --no-open   --version   --help
`;

function parse(args) {
  const opt = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--") && !(a === "-h" || a === "-v")) opt._.push(a);
    else if (["--port", "--timeout", "--resolve", "--note"].includes(a)) opt[a.slice(2)] = args[++i];
    else opt[a.replace(/^-+/, "")] = true;
  }
  return opt;
}

function fail(msg) {
  console.error("htmledit: " + msg);
  process.exit(1);
}

function needFile(file) {
  if (!file) fail("which file? e.g. htmledit comments report.html");
  if (!fs.existsSync(file)) fail(`no such file: ${file}`);
  return path.resolve(file);
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [url], () => {});
}

async function cmdComments(opt) {
  const file = needFile(opt._[1]);
  if (opt.resolve) {
    const c = comments.update(file, opt.resolve, {
      status: "resolved",
      ...(opt.note ? { note: opt.note } : {}),
    });
    console.log(`resolved [${c.id}] ${c.text}`);
    return;
  }
  if (opt["clear-resolved"]) {
    const keep = comments.load(file).filter((c) => c.status !== "resolved");
    comments.save(file, keep);
    console.log(`${keep.length} comment(s) left`);
    return;
  }
  if (opt.wait) {
    const deadline = Date.now() + Number(opt.timeout || 3600) * 1000;
    while (!comments.load(file).some((c) => c.status === "open")) {
      if (Date.now() > deadline) {
        console.log("No open comments (timed out).");
        process.exit(2);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const doc = new Doc(fs.readFileSync(file, "utf8"));
  if (opt.json) {
    const list = comments.resolved(file, doc).filter((c) => opt.all || c.status === "open");
    process.stdout.write(JSON.stringify({ file, comments: list }, null, 2) + "\n");
  } else process.stdout.write(comments.markdown(file, doc, { all: !!opt.all }));
}

function cmdSkill(opt) {
  const src = path.join(__dirname, "..", "agent", "SKILL.md");
  const text = fs.readFileSync(src, "utf8");
  if (opt._[1] === "print") return process.stdout.write(text);
  if (opt._[1] !== "install") fail("usage: htmledit skill install [--project] | htmledit skill print");
  const base = opt.project ? path.join(process.cwd(), ".claude") : path.join(os.homedir(), ".claude");
  const dir = path.join(base, "skills", "htmledit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), text);
  console.log(`Installed the htmledit skill: ${path.join(dir, "SKILL.md")}`);
  console.log("Claude Code will now write edit-friendly HTML reports and pick up your 💬 notes.");
}

async function cmdOpen(opt) {
  const target = opt._[0] || ".";
  if (!fs.existsSync(target)) fail(`no such file or folder: ${target}`);
  const port = Number(opt.port || 0);
  if (fs.statSync(target).isDirectory()) {
    const l = await startLauncher(target, { port });
    console.log(`htmledit: pick a file to edit in ${path.resolve(target)}`);
    console.log(`  open  ${l.url}`);
    console.log("  Ctrl+C to stop");
    if (!opt["no-open"]) openBrowser(l.url);
    return;
  }
  if (!/\.html?$/i.test(target)) console.warn(`htmledit: ${target} doesn't end in .html; opening it anyway`);
  const { url, session } = await start(target, { port });
  console.log(`htmledit: editing ${session.file}`);
  console.log(`  open     ${url}`);
  console.log(`  backup   ${session.backupFile}`);
  console.log(`  notes    htmledit comments ${path.basename(target)}`);
  console.log("  Ctrl+C to stop");
  if (!opt["no-open"]) openBrowser(url);
}

async function main(argv) {
  const opt = parse(argv.slice(2));
  if (opt.help || opt.h) return process.stdout.write(USAGE);
  if (opt.version || opt.v) return console.log(pkg.version);
  if (opt._[0] === "comments") return cmdComments(opt);
  if (opt._[0] === "skill") return cmdSkill(opt);
  return cmdOpen(opt);
}

main(process.argv).catch((e) => fail(e.message));
