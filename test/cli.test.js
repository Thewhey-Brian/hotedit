"use strict";
// CLI, launcher and packaging: what a new user runs first.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { startLauncher, findHtml } = require("../src/launcher");

// Sessions started here (and by spawned CLIs) keep backups out of ~/.htmledit.
process.env.HTMLEDIT_BACKUP_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-backups-"));
process.env.HTMLEDIT_STATE_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-state-"));
const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "bin", "htmledit.js");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-cli-"));
const run = (args, opts = {}) =>
  execFileSync("node", [CLI, ...args], { encoding: "utf8", ...opts });

test("--help and --version", () => {
  assert.match(
    run(["--help"]),
    /hotedit report\.html\s+open report\.html for editing/,
  );
  assert.strictEqual(
    run(["--version"]).trim(),
    require("../package.json").version,
  );
});

test("clear error for a missing file", () => {
  try {
    run(["missing.html"], { stdio: "pipe" });
    assert.fail("should exit 1");
  } catch (e) {
    assert.strictEqual(e.status, 1);
    assert.match(e.stderr, /no such file or folder: missing\.html/);
  }
});

test("skill install --project writes .claude/skills/hotedit/SKILL.md", () => {
  const dir = tmp();
  const out = run(["skill", "install", "--project"], { cwd: dir });
  const f = path.join(dir, ".claude", "skills", "hotedit", "SKILL.md");
  assert.ok(fs.existsSync(f), out);
  assert.match(
    fs.readFileSync(f, "utf8"),
    /^---\nname: hotedit\ndescription: /,
  );
  assert.match(
    run(["skill", "print"]),
    /# hotedit: HTML reports that people can edit/,
  );
});

test("launcher lists HTML files (skipping node_modules) and opens one", async () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, "a.html"),
    "<!doctype html><html><body><h1>A</h1></body></html>",
  );
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "b.htm"), "<p>B</p>");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "x.html"), "<p>x</p>");
  fs.writeFileSync(path.join(dir, "notes.txt"), "x");
  assert.deepStrictEqual(
    findHtml(dir)
      .map((f) => f.rel)
      .sort(),
    ["a.html", path.join("sub", "b.htm")],
  );

  const l = await startLauncher(dir);
  try {
    const home = await (await fetch(l.url)).text();
    assert.match(home, /Pick a page to edit/);
    assert.match(home, /a\.html/);
    assert.ok(!home.includes("x.html"));
    const bad = await fetch(l.url + "open?f=a.html", { redirect: "manual" });
    assert.strictEqual(bad.status, 403, "token required");
    const trav = await fetch(
      `${l.url}open?t=${l.token}&f=${encodeURIComponent("../etc/passwd")}`,
      { redirect: "manual" },
    );
    assert.strictEqual(trav.status, 404);
    const ok = await fetch(`${l.url}open?t=${l.token}&f=a.html`, {
      redirect: "manual",
    });
    assert.strictEqual(ok.status, 302);
    const page = await (await fetch(ok.headers.get("location"))).text();
    assert.match(page, /<h1 data-he="\d+">A<\/h1>/);
    // Same file again → same session.
    const again = await fetch(`${l.url}open?t=${l.token}&f=a.html`, {
      redirect: "manual",
    });
    assert.strictEqual(
      again.headers.get("location"),
      ok.headers.get("location"),
    );
  } finally {
    await l.stop();
  }
});

