"use strict";
// M4: chart editing with live preview, checked on disk.
const test = require("node:test");
const assert = require("node:assert");
const { harness, until, ui } = require("./helpers");

const { open } = harness(test);

// Set the chart-form control for spec `path` (["2", "title", "text"], …):
// text/number/colour inputs get `value`, selects pick the option labelled
// `value`, checkboxes are set to `value` (true/false).
async function setField(page, path, value) {
  const ok = await page.locator("htmledit-overlay").evaluate(
    (h, [path, value]) => {
      const box = h.shadowRoot.querySelector(`.chartp .ctl[data-path='${JSON.stringify(path)}']`);
      if (!box)
        return [...h.shadowRoot.querySelectorAll(".chartp .ctl")].map((b) => b.dataset.path).join(" ");
      const t = box.dataset.type;
      if (t === "select") {
        const sel = box.querySelector("select");
        const o = [...sel.options].find((x) => x.textContent === value);
        if (!o) return "no option " + value;
        sel.value = o.value;
        sel.dispatchEvent(new Event("change"));
      } else if (t === "checkbox") {
        const i = box.querySelector("input");
        i.checked = value;
        i.dispatchEvent(new Event("change"));
      } else {
        const i = [...box.querySelectorAll("input")].pop();
        i.value = value;
        i.dispatchEvent(new Event("input"));
      }
      return true;
    },
    [path.map(String), value],
  );
  assert.strictEqual(ok, true, `control ${path} not found: ${ok}`);
}
// Type into data-table cell (row r, column c) of table `t` on the Data tab.
async function setCell(page, t, r, c, value) {
  await ui(page, '.chartp [data-tab="data"]').click();
  const cell = ui(page, `.chartp table[data-table="${t}"] tr:nth-child(${r + 2}) td:nth-child(${c + 2}) input`);
  await cell.fill(value);
}
const tab = (page, name) => ui(page, `.chartp [data-tab="${name}"]`).click();
const apply = (page) => ui(page, ".chartp .apply").click();
const opened = (page) => ui(page, ".chartp").waitFor({ state: "visible" });

test("plotly.py chart: edit title + trace colour, live preview, minimal save", async () => {
  const s = await open({ fixture: "plotly_report.html" });
  const { page } = s;
  await page.waitForFunction(() => document.getElementById("3f1c2a").data);
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator('[id="3f1c2a"]').click({ position: { x: 300, y: 150 } });
  await opened(page);
  await setField(page, ["2", "title", "text"], "Val loss");
  await setField(page, ["1", 1, "line", "color"], "#888888");
  await page.waitForFunction(
    () => document.getElementById("3f1c2a").layout.title.text === "Val loss",
  );
  assert.strictEqual(
    await page.evaluate(
      () =>
        document.getElementById("3f1c2a").querySelector(".gtitle").textContent,
    ),
    "Val loss",
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace('"Validation loss"', '"Val loss"')
      .replace('"#ff7f0e"', '"#888888"'),
  );
  await s.close();
});

test("hand-written plotly with variables: rename series", async () => {
  const s = await open({ fixture: "plotly_report.html" });
  const { page } = s;
  await page.waitForFunction(() => document.getElementById("bars").data);
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#bars").click({ position: { x: 300, y: 150 } });
  await opened(page);
  await setField(page, ["2", "title"], "kNN F1");
  await setField(page, ["1", 0, "name"], "F1 macro");
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  const d = s.read();
  assert.ok(d.includes(`const layout = {title: 'kNN F1', margin: {t: 40}};`));
  assert.ok(d.includes(`name: 'F1 macro'`));
  await s.close();
});

