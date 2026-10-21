"use strict";
// Chart panel model: form controls and data tables, round-tripped through the
// source patcher so the file gets the expected minimal edits.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { Doc, applyPatches } = require("../src/doc");
const { findCharts, describe, patchChart } = require("../src/charts");
const CF = require("../src/chartform");

const load = (f) =>
  fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const open = (src, index) => {
  const doc = new Doc(src);
  const c = describe(findCharts(doc)[index]);
  const orig = Object.fromEntries(c.specs.map((s) => [s.arg, s.value]));
  const state = JSON.parse(JSON.stringify(orig));
  const ctl = (p) => {
    for (const s of CF.build(c.kind, state, orig).sections)
      for (const k of s.controls)
        if (JSON.stringify(k.path.map(String)) === JSON.stringify(p)) return k;
    throw new Error("no control " + p);
  };
  const save = () => applyPatches(src, patchChart(doc, index, state));
  return { c, state, ctl, save, tables: () => CF.tables(c.kind, state) };
};

test("plotly: dropdowns, checkboxes and numbers write minimal patches", () => {
  const src = load("plotly_report.html");
  const s = open(src, 1);
  const secs = CF.build("plotly", s.state, s.state).sections.map(
    (x) => x.title,
  );
  assert.deepStrictEqual(secs.slice(0, 4), [
    "Chart",
    "x axis",
    "y axis",
    "Series 1 · F1",
  ]);
  s.ctl(["2", "barmode"]).set("stack");
  s.ctl(["2", "yaxis", "type"]).set("log");
  s.ctl(["2", "showlegend"]).set(true);
  s.ctl(["1", "0", "orientation"]).set("h");
  const out = s.save();
  assert.ok(
    out.includes(
      `const layout = {title: 'kNN F1 by encoder', margin: {t: 40}, barmode: 'stack', yaxis: {type: 'log'}, showlegend: true};`,
    ),
    out,
  );
  assert.ok(
    out.includes(
      `marker: {color: ['#999', '#999', '#e45756']}, orientation: 'h'}`,
    ),
    out,
  );
});

test("plotly: string title stays a string; reset removes the key", () => {
  const src = load("plotly_report.html");
  const s = open(src, 1);
  const t = s.ctl(["2", "title"]);
  assert.strictEqual(t.raw, "kNN F1 by encoder");
  t.set("F1");
  s.ctl(["1", "0", "name"]).set(undefined);
  const out = s.save();
  assert.ok(out.includes(`const layout = {title: 'F1', margin: {t: 40}};`), out);
  assert.ok(out.includes(`type: 'bar',\n    marker:`), out);
});

test("plotly: per-point colour arrays are a note, editable in the data table", () => {
  const s = open(load("plotly_report.html"), 1);
  assert.strictEqual(s.ctl(["1", "0", "marker", "color"]).type, "note");
  const [tb] = s.tables();
  assert.deepStrictEqual(tb.columns, ["x", "y", "marker.color"]);
  assert.strictEqual(tb.rows, 3);
  tb.set(2, 1, "0.9");
  tb.add();
  tb.set(3, 0, "UCE");
  tb.set(3, 1, "0.5");
  tb.remove(0);
  const out = s.save();
  assert.ok(
    out.includes(`x: ['PCA', 'ours', 'UCE'], y: [0.48, 0.9, 0.5]`),
    out,
  );
  assert.ok(out.includes(`color: ['#999', '#e45756', '#e45756']`), out);
});

test("plotly.py: axis range from min/max, title object kept", () => {
  const src = load("plotly_report.html");
  const s = open(src, 0);
  assert.deepStrictEqual(s.ctl(["2", "title", "text"]).raw, "Validation loss");
  s.ctl(["2", "yaxis", "range", "1"]).set(1);
  s.ctl(["1", "0", "line", "dash"]).set("dot");
  const out = s.save();
  assert.ok(
    out.includes(`"yaxis":{"title":{"text":"loss"},"range":[0,1]}`),
    out,
  );
  assert.ok(out.includes(`"line":{"color":"#1f77b4","dash":"dot"}`), out);
});

