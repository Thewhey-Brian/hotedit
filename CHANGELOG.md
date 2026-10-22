# Changelog

## Unreleased

- **Auto-open for agents**: `hotedit skill install` now also adds a hook, so
  every HTML report Claude Code writes opens in hotedit in your browser
  automatically (`--codex` for Codex; `--no-auto` for the skill only;
  `hotedit skill uninstall` removes both). App and site pages, templates and
  pages already open are left alone.
- `hotedit open report.html --background` returns at once and serves the page
  from a background server that stops by itself once the page has been
  closed for a while.
- The repository is now github.com/Thewhey-Brian/hotedit.
- New narrated tour video (voice-over, sound and music) covering the ✨ chat,
  the model label and agent auto-open.
- ✨ is now a chat: the conversation and the AI's progress are on top, the
  box is at the bottom for follow-ups ("now make it shorter"), and the AI is
  told what was asked and done earlier in the chat. **New chat** starts over
  (earlier changes stay); *Undo AI changes* takes back the last request.
- ✨ shows which AI and model answer (e.g. *Claude Code · Opus 5.5*, *Codex ·
  gpt-…*), next to ⚙ and under every reply, as reported by the AI itself
  when it can.

## 0.4.0 — 2026-10-21

- ✨ works with more AIs: **Codex** (your ChatGPT login) next to Claude Code
  and an Anthropic API key, plus **Other agent**: any agent CLI that has
  hotedit's MCP tools (Gemini CLI, OpenCode, Cursor…), run with a command you
  type. Agent CLIs are detected whenever ✨ opens (no restart after
  installing), including installs outside the PATH (Homebrew, npm-global,
  nvm, Volta, Bun); Gemini CLI, OpenCode and Cursor get one-click commands.
- Point the AI at one block: click a block and the request changes only that
  block (a chart's own code counts as the chart). Edits anywhere else are
  rejected, whatever the AI tries.
- No more blinking: AI edits (and edits from other tabs or agents) now show
  up in place, without reloading the page. Charts redraw, styles and new
  list items appear, and the page keeps its scroll and state.
- Hover any button to see what it does and its shortcut. Every hotedit
  shortcut is now ⌥/Alt + a key (⌥E edit, ⌥A ✨ AI, ⌥S style, ⌥I add, ⌥P
  the block around, ⌥D duplicate, ⌥H edit HTML, ⌥⌫ delete, ⌥↑/↓ move), so
  plain keys never clash with typing or with the page's own keys. The bare
  E key no longer toggles editing.
- Done is always in the same place (top right) and saves whatever is open,
  text or a panel; every panel's main button is now Done. The block toolbar
  never covers it.
- Removed notes (💬, *Leave as note*, `hotedit comments`, the `notes` /
  `resolve_note` MCP tools): ask the AI directly instead.

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
- Click from block to block: the block you click is editable immediately
  (keystrokes right after the click are no longer lost while the previous
  save is in flight), and clicking another block while a panel is open
  (style, chart, HTML source, link) saves it and moves straight on.
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
