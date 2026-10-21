// htmledit overlay: injected into the served page. Lives in a shadow root so
// page CSS can't touch it; never written to disk (the server patches source).
(() => {
  "use strict";
  const me = document.currentScript;
  const TOKEN = me.dataset.heToken;
  let VERSION = Number(me.dataset.heVersion);
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
  .bar .edit { min-width: 64px; text-align: center; font-weight: 600; }
  .tip { position: fixed; z-index: 2147483647; display: none; pointer-events: none; max-width: 260px;
    padding: 5px 8px; border-radius: 7px; background: rgba(9,9,11,.96); color: #f4f4f5;
    font: 12px/1.35 -apple-system, system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
  kbd { display: inline-block; margin-left: 6px; padding: 1px 5px; border-radius: 4px; background: #3f3f46;
    color: #e4e4e7; font: 11px/1.4 -apple-system, system-ui, sans-serif; }
  .menu kbd { margin-left: auto; padding-left: 12px; background: transparent; color: #71717a; }
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
  .ins { width: 312px; padding: 8px; }
  .ins .where { display: flex; gap: 4px; margin-bottom: 8px; }
  .ins .where button { flex: 1; text-align: center; padding: 4px 0; font-size: 12px; }
  .ins .items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .ins .items button { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 2px; background: #27272a; font-size: 11px; }
  .ins .items button:hover { background: #3f3f46; }
  .ins .ic { font: 600 15px/1.1 -apple-system, system-ui, sans-serif; height: 18px; }
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
  .agentp .pick { margin: -4px 0 8px; font-size: 11.5px; }
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
  /* Panels: frosted glass, hairline edges, soft depth. */
  .panel { background: rgba(24,24,26,.92); -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid rgba(255,255,255,.09); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.2);
    font: 13px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; letter-spacing: -.005em; }
  .panel[style*="block"] { animation: hepop .22s cubic-bezier(.2,.9,.3,1.2); }
  @keyframes hepop { from { opacity: 0; transform: translateY(6px) scale(.985); } }
  .src.panel[style*="block"] { animation: none; }
  .primary { background: #0a84ff; }
  .primary:hover { background: #2b95ff; }
  /* ---------- chart panel ---------- */
  .chartp { right: 12px; top: 60px; width: 372px; max-height: calc(100vh - 72px); overflow: auto; padding: 14px 14px 0; scrollbar-width: thin; }
  .chartp .cph { display: flex; flex-direction: column; gap: 2px; padding-right: 30px; margin-bottom: 10px; }
  .chartp .cpk { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: rgba(235,235,245,.45); }
  .chartp .cpt .ctl { min-height: 0; }
  .chartp .cpt input { font: 600 17px/1.25 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; letter-spacing: -.01em; background: transparent;
    border: 1px solid transparent; padding: 3px 6px; margin-left: -7px; border-radius: 8px; }
  .chartp .cpt input:hover { background: rgba(255,255,255,.05); }
  .chartp .cpt input:focus { background: rgba(255,255,255,.07); outline: none; box-shadow: 0 0 0 3px rgba(10,132,255,.35); }
  .chartp .cpt .rst { display: none; }
  .types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 12px; }
  .types button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 2px 7px; border-radius: 12px;
    background: rgba(255,255,255,.05); color: rgba(235,235,245,.72); font-size: 11px; font-weight: 500;
    transition: background .15s, color .15s, box-shadow .15s, transform .12s; }
  .types button:hover { background: rgba(255,255,255,.1); color: #fff; }
  .types button:active { transform: scale(.95); }
  .types button.on { background: rgba(10,132,255,.2); color: #fff; box-shadow: inset 0 0 0 1.5px #0a84ff; }
  .types button.on svg { color: #64b5ff; }
  .types svg { width: 26px; height: 22px; }
  .seg { position: relative; display: flex; padding: 2px; margin: 0 0 12px; border-radius: 9px; background: rgba(118,118,128,.24); }
  .seg button { flex: 1; text-align: center; padding: 5px 0; border-radius: 7px; background: transparent; font-size: 12.5px; font-weight: 500;
    color: rgba(235,235,245,.75); transition: background .18s, color .18s, box-shadow .18s; }
  .seg button:hover { background: rgba(255,255,255,.06); }
  .seg button.on { background: #636366; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
  .chartp .msg { font-size: 12px; }
  .chartp details { margin: 0 0 10px; }
  .chartp summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 4px 2px 6px;
    font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: rgba(235,235,245,.5); user-select: none; }
  .chartp summary::-webkit-details-marker { display: none; }
  .chartp summary::before { content: ""; width: 6px; height: 6px; border: solid currentColor; border-width: 0 1.5px 1.5px 0;
    transform: rotate(-45deg); transition: transform .18s; margin: 0 3px 0 2px; }
  .chartp details[open] > summary::before { transform: rotate(45deg); }
  .chartp summary:hover { color: rgba(235,235,245,.8); }
  .chartp .list { border-radius: 12px; background: rgba(255,255,255,.045); overflow: hidden; }
  .chartp .r { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px 6px 12px; min-height: 38px; }
  .chartp .r + .r { box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
  .chartp .r > label { color: rgba(235,235,245,.78); font-size: 13px; flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chartp .r > .ctl { flex: 0 1 58%; justify-content: flex-end; }
  .ctl { display: flex; gap: 6px; align-items: center; min-height: 26px; }
  .chartp input, .chartp select { background: rgba(255,255,255,.07); border: 1px solid transparent; border-radius: 7px; color: #f5f5f7;
    padding: 5px 8px; font: 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; transition: box-shadow .15s, background .15s; }
  .chartp input:focus, .chartp select:focus { outline: none; box-shadow: 0 0 0 3px rgba(10,132,255,.35); background: rgba(255,255,255,.1); }
  .chartp .r input[type=text], .chartp .r input:not([type]), .chartp .r input[type=number] { width: 100%; min-width: 0; text-align: right; }
  .chartp select { -webkit-appearance: none; appearance: none; width: auto; max-width: 100%; padding-right: 24px; cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%23aeaeb2' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center; }
  .ctl input[type=checkbox] { -webkit-appearance: none; appearance: none; position: relative; width: 38px; height: 22px; margin: 0; padding: 0; flex: none;
    border-radius: 11px; background: rgba(120,120,128,.36); cursor: pointer; transition: background .2s; }
  .ctl input[type=checkbox]::before { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
    background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.3); transition: transform .2s cubic-bezier(.3,1.3,.5,1); }
  .ctl input[type=checkbox]:checked { background: #30d158; }
  .ctl input[type=checkbox]:checked::before { transform: translateX(16px); }
  .ctl input[type=color] { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; padding: 0; flex: none; border-radius: 50%;
    border: none; background: none; cursor: pointer; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
  .ctl input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
  .ctl input[type=color]::-webkit-color-swatch { border: none; border-radius: 50%; }
  .ctl input[type=color]::-moz-color-swatch { border: none; border-radius: 50%; }
  .ctl input[type=color].none::-webkit-color-swatch { background: conic-gradient(#8e8e93 25%, #d1d1d6 0 50%, #8e8e93 0 75%, #d1d1d6 0) 0 0/8px 8px; }
  .ctl input[type=color] + input { width: 92px; flex: none; font: 12px ui-monospace, SFMono-Regular, monospace; text-align: left; }
  .ctl input[type=range] { padding: 0; flex: 1; accent-color: #0a84ff; background: none; }
  .ctl .val { width: 34px; color: rgba(235,235,245,.6); font: 12px ui-monospace, monospace; text-align: right; }
  .ctl .code, .ctl .note { color: rgba(235,235,245,.55); font-size: 12px; text-align: right; }
  .ctl .code { color: #ffd60a; font-family: ui-monospace, monospace; }
  .ctl .rst { padding: 2px 4px; background: transparent; color: rgba(235,235,245,.35); flex: none; font-size: 12px; }
  .ctl .rst:hover { color: #fff; background: transparent; }
  .chartp textarea { height: 46vh; border-radius: 10px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08); }
  .dtw { max-height: 46vh; overflow: auto; margin: 4px 0 8px; border-radius: 12px; background: rgba(255,255,255,.045); }
  table.dt { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  .dt th { color: rgba(235,235,245,.55); font-weight: 600; font-size: 11px; text-align: left; padding: 7px 5px 5px; position: sticky; top: 0;
    background: rgba(44,44,46,.97); }
  .dt td { padding: 1px 2px; }
  .dt tr + tr td { box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
  .dt td.n { color: rgba(235,235,245,.3); font: 11px ui-monospace, monospace; padding: 0 4px 0 8px; }
  .dt input { width: 100%; padding: 4px 6px; font: 12.5px ui-monospace, SFMono-Regular, monospace; min-width: 56px; border-radius: 6px; background: transparent; }
  .dt input:hover { background: rgba(255,255,255,.05); }
  .dt .del { padding: 2px 7px; background: transparent; color: rgba(235,235,245,.3); }
  .dt .del:hover { color: #ff453a; background: transparent; }
  .dtitle { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: rgba(235,235,245,.5); margin: 4px 2px 6px; }
  .chartp .addrow { background: transparent; color: #0a84ff; padding: 4px 6px; margin: 0 0 10px; font-weight: 500; }
  .chartp .addrow:hover { background: rgba(10,132,255,.12); }
  .chartp .foot { position: sticky; bottom: 0; margin: 4px -14px 0; padding: 10px 14px 12px; align-items: center;
    background: linear-gradient(rgba(28,28,30,0), rgba(28,28,30,.96) 30%); }
  .chartp .live { margin-right: auto; font-size: 12px; color: rgba(235,235,245,.5); display: flex; align-items: center; gap: 6px; }
  .chartp .live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #48484a; transition: background .2s, box-shadow .2s; }
  .chartp .live.on::before { background: #30d158; box-shadow: 0 0 0 3px rgba(48,209,88,.2); }
  .chartp .foot button { padding: 6px 14px; border-radius: 8px; font-weight: 500; }

</style>
<div class="box hov"><span class="tag"></span></div>
<div class="box sel"></div>
<div class="box drag"></div>
<div class="drop"></div>
<div class="flash"></div>
<div class="ghost"></div>
<div class="bar">
  <span class="status">hotedit</span>
  <button class="undo" title="Undo the last change">↶</button>
  <button class="redo" title="Redo">↷</button>
  <button class="aibtn" title="Ask AI to change the page; it edits live">✨ AI</button>
  <button class="edit" title="Edit this page">✎ Edit</button>
</div>
<div class="tip"></div>
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
  <button data-act="ai" title="Ask AI to change this">✨</button>
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
  <div class="row"><button class="cancel">Cancel</button><button class="primary save">Done</button></div>
</div>
<div class="panel chartp">
  <div class="cph"><span class="cpk"></span><div class="cpt"></div></div>
  <div class="types"></div>
  <div class="seg tabs"><button data-tab="form">Style</button><button data-tab="data">Data</button><button data-tab="code">Code</button></div>
  <p class="msg"></p>
  <div class="tab form"></div>
  <div class="tab data"></div>
  <div class="tab code"><p class="msg spec-label">Full spec</p><textarea spellcheck="false"></textarea></div>
  <div class="row foot"><span class="live">Live preview</span><button class="cancel">Cancel</button><button class="primary apply">Done</button></div>
</div>
<div class="panel ins">
  <h4>Add</h4>
  <div class="where"><button data-w="before">Above</button><button data-w="after">Below</button><button data-w="inside">Inside</button></div>
  <div class="items"></div>
</div>
<div class="panel agentp">
  <button class="x" title="Close">✕</button>
  <h4>✨ Ask AI</h4>
  <div class="ask">
    <div class="scope"><span class="about"></span><button class="whole" title="Let the AI change the whole page">Whole page</button></div>
    <p class="msg pick">Click any block to point the AI at just that block.</p>
    <textarea spellcheck="true" placeholder="What should change? e.g. “Make this shorter and friendlier”, “Turn the bars orange”, “Add a row for March”"></textarea>
    <div class="row"><button class="gear" title="Choose which AI edits the page">⚙ Connect</button><button class="primary go" title="Start">Do it</button></div>
  </div>
  <div class="log"></div>
  <div class="row after"><button class="undoai">↶ Undo AI changes</button><button class="stop">■ Stop</button></div>
  <div class="conn">
    <p class="msg">Pick the AI that edits this page. It changes the page live and every change can be undone.</p>
    <label class="opt"><input type="radio" name="he-prov" value="claude"><b>Claude Code</b><span class="d" data-d="claude"></span>
      <span class="msg">Your Claude plan. Install from <code>claude.com/code</code>, run <code>claude</code> once to log in.</span></label>
    <label class="opt"><input type="radio" name="he-prov" value="codex"><b>Codex</b><span class="d" data-d="codex"></span>
      <span class="msg">Your ChatGPT plan. <code>npm i -g @openai/codex</code>, run <code>codex</code> once to log in.</span></label>
    <label class="opt"><input type="radio" name="he-prov" value="api"><b>Anthropic API key</b><span class="d" data-d="api"></span>
      <span class="msg">Pay per use. Kept only on this computer, or set <code>ANTHROPIC_API_KEY</code>.</span>
      <input class="key" type="password" placeholder="sk-ant-…" autocomplete="off"></label>
    <label class="opt"><input type="radio" name="he-prov" value="command"><b>Other agent</b><span class="d" data-d="command"></span>
      <span class="msg">Any agent CLI with hotedit's tools (<code>npx hotedit mcp</code>), e.g. Gemini, OpenCode, Cursor. The request is added as its last argument (or put <code>{prompt}</code>).</span>
      <input class="cmd" type="text" placeholder="gemini -y" spellcheck="false" autocomplete="off"></label>
    <input class="model" type="text" placeholder="Model (optional)">
    <div class="row"><button class="back">Back</button><button class="primary savec">Done</button></div>
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
  <div class="row"><button class="reset">Clear all</button><button class="cancel">Cancel</button><button class="primary apply">Done</button></div>
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
  let reloading = false;
  const reload = (sel) => {
    reloading = true;
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
    let top = above ? r.top - h - 6 : Math.max(4, Math.min(r.top + 4, innerHeight - h - 4));
    let left = Math.max(4, Math.min(above ? r.left : r.right - w - 4, innerWidth - w - 8));
    // Never cover the top bar (Done must stay reachable): slide left of it,
    // or drop below the block.
    const b = $(".bar").getBoundingClientRect();
    if (top < b.bottom + 4 && top + h > b.top - 4 && left + w > b.left - 6) {
      if (b.left - w - 10 >= 4) left = b.left - w - 10;
      else top = Math.min(innerHeight - h - 4, Math.max(r.bottom + 6, b.bottom + 6));
    }
    bb.style.top = top + "px";
    bb.style.left = left + "px";
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
    // Plain HTML blocks become editable at once, so typing straight after
    // the click isn't lost; the source check below confirms (or undoes) it.
    const plain = !(el instanceof SVGElement) && !/^(IMG|BR|HR|INPUT|IFRAME|VIDEO|CANVAS|SCRIPT|STYLE)$/.test(el.tagName);
    let checked;
    const early = plain ? startTyping(el, id, opts, point) : null;
    if (early) early.check = new Promise((r) => (checked = r));
    let sig;
    try {
      sig = await sigOf(el);
    } catch (e) {
      if (early) {
        checked(false);
        if (editing === early) finish(false);
      }
      return say(e.message, true);
    }
    if (early) {
      const ok = domMatchesSource(early.snap, sig);
      checked(ok);
      if (ok) return;
      if (editing === early) await finish(false);
      return openSource(
        el,
        sig,
        "This block was rewritten by a page script (math, diagram, widget…). Edit its HTML source:",
      );
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
  };

  const startTyping = (el, id, opts, point) => {
    // `snap`: the block as it was, for the source check.
    editing = { el, id, before: el.innerHTML, fresh: !!opts.fresh, snap: el.cloneNode(true) };
    caretStyle.textContent = `[data-he="${id}"][contenteditable]{caret-color:${caretFor(el)}!important}`;
    document.head.appendChild(caretStyle);
    el.setAttribute("contenteditable", "true");
    el.focus();
    clickAt = point;
    placeCaret(el, opts.selectAll);
    clickAt = null;
    say("Typing — Enter saves · Esc cancels");
    return editing;
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
    const { el, id, before, check } = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    caretStyle.remove();
    if (!save || el.innerHTML === before) {
      el.innerHTML = before;
      if (stale) return reload();
      return say("No change");
    }
    // Left before the source check came back: never save a script's output.
    if (check && !(await check)) {
      el.innerHTML = before;
      return say("That block is drawn by a script — click it again to edit its source", true);
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
    if (p.querySelector(":scope > .x")) continue;
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

  // Tooltips: what a button does and its shortcut, shown on hover.
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = MAC ? "⌘" : "Ctrl+";
  const ALT = MAC ? "⌥" : "Alt+";
  const KEYS = [
    [".edit", "E"],
    [".undo", MOD + "Z"],
    [".redo", (MAC ? "⇧⌘" : "Ctrl+Shift+") + "Z"],
    [".aibtn, [data-act=ai]", "A"],
    ["[data-act=style]", "S"],
    ["[data-act=insert]", "I"],
    ["[data-act=drag]", `${ALT}↑ / ${ALT}↓`],
    ["[data-act=parent]", "P"],
    ["[data-act=up]", ALT + "↑"],
    ["[data-act=down]", ALT + "↓"],
    ["[data-act=duplicate]", MOD + "D"],
    ["[data-act=remove]", MAC ? "⌫" : "Delete"],
    [".primary.save, .primary.apply, .savec, .go", MOD + "↵"],
    [".cancel, .panel > .x", "Esc"],
  ];
  const keyOf = (b) => {
    const k = KEYS.find(([sel]) => b.matches(sel));
    return k ? k[1] : "";
  };
  for (const b of root.querySelectorAll(".menu button")) {
    const k = keyOf(b);
    if (k) b.insertAdjacentHTML("beforeend", `<kbd>${k}</kbd>`);
  }
  const tip = $(".tip");
  let tipFor = null;
  let tipTimer = 0;
  const hideTip = () => {
    clearTimeout(tipTimer);
    tip.style.display = "none";
    tipFor = null;
  };
  root.addEventListener("pointerover", (e) => {
    const b = e.target.closest && e.target.closest("button, [title], [data-tip]");
    if (!b || b === tipFor) return;
    hideTip();
    // Our tooltip replaces the slow native one.
    if (b.title) {
      b.dataset.tip = b.title;
      b.removeAttribute("title");
    }
    const label = b.dataset.tip || "";
    const key = b.closest(".menu") ? "" : keyOf(b);
    if (!label && !key) return;
    tipFor = b;
    tipTimer = setTimeout(() => {
      if (tipFor !== b || !b.isConnected) return;
      tip.textContent = label;
      if (key) tip.insertAdjacentHTML("beforeend", `<kbd>${key}</kbd>`);
      tip.style.display = "block";
      const r = b.getBoundingClientRect();
      const w = tip.offsetWidth,
        h = tip.offsetHeight;
      const below = r.bottom + 6 + h < innerHeight;
      tip.style.top = (below ? r.bottom + 6 : r.top - h - 6) + "px";
      tip.style.left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 4)) + "px";
    }, 350);
  });
  root.addEventListener("pointerout", (e) => {
    if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip();
  });
  root.addEventListener("pointerdown", hideTip, true);

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
  bb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.target.closest(".grip") && selected && e.button === 0) return startDrag(selected, e);
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
        if (isMarker(ch.value) || ch.path[0] === "type" || ch.path[1] === "indexAxis") continue;
        setPath(chart.config, ch.path, ch.value === undefined ? undefined : clone(ch.value));
      }
      if (chs.some((ch) => ch.path[0] === "type" || (ch.path[0] === "options" && ch.path[1] === "indexAxis"))) {
        // A new chart type needs a new chart; reuse the live data and options
        // so code values (callbacks) keep working.
        const { data, options, plugins } = chart.config;
        if (to[1].options && "indexAxis" in to[1].options) options.indexAxis = to[1].options.indexAxis;
        else delete options.indexAxis;
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

  // Chart-type tile icons (24×20, drawn in currentColor).
  const ic = (body) => `<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const TYPE_ICONS = {
    bar: ic('<path d="M4 18V10M9.5 18V4M15 18V8M20.5 18V12" stroke-width="3.2"/>'),
    hbar: ic('<path d="M3 4h10M3 8.7h17M3 13.3h7M3 18h13" stroke-width="2.8"/>'),
    line: ic('<path d="M2 16l6-6 4 3 9-10"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="13" r="1.3" fill="currentColor"/>'),
    area: ic('<path d="M2 17l6-7 4 3 10-9v13z" fill="currentColor" fill-opacity=".35"/><path d="M2 17l6-7 4 3 10-9"/>'),
    scatter: ic('<circle cx="5" cy="14" r="1.8" fill="currentColor"/><circle cx="10" cy="9" r="1.8" fill="currentColor"/><circle cx="14" cy="13" r="1.8" fill="currentColor"/><circle cx="19" cy="5" r="1.8" fill="currentColor"/><circle cx="17" cy="11" r="1.8" fill="currentColor"/>'),
    pie: ic('<circle cx="12" cy="10" r="8"/><path d="M12 2v8h8" fill="currentColor" fill-opacity=".45"/><path d="M12 2a8 8 0 0 1 8 8h-8z" fill="currentColor" fill-opacity=".45"/>'),
    doughnut: ic('<circle cx="12" cy="10" r="7.5" stroke-width="3.5" stroke-opacity=".45"/><path d="M12 2.5a7.5 7.5 0 0 1 7.5 7.5" stroke-width="3.5"/>'),
    box: ic('<path d="M7 3v3M7 14v3M17 5v3M17 13v4"/><rect x="4.5" y="6" width="5" height="8" rx="1"/><rect x="14.5" y="8" width="5" height="5" rx="1"/><path d="M4.5 10h5M14.5 10.5h5"/>'),
    histogram: ic('<path d="M3 18V12h4V6h4V3h4v6h4v9z" fill="currentColor" fill-opacity=".35"/><path d="M3 18V12h4V6h4V3h4v6h4v9"/>'),
    polarArea: ic('<path d="M12 10V2a8 8 0 0 1 7 4z M12 10l7-4a8 8 0 0 1-2 10z M12 10l5 6a8 8 0 0 1-11 0z" fill="currentColor" fill-opacity=".4"/><circle cx="12" cy="10" r="8" stroke-opacity=".4"/>'),
    radar: ic('<path d="M12 2l8 6-3 10H7L4 8z" stroke-opacity=".45"/><path d="M12 5l5 4-2 6H9.5L7 9z" fill="currentColor" fill-opacity=".35"/>'),
    bubble: ic('<circle cx="7" cy="13" r="3.5"/><circle cx="16" cy="7" r="4.5" fill="currentColor" fill-opacity=".3"/><circle cx="17" cy="15.5" r="2"/>'),
    point: ic('<circle cx="5" cy="14" r="2"/><circle cx="10" cy="8" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="19" cy="5" r="2"/>'),
    circle: ic('<circle cx="5" cy="14" r="2" fill="currentColor"/><circle cx="10" cy="8" r="2.6" fill="currentColor"/><circle cx="15.5" cy="12" r="2.2" fill="currentColor"/><circle cx="19.5" cy="5" r="1.6" fill="currentColor"/>'),
    tick: ic('<path d="M5 6v8M9 4v8M13 8v8M17 5v8M21 9v7"/>'),
    arc: ic('<circle cx="12" cy="10" r="8"/><path d="M12 2a8 8 0 0 1 8 8h-8z" fill="currentColor" fill-opacity=".45"/>'),
    donut: ic('<circle cx="12" cy="10" r="7.5" stroke-width="3.5" stroke-opacity=".45"/><path d="M12 2.5a7.5 7.5 0 0 1 7.5 7.5" stroke-width="3.5"/>'),
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
    $(".chartp .cpk").textContent = { plotly: "Plotly chart", chartjs: "Chart.js chart", vega: "Vega-Lite chart", mermaid: "Mermaid diagram" }[c.kind];
    const live = $(".chartp .live");
    live.classList.remove("on");
    live.textContent = "Live preview";
    note.textContent = isMermaid
      ? "Diagram source (Mermaid). Preview updates as you type."
      : opaque
        ? "This chart's spec is computed by code, so it can't be edited here — use </> on the script."
        : "";

    // Clicks preview at once; typing waits a beat.
    const changed = (structural) => {
      syncJson();
      schedule(structural ? 0 : 140);
      if (structural) {
        renderForm();
        renderTypes();
      }
    };

    // One form row: label + control. `k` comes from chartform.build().
    const control = (k) => {
      const lab = document.createElement("label");
      lab.textContent = k.label;
      lab.title = k.label;
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
        // transparent / unset: a checkerboard instead of a misleading black
        sw.classList.toggle("none", !colourHex(k.raw) && !colourHex(k.placeholder));
        sw.oninput = () => {
          sw.classList.remove("none");
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

    const titleSlot = $(".chartp .cpt");
    const renderForm = () => {
      const y = panel.scrollTop;
      form.innerHTML = "";
      titleSlot.innerHTML = "";
      if (isMermaid || opaque) return;
      const { sections } = CF.build(c.kind, state, orig, hintsOf(c, el));
      // The chart title lives in the header, like a document name.
      const first = sections[0] && sections[0].controls;
      const ti = first ? first.findIndex((k) => k.label === "title" && k.type === "text" && !k.code) : -1;
      if (ti >= 0) {
        const [, box] = control(first[ti]);
        box.querySelector("input").placeholder = "Add a title";
        titleSlot.appendChild(box);
        first.splice(ti, 1);
      }
      // Chart-wide type controls are the tiles above; per-series ones stay.
      const hasTypes = !!CF.chartTypes(c.kind, state, orig);
      const TILE_PATHS = new Set(
        c.kind === "chartjs" ? ['["1","type"]', '["1","options","indexAxis"]'] : c.kind === "vega" ? ['["1","mark"]', '["1","layer","0","mark"]'] : [],
      );
      sections.forEach((s, n) => {
        if (!s.controls.length || (hasTypes && s.controls.every((k) => TILE_PATHS.has(JSON.stringify(k.path.map(String)))))) return;
        const d = document.createElement("details");
        const keyOf = c.kind + "|" + s.title.replace(/ · .*/, "");
        d.open = sectionOpen.has(keyOf) ? sectionOpen.get(keyOf) : !s.closed && n < 2;
        d.ontoggle = () => sectionOpen.set(keyOf, d.open);
        const sum = document.createElement("summary");
        sum.textContent = s.title;
        const list = document.createElement("div");
        list.className = "list";
        for (const k of s.controls) {
          if (hasTypes && TILE_PATHS.has(JSON.stringify(k.path.map(String))) && !k.code) continue;
          const r = document.createElement("div");
          r.className = "r";
          r.append(...control(k));
          list.appendChild(r);
        }
        d.append(sum, list);
        form.appendChild(d);
      });
      if (!form.children.length) form.textContent = "No editable settings found — use Data or Code.";
      panel.scrollTop = y;
    };

    // One-click chart types, previewed live.
    const typesBox = $(".chartp .types");
    const renderTypes = () => {
      typesBox.innerHTML = "";
      const t = !isMermaid && !opaque && CF.chartTypes(c.kind, state, orig);
      typesBox.style.display = t ? "" : "none";
      if (!t) return;
      for (const o of t.options) {
        const b = document.createElement("button");
        b.dataset.type = o.id;
        b.className = o.id === t.current ? "on" : "";
        b.innerHTML = (TYPE_ICONS[o.id] || TYPE_ICONS.bar) + "<span></span>";
        b.lastChild.textContent = o.label;
        b.title = o.label;
        b.onclick = () => {
          CF.chartTypes(c.kind, state, orig).apply(o.id);
          renderData();
          tabBtn("data").style.display = tables.length ? "" : "none";
          changed(true);
        };
        typesBox.appendChild(b);
      }
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
    const schedule = (delay = 140) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          if (isMermaid) {
            const m = await getMermaid();
            const { svg } = await m.render("he-mmd-" + Date.now(), decodeMermaid(ta.value));
            el.innerHTML = svg;
            previewed = true;
          } else {
            if (await previewChart(c, el, shown, state)) {
              shown = clone(state);
              previewed = true;
            } else {
              live.textContent = "No live preview · Apply to save";
              return;
            }
          }
          live.classList.add("on");
          live.textContent = "Live preview";
          showSelected();
        } catch (e) {
          live.classList.remove("on");
          live.textContent = "Preview failed";
          say("preview: " + e.message, true);
        }
      }, delay);
    };
    ta.oninput = () => {
      if (isMermaid) return schedule();
      try {
        const v = JSON.parse(ta.value);
        state = c.specs.length === 1 ? { [c.specs[0].arg]: v } : v;
        ta.style.borderColor = "";
        renderForm();
        renderTypes();
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
    renderTypes();
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
    const words = agTarget && !chartAt(agTarget) ? (agTarget.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50) : "";
    $(".agentp .about").textContent = agTarget ? `Only changes: ${nameOf(agTarget)}${words ? ` “${words}”` : ""}` : "Can change: the whole page";
    $(".agentp .about").title = "Click any block on the page to point the AI at just that block";
    $(".agentp .whole").style.display = agTarget ? "" : "none";
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
    $(".agentp .cmd").value = agInfo.command || "";
  };
  const agLoad = async () => {
    agInfo = await api("GET", "/agent");
    if (agInfo.job) agJob = agInfo.job;
    const p = agInfo.providers.find((x) => x.id === agInfo.provider);
    $(".agentp .gear").textContent = p ? `⚙ ${p.name}` : "⚙ Connect AI";
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
  // One panel at a time: an open style/chart/HTML panel is saved (as Done
  // would) so the AI's live updates aren't held back behind it.
  const saveOpenPanel = async () => {
    if (!modal) return true;
    const m = modal;
    closePanel(true);
    if (m.save) await m.save();
    return !reloading;
  };
  const openAgent = async (el) => {
    if (!editMode) setMode(true);
    if (!(await saveOpenPanel())) return;
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
  $(".agentp .cmd").onfocus = () => (root.querySelector('.agentp input[value="command"]').checked = true);
  $(".agentp .savec").onclick = async () => {
    const prov = root.querySelector(".agentp input[name=he-prov]:checked");
    const body = { provider: prov ? prov.value : "", model: $(".agentp .model").value };
    if ($(".agentp .key").value.trim()) body.apiKey = $(".agentp .key").value.trim();
    if (body.provider === "command") body.command = $(".agentp .cmd").value;
    try {
      await api("POST", "/agent/config", body);
      await agLoad();
      const p = agInfo.providers.find((x) => x.id === agInfo.provider);
      const need = { api: "Paste an API key first", command: "Type your agent's command first", claude: "Install Claude Code first, then run `claude` to log in", codex: "Install Codex first, then run `codex` to log in" };
      if (p && !p.available) return say(need[p.id], true);
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
    if (!(await saveOpenPanel())) return;
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
    }
    else {
      finish(true);
      closePanel();
      revealHidden.remove();
      select(null);
      showHover(null);
    }
    say(on ? "Click text to type · click a block for tools" : "hotedit");
  };
  // Done saves whatever is open (text, a panel) and stops editing.
  const done = async () => {
    if (modal) sessionStorage.setItem("he-edit", "0");
    if (!(await saveOpenPanel())) return;
    if (editing) await finish(true);
    setMode(false);
  };
  editBtn.onclick = () => (editMode ? done() : setMode(true));
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
      if (modal) return switchFromPanel(e);
      // With ✨ open, a click points the AI at a block (no typing or chart
      // panel, which would hold back its live updates).
      if (ag.style.display === "block") {
        if (editing) finish(true);
        return select(pick(e.target));
      }
      if (editing) finish(true);
      const el = pick(e.target);
      showHover(null);
      clickAt = { x: e.clientX, y: e.clientY };
      if (el) begin(el);
      else select(null);
    },
    true,
  );

  // Clicking another block while a panel is open saves the panel (like
  // Apply) and goes straight on to the clicked block.
  const switchFromPanel = async (e) => {
    const next = pick(e.target);
    if (!next || next === selected || (selected && selected.contains(next) && chartAt(selected))) return;
    const m = modal;
    // If saving reloads the page, pick the block up again afterwards.
    sessionStorage.setItem("he-next", `${VERSION}:${idOf(next)}`);
    closePanel(true);
    if (m.save) await m.save();
    if (reloading) return; // the reloaded page opens `next`
    sessionStorage.removeItem("he-next");
    showHover(null);
    clickAt = { x: e.clientX, y: e.clientY };
    begin(next);
  };

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
      const plainKey = !e.metaKey && !e.ctrlKey && !e.altKey;
      const k = e.key.toLowerCase();
      if (k === "e" && plainKey) editMode ? done() : setMode(true);
      else if (k === "a" && plainKey) {
        e.preventDefault();
        ag.style.display === "block" ? agShow(false) : openAgent(selected);
      } else if (selected && editMode && plainKey && (k === "s" || k === "i" || k === "p")) {
        e.preventDefault();
        bb.querySelector(`[data-act="${{ s: "style", i: "insert", p: "parent" }[k]}"]`).click();
      } else if (selected && editMode && k === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        menu.querySelector('[data-act="duplicate"]').click();
      } else if (selected && editMode && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        menu.querySelector('[data-act="remove"]').click();
      }
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
  };
  window.addEventListener("scroll", follow, true);
  window.addEventListener("resize", follow);

  // Show a change made elsewhere (the AI, another tab, the file on disk) in
  // place, without a reload. Returns false when the page has to reload.
  const at = (id) => document.querySelector(`[data-he="${id}"]`);
  const applyLive = async (d) => {
    const p = d.patch;
    if (!p || d.base !== VERSION || editing || modal || reloading) return false;
    const old = charts;
    if (p.kind === "attrs") {
      const el = at(p.id);
      if (!el) return false;
      for (const k of p.remove) el.removeAttribute(k);
      for (const [k, v] of Object.entries(p.set)) {
        if (k !== "class") el.setAttribute(k, v);
        else {
          // Keep classes a page script added (e.g. Plotly's).
          const was = p.was.split(/\s+/).filter(Boolean);
          for (const c of was) el.classList.remove(c);
          for (const c of v.split(/\s+/).filter(Boolean)) el.classList.add(c);
        }
      }
      if (p.remove.includes("class")) for (const c of p.was.split(/\s+/).filter(Boolean)) el.classList.remove(c);
      window.dispatchEvent(new Event("resize")); // charts follow a new size
    } else if (p.kind === "text" || p.kind === "title") {
      const el = at(p.id);
      if (!el) return false;
      el.textContent = p.text;
    } else if (p.kind === "script") {
      // Chart code: redraw the charts whose spec changed.
      await loadCharts();
      if (charts.length !== old.length) return false;
      let drawn = 0;
      for (let i = 0; i < charts.length; i++) {
        const a = old[i],
          c = charts[i];
        if (JSON.stringify(a.specs) === JSON.stringify(c.specs)) continue;
        const el = chartEl(c);
        if (a.kind !== c.kind || !el || c.specs.some((x) => x.opaque)) return false;
        const spec = (x) => Object.fromEntries(x.specs.map((v) => [v.arg, v.value]));
        if (!(await previewChart(c, el, spec(a), spec(c)))) return false;
        drawn++;
      }
      if (!drawn) return false;
    } else if (p.kind === "html") {
      const parent = at(p.parent);
      const olds = p.remove.map(at);
      if (!parent || olds.some((x) => !x || x.parentElement !== parent)) return false;
      const mmd = olds.length === 1 && old.find((c) => c.kind === "mermaid" && c.element === p.remove[0]);
      if (!mmd && olds.some((x, i) => !domMatchesSource(x, p.sigs[i]))) return false;
      const anchor = p.at.replace ? olds[0] : p.at.before != null ? at(p.at.before) : p.at.after != null ? at(p.at.after) : null;
      if (!p.at.end && !anchor) return false;
      const t = document.createElement("template");
      t.innerHTML = p.html;
      if (mmd) {
        const src = t.content.firstElementChild;
        if (!src || src.tagName !== olds[0].tagName) return false;
        const m = await getMermaid();
        const { svg } = await m.render("he-mmd-" + Date.now(), decodeMermaid(src.innerHTML));
        src.innerHTML = svg;
      }
      if (p.shift) {
        for (const x of [...document.querySelectorAll("[data-he]")]) {
          const v = Number(x.dataset.he);
          if (v > p.last && !olds.some((o) => o.contains(x))) x.dataset.he = String(v + p.shift);
        }
      }
      // Whitespace between replaced elements goes with them.
      for (let i = 1; i < olds.length; i++) {
        for (let n = olds[i - 1].nextSibling; n && n !== olds[i]; n = n.nextSibling) if (n.nodeType === 3 && !n.data.trim()) n.data = "";
      }
      if (p.at.replace) olds[0].before(t.content);
      else if (p.at.before != null) anchor.before(t.content);
      else if (p.at.after != null) anchor.after(t.content);
      else parent.append(t.content);
      for (const x of olds) x.remove();
    } else return false;
    VERSION = d.version;
    await loadCharts();
    if (selected && !selected.isConnected) selected = at(idOf(selected)) || null;
    if (agTarget && !agTarget.isConnected) {
      agTarget = at(idOf(agTarget));
      agScope();
    }
    if (hover && !hover.isConnected) showHover((hover = null));
    showSelected();
    refreshState();
    if (d.flash != null) flash(d.flash);
    return true;
  };
  let liveQueue = Promise.resolve();

  // Live updates when the file changes (e.g. the AI or an agent edited it).
  const es = new EventSource(ORIGIN + "/__he/events");
  es.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.type === "agent") {
      agJob = d.job;
      return agRender();
    }
    if (d.type !== "reload" || d.except === CLIENT) return;
    liveQueue = liveQueue.then(async () => {
      if (reloading) return;
      if (await applyLive(d).catch(() => false)) return;
      if (d.flash != null) sessionStorage.setItem("he-flash", String(d.flash));
      if (!editing && !modal) return reload();
      stale = true;
      say("file changed on disk — finish or Esc to reload", true);
    });
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
    const nx = (sessionStorage.getItem("he-next") || "").split(":");
    sessionStorage.removeItem("he-next");
    if (editMode && nx[0] === String(VERSION)) {
      const el = document.querySelector(`[data-he="${nx[1]}"]`);
      if (el) setTimeout(() => begin(el), 0);
    } else if (editMode && s != null) {
      const el = document.querySelector(`[data-he="${s}"]`);
      select(el);
      if (fresh && el) startNew(el, fresh);
    }
    refreshState();
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
    get version() {
      return VERSION;
    },
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
