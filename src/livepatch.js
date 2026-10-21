// What changed between two versions of the file, as an update an open page
// can apply in place, without reloading (so AI edits don't make it blink).
// null = the page should reload.
"use strict";

const MAX = 400000;
const loc = (n) => n.sourceCodeLocation;
const attrs = (n) => Object.fromEntries(n.attrs.map((a) => [a.name, a.value]));
const text = (n) => (n.childNodes || []).map((c) => (c.nodeName === "#text" ? c.value : "")).join("");
const kids = (n) => (n.childNodes || []).filter((c) => c.heId != null);
// Index of the first element starting at or after `offset`.
const firstFrom = (doc, offset) => {
  const i = doc.nodes.findIndex((x) => loc(x).startOffset >= offset);
  return i < 0 ? doc.nodes.length : i;
};
// Only whitespace between the given elements, within [lo, hi)?
const blankBetween = (doc, els, lo, hi) => {
  let pos = lo;
  for (const e of els) {
    if (doc.src.slice(pos, loc(e).startOffset).trim()) return false;
    pos = loc(e).endOffset;
  }
  return !doc.src.slice(pos, hi).trim();
};

// Replace whole children of `P` covering [lo, hi) (positions in a).
function run(a, b, P, lo, hi, delta) {
  if (!P || P.heId == null || /^(html|head)$/.test(P.tagName)) return null;
  const inA = kids(P).filter((x) => loc(x).endOffset > lo && loc(x).startOffset < hi);
  const r0 = Math.min(lo, inA.length ? loc(inA[0]).startOffset : lo);
  const r1 = Math.max(hi, inA.length ? loc(inA[inA.length - 1]).endOffset : hi);
  const Q = b.nodes[P.heId];
  if (!Q || Q.tagName !== P.tagName) return null;
  const e1 = r1 + delta;
  const kb = kids(Q);
  if (kb.some((x) => loc(x).startOffset < e1 && loc(x).endOffset > r0 && (loc(x).startOffset < r0 || loc(x).endOffset > e1))) return null;
  const inB = kb.filter((x) => loc(x).startOffset >= r0 && loc(x).endOffset <= e1);
  if (!blankBetween(a, inA, r0, r1) || !blankBetween(b, inB, r0, e1))
    // Text changed directly in P: replace P itself, inside its parent.
    return P.tagName === "body" ? null : run(a, b, P.parentNode, loc(P).startOffset, loc(P).endOffset, delta);
  if (e1 - r0 > MAX) return null;
  const f = firstFrom(b, r0);
  const newIds = b.nodes.slice(f, firstFrom(b, e1));
  if (newIds.some((x) => x.tagName === "script")) return null;
  const last = firstFrom(a, r1) - 1;
  // Where the new nodes go, when nothing is replaced: next to a sibling.
  let at = null;
  if (inA.length) at = { replace: true };
  else {
    const next = kids(P).find((x) => loc(x).startOffset >= r1);
    const prev = kids(P).filter((x) => loc(x).endOffset <= r0).pop();
    const close = loc(P).endTag.startOffset;
    if (next && !a.src.slice(r1, loc(next).startOffset).trim()) at = { before: next.heId };
    else if (prev && !a.src.slice(loc(prev).endOffset, r0).trim()) at = { after: prev.heId };
    else if (!a.src.slice(r1, close).trim()) at = { end: true };
    else return null;
  }
  return {
    kind: "html",
    parent: P.heId,
    at,
    remove: inA.map((x) => x.heId),
    sigs: inA.map((x) => {
      const s = a.signature(x.heId);
      return { text: s.text, ids: s.ids };
    }),
    last,
    shift: newIds.length - (last + 1 - firstFrom(a, r0)),
    html: b.instrument("", r0, e1),
  };
}

function attrPatch(a, b, p, endA, endB) {
  const n = a.nodes.find((x) => loc(x).startOffset < p && endA < loc(x).startTag.endOffset);
  const m = n && b.nodes[n.heId];
  if (!m || m.tagName !== n.tagName || loc(m).startOffset !== loc(n).startOffset || endB >= loc(m).startTag.endOffset) return null;
  const was = attrs(n),
    now = attrs(m);
  return {
    kind: "attrs",
    id: n.heId,
    set: Object.fromEntries(Object.entries(now).filter(([k, v]) => was[k] !== v)),
    remove: Object.keys(was).filter((k) => !(k in now)),
    was: was.class || "",
  };
}

function livePatch(a, b) {
  const s = a.src,
    t = b.src;
  const max = Math.min(s.length, t.length);
  let p = 0;
  while (p < max && s[p] === t[p]) p++;
  const suffix = (from) => {
    let q = 0;
    while (q < max - from && s[s.length - 1 - q] === t[t.length - 1 - q]) q++;
    return q;
  };
  let q = suffix(p);
  // Only attributes changed?
  const attr = attrPatch(a, b, p, s.length - q, t.length - q);
  if (attr) return attr;
  // Don't start or end the change inside a tag: "<li>…</li></ul>" vs
  // "</ul>" shares the "<", but the change is a whole new <li>.
  const inTag = (x) => s.lastIndexOf("<", x - 1) > s.lastIndexOf(">", x - 1);
  if (inTag(p)) {
    p = s.lastIndexOf("<", p - 1);
    q = suffix(p);
  }
  let endA = s.length - q;
  let endB = t.length - q;
  if (endA > p && inTag(endA)) {
    const k = s.indexOf(">", endA) + 1 - endA;
    endA += k;
    endB += k;
  }
  // The innermost element that holds the whole change.
  let n = null;
  for (const x of a.nodes) {
    const l = loc(x);
    if (l.startOffset < p && endA <= l.endOffset && l.endTag && endA <= l.endTag.startOffset && (!n || l.startOffset >= loc(n).startOffset)) n = x;
  }
  if (!n) return null;
  const m = b.nodes[n.heId];
  if (!m || m.tagName !== n.tagName || loc(m).startOffset !== loc(n).startOffset) return null;
  const id = n.heId;
  const delta = t.length - s.length;
  if (p < loc(n).startTag.endOffset) return run(a, b, n.parentNode, loc(n).startOffset, loc(n).endOffset, delta);
  if (n.tagName === "style") return { kind: "text", id, text: text(m) };
  if (n.tagName === "title") return { kind: "title", id, text: text(m) };
  if (n.tagName === "script") return { kind: "script", id };
  return run(a, b, n, p, endA, delta);
}

module.exports = { livePatch };