test("plotly: changing a y value in the full spec redraws the bar", async () => {
  const s = await open({ fixture: "plotly_report.html" });
  const { page } = s;
  await page.waitForFunction(() => document.getElementById("bars").data);
  const height = () =>
    page.evaluate(
      () =>
        document
          .querySelectorAll("#bars .point path")[2]
          .getBoundingClientRect().height,
    );
  const before = await height();
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#bars").click({ position: { x: 300, y: 150 } });
  await opened(page);
  await page.locator("htmledit-overlay").evaluate((h) => {
    const ta = h.shadowRoot.querySelector(".chartp textarea");
    const spec = JSON.parse(ta.value);
    spec["1"][0].y[2] = 0.1;
    ta.value = JSON.stringify(spec, null, 2);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.ok(
    await until(async () => (await height()) < before / 2),
    "bar did not redraw",
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(s.read(), s.orig.replace("0.72]", "0.1]"));
  await s.close();
});

test("chart.js: labels, dataset colour and title via fields; functions preserved", async () => {
  const s = await open({ fixture: "chartjs_report.html" });
  const { page } = s;
  await page.waitForFunction(
    () => window.Chart && Chart.getChart(document.getElementById("scores")),
  );
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#scores").click();
  await opened(page);
  await setCell(page, 0, 2, 0, "Cross-species");
  await tab(page, "form");
  await setField(page, ["1", "data", "datasets", 1, "backgroundColor"], "#bab0ac");
  await setField(page, ["1", "options", "plugins", "title", "text"], "Scores");
  await page.waitForFunction(
    () =>
      Chart.getChart(document.getElementById("scores")).data.labels[2] ===
      "Cross-species",
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace("'Transfer'", "'Cross-species'")
      .replace("'#f28e2b'", "'#bab0ac'")
      .replace("'Scores by task'", "'Scores'"),
  );
  await s.close();
});

test("vega-lite: edit full JSON spec (add a row), live re-embed, saved", async () => {
  const s = await open({ fixture: "vega_report.html" });
  const { page } = s;
  await page.waitForSelector("#vis svg");
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#vis").click();
  await opened(page);
  await tab(page, "code");
  const ta = ui(page, ".chartp textarea");
  const spec = JSON.parse(await ta.inputValue());
  spec.data.values.push({ d: "lung", n: 0.3 });
  spec.mark.color = "#4c78a8";
  await ta.fill(JSON.stringify(spec, null, 2));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#vis text")].some(
      (t) => t.textContent === "lung",
    ),
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  const out = s.read();
  assert.ok(out.includes(`{"d": "gut", "n": 0.6}, {"d": "lung", "n": 0.3}]`));
  assert.ok(out.includes(`"mark": {"type": "bar", "color": "#4c78a8"}`));
  await s.close();
});

test("mermaid: edit diagram source, preview renders, raw source saved", async () => {
  const s = await open({ fixture: "mermaid_report.html" });
  const { page } = s;
  await page.waitForSelector("pre.mermaid svg");
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("pre.mermaid").click();
  await opened(page);
  const ta = ui(page, ".chartp textarea");
  const src = await ta.inputValue();
  assert.match(src, /<br\/>z in R\^64/);
  await ta.fill(
    src.replace(`C["dynamics"]`, `C["dynamics"]\n  C --> D["readout"]`),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("pre.mermaid svg") &&
      document.querySelector("pre.mermaid").textContent.includes("readout"),
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig.replace(`C["dynamics"]`, `C["dynamics"]\n  C --> D["readout"]`),
  );
  assert.ok(!s.read().includes("<svg"), "rendered SVG never saved");
  await s.close();
});

test("cancel after preview restores the original chart", async () => {
  const s = await open({ fixture: "chartjs_report.html" });
  const { page } = s;
  await page.waitForFunction(
    () => window.Chart && Chart.getChart(document.getElementById("scores")),
  );
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#scores").click();
  await opened(page);
  await setCell(page, 0, 0, 0, "XXX");
  await page.waitForFunction(
    () =>
      Chart.getChart(document.getElementById("scores")).data.labels[0] ===
      "XXX",
  );
  await ui(page, ".chartp .cancel").click();
  await page.waitForFunction(
    () =>
      window.Chart &&
      Chart.getChart(document.getElementById("scores")) &&
      Chart.getChart(document.getElementById("scores")).data.labels[0] ===
        "Forecast",
  );
  assert.strictEqual(s.read(), s.orig);
  await s.close();
});

test("chart form: dropdown + checkbox + data row on a Plotly bar chart", async () => {
  const s = await open({ fixture: "plotly_report.html" });
  const { page } = s;
  await page.waitForFunction(() => document.getElementById("bars").data);
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#bars").click({ position: { x: 300, y: 150 } });
  await opened(page);
  await tab(page, "form");
  await setField(page, ["1", 0, "orientation"], "horizontal");
  await setField(page, ["2", "showlegend"], true);
  await setField(page, ["2", "yaxis", "type"], "log");
  await page.waitForFunction(() => {
    const g = document.getElementById("bars");
    return g._fullData[0].orientation === "h" && g._fullLayout.showlegend && g._fullLayout.yaxis.type === "log";
  });
  // Data tab: add a row and fill it in; the chart grows a bar live.
  await ui(page, '.chartp [data-tab="data"]').click();
  await ui(page, ".chartp .addrow").click();
  await setCell(page, 0, 3, 0, "UCE");
  await setCell(page, 0, 3, 1, "0.5");
  await page.waitForFunction(() => document.querySelectorAll("#bars .point").length === 4);
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace(
        `x: ['scVI', 'PCA', 'ours'], y: [0.61, 0.48, 0.72], type: 'bar', name: 'F1',\n    marker: {color: ['#999', '#999', '#e45756']}};`,
        `x: ['scVI', 'PCA', 'ours', 'UCE'], y: [0.61, 0.48, 0.72, 0.5], type: 'bar', name: 'F1',\n    marker: {color: ['#999', '#999', '#e45756', '#e45756']}, orientation: 'h'};`,
      )
      .replace(`margin: {t: 40}};`, `margin: {t: 40}, showlegend: true, yaxis: {type: 'log'}};`),
  );
  await s.close();
});

test("chart form: Chart.js type tile re-creates the chart, keeps callbacks", async () => {
  const s = await open({ fixture: "chartjs_report.html" });
  const { page } = s;
  await page.waitForFunction(() => window.Chart && Chart.getChart(document.getElementById("scores")));
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#scores").click();
  await opened(page);
  await tab(page, "form");
  await ui(page, '.chartp .types [data-type="line"]').click();
  assert.match(await ui(page, ".chartp .types .on").textContent(), /Line/);
  await setField(page, ["1", "options", "plugins", "legend", "position"], "bottom");
  await page.waitForFunction(() => {
    const ch = Chart.getChart(document.getElementById("scores"));
    return ch && ch.config.type === "line" && ch.options.plugins.legend.position === "bottom";
  });
  assert.strictEqual(
    await page.evaluate(() => typeof Chart.getChart(document.getElementById("scores")).options.onClick),
    "function",
  );
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace("type: 'bar',", "type: 'line',")
      .replace(
        "plugins: { title: { display: true, text: 'Scores by task' } },",
        "plugins: { title: { display: true, text: 'Scores by task' }, legend: {position: 'bottom'} },",
      ),
  );
  await s.close();
});

