# Architecture

How htmledit turns a browser edit into a minimal patch on the original file.

## Core design

- `src/doc.js` parses the file with parse5 source locations. Every source
  element gets an id (document order). The served copy has ` data-he="id"`
  spliced into each start tag (original bytes otherwise untouched) plus the
  overlay `<script>` at EOF. The file on disk is never instrumented.
- Edits arrive as DOM `innerHTML` of an element. `renderChildren` maps the new
  DOM back to source: nodes that are still source nodes reuse their original
  bytes, only new/changed nodes are serialised, then the replacement is
  trimmed to the differing bytes (`minimal`). Handles parser-implied
  `<tbody>`, `<pre>` leading newline, implicit end tags, SVG self-closing.
- Script-rewritten DOM (KaTeX, Mermaid, widgets) is detected by comparing the
  live subtree with the source signature (descendant ids + text). Mismatch →
  edit the element's HTML source in a panel instead, so rendered output never
  leaks into the file.
- `src/server.js`: local server (127.0.0.1, random port, per-session token),
  serves the file's directory for relative assets, undo/redo stacks of full
  file states, backups in `~/.htmledit/backups/`, disk poller + SSE live
  reload, structure `version` so a stale page can never patch wrong ids.
- `src/overlay.js`: shadow-DOM toolbar + highlight; edit mode (E), click →
  select + contenteditable, Enter/⌘S save, Esc cancel (2nd Esc deselects),
  ⌘Z/⇧⌘Z undo/redo. Block bar on the selection: parent ⬑, style Aa, move
  ↑/↓, duplicate, hide (`hidden` attr; dimmed-visible in edit mode), delete,
  image swap, link URL, `</>` source.
- M3 ops (`POST /op`): `attr`, `style` (merged into the SOURCE style attr, so
  runtime inline styles/classes set by page scripts never leak), `remove` /
  `duplicate` (whole-line aware), `move` (swap with sibling element). Structural
  ops always bump the version + reload; the server maps the moved/duplicated
  element's new offset back to an id so the selection survives the reload.
  Image swap: data-URI images stay inline; file images are written to
  `<name>_assets/` next to the HTML and referenced relatively.
- M4 `src/charts.js`: code mask (strings/comments blanked) → find
  `Plotly.newPlot|react|plot`, `new Chart`, `vegaEmbed` calls in inline
  scripts + `.mermaid` blocks; parse args as JS literals with absolute offsets
  (unquoted keys, single quotes, trailing commas, functions → opaque `⟪js⟫`),
  follow `const x = …` identifiers; resolve the target element (string id,
  `getElementById`, `querySelector`, variable). Saving diffs old vs new spec
  value → path-level patches (preserve quote style, unquoted keys; insert /
  delete keys; arrays of new length replaced whole). Overlay: clicking a chart
  opens a docked panel with auto-discovered title/name/label/colour fields +
  full JSON spec; live preview via the page's own library (`Plotly.react`,
  `chart.update`, re-`vegaEmbed`, `mermaid.render`, CDN fallback for ESM-only
  Mermaid); Cancel after preview reloads. Specs built by code (not literals)
  are reported as not editable here (use `</>` on the script).
- M5 `src/comments.js`: comments in `.htmledit/<name>.comments.json` next to
  the HTML (never in the HTML). Anchor = tag, line, CSS path, text, first 300
  source bytes; re-located after rewrites by source-prefix match (nearest
  line) → text match → CSS path → "anchor lost". Overlay: 💬 in the block bar
  (quotes the selected text), numbered pins at the end of the anchored text,
  list with Go to / Resolve / Delete, "Copy for agent" (markdown). CLI:
  `htmledit comments f.html [--json] [--all] [--wait [--timeout s]]
  [--resolve id [--note t]] [--clear-resolved]`; the server watches the
  sidecar so CLI resolves update pins live.

## Later additions

- `src/chartform.js` (pure, node-tested) builds the chart panel's **Chart** form
  (per-library dropdowns, checkboxes, numbers, sliders, colours; `undefined`
  = remove the key) and **Data** tables over the spec values. It is served
  together with the overlay. The patcher writes new keys and rows in the
  literal's own style (quotes, bare keys, spacing), and patches arrays item by
  item (append or drop the tail).
- Insert (`op: insert`, `Doc.insertElement`): before / after / inside, on its
  own line at the neighbours' indentation. Drag and drop (`op: moveTo`,
  `Doc.moveElementTo`): cut the element's lines and re-insert them at the
  target's indentation, as one undo step.
- Changed text keeps the source spelling of its unchanged start and end
  (`reuseText`: entities, `&nbsp;`, CRLF), and the newline the parser drops after
  `<pre>` is accounted for (`textRange`).
- `src/launcher.js`: `htmledit` with no file lists the folder's HTML files and
  starts one session per clicked file (token-guarded `/open`).
