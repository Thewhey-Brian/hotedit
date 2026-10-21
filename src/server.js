// Local edit server: serves the instrumented page plus the file's directory,
// applies overlay edits as patches to the original file, keeps undo history.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { Doc, applyPatches } = require("./doc");
const charts = require("./charts");
const agent = require("./agent");
const { livePatch } = require("./livepatch");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

class Session {
  constructor(file) {
    this.file = path.resolve(file);
    this.dir = path.dirname(this.file);
    this.token = crypto.randomBytes(12).toString("hex");
    this.undo = [];
    this.redo = [];
    // Bumped whenever element ids may have shifted; stale pages must reload.
    this.version = 1;
    this.clients = new Set();
    this.load();
    this.backup();
  }

  load() {
    const buf = fs.readFileSync(this.file);
    const src = buf.toString("utf8");
    // Writing back a mis-decoded file would corrupt it; only edit UTF-8.
    if (!Buffer.from(src, "utf8").equals(buf)) {
      throw new Error(`${path.basename(this.file)} is not valid UTF-8; htmledit only edits UTF-8 files`);
    }
    this.src = src;
    this.doc = new Doc(this.src);
  }

  backup() {
    const dir = process.env.HTMLEDIT_BACKUP_DIR || path.join(os.homedir(), ".htmledit", "backups");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.backupFile = path.join(dir, `${path.basename(this.file)}.${stamp}`);
    fs.writeFileSync(this.backupFile, this.src);
  }

  // `structural`: ids shift even if the tag sequence looks the same (moves).
  // `flashAt`: source offset of the change, for tabs to highlight it.
  write(next, label, structural = false, flashAt = null) {
    const before = this.src;
    if (next === before) return { changed: false };
    const tags = this.tagList();
    const prev = this.doc;
    const base = this.version;
    fs.writeFileSync(this.file, next);
    this.lastWritten = next;
    this.undo.push({ before, after: next, label });
    this.redo = [];
    this.load();
    // Element ids shift when the element structure changes; overlay must reload.
    const reload = structural || this.tagList() !== tags;
    if (reload) this.version++;
    this.notifyOthers(flashAt == null ? null : agent.flashTarget(this.doc, flashAt), this.patchFrom(prev, base));
    return { changed: true, reload };
  }

  external() {
    let cur;
    try {
      cur = fs.readFileSync(this.file, "utf8");
    } catch {
      return;
    }
    if (cur === this.src) return;
    const prev = this.doc;
    const base = this.version;
    this.src = cur;
    this.doc = new Doc(cur);
    this.undo = [];
    this.redo = [];
    this.version++;
    this.broadcast({ type: "reload", reason: "file changed on disk", ...this.patchFrom(prev, base) });
  }

  // How open pages can show the change in place instead of reloading.
  patchFrom(prev, base) {
    let patch = null;
    try {
      patch = livePatch(prev, this.doc);
    } catch {}
    return patch ? { patch, base, version: this.version } : {};
  }

  // Other tabs on this file must update, or they'd overwrite this change.
  notifyOthers(flash = null, live = {}) {
    this.broadcast({ type: "reload", reason: "edited in another tab", except: this.writer, flash, ...live });
  }

  broadcastJob() {
    if (this.job) this.broadcast({ type: "agent", job: this.job.snapshot() });
  }

  // Undo the AI's own steps of the last request, newest first.
  undoAgent() {
    const job = this.job;
    if (!job) return { changed: false };
    let n = 0;
    while (this.undo.length > job.undoStart && this.undo[this.undo.length - 1].label === "AI edit") {
      if (!this.history(this.undo, this.redo).changed) break;
      n++;
    }
    job.undoStart = this.undo.length;
    job.log.push({ t: "undo", s: n ? `Undid ${n} AI change${n > 1 ? "s" : ""}` : "Nothing to undo" });
    this.broadcastJob();
    return { changed: n > 0, reload: n > 0 };
  }

