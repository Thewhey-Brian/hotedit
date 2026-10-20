"use strict";
// Real-browser checks: drive the overlay in Chromium on copies of real reports
// and assert what lands on disk.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { harness, diff, until, SAMPLES } = require("./helpers");

const { open, browser: getBrowser } = harness(test);

test("served page has overlay, file untouched until an edit", async () => {
  const s = await open("progress_report.html");
  const html = await s.page.content();
  assert.match(html, /htmledit-overlay/);
  assert.strictEqual(s.read(), s.orig);
  await s.close();
});

test("click-to-edit a heading saves a minimal patch; undo restores bytes", async () => {
  const s = await open("progress_report.html");
  const { page } = s;
  await page.keyboard.press("e");
  const h = page.locator("h2").first();
  const before = await h.textContent();
  await h.click();
  await page.waitForFunction(() =>
    document.querySelector("[contenteditable=true]"),
  );
  await page.keyboard.press("End");
  await page.keyboard.press("Meta+ArrowRight"); // macOS: End doesn't move the caret
  await page.keyboard.type(" (edited & <ok>)");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read() !== s.orig), "file was written");
  const d = diff(s.orig, s.read());
  assert.strictEqual(d.removed, "");
  assert.strictEqual(d.added, " (edited &amp; &lt;ok&gt;)");
  assert.ok(
    s.orig.slice(0, d.at).endsWith(before.trim().slice(-10)),
    "inserted at end of heading text",
  );
  assert.strictEqual(
    await page.evaluate(() =>
      document.querySelector("[contenteditable]") !== null,
    ),
    false,
  );
  // Undo via toolbar → page reloads, bytes restored.
  await page.waitForFunction(() => {
    const b = document.querySelector("htmledit-overlay").shadowRoot.querySelector(".undo");
    return !b.disabled;
  });
  await page
    .locator("htmledit-overlay")
    .evaluate((h) => h.shadowRoot.querySelector(".undo").click());
  assert.ok(
    await until(() => s.read() === s.orig),
    "undo restored the original bytes",
  );
  await s.close();
});

test("Esc cancels without writing", async () => {
  const s = await open("dataset_report.html");
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("p").nth(2).click();
  await page.keyboard.type("garbage");
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(s.read(), s.orig);
  await s.close();
});

test("script-rendered math opens source editor and saves source", async () => {
  const s = await open("progress_report.html");
  const { page } = s;
  const ok = await page
    .waitForFunction(() => document.querySelector(".katex"), null, {
      timeout: 15000,
    })
    .then(
      () => true,
      () => false,
    );
  if (!ok) {
    await s.close();
    return; // KaTeX CDN unreachable
  }
  await page.keyboard.press("e");
  await page
    .locator(".eq")
    .filter({ has: page.locator("annotation", { hasText: "c_{\\text{tgt}}=" }) })
    .first()
    .click();
  const ta = page.locator("htmledit-overlay .src textarea");
  await ta.waitFor();
  const src = await ta.inputValue();
  assert.match(
    src,
    /c_\{\\text\{tgt\}\}/,
    "textarea shows original TeX, not KaTeX output",
  );
  await ta.fill(src.replace("c_{\\text{tgt}}", "c_{\\text{target}}"));
  await page.locator("htmledit-overlay .src .save").click();
  assert.ok(await until(() => s.read() !== s.orig));
  const d = diff(s.orig, s.read());
  assert.deepStrictEqual([d.removed, d.added], ["g", "arge"]);
  assert.ok(
    !s.read().includes("katex-html"),
    "rendered KaTeX never leaks into the file",
  );
  assert.ok(s.read().includes("c_{\\text{target}}"));
  await s.close();
});

test("SVG chart label edited through the text field", async () => {
  const s = await open("dashboard_report.html");
  const { page } = s;
  await page.keyboard.press("e");
  const t = page.locator("svg text").first();
  const old = (await t.textContent()).trim();
  await t.click();
  const input = page.locator("htmledit-overlay .src .line");
  await input.waitFor();
  await input.fill(old + "!");
  await input.press("Enter");
  assert.ok(await until(() => s.read() !== s.orig));
  const d = diff(s.orig, s.read());
  assert.strictEqual(d.removed, "");
  assert.strictEqual(d.added, "!");
  await s.close();
});

test("external rewrite of the file live-reloads the page", async () => {
  const s = await open("rounds_report.html");
  const { page } = s;
  const marker = "AGENT-WAS-HERE";
  fs.writeFileSync(
    s.file,
    s.orig + `<p id="m">${marker}</p>`,
  );
  await page.waitForSelector("#m", { timeout: 15000 });
  await s.close();
});

test("every sample loads with overlay and without new page errors", async () => {
  for (const f of fs.readdirSync(SAMPLES).filter((x) => x.endsWith(".html"))) {
    const s = await open(f);
    const plain = await getBrowser().newPage();
    const plainErrors = [];
    plain.on("pageerror", (e) => plainErrors.push(e.message));
    await plain.goto("file://" + path.join(SAMPLES, f));
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(
      s.errors.length <= plainErrors.length,
      `${f}: ${s.errors.join("; ")}`,
    );
    assert.ok(await s.page.locator("htmledit-overlay").count(), f);
    await plain.close();
    await s.close();
  }
});
