"use strict";
// ✨ in the browser: connect, ask about a block, watch the live edit land,
// undo it; and a caret that shows on any background.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { harness, until, ui } = require("./helpers");

const { open } = harness(test);
const FAKE = path.join(__dirname, "fixtures", "fake-claude.js");

test("✨ panel: connect, ask about the selected block, live edit, undo", async () => {
  Object.assign(process.env, { HOTEDIT_CLAUDE_BIN: FAKE, FAKE_FIND: "Old title", FAKE_REPLACE: "New title", FAKE_DELAY: "300" });
  const s = await open({ name: "a.html", html: "<!doctype html><body>\n<h1>Old title</h1>\n<p>Some text here.</p>\n</body>\n" });
  const { page } = s;
  try {
    await page.keyboard.press("Alt+KeyE");
    await page.locator("h1").click();
    await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
    await page.keyboard.press("Escape");
    await ui(page, '[data-act="ai"]').click();
    await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp").style.display === "block");
    assert.match(await ui(page, ".agentp .about").textContent(), /Only changes: Title.*Old title/);
    // Connect: pick the Claude login.
    await ui(page, ".agentp .gear").click();
    await page.waitForFunction(() => /found/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector('.agentp .d[data-d="claude"]').textContent));
    await ui(page, '.agentp input[value="claude"]').check();
    await ui(page, ".agentp .savec").click();
    await page.waitForFunction(() => /Claude Code/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp .gear").textContent));
    await ui(page, ".agentp textarea").fill("Rename the heading");
    await page.evaluate(() => (window.__noReload = true));
    await ui(page, ".agentp textarea").press("Meta+Enter");
    // The edit shows up in place: no reload, no blink.
    await page.waitForFunction(() => document.querySelector("h1").textContent === "New title");
    assert.ok(await page.evaluate(() => window.__noReload), "page did not reload");
    assert.ok(s.read().includes("<h1>New title</h1>"));
    await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".flash").style.display === "block", null, { timeout: 3000 });
    await page.waitForFunction(() => /✓ Changed heading/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp .log").textContent));
    await page.waitForFunction(() => /Done · 1 change saved/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp .log").textContent));
    await page.screenshot({ path: path.join(require("os").tmpdir(), "hotedit-ai-panel.png") });
    await Promise.all([page.waitForEvent("load"), ui(page, ".agentp .undoai").click()]);
    assert.ok(await until(() => s.read() === s.orig));
    await page.waitForFunction(() => window.__htmledit && document.querySelector("h1").textContent === "Old title");
  } finally {
    for (const k of ["HOTEDIT_CLAUDE_BIN", "FAKE_FIND", "FAKE_REPLACE", "FAKE_DELAY"]) delete process.env[k];
    await s.close();
  }
});

test("✨ without a connected AI: Do it asks to connect", async () => {
  process.env.HOTEDIT_CLAUDE_BIN = "/nonexistent/claude";
  process.env.HOTEDIT_CODEX_BIN = "/nonexistent/codex";
  const s = await open({ name: "b.html", html: "<!doctype html><body><p>Hello</p></body>" });
  const { page } = s;
  try {
    await page.evaluate(() => window.__htmledit.api("POST", "/agent/config", { provider: "", apiKey: "" }));
    await page.keyboard.press("Alt+KeyE");
    await page.locator("body > p").click();
    await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
    await page.keyboard.press("Escape");
    await ui(page, '[data-act="ai"]').click();
    await ui(page, ".agentp textarea").fill("Say hi");
    assert.strictEqual(await ui(page, ".agentp .tonote").count(), 0, "no note mode");
    await ui(page, ".agentp .go").click();
    await ui(page, ".agentp .conn").waitFor({ state: "visible" });
  } finally {
    delete process.env.HOTEDIT_CLAUDE_BIN;
    delete process.env.HOTEDIT_CODEX_BIN;
    await s.close();
  }
});