  broadcast(msg) {
    for (const res of this.clients)
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  history(stackFrom, stackTo) {
    const step = stackFrom.pop();
    if (!step) return { changed: false };
    const want = stackFrom === this.undo ? step.after : step.before;
    const put = stackFrom === this.undo ? step.before : step.after;
    if (this.src !== want) {
      stackFrom.length = 0;
      return { changed: false, error: "file changed; history cleared" };
    }
    fs.writeFileSync(this.file, put);
    this.lastWritten = put;
    stackTo.push(step);
    this.notifyOthers();
    this.load();
    this.version++;
    return { changed: true, reload: true };
  }

  tagList() {
    return this.doc.nodes.map((n) => n.tagName).join(",");
  }

  // Absolute URL so a page's <base href> can't redirect the overlay.
  overlayTag(origin) {
    return `\n<script src="${origin}/__he/overlay.js" data-he-token="${this.token}" data-he-version="${this.version}" data-he-overlay></script>\n`;
  }
}

// Running sessions, so `hotedit mcp` in an agent can find the open pages.
const registry = {
  dir: () => path.join(process.env.HTMLEDIT_STATE_DIR || path.join(os.homedir(), ".htmledit"), "sessions"),
  name: (s) => `${process.pid}-${new URL(s.url).port}.json`,
  add(s) {
    try {
      fs.mkdirSync(this.dir(), { recursive: true });
      const f = path.join(this.dir(), this.name(s));
      fs.writeFileSync(f, JSON.stringify({ file: s.file, url: s.url, token: s.token, pid: process.pid }), { mode: 0o600 });
      if (!this.hooked) {
        this.hooked = new Set();
        process.on("exit", () => {
          for (const x of this.hooked) this.remove(x);
        });
      }
      this.hooked.add(s);
    } catch {}
  },
  remove(s) {
    try {
      fs.unlinkSync(path.join(this.dir(), this.name(s)));
    } catch {}
    if (this.hooked) this.hooked.delete(s);
  },
  list() {
    let files = [];
    try {
      files = fs.readdirSync(this.dir()).filter((f) => f.endsWith(".json"));
    } catch {}
    const out = [];
    for (const f of files) {
      try {
        const e = JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf8"));
        process.kill(e.pid, 0); // still running?
        out.push(e);
      } catch {
        try {
          fs.unlinkSync(path.join(this.dir(), f));
        } catch {}
      }
    }
    return out;
  },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      b += c;
      if (b.length > 50e6) reject(new Error("too large"));
    });
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body),
  );
}

