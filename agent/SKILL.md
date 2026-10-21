---
name: hotedit
description: Use whenever you generate an HTML report, dashboard or page for the user, so they can edit it by hand afterwards (text, styles, layout, charts) with hotedit, and whenever the user mentions hotedit, editing an HTML file in the browser, or the notes/comments they left in one.
---

# hotedit: HTML reports that people can edit

The user edits HTML in the browser with **hotedit**. They click text and type, restyle and
drag blocks around, and tweak charts in a form. Every change is saved back into the file as
a small patch. Anything bigger, they leave as a 💬 note for you.

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

## 2. Hand it over

After writing `report.html`, tell the user how to open it:

```bash
npx hotedit report.html   # or `hotedit report.html` if installed
```

Then: press **E**, click any text to edit, and select a block for its toolbar (＋ add, Aa
style, drag ⠿ to move, 📊 chart). Don't launch it yourself unless they ask, because it opens
a browser and keeps a server running.

## 3. Act on their notes

When the user mentions notes or comments, or asks you to "check the report":

```bash
hotedit comments report.html            # open notes as markdown: request, quoted text, line, CSS path, source snippet
hotedit comments report.html --json     # the same, machine-readable (`at` = element id, `line` = current line)
hotedit comments report.html --wait --timeout 1800   # wait for the next note
```

For each note:

1. Edit the HTML file to do what it asks. Small, targeted edits are best: the user's other
   hand edits are in the file too, and the open editor reloads live.
2. Run `hotedit comments report.html --resolve <id> --note "<what you did>"`.

Never edit `.htmledit/*.comments.json` by hand; always use the CLI. If `hotedit` isn't on
the PATH, use `npx hotedit comments …`.
