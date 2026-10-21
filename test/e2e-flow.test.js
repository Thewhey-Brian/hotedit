"use strict";
// Moving between blocks by clicking: the previous edit (text or an open
// panel) is saved and the clicked block is ready to type in.
const test = require("node:test");
const assert = require("node:assert");
const { harness, until, ui } = require("./helpers");

const { open } = harness(test);
const PAGE = "<!doctype html><body>\n<h1>One</h1>\n<p>Two</p>\n<p>Three</p>\n</body>\n";
const editingText = (page) =>
  page.evaluate(() => (document.activeElement && document.activeElement.isContentEditable ? document.activeElement.textContent : null));

test("click from block to block: each text edit is saved on the way", async () => {
  const s = await open({ name: "f.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("e");
  for (const [sel, add] of [["h1", "!"], ["body > p >> nth=0", "?"], ["body > p >> nth=1", "."]]) {
    await page.locator(sel).click();
    await page.keyboard.press("End");
    await page.keyboard.type(add);
  }
  await page.locator("h1").click(); // leave the last one
  assert.ok(await until(() => s.read().includes("<h1>One!</h1>") && s.read().includes("<p>Two?</p>") && s.read().includes("<p>Three.</p>")), s.read());
  await page.waitForFunction(() => document.activeElement && document.activeElement.tagName === "H1" && document.activeElement.isContentEditable);
  await s.close();
});

test("click another block while the style panel is open: style saved, next block editing", async () => {
  const s = await open({ name: "g.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("h1").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("Escape");
  await ui(page, '[data-act="style"]').click();
  await ui(page, '.sty [data-p="text-align"]').selectOption("center");
  await page.locator("body > p").first().click();
  assert.ok(await until(() => s.read().includes('<h1 style="text-align: center">One</h1>')), s.read());
  await page.waitForFunction(() => document.activeElement && document.activeElement.isContentEditable && document.activeElement.textContent === "Two");
  assert.strictEqual(await ui(page, ".sty").isVisible(), false);
  await page.keyboard.type("x");
  await page.locator("h1").click();
  assert.ok(await until(() => /<p>(xTwo|Twox)<\/p>/.test(s.read())), s.read());
  await s.close();
});

test("click another block while editing HTML source: saved (page reloads) and next block editing", async () => {
  const s = await open({ name: "h.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("h1").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="more"]').click();
  await ui(page, '[data-act="source"]').click();
  await ui(page, ".src textarea").fill("One <em>more</em>");
  await Promise.all([page.waitForEvent("load"), page.locator("body > p").nth(1).click({ position: { x: 4, y: 4 } })]);
  assert.ok(await until(() => s.read().includes("<h1>One <em>more</em></h1>")), s.read());
  await page.waitForFunction(() => window.__htmledit);
  // structure changed (new <em>), so ids moved: nothing stale is opened
  assert.notStrictEqual(await editingText(page), "One more");
  await s.close();
});

test("source edit then click: after the reload the clicked block is ready to type", async () => {
  const s = await open({ name: "k.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("h1").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("Escape");
  await ui(page, '.bb [data-act="more"]').click();
  await ui(page, '[data-act="source"]').click();
  await ui(page, ".src textarea").fill("One and a half");
  await Promise.all([page.waitForEvent("load"), page.locator("body > p").nth(1).click({ position: { x: 4, y: 4 } })]);
  await page.waitForFunction(() => window.__htmledit);
  assert.ok(s.read().includes("<h1>One and a half</h1>"));
  await page.waitForFunction(() => document.activeElement && document.activeElement.isContentEditable && document.activeElement.textContent === "Three");
  await s.close();
});
