// Source model: parse the original HTML with source locations, give every
// source element a stable id (document order), and turn DOM edits sent by the
// overlay back into minimal byte-range patches on the original text.
"use strict";
const parse5 = require("parse5");
const { decodeHTML } = require("entities");

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const IMPLIED = new Set(["tbody", "colgroup", "html", "head", "body"]);
const RAW = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
]);

class Doc {
  constructor(src) {
    this.src = src;
    this.tree = parse5.parse(src, { sourceCodeLocationInfo: true });
    this.nodes = []; // id -> parse5 element
    const walk = (n) => {
      for (const c of n.childNodes || []) {
        if (c.tagName) {
          const loc = c.sourceCodeLocation;
          if (loc && loc.startTag) {
            c.heId = this.nodes.length;
            this.nodes.push(c);
          }
          if (c.tagName === "template" && c.content) walk(c.content);
          walk(c);
        }
      }
    };
    walk(this.tree);
  }

  slice(a, b) {
    return this.src.slice(a, b);
  }

  idAt(offset) {
    const n = this.nodes.find((x) => x.sourceCodeLocation.startOffset === offset);
    return n ? n.heId : null;
  }

  innerRange(n) {
    const l = n.sourceCodeLocation;
    return [
      l.startTag.endOffset,
      l.endTag ? l.endTag.startOffset : l.endOffset,
    ];
  }

  outerRange(n) {
    const l = n.sourceCodeLocation;
    return [l.startOffset, l.endOffset];
  }

