// Records demo/htmledit-demo.gif: node demo/record.js (needs ffmpeg).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
process.env.HTMLEDIT_BACKUP_DIR ||= require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "htmledit-backups-"));
const { start } = require("../src/server");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htmledit-demo-"));
  const file = path.join(dir, "demo_report.html");
  fs.copyFileSync(path.join(__dirname, "demo_report.html"), file);
  const srv = await start(file);
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  // Frame capture loop (screenshots), assembled into a GIF with ffmpeg.
  const frames = path.join(dir, "frames");
  fs.mkdirSync(frames);
  let n = 0, recording = false;
  const t0 = Date.now();
  const capture = (async () => {
    while (!recording) await new Promise((r) => setTimeout(r, 20));
    while (recording) {
      const buf = await page.screenshot({ type: "jpeg", quality: 85 }).catch(() => null);
      if (buf) fs.writeFileSync(path.join(frames, String(n++).padStart(5, "0") + ".jpg"), buf);
    }
  })();
  // Visible cursor for the recording only.
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border-radius:50%;background:rgba(239,68,68,.55);border:2px solid #fff;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:left .05s,top .05s";
      document.documentElement.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    });
  });
  const pause = (ms) => page.waitForTimeout(ms);
  const ui = (s) => page.locator(`htmledit-overlay ${s}`);
  const move = async (loc, opts) => {
    await loc.evaluate((e) => {
      const r = e.getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight - 20) e.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    await pause(400);
    const b = await loc.boundingBox();
    const x = b.x + (opts && opts.dx != null ? opts.dx : b.width / 2), y = b.y + (opts && opts.dy != null ? opts.dy : b.height / 2);
    await page.mouse.move(x, y, { steps: 18 });
    return { x, y };
  };
  const click = async (loc, opts) => {
    const p = await move(loc, opts);
    await pause(250);
    await page.mouse.click(p.x, p.y);
  };
  // Select a block: click, wait until the overlay is editing it, leave text mode.
  const selectBlock = async (loc, opts) => {
    await click(loc, opts);
    await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable, null, { timeout: 5000 }).catch(async (e) => {
      console.log("DEBUG", await page.evaluate(() => [String(window.__htmledit.selected && window.__htmledit.selected.outerHTML).slice(0, 120), document.querySelector("htmledit-overlay").shadowRoot.querySelector(".status").textContent]));
      throw e;
    });
    await page.keyboard.press("Escape");
  };
  await page.goto(srv.url);
  await page.waitForFunction(() => document.getElementById("score").data);
  recording = true;
  await pause(1600); // first-run tip
  await click(ui(".hint .ok"));
  await pause(300);
  await click(ui(".edit"));
  await pause(500);
  // 1. text: the caret lands where you click
  const h1 = page.locator("h1");
  await click(h1, { dx: 200 });
  await page.waitForFunction(() => window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  await pause(200);
  await page.keyboard.type(" · week 42", { delay: 70 });
  await page.keyboard.press("Enter");
  await pause(900);
  // 2. style
  const sub = page.locator("p.sub");
  await selectBlock(sub, { dx: 120 });
  await click(ui('[data-act="style"]'));
  await pause(300);
  await click(ui('.sty [data-p="color"]'));
  await page.keyboard.type("#b45309", { delay: 60 });
  await click(ui('.sty [data-p="font-size"]'));
  await page.keyboard.type("18px", { delay: 60 });
  await pause(500);
  await click(ui(".sty .apply"));
  await pause(900);
  // 3. chart: form + data table, live preview
  await click(page.locator("#score"), { dx: 300, dy: 150 });
  await pause(600);
  await click(ui('.chartp [data-tab="form"]'));
  const title = ui(`.chartp .ctl[data-path='["2","title"]'] input`);
  await click(title);
  await title.selectText();
  await page.keyboard.type("Accuracy (higher is better)", { delay: 40 });
  await pause(700);
  await click(ui('.chartp [data-tab="data"]'));
  const y = ui('.chartp table[data-table="0"] tr:nth-child(5) td:nth-child(3) input');
  await click(y);
  await y.selectText();
  await page.keyboard.type("0.86", { delay: 90 });
  await pause(1100);
  await click(ui(".chartp .apply"));
  await pause(900);
  // 4. drag a list item to a new spot
  await selectBlock(page.locator("li").nth(2), { dx: 60 });
  const grip = await move(ui(".bb .grip"));
  await page.mouse.down();
  const first = await page.locator("li").first().boundingBox();
  await page.mouse.move(first.x + 80, first.y + 4, { steps: 25 });
  await pause(500);
  await page.mouse.up();
  void grip;
  await pause(1200);
  // 5. add a paragraph with ＋
  await selectBlock(page.locator("li").first(), { dx: 60 });
  await click(ui('.bb [data-act="insert"]'));
  await pause(500);
  await click(ui('.ins [data-ins="li"]'));
  await page.waitForFunction(() => window.__htmledit && window.__htmledit.selected && window.__htmledit.selected.isContentEditable);
  await page.keyboard.type("Share the report with the team", { delay: 45 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s"); // save, no new item
  await pause(500);
  // 6. note for the agent
  await selectBlock(page.locator(".card p").first(), { dx: 150 });
  await click(ui('[data-act="comment"]'));
  await page.keyboard.type("Add the exact margin and number of seeds", { delay: 40 });
  await click(ui(".cmtp .save"));
  await pause(700);
  await click(ui(".cbtn"));
  await pause(2200);
  void title;
  recording = false;
  await capture;
  const fps = (n / ((Date.now() - t0) / 1000)).toFixed(2);
  await ctx.close();
  await browser.close();
  await srv.stop();
  const out = path.join(__dirname, "htmledit-demo.gif");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(frames, "%05d.jpg"), "-vf",
    "fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", out]);
  console.log(`frames: ${n} at ${fps} fps`);
  fs.copyFileSync(file, path.join(dir, "after.html"));
  console.log("gif:", out, (fs.statSync(out).size / 1e6).toFixed(1) + " MB");
  console.log("diff:");
  try { execFileSync("git", ["diff", "--no-index", "--color=never", path.join(__dirname, "demo_report.html"), file], { stdio: "inherit" }); } catch {}
})();
