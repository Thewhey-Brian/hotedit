"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const parse5 = require("parse5");
const { Doc, applyPatches } = require("../src/doc");

const SAMPLES = process.env.HTMLEDIT_SAMPLES || path.join(__dirname, "reports");
const samples = fs.readdirSync(SAMPLES).filter((f) => f.endsWith(".html"));

const edit = (src, id, html) => {
  const d = new Doc(src);
  return applyPatches(src, [d.patchInner(id, html)]);
};
const idOf = (src, pred) => new Doc(src).nodes.findIndex(pred);
// innerHTML as the browser would report it for element `id` of the served page.
const served = (src, id) => {
  const d = new Doc(src);
  const tree = parse5.parse(d.instrument(""));
  let found;
  const walk = (n) => {
    for (const c of n.childNodes || []) {
      if (
        c.attrs &&
        c.attrs.some((a) => a.name === "data-he" && a.value === String(id))
      )
        found = c;
      if (c.content) walk(c.content); // <template> contents
      walk(c);
    }
  };
  walk(tree);
  return parse5.serialize(found);
};

for (const f of samples) {
  test(`instrument preserves source: ${f}`, () => {
    const src = fs.readFileSync(path.join(SAMPLES, f), "utf8");
    const d = new Doc(src);
    const out = d.instrument("");
    assert.strictEqual(out.replace(/ data-he="\d+"/g, ""), src);
    // Every source element is reachable in the instrumented parse with its id.
    const ids = new Set();
    const walk = (n) => {
      for (const c of n.childNodes || []) {
        const a = c.attrs && c.attrs.find((x) => x.name === "data-he");
        if (a) ids.add(Number(a.value));
        if (c.content) walk(c.content);
        walk(c);
      }
    };
    walk(parse5.parse(out));
    assert.strictEqual(ids.size, d.nodes.length);
  });

  test(`no-op edit of every text block is byte-identical: ${f}`, () => {
    const src = fs.readFileSync(path.join(SAMPLES, f), "utf8");
    const d = new Doc(src);
    let checked = 0;
    for (const n of d.nodes) {
      if (!/^(p|h[1-6]|li|td|th|span|a|div)$/.test(n.tagName)) continue;
      if (checked++ > 150) break;
      const p = d.patchInner(n.heId, served(src, n.heId));
      assert.strictEqual(
        p.text,
        "",
        `element ${n.heId} <${n.tagName}> produced ${JSON.stringify(p)}`,
      );
      assert.strictEqual(p.start, p.end);
    }
  });
}

test("text edit is a minimal patch and keeps entities elsewhere", () => {
  const src = `<!doctype html><html><body>\n<p class="x">Fish &amp; chips are <b>great</b> &mdash; ok</p>\n<p>tail</p></body></html>`;
  const id = idOf(src, (n) => n.tagName === "p");
  const html = served(src, id).replace("great", "awesome");
  const out = edit(src, id, html);
  assert.strictEqual(out, src.replace("great", "awesome"));
});

test("typed special characters are escaped", () => {
  const src = `<p>a</p>`;
  const id = idOf(src, (n) => n.tagName === "p");
  assert.strictEqual(
    edit(src, id, "a < b &amp; c\u00a0"),
    `<p>a &lt; b &amp; c&nbsp;</p>`,
  );
});

test("new inline formatting is inserted, source tags of siblings kept verbatim", () => {
  const src = `<p>Hello <A HREF='/x' >world</A></p>`;
  const id = idOf(src, (n) => n.tagName === "p");
  const aId = idOf(src, (n) => n.tagName === "a");
  const out = edit(
    src,
    id,
    `<b>Hello</b> <a href="/x" data-he="${aId}">world</a>`,
  );
  assert.strictEqual(out, `<p><b>Hello</b> <A HREF='/x' >world</A></p>`);
});

test("element duplicated by contenteditable keeps original once", () => {
  const src = `<div><p>one</p></div>`;
  const div = idOf(src, (n) => n.tagName === "div");
  const p = idOf(src, (n) => n.tagName === "p");
  const out = edit(
    src,
    div,
    `<p data-he="${p}">one</p><p data-he="${p}">two</p>`,
  );
  assert.strictEqual(out, `<div><p>one</p><p>two</p></div>`);
});

