"use strict";
// Live updates: the smallest in-place change an open page can apply.
const test = require("node:test");
const assert = require("node:assert");
const { Doc } = require("../src/doc");
const { livePatch } = require("../src/livepatch");

const A = `<!doctype html><html><head><style>p{color:red}</style><title>T</title></head><body>
<h1 class="a">Hi</h1>
<ul><li>one</li><li>two</li></ul>
<p>x</p>
<p>Hello <b>x</b> world</p>
<script>draw()</script>
</body></html>`;
const lp = (b) => livePatch(new Doc(A), new Doc(b));

test("text, attributes, head CSS and title", () => {
  const t = lp(A.replace("Hi", "Hello"));
  assert.deepStrictEqual([t.kind, t.remove, t.at, t.shift, t.html], ["html", [5], { replace: true }, 0, '<h1 class="a" data-he="5">Hello</h1>']);
  assert.deepStrictEqual(t.sigs, [{ text: "Hi", ids: [] }]);
  const a = lp(A.replace('class="a"', 'class="b" style="color:red"'));
  assert.deepStrictEqual([a.kind, a.set, a.was], ["attrs", { class: "b", style: "color:red" }, "a"]);
  assert.deepStrictEqual(lp(A.replace("color:red", "color:blue")), { kind: "text", id: 2, text: "p{color:blue}" });
  assert.deepStrictEqual(lp(A.replace("<title>T", "<title>New")), { kind: "title", id: 3, text: "New" });
  assert.strictEqual(lp(A.replace("draw()", "draw(1)")).kind, "script");
});

test("new and removed elements shift the ids after them", () => {
  const li = lp(A.replace("<li>two</li>", "<li>two</li><li>three</li>"));
  assert.deepStrictEqual([li.parent, li.at, li.remove, li.last, li.shift, li.html], [6, { after: 8 }, [], 8, 1, '<li data-he="9">three</li>']);
  const gone = lp(A.replace("<li>one</li>", ""));
  assert.deepStrictEqual([gone.parent, gone.last, gone.shift], [6, 8, -1]);
  // Inside text with siblings: <b> replaced in place, " world" stays put.
  const b = lp(A.replace("<b>x</b>", "<b>yy</b>"));
  assert.deepStrictEqual([b.parent, b.remove, b.at], [10, [11], { replace: true }]);
});

test("a new <script> or a change to <body> itself needs a reload", () => {
  assert.strictEqual(lp(A.replace("<p>x</p>", "<p>x</p><script>x()</script>")), null);
  assert.strictEqual(lp(A.replace("<body>\n<h1", "<body>\nloose text<h1")), null);
});
