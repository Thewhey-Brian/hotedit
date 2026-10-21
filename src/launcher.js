// `hotedit` with no file: a local page listing the HTML files in a folder.
// Clicking one starts an editing session for it (one per file, reused).
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { start } = require("./server");

const SKIP = new Set([
  "node_modules",
  ".git",
  ".htmledit",
  "__pycache__",
  ".venv",
  "venv",
]);

// HTML files under `dir`, newest first, at most `depth` folders deep.
function findHtml(dir, depth = 3) {
  const out = [];
  const walk = (d, level) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (level < depth && !SKIP.has(e.name)) walk(p, level + 1);
      } else if (/\.html?$/i.test(e.name)) {
        const st = fs.statSync(p);
        out.push({
          rel: path.relative(dir, p),
          size: st.size,
          mtime: st.mtimeMs,
        });
      }
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 500);
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const size = (n) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(0) + " KB"
      : (n / 1048576).toFixed(1) + " MB";
const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return Math.round(s / 60) + " min ago";
  if (s < 129600) return Math.round(s / 3600) + " h ago";
  return new Date(t).toISOString().slice(0, 10);
};

function page(dir, files, token) {
  const rows = files.length
    ? files
        .map(
          (f) =>
            `<a class="f" href="/open?t=${token}&amp;f=${encodeURIComponent(f.rel)}"><span class="n">${esc(f.rel)}</span><span class="m">${size(f.size)} · ${ago(f.mtime)}</span></a>`,
        )
        .join("\n")
    : `<p class="empty">No HTML files in this folder. Run <code>hotedit path/to/report.html</code>, or start hotedit in the folder that holds your reports.</p>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>hotedit</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #fafafa; color: #18181b; }
  main { max-width: 760px; margin: 48px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .dir { color: #71717a; font-size: 13px; margin: 0 0 24px; word-break: break-all; }
  .f { display: flex; justify-content: space-between; gap: 16px; padding: 12px 16px; margin: 6px 0; border-radius: 10px;
    background: #fff; border: 1px solid #e4e4e7; text-decoration: none; color: inherit; }
  .f:hover { border-color: #2563eb; box-shadow: 0 2px 10px rgba(37,99,235,.12); }
  .n { font-weight: 500; word-break: break-all; }
  .m { color: #71717a; font-size: 13px; white-space: nowrap; }
  .empty { color: #52525b; }
  code { background: #f4f4f5; padding: 1px 5px; border-radius: 4px; }
  input { width: 100%; box-sizing: border-box; font: inherit; padding: 9px 12px; border: 1px solid #d4d4d8; border-radius: 8px; margin: 0 0 16px; }
</style></head>
<body><main>
<h1>Pick a page to edit</h1>
<p class="dir">${esc(dir)}</p>
<input id="q" placeholder="Filter…" autofocus>
<div id="list">
${rows}
</div>
<script>
  q.oninput = () => { for (const a of list.querySelectorAll(".f")) a.style.display = a.textContent.toLowerCase().includes(q.value.toLowerCase()) ? "" : "none"; };
</script>
</main></body></html>`;
}

async function startLauncher(dir, { port = 0, host = "127.0.0.1" } = {}) {
  dir = path.resolve(dir);
  const token = crypto.randomBytes(8).toString("hex");
  const sessions = new Map(); // file → started session
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    try {
      if (u.pathname === "/") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(page(dir, findHtml(dir), token));
      }
      if (u.pathname === "/open") {
        if (u.searchParams.get("t") !== token)
          throw Object.assign(new Error("bad token"), { code: 403 });
        const file = path.resolve(dir, u.searchParams.get("f") || "");
        if (
          !file.startsWith(dir + path.sep) ||
          !/\.html?$/i.test(file) ||
          !fs.existsSync(file)
        )
          throw Object.assign(new Error("not an HTML file in this folder"), {
            code: 404,
          });
        if (!sessions.has(file))
          sessions.set(file, await start(file, { host }));
        res.writeHead(302, { Location: sessions.get(file).url });
        return res.end();
      }
      res.writeHead(404);
      res.end("not found");
    } catch (e) {
      res.writeHead(e.code || 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end("hotedit: " + e.message);
    }
  });
  const stop = async () => {
    for (const s of sessions.values()) await s.stop();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () =>
      resolve({
        url: `http://${host}:${server.address().port}/`,
        server,
        stop,
        sessions,
        token,
      }),
    );
  });
}

module.exports = { startLauncher, findHtml };
