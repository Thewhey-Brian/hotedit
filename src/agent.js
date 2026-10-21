// The built-in AI agent: tools that read and edit the open page (every edit
// is saved and shows up in the browser at once), and two ways to run them —
// the user's Claude Code login, or an Anthropic API key.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

// ---------- tools (shared by the in-app agent and `hotedit mcp`) ----------

const TOOLS = [
  {
    name: "outline",
    description:
      "List the elements of the page as an indented tree: [id] tag#id.class “text…”. Use the ids with read. Ids change when elements are added, removed or moved, so call outline again after such edits.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "read",
    description:
      "The exact HTML source of one element (by id from outline), as it is in the file. Copy text from here into edit's `find`. Long data: URLs are shortened and can't be edited.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "element id from outline" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "edit",
    description:
      "Replace text in the HTML file: `find` must appear exactly once (add surrounding context to make it unique) unless `all` is true. The change is saved and shown to the user immediately. Use it for text, attributes, styles, inserted or removed elements, and chart data in <script> blocks.",
    input_schema: {
      type: "object",
      properties: {
        find: { type: "string", description: "exact source text to replace" },
        replace: { type: "string", description: "new text" },
        all: { type: "boolean", description: "replace every occurrence" },
      },
      required: ["find", "replace"],
      additionalProperties: false,
    },
  },
];

const SKIP = new Set(["script", "style", "noscript", "template"]);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const norm = (s) => s.replace(/\s+/g, " ").trim();

function ownText(n) {
  let t = "";
  for (const c of n.childNodes || []) if (c.nodeName === "#text") t += c.value;
  return norm(t);
}

function label(n) {
  const a = Object.fromEntries((n.attrs || []).map((x) => [x.name, x.value]));
  let s = n.tagName;
  if (a.id) s += "#" + a.id;
  if (a.class) s += "." + norm(a.class).split(" ").slice(0, 3).join(".");
  return s;
}

function outline(doc, { max = 700 } = {}) {
  const body = doc.nodes.find((n) => n.tagName === "body");
  const head = doc.nodes.find((n) => n.tagName === "head");
  const lines = [];
  const title = doc.nodes.find((n) => n.tagName === "title");
  if (title) lines.push(`title: ${ownText(title)}`);
  if (head) {
    const scripts = (head.childNodes || []).filter(
      (c) => c.tagName === "script" || c.tagName === "style",
    );
    if (scripts.length)
      lines.push(
        `head: ${scripts.map((c) => `[${c.heId}] ${c.tagName}`).join(", ")}`,
      );
  }
  const walk = (n, depth) => {
    for (const c of n.childNodes || []) {
      if (!c.tagName || c.heId == null) continue;
      if (lines.length >= max) return;
      const t = SKIP.has(c.tagName) ? "" : ownText(c);
      const src =
        c.tagName === "script" && (c.attrs || []).find((a) => a.name === "src");
      lines.push(
        `${"  ".repeat(depth)}[${c.heId}] ${label(c)}${t ? ` “${clip(t, 70)}”` : ""}${src ? ` src=${clip(src.value, 60)}` : ""}`,
      );
      if (c.tagName === "svg") {
        const k = doc.nodes.filter(
          (x) => x.heId > c.heId && within(doc, x, c),
        ).length;
        if (k) lines.push(`${"  ".repeat(depth + 1)}(${k} svg elements)`);
        continue;
      }
      if (!SKIP.has(c.tagName)) walk(c, depth + 1);
    }
  };
  if (body) walk(body, 0);
  if (lines.length >= max)
    lines.push(
      `… (outline cut at ${max} lines; read a container to see inside)`,
    );
  return lines.join("\n");
}

function within(doc, x, c) {
  const [a, b] = doc.outerRange(c);
  const s = x.sourceCodeLocation.startOffset;
  return s >= a && s < b;
}

// Long data: URLs would flood the model; it can still edit around them.
const elide = (s) =>
  s.replace(
    /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]{300,}/g,
    (m) => `${m.slice(0, 40)}…[${Math.round(m.length / 1024)} KB elided]`,
  );

function read(doc, id, { max = 60000 } = {}) {
  const n = doc.nodes[id];
  if (!n) throw new Error(`no element [${id}]; call outline for current ids`);
  const [a, b] = doc.outerRange(n);
  const line = doc.src.slice(0, a).split("\n").length;
  let s = elide(doc.src.slice(a, b));
  if (s.length > max)
    s =
      s.slice(0, max) +
      `\n… (${s.length - max} more characters; read a child element)`;
  return `[${id}] <${n.tagName}> at line ${line}:\n${s}`;
}

