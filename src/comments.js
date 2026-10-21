// Comments pinned to elements, for hand-off to a coding agent. Stored in a
// sidecar `.htmledit/<name>.comments.json` next to the HTML. Anchors carry
// enough context (source snippet, text, CSS path, line) to be re-found after
// the file is rewritten by someone else.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sidecar = (file) =>
  path.join(
    path.dirname(file),
    ".htmledit",
    path.basename(file) + ".comments.json",
  );

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(sidecar(file), "utf8")).comments || [];
  } catch {
    return [];
  }
}

function save(file, comments) {
  const f = sidecar(file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".tmp";
  fs.writeFileSync(
    tmp,
    JSON.stringify({ file: path.basename(file), comments }, null, 2) + "\n",
  );
  fs.renameSync(tmp, f);
}

const norm = (s) => s.replace(/\s+/g, " ").trim();
const lineOf = (src, offset) => src.slice(0, offset).split("\n").length;

function textOf(n) {
  let t = "";
  const walk = (p) => {
    for (const c of p.childNodes || []) {
      if (c.nodeName === "#text") t += c.value;
      else if (c.tagName && c.tagName !== "script" && c.tagName !== "style")
        walk(c);
    }
  };
  walk(n);
  return norm(t);
}

function cssPath(n) {
  const parts = [];
  for (let e = n; e && e.tagName && e.tagName !== "html"; e = e.parentNode) {
    const id = (e.attrs.find((a) => a.name === "id") || {}).value;
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      parts.unshift("#" + id);
      break;
    }
    const sibs = (e.parentNode.childNodes || []).filter(
      (c) => c.tagName === e.tagName,
    );
    parts.unshift(
      sibs.length > 1
        ? `${e.tagName}:nth-of-type(${sibs.indexOf(e) + 1})`
        : e.tagName,
    );
  }
  return parts.join(" > ");
}

function anchorFor(doc, id) {
  const n = doc.nodes[id];
  if (!n) throw new Error(`no element ${id}`);
  const [a, b] = doc.outerRange(n);
  return {
    tag: n.tagName,
    line: lineOf(doc.src, a),
    css: cssPath(n),
    text: textOf(n).slice(0, 160),
    source: doc.src.slice(a, Math.min(b, a + 300)),
  };
}

// Current element id for an anchor, or null if it can't be found any more.
function locate(doc, anchor) {
  const near = (ns) =>
    ns.sort(
      (x, y) =>
        Math.abs(
          lineOf(doc.src, x.sourceCodeLocation.startOffset) - anchor.line,
        ) -
        Math.abs(
          lineOf(doc.src, y.sourceCodeLocation.startOffset) - anchor.line,
        ),
    )[0];
  const head = anchor.source.slice(0, 120);
  let hits = doc.nodes.filter(
    (n) =>
      n.tagName === anchor.tag &&
      doc.src.startsWith(head, n.sourceCodeLocation.startOffset),
  );
  if (hits.length) return near(hits).heId;
  if (anchor.text) {
    hits = doc.nodes.filter(
      (n) =>
        n.tagName === anchor.tag && textOf(n).slice(0, 160) === anchor.text,
    );
    if (hits.length) return near(hits).heId;
  }
  hits = doc.nodes.filter((n) => cssPath(n) === anchor.css);
  return hits.length === 1 ? hits[0].heId : null;
}

function add(file, doc, { id, text, quote }) {
  const comments = load(file);
  const c = {
    id: crypto.randomBytes(3).toString("hex"),
    status: "open",
    created: new Date().toISOString(),
    text: String(text).trim(),
    quote: quote ? String(quote).slice(0, 300) : undefined,
    anchor: anchorFor(doc, id),
  };
  comments.push(c);
  save(file, comments);
  return c;
}

function update(file, cid, fields) {
  const comments = load(file);
  const c = comments.find((x) => x.id === cid);
  if (!c) throw new Error(`no comment ${cid}`);
  Object.assign(c, fields, { updated: new Date().toISOString() });
  save(file, comments);
  return c;
}

function remove(file, cid) {
  save(
    file,
    load(file).filter((x) => x.id !== cid),
  );
}

// Comments with their current element id and line in `doc`.
function resolved(file, doc) {
  return load(file).map((c) => {
    const at = locate(doc, c.anchor);
    const n = at == null ? null : doc.nodes[at];
    return {
      ...c,
      at,
      line: n ? lineOf(doc.src, n.sourceCodeLocation.startOffset) : null,
    };
  });
}

function markdown(file, doc, { all = false } = {}) {
  const list = resolved(file, doc).filter((c) => all || c.status === "open");
  const name = path.basename(file);
  if (!list.length) return `No ${all ? "" : "open "}comments on ${name}.\n`;
  let out = `# Comments on ${name} (${list.length} ${all ? "total" : "open"})\n\n`;
  out += `Edit \`${file}\` to address each comment, then run \`hotedit comments ${name} --resolve <id>\`.\n\n`;
  for (const c of list) {
    const where = c.line
      ? `line ${c.line}`
      : "anchor lost; was line " + c.anchor.line;
    out += `## [${c.id}] ${c.status === "open" ? "" : `(${c.status}) `}<${c.anchor.tag}> · ${where}\n\n`;
    out += `${c.text}\n\n`;
    if (c.quote) out += `> on the text: "${norm(c.quote)}"\n\n`;
    if (c.anchor.text)
      out += `- element text: "${c.anchor.text.slice(0, 120)}"\n`;
    out += `- css: \`${c.anchor.css}\`\n`;
    out +=
      "- source:\n\n```html\n" +
      c.anchor.source.split("\n").slice(0, 6).join("\n") +
      "\n```\n\n";
    if (c.note) out += `- note: ${c.note}\n\n`;
  }
  return out;
}

module.exports = {
  sidecar,
  load,
  save,
  add,
  update,
  remove,
  resolved,
  markdown,
  anchorFor,
  locate,
};