function createServer(session) {
  const overlayPath = path.join(__dirname, "overlay.js");
  const chartFormPath = path.join(__dirname, "chartform.js");
  const api = {
    "GET /node": (q) => session.doc.signature(Number(q.get("id"))),
    "POST /edit": (q, body) => {
      if (body.version !== session.version) return { stale: true };
      const patches = body.edits.map((e) =>
        e.source != null
          ? session.doc.patchInnerSource(e.id, e.source)
          : session.doc.patchInner(e.id, e.html),
      );
      return session.write(
        applyPatches(session.src, patches),
        body.label || "edit",
      );
    },
    "POST /op": (q, body) => {
      if (body.version !== session.version) return { stale: true };
      const d = session.doc;
      const ops = {
        attr: () => d.patchAttr(body.id, body.name, body.value),
        style: () => d.patchStyle(body.id, body.props),
        remove: () => d.removeElement(body.id),
        duplicate: () => d.duplicateElement(body.id),
        move: () => d.moveElement(body.id, body.dir),
        insert: () => d.insertElement(body.id, body.where || "after", String(body.html)),
        moveTo: () => d.moveElementTo(body.id, body.ref, body.where),
      };
      if (!ops[body.op]) throw new Error(`unknown op ${body.op}`);
      const patch = ops[body.op]();
      const structural = ["remove", "duplicate", "move", "insert", "moveTo"].includes(body.op);
      const r = session.write(applyPatches(session.src, patch.patches || [patch]), body.op, structural);
      if (patch.focus != null) r.select = session.doc.idAt(patch.focus);
      return r;
    },
    // Save an uploaded image next to the HTML file; returns a relative path.
    "POST /asset": (q, body) => {
      const base = path.basename(session.file).replace(/\.[^.]+$/, "");
      const dir = path.join(session.dir, `${base}_assets`);
      fs.mkdirSync(dir, { recursive: true });
      const safe = path.basename(body.name).replace(/[^\w.-]+/g, "_") || "image";
      let name = safe;
      for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = safe.replace(/(\.[^.]*)?$/, `-${i}$1`);
      fs.writeFileSync(path.join(dir, name), Buffer.from(body.data, "base64"));
      return { path: `${base}_assets/${name}` };
    },
    "GET /charts": () => charts.findCharts(session.doc).map(charts.describe),
    "POST /chart": (q, body) => {
      if (body.version !== session.version) return { stale: true };
      const patches = charts.patchChart(session.doc, body.index, body.values);
      return session.write(applyPatches(session.src, patches), "chart");
    },
    "GET /agent": () => ({
      ...agent.status(),
      job: session.job ? session.job.snapshot() : null,
      jobs: (session.jobs || []).map((j) => j.snapshot()),
    }),
    "POST /agent/new": () => agent.newChat(session),
    "POST /agent/config": (q, b) => {
      const patch = {};
      if (b.provider !== undefined) patch.provider = b.provider;
      if (b.model !== undefined) patch.model = String(b.model).trim();
      if (b.apiKey !== undefined) patch.apiKey = String(b.apiKey).trim();
      if (b.command !== undefined) patch.command = String(b.command).trim();
      agent.saveConfig(patch);
      return agent.status();
    },
    "POST /agent/run": (q, b) => {
      if (b.version != null && b.version !== session.version) return { stale: true };
      return agent.start(session, b);
    },
    "POST /agent/stop": () => agent.stop(session),
    "POST /agent/undo": () => session.undoAgent(),
    // The MCP bridge (`hotedit mcp`) calls the same tools over HTTP.
    "POST /agent/tool": (q, b) => {
      try {
        return { text: agent.runTool(session, b.name, b.input || {}) };
      } catch (e) {
        return { text: e.message, isError: true };
      }
    },
    "POST /undo": () => session.history(session.undo, session.redo),
    "POST /redo": () => session.history(session.redo, session.undo),
    "GET /state": () => ({
      file: session.file,
      undo: session.undo.length,
      redo: session.redo.length,
      backup: session.backupFile,
    }),
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    try {
      if (p === "/" || p === "/" + path.basename(session.file)) {
        return send(
          res,
          200,
          session.doc.instrument(session.overlayTag(`http://${req.headers.host}`)),
          MIME[".html"],
        );
      }
      if (p === "/__he/overlay.js")
        return send(
          res,
          200,
          fs.readFileSync(chartFormPath, "utf8") + "\n" + fs.readFileSync(overlayPath, "utf8"),
          MIME[".js"],
        );
      if (p === "/__he/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        res.write(": hi\n\n");
        session.clients.add(res);
        req.on("close", () => session.clients.delete(res));
        return;
      }
      if (p.startsWith("/__he/api/")) {
        if (req.headers["x-he-token"] !== session.token)
          return send(res, 403, { error: "bad token" });
        session.writer = req.headers["x-he-client"] || null;
        const fn = api[`${req.method} ${p.slice("/__he/api".length)}`];
        if (!fn) return send(res, 404, { error: "no such api" });
        const body = req.method === "POST" ? await readBody(req) : null;
        return send(res, 200, await fn(url.searchParams, body));
      }
      const f = path.resolve(session.dir, "." + p);
      if (!f.startsWith(session.dir + path.sep))
        return send(res, 403, "forbidden", "text/plain");
      if (!fs.existsSync(f) || !fs.statSync(f).isFile())
        return send(res, 404, "not found", "text/plain");
      return send(
        res,
        200,
        fs.readFileSync(f),
        MIME[path.extname(f).toLowerCase()] || "application/octet-stream",
      );
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });
}

async function start(file, { port = 0, host = "127.0.0.1" } = {}) {
  const session = new Session(file);
  const server = createServer(session);
  // Poll instead of fs.watchFile: its baseline stat is async and misses
  // writes that land right after startup.
  const stampOf = (f) => {
    try {
      const st = fs.statSync(f);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return "";
    }
  };
  let seen = stampOf(session.file);
  const timer = setInterval(() => {
    const now = stampOf(session.file);
    if (now !== seen) {
      seen = now;
      session.external();
    }
  }, 300);
  timer.unref();
  const stop = () => {
    clearInterval(timer);
    registry.remove(session);
    if (session.job) agent.stop(session);
    for (const res of session.clients) res.end();
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  };
  return new Promise((resolve, reject) => {
    server.once("error", (e) => {
      clearInterval(timer);
      reject(e.code === "EADDRINUSE" ? new Error(`port ${port} is already in use; try --port 0`) : e);
    });
    server.listen(port, host, () => {
      const url = `http://${host}:${server.address().port}/`;
      session.url = url;
      registry.add(session);
      resolve({ server, session, url, stop });
    });
  });
}

module.exports = { start, Session, createServer, registry };
