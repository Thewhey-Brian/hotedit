# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Setup

```bash
git clone https://github.com/Thewhey-Brian/hotedit && cd hotedit
npm install
npx playwright install chromium
npm test
```

`npm test` runs unit tests (`doc`, `charts`, `chartform`, `livepatch`), CLI tests, and
real-browser end-to-end tests that drive the editor in Chromium and check the bytes
written to disk. `npm run test:unit` runs only the fast ones.

## The one rule: never corrupt the user's file

Every change must keep this true: **a no-op save writes zero bytes, and a real edit
changes only the bytes it should.** The `test/reports/` pages are deliberately messy
AI-style reports (KaTeX, Mermaid, SVG charts, script-built content, odd markup). The
end-to-end suite saves every editable element on each of them unchanged and asserts the
file is identical.

When you fix a bug, add a test that fails without the fix. Good places:

- `test/doc.test.js`: source patching (text, attributes, styles, structure)
- `test/charts.test.js`, `test/chartform.test.js`: chart detection, form and patching
- `test/e2e-*.test.js`: behaviour in a real browser, asserting on the file contents

To check the patcher against your own reports locally (they are never committed), run:

```bash
HTMLEDIT_SAMPLES=/path/to/your/reports node --test test/doc.test.js test/e2e-m6.test.js
```

## Code layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short, `src/doc.js` does source
mapping and patches, `src/server.js` is the local server, `src/overlay.js` is the in-page
editor, `src/charts.js` and `src/chartform.js` handle charts, `src/agent.js` and `src/mcp.js`
are the AI agent and MCP server, `src/livepatch.js` makes live updates, and
`src/launcher.js` is the file picker.

The only runtime dependencies are `parse5` and `entities`, and they should stay that
small. `hotedit` must keep working via `npx` with no build step.