// Innermost element whose source contains `offset`.
function elementAt(doc, offset) {
  let best = null;
  for (const n of doc.nodes) {
    const [a, b] = doc.outerRange(n);
    if (a <= offset && offset < b && (!best || b - a < best[1] - best[0]))
      best = [a, b, n];
  }
  return best ? best[2].heId : null;
}

// What to highlight for a change at `offset`: the element itself, or for
// chart code in a <script>, the chart it draws.
function flashTarget(doc, offset) {
  const id = elementAt(doc, offset);
  const n = id != null && doc.nodes[id];
  if (!n || n.tagName !== "script") return id;
  let charts = [];
  try {
    charts = require("./charts").findCharts(doc).filter((c) => c.script === id);
  } catch {}
  if (!charts.length) return null;
  const end = (c) => Math.max(c.call, ...c.specs.map((x) => x.node.end || 0));
  const c = charts.find((x) => x.call <= offset && offset <= end(x)) || charts.find((x) => x.call > offset) || charts[0];
  const t = c.target || {};
  const want = t.id || (/^#([\w-]+)$/.exec(t.selector || "") || [])[1];
  const el = want && doc.nodes.find((x) => (x.attrs || []).some((a) => a.name === "id" && a.value === want));
  return el ? el.heId : null;
}

// Apply one tool call to a server Session. Edits go through session.write,
// so they are undoable and every open tab reloads to show them.
function runTool(session, name, input = {}) {
  if (name === "outline") return outline(session.doc);
  if (name === "read") return read(session.doc, Number(input.id));
  if (name === "edit") {
    const { find, replace, all } = input;
    if (typeof find !== "string" || typeof replace !== "string" || !find)
      throw new Error("edit needs `find` and `replace` strings");
    const src = session.src;
    const at = src.indexOf(find);
    if (at < 0) {
      const hint = find.includes("elided]")
        ? " (the source has the full data: URL; edit around it)"
        : "";
      throw new Error(
        `\`find\` text is not in the file${hint}; read the element again and copy it exactly`,
      );
    }
    const count = src.split(find).length - 1;
    if (count > 1 && !all)
      throw new Error(
        `\`find\` appears ${count} times; include more surrounding text, or set all: true`,
      );
    const next = all
      ? src.split(find).join(replace)
      : src.slice(0, at) + replace + src.slice(at + find.length);
    session.writer = null;
    const r = session.write(next, "AI edit", false, at);
    if (!r.changed) return "No change (replacement is identical).";
    if (session.job && session.job.status === "running") {
      session.job.log.push({ t: "edit", s: describeEdit(session.doc, elementAt(session.doc, at)) });
      session.broadcastJob();
    }
    const line = next.slice(0, at).split("\n").length;
    return `Saved (line ${line}${count > 1 ? `, ${count} places` : ""}); the user sees it now.${r.reload ? " Element ids changed; call outline before using ids again." : ""}`;
  }
  throw new Error(`unknown tool ${name}`);
}

const KIND = { title: "page title", p: "paragraph", li: "list item", td: "table cell", th: "table header", script: "chart/script code", style: "styles", a: "link", img: "image", span: "text", div: "block", section: "section", table: "table", ul: "list", ol: "list", figure: "figure", figcaption: "caption", blockquote: "quote", pre: "code block", code: "code", button: "button", header: "header", footer: "footer" };
function describeEdit(doc, id) {
  const n = id != null && doc.nodes[id];
  if (!n) return "Changed the page";
  const kind = /^h[1-6]$/.test(n.tagName) ? "heading" : KIND[n.tagName] || n.tagName;
  const t = SKIP.has(n.tagName) ? "" : ownText(n);
  return `Changed ${kind}${t ? ` “${clip(t, 40)}”` : ""}`;
}

// ---------- settings ----------

const stateDir = () =>
  process.env.HTMLEDIT_STATE_DIR || path.join(os.homedir(), ".htmledit");
const configFile = () => path.join(stateDir(), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  for (const k of Object.keys(next))
    if (next[k] === "" || next[k] == null) delete next[k];
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(configFile(), 0o600);
  return next;
}

function findOnPath(cmd) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  dirs.push(
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".claude", "local"),
  );
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const d of dirs)
    for (const e of exts) {
      const f = path.join(d, cmd + e);
      try {
        if (fs.statSync(f).isFile()) return f;
      } catch {}
    }
  return null;
}

const claudeBin = () => {
  const f = process.env.HOTEDIT_CLAUDE_BIN;
  if (f) return fs.existsSync(f) ? f : null;
  return findOnPath("claude");
};