test("chart form: Vega-Lite mark tile", async () => {
  const s = await open({ fixture: "vega_report.html" });
  const { page } = s;
  await page.waitForSelector("#vis svg");
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#vis").click();
  await opened(page);
  await tab(page, "form");
  await ui(page, '.chartp .types [data-type="line"]').click();
  await page.waitForFunction(() => document.querySelector("#vis svg .mark-line"));
  await apply(page);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(s.read(), s.orig.replace(`"type": "bar", "color"`, `"type": "line", "color"`));
  await s.close();
});

test("chart type tiles: switch live through bar → pie → area and back writes nothing", async () => {
  const s = await open({ fixture: "chartjs_report.html" });
  const { page } = s;
  await page.waitForFunction(() => window.Chart && Chart.getChart(document.getElementById("scores")));
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  await page.locator("#scores").click();
  await opened(page);
  const tile = (t) => ui(page, `.chartp .types [data-type="${t}"]`).click();
  const live = (t) => page.waitForFunction((t) => Chart.getChart(document.getElementById("scores")).config.type === t, t);
  await tile("pie");
  await live("pie");
  await tile("area");
  await live("line");
  assert.ok(await page.evaluate(() => Chart.getChart(document.getElementById("scores")).data.datasets.every((d) => d.fill)));
  await tile("hbar");
  await page.waitForFunction(() => Chart.getChart(document.getElementById("scores")).options.indexAxis === "y");
  await tile("bar");
  await page.waitForFunction(() => Chart.getChart(document.getElementById("scores")).options.indexAxis !== "y");
  await apply(page);
  await page.waitForTimeout(400);
  assert.strictEqual(s.read(), s.orig, "back to the original type: file unchanged");
  await s.close();
});
