// htmledit overlay: injected into the served page. Lives in a shadow root so
// page CSS can't touch it; never written to disk (the server patches source).
(() => {
  "use strict";
  const me = document.currentScript;
  const TOKEN = me.dataset.heToken;
  const VERSION = Number(me.dataset.heVersion);
  const ORIGIN = new URL(me.src).origin; // not the page's <base href>
  const CLIENT = Math.random().toString(36).slice(2);
  me.remove();

  const api = async (method, p, body) => {
    const r = await fetch(ORIGIN + "/__he/api" + p, {
      method,
      headers: { "Content-Type": "application/json", "X-HE-Token": TOKEN, "X-HE-Client": CLIENT },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || r.statusText);
    return j;
  };

  // ---------- UI shell ----------
  const host = document.createElement("htmledit-overlay");
  host.setAttribute("data-he-ui", "");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .bar, .bb { position: fixed; z-index: 2147483647; display: flex; gap: 4px; align-items: center;
    padding: 5px 6px; border-radius: 10px; background: rgba(24,24,27,.94); color: #fafafa;
    font: 13px/1.2 -apple-system, system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
  .bar { top: 12px; right: 12px; }
  .bb { display: none; padding: 3px 4px; border-radius: 8px; }
  button { all: unset; cursor: pointer; padding: 5px 9px; border-radius: 7px; background: #3f3f46;
    font: 13px/1.2 -apple-system, system-ui, sans-serif; color: #fafafa; }
  .bb button { padding: 4px 7px; background: transparent; }
  button:hover { background: #52525b; }
  button.on { background: #2563eb; }
  button:disabled { opacity: .4; cursor: default; }
  .status { color: #a1a1aa; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
  .box { position: fixed; pointer-events: none; z-index: 2147483646; border: 2px solid #2563eb;
    border-radius: 3px; background: rgba(37,99,235,.06); display: none; }
  .box.sel { border-color: #16a34a; background: transparent; }
  .tag { position: absolute; top: -19px; left: -2px; font: 11px/1 ui-monospace, monospace; color: #fff;
    background: #2563eb; padding: 3px 5px; border-radius: 3px 3px 0 0; white-space: nowrap; }
  .sel .tag { display: none; }
  .panel { position: fixed; z-index: 2147483647; background: #18181b; color: #fafafa; border-radius: 12px;
    padding: 12px; font: 13px -apple-system, system-ui, sans-serif; box-shadow: 0 12px 48px rgba(0,0,0,.4); display: none; }
  .src { left: 50%; top: 10vh; transform: translateX(-50%); width: min(820px, 92vw); }
  .sty { right: 12px; top: 60px; width: 290px; max-height: calc(100vh - 80px); overflow: auto; }
  textarea, input, select { width: 100%; background: #09090b; color: #e4e4e7; border: 1px solid #3f3f46;
    border-radius: 7px; padding: 6px 8px; font: 13px -apple-system, system-ui, sans-serif; }
  textarea { height: 50vh; font: 12px/1.45 ui-monospace, monospace; }
  input[type=color] { padding: 0 2px; height: 30px; width: 38px; flex: none; }
  .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
  .primary { background: #2563eb; }
  .msg { margin: 0 0 8px; color: #a1a1aa; }
  .grid { display: grid; grid-template-columns: 96px 1fr; gap: 6px 8px; align-items: center; }
  .grid label { color: #a1a1aa; font-size: 12px; }
  .pair { display: flex; gap: 6px; }
  h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
  .chartp { right: 12px; top: 60px; width: min(480px, 44vw); max-height: calc(100vh - 72px); overflow: auto; }
  .cmtp { right: 12px; top: 60px; width: 340px; }
  .ins { width: 312px; padding: 8px; }
  .ins .where { display: flex; gap: 4px; margin-bottom: 8px; }
  .ins .where button { flex: 1; text-align: center; padding: 4px 0; font-size: 12px; }
  .ins .items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .ins .items button { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 2px; background: #27272a; font-size: 11px; }
  .ins .items button:hover { background: #3f3f46; }
  .ins .ic { font: 600 15px/1.1 -apple-system, system-ui, sans-serif; height: 18px; }
  .cmtp textarea { height: 120px; font: 13px/1.4 -apple-system, system-ui, sans-serif; }
  .cmts { left: 12px; top: 60px; width: 340px; max-height: calc(100vh - 80px); overflow: auto; }
  .citem { border-top: 1px solid #27272a; padding: 8px 0; }
  .citem.focus { background: #1e293b; }
  .chead { font: 11px ui-monospace, monospace; color: #93c5fd; margin-bottom: 4px; }
  .citem .row { justify-content: flex-start; margin-top: 6px; }
  .citem .row button { padding: 3px 8px; font-size: 12px; }
  .pin { position: fixed; z-index: 2147483645; width: 22px; height: 22px; padding: 0; border-radius: 50% 50% 50% 0;
    background: #f59e0b; color: #111; font: 600 11px/22px -apple-system, sans-serif; text-align: center;
    box-shadow: 0 2px 6px rgba(0,0,0,.3); }
  .pin:hover { background: #fbbf24; }
  .chartp .grid { grid-template-columns: minmax(96px, 34%) 1fr; margin: 4px 0 6px; }
  .chartp .grid label { overflow-wrap: anywhere; }
  .chartp textarea { height: 52vh; }
  .tabs { display: flex; gap: 4px; margin: 0 0 8px; }
  .tabs button { padding: 4px 11px; font-size: 12px; }
  .chartp details { border-top: 1px solid #27272a; padding: 2px 0; }
  .chartp summary { cursor: pointer; font-weight: 600; font-size: 12px; padding: 6px 0; list-style: none; color: #e4e4e7; }
  .chartp summary::-webkit-details-marker { display: none; }
  .chartp summary::before { content: "▸ "; color: #71717a; }
  .chartp details[open] > summary::before { content: "▾ "; }
  .ctl { display: flex; gap: 6px; align-items: center; min-height: 30px; }
  .ctl input[type=checkbox] { width: 16px; height: 16px; margin: 0; accent-color: #2563eb; }
  .ctl input[type=range] { padding: 0; flex: 1; accent-color: #2563eb; }
  .ctl .val { width: 40px; color: #a1a1aa; font: 12px ui-monospace, monospace; text-align: right; }
  .ctl .code, .ctl .note { color: #a1a1aa; font-size: 12px; }
  .ctl .code { color: #fbbf24; font-family: ui-monospace, monospace; }
  .ctl .rst { padding: 2px 5px; background: transparent; color: #71717a; flex: none; }
  .ctl .rst:hover { color: #fafafa; }
  .dtw { max-height: 52vh; overflow: auto; margin: 4px 0 10px; }
  table.dt { border-collapse: collapse; width: 100%; font-size: 12px; }
  .dt th { color: #a1a1aa; font-weight: 500; text-align: left; padding: 3px 4px; position: sticky; top: 0; background: #18181b; }
  .dt td { padding: 1px 2px; }
  .dt td.n { color: #52525b; font: 11px ui-monospace, monospace; padding-right: 4px; }
  .dt input { padding: 3px 5px; font: 12px ui-monospace, monospace; min-width: 60px; border-radius: 5px; }
  .dt .del { padding: 2px 6px; background: transparent; color: #71717a; }
  .dt .del:hover { color: #f87171; }
  .dtitle { font-size: 12px; font-weight: 600; margin: 6px 0 2px; }
  .bb .grip { cursor: grab; font-size: 15px; padding: 3px 6px; color: #a1a1aa; }
  .bb .grip:hover { color: #fafafa; }
  .box.drag { border: 2px dashed #a1a1aa; background: rgba(161,161,170,.12); }
  .drop { position: fixed; z-index: 2147483647; display: none; pointer-events: none; background: #2563eb;
    border-radius: 2px; box-shadow: 0 0 0 2px rgba(37,99,235,.25); }
  .ghost { position: fixed; z-index: 2147483647; display: none; pointer-events: none; padding: 4px 9px; border-radius: 7px;
    background: #2563eb; color: #fff; font: 12px -apple-system, system-ui, sans-serif; white-space: nowrap; }
  .panel > .x { position: absolute; top: 8px; right: 8px; padding: 3px 8px; background: transparent; color: #a1a1aa; }
  .panel > .x:hover { color: #fafafa; background: #3f3f46; }
  .panel h4 { padding-right: 28px; }
  .bb .kind { font-size: 12px; color: #a1a1aa; padding: 4px 6px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bb .kind:hover { color: #fafafa; }
  .bb .kind:disabled { opacity: 1; }
  .menu { position: fixed; z-index: 2147483647; display: none; flex-direction: column; min-width: 160px; padding: 4px;
    border-radius: 10px; background: rgba(24,24,27,.97); box-shadow: 0 8px 28px rgba(0,0,0,.3); }
  .menu button { padding: 6px 10px; background: transparent; display: flex; gap: 8px; }
  .menu button span { width: 22px; text-align: center; color: #a1a1aa; }
  .menu button:hover { background: #3f3f46; }
  .menu .danger { color: #fca5a5; }
  .hint { position: fixed; z-index: 2147483646; top: 58px; right: 12px; width: 300px; padding: 12px 14px; border-radius: 12px;
    background: #18181b; color: #fafafa; font: 13px/1.45 -apple-system, system-ui, sans-serif; box-shadow: 0 12px 40px rgba(0,0,0,.35);
    display: none; pointer-events: none; }
  .hint ol { margin: 6px 0 6px 18px; padding: 0; }
  .hint kbd { font: 12px ui-monospace, monospace; background: #3f3f46; border-radius: 4px; padding: 0 5px; }
  .hint .ok { pointer-events: auto; float: right; margin-top: 4px; background: #2563eb; }
  .sty details { border-top: 1px solid #27272a; padding: 2px 0; }
  .sty summary { cursor: pointer; font-weight: 600; font-size: 12px; padding: 6px 0; list-style: none; }
  .sty summary::-webkit-details-marker { display: none; }
  .sty summary::before { content: "▸ "; color: #71717a; }
  .sty details[open] > summary::before { content: "▾ "; }
  .sty .grid { margin: 4px 0 6px; }
  .box { box-shadow: 0 0 0 1px rgba(255,255,255,.85), 0 0 0 3px rgba(0,0,0,.12); }
  .flash { position: fixed; pointer-events: none; z-index: 2147483645; border-radius: 6px; display: none;
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px #a855f7, 0 0 28px 8px rgba(168,85,247,.45); animation: heflash 1.8s ease-out forwards; }
  @keyframes heflash { 0% { opacity: 0 } 12% { opacity: 1 } 70% { opacity: 1 } 100% { opacity: 0 } }
  .aibtn { background: linear-gradient(135deg, #7c3aed, #2563eb); }
  .aibtn:hover { background: linear-gradient(135deg, #8b5cf6, #3b82f6); }
  .agentp { right: 12px; bottom: 12px; width: 360px; max-height: calc(100vh - 80px); overflow: auto; }
  .agentp textarea { height: 76px; font: 13px/1.4 -apple-system, system-ui, sans-serif; resize: vertical; }
  .agentp .scope { display: flex; gap: 6px; align-items: center; margin: 0 0 8px; color: #a1a1aa; font-size: 12px; }
  .agentp .scope .about { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agentp .scope button { padding: 3px 8px; font-size: 12px; }
  .agentp .row { flex-wrap: wrap; }
  .agentp .gear { margin-right: auto; background: transparent; color: #a1a1aa; padding: 5px 6px; }
  .agentp .gear:hover { color: #fafafa; }
  .agentp .log { margin-top: 10px; font-size: 12.5px; line-height: 1.45; display: none; border-top: 1px solid #27272a; padding-top: 8px; }
  .agentp .log .q { color: #a1a1aa; font-style: italic; margin-bottom: 4px; }
  .agentp .log .tool, .agentp .log .undo { color: #71717a; }
  .agentp .log .edit { color: #4ade80; }
  .agentp .log .error { color: #f87171; }
  .agentp .log .text { color: #e4e4e7; margin: 4px 0; white-space: pre-wrap; }
  .agentp .working::after { content: " ●"; animation: hedot 1s infinite; color: #a855f7; }
  @keyframes hedot { 50% { opacity: .2 } }
  .agentp .conn { display: none; }
  .agentp .opt { display: block; border: 1px solid #3f3f46; border-radius: 8px; padding: 8px 10px; margin: 0 0 8px; cursor: pointer; }
  .agentp .opt input { width: auto; margin: 0 6px 0 0; accent-color: #7c3aed; }
  .agentp .opt .d { float: right; font-size: 11px; color: #71717a; }
  .agentp .opt .d.ok { color: #4ade80; }
  .agentp .opt .msg { display: block; margin: 4px 0 0 22px; font-size: 12px; }
  .agentp .opt input[type=password], .agentp .opt input[type=text] { width: calc(100% - 22px); margin: 6px 0 0 22px; }
  .agentp code { font: 11.5px ui-monospace, monospace; background: #27272a; padding: 1px 4px; border-radius: 4px; }
</style>
<div class="box hov"><span class="tag"></span></div>
<div class="box sel"></div>
<div class="box drag"></div>
<div class="drop"></div>
<div class="flash"></div>
<div class="ghost"></div>
<div class="bar">
  <button class="edit" title="Turn editing on or off (E)">✎ Edit</button>
  <button class="undo" title="Undo the last saved change (⌘Z)">↶</button>
  <button class="redo" title="Redo (⇧⌘Z)">↷</button>
  <button class="aibtn" title="Ask AI to change the page — it edits live">✨ AI</button>
  <button class="cbtn" title="Notes for your AI agent">💬 0</button>
  <span class="status">hotedit</span>
</div>
<div class="hint">
  <b>Edit this page</b>
  <ol><li>Press <kbd>E</kbd> or click <b>✎ Edit</b></li><li>Click any text and type</li><li>Click a block for its toolbar: <b>＋</b> add, <b>Aa</b> style, drag <b>⠿</b> to move</li></ol>
  <span class="msg">Changes are saved into the file. ⌘Z undoes.</span>
  <button class="ok">Got it</button>
</div>
<div class="bb">
  <button class="grip" data-act="drag" title="Drag to move this block">⠿</button>
  <button class="kind" data-act="parent" title="Select the block around this one"></button>
  <button data-act="insert" title="Add something here (paragraph, list, table, image, chart…)">＋</button>
  <button data-act="style" title="Style: font, colour, spacing">Aa</button>
  <button data-act="image" title="Replace image">🖼</button>
  <button data-act="link" title="Change link">🔗</button>
  <button data-act="chart" title="Edit chart">📊</button>
  <button data-act="ai" title="Ask AI to change this (or leave a note)">✨</button>
  <button data-act="more" title="More: move, duplicate, hide, delete, HTML">⋯</button>
</div>
<div class="menu more">
  <button data-act="up"><span>↑</span>Move up</button>
  <button data-act="down"><span>↓</span>Move down</button>
  <button data-act="duplicate"><span>⧉</span>Duplicate</button>
  <button data-act="hide"><span>◐</span>Hide / show</button>
  <button data-act="source"><span>&lt;/&gt;</span>Edit HTML</button>
  <button data-act="remove" class="danger"><span>🗑</span>Delete</button>
</div>
<input class="file" type="file" accept="image/*" style="display:none">
<div class="panel src">
  <h4>Edit</h4>
  <p class="msg"></p>
  <textarea spellcheck="false"></textarea>
  <input class="line" type="text">
  <div class="row"><button class="cancel">Cancel</button><button class="primary save">Save</button></div>
</div>
<div class="panel chartp">
  <h4></h4>
  <div class="tabs"><button data-tab="form">Chart</button><button data-tab="data">Data</button><button data-tab="code">Code</button></div>
  <p class="msg"></p>
  <div class="tab form"></div>
  <div class="tab data"></div>
  <div class="tab code"><p class="msg spec-label">Full spec</p><textarea spellcheck="false"></textarea></div>
  <div class="row"><button class="cancel">Cancel</button><button class="primary apply">Apply</button></div>
</div>
<div class="panel ins">
  <h4>Add</h4>
  <div class="where"><button data-w="before">Above</button><button data-w="after">Below</button><button data-w="inside">Inside</button></div>
  <div class="items"></div>
</div>
<div class="panel cmtp">
  <h4>Note for your AI agent</h4>
  <p class="msg"></p>
  <textarea spellcheck="true" placeholder="What should the agent change here?"></textarea>
  <div class="row"><button class="cancel">Cancel</button><button class="primary save">Save note</button></div>
</div>
<div class="panel cmts">
  <h4>Notes for your AI agent</h4>
  <div class="list"></div>
  <div class="row"><button class="close">Close</button><button class="primary copy">Copy for agent</button></div>
</div>
<div class="panel agentp">
  <button class="x" title="Close">✕</button>
  <h4>✨ Ask AI</h4>
  <div class="ask">
    <div class="scope"><span class="about"></span><button class="whole" title="Ask about the whole page instead">Whole page</button></div>
    <textarea spellcheck="true" placeholder="What should change? e.g. “Make this shorter and friendlier”, “Turn the bars orange”, “Add a row for March”"></textarea>
    <div class="row"><button class="gear" title="Choose how hotedit reaches Claude">⚙ Connect</button><button class="tonote" title="Save it as a note for later instead">Leave as note</button><button class="primary go" title="⌘Enter">Do it</button></div>
  </div>
  <div class="log"></div>
  <div class="row after"><button class="undoai">↶ Undo AI changes</button><button class="stop">■ Stop</button></div>
  <div class="conn">
    <p class="msg">How should hotedit reach Claude? The AI edits this page live and every change can be undone.</p>
    <label class="opt"><input type="radio" name="he-prov" value="claude"><b>Claude login</b><span class="d" data-d="claude"></span>
      <span class="msg">Uses your Claude plan through Claude Code. Install it from <code>claude.com/code</code>, run <code>claude</code> once and log in.</span></label>
    <label class="opt"><input type="radio" name="he-prov" value="api"><b>Anthropic API key</b><span class="d" data-d="api"></span>
      <span class="msg">Pay per use. Saved only on this computer (<code>~/.htmledit/config.json</code>), or set <code>ANTHROPIC_API_KEY</code>.</span>
      <input class="key" type="password" placeholder="sk-ant-…" autocomplete="off"></label>
    <input class="model" type="text" placeholder="Model (optional; e.g. claude-opus-5-5)">
    <div class="row"><button class="back">Back</button><button class="primary savec">Save</button></div>
  </div>
</div>
<div class="panel sty">
  <h4>Style <span class="msg sty-tag"></span></h4>
  <details open><summary>Text</summary><div class="grid">
    <label>size</label><input data-p="font-size" list="he-sizes">
    <label>weight</label><select data-p="font-weight"><option value="">default</option><option value="400">Normal</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select>
    <label>italic</label><select data-p="font-style"><option value="">default</option><option value="normal">No</option><option value="italic">Yes</option></select>
    <label>colour</label><div class="pair"><input type="color" data-c="color"><input data-p="color"></div>
    <label>align</label><select data-p="text-align"><option value="">default</option><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option><option value="justify">Justify</option></select>
    <label>font</label><input data-p="font-family" list="he-fonts">
    <label>line spacing</label><input data-p="line-height">
  </div></details>
  <details open><summary>Box</summary><div class="grid">
    <label>background</label><div class="pair"><input type="color" data-c="background-color"><input data-p="background-color"></div>
    <label>inner space</label><input data-p="padding" title="padding">
    <label>outer space</label><input data-p="margin" title="margin">
    <label>width</label><input data-p="width">
    <label>max width</label><input data-p="max-width">
    <label>round corners</label><input data-p="border-radius">
    <label>border</label><input data-p="border" placeholder="e.g. 1px solid #ddd">
  </div></details>
  <details><summary>Other CSS</summary><div class="grid">
    <label>CSS</label><input data-p="*" placeholder="prop: value; …">
  </div></details>
  <datalist id="he-sizes"><option>12px</option><option>14px</option><option>16px</option><option>18px</option><option>20px</option><option>24px</option><option>28px</option><option>32px</option><option>40px</option><option>48px</option></datalist>
  <datalist id="he-fonts"><option>system-ui, sans-serif</option><option>Georgia, serif</option><option>ui-monospace, monospace</option><option>Inter, sans-serif</option></datalist>
  <div class="row"><button class="reset">Clear all</button><button class="cancel">Cancel</button><button class="primary apply">Apply</button></div>
</div>`;
  const $ = (s) => root.querySelector(s);
  const hov = $(".hov"),
    hovTag = $(".hov .tag"),
    selBox = $(".sel"),
    status = $(".status");
  const editBtn = $(".edit"),
    bb = $(".bb");
  const src = $(".src"),
    srcTa = $(".src textarea"),
    srcIn = $(".src .line");
  const sty = $(".sty");

  const revealHidden = document.createElement("style");
  revealHidden.textContent =
    "[hidden][data-he]{display:block!important;opacity:.35;outline:2px dashed #f59e0b}" +
    "body [data-he]{cursor:text}[data-he][contenteditable]{caret-color:#2563eb;outline:none}" +
    "body img[data-he],body svg[data-he],body canvas[data-he],body .js-plotly-plot{cursor:pointer}";

  // The caret takes the block's text colour, or black/white against its
  // background when the text colour wouldn't show (e.g. gradient text).
  const caretStyle = document.createElement("style");
  const rgba = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
      const stops = [...(cs.backgroundImage || "").matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter((x) => x && x.a > 0.3);
      if (stops.length) {
        const n = stops.length;
        return stops.reduce((a, x) => ({ r: a.r + x.r / n, g: a.g + x.g / n, b: a.b + x.b / n, a: 1 }), { r: 0, g: 0, b: 0, a: 1 });
      }
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const caretFor = (el) => {
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    const fill = rgba(cs.webkitTextFillColor);
    const text = fill && fill.a < 0.5 ? fill : rgba(cs.color);
    if (text && text.a >= 0.6) {
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      if ((hi + 0.05) / (lo + 0.05) >= 3) return `rgb(${text.r}, ${text.g}, ${text.b})`;
    }
    return lum(bg) > 0.35 ? "#111827" : "#ffffff";
  };

  let editMode = sessionStorage.getItem("he-edit") === "1";
  let hover = null;
  let selected = null; // element with a block bar
  let editing = null; // { el, id, before } while contenteditable
  let modal = null; // { save, cancel } of an open panel
  let stale = false; // disk changed while the user was mid-edit

  const say = (t, bad) => {
    status.textContent = t;
    status.style.color = bad ? "#f87171" : "#a1a1aa";
  };
  const isUi = (n) => n && (n === host || host.contains(n));
  const idOf = (el) =>
    el && el.getAttribute ? el.getAttribute("data-he") : null;
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const refreshState = async () => {
    try {
      const s = await api("GET", "/state");
      $(".undo").disabled = !s.undo;
      $(".redo").disabled = !s.redo;
    } catch (e) {
      say(e.message, true);
    }
  };

  // `sel`: id to select after reload (null = none, undefined = current).
  const reload = (sel) => {
    sessionStorage.setItem("he-scroll", String(window.scrollY));
    const keep = sel === undefined ? selected && idOf(selected) : sel;
    if (keep != null) sessionStorage.setItem("he-sel", String(keep));
    location.reload();
  };

  // ---------- picking & boxes ----------
  const SVG_TEXT = new Set(["text", "tspan", "textPath"]);
  const pick = (t) => {
    let el = t && t.nodeType === 1 ? t : t && t.parentElement;
    el = el && el.closest("[data-he]");
    if (!el || el === document.documentElement || el === document.body)
      return null;
    if (el instanceof SVGElement) {
      const txt = el.closest("text");
      return txt && txt.hasAttribute("data-he")
        ? txt
        : el.closest("svg[data-he]") || el;
    }
    // Climb out of inline formatting to the enclosing text block.
    while (
      el.parentElement &&
      el.parentElement !== document.body &&
      el.parentElement.hasAttribute("data-he") &&
      getComputedStyle(el).display.startsWith("inline") &&
      !/^(A|BUTTON|IMG|CANVAS|VIDEO|IFRAME)$/.test(el.tagName)
    ) {
      el = el.parentElement;
    }
    return el;
  };

  const NAMES = {
    P: "Paragraph", H1: "Title", H2: "Heading", H3: "Subheading", H4: "Heading", H5: "Heading", H6: "Heading",
    LI: "List item", UL: "List", OL: "List", DL: "List", TABLE: "Table", TR: "Table row", TD: "Cell", TH: "Header cell",
    THEAD: "Table", TBODY: "Table", IMG: "Image", A: "Link", BLOCKQUOTE: "Quote", PRE: "Code", CODE: "Code",
    FIGURE: "Figure", FIGCAPTION: "Caption", BUTTON: "Button", SECTION: "Section", ARTICLE: "Article", HEADER: "Header",
    FOOTER: "Footer", NAV: "Menu", ASIDE: "Sidebar", MAIN: "Main", DIV: "Box", SPAN: "Text", HR: "Divider",
    DETAILS: "Details", SUMMARY: "Summary", CANVAS: "Chart", svg: "Graphic", text: "Label", VIDEO: "Video", IFRAME: "Embed",
  };
  const nameOf = (el) => (chartAt(el) ? "Chart" : NAMES[el.tagName] || el.tagName.toLowerCase());
  const placeBox = (box, el) => {
    if (!el || !el.isConnected) {
      box.style.display = "none";
      return null;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      left: r.left - 2 + "px",
      top: r.top - 2 + "px",
      width: r.width + 4 + "px",
      height: r.height + 4 + "px",
    });
    return r;
  };
  const showHover = (el) => {
    placeBox(hov, el);
    if (el) hovTag.textContent = nameOf(el);
  };
  const showSelected = () => {
    const r = placeBox(selBox, selected);
    if (!r) {
      bb.style.display = "none";
      return;
    }
    const tag = selected.tagName.toLowerCase();
    const outer = selected.parentElement && selected.parentElement.closest("[data-he]");
    const kind = bb.querySelector(".kind");
    const hasOuter = outer && outer !== document.body && outer !== document.documentElement;
    kind.textContent = nameOf(selected) + (hasOuter ? " ▴" : "");
    kind.title = hasOuter ? `Select the ${nameOf(outer).toLowerCase()} around this` : "";
    kind.disabled = !hasOuter;
    bb.querySelector('[data-act="image"]').style.display =
      tag === "img" ? "" : "none";
    bb.querySelector('[data-act="chart"]').style.display = chartAt(selected) ? "" : "none";
    bb.querySelector('[data-act="link"]').style.display =
      tag === "a" || selected.closest("a[data-he]") ? "" : "none";
    bb.style.display = "flex";
    const h = bb.offsetHeight || 30;
    const w = bb.offsetWidth || 300;
    // Above the block when there is room; otherwise inside its top-right
    // corner, so the bar never covers neighbouring content.
    const above = r.top - h - 6 >= 4;
    const top = above ? r.top - h - 6 : Math.max(4, Math.min(r.top + 4, innerHeight - h - 4));
    const left = above ? r.left : r.right - w - 4;
    bb.style.top = top + "px";
    bb.style.left = Math.max(4, Math.min(left, innerWidth - w - 8)) + "px";
  };
  const select = (el) => {
    selected = el;
    hideMenu();
    showSelected();
    // An open ✨ panel follows the selection (unless the AI is mid-request).
    if (el && ag.style.display === "block" && !(agJob && agJob.status === "running")) {
      agTarget = el;
      agScope();
    }
  };
  // "⋯" menu: the less frequent block actions, with words.
  const menu = $(".menu.more");
  const hideMenu = () => (menu.style.display = "none");
  const toggleMenu = () => {
    if (menu.style.display === "flex") return hideMenu();
    menu.style.display = "flex";
    const r = bb.querySelector('[data-act="more"]').getBoundingClientRect();
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    menu.style.left = Math.max(4, Math.min(r.right - w, innerWidth - w - 4)) + "px";
    menu.style.top = (r.bottom + 4 + h < innerHeight ? r.bottom + 4 : Math.max(4, r.top - h - 4)) + "px";
  };

  // ---------- text editing ----------
  const domMatchesSource = (el, sig) => {
    if (el.textContent !== sig.text) return false;
    const ids = [];
    for (const d of el.querySelectorAll("*")) {
      if (isUi(d)) continue;
      const id = idOf(d);
      // Parser-implied wrappers have no source tag; anything else without
      // an id was created by a page script.
      if (id == null && /^(TBODY|COLGROUP)$/.test(d.tagName)) continue;
      if (id == null) return false;
      ids.push(Number(id));
    }
    return (
      ids.length === sig.ids.length && ids.every((v, i) => v === sig.ids[i])
    );
  };

  const sigOf = (el) => api("GET", "/node?id=" + Number(idOf(el)));

  // Caret where the user clicked (or keep a drag selection), so typing
  // starts right there instead of at the start of the block.
  let clickAt = null;
  const placeCaret = (el, selectAll) => {
    const sel = window.getSelection();
    let r = null;
    if (selectAll) {
      r = document.createRange();
      r.selectNodeContents(el);
    } else if (sel.rangeCount && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return;
    } else if (clickAt) {
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(clickAt.x, clickAt.y);
        if (p && p.offsetNode) {
          r = document.createRange();
          r.setStart(p.offsetNode, p.offset);
        }
      } else if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(clickAt.x, clickAt.y);
    }
    if (!r || !el.contains(r.startContainer)) {
      r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
    } else if (!selectAll) r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  const begin = async (el, opts = {}) => {
    const point = clickAt;
    if (hint.style.display === "block") hintDone(); // they found their way in
    select(el);
    const chart = chartAt(el);
    if (chart) return openChart(chart, el);
    const id = Number(idOf(el));
    let sig;
    try {
      sig = await sigOf(el);
    } catch (e) {
      return say(e.message, true);
    }
    if (el instanceof SVGElement) {
      if (SVG_TEXT.has(sig.tag) && sig.ids.length === 0)
        return openLine(
          el,
          "Edit label:",
          sig.text,
          (v) => [{ id, html: escapeHtml(v) }],
          () => (el.textContent = srcIn.value),
        );
      return say("Graphic — use ⋯ → Edit HTML to change it");
    }
    if (/^(img|br|hr|input|iframe|video|canvas|script|style)$/.test(sig.tag))
      return say(`<${sig.tag}> selected`);
    if (!domMatchesSource(el, sig)) {
      return openSource(
        el,
        sig,
        "This block was rewritten by a page script (math, diagram, widget…). Edit its HTML source:",
      );
    }
    editing = { el, id, before: el.innerHTML, fresh: !!opts.fresh };
    caretStyle.textContent = `[data-he="${id}"][contenteditable]{caret-color:${caretFor(el)}!important}`;
    document.head.appendChild(caretStyle);
    el.setAttribute("contenteditable", "true");
    el.focus();
    clickAt = point;
    placeCaret(el, opts.selectAll);
    clickAt = null;
    say("Typing — Enter saves · Esc cancels");
  };

  const caretAtEnd = (el) => {
    const s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setStart(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
    return r.toString().length === 0;
  };

  const finish = async (save) => {
    if (!editing) return;
    const { el, id, before } = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    caretStyle.remove();
    if (!save || el.innerHTML === before) {
      el.innerHTML = before;
      if (stale) return reload();
      return say("No change");
    }
    await commit("/edit", { edits: [{ id, html: el.innerHTML }] }, () => {
      el.innerHTML = before;
    });
  };

  const commit = async (p, body, onFail) => {
    say("Saving…");
    try {
      const r = await api("POST", p, { ...body, version: VERSION });
      if (r.stale) {
        say("file changed on disk — reloading", true);
        setTimeout(reload, 600);
        return r;
      }
      if (r.reload) {
        reload(p === "/op" ? (r.select ?? null) : undefined);
        return r;
      }
      say(r.changed ? "Saved ✓" : "No change");
      if (r.changed && hint.style.display === "block") hintDone();
      refreshState();
      showSelected();
      return r;
    } catch (e) {
      if (onFail) onFail();
      say("save failed: " + e.message, true);
      return null;
    }
  };
  const op = (body, onFail) => commit("/op", body, onFail);

  // ---------- panels ----------
  const openPanel = (panel, save, cancel) => {
    closePanel();
    panel.style.display = "block";
    modal = { panel, save, cancel };
  };
  const closePanel = (saved) => {
    if (!modal) return;
    const m = modal;
    modal = null;
    m.panel.style.display = "none";
    if (!saved && m.cancel) m.cancel();
    if (stale && !saved) reload();
  };
  const openSource = (el, sig, msg) => {
    $(".src .msg").textContent = msg;
    srcTa.style.display = "block";
    srcIn.style.display = "none";
    srcTa.value = sig.inner;
    // Fit the box to the source: a one-line equation gets a small box.
    const lines = sig.inner.split("\n").length + Math.floor(sig.inner.length / 110);
    srcTa.style.height = `calc(${Math.min(Math.max(lines + 1, 4), 26) * 1.45}em + 14px)`;
    openPanel(src, async () => {
      const r = await commit("/edit", { edits: [{ id: sig.id, source: srcTa.value }] });
      // The page shows the old render (or old HTML) until it reloads.
      if (r && r.changed && !r.reload && !r.stale) reload();
    });
    srcTa.focus();
  };
  const openLine = (el, msg, value, edits, after) => {
    $(".src .msg").textContent = msg;
    srcTa.style.display = "none";
    srcIn.style.display = "block";
    srcIn.value = value;
    openPanel(src, async () => {
      const r = await commit("/edit", { edits: edits(srcIn.value) });
      if (r && after) after();
    });
    srcIn.focus();
    srcIn.select();
  };
  root.querySelectorAll(".save, .apply").forEach((b) =>
    b.addEventListener("click", () => {
      const m = modal;
      if (!m) return;
      closePanel(true);
      m.save();
    }),
  );
  root
    .querySelectorAll(".cancel")
    .forEach((b) => b.addEventListener("click", () => closePanel()));
  for (const p of root.querySelectorAll(".panel")) {
    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "✕";
    x.title = "Close (Esc)";
    x.onclick = () => (modal && modal.panel === p ? closePanel() : (p.style.display = "none"));
    p.appendChild(x);
  }
  root.addEventListener("keydown", (e) => {
    if (!modal) return;
    e.stopPropagation();
    if (e.key === "Escape") closePanel();
    const isLine =
      e.target === srcIn ||
      (modal.panel === sty && e.target.tagName === "INPUT");
    const mod = e.metaKey || e.ctrlKey;
    if ((e.key === "Enter" && (isLine || mod)) || (e.key === "s" && mod)) {
      e.preventDefault();
      const m = modal;
      closePanel(true);
      m.save();
    }
  });

  // Style panel: prefilled from the SOURCE style attribute, previews live,
  // sends only changed properties so runtime styles never reach the file.
  const splitDecls = (css) =>
    css
      .split(/;(?![^(]*\))/)
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [
        d.slice(0, d.indexOf(":")).trim().toLowerCase(),
        d.slice(d.indexOf(":") + 1).trim(),
      ]);
  const toHex = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m
      ? "#" +
          m
            .slice(1, 4)
            .map((x) => (+x).toString(16).padStart(2, "0"))
            .join("")
      : "#000000";
  };
  const openStyle = async (el) => {
    const sig = await sigOf(el);
    const srcDecls = new Map(splitDecls(sig.attrs.style || ""));
    const known = new Set(
      [...sty.querySelectorAll("[data-p]")].map((i) => i.dataset.p),
    );
    const cs = getComputedStyle(el);
    const before = el.getAttribute("style");
    $(".sty-tag").textContent = "· " + nameOf(el);
    for (const inp of sty.querySelectorAll("[data-p]")) {
      const p = inp.dataset.p;
      if (p === "*")
        inp.value = [...srcDecls]
          .filter(([k]) => !known.has(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
      else {
        inp.value = srcDecls.get(p) || "";
        if (inp.tagName === "INPUT") inp.placeholder = cs.getPropertyValue(p);
      }
    }
    for (const c of sty.querySelectorAll("[data-c]"))
      c.value = toHex(
        srcDecls.get(c.dataset.c) || cs.getPropertyValue(c.dataset.c),
      );
    const collect = () => {
      const want = new Map();
      for (const inp of sty.querySelectorAll("[data-p]")) {
        if (inp.dataset.p === "*")
          for (const [k, v] of splitDecls(inp.value)) want.set(k, v);
        else want.set(inp.dataset.p, inp.value.trim());
      }
      const props = {};
      for (const [k, v] of want)
        if ((srcDecls.get(k) || "") !== v) props[k] = v || null;
      for (const [k] of srcDecls) if (!want.has(k)) props[k] = null;
      return props;
    };
    const preview = () => {
      for (const [k, v] of Object.entries(collect()))
        el.style.setProperty(k, v || "");
      showSelected();
    };
    sty.oninput = (e) => {
      if (e.target.dataset.c)
        sty.querySelector(`[data-p="${e.target.dataset.c}"]`).value =
          e.target.value;
      const sw = e.target.dataset.p && sty.querySelector(`[data-c="${e.target.dataset.p}"]`);
      if (sw && /^#[0-9a-f]{6}$/i.test(e.target.value.trim())) sw.value = e.target.value.trim();
      preview();
    };
    sty.onchange = preview;
    $(".reset").onclick = () => {
      for (const inp of sty.querySelectorAll("[data-p]")) inp.value = "";
      preview();
    };
    const restore = () => {
      if (before == null) el.removeAttribute("style");
      else el.setAttribute("style", before);
      showSelected();
    };
    openPanel(
      sty,
      () => {
        const props = collect();
        if (!Object.keys(props).length) return say("no change");
        op({ op: "style", id: Number(idOf(el)), props }, restore);
      },
      restore,
    );
  };

  const pickImage = (el) =>
    new Promise((resolve) => {
      const f = $(".file");
      f.value = "";
      f.onchange = () => resolve(f.files[0]);
      f.click();
    }).then(async (file) => {
      if (!file) return;
      const dataUrl = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(file);
      });
      const sig = await sigOf(el);
      // Self-contained reports keep images inline; others get a sibling file.
      let value = dataUrl;
      if (!(sig.attrs.src || "").startsWith("data:")) {
        const a = await api("POST", "/asset", {
          name: file.name,
          data: dataUrl.split(",")[1],
        });
        value = a.path;
      }
      const r = await op({
        op: "attr",
        id: Number(idOf(el)),
        name: "src",
        value,
      });
      if (r && !r.stale) {
        el.removeAttribute("srcset");
        el.src = value;
      }
    });

  const actions = {
    parent: () => {
      const p =
        selected.parentElement && selected.parentElement.closest("[data-he]");
      if (p && p !== document.body && p !== document.documentElement) select(p);
    },
    style: () => openStyle(selected),
    insert: () => openInsert(selected),
    up: () => op({ op: "move", id: Number(idOf(selected)), dir: -1 }),
    down: () => op({ op: "move", id: Number(idOf(selected)), dir: 1 }),
    duplicate: () => op({ op: "duplicate", id: Number(idOf(selected)) }),
    remove: () => op({ op: "remove", id: Number(idOf(selected)) }),
    hide: async () => {
      const el = selected;
      const on = !el.hasAttribute("hidden");
      const r = await op({
        op: "attr",
        id: Number(idOf(el)),
        name: "hidden",
        value: on ? true : null,
      });
      if (r && !r.stale) el.toggleAttribute("hidden", on);
      showSelected();
    },
    image: () => pickImage(selected),
    link: async () => {
      const a = selected.closest("a[data-he]");
      const sig = await sigOf(a);
      const id = sig.id;
      $(".src .msg").textContent = "Link URL:";
      srcTa.style.display = "none";
      srcIn.style.display = "block";
      srcIn.value = sig.attrs.href || "";
      openPanel(src, async () => {
        const r = await op({
          op: "attr",
          id,
          name: "href",
          value: srcIn.value,
        });
        if (r && !r.stale) a.setAttribute("href", srcIn.value);
      });
      srcIn.focus();
    },
    comment: () => addComment(selected),
    ai: () => openAgent(selected),
    chart: () => {
      const c = chartAt(selected);
      if (c) openChart(c, selected);
    },
    source: async () =>
      openSource(
        selected,
        await sigOf(selected),
        `Edit the HTML inside <${selected.tagName.toLowerCase()}>:`,
      ),
  };
  const onAct = async (e) => {
    const b = e.target.closest("button");
    if (!b || !selected) return;
    if (b.dataset.act === "more") return toggleMenu();
    if (b.dataset.act === "drag") return say("Hold ⠿ and drag the block to its new spot");
    hideMenu();
    if (editing) await finish(true);
    if (
      b.dataset.act === "remove" ||
      b.dataset.act === "duplicate" ||
      b.dataset.act === "up" ||
      b.dataset.act === "down"
    ) {
      if (stale) return reload();
    }
    actions[b.dataset.act]();
  };
  bb.addEventListener("click", onAct);
  menu.addEventListener("click", onAct);
  menu.addEventListener("mousedown", (e) => e.preventDefault());
  // Keep focus in the edited element when pressing toolbar buttons.
  // Remember selected text now: finishing a pending text edit can reset it.
  let barQuote = "";
  bb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.target.closest(".grip") && selected && e.button === 0) return startDrag(selected, e);
    const sel = window.getSelection();
    barQuote = selected && sel && sel.anchorNode && selected.contains(sel.anchorNode) ? String(sel).trim() : "";
  });

  // ---------- charts (M4) ----------
  // Specs come from the SOURCE (server-parsed literals). Previews mutate the
  // live chart through the page's own library; saving patches the literals.
  let charts = [];
  const loadCharts = async () => {
    try {
      charts = await api("GET", "/charts");
    } catch (e) {
      charts = [];
    }
  };
  const chartEl = (c) => {
    if (c.kind === "mermaid") return document.querySelector(`[data-he="${c.element}"]`);
    const t = c.target;
    let el = null;
    try {
      el = t && (t.id ? document.getElementById(t.id) : document.querySelector(t.selector));
    } catch {}
    if (el && el.tagName !== "CANVAS" && c.kind === "chartjs") el = el.querySelector("canvas") || el;
    if (!el && c.kind === "chartjs" && window.Chart) {
      // Unresolvable target: match by order among Chart.js canvases.
      const canvases = [...document.querySelectorAll("canvas")].filter((x) => Chart.getChart(x));
      const k = charts.filter((x) => x.kind === "chartjs" && !x.target).indexOf(c);
      el = canvases[k] || null;
    }
    return el;
  };
  const chartAt = (el) => el && charts.find((c) => chartEl(c) === el);

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isMarker = (v) => typeof v === "string" && v.startsWith("⟪js⟫ ");
  const hasMarker = (v) => JSON.stringify(v).includes("⟪js⟫ ");

  // [{path, value}] turning a into b (value undefined = delete).
  const changes = (a, b, path = [], out = []) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    const obj = (x) => x && typeof x === "object";
    if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changes(a[k], b[k], [...path, k], out);
    } else out.push({ path, value: b });
    return out;
  };
  const setPath = (root, path, value) => {
    let o = root;
    for (const k of path.slice(0, -1)) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    const last = path[path.length - 1];
    if (value === undefined) delete o[last];
    else o[last] = value;
  };

  let mermaidLib = null;
  const getMermaid = async () => {
    if (window.mermaid) return window.mermaid;
    if (!mermaidLib) {
      mermaidLib = import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs").then((m) => {
        m.default.initialize({ startOnLoad: false });
        return m.default;
      });
    }
    return mermaidLib;
  };
  const decodeMermaid = (source) => {
    const t = document.createElement("pre");
    t.innerHTML = source;
    return t.innerHTML.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  };

  // Apply spec changes to the live chart. Returns false if not previewable.
  const previewChart = async (c, el, from, to) => {
    if (c.kind === "plotly" && window.Plotly && el.data) {
      // Plotly.react compares data arrays by reference, so copy every
      // container on a changed path instead of mutating it in place.
      const roots = { 1: [...el.data], 2: { ...el.layout } };
      for (const arg of Object.keys(to)) {
        for (const ch of changes(from[arg], to[arg])) {
          if (isMarker(ch.value)) continue;
          let o = roots[arg];
          for (const k of ch.path.slice(0, -1)) {
            o[k] = Array.isArray(o[k]) ? [...o[k]] : o[k] && typeof o[k] === "object" ? { ...o[k] } : {};
            o = o[k];
          }
          const last = ch.path[ch.path.length - 1];
          if (ch.value === undefined) delete o[last];
          else o[last] = clone(ch.value);
        }
      }
      await Plotly.react(el, roots[1], roots[2]);
      return true;
    }
    if (c.kind === "chartjs" && window.Chart && Chart.getChart(el)) {
      let chart = Chart.getChart(el);
      const chs = changes(from[1], to[1]);
      for (const ch of chs) {
        if (isMarker(ch.value) || ch.path[0] === "type") continue;
        setPath(chart.config, ch.path, ch.value === undefined ? undefined : clone(ch.value));
      }
      if (chs.some((ch) => ch.path[0] === "type")) {
        // A new chart type needs a new chart; reuse the live data and options
        // so code values (callbacks) keep working.
        const { data, options, plugins } = chart.config;
        chart.destroy();
        chart = new Chart(el, { type: to[1].type, data, options, plugins });
      } else chart.update();
      return true;
    }
    if (c.kind === "vega" && window.vegaEmbed && !hasMarker(to[1])) {
      await vegaEmbed(el, clone(to[1]), { actions: false });
      return true;
    }
    return false;
  };

  // ---------- chart panel: Chart (form) · Data (table) · Code (spec) ----------
  const CF = window.__heChartForm;
  delete window.__heChartForm;
  const cssColour = document.createElement("canvas").getContext("2d");
  const colourHex = (v) => {
    if (typeof v !== "string" || !v) return null;
    cssColour.fillStyle = "#000000";
    cssColour.fillStyle = v;
    return /^#[0-9a-f]{6}$/i.test(cssColour.fillStyle) ? cssColour.fillStyle : null;
  };
  const hintsOf = (c, el) => {
    if (c.kind !== "plotly" || !el) return {};
    return { fullData: el._fullData || [], fullLayout: el._fullLayout || {} };
  };
  let chartTab = "form";
  const sectionOpen = new Map(); // section title → open, kept while the panel is used

  const openChart = (c, el) => {
    const panel = $(".chartp");
    const form = $(".chartp .form");
    const dataTab = $(".chartp .data");
    const ta = $(".chartp textarea");
    const note = $(".chartp .msg");
    const tabBtn = (t) => $(`.chartp [data-tab="${t}"]`);
    const isMermaid = c.kind === "mermaid";
    const opaque = !isMermaid && c.specs.some((s) => s.opaque);
    const orig = isMermaid ? null : Object.fromEntries(c.specs.map((s) => [s.arg, s.value]));
    let state = isMermaid ? null : clone(orig);
    let shown = isMermaid ? null : clone(orig); // what the live chart shows now
    let previewed = false;
    $(".chartp h4").textContent = { plotly: "Plotly chart", chartjs: "Chart.js chart", vega: "Vega-Lite chart", mermaid: "Mermaid diagram" }[c.kind];
    note.textContent = isMermaid
      ? "Diagram source (Mermaid). Preview updates as you type."
      : opaque
        ? "This chart's spec is computed by code, so it can't be edited here — use </> on the script."
        : "";

    const changed = (structural) => {
      syncJson();
      schedule();
      if (structural) renderForm();
    };

    // One form row: label + control. `k` comes from chartform.build().
    const control = (k) => {
      const lab = document.createElement("label");
      lab.textContent = k.label;
      const box = document.createElement("div");
      box.className = "ctl";
      box.dataset.path = JSON.stringify(k.path.map(String));
      box.dataset.type = k.type;
      if (k.code) {
        box.innerHTML = '<span class="code">⟪js⟫ code — edit in Code</span>';
        return [lab, box];
      }
      const input = (type) => {
        const i = document.createElement("input");
        if (type) i.type = type;
        box.appendChild(i);
        return i;
      };
      const set = (v, structural) => {
        k.set(v);
        k.raw = v;
        rst.style.visibility = v === undefined ? "hidden" : "";
        changed(structural);
      };
      if (k.type === "note") {
        box.innerHTML = '<span class="note"></span>';
        box.firstChild.textContent = k.text;
      } else if (k.type === "text" || k.type === "auto" || k.type === "number") {
        const i = input(k.type === "number" ? "number" : "text");
        if (k.type === "number") {
          i.step = k.step ?? "any";
          if (k.min != null) i.min = k.min;
          if (k.max != null) i.max = k.max;
        }
        i.value = k.raw ?? "";
        i.placeholder = k.placeholder ?? "";
        i.oninput = () => {
          let v = i.value === "" ? undefined : i.value;
          if (v !== undefined && k.type !== "text" && /^-?\d*\.?\d+(e-?\d+)?$/i.test(v.trim())) v = Number(v);
          else if (v !== undefined && k.type === "number") return;
          set(v);
        };
      } else if (k.type === "range") {
        const i = input("range");
        i.min = k.min;
        i.max = k.max;
        i.step = k.step;
        i.value = k.value ?? k.min;
        const val = document.createElement("span");
        val.className = "val";
        val.textContent = i.value;
        box.appendChild(val);
        i.oninput = () => {
          val.textContent = i.value;
          set(Number(i.value));
        };
      } else if (k.type === "checkbox") {
        const i = input("checkbox");
        i.checked = !!k.value;
        i.onchange = () => set(i.checked, true);
      } else if (k.type === "select") {
        const sel = document.createElement("select");
        const values = [];
        const add = (v, text) => {
          const o = document.createElement("option");
          o.textContent = text;
          o.value = String(values.length);
          values.push(v);
          sel.appendChild(o);
        };
        if (!k.noDefault) add(undefined, k.defLabel || "(default)");
        for (const [v, text] of k.options) add(v, text);
        const cur = JSON.stringify(k.raw);
        let at = values.findIndex((v) => v !== undefined && JSON.stringify(v) === cur);
        if (at < 0 && k.raw !== undefined) {
          add(k.raw, String(k.raw));
          at = values.length - 1;
        }
        sel.value = String(Math.max(at, 0));
        sel.onchange = () => set(values[Number(sel.value)], true);
        box.appendChild(sel);
      } else if (k.type === "color") {
        const sw = input("color");
        const i = input("text");
        i.value = k.raw ?? "";
        i.placeholder = k.placeholder || "default";
        sw.value = colourHex(k.raw) || colourHex(k.placeholder) || "#000000";
        sw.oninput = () => {
          i.value = sw.value;
          set(sw.value);
        };
        i.oninput = () => {
          const hex = colourHex(i.value);
          if (hex) sw.value = hex;
          set(i.value === "" ? undefined : i.value);
        };
      }
      const rst = document.createElement("button");
      rst.className = "rst";
      rst.textContent = "↺";
      rst.title = "Reset to default (removes the setting)";
      rst.style.visibility = k.raw === undefined || k.noReset || k.type === "note" ? "hidden" : "";
      rst.onclick = () => set(undefined, true);
      box.appendChild(rst);
      return [lab, box];
    };

    const renderForm = () => {
      const y = panel.scrollTop;
      form.innerHTML = "";
      if (isMermaid || opaque) return;
      const { sections } = CF.build(c.kind, state, orig, hintsOf(c, el));
      sections.forEach((s, n) => {
        if (!s.controls.length) return;
        const d = document.createElement("details");
        const keyOf = c.kind + "|" + s.title.replace(/ · .*/, "");
        d.open = sectionOpen.has(keyOf) ? sectionOpen.get(keyOf) : !s.closed && n < 4;
        d.ontoggle = () => sectionOpen.set(keyOf, d.open);
        const sum = document.createElement("summary");
        sum.textContent = s.title;
        const grid = document.createElement("div");
        grid.className = "grid";
        for (const k of s.controls) grid.append(...control(k));
        d.append(sum, grid);
        form.appendChild(d);
      });
      if (!form.children.length) form.textContent = "No editable settings found — use Data or Code.";
      panel.scrollTop = y;
    };

    let tables = [];
    const renderData = () => {
      dataTab.innerHTML = "";
      if (isMermaid || opaque) return;
      tables = CF.tables(c.kind, state);
      tables.forEach((t, ti) => {
        const h = document.createElement("div");
        h.className = "dtitle";
        h.textContent = t.title;
        dataTab.appendChild(h);
        if (t.note) {
          const p = document.createElement("p");
          p.className = "msg";
          p.textContent = t.note;
          dataTab.appendChild(p);
          return;
        }
        const wrap = document.createElement("div");
        wrap.className = "dtw";
        const tb = document.createElement("table");
        tb.className = "dt";
        tb.dataset.table = String(ti);
        const head = tb.insertRow();
        for (const name of ["", ...t.columns, ""]) {
          const th = document.createElement("th");
          th.textContent = name;
          head.appendChild(th);
        }
        for (let r = 0; r < t.rows; r++) {
          const tr = tb.insertRow();
          const n = tr.insertCell();
          n.className = "n";
          n.textContent = r + 1;
          t.columns.forEach((_, j) => {
            const i = document.createElement("input");
            const v = t.get(r, j);
            i.value = v == null ? "" : String(v);
            if (t.numeric[j]) i.inputMode = "decimal";
            i.oninput = () => {
              t.set(r, j, i.value);
              changed(false);
            };
            tr.insertCell().appendChild(i);
          });
          const del = document.createElement("button");
          del.className = "del";
          del.textContent = "✕";
          del.title = "Delete row";
          del.onclick = () => {
            t.remove(r);
            renderData();
            changed(true);
          };
          tr.insertCell().appendChild(del);
        }
        wrap.appendChild(tb);
        dataTab.appendChild(wrap);
        const add = document.createElement("button");
        add.className = "addrow";
        add.textContent = "+ row";
        add.onclick = () => {
          t.add();
          renderData();
          changed(true);
          const last = dataTab.querySelectorAll(`[data-table="${ti}"] tr:last-child input`)[0];
          if (last) last.focus();
        };
        dataTab.appendChild(add);
      });
    };

    const showTab = (t) => {
      if (isMermaid || opaque) t = "code";
      if (t === "data" && !tables.length) t = "form";
      chartTab = t;
      for (const x of ["form", "data", "code"]) {
        $(`.chartp .tab.${x}`).style.display = x === t ? "block" : "none";
        tabBtn(x).classList.toggle("on", x === t);
      }
    };
    for (const x of ["form", "data", "code"]) tabBtn(x).onclick = () => showTab(x);

    const syncJson = () => {
      ta.value = isMermaid ? ta.value : JSON.stringify(c.specs.length === 1 ? state[c.specs[0].arg] : state, null, 2);
    };
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          if (isMermaid) {
            const m = await getMermaid();
            const { svg } = await m.render("he-mmd-" + Date.now(), decodeMermaid(ta.value));
            el.innerHTML = svg;
            previewed = true;
            say("Preview ✓");
          } else {
            if (await previewChart(c, el, shown, state)) {
              shown = clone(state);
              previewed = true;
              say("Preview ✓");
            } else say("no live preview for this chart; Apply to save");
          }
          showSelected();
        } catch (e) {
          say("preview: " + e.message, true);
        }
      }, 250);
    };
    ta.oninput = () => {
      if (isMermaid) return schedule();
      try {
        const v = JSON.parse(ta.value);
        state = c.specs.length === 1 ? { [c.specs[0].arg]: v } : v;
        ta.style.borderColor = "";
        renderForm();
        renderData();
        schedule();
      } catch {
        ta.style.borderColor = "#f87171";
      }
    };
    ta.value = isMermaid ? c.source : "";
    $(".chartp .spec-label").textContent = isMermaid ? "Source" : "Full spec — ⟪js⟫ values are code and stay as written";
    tabBtn("form").style.display = isMermaid || opaque ? "none" : "";
    // Keep the chart visible beside the docked panel.
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: "center" });
    renderForm();
    renderData();
    tabBtn("data").style.display = tables.length ? "" : "none";
    syncJson();
    showTab(chartTab);
    openPanel(
      panel,
      async () => {
        clearTimeout(timer);
        if (isMermaid) {
          await commit("/edit", { edits: [{ id: c.element, source: ta.value }] });
        } else {
          const r = await commit("/chart", { index: c.index, values: state });
          if (r && !r.stale) {
            if (!previewed) await previewChart(c, el, shown, state).catch(() => {});
            await loadCharts();
          }
        }
      },
      () => {
        clearTimeout(timer);
        if (previewed) reload();
      },
    );
  };

  // ---------- drag and drop re-arranging ----------
  // Grab ⠿ on the toolbar, drop before/after any block of the same kind
  // (list items among list items, rows among rows, blocks among blocks).
  const dropLine = $(".drop");
  const ghost = $(".ghost");
  const dragBox = $(".box.drag");
  let drag = null; // { el, drop }
  let dragEndedAt = 0;
  const isInline = (el) => getComputedStyle(el).display.startsWith("inline");
  const ITEM = /^(LI|TR|TD|TH|DT|DD|OPTION|THEAD|TBODY|TFOOT|CAPTION|COLGROUP|COL)$/;
  const canDropBy = (t, d) => {
    if (!t || t === d || !t.hasAttribute("data-he") || d.contains(t) || isUi(t)) return false;
    const p = t.parentElement;
    if (!p || !p.hasAttribute("data-he") || p === document.documentElement) return false;
    if (d.tagName === "LI") return t.tagName === "LI";
    if (d.tagName === "TR") return t.tagName === "TR";
    if (/^(TD|TH)$/.test(d.tagName)) return /^(TD|TH)$/.test(t.tagName);
    if (ITEM.test(t.tagName)) return false;
    if (t instanceof SVGElement && t.tagName.toLowerCase() !== "svg") return false;
    return isInline(t) === isInline(d);
  };
  const dropAt = (x, y) => {
    let t = document.elementFromPoint(x, y);
    t = t && t.closest && t.closest("[data-he]");
    while (t && t !== document.body && !canDropBy(t, drag.el)) t = t.parentElement && t.parentElement.closest("[data-he]");
    if (!t || t === document.body) return null;
    const r = t.getBoundingClientRect();
    const pd = getComputedStyle(t.parentElement);
    const row =
      isInline(t) || /^(TD|TH)$/.test(t.tagName) ||
      (/flex/.test(pd.display) && !/column/.test(pd.flexDirection)) ||
      (/grid/.test(pd.display) && r.width < t.parentElement.getBoundingClientRect().width * 0.8);
    const where = row ? (x < r.left + r.width / 2 ? "before" : "after") : y < r.top + r.height / 2 ? "before" : "after";
    return { target: t, where, row, r };
  };
  const showDrop = (d) => {
    if (!d) {
      dropLine.style.display = "none";
      return;
    }
    const { r, row, where } = d;
    Object.assign(dropLine.style, row
      ? { display: "block", left: (where === "before" ? r.left - 3 : r.right) + "px", top: r.top + "px", width: "3px", height: r.height + "px" }
      : { display: "block", left: r.left + "px", top: (where === "before" ? r.top - 3 : r.bottom) + "px", width: r.width + "px", height: "3px" });
  };
  let scrollTimer = null;
  const onDragMove = (e) => {
    if (!drag) return;
    ghost.style.left = e.clientX + 14 + "px";
    ghost.style.top = e.clientY + 10 + "px";
    const d = dropAt(e.clientX, e.clientY);
    drag.drop = d;
    showDrop(d);
    placeBox(dragBox, drag.el);
    clearInterval(scrollTimer);
    const edge = e.clientY < 48 ? -1 : e.clientY > innerHeight - 48 ? 1 : 0;
    if (edge) scrollTimer = setInterval(() => window.scrollBy(0, edge * 18), 30);
  };
  const endDrag = async (e, cancel) => {
    if (!drag) return;
    const { el, drop } = drag;
    drag = null;
    dragEndedAt = Date.now(); // the mouseup's click must not start an edit
    clearInterval(scrollTimer);
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onDragUp, true);
    for (const x of [dropLine, ghost, dragBox]) x.style.display = "none";
    document.documentElement.style.cursor = "";
    showSelected();
    if (cancel || !drop) return say(cancel ? "Move cancelled" : "Drop on a highlighted spot to move");
    if (stale) return reload();
    await op({ op: "moveTo", id: Number(idOf(el)), ref: Number(idOf(drop.target)), where: drop.where });
  };
  const onDragUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    endDrag(e);
  };
  const startDrag = (el, e) => {
    if (editing) finish(true);
    drag = { el, drop: null };
    ghost.textContent = "Moving " + nameOf(el).toLowerCase();
    ghost.style.display = "block";
    bb.style.display = "none";
    hover = null;
    showHover(null);
    hideMenu();
    placeBox(dragBox, el);
    document.documentElement.style.cursor = "grabbing";
    document.addEventListener("mousemove", onDragMove, true);
    document.addEventListener("mouseup", onDragUp, true);
    onDragMove(e);
    say("Drag to the new spot · Esc cancels");
  };

  // ---------- insert: new blocks, list items, tables, images, charts ----------
  const insPanel = $(".ins");
  const uid = () => Math.random().toString(36).slice(2, 8);
  const hasMermaid = () =>
    !!(window.mermaid || document.querySelector(".mermaid, script[src*=mermaid]") ||
      [...document.scripts].some((s) => /mermaid/.test(s.textContent.slice(0, 2000))));
  const chartHtml = () => {
    const id = "chart-" + uid();
    if (window.Chart && !window.Plotly)
      return `<div style="max-width: 640px"><canvas id="${id}"></canvas></div>
<script>
  new Chart(document.getElementById('${id}'), {
    type: 'bar',
    data: {labels: ['A', 'B', 'C'], datasets: [{label: 'Series 1', data: [3, 5, 2]}]},
    options: {plugins: {title: {display: true, text: 'New chart'}}}
  });
</script>`;
    const lib = window.Plotly ? "" : `<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>\n`;
    return `<div id="${id}" style="height: 360px"></div>
${lib}<script>
  Plotly.newPlot('${id}', [{x: ['A', 'B', 'C'], y: [3, 5, 2], type: 'bar', name: 'Series 1'}],
    {title: {text: 'New chart'}, margin: {t: 48, r: 16, b: 40, l: 48}});
</script>`;
  };
  const INSERTS = [
    { key: "p", icon: "¶", label: "Paragraph", html: () => "<p>New paragraph</p>" },
    { key: "h2", icon: "H2", label: "Heading", html: () => "<h2>New heading</h2>" },
    { key: "h3", icon: "H3", label: "Subheading", html: () => "<h3>New subheading</h3>" },
    { key: "li", icon: "＋•", label: "List item", html: () => "<li>New item</li>", list: true },
    { key: "ul", icon: "•", label: "Bullet list", html: () => "<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>" },
    { key: "ol", icon: "1.", label: "Numbered list", html: () => "<ol>\n  <li>First item</li>\n  <li>Second item</li>\n</ol>" },
    {
      key: "div", icon: "▭", label: "Box",
      html: () => '<div style="padding: 12px 16px; border: 1px solid #d4d4d8; border-radius: 8px; margin: 12px 0">\n  <p>New box</p>\n</div>',
    },
    { key: "quote", icon: "❝", label: "Quote", html: () => "<blockquote>Quote</blockquote>" },
    {
      key: "table", icon: "⊞", label: "Table",
      html: () =>
        "<table>\n  <tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr>\n  <tr><td>…</td><td>…</td><td>…</td></tr>\n  <tr><td>…</td><td>…</td><td>…</td></tr>\n</table>",
    },
    { key: "pre", icon: "{ }", label: "Code", html: () => "<pre><code>code</code></pre>" },
    { key: "hr", icon: "―", label: "Divider", html: () => "<hr>" },
    { key: "img", icon: "🖼", label: "Image", image: true },
    { key: "chart", icon: "📊", label: "Chart", html: chartHtml },
    {
      key: "mermaid", icon: "⧉", label: "Diagram", when: hasMermaid,
      html: () => '<pre class="mermaid">\nflowchart LR\n  A[Start] --> B[Finish]\n</pre>',
    },
    { key: "html", icon: "</>", label: "HTML…", custom: true },
  ];
  const CONTAINER = /^(DIV|SECTION|ARTICLE|MAIN|ASIDE|HEADER|FOOTER|NAV|BLOCKQUOTE|TD|TH|FIGURE|DETAILS|FORM|LI)$/;
  // Where a block lands: list items go next to list items, everything else
  // next to the enclosing list/table/svg rather than inside it.
  const insertTarget = (el, item, where) => {
    if (item.list) {
      const li = el.closest("li[data-he]");
      if (li && where !== "inside") return { el: li, where };
      const list = el.closest("ul[data-he], ol[data-he]");
      return list ? { el: li ? li : list, where: li ? "after" : "inside" } : null;
    }
    if (where === "inside" && CONTAINER.test(el.tagName)) return { el, where };
    let t = el instanceof SVGElement ? el.closest("svg[data-he]") || el : el;
    const outer = t.closest("table[data-he], ul[data-he], ol[data-he], dl[data-he]");
    if (outer && !(where === "inside" && CONTAINER.test(t.tagName))) t = outer;
    // Climb out of nested lists/tables to the outermost one.
    for (let p = t.parentElement && t.parentElement.closest("table[data-he], ul[data-he], ol[data-he]"); p; p = p.parentElement && p.parentElement.closest("table[data-he], ul[data-he], ol[data-he]"))
      t = p;
    return { el: t, where: where === "inside" ? "after" : where };
  };
  let insWhere = "after";
  const doInsert = async (base, item, where) => {
    const tgt = insertTarget(base, item, where);
    if (!tgt) return say("select a list or list item first", true);
    let html;
    if (item.image) {
      const file = await new Promise((resolve) => {
        const f = $(".file");
        f.value = "";
        f.onchange = () => resolve(f.files[0]);
        f.click();
      });
      if (!file) return;
      const dataUrl = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(file);
      });
      // Self-contained reports (inline images already) keep images inline.
      let src = dataUrl;
      if (![...document.images].some((i) => (i.getAttribute("src") || "").startsWith("data:"))) {
        src = (await api("POST", "/asset", { name: file.name, data: dataUrl.split(",")[1] })).path;
      }
      html = `<img src="${src}" alt="${escapeHtml(file.name.replace(/\.[^.]+$/, ""))}" style="max-width: 100%">`;
    } else html = item.html();
    sessionStorage.setItem("he-begin", item.key);
    const r = await op({ op: "insert", id: Number(idOf(tgt.el)), where: tgt.where, html });
    if (!r || r.stale || !r.reload) sessionStorage.removeItem("he-begin");
  };
  const openInsert = (el) => {
    const items = $(".ins .items");
    items.innerHTML = "";
    const inList = !!el.closest("li[data-he], ul[data-he], ol[data-he]");
    const canInside = CONTAINER.test(el.tagName) || /^(UL|OL)$/.test(el.tagName);
    if (!canInside && insWhere === "inside") insWhere = "after";
    for (const b of root.querySelectorAll(".ins [data-w]")) {
      b.classList.toggle("on", b.dataset.w === insWhere);
      b.disabled = b.dataset.w === "inside" && !canInside;
      b.onclick = () => {
        insWhere = b.dataset.w;
        openInsert(el);
      };
    }
    const list = INSERTS.filter((i) => (!i.list || inList) && (!i.when || i.when()));
    if (inList) list.sort((a, b) => (b.list ? 1 : 0) - (a.list ? 1 : 0));
    for (const item of list) {
      const b = document.createElement("button");
      b.dataset.ins = item.key;
      b.innerHTML = `<span class="ic"></span><span></span>`;
      b.firstChild.textContent = item.icon;
      b.lastChild.textContent = item.label;
      b.onclick = () => {
        closePanel(true);
        if (item.custom) {
          $(".src .msg").textContent = `HTML to insert ${insWhere === "inside" ? "inside" : insWhere === "before" ? "above" : "below"} <${el.tagName.toLowerCase()}>:`;
          srcTa.style.display = "block";
          srcIn.style.display = "none";
          srcTa.value = "<p>New paragraph</p>";
          openPanel(src, () => doInsert(el, { key: "html", html: () => srcTa.value }, insWhere));
          srcTa.focus();
          srcTa.select();
          return;
        }
        doInsert(el, item, insWhere);
      };
      items.appendChild(b);
    }
    openPanel(insPanel, () => {});
    const r = bb.getBoundingClientRect();
    const w = insPanel.offsetWidth;
    const h = insPanel.offsetHeight;
    insPanel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    insPanel.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
  };
  // A freshly inserted block: start typing into it (placeholder selected),
  // or open the chart panel for a new chart.
  const startNew = async (el, key) => {
    if (!el) return;
    if (key === "chart" || key === "mermaid") {
      await loadCharts();
      const target = el.querySelector("canvas[data-he]") || el;
      if (chartAt(target)) return begin(target);
      return select(el);
    }
    if (/^(hr|img)$/.test(key)) return select(el);
    const t = el.matches("ul, ol, table, div, blockquote") ? el.querySelector("li, th, td, p") || el : el;
    begin(t, { selectAll: true, fresh: true });
  };

  // ---------- comments for agents (M5) ----------
  let comments = [];
  const pins = document.createElement("div");
  root.appendChild(pins);
  const loadComments = async () => {
    try {
      comments = (await api("GET", "/comments")).filter((c) => c.status === "open");
    } catch {
      comments = [];
    }
    $(".cbtn").textContent = "💬 " + comments.length;
    $(".cbtn").style.display = comments.length || editMode ? "" : "none";
    renderPins();
    if ($(".cmts").style.display === "block") renderList();
  };
  const elOfComment = (c) => (c.at == null ? null : document.querySelector(`[data-he="${c.at}"]`));
  const renderPins = () => {
    pins.innerHTML = "";
    comments.forEach((c, i) => {
      const el = elOfComment(c);
      if (!el) return;
      // Pin at the end of the text, not the far edge of a wide block.
      let r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      if (tr.width && tr.height && tr.right < r.right) r = { top: r.top, bottom: r.bottom, right: tr.right + 14 };
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = document.createElement("button");
      p.className = "pin";
      p.textContent = i + 1;
      p.title = c.text;
      p.style.left = Math.min(innerWidth - 26, r.right - 10) + "px";
      p.style.top = Math.max(2, r.top - 10) + "px";
      p.onclick = () => openList(c.id);
      pins.appendChild(p);
    });
  };
  const renderList = (focus) => {
    const list = $(".cmts .list");
    list.innerHTML = "";
    if (!comments.length) list.textContent = "No open notes. Select a block, press ✨, then Leave as note.";
    comments.forEach((c, i) => {
      const item = document.createElement("div");
      item.className = "citem" + (c.id === focus ? " focus" : "");
      const head = document.createElement("div");
      head.className = "chead";
      head.textContent = `${i + 1}. <${c.anchor.tag}> ${c.line ? "line " + c.line : "(element not found)"}`;
      const body = document.createElement("div");
      body.textContent = c.text;
      const meta = document.createElement("div");
      meta.className = "msg";
      meta.textContent = c.quote ? `on “${c.quote.slice(0, 80)}”` : c.anchor.text.slice(0, 80);
      const row = document.createElement("div");
      row.className = "row";
      const mk = (label, fn) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.onclick = fn;
        row.appendChild(b);
      };
      mk("Go to", () => {
        const el = elOfComment(c);
        if (!el) return say("element not found", true);
        el.scrollIntoView({ block: "center" });
        if (editMode) select(el);
      });
      mk("Resolve", async () => {
        await api("POST", "/comments", { action: "resolve", cid: c.id });
        loadComments();
      });
      mk("Delete", async () => {
        await api("POST", "/comments", { action: "delete", cid: c.id });
        loadComments();
      });
      item.append(head, body, meta, row);
      list.appendChild(item);
      if (c.id === focus) setTimeout(() => item.scrollIntoView({ block: "nearest" }), 0);
    });
  };
  const openList = (focus) => {
    $(".cmts").style.display = "block";
    renderList(focus);
  };
  $(".cbtn").onclick = () => {
    const p = $(".cmts");
    if (p.style.display === "block") p.style.display = "none";
    else openList();
  };
  $(".cmts .close").onclick = () => ($(".cmts").style.display = "none");
  $(".cmts .copy").onclick = async () => {
    const { markdown } = await api("GET", "/comments.md");
    try {
      await navigator.clipboard.writeText(markdown);
      say("copied — paste into your coding agent");
    } catch {
      say("clipboard blocked; run: hotedit comments <file>", true);
    }
  };
  const addComment = (el) => {
    const quote = barQuote;
    barQuote = "";
    const panel = $(".cmtp");
    const ta = $(".cmtp textarea");
    ta.value = "";
    $(".cmtp .msg").textContent = quote ? `On “${quote.slice(0, 100)}”` : `On this ${nameOf(el).toLowerCase()}`;
    openPanel(panel, async () => {
      const text = ta.value.trim();
      if (!text) return;
      try {
        const r = await api("POST", "/comments", { action: "add", id: Number(idOf(el)), text, quote, version: VERSION });
        if (r.stale) return reload();
        say("Note saved for your agent ✓");
        loadComments();
      } catch (e) {
        say(e.message, true);
      }
    });
    ta.focus();
  };

  // ---------- ✨ AI agent: edits the page live ----------
  const ag = $(".agentp");
  const agTa = $(".agentp textarea");
  const agLog = $(".agentp .log");
  let agTarget = null; // element the request is about (null = whole page)
  let agInfo = null;
  let agJob = null;
  const agShow = (on) => {
    ag.style.display = on ? "block" : "none";
    sessionStorage.setItem("he-ai", on ? "1" : "0");
  };
  const agScope = () => {
    const ok = agTarget && agTarget.isConnected;
    if (!ok) agTarget = null;
    const words = agTarget ? (agTarget.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50) : "";
    $(".agentp .about").textContent = agTarget ? `About: ${nameOf(agTarget)}${words ? ` “${words}”` : ""}` : "About: the whole page";
    $(".agentp .whole").style.display = agTarget ? "" : "none";
    $(".agentp .tonote").style.display = agTarget ? "" : "none";
    sessionStorage.setItem("he-ai-target", agTarget ? `${VERSION}:${idOf(agTarget)}` : "");
  };
  const agConn = (on) => {
    $(".agentp .conn").style.display = on ? "block" : "none";
    $(".agentp .ask").style.display = on ? "none" : "block";
    if (on) agLog.style.display = "none";
    else agRender();
    if (!on || !agInfo) return;
    for (const p of agInfo.providers) {
      const d = $(`.agentp .d[data-d="${p.id}"]`);
      d.textContent = p.detail;
      d.classList.toggle("ok", p.available);
    }
    const r = root.querySelector(`.agentp input[value="${agInfo.provider || "claude"}"]`);
    if (r) r.checked = true;
    $(".agentp .model").value = agInfo.model || "";
    $(".agentp .key").value = "";
  };
  const agLoad = async () => {
    agInfo = await api("GET", "/agent");
    if (agInfo.job) agJob = agInfo.job;
    $(".agentp .gear").textContent = agInfo.provider ? `⚙ ${agInfo.provider === "api" ? "API key" : "Claude login"}` : "⚙ Connect AI";
    return agInfo;
  };
  const agRender = () => {
    const j = agJob;
    const running = j && j.status === "running";
    agLog.style.display = j ? "block" : "none";
    agTa.disabled = !!running;
    $(".agentp .go").style.display = running ? "none" : "";
    $(".agentp .stop").style.display = running ? "" : "none";
    $(".agentp .undoai").style.display = j && !running && j.edits > 0 ? "" : "none";
    $(".agentp .after").style.display = running || (j && j.edits > 0) ? "" : "none";
    if (!j) return;
    agLog.innerHTML = "";
    const add = (cls, text) => {
      const d = document.createElement("div");
      d.className = cls;
      d.textContent = text;
      agLog.appendChild(d);
    };
    add("q", "“" + j.prompt + "”");
    for (const e of j.log) add(e.t, e.t === "edit" ? "✓ " + e.s : e.t === "tool" ? "· " + e.s : e.s);
    if (running) add("tool working", "Working");
    else if (j.status === "done") add("tool", j.edits ? `Done · ${j.edits} change${j.edits > 1 ? "s" : ""} saved` : "Done · no changes");
    else if (j.status === "stopped") add("tool", "Stopped");
  };
  const openAgent = async (el) => {
    agTarget = el || null;
    agShow(true);
    agScope();
    try {
      await agLoad();
    } catch (e) {
      return say(e.message, true);
    }
    agConn(false);
    agTa.focus();
  };
  $(".aibtn").onclick = () => (ag.style.display === "block" ? agShow(false) : openAgent(selected));
  $(".agentp .x").onclick = () => agShow(false);
  $(".agentp .whole").onclick = () => {
    agTarget = null;
    agScope();
  };
  $(".agentp .gear").onclick = async () => {
    await agLoad().catch(() => {});
    agConn(true);
  };
  $(".agentp .back").onclick = () => agConn(false);
  $(".agentp .key").onfocus = () => (root.querySelector('.agentp input[value="api"]').checked = true);
  $(".agentp .savec").onclick = async () => {
    const prov = root.querySelector(".agentp input[name=he-prov]:checked");
    const body = { provider: prov ? prov.value : "", model: $(".agentp .model").value };
    if ($(".agentp .key").value.trim()) body.apiKey = $(".agentp .key").value.trim();
    try {
      await api("POST", "/agent/config", body);
      await agLoad();
      const p = agInfo.providers.find((x) => x.id === agInfo.provider);
      if (p && !p.available) return say(p.id === "api" ? "Paste an API key first" : "Install Claude Code first, then run `claude` to log in", true);
      say("AI connected ✓");
      agConn(false);
      agTa.focus();
    } catch (e) {
      say(e.message, true);
    }
  };
  agTa.oninput = () => sessionStorage.setItem("he-ai-draft", agTa.value);
  agTa.onkeydown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $(".agentp .go").click();
    }
  };
  $(".agentp .go").onclick = async () => {
    const prompt = agTa.value.trim();
    if (!prompt) return agTa.focus();
    if (agInfo && !agInfo.provider) return agConn(true);
    if (editing) await finish(true);
    try {
      const r = await api("POST", "/agent/run", { prompt, id: agTarget ? Number(idOf(agTarget)) : null, version: VERSION });
      if (r.stale) return reload();
      agJob = r;
      agTa.value = "";
      sessionStorage.removeItem("he-ai-draft");
      agRender();
    } catch (e) {
      if (/Connect an AI/.test(e.message)) return agConn(true);
      say(e.message, true);
    }
  };
  $(".agentp .tonote").onclick = () => {
    const el = agTarget;
    const text = agTa.value;
    agShow(false);
    if (!el) return;
    select(el);
    addComment(el);
    $(".cmtp textarea").value = text;
  };
  $(".agentp .stop").onclick = () => api("POST", "/agent/stop").catch((e) => say(e.message, true));
  $(".agentp .undoai").onclick = async () => {
    try {
      const r = await api("POST", "/agent/undo");
      if (r.changed) reload();
    } catch (e) {
      say(e.message, true);
    }
  };
  // Glow on what the AI just changed, after the page reloads to show it.
  const flash = (id) => {
    const el = id != null && document.querySelector(`[data-he="${id}"]`);
    if (!el) return;
    let r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      el.scrollIntoView({ block: "center" });
      r = el.getBoundingClientRect();
    }
    const f = $(".flash");
    Object.assign(f.style, { display: "block", left: r.left - 4 + "px", top: r.top - 4 + "px", width: r.width + 8 + "px", height: r.height + 8 + "px" });
    f.style.animation = "none";
    void f.offsetWidth;
    f.style.animation = "";
    setTimeout(() => (f.style.display = "none"), 1900);
  };
  const agRestore = async () => {
    if (sessionStorage.getItem("he-ai") !== "1") return;
    const t = (sessionStorage.getItem("he-ai-target") || "").split(":");
    agTarget = t[0] === String(VERSION) ? document.querySelector(`[data-he="${t[1]}"]`) : null;
    agShow(true);
    agScope();
    agTa.value = sessionStorage.getItem("he-ai-draft") || "";
    try {
      await agLoad();
    } catch {}
    agConn(false);
  };

  // ---------- events ----------
  const setMode = (on) => {
    editMode = on;
    sessionStorage.setItem("he-edit", on ? "1" : "0");
    editBtn.classList.toggle("on", on);
    editBtn.textContent = on ? "✓ Done" : "✎ Edit";
    if (on) {
      document.head.appendChild(revealHidden);
      loadCharts().then(showSelected);
      loadComments();
    }
    else {
      finish(true);
      closePanel();
      loadComments();
      revealHidden.remove();
      select(null);
      showHover(null);
    }
    say(on ? "Click text to type · click a block for tools" : "hotedit");
  };
  editBtn.onclick = () => setMode(!editMode);
  const history = async (which) => {
    try {
      const r = await api("POST", "/" + which);
      r.changed ? reload() : say(r.error || `nothing to ${which}`);
    } catch (e) {
      say(e.message, true);
    }
  };
  $(".undo").onclick = () => history("undo");
  $(".redo").onclick = () => history("redo");

  document.addEventListener(
    "mousemove",
    (e) => {
      if (!editMode || modal || drag || isUi(e.target)) return;
      const el =
        editing && editing.el.contains(e.target) ? null : pick(e.target);
      if (el !== hover) {
        hover = el;
        showHover(el === selected ? null : el);
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!editMode || isUi(e.target)) return;
      if (editing && editing.el.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - dragEndedAt < 400) return;
      if (modal) return;
      if (editing) finish(true);
      const el = pick(e.target);
      showHover(null);
      clickAt = { x: e.clientX, y: e.clientY };
      if (el) begin(el);
      else select(null);
    },
    true,
  );

  document.addEventListener(
    "focusout",
    (e) => {
      if (editing && e.target === editing.el) finish(true);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (isUi(e.target)) return;
      if (editing) {
        // Esc / Enter on an untouched new block takes the insert back.
        const untouched = editing.fresh && editing.el.innerHTML === editing.before;
        if (untouched && (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey))) {
          e.preventDefault();
          finish(false);
          history("undo");
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const li = editing.el.tagName === "LI" && caretAtEnd(editing.el) ? editing.el : null;
          if (li && li.textContent.trim()) {
            finish(true).then(() => doInsert(li, INSERTS.find((i) => i.key === "li"), "after"));
          } else finish(true);
        } else if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          finish(true);
        }
        e.stopPropagation();
        return;
      }
      const typing =
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) ||
        e.target.isContentEditable;
      if (typing) return;
      if (drag && e.key === "Escape") return endDrag(e, true);
      if (selected && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        return actions[e.key === "ArrowUp" ? "up" : "down"]();
      }
      if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey)
        setMode(!editMode);
      else if (e.key === "Escape" && selected) select(null);
      else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        history(e.shiftKey ? "redo" : "undo");
      }
    },
    true,
  );

  const follow = () => {
    hideMenu();
    if (selected) showSelected();
    if (hover) showHover(hover === selected ? null : hover);
    renderPins();
  };
  window.addEventListener("scroll", follow, true);
  window.addEventListener("resize", follow);

  // Live reload when the file changes on disk (e.g. an agent rewrote it).
  const es = new EventSource(ORIGIN + "/__he/events");
  es.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.type === "comments") return loadComments();
    if (d.type === "agent") {
      agJob = d.job;
      return agRender();
    }
    if (d.type !== "reload" || d.except === CLIENT) return;
    if (d.flash != null) sessionStorage.setItem("he-flash", String(d.flash));
    if (!editing && !modal) return reload();
    stale = true;
    say("file changed on disk — finish or Esc to reload", true);
  };

  const hint = $(".hint");
  const hintDone = () => {
    hint.style.display = "none";
    try {
      localStorage.setItem("he-hint", "1");
    } catch {}
  };
  $(".hint .ok").onclick = hintDone;

  const mount = () => {
    document.documentElement.appendChild(host);
    const y = sessionStorage.getItem("he-scroll");
    if (y) {
      sessionStorage.removeItem("he-scroll");
      window.scrollTo(0, Number(y));
    }
    setMode(editMode);
    const s = sessionStorage.getItem("he-sel");
    sessionStorage.removeItem("he-sel");
    const fresh = sessionStorage.getItem("he-begin");
    sessionStorage.removeItem("he-begin");
    if (editMode && s != null) {
      const el = document.querySelector(`[data-he="${s}"]`);
      select(el);
      if (fresh && el) startNew(el, fresh);
    }
    refreshState();
    loadComments();
    agRestore();
    const fl = sessionStorage.getItem("he-flash");
    sessionStorage.removeItem("he-flash");
    if (fl != null) setTimeout(() => flash(Number(fl)), 150);
    let seen = false;
    try {
      seen = localStorage.getItem("he-hint") === "1";
    } catch {}
    if (!seen) hint.style.display = "block";
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
  window.__htmledit = {
    api,
    domMatchesSource,
    version: VERSION,
    pick,
    begin,
    finish,
    setMode,
    select,
    actions,
    openAgent,
    caretFor,
    insert: (el, key, where = "after") => doInsert(el, INSERTS.find((i) => i.key === key), where),
    get selected() {
      return selected;
    },
  };
})();
