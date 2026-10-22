---
name: hotedit
description: Use whenever you generate an HTML report, dashboard or page for the user, so they can edit it by hand afterwards (text, styles, layout, charts) with hotedit, and whenever the user mentions hotedit or editing an HTML file in the browser.
---

# hotedit: HTML reports that people can edit

The user edits HTML in the browser with **hotedit**. They click text and type, restyle and
drag blocks around, and tweak charts in a form. Every change is saved back into the file as
a small patch. They can also ask an AI from inside the page (✨) to change a block they select.

## 1. When you write an HTML report, make it easy to edit

- **Put text in the HTML**, not in JavaScript that builds the page. Text inside `<h2>`,
  `<p>`, `<li>`, `<td>` and so on is directly editable; text produced by script is not.
- **Write chart specs as literals in an inline `<script>`.** hotedit can then edit titles,
  labels, colours, axes and data in a form:
  - Plotly: `Plotly.newPlot('id', [{x: [...], y: [...], type: 'bar'}], {title: {text: '…'}})`
  - Chart.js: `new Chart(document.getElementById('id'), {type: 'bar', data: {...}, options: {...}})`
  - Vega-Lite: `const spec = {...}; vegaEmbed('#id', spec)`
  - Mermaid: `<pre class="mermaid">…</pre>`

  Keep data inline, as arrays in the spec, rather than fetched or computed at runtime.
- **Use plain blocks** (sections, headings, paragraphs, lists, tables) with styles in a
  `<style>` block or `style` attributes. Avoid canvas-drawn text and shadow DOM for content.
- **Keep it one self-contained file.** Inline small images as `data:` URIs, or put them next
  to the file.

## 2. Open it for the person

When you've written the report, open it in hotedit so the person can start editing:

- If a hook message says **"hotedit: Opened … in hotedit at http://…"** (or "Already open"),
  it's already in their browser. Just say so and give the link.
- If you have the hotedit MCP tools, call `open` with the file.
- Otherwise run this yourself. It returns at once, opens their browser, and the server stops
  by itself once the page has been closed for a while:

  ```bash
  npx -y hotedit open report.html --background
  ```

Then tell them: click **✎ Edit** (or ⌥E), click any text to edit, select a block for its
toolbar (＋ add, Aa style, drag ⠿ to move), or click ✨ to ask an AI to change a block.
After that, edits you make to the file show up on their page live, without a reload.

## 3. Edit live with the hotedit MCP tools (if you have them)

If tools named `hotedit` (`open`, `outline`, `read`, `edit`) are
available, prefer them for changes to a report the user is looking at:

1. `open` the file: it appears in the user's browser (or is already open there).
2. `outline` to find elements, `read` an element for its exact source, then `edit`
   (exact find/replace). Each edit is saved and shown to the user at once, so make small,
   targeted edits and leave the rest of the file alone.

Without them, edit the file directly; an open hotedit page updates live on its own.
To set the tools up: `claude mcp add hotedit -- npx -y hotedit mcp` (Codex:
`codex mcp add hotedit -- npx -y hotedit mcp`).
