"use strict";
// The built-in AI agent: page tools, both runners (API with a stand-in
// client, Claude Code with a stand-in binary) and the MCP bridge.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

process.env.HTMLEDIT_BACKUP_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-backups-"));
process.env.HTMLEDIT_STATE_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-state-"));
const { start, registry } = require("../src/server");
const agent = require("../src/agent");
const { createMcp } = require("../src/mcp");

const PAGE = `<!doctype html>
<html><head><title>T</title></head>
<body>
  <h1 class="big">Sales report</h1>
  <p>Revenue grew <b>12%</b>.</p>
  <img src="data:image/png;base64,${"A".repeat(2000)}">
  <p>Revenue grew again.</p>
</body></html>
`;
const tmpPage = (html = PAGE) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-agent-")), "r.html");
  fs.writeFileSync(f, html);
  return f;
};
const FAKE = path.join(__dirname, "fixtures", "fake-claude.js");
const FAKE_CODEX = path.join(__dirname, "fixtures", "fake-codex.js");
const FAKE_AGENT = path.join(__dirname, "fixtures", "fake-agent.js");

test("outline, read and edit tools", async () => {
  const file = tmpPage();
  const s = await start(file);
  try {
    const o = agent.runTool(s.session, "outline");
    assert.match(o, /^title: T$/m);
    const h1 = /\[(\d+)\] h1\.big “Sales report”/.exec(o);
    assert.ok(h1, o);
    assert.match(agent.runTool(s.session, "read", { id: Number(h1[1]) }), /<h1 class="big">Sales report<\/h1>/);
    const img = /\[(\d+)\] img/.exec(o)[1];
    assert.match(agent.runTool(s.session, "read", { id: Number(img) }), /KB elided\]/);
    assert.throws(() => agent.runTool(s.session, "edit", { find: "Revenue grew", replace: "x" }), /appears 2 times/);
    assert.throws(() => agent.runTool(s.session, "edit", { find: "nope", replace: "x" }), /not in the file/);
    assert.match(agent.runTool(s.session, "edit", { find: "Sales report", replace: "Sales review" }), /Saved \(line 4\)/);
    assert.strictEqual(fs.readFileSync(file, "utf8"), PAGE.replace("Sales report", "Sales review"));
    assert.strictEqual(s.session.undo.at(-1).label, "AI edit");
  } finally {
    await s.stop();
  }
});

test("validate rejects malformed tool input", () => {
  assert.strictEqual(agent.validate("edit", { find: "a", replace: "b" }), null);
  assert.match(agent.validate("edit", { find: "a" }), /missing replace/);
  assert.match(agent.validate("read", { id: "3" }), /integer/);
  assert.match(agent.validate("read", { id: 3, x: 1 }), /unexpected/);
});

// A stand-in for client.beta.messages.stream: replays scripted turns.
function fakeClient(turns, seen) {
  return {
    beta: {
      messages: {
        stream(params) {
          seen.push(JSON.parse(JSON.stringify(params)));
          const msg = turns.shift();
          const handlers = {};
          return {
            on(ev, fn) {
              handlers[ev] = fn;
              return this;
            },
            abort() {},
            async finalMessage() {
              for (const b of msg.content) if (b.type === "text" && handlers.text) handlers.text(b.text);
              return msg;
            },
          };
        },
      },
    },
  };
}

test("API runner: tool loop edits the file live, logs, and undo takes it back", async () => {
  const file = tmpPage();
  const s = await start(file);
  const events = [];
  s.session.clients.add({ write: (d) => events.push(JSON.parse(d.replace(/^data: /, ""))), end() {} });
  try {
    const h1 = s.session.doc.nodes.find((n) => n.tagName === "h1").heId;
    const seen = [];
    const client = fakeClient(
      [
        { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "read", input: { id: h1 } }] },
        { stop_reason: "tool_use", content: [{ type: "text", text: "Renaming." }, { type: "tool_use", id: "t2", name: "edit", input: { find: "Sales report", replace: "Q3 sales" } }, { type: "tool_use", id: "t3", name: "edit", input: { find: "x" } }] },
        { stop_reason: "end_turn", content: [{ type: "text", text: "Renamed the heading." }] },
      ],
      seen,
    );
    await agent.start(s.session, { prompt: "rename it", id: h1, provider: "api", client });
    await s.session.job.done;
    const j = s.session.job.snapshot();
    assert.strictEqual(j.status, "done", JSON.stringify(j.log));
    assert.strictEqual(j.edits, 1);
    assert.ok(fs.readFileSync(file, "utf8").includes("<h1 class=\"big\">Q3 sales</h1>"));
    assert.deepStrictEqual(j.log.map((e) => e.t), ["tool", "text", "tool", "edit", "text"]);
    // Request shape: default model, tools stream their input, fallbacks on.
    assert.strictEqual(seen[0].model, "claude-opus-5-5");
    assert.ok(seen[0].tools.every((t) => t.eager_input_streaming));
    assert.strictEqual(seen[0].fallbacks, "default");
    assert.match(seen[0].messages[0].content, /Request: rename it/);
    assert.match(seen[0].messages[0].content, /Sales report<\/h1>/, "selected element's source is included");
    // The bad call got an error result, not a crash; history is append-only.
    const results = seen[2].messages[4].content;
    assert.strictEqual(results[1].is_error, true);
    assert.deepStrictEqual(seen[2].messages[1].content, seen[1].messages[1].content);
    // Every tab was told to reload and glow on the heading.
    const rl = events.find((e) => e.type === "reload");
    assert.strictEqual(rl.flash, s.session.doc.nodes.find((n) => n.tagName === "h1").heId);
    assert.ok(events.some((e) => e.type === "agent" && e.job.status === "done"));
    // Undo AI changes restores the file.
    s.session.undoAgent();
    assert.strictEqual(fs.readFileSync(file, "utf8"), PAGE);
  } finally {
    await s.stop();
  }
});

