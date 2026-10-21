"use strict";
// Drag-and-drop re-arranging (⠿ grip on the block toolbar), checked on disk.
const test = require("node:test");
const assert = require("node:assert");
const { harness, until, ui } = require("./helpers");

const { open } = harness(test);

const PAGE = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>t</title></head>
<body>
  <h1>Report</h1>
  <p id="a">First paragraph</p>
  <p id="b">Second paragraph</p>
  <ul id="l1">
    <li>one</li>
    <li>two</li>
  </ul>
  <div class="card">
    <p>card text</p>
    <ul id="l2">
      <li>alpha</li>
    </ul>
  </div>
</body>
</html>
`;

// Select `sel`, then drag its grip to (fraction fx, fy) of `target`'s box.
async function dragTo(page, sel, target, fy = 0.75, fx = 0.5) {
  await page.locator(sel).click();
  await page.waitForFunction(() =>
    document.querySelector("[contenteditable=true]"),
  );
  await page.keyboard.press("Escape");
  const g = await ui(page, ".bb .grip").boundingBox();
  const t = await page.locator(target).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width * fx, t.y + t.height * fy, { steps: 8 });
  await page.waitForFunction(
    () =>
      document
        .querySelector("htmledit-overlay")
        .shadowRoot.querySelector(".drop").style.display === "block",
  );
  await page.mouse.up();
}

test("drag a paragraph below the next one", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await dragTo(page, "#a", "#b", 0.8);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig.replace(
      `  <p id="a">First paragraph</p>\n  <p id="b">Second paragraph</p>\n`,
      `  <p id="b">Second paragraph</p>\n  <p id="a">First paragraph</p>\n`,
    ),
  );
  // Page reloads with the moved block still selected.
  await page.waitForFunction(
    () =>
      window.__htmledit &&
      window.__htmledit.selected &&
      window.__htmledit.selected.id === "a",
  );
  await s.close();
});

test("drag a list item into another list (different parent)", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await dragTo(page, "#l1 li >> nth=1", "#l2 li", 0.2);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace(`    <li>one</li>\n    <li>two</li>\n`, `    <li>one</li>\n`)
      .replace(
        `    <ul id="l2">\n      <li>alpha</li>`,
        `    <ul id="l2">\n      <li>two</li>\n      <li>alpha</li>`,
      ),
  );
  await s.close();
});

test("drag a block into a box: indentation follows the new place", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await dragTo(page, "#b", ".card p", 0.2);
  assert.ok(await until(() => s.read() !== s.orig));
  assert.strictEqual(
    s.read(),
    s.orig
      .replace(`  <p id="b">Second paragraph</p>\n`, "")
      .replace(
        `    <p>card text</p>`,
        `    <p id="b">Second paragraph</p>\n    <p>card text</p>`,
      ),
  );
  await s.close();
});

test("list items only drop among list items; Esc cancels a drag", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("#l1 li").first().click();
  await page.waitForFunction(() =>
    document.querySelector("[contenteditable=true]"),
  );
  await page.keyboard.press("Escape");
  const g = await ui(page, ".bb .grip").boundingBox();
  const h = await page.locator("h1").boundingBox();
  await page.mouse.move(g.x + 5, g.y + 5);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + h.height / 2, { steps: 6 });
  // Over a heading there is no valid spot for a list item.
  assert.strictEqual(
    await page.evaluate(
      () =>
        document
          .querySelector("htmledit-overlay")
          .shadowRoot.querySelector(".drop").style.display,
    ),
    "none",
  );
  const b = await page.locator("#b").boundingBox();
  await page.mouse.move(b.x + 20, b.y + 5, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert.strictEqual(s.read(), s.orig);
  await s.close();
});

test("Alt+↓ moves the selected block down", async () => {
  const s = await open({ name: "t.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await page.locator("#a").click();
  await page.waitForFunction(() =>
    document.querySelector("[contenteditable=true]"),
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+ArrowDown");
  assert.ok(await until(() => s.read() !== s.orig));
  assert.ok(
    s
      .read()
      .includes(
        `<p id="b">Second paragraph</p>\n  <p id="a">First paragraph</p>`,
      ),
  );
  await s.close();
});

test("real report: drag a block below its neighbour; only those lines move", async () => {
  const s = await open("progress_report.html");
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  const h2 = page.locator("body h2").first();
  await h2.scrollIntoViewIfNeeded();
  const moved = await h2.evaluate((h) => h.nextElementSibling.textContent.trim().slice(0, 40));
  await dragTo(page, "body h2 >> nth=0 >> xpath=following-sibling::*[1]", "body h2 >> nth=0 >> xpath=following-sibling::*[2]", 0.85);
  assert.ok(await until(() => s.read() !== s.orig));
  const lines = (t) => t.split("\n").sort().join("\n");
  assert.strictEqual(lines(s.read()), lines(s.orig), "same lines, new order");
  await page.waitForFunction(
    (m) => window.__htmledit && window.__htmledit.selected && window.__htmledit.selected.textContent.trim().startsWith(m),
    moved,
  );
  assert.deepStrictEqual(s.errors, []);
  await s.close();
});
