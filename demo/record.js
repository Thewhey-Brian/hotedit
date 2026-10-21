// Records the hotedit tour on demo/showcase.html:
//   node demo/record.js        → demo/hotedit-tour.mp4 + demo/hotedit-demo.gif
// Needs ffmpeg and network access (the showcase loads its chart libraries from CDNs).
// Captions, click ripples and the title/terminal/diff cards are drawn by this
// script for the video only; they are not part of hotedit.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
process.env.HTMLEDIT_STATE_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "hotedit-rec-state-"));
process.env.HTMLEDIT_BACKUP_DIR ||= fs.mkdtempSync(
  path.join(os.tmpdir(), "hotedit-backups-"),
);
const { start } = require("../src/server");

const W = 1280,
  H = 800;
const MAC = process.platform === "darwin";
const MOD = MAC ? "Meta" : "Control";

// Video-only layer: captions, ripples, cards. Re-created after each reload.
function recLayer() {
  const css = `
  #rec { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; font-family: Inter, -apple-system, system-ui, sans-serif; }
  #rec .cap { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px;
    background: rgba(15,23,42,.92); color: #fff; padding: 11px 20px 11px 12px; border-radius: 999px; font-size: 19px; font-weight: 500;
    box-shadow: 0 12px 40px rgba(0,0,0,.35); white-space: nowrap; transition: opacity .3s; }
  #rec .cap b { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #06b6d4); font-size: 15px; }
  #rec .cap:empty { opacity: 0; }
  #rec .dot { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
    background: rgba(99,102,241,.35); border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); transition: left .04s linear, top .04s linear; }
  #rec .ripple { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid #6366f1;
    animation: rip .55s ease-out forwards; }
  @keyframes rip { to { transform: scale(4.5); opacity: 0; } }
  #rec .card { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(15,23,42,.9);
    opacity: 0; transition: opacity .45s; }
  #rec .card.on { opacity: 1; }
  #rec .panel { max-width: 1040px; width: 88%; color: #e2e8f0; }
  #rec .title { text-align: center; color: #fff; }
  #rec .title h1 { font-size: 72px; margin: 0; letter-spacing: -.03em;
    background: linear-gradient(135deg, #a5b4fc, #67e8f9); -webkit-background-clip: text; color: transparent; }
  #rec .title p { font-size: 26px; margin: 10px 0 26px; color: #e2e8f0; }
  #rec code.cmd { font: 24px ui-monospace, Menlo, monospace; background: #0b1020; border: 1px solid #334155; color: #a5f3fc;
    padding: 12px 22px; border-radius: 12px; display: inline-block; }
  #rec .term { background: #0b1020; border: 1px solid #334155; border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; }
  #rec .term .bar { display: flex; gap: 7px; padding: 11px 14px; background: #111827; }
  #rec .term .bar i { width: 12px; height: 12px; border-radius: 50%; background: #ef4444; } #rec .term .bar i:nth-child(2) { background: #f59e0b; } #rec .term .bar i:nth-child(3) { background: #22c55e; }
  #rec .term .bar span { color: #94a3b8; font: 13px ui-monospace, monospace; margin-left: 10px; }
  #rec .term pre { margin: 0; padding: 16px 20px 20px; font: 15px/1.55 ui-monospace, Menlo, monospace; white-space: pre; overflow: hidden; color: #cbd5e1; }
  #rec .term .p { color: #a5f3fc; } #rec .term .add { color: #86efac; } #rec .term .del { color: #fca5a5; }
  #rec .head { font-size: 30px; font-weight: 700; color: #fff; margin: 0 0 16px; }
  `;
  const make = () => {
    if (document.getElementById("rec")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const r = document.createElement("div");
    r.id = "rec";
    r.innerHTML =
      '<div class="cap"></div><div class="dot" style="left:-40px;top:-40px"></div><div class="card"></div>';
    document.documentElement.appendChild(r);
    const dot = r.querySelector(".dot");
    addEventListener(
      "mousemove",
      (e) => {
        dot.style.left = e.clientX + "px";
        dot.style.top = e.clientY + "px";
      },
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        const p = document.createElement("div");
        p.className = "ripple";
        p.style.left = e.clientX + "px";
        p.style.top = e.clientY + "px";
        r.appendChild(p);
        setTimeout(() => p.remove(), 600);
      },
      true,
    );
    const saved = sessionStorage.getItem("rec-cap");
    if (saved) r.querySelector(".cap").innerHTML = saved;
  };
  window.__rec = {
    cap(n, text) {
      make();
      const html = text ? `<b>${n}</b>${text}` : "";
      sessionStorage.setItem("rec-cap", html);
      document.querySelector("#rec .cap").innerHTML = html;
    },
    card(html) {
      make();
      const o = document.querySelector("htmledit-overlay");
      clearTimeout(window.__recShow);
      if (o) o.style.visibility = "hidden"; // editor UI stays behind the card
      const c = document.querySelector("#rec .card");
      c.innerHTML = html;
      requestAnimationFrame(() => c.classList.add("on"));
    },
    hide() {
      const c = document.querySelector("#rec .card");
      if (c) c.classList.remove("on");
      const o = document.querySelector("htmledit-overlay");
      if (o) window.__recShow = setTimeout(() => (o.style.visibility = ""), 450);
    },
  };
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", make);
  else make();
}

