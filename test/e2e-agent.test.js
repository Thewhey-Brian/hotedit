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
    await page.keyboard.press("e");
    await page.locator("h1").click();
    await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
    await page.keyboard.press("Escape");
    await ui(page, '[data-act="ai"]').click();
    await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp").style.display === "block");
    assert.match(await ui(page, ".agentp .about").textContent(), /Title.*Old title/);
    // Connect: pick the Claude login.
    await ui(page, ".agentp .gear").click();
    await page.waitForFunction(() => /found/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector('.agentp .d[data-d="claude"]').textContent));
    await ui(page, '.agentp input[value="claude"]').check();
    await ui(page, ".agentp .savec").click();
    await page.waitForFunction(() => /Claude login/.test(document.querySelector("htmledit-overlay").shadowRoot.querySelector(".agentp .gear").textContent));
    await ui(page, ".agentp textarea").fill("Rename the heading");
    await Promise.all([page.waitForEvent("load"), ui(page, ".agentp textarea").press("Meta+Enter")]);
    // The page reloaded with the edit; the panel came back with the log.
    await page.waitForFunction(() => window.__htmledit && document.querySelector("h1").textContent === "New title");
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

test("✨ without a connected AI still offers 'Leave as note', and Do it asks to connect", async () => {
  process.env.HOTEDIT_CLAUDE_BIN = "/nonexistent/claude";
  const s = await open({ name: "b.html", html: "<!doctype html><body><p>Hello</p></body>" });
  const { page } = s;
  try {
    await page.evaluate(() => window.__htmledit.api("POST", "/agent/config", { provider: "", apiKey: "" }));
    await page.keyboard.press("e");
    await page.locator("body > p").click();
    await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
    await page.keyboard.press("Escape");
    await ui(page, '[data-act="ai"]').click();
    await ui(page, ".agentp textarea").fill("Say hi");
    assert.ok(await ui(page, ".agentp .tonote").isVisible());
    await ui(page, ".agentp .go").click();
    await ui(page, ".agentp .conn").waitFor({ state: "visible" });
  } finally {
    delete process.env.HOTEDIT_CLAUDE_BIN;
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
    await page.keyboard.press("e");
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