test("Claude Code runner drives the page through hotedit mcp", async () => {
  const file = tmpPage();
  const s = await start(file);
  Object.assign(process.env, { HOTEDIT_CLAUDE_BIN: FAKE, FAKE_FIND: "<b>12%</b>", FAKE_REPLACE: "<b>15%</b>" });
  try {
    await agent.start(s.session, { prompt: "fix the number", provider: "claude" });
    await s.session.job.done;
    const j = s.session.job.snapshot();
    assert.strictEqual(j.status, "done", JSON.stringify(j.log));
    assert.ok(fs.readFileSync(file, "utf8").includes("<b>15%</b>"));
    assert.deepStrictEqual(j.log.map((e) => e.t), ["tool", "tool", "edit", "text"]);

    process.env.FAKE_FAIL = "login";
    await agent.start(s.session, { prompt: "again", provider: "claude" });
    await s.session.job.done;
    assert.strictEqual(s.session.job.status, "error");
    assert.match(s.session.job.log.at(-1).s, /isn't logged in: run `claude`/);
  } finally {
    delete process.env.FAKE_FAIL;
    delete process.env.HOTEDIT_CLAUDE_BIN;
    await s.stop();
  }
});

test("Codex runner drives the page through hotedit mcp", async () => {
  const file = tmpPage();
  const s = await start(file);
  Object.assign(process.env, { HOTEDIT_CODEX_BIN: FAKE_CODEX, FAKE_FIND: "<b>12%</b>", FAKE_REPLACE: "<b>16%</b>" });
  try {
    await agent.start(s.session, { prompt: "fix the number", provider: "codex" });
    await s.session.job.done;
    const j = s.session.job.snapshot();
    assert.strictEqual(j.status, "done", JSON.stringify(j.log));
    assert.ok(fs.readFileSync(file, "utf8").includes("<b>16%</b>"));
    assert.deepStrictEqual(j.log.map((e) => e.t), ["tool", "edit", "text"]);
  } finally {
    delete process.env.HOTEDIT_CODEX_BIN;
    await s.stop();
  }
});

test("any other agent command reaches the page via HOTEDIT_URL", async () => {
  const file = tmpPage();
  const s = await start(file);
  const before = { ...agent.loadConfig() };
  Object.assign(process.env, { FAKE_FIND: "<b>12%</b>", FAKE_REPLACE: "<b>17%</b>" });
  try {
    agent.saveConfig({ command: `"${process.execPath}" ${FAKE_AGENT} --yes` });
    assert.strictEqual(agent.status().providers.find((p) => p.id === "command").available, true);
    await agent.start(s.session, { prompt: "fix the number", provider: "command" });
    await s.session.job.done;
    const j = s.session.job.snapshot();
    assert.strictEqual(j.status, "done", JSON.stringify(j.log));
    assert.ok(fs.readFileSync(file, "utf8").includes("<b>17%</b>"));
    assert.deepStrictEqual(j.log.map((e) => e.s.slice(0, 7)), ["working", "Changed", "Saved ("]);
  } finally {
    fs.writeFileSync(path.join(process.env.HTMLEDIT_STATE_DIR, "config.json"), JSON.stringify(before));
    await s.stop();
  }
});

test("a request about a selected element can't edit anything else", async () => {
  const html = `<!doctype html><html><body>
<h1>Sales report</h1>
<p id="p1">Revenue grew 5%.</p>
<div id="chart"></div>
<p>Revenue grew 5% again.</p>
<script>Plotly.newPlot("chart", [{x: [1, 2], y: [3, 4], type: "bar"}], {title: "Sales"});</script>
</body></html>
`;
  const file = tmpPage(html);
  const s = await start(file);
  try {
    const d = s.session.doc;
    const id = (sel) => d.nodes.find((n) => n.attrs.some((a) => a.name === "id" && a.value === sel)).heId;
    // Scope a running job to the first paragraph.
    s.session.job = { status: "running", log: [], scope: agent.scopeOf(d, id("p1")) };
    s.session.broadcastJob = () => {};
    assert.throws(() => agent.runTool(s.session, "edit", { find: "Sales report", replace: "x" }), /outside the element/);
    assert.throws(() => agent.runTool(s.session, "edit", { find: "grew 5%", replace: "rose 6%", all: true }), /outside the element/);
    agent.runTool(s.session, "edit", { find: "grew 5%.", replace: "grew a lot, 5%." });
    // The scope follows the paragraph after its text got longer.
    agent.runTool(s.session, "edit", { find: 'id="p1">Revenue', replace: 'id="p1">Sales' });
    assert.throws(() => agent.runTool(s.session, "edit", { find: "5% again", replace: "x" }), /outside/);
    // A chart's own code counts as the chart.
    s.session.job.scope = agent.scopeOf(s.session.doc, id("chart"));
    agent.runTool(s.session, "edit", { find: "y: [3, 4]", replace: "y: [3, 9]" });
    assert.throws(() => agent.runTool(s.session, "edit", { find: "Revenue grew 5% again", replace: "x" }), /outside/);
    assert.strictEqual(
      fs.readFileSync(file, "utf8"),
      html.replace("grew 5%.", "grew a lot, 5%.").replace('id="p1">Revenue', 'id="p1">Sales').replace("y: [3, 4]", "y: [3, 9]"),
    );
  } finally {
    s.session.job = null;
    await s.stop();
  }
});

test("settings: key stays on disk (0600) and is never sent back", () => {
  const before = { ...agent.loadConfig() };
  try {
    const st = agent.saveConfig({ provider: "api", apiKey: "sk-ant-test-1234" }) && agent.status();
    assert.strictEqual(st.provider, "api");
    assert.ok(!JSON.stringify(st).includes("sk-ant-test-1234"));
    assert.match(st.providers.find((p) => p.id === "api").detail, /…1234/);
    const f = path.join(process.env.HTMLEDIT_STATE_DIR, "config.json");
    assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  } finally {
    fs.writeFileSync(path.join(process.env.HTMLEDIT_STATE_DIR, "config.json"), JSON.stringify(before));
  }
});

test("MCP: an outside agent finds the open page and edits it", async () => {
  const file = tmpPage();
  const s = await start(file);
  try {
    assert.ok(registry.list().some((e) => e.file === s.session.file));
    const mcp = createMcp({ registry, start, version: "t" });
    const init = await mcp.handle({ id: 1, method: "initialize", params: {} });
    assert.strictEqual(init.serverInfo.name, "hotedit");
    const names = (await mcp.handle({ id: 2, method: "tools/list" })).tools.map((t) => t.name);
    assert.deepStrictEqual(names, ["open", "outline", "read", "edit"]);
    const call = (name, args) => mcp.handle({ id: 3, method: "tools/call", params: { name, arguments: args } });
    const r = await call("edit", { file, find: "Revenue grew <b>", replace: "Revenue rose <b>" });
    assert.ok(!r.isError, r.content[0].text);
    assert.ok(fs.readFileSync(file, "utf8").includes("Revenue rose <b>"));
    const other = await call("edit", { file: "/nope.html", find: "a", replace: "b" });
    assert.ok(other.isError && /isn't open/.test(other.content[0].text));
    // `open` starts a session for a page that isn't open yet.
    const f2 = tmpPage("<p>two</p>");
    const o = await call("open", { file: f2, browser: false });
    assert.match(o.content[0].text, /Opened .* at http/);
    const multi = await call("outline", {});
    assert.match(multi.content[0].text, /Several pages are open/);
    for (const x of mcp.local.values()) await x.stop();
  } finally {
    await s.stop();
  }
  assert.ok(!registry.list().some((e) => e.file === s.session.file), "stopped sessions leave the registry");
});

test("hotedit mcp speaks JSON-RPC over stdio", async () => {
  const p = spawn("node", [path.join(__dirname, "..", "bin", "htmledit.js"), "mcp"], { env: process.env });
  try {
    const reply = await new Promise((resolve, reject) => {
      let buf = "";
      p.stdout.on("data", (d) => {
        buf += d;
        if (buf.includes("\n")) resolve(JSON.parse(buf.split("\n")[0]));
      });
      p.on("exit", (c) => reject(new Error("exited " + c)));
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
    });
    assert.strictEqual(reply.id, 7);
    assert.strictEqual(reply.result.protocolVersion, "2025-06-18");
  } finally {
    p.kill();
  }
});