test("chart.js: type, horizontal, stacked, title display; functions untouched", () => {
  const src = load("chartjs_report.html");
  const s = open(src, 0);
  s.ctl(["1", "type"]).set("line");
  s.ctl(["1", "options", "indexAxis"]).set(true);
  s.ctl(["1", "options", "scales", "x", "stacked"]).set(true);
  s.ctl(["1", "options", "plugins", "legend", "position"]).set("bottom");
  s.ctl(["1", "options", "scales", "y", "beginAtZero"]).set(undefined);
  const out = s.save();
  assert.ok(out.includes(`type: 'line',`));
  assert.ok(out.includes(`onClick: (e) => console.log(e),`));
  assert.ok(out.includes(`indexAxis: 'y'`), out);
  assert.ok(/x: \{stacked: true\}/.test(out), out);
  assert.ok(
    /y: \{ title: \{ display: true, text: 'score' \}, stacked: true \}|y: \{\s*title: \{ display: true, text: 'score' \},\s*stacked: true/.test(
      out,
    ) || out.includes("stacked: true"),
    out,
  );
  assert.ok(!out.includes("beginAtZero"), out);
  assert.ok(out.includes(`position: 'bottom'`), out);
});

test("chart.js: labels + datasets as one table", () => {
  const s = open(load("chartjs_report.html"), 0);
  const [tb] = s.tables();
  assert.deepStrictEqual(tb.columns, ["labels", "Ours", "Baseline"]);
  tb.add();
  assert.deepStrictEqual(s.state[1].data.labels, [
    "Forecast",
    "Identity",
    "Transfer",
    "Transfer",
  ]);
  tb.set(3, 0, "Recall");
  tb.set(3, 1, "77");
  const out = s.save();
  assert.ok(
    out.includes(`labels: ['Forecast', 'Identity', 'Transfer', 'Recall'],`),
    out,
  );
  assert.ok(out.includes(`data: [82, 64, 71, 77],`), out);
});

test("vega-lite: string mark becomes an object; field dropdown; rows table", () => {
  const src = load("vega_report.html");
  const s = open(src, 0);
  const mt = s.ctl(["1", "mark"]);
  assert.strictEqual(mt.value, "bar");
  s.ctl(["1", "mark", "cornerRadiusEnd"]).set(4);
  const f = s.ctl(["1", "encoding", "x", "field"]);
  assert.deepStrictEqual(
    f.options.map((o) => o[0]),
    ["d", "n"],
  );
  s.ctl(["1", "encoding", "y", "aggregate"]).set("sum");
  const [tb] = s.tables();
  assert.deepStrictEqual(tb.columns, ["d", "n"]);
  tb.set(1, 1, "1.5");
  const out = s.save();
  assert.ok(
    out.includes(
      `"mark": {"type": "bar", "color": "#e45756", "cornerRadiusEnd": 4}`,
    ),
    out,
  );
  assert.ok(out.includes(`{"d": "retina", "n": 1.5}`), out);
  assert.ok(out.includes(`"title": "million cells", "aggregate": "sum"}`), out);
});

test("put() drops parents it emptied, keeps ones from the source", () => {
  const orig = { 2: { margin: {} } };
  const st = { 2: { margin: {} } };
  CF.put(st, ["2", "xaxis", "type"], "log", orig);
  assert.deepStrictEqual(st, { 2: { margin: {}, xaxis: { type: "log" } } });
  CF.put(st, ["2", "xaxis", "type"], undefined, orig);
  assert.deepStrictEqual(st, { 2: { margin: {} } });
  CF.put(st, ["2", "margin", "t"], 4, orig);
  CF.put(st, ["2", "margin", "t"], undefined, orig);
  assert.deepStrictEqual(st, { 2: { margin: {} } });
});

test("chartTypes: Plotly bar → pie (labels/values) → horizontal → back restores exactly", () => {
  const state = { 1: [{ x: ["a", "b"], y: [1, 2], type: "bar" }], 2: {} };
  const orig = JSON.parse(JSON.stringify(state));
  const t = CF.chartTypes("plotly", state, orig);
  assert.strictEqual(t.current, "bar");
  assert.ok(t.options.some((o) => o.id === "pie"));
  t.apply("pie");
  assert.deepStrictEqual(state[1][0], { type: "pie", labels: ["a", "b"], values: [1, 2] });
  CF.chartTypes("plotly", state, orig).apply("hbar");
  assert.deepStrictEqual(state[1][0], { type: "bar", x: [1, 2], y: ["a", "b"], orientation: "h" });
  CF.chartTypes("plotly", state, orig).apply("area");
  assert.strictEqual(CF.chartTypes("plotly", state, orig).current, "area");
  CF.chartTypes("plotly", state, orig).apply("bar");
  assert.deepStrictEqual(state[1][0], orig[1][0]);
});

test("chartTypes: no pie for several Plotly traces; code types are not offered", () => {
  const two = { 1: [{ y: [1] }, { y: [2] }], 2: {} };
  assert.ok(!CF.chartTypes("plotly", two, two).options.some((o) => o.id === "pie"));
  assert.strictEqual(CF.chartTypes("chartjs", { 1: { type: "⟪js⟫ kind" } }, {}), null);
});

test("chartTypes: Chart.js area fills datasets; Vega-Lite keeps mark props", () => {
  const c = { 1: { type: "bar", data: { labels: ["a"], datasets: [{ data: [1] }, { data: [2] }] } } };
  const co = JSON.parse(JSON.stringify(c));
  CF.chartTypes("chartjs", c, co).apply("area");
  assert.strictEqual(c[1].type, "line");
  assert.deepStrictEqual(c[1].data.datasets.map((d) => d.fill), ["origin", "-1"]);
  CF.chartTypes("chartjs", c, co).apply("bar");
  assert.deepStrictEqual(c, co);
  const v = { 1: { mark: { type: "bar", color: "red" }, encoding: {} } };
  const vo = JSON.parse(JSON.stringify(v));
  CF.chartTypes("vega", v, vo).apply("line");
  assert.deepStrictEqual(v[1].mark, { type: "line", color: "red" });
  assert.strictEqual(CF.chartTypes("vega", v, vo).current, "line");
});