// What the browser may know: never the key itself.
function status() {
  const cfg = loadConfig();
  const claude = claudeBin();
  const key = process.env.ANTHROPIC_API_KEY
    ? "env"
    : cfg.apiKey
      ? "saved"
      : null;
  const provider = cfg.provider || (claude ? "claude" : key ? "api" : null);
  return {
    provider,
    model: cfg.model || "",
    providers: [
      {
        id: "claude",
        available: !!claude,
        detail: claude ? "Claude Code found" : "Claude Code not installed",
      },
      {
        id: "api",
        available: !!key,
        detail:
          key === "env"
            ? "using ANTHROPIC_API_KEY"
            : key
              ? `saved key …${cfg.apiKey.slice(-4)}`
              : "no key yet",
      },
    ],
  };
}

// ---------- running a request ----------

const SYSTEM = `You edit an HTML page that a person has open in hotedit, a live editor. Every edit you make is saved into the file and appears on their screen straight away, so work in small, precise edits.

- Use outline to find things, read to get exact source, edit to change it.
- If the person selected an element, the request is about that element unless they say otherwise.
- Do exactly what was asked and nothing more. Keep the file's existing style, wording elsewhere, indentation and formatting; never reformat or rewrite unrelated parts.
- Charts are drawn by <script> code (Plotly, Chart.js, Vega-Lite, Mermaid…): change their data or options there.
- If the request is unclear or impossible, say so instead of guessing.
- Finish with one short plain sentence telling the person what you changed.`;

function taskText(session, { prompt, target: id }) {
  const name = path.basename(session.file);
  let t = `Page: ${name}\n\nRequest: ${prompt}\n`;
  if (id != null && session.doc.nodes[id])
    t += `\nThe request is about this element (the one the person selected):\n${read(session.doc, id, { max: 20000 })}\n`;
  else t += "\nThe request is about the whole page.\n";
  return t;
}

class Job {
  constructor(session, req) {
    this.session = session;
    this.id = Date.now().toString(36);
    this.prompt = req.prompt;
    this.target = req.id ?? null;
    this.status = "running";
    this.log = [];
    this.undoStart = session.undo.length;
    this.stopped = false;
  }
  snapshot() {
    return {
      id: this.id,
      prompt: this.prompt,
      target: this.target,
      status: this.status,
      log: this.log,
      edits: this.session.undo.length - this.undoStart,
    };
  }
}