const esc = (s) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hotedit-tour-"));
  const file = path.join(dir, "aurora_report.html");
  fs.copyFileSync(path.join(__dirname, "showcase.html"), file);
  const orig = fs.readFileSync(file, "utf8");
  fs.writeFileSync(path.join(dir, "orig.html"), orig);
  const srv = await start(file);
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ channel: "chrome" }));
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.addInitScript(recLayer);
  page.on("pageerror", (e) => console.log("pageerror:", e.message));

  // Frame capture loop → ffmpeg.
  const frames = path.join(dir, "frames");
  fs.mkdirSync(frames);
  let n = 0,
    recording = false;
  const t0 = { v: 0 };
  const stamps = []; // capture time of each frame, for true frame durations
  const capture = (async () => {
    while (!recording) await new Promise((r) => setTimeout(r, 20));
    t0.v = Date.now();
    while (recording) {
      const buf = await page
        .screenshot({ type: "jpeg", quality: 88 })
        .catch(() => null);
      if (buf) {
        fs.writeFileSync(path.join(frames, String(n++).padStart(5, "0") + ".jpg"), buf);
        stamps.push(Date.now());
      }
    }
  })();

  const pause = (ms) => page.waitForTimeout(ms);
  const ui = (s) => page.locator(`htmledit-overlay ${s}`);
  const cap = (num, text) =>
    page.evaluate(([a, b]) => window.__rec.cap(a, b), [num, text]);
  const card = (html) => page.evaluate((h) => window.__rec.card(h), html);
  const hide = () => page.evaluate(() => window.__rec.hide());
  const ready = () =>
    page.waitForFunction(() => window.__htmledit && window.__rec);
  const editing = () =>
    page.waitForFunction(
      () =>
        window.__htmledit.selected &&
        window.__htmledit.selected.isContentEditable,
      null,
      { timeout: 8000 },
    );
  const moveTo = (x, y, steps = 22) => page.mouse.move(x, y, { steps });
  const into = async (loc, opts = {}) => {
    // Page blocks scroll to the centre; panel controls scroll inside the panel.
    const inPanel = await loc.evaluate((e) => e.getRootNode() instanceof ShadowRoot);
    if (inPanel) await loc.scrollIntoViewIfNeeded();
    else
      await loc.evaluate((e) => {
        const r = e.getBoundingClientRect();
        if (r.top < 70 || r.bottom > innerHeight - 90)
          e.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    await pause(150);
    // Wait for smooth scrolling to settle before aiming.
    let b = await loc.boundingBox();
    for (let i = 0; i < 30; i++) {
      await pause(80);
      const c = await loc.boundingBox();
      if (c && b && Math.abs(c.y - b.y) < 0.5 && Math.abs(c.x - b.x) < 0.5) break;
      b = c;
    }
    const x = b.x + (opts.dx != null ? opts.dx : b.width / 2);
    const y = b.y + (opts.dy != null ? opts.dy : b.height / 2);
    await moveTo(x, y);
    return { x, y };
  };
  const click = async (loc, opts) => {
    const p = await into(loc, opts);
    await pause(200);
    await page.mouse.click(p.x, p.y);
  };
  const type = (t, delay = 55) => page.keyboard.type(t, { delay });
  const selectBlock = async (loc, opts) => {
    await click(loc, opts);
    await editing();
    await page.keyboard.press("Escape");
    await pause(250);
  };
  const ctl = (p) => ui(`.chartp .ctl[data-path='${JSON.stringify(p)}']`);
  const openSection = async (title) => {
    const s = ui(".chartp summary").filter({ hasText: title }).first();
    if (!(await s.evaluate((e) => e.parentElement.open))) await click(s);
  };

  process.on("unhandledRejection", async (e) => {
    console.log("FAILED:", e.message.split("\n")[0]);
    const st = await page.evaluate(() => document.querySelector("htmledit-overlay").shadowRoot.querySelector(".status").textContent).catch(() => "?");
    console.log("status:", st);
    await page.screenshot({ path: path.join(os.tmpdir(), "hotedit-tour-fail.png") }).catch(() => {});
    console.log("screenshot:", path.join(os.tmpdir(), "hotedit-tour-fail.png"));
    process.exit(1);
  });
  await page.goto(srv.url);
  await ready();
  await page.evaluate(() => localStorage.setItem("he-hint", "1"));
  await page.reload();
  await ready();
  await page.waitForFunction(
    () =>
      document.querySelector(".katex") &&
      document.querySelector("pre.mermaid svg") &&
      document.querySelector("#regions svg"),
    null,
    { timeout: 30000 },
  );
  await pause(800);

  // ── Title ────────────────────────────────────────────────────────────
  await card(
    `<div class="title"><h1>hotedit</h1><p>Edit any HTML report in your browser.<br>Every change is saved straight into the file.</p><code class="cmd">npx hotedit report.html</code></div>`,
  );
  recording = true;
  await pause(3200);
  await hide();
  await pause(900);

  // ── 1. Edit mode + text ──────────────────────────────────────────────
  await cap(1, "An AI wrote this report. Press ⌥E to edit it");
  await pause(1300);
  await click(ui(".edit"));
  await pause(700);
  await cap(1, "Click any text and type — the caret lands where you click");
  await click(page.locator(".hero h1"), { dx: 470 });
  await editing();
  await page.keyboard.press(MAC ? "Meta+ArrowRight" : "End");
  await type(" · approved", 75);
  await page.keyboard.press("Enter");
  await pause(700);
  await click(page.locator(".kpi b").nth(1), { dx: 40 });
  await editing();
  await page.keyboard.press(`${MOD}+a`);
  await type("63%", 120);
  await page.keyboard.press("Enter");
  await pause(1100);

  // ── 2. Style ─────────────────────────────────────────────────────────
  await cap(2, "Restyle any block: colours, spacing, corners, borders");
  await selectBlock(page.locator(".callout p").first(), { dx: 200 });
  await click(ui(".bb .kind")); // the callout box around the text
  await pause(400);
  await click(ui('.bb [data-act="style"]'));
  await pause(500);
  await click(ui('.sty [data-p="background-color"]'));
  await type("#ecfeff", 70);
  await click(ui('.sty [data-p="border"]'));
  await type("2px solid #06b6d4", 45);
  await click(ui('.sty [data-p="border-radius"]'));
  await type("16px", 70);
  await pause(600);
  await click(ui(".sty .apply"));
  await pause(1200);

  // ── 3. Plotly: form + data, live ─────────────────────────────────────
  await cap(3, "Click a chart: pick a type, colours, data — it redraws live");
  await click(page.locator("#trend"), { dx: 360, dy: 160 });
  await ui(".chartp").waitFor({ state: "visible" });
  await pause(600);
  for (const t of ["bar", "area", "line"]) {
    await click(ui(`.chartp .types [data-type="${t}"]`));
    await pause(t === "line" ? 600 : 1100);
  }
  await click(ui('.chartp [data-tab="form"]'));
  await pause(400);
  await openSection("Series 1");
  const mode = ctl(["1", "0", "mode"]).locator("select");
  await into(mode);
  await mode.selectOption({ label: "lines+markers" });
  await pause(900);
  await openSection("Series 3");
  const col = ctl(["1", "2", "line", "color"]).locator(
    "input:not([type=color])",
  );
  await click(col);
  await col.selectText();
  await type("#db2777", 80);
  await pause(1100);
  await click(ui(".chartp .apply"));
  await pause(1100);

  // ── 4. Chart.js + Vega-Lite ──────────────────────────────────────────
  await cap(4, "Chart.js, Vega-Lite and Mermaid work the same way");
  await click(page.locator("#ablation"), { dx: 160, dy: 120 });
  await ui(".chartp").waitFor({ state: "visible" });
  await click(ui('.chartp [data-tab="form"]'));
  await pause(400);
  await click(ui('.chartp .types [data-type="doughnut"]'));
  await pause(1200);
  await click(ui('.chartp .types [data-type="line"]'));
  await pause(1200);
  await click(ui(".chartp .apply"));
  await pause(800);
  await click(page.locator("#regions svg"), { dx: 200, dy: 120 });
  await ui(".chartp").waitFor({ state: "visible" });
  await click(ui('.chartp [data-tab="form"]'));
  await pause(300);
  const vc = ctl(["1", "mark", "color"]).locator("input:not([type=color])");
  await click(vc);
  await vc.selectText();
  await type("#f97316", 80);
  await pause(900);
  // Data tab: change a value and the bars re-sort live.
  await click(ui('.chartp [data-tab="data"]'));
  await pause(500);
  const cell = ui('.chartp table[data-table="0"] tr:nth-child(2) td:nth-child(3) input');
  await click(cell);
  await cell.selectText();
  await type("1.3", 160);
  await pause(1600);
  await click(ui(".chartp .apply"));
  await pause(900);

  // ── 5. Mermaid diagram ───────────────────────────────────────────────
  await click(page.locator("pre.mermaid"), { dx: 300, dy: 60 });
  await ui(".chartp").waitFor({ state: "visible" });
  const ta = ui(".chartp textarea");
  await click(ta, { dy: 40 });
  await page.keyboard.press(MAC ? "Meta+ArrowDown" : "Control+End");
  await type('\n  O --> D["dashboard"]', 60);
  await pause(1600);
  await click(ui(".chartp .apply"));
  await pause(900);

  // ── 6. Maths ─────────────────────────────────────────────────────────
  await cap(
    5,
    "Rendered maths and diagrams open as source — never saved as output",
  );
  await click(page.locator(".eq").first(), { dx: 300 });
  const src = ui(".src textarea");
  await src.waitFor({ state: "visible" });
  await pause(700);
  const at = (await src.inputValue()).indexOf("0.2$$");
  await src.evaluate((t, i) => {
    t.focus();
    t.setSelectionRange(i, i + 3);
  }, at);
  await pause(400);
  await type("0.25", 150);
  await pause(800);
  await Promise.all([page.waitForEvent("load"), click(ui(".src .save"))]);
  await ready();
  await page.waitForFunction(() => document.querySelector(".katex"), null, {
    timeout: 20000,
  });
  await page
    .locator(".eq")
    .first()
    .evaluate((e) => e.scrollIntoView({ block: "center" }));
  await pause(1500);

  // ── 7. Insert + drag ─────────────────────────────────────────────────
  await cap(6, "Add blocks with ＋ and drag ⠿ to re-arrange");
  await selectBlock(page.locator(".steps li").last(), { dx: 120 });
  await click(ui('.bb [data-act="insert"]'));
  await pause(700);
  await Promise.all([
    page.waitForEvent("load"),
    click(ui('.ins [data-ins="li"]')),
  ]);
  await ready();
  await editing();
  await pause(300);
  await type("Share the report with the forecasting team", 45);
  await page.keyboard.press(`${MOD}+s`);
  await pause(900);
  await selectBlock(page.locator(".steps li").last(), { dx: 120 });
  await into(ui(".bb .grip"));
  await page.mouse.down();
  const first = await page.locator(".steps li").first().boundingBox();
  await moveTo(first.x + 160, first.y + 3, 40);
  await pause(600);
  await Promise.all([page.waitForEvent("load"), page.mouse.up()]);
  await ready();
  await pause(1300);

  // ── 8. Ask AI about one block ────────────────────────────────────────
  // The AI is played by a stand-in (test/fixtures/fake-claude.js) so the
  // tour is repeatable; it edits through the same hotedit tools Claude uses.
  Object.assign(process.env, {
    HOTEDIT_CLAUDE_BIN: path.join(__dirname, "..", "test", "fixtures", "fake-claude.js"),
    FAKE_FIND: "Two coastal regions are still under-dispersed: intervals are 8% too narrow there.",
    FAKE_REPLACE: "Two coastal regions (Gulf, Pacific NW) need wider intervals: about 8% too narrow today.",
    FAKE_DELAY: "900",
  });
  await page.evaluate(() => window.__htmledit.api("POST", "/agent/config", { provider: "claude" }));
  await cap(7, "✨ Ask AI about one block: it changes only that, live, no reload");
  await selectBlock(page.locator(".callout.warn p"), { dx: 220 });
  await click(ui('.bb [data-act="ai"]'));
  await pause(700);
  await type("Name the two regions and make this clearer", 38);
  await pause(300);
  await click(ui(".agentp .go"));
  await page.waitForFunction(() => /Gulf/.test(document.querySelector(".callout.warn p").textContent), null, { timeout: 20000 });
  await pause(2600);
  await click(ui(".agentp .x"));
  await pause(600);

  // ── 9. The diff ──────────────────────────────────────────────────────
  await cap(0, "");
  let diff = "";
  try {
    execFileSync(
      "git",
      [
        "diff",
        "--no-index",
        "--color=never",
        "-U0",
        path.join(dir, "orig.html"),
        file,
      ],
      { encoding: "utf8" },
    );
  } catch (e) {
    diff = e.stdout || "";
  }
  const lines = diff.split("\n").filter((l) => /^[-+](?![-+]{2})/.test(l));
  const shown = lines.slice(0, 26).map((l) => {
    const t = esc(l.length > 118 ? l.slice(0, 117) + "…" : l);
    return l[0] === "+"
      ? `<span class="add">${t}</span>`
      : `<span class="del">${t}</span>`;
  });
  const changed = lines.filter((l) => l[0] === "+").length;
  await card(
    `<div class="panel"><p class="head">Every edit landed as a small patch in the original file</p><div class="term"><div class="bar"><i></i><i></i><i></i><span>git diff aurora_report.html · ${changed} of ${orig.split("\n").length} lines changed</span></div><pre>${shown.join("\n")}</pre></div></div>`,
  );
  await pause(6500);
  await hide();
  await pause(400);

  // ── End ──────────────────────────────────────────────────────────────
  await card(
    `<div class="title"><h1>hotedit</h1><p>Text · styles · layout · charts · maths · AI, live</p><code class="cmd">npx hotedit demo</code><p style="font-size:20px;margin-top:22px;color:#94a3b8">github.com/Thewhey-Brian/htmledit</p></div>`,
  );
  await pause(3800);

  recording = false;
  await capture;
  const secs = (Date.now() - t0.v) / 1000;
  const fps = (n / secs).toFixed(2);
  await ctx.close();
  await browser.close();
  await srv.stop();

  const mp4 = path.join(__dirname, "hotedit-tour.mp4");
  const gif = path.join(__dirname, "hotedit-demo.gif");
  // Each frame lasts until the next one was captured (screenshots are not evenly spaced).
  const list = path.join(frames, "list.txt");
  fs.writeFileSync(
    list,
    stamps.map((t, i) => `file '${String(i).padStart(5, "0")}.jpg'\nduration ${(((stamps[i + 1] || t + 40) - t) / 1000).toFixed(3)}\n`).join("") +
      `file '${String(stamps.length - 1).padStart(5, "0")}.jpg'\n`,
  );
  const input = ["-f", "concat", "-safe", "0", "-i", list];
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...input,
    "-vf",
    "fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-crf",
    "24",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...input,
    "-vf",
    "fps=9,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    gif,
  ]);
  const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1) + " MB";
  console.log(`frames: ${n} at ${fps} fps, ${secs.toFixed(0)} s`);
  console.log("mp4:", mp4, mb(mp4));
  console.log("gif:", gif, mb(gif));
  console.log(`diff: ${changed} changed lines`);
  fs.copyFileSync(file, path.join(os.tmpdir(), "hotedit-tour-after.html"));
})();
