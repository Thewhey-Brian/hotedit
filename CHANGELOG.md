# Changelog

## 0.3.0 — 2026-10-21

- ✨ **Ask AI, live**: select a block (or the whole page), say what should
  change, and Claude edits the file while you watch; each change glows as it
  lands, and *Undo AI changes* reverts the request. Connect once with your
  Claude login (via Claude Code) or an Anthropic API key. Notes moved into the
  same panel (*Leave as note*).
- `hotedit mcp`: an MCP server so coding agents (Claude Code, Codex, Cursor…)
  can open a report in your browser and edit it live (`open`, `outline`,
  `read`, `edit`, `notes`, `resolve_note`).
- Redesigned chart panel: one-click chart-type tiles (bar, horizontal bars,
  line, area, dots, pie, donut, polar, radar, box, histogram…) that redraw
  the chart live and switch back without touching the file; the title edits
  in the header; settings in grouped rows with switches and pop-up menus;
  Style · Data · Code as a segmented control; faster live preview. Round
  Chart.js types set the x/y axes aside and restore them on the way back.
- The text caret takes each block's colour, or black/white against its
  background, so it shows on dark, coloured and gradient sections; selection
  outlines show on any background.

## 0.2.0 — 2026-10-20

- `hotedit demo`: open a rich sample report (Plotly, Chart.js, Vega-Lite,
  Mermaid, KaTeX) in a throwaway copy.
- New recorded tour (`demo/hotedit-tour.mp4`, README GIF).
- Chart variables that the script fills in later (`ys.push(…)`,
  `layout.height = …`) are treated as code instead of showing their empty
  initial value.
- After saving a block's source (maths, diagrams, Edit HTML) the page
  reloads so the new version renders; the source box fits its content.

## 0.1.0 — 2026-10-20

First public release.

- Click-to-edit text in any HTML file, saved back as minimal source patches
  (entities, quotes, indentation and comments elsewhere stay byte-identical).
- Block toolbar: ＋ insert (paragraph, headings, lists, list items, box, quote,
  table, code, divider, image, chart, diagram, custom HTML), Aa style, drag ⠿
  to move, ⋯ for move up/down, duplicate, hide, delete and Edit HTML.
- Chart editing for Plotly, Chart.js, Vega-Lite and Mermaid: a Chart form
  (dropdowns, checkboxes, colours), an editable Data table and the full Code,
  with live preview; specs patched in the source's own style.
- 💬 notes for AI agents with a `hotedit comments` CLI and a Claude Code skill
  (`hotedit skill install`).
- `hotedit` with no file opens a launcher listing the HTML files in a folder.
- Safety: session backups, undo/redo, live reload on external changes, a
  structure version against stale pages, UTF-8 guard, local-only server
  with a per-session token.
