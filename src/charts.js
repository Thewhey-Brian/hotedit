// Chart specs in inline scripts: find Plotly / Chart.js / Vega-Embed calls and
// Mermaid blocks, parse their spec arguments as JS literals WITH source
// offsets, and turn edited spec values into minimal byte patches.
"use strict";

// ---------- code mask: strings/comments blanked, same length ----------
function codeMask(s) {
  const out = s.split("");
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < s.length) {
    const c = s[i];
    if (c === "/" && s[i + 1] === "/") {
      const e = s.indexOf("\n", i);
      const end = e < 0 ? s.length : e;
      blank(i, end);
      i = end;
    } else if (c === "/" && s[i + 1] === "*") {
      const e = s.indexOf("*/", i + 2);
      const end = e < 0 ? s.length : e + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      const end = skipString(s, i);
      blank(i + 1, end - 1);
      i = end;
    } else i++;
  }
  return out.join("");
}

function skipString(s, i) {
  const q = s[i];
  let k = i + 1;
  while (k < s.length && s[k] !== q) {
    if (s[k] === "\\") k++;
    else if (q !== "`" && s[k] === "\n") break;
    k++;
  }
  return Math.min(k + 1, s.length);
}

// ---------- JS literal parser with offsets ----------
// Node: {t: "obj"|"arr"|"str"|"num"|"lit"|"raw", start, end, ...}
//   obj: props [{key, keyStart, keyEnd, quoted, value}]
//   arr: items [node]
//   str: value, quote
//   raw: opaque JS (identifier, call, function…); maybe `ref` once resolved
class Lit {
  constructor(src, mask) {
    this.s = src;
    this.m = mask;
  }
  ws(i) {
    while (i < this.s.length && /\s/.test(this.m[i])) i++;
    return i;
  }
  value(i) {
    i = this.ws(i);
    const c = this.s[i];
    if (c === "{") return this.obj(i);
    if (c === "[") return this.arr(i);
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(this.s, i);
      if (c === "`" && this.s.slice(i, end).includes("${")) return this.raw(i);
      return {
        t: "str",
        start: i,
        end,
        quote: c,
        value: unquote(this.s.slice(i, end)),
      };
    }
    const num = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(
      this.s.slice(i, i + 40),
    );
    if (num && this.atEnd(i + num[0].length)) {
      return {
        t: "num",
        start: i,
        end: i + num[0].length,
        value: Number(num[0]),
      };
    }
    const lit = /^(true|false|null)\b/.exec(this.s.slice(i, i + 6));
    if (lit && this.atEnd(i + lit[0].length)) {
      return {
        t: "lit",
        start: i,
        end: i + lit[0].length,
        value: JSON.parse(lit[0]),
      };
    }
    return this.raw(i);
  }
  atEnd(i) {
    const j = this.ws(i);
    return /[,}\])]/.test(this.s[j] || ")");
  }
  // Opaque expression up to the next top-level , } ] )
  raw(i) {
    let d = 0,
      k = i;
    while (k < this.s.length) {
      const c = this.m[k];
      if (c === "(" || c === "[" || c === "{") d++;
      else if (c === ")" || c === "]" || c === "}") {
        if (d === 0) break;
        d--;
      } else if ((c === "," || c === ";") && d === 0) break;
      k++;
    }
    let e = k;
    while (e > i && /\s/.test(this.s[e - 1])) e--;
    return { t: "raw", start: i, end: e, text: this.s.slice(i, e) };
  }
  obj(i) {
    const node = { t: "obj", start: i, props: [] };
    let k = this.ws(i + 1);
    while (this.s[k] !== "}") {
      if (k >= this.s.length) throw new Error("unterminated object");
      let key,
        keyStart = k,
        keyEnd,
        quoted = false;
      const c = this.s[k];
      if (c === '"' || c === "'") {
        keyEnd = skipString(this.s, k);
        key = unquote(this.s.slice(k, keyEnd));
        quoted = true;
      } else if (c === "." && this.s.startsWith("...", k)) {
        const v = this.raw(k);
        node.props.push({
          key: null,
          keyStart: k,
          keyEnd: v.end,
          value: v,
          spread: true,
        });
        k = this.ws(v.end);
        if (this.s[k] === ",") k = this.ws(k + 1);
        continue;
      } else {
        const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(this.s.slice(k, k + 200));
        if (!m) throw new Error("bad key at " + k);
        key = m[0];
        keyEnd = k + m[0].length;
      }
      let j = this.ws(keyEnd);
      let value;
      if (this.s[j] === ":") value = this.value(j + 1);
      else if (this.s[j] === "(") {
        value = this.raw(keyStart); // method shorthand
      } else value = { t: "raw", start: keyStart, end: keyEnd, text: key }; // {a} shorthand
      node.props.push({ key, keyStart, keyEnd, quoted, value });
      k = this.ws(value.end);
      if (this.s[k] === ",") k = this.ws(k + 1);
      else if (this.s[k] !== "}") throw new Error("expected , or } at " + k);
    }
    node.end = k + 1;
    return node;
  }
  arr(i) {
    const node = { t: "arr", start: i, items: [] };
    let k = this.ws(i + 1);
    while (this.s[k] !== "]") {
      if (k >= this.s.length) throw new Error("unterminated array");
      const v = this.value(k);
      node.items.push(v);
      k = this.ws(v.end);
      if (this.s[k] === ",") k = this.ws(k + 1);
      else if (this.s[k] !== "]") throw new Error("expected , or ] at " + k);
    }
    node.end = k + 1;
    return node;
  }
  // Call arguments starting just after "("
  args(i) {
    const out = [];
    let k = this.ws(i);
    while (this.s[k] !== ")") {
      if (k >= this.s.length) throw new Error("unterminated call");
      const v = this.value(k);
      out.push(v);
      k = this.ws(v.end);
      if (this.s[k] === ",") k = this.ws(k + 1);
      else if (this.s[k] !== ")") break;
    }
    return out;
  }
}