test("implicitly closed elements", () => {
  const src = `<ul><li>one<li>two</ul>`;
  const li = idOf(src, (n) => n.tagName === "li");
  assert.strictEqual(edit(src, li, "uno"), `<ul><li>uno<li>two</ul>`);
});

test("svg self-closing tags instrumented safely", () => {
  const src = `<svg><rect width="1"/><text x="1">hi</text></svg>`;
  const out = new Doc(src).instrument("");
  assert.match(out, /<rect width="1" data-he="\d+"\/>/);
  const t = idOf(src, (n) => n.tagName === "text");
  assert.strictEqual(
    edit(src, t, "hey"),
    `<svg><rect width="1"/><text x="1">hey</text></svg>`,
  );
});

test("source edit replaces inner verbatim", () => {
  const src = `<p>$x^2$ and more</p>`;
  const d = new Doc(src);
  const out = applyPatches(src, [
    d.patchInnerSource(
      0 + idOf(src, (n) => n.tagName === "p"),
      "$y^2$ and more",
    ),
  ]);
  assert.strictEqual(out, `<p>$y^2$ and more</p>`);
});

const op = (src, fn) => applyPatches(src, [fn(new Doc(src))]);
const first = (src, tag) => idOf(src, (n) => n.tagName === tag);

test("style merge keeps other declarations and source-only values", () => {
  const src = `<div>\n  <p class=a style="color: red; background: url(a;b.png)">x</p>\n</div>`;
  const p = first(src, "p");
  assert.strictEqual(
    op(src, (d) => d.patchStyle(p, { color: "blue", "font-size": "18px" })),
    `<div>\n  <p class=a style="color: blue; background: url(a;b.png); font-size: 18px">x</p>\n</div>`,
  );
  assert.strictEqual(
    op(src, (d) => d.patchStyle(p, { color: null, background: null })),
    `<div>\n  <p class=a>x</p>\n</div>`,
  );
});

test("style added to element without style attribute", () => {
  assert.strictEqual(op(`<h1 id="t">T</h1>`, (d) => d.patchStyle(0 + first(`<h1 id="t">T</h1>`, "h1"), { color: "#123" })), `<h1 id="t" style="color: #123">T</h1>`);
  const img = `<img src="a.png"/>`;
  assert.strictEqual(op(img, (d) => d.patchAttr(first(img, "img"), "src", "b c.png")), `<img src="b c.png"/>`);
  assert.strictEqual(op(`<p>x</p>`, (d) => d.patchAttr(first(`<p>x</p>`, "p"), "hidden", true)), `<p hidden>x</p>`);
  assert.strictEqual(op(`<p hidden>x</p>`, (d) => d.patchAttr(first(`<p hidden>x</p>`, "p"), "hidden", null)), `<p>x</p>`);
});

test("remove, duplicate, move work on whole lines", () => {
  const src = `<ul>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>`;
  const li = (k) => new Doc(src).nodes.filter((n) => n.tagName === "li")[k].heId;
  assert.strictEqual(op(src, (d) => d.removeElement(li(1))), `<ul>\n  <li>a</li>\n  <li>c</li>\n</ul>`);
  assert.strictEqual(op(src, (d) => d.duplicateElement(li(0))), `<ul>\n  <li>a</li>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>`);
  assert.strictEqual(op(src, (d) => d.moveElement(li(2), -1)), `<ul>\n  <li>a</li>\n  <li>c</li>\n  <li>b</li>\n</ul>`);
  assert.strictEqual(op(src, (d) => d.moveElement(li(0), 1)), `<ul>\n  <li>b</li>\n  <li>a</li>\n  <li>c</li>\n</ul>`);
  assert.throws(() => new Doc(src).moveElement(li(0), -1), /already first/);
  const inline = `<p>a <b>b</b> c</p>`;
  assert.strictEqual(op(inline, (d) => d.removeElement(first(inline, "b"))), `<p>a  c</p>`);
});
