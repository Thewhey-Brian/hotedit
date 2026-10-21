"use strict";
// Caret placement and inserting new blocks / list items / charts.
const test = require("node:test");
const assert = require("node:assert");
const { harness, until, ui } = require("./helpers");

const { open } = harness(test);

const PAGE = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>t</title></head>
<body>
  <h1>Report</h1>
  <p id="p1">Alpha beta gamma</p>
  <ul>
    <li>one</li>
    <li>two</li>
  </ul>
  <div class="card">
    <p>card text</p>
  </div>
</body>
</html>
`;
const editing = (page) =>
  page.waitForFunction(() => document.querySelector("[contenteditable=true]"));
const freshSelected = (page, sel) =>
  page.waitForFunction((sel) => {
    const el = document.querySelector("[contenteditable=true]");
    return (
      el && el.matches(sel) && String(window.getSelection()) === el.textContent
    );
  }, sel);

test("caret lands where you click, so typing goes there", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  const p = page.locator("#p1");
  // Click just right of "beta" (the end of the second word).
  const box = await p.evaluate((el) => {
    const r = document.createRange();
    const t = el.firstChild;
    r.setStart(t, 10);
    r.setEnd(t, 10);
    const b = r.getBoundingClientRect();
    return { x: b.left + 1, y: b.top + b.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await editing(page);
  await page.keyboard.type("X");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig.replace("Alpha beta gamma", "Alpha betaX gamma"),
  );
  await s.close();
});

test("＋ menu: insert a paragraph below, placeholder selected, type to replace", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("h1").click();
  await editing(page);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="insert"]').click();
  await ui(page, ".ins").waitFor({ state: "visible" });
  await ui(page, '.ins [data-ins="p"]').click();
  await page.waitForLoadState("load");
  await freshSelected(page, "p");
  await page.keyboard.type("Hello world");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read().includes("Hello world")));
  assert.strictEqual(
    s.read(),
    s.orig.replace(
      "<h1>Report</h1>\n",
      "<h1>Report</h1>\n  <p>Hello world</p>\n",
    ),
  );
  await s.close();
});

test("＋ menu: insert above and inside a box", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator(".card p").click();
  await editing(page);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="parent"]').click(); // the .card div
  await ui(page, '.bb [data-act="insert"]').click();
  await ui(page, '.ins [data-w="inside"]').click();
  await ui(page, '.ins [data-ins="h3"]').click();
  await page.waitForLoadState("load");
  await freshSelected(page, "h3");
  await page.keyboard.type("Card title");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read().includes("Card title")));
  assert.strictEqual(
    s.read(),
    s.orig.replace(
      "<p>card text</p>\n",
      "<p>card text</p>\n    <h3>Card title</h3>\n",
    ),
  );
  await s.close();
});

test("Enter at the end of a list item starts a new item", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("li").nth(1).click();
  await editing(page);
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await freshSelected(page, "li");
  await page.keyboard.type("three");
  await page.keyboard.press("Enter"); // saves "three", starts another item
  await freshSelected(page, "li");
  assert.ok(await until(() => s.read().includes("<li>New item</li>")));
  await page.keyboard.press("Enter"); // untouched new item: Enter takes it back
  assert.ok(await until(() => s.read().includes("three") && !s.read().includes("New item")));
  assert.strictEqual(
    s.read(),
    s.orig.replace("<li>two</li>\n", "<li>two!</li>\n    <li>three</li>\n"),
  );
  await s.close();
});

test("＋ menu on a list item: list item first; a table goes after the list", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("li").first().click();
  await editing(page);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="insert"]').click();
  // List items come first when a list item is selected.
  assert.strictEqual(
    await ui(page, ".ins .items button").first().getAttribute("data-ins"),
    "li",
  );
  await ui(page, '.ins [data-ins="table"]').click(); // not inside the list: after it
  await page.waitForLoadState("load");
  await freshSelected(page, "th");
  await page.keyboard.type("Name");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read().includes("<th>Name</th>")));
  const out = s.read();
  assert.ok(out.includes("  </ul>\n  <table>\n    <tr><th>Name</th><th>Column 2</th>"), out);
  assert.deepStrictEqual(s.errors, []);
  await s.close();
});

test("Esc on an untouched new block takes the insert back", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("h1").click();
  await editing(page);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="insert"]').click();
  await ui(page, '.ins [data-ins="h2"]').click();
  await page.waitForLoadState("load");
  await freshSelected(page, "h2");
  assert.ok(s.read().includes("<h2>New heading</h2>"));
  await page.keyboard.press("Escape");
  assert.ok(await until(() => s.read() === s.orig), "insert undone");
  await s.close();
});

test("insert a chart: Plotly template, chart panel opens, edit saves", async () => {
  const s = await open({ fixture: "plotly_report.html" });
  const { page } = s;
  await page.waitForFunction(() => document.getElementById("bars").data);
  await page.keyboard.press("Alt+KeyE");
  await page.locator("h2").click();
  await editing(page);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="insert"]').click();
  await ui(page, '.ins [data-ins="chart"]').click();
  await page.waitForLoadState("load");
  await ui(page, ".chartp").waitFor({ state: "visible" });
  const id = await page.evaluate(
    () => document.querySelector("[id^=chart-]").id,
  );
  await page.waitForFunction((id) => document.getElementById(id).data, id);
  assert.ok(
    !s.read().includes("cdn.plot.ly"),
    "page already has Plotly: no CDN tag",
  );
  await ui(page, '.chartp [data-tab="form"]').click();
  await page.locator("htmledit-overlay").evaluate((h) => {
    const i = h.shadowRoot.querySelector(
      `.chartp .ctl[data-path='["2","title","text"]'] input`,
    );
    i.value = "Throughput";
    i.dispatchEvent(new Event("input"));
  });
  await ui(page, ".chartp .apply").click();
  assert.ok(await until(() => s.read().includes("Throughput")));
  assert.ok(
    s.read().includes(`{title: {text: 'Throughput'}, margin:`),
    s.read(),
  );
  await s.close();
});
