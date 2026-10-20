"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { Doc } = require("../src/doc");
const comments = require("../src/comments");

const CLI = path.join(__dirname, "..", "bin", "htmledit.js");
const SRC = `<!doctype html><html><body>
<h1>Title</h1>
<section id="results">
  <h2>Results</h2>
  <p>We beat the baseline by 4 points.</p>
  <p>Second paragraph.</p>
</section>
</body></html>
`;

function tmpFile(src = SRC) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-c-"));
  const f = path.join(dir, "r.html");
  fs.writeFileSync(f, src);
  return f;
}
const pId = (doc, k) => doc.nodes.filter((n) => n.tagName === "p")[k].heId;

test("anchor survives an agent rewriting the file around it", () => {
  const f = tmpFile();
  let doc = new Doc(SRC);
  const c = comments.add(f, doc, { id: pId(doc, 1), text: "Cite the source" });
  assert.strictEqual(c.anchor.css, "#results > p:nth-of-type(2)");
  // Agent inserts a new paragraph before it and edits the title.
  const next = SRC.replace("<h1>Title</h1>", "<h1>New title</h1>\n<p>Intro.</p>\n<p>More.</p>");
  doc = new Doc(next);
  const [r] = comments.resolved(f, doc);
  assert.strictEqual(doc.nodes[r.at].tagName, "p");
  assert.strictEqual(new Doc(next).signature(r.at).text, "Second paragraph.");
  assert.strictEqual(r.line, 8);
});

test("anchor falls back to text when the tag's source changed", () => {
  const f = tmpFile();
  let doc = new Doc(SRC);
  comments.add(f, doc, { id: pId(doc, 0), text: "Add CI" });
  const next = SRC.replace("<p>We beat", '<p class="lead">We beat');
  doc = new Doc(next);
  const [r] = comments.resolved(f, doc);
  assert.strictEqual(doc.signature(r.at).text, "We beat the baseline by 4 points.");
});

test("deleted element → anchor lost, reported in markdown", () => {
  const f = tmpFile();
  const doc = new Doc(SRC);
  comments.add(f, doc, { id: pId(doc, 1), text: "Remove?" });
  const next = SRC.replace("  <p>Second paragraph.</p>\n", "");
  const md = comments.markdown(f, new Doc(next));
  assert.match(md, /anchor lost; was line 6/);
});

test("CLI: list markdown/json, resolve, clear", () => {
  const f = tmpFile();
  const doc = new Doc(SRC);
  const c = comments.add(f, doc, { id: pId(doc, 0), text: "Say by how much in %", quote: "4 points" });
  const md = execFileSync("node", [CLI, "comments", f]).toString();
  assert.match(md, new RegExp(`## \\[${c.id}\\] <p> · line 5`));
  assert.match(md, /on the text: "4 points"/);
  assert.match(md, /```html\n<p>We beat the baseline by 4 points\.<\/p>\n```/);
  const js = JSON.parse(execFileSync("node", [CLI, "comments", f, "--json"]).toString());
  assert.strictEqual(js.comments[0].at, pId(doc, 0));
  execFileSync("node", [CLI, "comments", f, "--resolve", c.id, "--note", "now 4.1%"]);
  assert.match(execFileSync("node", [CLI, "comments", f]).toString(), /No open comments/);
  assert.match(execFileSync("node", [CLI, "comments", f, "--all"]).toString(), /\(resolved\)[\s\S]*note: now 4\.1%/);
  execFileSync("node", [CLI, "comments", f, "--clear-resolved"]);
  assert.strictEqual(comments.load(f).length, 0);
});

test("CLI --wait returns when a comment arrives", async () => {
  const f = tmpFile();
  const p = spawn("node", [CLI, "comments", f, "--wait", "--timeout", "20"]);
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  await new Promise((r) => setTimeout(r, 700));
  assert.strictEqual(out, "");
  comments.add(f, new Doc(SRC), { id: 1, text: "late comment" });
  const code = await new Promise((r) => p.on("exit", r));
  assert.strictEqual(code, 0);
  assert.match(out, /late comment/);
});
