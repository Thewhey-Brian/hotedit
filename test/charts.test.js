"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { Doc, applyPatches } = require("../src/doc");
const { findCharts, describe, patchChart, RAW_MARK } = require("../src/charts");

const FIX = path.join(__dirname, "fixtures");
const load = (f) => fs.readFileSync(path.join(FIX, f), "utf8");
const edit = (src, index, mutate) => {
  const doc = new Doc(src);
  const c = describe(findCharts(doc)[index]);
  const values = {};
  for (const s of c.specs) values[s.arg] = JSON.parse(JSON.stringify(s.value));
  mutate(values);
  return applyPatches(src, patchChart(doc, index, values));
};

test("plotly.py output and hand-written plotly are both found", () => {
  const cs = findCharts(new Doc(load("plotly_report.html"))).map(describe);
  assert.deepStrictEqual(cs.map((c) => [c.kind, c.target]), [
    ["plotly", { id: "3f1c2a" }],
    ["plotly", { id: "bars" }],
  ]);
  assert.strictEqual(cs[0].specs[1].value.title.text, "Validation loss");
  // identifiers resolved to their literal declarations
  assert.strictEqual(cs[1].specs[0].value[0].name, "F1");
  assert.strictEqual(cs[1].specs[1].value.title, "kNN F1 by encoder");
});

test("plotly title + trace colour edits are minimal", () => {
  const src = load("plotly_report.html");
  const out = edit(src, 0, (v) => {
    v[2].title.text = "Val loss (lower is better)";
    v[1][1].line.color = "#888888";
  });
  assert.strictEqual(out, src.replace('"Validation loss"', '"Val loss (lower is better)"').replace('"#ff7f0e"', '"#888888"'));
});

test("hand-written spec keeps single quotes and unquoted keys", () => {
  const src = load("plotly_report.html");
  const out = edit(src, 1, (v) => {
    v[1][0].name = "F1 (macro)";
    v[2].title = "kNN F1";
    v[2].height = 300; // new key
    delete v[2].margin;
  });
  assert.ok(out.includes(`name: 'F1 (macro)'`));
  assert.ok(out.includes(`const layout = {title: 'kNN F1', height: 300};`), out.match(/const layout.*/)[0]);
});

test("chart.js config with functions: literal parts editable, functions untouched", () => {
  const src = load("chartjs_report.html");
  const [c] = findCharts(new Doc(src)).map(describe);
  assert.strictEqual(c.kind, "chartjs");
  assert.deepStrictEqual(c.target, { id: "scores" });
  assert.ok(c.specs[0].value.options.onClick.startsWith(RAW_MARK));
  const out = edit(src, 0, (v) => {
    v[1].data.labels[2] = "Cross-species";
    v[1].data.datasets[1].backgroundColor = "#bab0ac";
    v[1].options.plugins.title.text = "Scores";
  });
  const want = src.replace("'Transfer'", "'Cross-species'").replace("'#f28e2b'", "'#bab0ac'").replace("'Scores by task'", "'Scores'");
  assert.strictEqual(out, want);
});

test("vega-lite spec via var; a new row is appended in the source style", () => {
  const src = load("vega_report.html");
  const [c] = findCharts(new Doc(src)).map(describe);
  assert.deepStrictEqual([c.kind, c.target], ["vega", { selector: "#vis" }]);
  const out = edit(src, 0, (v) => {
    v[1].data.values.push({ d: "lung", n: 0.3 });
    v[1].encoding.y.title = "cells (M)";
  });
  assert.ok(out.includes(`{"d": "gut", "n": 0.6}, {"d": "lung", "n": 0.3}]}`), out);
  assert.ok(out.includes(`"title": "cells (M)"`));
});

test("mermaid blocks are listed with their raw source", () => {
  const cs = findCharts(new Doc(load("mermaid_report.html"))).map(describe);
  assert.strictEqual(cs[0].kind, "mermaid");
  assert.match(cs[0].source, /<br\/>z in R\^64/);
});

test("all sample reports: chart scan never throws; mermaid found where present", () => {
  const dir = process.env.HTMLEDIT_SAMPLES || path.join(__dirname, "reports");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    const cs = findCharts(new Doc(fs.readFileSync(path.join(dir, f), "utf8")));
    if (f === "design_review.html") assert.ok(cs.filter((c) => c.kind === "mermaid").length >= 5, f);
    cs.map(describe);
  }
});
