"use strict";
// M6: robustness on every real sample, in a real browser after page scripts ran.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { harness, diff, until, SAMPLES } = require("./helpers");
const { start } = require("../src/server");

const { open, browser } = harness(test);
const samples = fs.readdirSync(SAMPLES).filter((f) => f.endsWith(".html"));

for (const f of samples) {
  test(`${f}: no-op save of every editable element writes nothing; one real edit is exact`, async () => {
    const s = await open(f);
    const { page } = s;
    await page.waitForTimeout(1500); // let page scripts (KaTeX, Mermaid, builders) finish
    const r = await page.evaluate(async () => {
      const h = window.__htmledit;
      const els = [...document.querySelectorAll("[data-he]")].filter(
        (e) => !/^(SCRIPT|STYLE|HTML|HEAD|BODY|TITLE|META|LINK|BR|HR|IMG|INPUT|TEXTAREA)$/i.test(e.tagName),
      );
      let checked = 0, skipped = 0;
      const changed = [];
      for (const el of els.slice(0, 400)) {
        const sig = await h.api("GET", "/node?id=" + el.dataset.he);
        if (!h.domMatchesSource(el, sig)) { skipped++; continue; }
        let res;
        try {
          res = await h.api("POST", "/edit", { edits: [{ id: Number(el.dataset.he), html: el.innerHTML }], version: h.version });
        } catch (e) {
          if (/no editable content/.test(e.message)) { skipped++; continue; } // <col>, <wbr>, …
          throw e;
        }
        checked++;
        if (res.changed || res.stale) changed.push(el.tagName + "#" + el.dataset.he);
      }
      return { checked, skipped, changed };
    });
    assert.deepStrictEqual(r.changed, [], `${f}: no-op saves changed bytes`);
    assert.strictEqual(s.read(), s.orig);
    assert.ok(r.checked > 0, `${f}: nothing editable`);
    // One real edit on the first plain text block.
    const target = await page.evaluate(async () => {
      const h = window.__htmledit;
      for (const el of document.querySelectorAll("p[data-he], li[data-he], h2[data-he], h3[data-he], td[data-he]")) {
        const last = el.lastChild;
        if (!last || last.nodeType !== 3 || !last.data.trim()) continue;
        const sig = await h.api("GET", "/node?id=" + el.dataset.he);
        if (!h.domMatchesSource(el, sig)) continue;
        last.data = last.data + " ✓ <&>";
        await h.api("POST", "/edit", { edits: [{ id: Number(el.dataset.he), html: el.innerHTML }], version: h.version });
        return el.dataset.he;
      }
      return null;
    });
    assert.ok(target != null, `${f}: no text block found`);
    const d = diff(s.orig, s.read());
    assert.strictEqual(d.removed, "");
    assert.strictEqual(d.added, " ✓ &lt;&amp;&gt;");
    assert.ok(r.checked + r.skipped > 0);
    console.log(`# ${f}: ${r.checked} elements round-tripped, ${r.skipped} script-rewritten (source-edit only)`);
    await s.close();
  });
}

test("<base href> pointing elsewhere does not break the overlay", async () => {
  const s = await open({ name: "b.html", html: `<!doctype html><head><base href="https://example.invalid/x/"></head><body><p>hello</p></body>` });
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("body > p").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read().includes("<p>hello!</p>")));
  await s.close();
});

test("a second tab reloads after the first saves (no lost updates)", async () => {
  const s = await open({ name: "t.html", html: `<!doctype html><body><p id="a">one</p><p id="b">two</p></body>` });
  const tab2 = await browser().newPage();
  await tab2.goto(s.srv.url);
  await tab2.waitForFunction(() => window.__htmledit);
  const { page } = s;
  await page.keyboard.press("e");
  await page.locator("#a").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Enter");
  assert.ok(await until(() => s.read().includes("one edited")));
  await tab2.waitForFunction(() => document.getElementById("a").textContent === "one edited");
  // the editing tab itself did not reload
  assert.strictEqual(await page.evaluate(() => performance.getEntriesByType("navigation").length), 1);
  await tab2.close();
  await s.close();
});

test("non-UTF-8 files are refused, not corrupted", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-l1-"));
  const f = path.join(dir, "latin1.html");
  const bytes = Buffer.from([...Buffer.from("<p>caf"), 0xe9, ...Buffer.from("</p>")]);
  fs.writeFileSync(f, bytes);
  await assert.rejects(start(f), /not valid UTF-8/);
  assert.ok(fs.readFileSync(f).equals(bytes));
});