test("AI edits land in place: text, new items, styles, head CSS and chart data", async () => {
  const html = `<!doctype html><html><head><style>h1 { color: rgb(0, 0, 0); }</style>
<script src="lib/plotly.min.js"></script></head><body>
<h1>Report</h1>
<ul id="list"><li>one</li><li>two</li></ul>
<p id="after">After the list</p>
<div id="chart" style="width:400px;height:300px"></div>
<script>Plotly.newPlot("chart", [{x: ["a", "b"], y: [1, 2], type: "bar"}], {title: {text: "Sales"}});</script>
</body></html>
`;
  const s = await open({ name: "live.html", html });
  const { page } = s;
  const edit = (find, replace) => page.evaluate((input) => window.__htmledit.api("POST", "/agent/tool", { name: "edit", input }), { find, replace });
  try {
    await page.waitForFunction(() => document.getElementById("chart").data);
    await page.evaluate(() => (window.__noReload = true));
    const v0 = await page.evaluate(() => window.__htmledit.version);
    await edit("<h1>Report</h1>", "<h1>Quarterly report</h1>");
    await page.waitForFunction(() => document.querySelector("h1").textContent === "Quarterly report");
    await edit("<li>two</li>", "<li>two</li><li>three</li>");
    await page.waitForFunction(() => document.querySelectorAll("#list li").length === 3);
    await edit("h1 { color: rgb(0, 0, 0); }", "h1 { color: rgb(200, 0, 0); }");
    await page.waitForFunction(() => getComputedStyle(document.querySelector("h1")).color === "rgb(200, 0, 0)");
    await edit('id="after"', 'id="after" style="color: rgb(0, 128, 0)"');
    await page.waitForFunction(() => getComputedStyle(document.getElementById("after")).color === "rgb(0, 128, 0)");
    await edit("y: [1, 2]", "y: [5, 9]");
    await page.waitForFunction(() => JSON.stringify(document.getElementById("chart").data[0].y) === "[5,9]");
    assert.ok(await page.evaluate(() => window.__noReload), "no reloads");
    // Ids moved with the new <li>: editing by hand still lands in the right place.
    assert.ok((await page.evaluate(() => window.__htmledit.version)) > v0);
    await page.keyboard.press("Alt+KeyE");
    await page.locator("#after").click();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await page.keyboard.press("Enter");
    assert.ok(await until(() => s.read().includes('style="color: rgb(0, 128, 0)">After the list!</p>')), s.read());
    assert.ok(s.read().includes("<li>two</li><li>three</li>"));
    assert.deepStrictEqual(s.errors, []);
  } finally {
    await s.close();
  }
});

test("hovering a button shows what it does and its shortcut", async () => {
  const s = await open({ name: "t.html", html: "<!doctype html><body><p>Hello</p></body>" });
  const { page } = s;
  try {
    await ui(page, ".bar .undo").hover();
    await ui(page, ".tip").waitFor({ state: "visible" });
    assert.match(await ui(page, ".tip").textContent(), /Undo the last change\s*(⌘|Ctrl\+)Z/);
    await page.keyboard.press("Alt+KeyE");
    await page.locator("body > p").click();
    await page.keyboard.press("Escape");
    await ui(page, '.bb [data-act="style"]').hover();
    await page.waitForFunction(() => /Style.*(⌥|Alt\+)S$/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector(".tip").textContent));
    await ui(page, '.bb [data-act="more"]').click();
    assert.match(await ui(page, '.menu [data-act="duplicate"]').textContent(), /Duplicate(⌥|Alt\+)D/);
  } finally {
    await s.close();
  }
});

test("Done saves the open panel and stops editing", async () => {
  const s = await open({ name: "d.html", html: "<!doctype html><body>\n<p>Hello</p>\n</body>" });
  const { page } = s;
  try {
    await page.keyboard.press("Alt+KeyE");
    await page.locator("body > p").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+KeyS");
    await ui(page, '.sty [data-p="font-weight"]').selectOption("700");
    await ui(page, ".bar .edit").click();
    assert.ok(await until(() => s.read().includes('<p style="font-weight: 700">Hello</p>')), s.read());
    await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".bar .edit").textContent === "✎ Edit");
  } finally {
    await s.close();
  }
});

test("caret colour follows the block: dark, light, gradient text", async () => {
  const html = `<!doctype html><body style="margin:0">
<div style="background:#0f172a;padding:20px"><p id="dark" style="color:#e2e8f0">On dark</p></div>
<div style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);padding:20px"><h1 id="grad" style="background:linear-gradient(90deg,#fff,#c4b5fd);-webkit-background-clip:text;color:transparent">Gradient text</h1></div>
<p id="light" style="color:#1f2937">On white</p>
<div style="background:#fef3c7"><p id="low" style="color:#fde68a">Low contrast</p></div>
</body>`;
  const s = await open({ name: "c.html", html });
  const { page } = s;
  try {
    await page.keyboard.press("Alt+KeyE");
    const caret = async (sel) => {
      await page.locator(sel).click();
      await page.waitForFunction((q) => document.querySelector(q).isContentEditable, sel);
      const c = await page.evaluate((q) => getComputedStyle(document.querySelector(q)).caretColor, sel);
      await page.keyboard.press("Escape");
      return c;
    };
    assert.strictEqual(await caret("#dark"), "rgb(226, 232, 240)", "light text colour on dark");
    assert.strictEqual(await caret("#light"), "rgb(31, 41, 55)", "dark text colour on white");
    assert.strictEqual(await caret("#low"), "rgb(17, 24, 39)", "unreadable text colour → dark caret on a light background");
    // Gradient text: transparent fill → judge by the h1's own gradient (light) → dark caret.
    const g = await caret("#grad");
    assert.ok(g === "rgb(17, 24, 39)" || g === "rgb(255, 255, 255)", g);
    assert.strictEqual(s.read(), s.orig, "nothing written");
  } finally {
    await s.close();
  }
});
