"use strict";
// Shared real-browser harness: copies a sample (or writes given HTML) to a
// temp dir, starts an htmledit server on it and opens it in Chromium.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { start } = require("../src/server");

// Synthetic AI-style reports; set HTMLEDIT_SAMPLES to run on your own.
const SAMPLES = process.env.HTMLEDIT_SAMPLES || path.join(__dirname, "reports");
// Keep test-session backups out of the user's ~/.htmledit.
process.env.HTMLEDIT_BACKUP_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-backups-"));
// …and AI settings / the open-pages registry out of ~/.htmledit too.
process.env.HTMLEDIT_STATE_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-state-"));
const FIXTURES = path.join(__dirname, "fixtures");
const NM = path.join(__dirname, "..", "node_modules");
// Chart libraries for fixtures, served from a lib/ dir next to the page.
const LIBS = {
  "plotly.min.js": "plotly.js-dist-min/plotly.min.js",
  "chart.umd.js": "chart.js/dist/chart.umd.js",
  "vega.min.js": "vega/build/vega.min.js",
  "vega-lite.min.js": "vega-lite/build/vega-lite.min.js",
  "vega-embed.min.js": "vega-embed/build/vega-embed.min.js",
  "mermaid.min.js": "mermaid/dist/mermaid.min.js",
};

function harness(test) {
  let browser;
  const live = new Set(); // sessions to tear down even when a test fails
  test.before(async () => {
    browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  });
  test.after(async () => {
    for (const c of live) await c();
    await browser.close();
  });

  // open("sample.html") | open({ name, html }) | open({ fixture })
  async function open(sample) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-"));
    const name = typeof sample === "string" ? sample : sample.name || sample.fixture;
    const file = path.join(dir, name);
    if (typeof sample === "string") fs.copyFileSync(path.join(SAMPLES, sample), file);
    else if (sample.fixture) fs.copyFileSync(path.join(FIXTURES, sample.fixture), file);
    else fs.writeFileSync(file, sample.html);
    fs.mkdirSync(path.join(dir, "lib"));
    for (const [k, v] of Object.entries(LIBS)) fs.symlinkSync(path.join(NM, v), path.join(dir, "lib", k));
    const orig = fs.readFileSync(file, "utf8");
    const srv = await start(file);
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__htmledit);
    const read = () => fs.readFileSync(file, "utf8");
    const close = async () => {
      live.delete(close);
      await page.close();
      await srv.stop();
    };
    live.add(close);
    return { page, dir, file, orig, read, close, srv, errors };
  }
  return { open, browser: () => browser };
}

// Single contiguous change between a and b.
function diff(a, b) {
  let p = 0;
  while (p < a.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { at: p, removed: a.slice(p, a.length - s), added: b.slice(p, b.length - s) };
}

const until = async (fn, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

// Click a block-bar / panel button inside the overlay's shadow root.
const ui = (page, sel) => page.locator(`htmledit-overlay ${sel}`);
// Run a block action; ones that live in the "⋯" menu open it first.
const MENU = new Set(["up", "down", "duplicate", "hide", "source", "remove"]);
// Structural actions reload the page; wait for the new page's overlay.
const RELOADS = new Set(["up", "down", "duplicate", "remove"]);
const act = async (page, name) => {
  if (MENU.has(name)) await ui(page, '.bb [data-act="more"]').click();
  const click = ui(page, `[data-act="${name}"]`).click();
  if (!RELOADS.has(name)) return click;
  await Promise.all([page.waitForEvent("load"), click]);
  await page.waitForFunction(() => window.__htmledit);
};

module.exports = { harness, diff, until, ui, act, SAMPLES, FIXTURES };