function unquote(q) {
  const body = q.slice(1, -1);
  if (q[0] === '"') {
    try {
      return JSON.parse(q);
    } catch {}
  }
  return body.replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs,
    (m, e) => {
      if (e[0] === "u")
        return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ""), 16));
      if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
      return (
        {
          n: "\n",
          t: "\t",
          r: "\r",
          b: "\b",
          f: "\f",
          v: "\v",
          0: "\0",
          "\n": "",
        }[e] ?? e
      );
    },
  );
}

// Follow `ident` → `const|let|var ident = <literal>` in the same script.
function mutatedAfter(code, name, from) {
  const n = name.replace(/\$/g, "\\$");
  const rest = code.slice(from);
  return (
    // obs.push(…), arr.splice(…), …
    new RegExp(`(?<![\\w$.])${n}\\s*\\.\\s*(push|unshift|splice|pop|shift|reverse|sort|fill|copyWithin)\\s*\\(`).test(rest) ||
    // name = …, name[i] = …, name.a.b += …
    new RegExp(`(?<![\\w$.])${n}(\\s*(\\.\\s*[\\w$]+|\\[[^\\]]*\\]))*\\s*([-+*/%]?=)(?![=>])`).test(rest) ||
    new RegExp(`Object\\.assign\\(\\s*${n}\\b`).test(rest)
  );
}

