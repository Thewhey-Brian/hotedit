"use strict";
// M3: style panel, block operations and image swap, checked on disk.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { harness, diff, until, ui, act } = require("./helpers");

const { open } = harness(test);

const PAGE = `<!doctype html>
<html><head><title>t</title><style>.card{padding:8px}</style></head>
<body>
  <h1 id="title">Report title</h1>
  <ul>
    <li>alpha</li>
    <li>beta</li>
    <li>gamma</li>
  </ul>
  <p class="note" style="color: rgb(10, 20, 30)">A note</p>
  <div class="card"><p>Card text</p></div>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="x">
  <a href="https://example.org">a link</a>
  <script>
    // Runtime styling that must never be saved.
    document.querySelector(".note").style.outline = "3px solid red";
    document.getElementById("title").classList.add("js-added");
  </script>
</body></html>
`;

// Click a block; resolves once the overlay finished selecting/editing it.
const select = async (page, sel) => {
  await page.locator(sel).first().click();
  await page.waitForFunction(() => {
    const h = window.__htmledit;
    return h && h.selected && (h.selected.isContentEditable || !/^(P|LI|H1|A|DIV)$/.test(h.selected.tagName));
  });
};

test("style panel writes only the changed properties into the source style", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await select(page, ".note");
  await page.keyboard.press("Escape"); // leave text editing, keep selection
  await act(page, "style");
  await ui(page, '.sty [data-p="font-size"]').fill("20px");
  await ui(page, '.sty [data-p="color"]').fill("#336699");
  // live preview is applied before saving
  assert.strictEqual(
    await page.locator(".note").evaluate((e) => getComputedStyle(e).fontSize),
    "20px",
  );
  await ui(page, ".sty .apply").click();
  assert.ok(await until(() => s.read() !== s.orig));
  const out = s.read();
  assert.ok(
    out.includes(
      `<p class="note" style="color: #336699; font-size: 20px">A note</p>`,
    ),
    out,
  );
  assert.ok(!/<p class="note"[^>]*outline/.test(out), "runtime style leaked");
  assert.ok(!/<h1[^>]*js-added/.test(out), "runtime class leaked");
  await s.close();
});

test("style panel cancel restores the live element and writes nothing", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await select(page, "h1");
  await act(page, "style");
  await ui(page, '.sty [data-p="font-size"]').fill("77px");
  await ui(page, ".sty .cancel").click();
  assert.notStrictEqual(
    await page.locator("h1").evaluate((e) => getComputedStyle(e).fontSize),
    "77px",
  );
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(s.read(), s.orig);
  await s.close();
});

test("move, duplicate, delete, hide list items", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await select(page, "li:nth-child(3)");
  await act(page, "up");
  assert.ok(
    await until(() => s.read().includes("<li>gamma</li>\n    <li>beta</li>")),
  );
  // selection survives the reload and follows the moved element
  await page.waitForFunction(
    () => window.__htmledit && window.__htmledit.selected,
  );
  assert.strictEqual(
    await page.evaluate(() => window.__htmledit.selected.textContent),
    "gamma",
  );
  await act(page, "duplicate");
  assert.ok(
    await until(() =>
      s
        .read()
        .includes("<li>gamma</li>\n    <li>gamma</li>\n    <li>beta</li>"),
    ),
  );
  await page.waitForFunction(
    () => window.__htmledit && window.__htmledit.selected,
  );
  await act(page, "remove");
  assert.ok(
    await until(() =>
      s
        .read()
        .includes(
          "<ul>\n    <li>alpha</li>\n    <li>gamma</li>\n    <li>beta</li>\n  </ul>",
        ),
    ),
  );
  await page.waitForFunction(() => window.__htmledit);
  await select(page, "li:nth-child(1)");
  await page.keyboard.press("Escape");
  await act(page, "hide");
  assert.ok(await until(() => s.read().includes("<li hidden>alpha</li>")));
  // hidden blocks stay visible (dimmed) in edit mode so they can be un-hidden
  assert.notStrictEqual(
    await page
      .locator("li")
      .first()
      .evaluate((e) => getComputedStyle(e).display),
    "none",
  );
  await act(page, "hide");
  assert.ok(await until(() => s.read().includes("<li>alpha</li>")));
  await s.close();
});

test("parent selection then move a whole card", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await select(page, ".card p");
  await page.keyboard.press("Escape");
  await act(page, "parent");
  assert.strictEqual(
    await page.evaluate(() => window.__htmledit.selected.className),
    "card",
  );
  await act(page, "up");
  assert.ok(
    await until(() =>
      /<div class="card"><p>Card text<\/p><\/div>\n  <p class="note"/.test(
        s.read(),
      ),
    ),
  );
  await s.close();
});

function png(w, h) {
  // Minimal valid RGB PNG, built by hand (no deps).
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("image swap: inline data URI stays inline", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  const pic = path.join(s.dir, "new.png");
  fs.writeFileSync(pic, png(4, 3));
  await page.keyboard.press("Alt+KeyE");
  await select(page, "img");
  const chooser = page.waitForEvent("filechooser");
  await act(page, "image");
  await (await chooser).setFiles(pic);
  assert.ok(await until(() => s.read() !== s.orig));
  const d = diff(s.orig, s.read());
  assert.match(
    s.read(),
    /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="x">/,
  );
  assert.ok(!d.removed.includes("alt"));
  await s.close();
});

test("image swap on a real report writes a sibling asset file", async () => {
  const s = await open("figures_report.html");
  const { page } = s;
  const pic = path.join(s.dir, "fig new.png");
  fs.writeFileSync(pic, png(8, 8));
  await page.keyboard.press("Alt+KeyE");
  await page.locator("img").first().click({ force: true });
  const chooser = page.waitForEvent("filechooser");
  await act(page, "image");
  await (await chooser).setFiles(pic);
  assert.ok(await until(() => s.read() !== s.orig));
  const d = diff(s.orig, s.read());
  assert.strictEqual(
    d.removed.includes("fig1_accuracy_vs_size") || d.removed === "",
    true,
  );
  assert.match(
    s.read(),
    /<img src="figures_report_assets\/fig_new\.png"/,
  );
  assert.ok(
    fs.existsSync(
      path.join(s.dir, "figures_report_assets", "fig_new.png"),
    ),
  );
  await s.close();
});

test("link URL edit patches only href", async () => {
  const s = await open({ name: "p.html", html: PAGE });
  const { page } = s;
  await page.keyboard.press("Alt+KeyE");
  await select(page, "a");
  await page.keyboard.press("Escape");
  await act(page, "link");
  await ui(page, ".src .line").fill("https://example.com/x?a=1&b=2");
  await ui(page, ".src .line").press("Enter");
  assert.ok(await until(() => s.read() !== s.orig));
  assert.ok(
    s.read().includes(`<a href="https://example.com/x?a=1&amp;b=2">a link</a>`),
  );
  await s.close();
});