test(
  "packed tarball installs with runtime deps only and runs",
  { timeout: 180000 },
  async () => {
    const dir = tmp();
    const tgz = execFileSync(
      "npm",
      ["pack", "--silent", "--pack-destination", dir],
      { cwd: ROOT, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .pop();
    const files = execFileSync("tar", ["-tzf", path.join(dir, tgz)], {
      encoding: "utf8",
    });
    assert.ok(
      !/package\/(samples|test|playground)\//.test(files) && !/package\/demo\/(?!showcase\.html)/.test(files),
      "no tests/samples/demo in the package:\n" + files,
    );
    assert.ok(files.includes("package/agent/SKILL.md"));
  assert.ok(files.includes("package/demo/showcase.html"), "hotedit demo needs the showcase");
    execFileSync("npm", ["init", "-y"], { cwd: dir, stdio: "ignore" });
    execFileSync(
      "npm",
      ["install", "--omit=dev", "--no-audit", "--no-fund", path.join(dir, tgz)],
      { cwd: dir, stdio: "ignore" },
    );
    const bin = path.join(dir, "node_modules", ".bin", "hotedit");
  assert.ok(fs.existsSync(path.join(dir, "node_modules", ".bin", "htmledit")), "htmledit alias installed");
    assert.ok(
      !fs.existsSync(path.join(dir, "node_modules", "playwright")),
      "dev deps not installed",
    );
    const report = path.join(dir, "r.html");
    fs.writeFileSync(
      report,
      "<!doctype html><html><body><p>hi</p></body></html>",
    );
    const p = spawn(bin, [report, "--no-open"]);
    try {
      const url = await new Promise((resolve, reject) => {
        let out = "";
        p.stdout.on("data", (d) => {
          out += d;
          const m = /open\s+(http:\/\/\S+)/.exec(out);
          if (m) resolve(m[1]);
        });
        p.on("exit", (c) => reject(new Error("exited " + c + out)));
        setTimeout(() => reject(new Error("no url: " + out)), 20000);
      });
      const html = await (await fetch(url)).text();
      assert.match(html, /<p data-he="\d+">hi<\/p>/);
      const js = await (await fetch(url + "__he/overlay.js")).text();
      assert.match(js, /__heChartForm/);
    } finally {
      p.kill();
    }
  },
);

test("hotedit --demo serves a throwaway copy of the showcase", { timeout: 30000 }, async () => {
  const p = spawn("node", [CLI, "--demo", "--no-open"], { env: { ...process.env } });
  try {
    const out = await new Promise((resolve, reject) => {
      let buf = "";
      p.stdout.on("data", (d) => {
        buf += d;
        if (/open\s+http/.test(buf)) resolve(buf);
      });
      p.on("exit", (c) => reject(new Error("exited " + c + buf)));
      setTimeout(() => reject(new Error("no url: " + buf)), 15000);
    });
    const url = /open\s+(http:\/\/\S+)/.exec(out)[1];
    const file = /editing (\S+)/.exec(out)[1];
    assert.ok(file.startsWith(os.tmpdir()) || file.includes("hotedit-demo-"), file);
    assert.match(await (await fetch(url)).text(), /Aurora forecast model, Q3/);
  } finally {
    p.kill();
  }
});

test("skill install adds the auto-open hook (keeping other settings), uninstall removes it", () => {
  const home = tmp();
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const file = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mine = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] };
  fs.writeFileSync(file, JSON.stringify({ model: "x", hooks: { PostToolUse: [mine] } }));
  run(["skill", "install"], { env });
  run(["skill", "install"], { env }); // twice: still one hook
  let cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(cfg.model, "x");
  assert.strictEqual(cfg.hooks.PostToolUse.length, 2);
  assert.deepStrictEqual(cfg.hooks.PostToolUse[0], mine);
  assert.match(cfg.hooks.PostToolUse[1].hooks[0].command, /hotedit-hook\.js/);
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "hotedit", "SKILL.md")));
  // Codex: its own skills folder and hooks.json.
  run(["skill", "install", "--codex"], { env });
  const cx = JSON.parse(fs.readFileSync(path.join(home, ".codex", "hooks.json"), "utf8"));
  assert.match(cx.hooks.PostToolUse[0].matcher, /apply_patch/);
  assert.ok(fs.existsSync(path.join(home, ".codex", "skills", "hotedit", "SKILL.md")));
  run(["skill", "uninstall"], { env });
  cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepStrictEqual(cfg, { model: "x", hooks: { PostToolUse: [mine] } });
  assert.ok(!fs.existsSync(path.join(home, ".claude", "skills", "hotedit")));
});

test("hook opens a report the agent wrote, once, in a server that stops when idle", { timeout: 60000 }, async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "report.html"), "<!doctype html><body><h1>Report</h1></body>");
  fs.writeFileSync(path.join(dir, "src", "index.html"), "<!doctype html><body><h1>App</h1></body>");
  fs.writeFileSync(path.join(dir, "page.html"), "<h1>{{ title }}</h1>");
  const env = { ...process.env, HOTEDIT_NO_OPEN: "1", HOTEDIT_IDLE_MS: "1500" };
  const hook = (input) =>
    execFileSync("node", [path.join(ROOT, "agent", "hook.js"), CLI], { input: JSON.stringify({ cwd: dir, ...input }), encoding: "utf8", env });
  // Not reports: an app's own page, a template, a non-HTML file.
  assert.strictEqual(hook({ tool_name: "Write", tool_input: { file_path: "src/index.html" } }), "");
  assert.strictEqual(hook({ tool_name: "Write", tool_input: { file_path: "page.html" } }), "");
  assert.strictEqual(hook({ tool_name: "Write", tool_input: { file_path: "notes.md" } }), "");
  const first = JSON.parse(hook({ tool_name: "Write", tool_input: { file_path: "report.html" } }));
  const ctx = first.hookSpecificOutput.additionalContext;
  const url = /at (http:\/\/\S+)/.exec(ctx)[1];
  assert.match(ctx, /Opened .*report\.html in hotedit/);
  assert.match(await (await fetch(url)).text(), /<h1 data-he="\d+">Report<\/h1>/);
  // Codex apply_patch, same file: already open.
  const again = JSON.parse(hook({ tool_name: "apply_patch", tool_input: { input: "*** Begin Patch\n*** Update File: report.html\n@@\n*** End Patch" } }));
  assert.match(again.hookSpecificOutput.additionalContext, new RegExp(`Already open in hotedit at ${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  // Nobody opens the page: the background server stops by itself.
  const down = async () => {
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(url);
      } catch {
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  assert.ok(await down(), "background server stopped when idle");
});
