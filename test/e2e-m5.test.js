"use strict";
// M5: comments pinned in the browser, consumed/resolved by an agent via CLI.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { harness, until, ui } = require("./helpers");
const comments = require("../src/comments");

const { open } = harness(test);
const CLI = path.join(__dirname, "..", "bin", "htmledit.js");

test("comment on a real report → sidecar + CLI markdown; agent edit + resolve updates pins", async () => {
  const s = await open("progress_report.html");
  const { page } = s;
  await page.keyboard.press("e");
  const h3 = page.locator("h3").nth(1);
  const h3text = (await h3.textContent()).trim();
  await h3.click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press("Escape");
  await ui(page, '[data-act="comment"]').click();
  await ui(page, ".cmtp textarea").fill("Make this claim more cautious");
  await ui(page, ".cmtp .save").click();
  assert.ok(await until(() => comments.load(s.file).length === 1));
  assert.strictEqual(s.read(), s.orig, "commenting never touches the HTML");
  await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelectorAll(".pin").length === 1);
  const md = execFileSync("node", [CLI, "comments", s.file]).toString();
  assert.match(md, /Make this claim more cautious/);
  assert.ok(md.includes(h3text.slice(0, 30)), md);

  // The agent edits the file (inserts content above), then resolves.
  const [c] = comments.load(s.file);
  fs.writeFileSync(s.file, s.read().replace("<body>", "<body>\n<p>Agent note.</p>"));
  await page.waitForSelector("text=Agent note.");
  const js = JSON.parse(execFileSync("node", [CLI, "comments", s.file, "--json"]).toString());
  assert.notStrictEqual(js.comments[0].at, null, "anchor re-found after rewrite");
  await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelectorAll(".pin").length === 1);
  execFileSync("node", [CLI, "comments", s.file, "--resolve", c.id]);
  await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelectorAll(".pin").length === 0);
  await s.close();
});

test("comment list: copy for agent puts markdown on the clipboard", async () => {
  const s = await open({ name: "p.html", html: "<!doctype html><body><h1>Hi</h1><p>Body text</p></body>" });
  const { page } = s;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.keyboard.press("e");
  await page.locator("body > p").click();
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  // select a word to quote it
  await page.evaluate(() => {
    const t = document.querySelector("p").firstChild;
    const r = document.createRange();
    r.setStart(t, 5);
    r.setEnd(t, 9);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await ui(page, '[data-act="comment"]').click();
  await ui(page, ".cmtp textarea").fill("Rename");
  await ui(page, ".cmtp textarea").press("Meta+Enter");
  assert.ok(await until(() => comments.load(s.file).length === 1));
  assert.strictEqual(comments.load(s.file)[0].quote, "text");
  await ui(page, ".cbtn").click();
  await ui(page, ".cmts .copy").click();
  await page.waitForFunction(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".status").textContent.startsWith("copied"));
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /# Comments on p\.html \(1 open\)/);
  assert.match(clip, /on the text: "text"/);
  await s.close();
});