  // Served copy: data-he="id" in every source start tag, overlay before EOF.
  instrument(inject) {
    const ins = [];
    for (const n of this.nodes) {
      const st = n.sourceCodeLocation.startTag;
      let at = st.endOffset - 1; // before '>'
      if (this.src[at - 1] === "/" && /[\s"']/.test(this.src[at - 2] || ""))
        at -= 1;
      else if (this.src[at - 1] === "/" && VOID.has(n.tagName)) at -= 1;
      ins.push([at, ` data-he="${n.heId}"`]);
    }
    let out = "",
      pos = 0;
    for (const [at, s] of ins.sort((a, b) => a[0] - b[0])) {
      out += this.src.slice(pos, at) + s;
      pos = at;
    }
    out += this.src.slice(pos);
    return out + inject;
  }

  // What the browser DOM should look like for an untouched element: used by
  // the overlay to detect subtrees rewritten by page scripts (KaTeX, Mermaid…).
  signature(id) {
    const n = this.nodes[id];
    const ids = [];
    let text = "";
    const walk = (p) => {
      for (const c of p.childNodes || []) {
        if (c.nodeName === "#text") text += c.value;
        else if (c.tagName) {
          if (c.heId != null) ids.push(c.heId);
          walk(c);
        }
      }
    };
    walk(n);
    const [a, b] = this.innerRange(n);
    const attrs = Object.fromEntries(n.attrs.map((x) => [x.name, x.value]));
    return { id, tag: n.tagName, text, ids, attrs, inner: this.slice(a, b) };
  }

  // Render new DOM children (parsed from overlay innerHTML) back to source,
  // reusing original bytes for every node that is still a source node.
  renderChildren(newKids, orig, used) {
    const origTexts = (orig.childNodes || []).filter(
      (c) => c.nodeName === "#text",
    );
    let out = "";
    let nthText = 0;
    newKids.forEach((k, i) => {
      if (k.nodeName === "#text") {
        const same = origTexts.find(
          (t) => t.value === k.value && t.sourceCodeLocation,
        );
        const near = origTexts[nthText++];
        if (same) {
          out += this.slice(...this.textRange(same, orig));
        } else if (near && near.sourceCodeLocation) out += this.reuseText(near, k.value, orig);
        else out += escapeText(k.value);
      } else if (k.nodeName === "#comment") {
        out += `<!--${k.data}-->`;
      } else if (k.tagName) {
        out += this.renderElement(k, used);
      }
    });
    return out;
  }

  // Source range of a text node, minus the newline the parser drops right
  // after <pre>/<listing>/<textarea> (leadNewline puts it back).
  textRange(t, parent) {
    const l = t.sourceCodeLocation;
    let a = l.startOffset;
    if (parent && /^(pre|listing|textarea)$/.test(parent.tagName) && parent.sourceCodeLocation && a === this.innerRange(parent)[0]) {
      if (this.src.startsWith("\r\n", a)) a += 2;
      else if (this.src[a] === "\n") a += 1;
    }
    return [a, l.endOffset];
  }

  // Changed text: keep the source spelling (entities, &nbsp;, CRLF) of the
  // unchanged start and end, escape only the changed middle.
  reuseText(t, value, parent) {
    const segs = textSegments(this.slice(...this.textRange(t, parent)));
    const old = t.value;
    if (segs.map((x) => x.text).join("") !== old) return escapeText(value);
    let p = 0;
    while (p < old.length && p < value.length && old[p] === value[p]) p++;
    let q = 0;
    while (q < old.length - p && q < value.length - p && old[old.length - 1 - q] === value[value.length - 1 - q]) q++;
    let pre = "", n = 0, i = 0;
    while (i < segs.length && n + segs[i].text.length <= p) {
      pre += segs[i].src;
      n += segs[i].text.length;
      i++;
    }
    let suf = "", m = 0;
    for (let j = segs.length - 1; j >= i && m + segs[j].text.length <= q; j--) {
      suf = segs[j].src + suf;
      m += segs[j].text.length;
    }
    return pre + escapeText(value.slice(n, value.length - m)) + suf;
  }

  renderElement(k, used) {
    const heAttr = k.attrs.find((a) => a.name === "data-he");
    const id = heAttr ? Number(heAttr.value) : NaN;
    const src = this.nodes[id];
    if (src && src.tagName === k.tagName && !used.has(id)) {
      used.add(id);
      const l = src.sourceCodeLocation;
      const start = this.slice(l.startTag.startOffset, l.startTag.endOffset);
      if (VOID.has(src.tagName)) return start;
      const [a, b] = this.innerRange(src);
      const inner = RAW.has(src.tagName)
        ? this.slice(a, b)
        : this.leadNewline(src, this.renderChildren(childrenOf(k), src, used));
      const end = l.endTag
        ? this.slice(l.endTag.startOffset, l.endTag.endOffset)
        : "";
      return start + inner + end;
    }
    // Parser-implied wrappers (<tbody> etc.) have no source tags of their own.
    if (!heAttr && IMPLIED.has(k.tagName)) {
      return this.renderChildren(childrenOf(k), { childNodes: [] }, used);
    }
    // New element (typed bold, pasted, duplicated by contenteditable).
    const attrs = k.attrs
      .filter((a) => a.name !== "data-he")
      .map((a) =>
        a.value === "" ? ` ${a.name}` : ` ${a.name}="${escapeAttr(a.value)}"`,
      )
      .join("");
    if (VOID.has(k.tagName)) return `<${k.tagName}${attrs}>`;
    return `<${k.tagName}${attrs}>${this.renderChildren(childrenOf(k), { childNodes: [] }, used)}</${k.tagName}>`;
  }

  // The parser drops one newline right after <pre>/<listing>; keep or restore it.
  leadNewline(n, inner) {
    if (n.tagName !== "pre" && n.tagName !== "listing") return inner;
    const a = this.innerRange(n)[0];
    const had = this.src.startsWith("\r\n", a) ? "\r\n" : this.src[a] === "\n" ? "\n" : "";
    return had || inner.startsWith("\n") ? (had || "\n") + inner : inner;
  }

  // Replace the inner content of element `id` with DOM innerHTML `html`.
  patchInner(id, html) {
    const n = this.nodes[id];
    if (!n) throw new Error(`no element ${id}`);
    if (VOID.has(n.tagName) || RAW.has(n.tagName))
      throw new Error(`<${n.tagName}> has no editable content`);
    const frag = parse5.parseFragment(n, html);
    const inner = this.leadNewline(n, this.renderChildren(frag.childNodes, n, new Set()));
    const [a, b] = this.innerRange(n);
    return minimal(this.src, a, b, inner);
  }

  // Replace the inner source of element `id` verbatim (source-edit mode).
  patchInnerSource(id, source) {
    const n = this.nodes[id];
    if (!n) throw new Error(`no element ${id}`);
    const [a, b] = this.innerRange(n);
    return minimal(this.src, a, b, source);
  }

  node(id) {
    const n = this.nodes[id];
    if (!n) throw new Error(`no element ${id}`);
    return n;
  }

  // Set (value string), or remove (null) one attribute in the start tag.
  patchAttr(id, name, value) {
    const n = this.node(id);
    const st = n.sourceCodeLocation.startTag;
    const loc = st.attrs && st.attrs[name.toLowerCase()];
    const text = value == null ? "" : value === true ? name : `${name}="${escapeAttr(String(value))}"`;
    if (loc) {
      let a = loc.startOffset;
      if (value == null) while (/\s/.test(this.src[a - 1])) a--;
      return minimal(this.src, a, loc.endOffset, text);
    }
    if (value == null) return { start: st.endOffset, end: st.endOffset, text: "" };
    let at = st.endOffset - 1;
    if (this.src[at - 1] === "/") at--;
    while (/\s/.test(this.src[at - 1])) at--;
    return { start: at, end: at, text: " " + text };
  }

  // Merge CSS property changes ({prop: value|null}) into the SOURCE style
  // attribute, so runtime styles set by page scripts never leak to disk.
  patchStyle(id, props) {
    const n = this.node(id);
    const cur = (n.attrs.find((a) => a.name === "style") || {}).value || "";
    const decls = splitDecls(cur);
    for (const [prop, value] of Object.entries(props)) {
      const i = decls.findIndex((d) => d.prop === prop.toLowerCase());
      if (value == null || value === "") {
        if (i >= 0) decls.splice(i, 1);
      } else if (i >= 0) decls[i].text = `${prop}: ${value}`;
      else decls.push({ prop: prop.toLowerCase(), text: `${prop}: ${value}` });
    }
    const next = decls.map((d) => d.text.trim()).join("; ");
    return this.patchAttr(id, "style", next ? next : null);
  }

  // Outer range widened to whole lines when the element sits alone on them.
  lineRange(n) {
    let [a, b] = this.outerRange(n);
    let s = a;
    while (s > 0 && /[ \t]/.test(this.src[s - 1])) s--;
    let e = b;
    while (e < this.src.length && /[ \t]/.test(this.src[e])) e++;
    const ownLine = (s === 0 || this.src[s - 1] === "\n") && (e === this.src.length || /[\r\n]/.test(this.src[e]));
    return { a, b, s, e, ownLine, indent: this.src.slice(s, a) };
  }

  removeElement(id) {
    const r = this.lineRange(this.node(id));
    if (!r.ownLine) return { start: r.a, end: r.b, text: "" };
    let e = r.e;
    if (this.src[e] === "\r") e++;
    if (this.src[e] === "\n") e++;
    return { start: r.s, end: e, text: "" };
  }

  duplicateElement(id) {
    const n = this.node(id);
    const r = this.lineRange(n);
    const copy = this.slice(r.a, r.b);
    const text = r.ownLine ? `\n${r.indent}${copy}` : copy;
    return { start: r.b, end: r.b, text, focus: r.b + text.length - copy.length };
  }

  // Insert `html` before or after the element, or as its last child
  // ("inside"), on its own line at the neighbours' indentation when the
  // element sits on its own line. `focus` is the offset of the new element.
  insertElement(id, where, html) {
    const n = this.node(id);
    const r = this.lineRange(n);
    const at = (indent) => html.replace(/\n/g, "\n" + indent);
    if (where === "inside") {
      if (VOID.has(n.tagName) || RAW.has(n.tagName)) throw new Error(`can't insert inside <${n.tagName}>`);
      const [ia, ib] = this.innerRange(n);
      let e = ib;
      while (e > ia && /\s/.test(this.src[e - 1])) e--;
      const kids = (n.childNodes || []).filter((c) => c.tagName && c.sourceCodeLocation);
      const last = kids[kids.length - 1];
      const lr = last && this.lineRange(last);
      const multi = this.src.slice(ia, ib).includes("\n");
      const indent = lr && lr.ownLine ? lr.indent : r.indent + "  ";
      const text = multi ? `\n${indent}${at(indent)}` : at(r.indent);
      return { start: e, end: e, text, focus: e + text.length - at(multi ? indent : r.indent).length };
    }
    if (where === "before") {
      const text = r.ownLine ? `${at(r.indent)}\n${r.indent}` : html;
      return { start: r.a, end: r.a, text, focus: r.a };
    }
    const body = r.ownLine ? at(r.indent) : html;
    const text = r.ownLine ? `\n${r.indent}${body}` : body;
    return { start: r.b, end: r.b, text, focus: r.b + text.length - body.length };
  }

  // Move the element before or after `refId` anywhere in the document (drag
  // and drop): its lines are cut and re-inserted at the target's indentation.
  moveElementTo(id, refId, where) {
    const n = this.node(id);
    const ref = this.node(refId);
    const [a, b] = this.outerRange(n);
    const [ra, rb] = this.outerRange(ref);
    if (n === ref || (ra >= a && rb <= b)) throw new Error("can't move a block into itself");
    const r = this.lineRange(n);
    let copy = this.slice(a, b);
    // Strip the old base indent; insertElement adds the target's.
    if (r.ownLine && !/<(pre|textarea)\b/i.test(copy)) copy = copy.split("\n" + r.indent).join("\n");
    const rm = this.removeElement(id);
    const ins = this.insertElement(refId, where === "before" ? "before" : "after", copy);
    if (ins.start >= rm.start && ins.start < rm.end) throw new Error("already there");
    if (ins.start === rm.start) throw new Error("already there");
    const focus = ins.start >= rm.end ? ins.focus - (rm.end - rm.start) : ins.focus;
    return { patches: [rm, { start: ins.start, end: ins.end, text: ins.text }], focus };
  }

  // Swap with the previous (dir -1) or next (dir 1) sibling element.
  moveElement(id, dir) {
    const n = this.node(id);
    const sibs = (n.parentNode.childNodes || []).filter((c) => c.tagName && c.heId != null);
    const j = sibs.indexOf(n) + dir;
    if (j < 0 || j >= sibs.length) throw new Error(dir < 0 ? "already first" : "already last");
    const [x, y] = dir < 0 ? [sibs[j], n] : [n, sibs[j]];
    const [xa, xb] = this.outerRange(x);
    const [ya, yb] = this.outerRange(y);
    const between = this.slice(xb, ya);
    const text = this.slice(ya, yb) + between + this.slice(xa, xb);
    // Offset of the moved element in the new text, to keep it selected.
    const focus = dir < 0 ? xa : xa + (yb - ya) + between.length;
    return { start: xa, end: yb, text, focus };
  }
}

// Split a style attribute into declarations, respecting quotes and parens.
function splitDecls(css) {
  const out = [];
  let depth = 0, q = "", cur = "";
  for (const ch of css) {
    if (q) { if (ch === q) q = ""; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.filter((t) => t.trim()).map((t) => ({ prop: t.split(":")[0].trim().toLowerCase(), text: t }));
}

function childrenOf(k) {
  return k.tagName === "template" && k.content
    ? k.content.childNodes
    : k.childNodes;
}

// Shrink a replacement to the bytes that actually differ.
function minimal(src, a, b, text) {
  const old = src.slice(a, b);
  let p = 0;
  while (p < old.length && p < text.length && old[p] === text[p]) p++;
  let s = 0;
  while (
    s < old.length - p &&
    s < text.length - p &&
    old[old.length - 1 - s] === text[text.length - 1 - s]
  )
    s++;
  return { start: a + p, end: b - s, text: text.slice(p, text.length - s) };
}

function applyPatches(src, patches) {
  const sorted = [...patches].sort((x, y) => y.start - x.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start)
      throw new Error("overlapping patches");
  }
  let out = src;
  for (const p of sorted)
    out = out.slice(0, p.start) + p.text + out.slice(p.end);
  return out;
}

// Source text → [{src, text}] pieces: one per character, character
// reference or CRLF, each with what the HTML parser decodes it to.
const REF = /^&(?:#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[A-Za-z][A-Za-z0-9]*;?)/;
function textSegments(src) {
  const out = [];
  for (let i = 0; i < src.length; ) {
    const m = src[i] === "&" && REF.exec(src.slice(i, i + 40));
    if (m) {
      out.push({ src: m[0], text: decodeHTML(m[0]) });
      i += m[0].length;
    } else if (src[i] === "\r") {
      const crlf = src[i + 1] === "\n";
      out.push({ src: crlf ? "\r\n" : "\r", text: "\n" });
      i += crlf ? 2 : 1;
    } else {
      const ch = String.fromCodePoint(src.codePointAt(i));
      out.push({ src: ch, text: ch });
      i += ch.length;
    }
  }
  return out;
}

function escapeText(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
}
function escapeAttr(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\u00a0/g, "&nbsp;");
}

module.exports = {
  Doc,
  applyPatches,
  minimal,
  escapeText,
  escapeAttr,
  splitDecls,
  VOID,
  RAW,
};