async function runApi(job, cfg) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client =
    job.client ||
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || cfg.apiKey });
  const model = cfg.model || "claude-opus-5-5";
  const tools = TOOLS.map((t) => ({ ...t, eager_input_streaming: true }));
  const messages = [{ role: "user", content: taskText(job.session, job) }];
  let jsonRetries = 0;
  for (let turn = 0; turn < 40; turn++) {
    if (job.stopped) return;
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 64000,
      system: SYSTEM,
      tools,
      messages,
      output_config: { effort: "medium" },
      // On a policy decline, the API re-runs the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    job.abort = () => stream.abort();
    let text = null;
    stream.on("text", (d) => {
      if (!text) job.log.push((text = { t: "text", s: "" }));
      text.s += d;
      job.session.broadcastJob();
    });
    let msg;
    try {
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (e) {
      if (job.stopped) return;
      if (e instanceof Anthropic.APIError || jsonRetries++ >= 2) throw e;
      continue; // a tool input that wasn't parseable JSON: re-issue the turn
    }
    if (msg.stop_reason === "refusal")
      throw new Error("The model declined this request.");
    const uses = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (!uses.length) return;
    if (msg.stop_reason === "max_tokens")
      throw new Error("The reply was cut off (too long).");
    messages.push({ role: "assistant", content: msg.content });
    const results = [];
    for (const u of uses) {
      const bad = validate(u.name, u.input);
      if (bad) {
        results.push({
          type: "tool_result",
          tool_use_id: u.id,
          is_error: true,
          content: bad,
        });
        continue;
      }
      job.log.push({ t: "tool", s: toolLine(u.name, u.input, job.session.doc) });
      job.session.broadcastJob();
      try {
        results.push({
          type: "tool_result",
          tool_use_id: u.id,
          content: runTool(job.session, u.name, u.input),
        });
      } catch (e) {
        results.push({
          type: "tool_result",
          tool_use_id: u.id,
          is_error: true,
          content: e.message,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Stopped after 40 steps.");
}

// The streamed-input parser is tolerant, so check inputs before running.
function validate(name, input) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return `unknown tool ${name}`;
  if (!input || typeof input !== "object")
    return "INVALID_JSON: input is not an object";
  for (const k of t.input_schema.required || [])
    if (!(k in input)) return `INVALID_JSON: missing ${k}`;
  for (const [k, v] of Object.entries(input)) {
    const want = t.input_schema.properties[k];
    if (!want) return `INVALID_JSON: unexpected field ${k}`;
    const ok =
      want.type === "integer" ? Number.isInteger(v) : typeof v === want.type;
    if (!ok) return `INVALID_JSON: ${k} should be ${want.type}`;
  }
  return null;
}

function toolLine(name, input = {}, doc = null) {
  if (name === "outline") return "Looking over the page";
  if (name === "read") {
    const n = doc && doc.nodes[input.id];
    if (!n) return "Reading the source";
    const kind = /^h[1-6]$/.test(n.tagName) ? "heading" : KIND[n.tagName] || n.tagName;
    return `Reading the ${kind}`;
  }
  if (name === "edit") return "Editing…";
  return name;
}

// Claude Code with the user's own login; it reaches the page through
// `hotedit mcp`, pinned to this session.
function runClaude(job, cfg) {
  const s = job.session;
  const bin = claudeBin();
  if (!bin)
    throw new Error(
      "Claude Code isn't installed. Get it at https://claude.com/code, run `claude` once to log in, then try again.",
    );
  const mcp = {
    mcpServers: {
      hotedit: {
        command: process.execPath,
        args: [path.join(__dirname, "..", "bin", "htmledit.js"), "mcp"],
        env: { HOTEDIT_URL: s.url, HOTEDIT_TOKEN: s.token },
      },
    },
  };
  const allowed = TOOLS.map((t) => `mcp__hotedit__${t.name}`);
  const args = [
    "-p",
    taskText(s, job),
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    SYSTEM,
    "--mcp-config",
    JSON.stringify(mcp),
    "--strict-mcp-config",
    "--tools",
    "",
    "--allowedTools",
    allowed.join(","),
    "--permission-mode",
    "dontAsk",
  ];
  if (cfg.model) args.push("--model", cfg.model);
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, {
      cwd: s.dir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    job.abort = () => p.kill();
    let buf = "",
      err = "",
      result = null;
    p.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "assistant" && ev.message) {
          for (const b of ev.message.content || []) {
            if (b.type === "text" && b.text.trim())
              job.log.push({ t: "text", s: b.text.trim() });
            if (b.type === "tool_use")
              job.log.push({
                t: "tool",
                s: toolLine(b.name.replace(/^mcp__hotedit__/, ""), b.input, s.doc),
              });
          }
          s.broadcastJob();
        }
        if (ev.type === "result") result = ev;
      }
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (job.stopped) return resolve();
      if (result && !result.is_error) return resolve();
      const why =
        (result && (result.result || (result.errors || []).join(" "))) ||
        err.trim() ||
        `Claude Code exited with code ${code}`;
      reject(
        new Error(
          /log ?in|auth|credential/i.test(why)
            ? `Claude Code isn't logged in: run \`claude\` in a terminal, type /login, then try again. (${clip(why, 160)})`
            : clip(why, 400),
        ),
      );
    });
  });
}

async function start(session, req) {
  if (session.job && session.job.status === "running")
    throw new Error("The AI is still working on the last request");
  if (!req.prompt || !String(req.prompt).trim())
    throw new Error("Tell the AI what to change");
  const cfg = loadConfig();
  const provider = req.provider || status().provider;
  if (!provider) throw new Error("Connect an AI first (✨ → Connect)");
  const job = new Job(session, {
    prompt: String(req.prompt).trim(),
    id: req.id,
  });
  if (req.client) job.client = req.client; // tests
  session.job = job;
  session.broadcastJob();
  const run = provider === "api" ? runApi(job, cfg) : runClaude(job, cfg);
  job.done = run
    .then(
      () => {
        job.status = job.stopped ? "stopped" : "done";
      },
      (e) => {
        job.status = job.stopped ? "stopped" : "error";
        if (!job.stopped) job.log.push({ t: "error", s: e.message });
      },
    )
    .then(() => session.broadcastJob());
  return job.snapshot();
}

function stop(session) {
  const job = session.job;
  if (!job || job.status !== "running") return { ok: true };
  job.stopped = true;
  if (job.abort) job.abort();
  return { ok: true };
}

module.exports = {
  TOOLS,
  outline,
  read,
  runTool,
  elementAt,
  flashTarget,
  loadConfig,
  saveConfig,
  status,
  start,
  stop,
  validate,
  SYSTEM,
  taskText,
};
