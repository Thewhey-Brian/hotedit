# Changelog

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
- 💬 notes for AI agents with a `htmledit comments` CLI and a Claude Code skill
  (`htmledit skill install`).
- `htmledit` with no file opens a launcher listing the HTML files in a folder.
- Safety: session backups, undo/redo, live reload on external changes, a
  structure version against stale pages, UTF-8 guard, local-only server
  with a per-session token.