function resolve(lit, node, depth = 0) {
  if (!node || depth > 4) return node;
  if (node.t === "raw" && /^[A-Za-z_$][\w$]*$/.test(node.text)) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+${node.text.replace(/\$/g, "\\$")}\\s*=`,
      "g",
    );
    const m = re.exec(lit.m);
    if (m) {
      try {
        const ref = resolve(lit, lit.value(m.index + m[0].length), depth + 1);
        // A literal the script changes later (obs.push(…), spec.width = …)
        // isn't the chart's real value: keep it as code.
        if (!mutatedAfter(lit.m, node.text, ref.end)) node.ref = ref;
      } catch {}
    }
  } else if (node.t === "obj")
    node.props.forEach((p) => (p.value = resolve(lit, p.value, depth + 1)));
  else if (node.t === "arr")
    node.items = node.items.map((x) => resolve(lit, x, depth + 1));
  return node;
}

const deref = (n) => (n && n.t === "raw" && n.ref ? deref(n.ref) : n);

// Spec tree → plain JSON value; opaque JS becomes a marker string.
const RAW_MARK = "⟪js⟫ ";
function toValue(n) {
  n = deref(n);
  if (n.t === "obj") {
    const o = {};
    for (const p of n.props) if (!p.spread) o[p.key] = toValue(p.value);
    return o;
  }
  if (n.t === "arr") return n.items.map(toValue);
  if (n.t === "raw") return RAW_MARK + n.text.slice(0, 200);
  return n.value;
}

// ---------- spec diff → patches ----------
const IDENT = /^[A-Za-z_$][\w$]*$/;

// How a spec literal is written, so inserted values look like their
// neighbours: quote char, bare or quoted keys, spacing after ":" and ",".
function styleOf(src, root) {
  const n = { "'": 0, '"': 0, bare: 0, quoted: 0, colonSp: 0, colon: 0, commaSp: 0, comma: 0 };
  const sep = (a, b) => {
    const gap = src.slice(a.end, b);
    if (!gap.includes(",")) return;
    if (/,[ \t\n]/.test(gap)) n.commaSp++;
    else n.comma++;
  };
  const walk = (x, depth) => {
    x = deref(x);
    if (!x || depth > 40) return;
    if (x.t === "str") n[x.quote]++;
    else if (x.t === "obj") {
      x.props.forEach((p, i) => {
        if (p.spread) return;
        n[p.quoted ? "quoted" : "bare"]++;
        if (p.value.start > p.keyEnd) {
          if (/:\s/.test(src.slice(p.keyEnd, p.value.start))) n.colonSp++;
          else n.colon++;
        }
        if (i) sep(x.props[i - 1].value, p.keyStart);
        walk(p.value, depth + 1);
      });
    } else if (x.t === "arr") {
      x.items.forEach((it, i) => {
        if (i) sep(x.items[i - 1], it.start);
        walk(it, depth + 1);
      });
    }
  };
  walk(root, 0);
  return {
    quote: n["'"] > n['"'] ? "'" : '"',
    bare: n.bare > n.quoted,
    colon: n.colonSp >= n.colon && n.colonSp ? ": " : ":",
    comma: n.commaSp >= n.comma && n.commaSp ? ", " : ",",
  };
}

const JSON_STYLE = { quote: '"', bare: false, colon: ":", comma: "," };
function literal(v, st = JSON_STYLE) {
  if (typeof v === "string") {
    if (v.startsWith(RAW_MARK)) throw new Error("code values (⟪js⟫) can't be moved or added; edit the script with </>");
    if (st.quote === "'")
      return (
        "'" +
        JSON.stringify(v)
          .slice(1, -1)
          .replace(/\\"/g, '"')
          .replace(/'/g, "\\'") +
        "'"
      );
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map((x) => literal(x, st)).join(st.comma) + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .map((k) => keyText(k, st) + st.colon + literal(v[k], st))
        .join(st.comma) +
      "}"
    );
  return JSON.stringify(v);
}
const keyText = (k, st) => (st.bare && IDENT.test(k) ? k : literal(k, st));

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Patches turning source node `n` into value `v`. Opaque nodes whose marker
// value is unchanged are left alone.
function diffNode(src, n, v, out, st = JSON_STYLE) {
  n = deref(n);
  const cur = toValue(n);
  if (same(cur, v)) return;
  if (n.t === "obj" && v && typeof v === "object" && !Array.isArray(v)) {
    const props = n.props.filter((p) => !p.spread);
    const seen = new Set();
    for (const p of props) {
      seen.add(p.key);
      if (!(p.key in v)) out.push(removeProp(src, n, p));
      else diffNode(src, p.value, v[p.key], out, st);
    }
    const add = Object.keys(v).filter((k) => !seen.has(k));
    if (add.length) {
      const text = add.map((k) => keyText(k, st) + st.colon + literal(v[k], st)).join(st.comma);
      if (props.length) {
        const last = props[props.length - 1];
        out.push({ start: last.value.end, end: last.value.end, text: st.comma + text });
      } else out.push({ start: n.start + 1, end: n.start + 1, text });
    }
    return;
  }
  if (n.t === "arr" && Array.isArray(v)) {
    // Item by item, then append or drop the tail, so rows added or removed
    // in the table keep the rest of the array as written.
    const m = Math.min(v.length, n.items.length);
    for (let i = 0; i < m; i++) diffNode(src, n.items[i], v[i], out, st);
    if (v.length > m) {
      const text = v.slice(m).map((x) => literal(x, st)).join(st.comma);
      if (m) out.push({ start: n.items[m - 1].end, end: n.items[m - 1].end, text: st.comma + text });
      else out.push({ start: n.start + 1, end: n.start + 1, text });
    } else if (n.items.length > m) {
      const from = m ? n.items[m - 1].end : n.start + 1;
      const to = m ? n.items[n.items.length - 1].end : n.end - 1;
      out.push({ start: from, end: to, text: "" });
    }
    return;
  }
  if (typeof v === "string" && v.startsWith(RAW_MARK)) return; // opaque left as is
  out.push({
    start: n.start,
    end: n.end,
    text: literal(v, n.t === "str" ? { ...st, quote: n.quote } : st),
  });
}

function removeProp(src, obj, p) {
  const props = obj.props;
  const i = props.indexOf(p);
  if (i < props.length - 1) {
    const next = props[i + 1];
    if (src.slice(p.value.end, next.keyStart).includes("\n")) {
      // Next key is on its own line: drop this prop's whole line when it has
      // one, else just ", key: value" so the line break stays.
      const ls = src.lastIndexOf("\n", p.keyStart - 1) + 1;
      if (/^[ \t]*$/.test(src.slice(ls, p.keyStart)))
        return { start: ls, end: src.lastIndexOf("\n", next.keyStart - 1) + 1, text: "" };
      if (i > 0) return { start: props[i - 1].value.end, end: p.value.end, text: "" };
    }
    return { start: p.keyStart, end: next.keyStart, text: "" };
  }
  if (i > 0)
    return { start: props[i - 1].value.end, end: p.value.end, text: "" };
  return { start: obj.start + 1, end: obj.end - 1, text: "" };
}

// ---------- detection ----------
const CALLS = [
  {
    kind: "plotly",
    re: /\bPlotly\s*\.\s*(newPlot|react|plot)\s*\(/g,
    spec: [1, 2],
  },
  { kind: "chartjs", re: /\bnew\s+Chart\s*\(/g, spec: [1] },
  { kind: "vega", re: /\bvegaEmbed\s*\(/g, spec: [1] },
];

// Target expression → {id} | {selector} | null
function targetOf(lit, node) {
  node = deref(node) || node;
  if (node.t === "str") {
    const v = node.value;
    return /^[#.[]/.test(v) ? { selector: v } : { id: v };
  }
  if (node.t === "raw") {
    const t = node.text;
    let m = /getElementById\(\s*(['"`])(.+?)\1\s*\)/.exec(t);
    if (m) return { id: m[2] };
    m = /querySelector\(\s*(['"`])(.+?)\1\s*\)/.exec(t);
    if (m) return { selector: m[2] };
    m = /^([A-Za-z_$][\w$]*)/.exec(t);
    if (m) {
      const re = new RegExp(
        `\\b(?:const|let|var)\\s+${m[1].replace(/\$/g, "\\$")}\\s*=`,
        "g",
      );
      const d = re.exec(lit.m);
      if (d) return targetOf(lit, lit.value(d.index + d[0].length));
    }
  }
  return null;
}

function findCharts(doc) {
  const charts = [];
  for (const n of doc.nodes) {
    if (n.tagName === "script") {
      if (n.attrs.some((a) => a.name === "src")) continue;
      const type = (n.attrs.find((a) => a.name === "type") || {}).value || "";
      if (type && !/javascript|module|^$/.test(type)) continue;
      const [a, b] = doc.innerRange(n);
      // Parse on the whole document so offsets are absolute; mask outside
      // this script so identifier lookups stay inside it.
      const mask =
        " ".repeat(a) +
        codeMask(doc.src.slice(a, b)) +
        " ".repeat(doc.src.length - b);
      const lit = new Lit(doc.src, mask);
      for (const c of CALLS) {
        c.re.lastIndex = 0;
        let m;
        while ((m = c.re.exec(mask.slice(a, b)))) {
          const at = a + m.index + m[0].length;
          let args;
          try {
            args = lit.args(at).map((x) => resolve(lit, x));
          } catch {
            continue;
          }
          if (!args.length) continue;
          const specs = c.spec
            .filter((i) => args[i])
            .map((i) => ({ arg: i, node: args[i] }));
          charts.push({
            kind: c.kind,
            script: n.heId,
            call: a + m.index,
            target: targetOf(lit, args[0]),
            specs,
          });
        }
      }
    } else if (
      /\bmermaid\b/.test(
        (n.attrs.find((x) => x.name === "class") || {}).value || "",
      )
    ) {
      const [a, b] = doc.innerRange(n);
      charts.push({
        kind: "mermaid",
        element: n.heId,
        call: a,
        target: null,
        specs: [],
        source: doc.src.slice(a, b),
      });
    }
  }
  return charts
    .sort((x, y) => x.call - y.call)
    .map((c, i) => ({ ...c, index: i }));
}

// Public description for the overlay (no parser nodes).
function describe(chart) {
  const { specs, ...rest } = chart;
  return {
    ...rest,
    specs: specs.map((s) => ({
      arg: s.arg,
      value: toValue(s.node),
      opaque: deref(s.node).t === "raw",
    })),
  };
}

function patchChart(doc, index, values) {
  const chart = findCharts(doc)[index];
  if (!chart) throw new Error(`no chart ${index}`);
  const out = [];
  for (const s of chart.specs) {
    if (!(s.arg in values)) continue;
    if (deref(s.node).t === "raw")
      throw new Error("spec is not a literal in the source");
    diffNode(doc.src, s.node, values[s.arg], out, styleOf(doc.src, s.node));
  }
  return out;
}

module.exports = {
  findCharts,
  describe,
  patchChart,
  codeMask,
  Lit,
  toValue,
  RAW_MARK,
};
