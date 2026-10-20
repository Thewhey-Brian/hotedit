// Chart panel model: per-library form controls (dropdowns, checkboxes,
// numbers, sliders, colours) and data tables over a chart's spec values.
// Pure functions over the spec, so they run in the overlay and in node tests.
// Paths are absolute into `state` ({1: data, 2: layout} for Plotly, {1: spec}
// otherwise); a value of `undefined` means "remove the key" (library default).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.__heChartForm = factory();
})(typeof self !== "undefined" ? self : this, () => {
  "use strict";
  const isMarker = (v) => typeof v === "string" && v.startsWith("⟪js⟫ ");
  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const prim = (v) =>
    v === null || ["string", "number", "boolean"].includes(typeof v);
  const get = (o, path) =>
    path.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const opts = (s) => s.split(" ").map((v) => [v, v]);

  // Set `path` in `root`, creating parents. Deleting also drops parents the
  // delete left empty, unless they exist in `orig` (so no stray `{}` keys).
  function put(root, path, v, orig) {
    if (v === undefined) {
      const parent = get(root, path.slice(0, -1));
      if (parent && typeof parent === "object")
        delete parent[path[path.length - 1]];
      for (let n = path.length - 1; n > 1; n--) {
        const sub = path.slice(0, n);
        const o = get(root, sub);
        if (!isObj(o) || Object.keys(o).length || get(orig, sub) !== undefined)
          break;
        delete get(root, sub.slice(0, -1))[sub[n - 1]];
      }
      return;
    }
    let o = root;
    for (const k of path.slice(0, -1)) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    o[path[path.length - 1]] = v;
  }

  function build(kind, state, orig, hints = {}) {
    const sections = [];
    const covered = new Set();
    const key = (path) => JSON.stringify(path.map(String));
    // A control over one path. `raw` is what the spec says; `value` is what
    // the control shows (raw, or the library default).
    const c = (type, label, path, x = {}) => {
      covered.add(key(path));
      const raw = get(state, path);
      return {
        type,
        label,
        path,
        raw,
        value: raw === undefined ? x.def : raw,
        code: isMarker(raw),
        set: (v) => put(state, path, v, orig),
        ...x,
      };
    };
    const sec = (title, controls) =>
      sections.push({ title, controls: controls.filter(Boolean) });
    // Plotly-style title: a string, or {text}. New titles use {text} unless plain.
    const title = (label, path, x = {}) => {
      const t = get(state, path);
      return typeof t === "string" ||
        isMarker(t) ||
        (t === undefined && x.plain)
        ? c("text", label, path, x)
        : c("text", label, [...path, "text"], x);
    };
    const colour = (label, path, hint) => {
      const raw = get(state, path);
      if (Array.isArray(raw)) {
        covered.add(key(path));
        return {
          type: "note",
          label,
          path,
          text: "one colour per point — see Data",
        };
      }
      return c("color", label, path, {
        placeholder: typeof hint === "string" ? hint : "",
      });
    };
    const str = (v) => (typeof v === "string" && !isMarker(v) ? v : "");

    if (kind === "plotly") {
      const data = state["1"];
      const L = state["2"];
      const full = hints.fullData || [];
      const fullL = hints.fullLayout || {};
      const traces = Array.isArray(data) ? data : [];
      if (isObj(L)) {
        sec("Chart", [
          title("title", ["2", "title"]),
          c("checkbox", "show legend", ["2", "showlegend"], {
            def: fullL.showlegend ?? traces.length > 1,
          }),
          c("select", "legend layout", ["2", "legend", "orientation"], {
            options: [
              ["v", "vertical"],
              ["h", "horizontal"],
            ],
          }),
          traces.some((t) => t && /^(bar|histogram)$/.test(t.type)) &&
            c("select", "bar mode", ["2", "barmode"], {
              options: opts("group stack overlay relative"),
            }),
          c("select", "hover", ["2", "hovermode"], {
            options: [
              ["closest", "closest"],
              ["x", "x"],
              ["x unified", "x unified"],
              [false, "off"],
            ],
          }),
          c("number", "font size", ["2", "font", "size"], {
            min: 6,
            placeholder: fullL.font && fullL.font.size,
          }),
          c("number", "height (px)", ["2", "height"], {
            min: 100,
            step: 10,
            placeholder: fullL.height,
          }),
          colour("plot background", ["2", "plot_bgcolor"], fullL.plot_bgcolor),
          colour(
            "page background",
            ["2", "paper_bgcolor"],
            fullL.paper_bgcolor,
          ),
        ]);
        const axes = new Set([
          "xaxis",
          "yaxis",
          ...Object.keys(L).filter((k) => /^[xy]axis\d*$/.test(k)),
        ]);
        if (traces.some((t) => t && t.type === "pie")) axes.clear();
        for (const a of [...axes].sort()) {
          const fa = fullL[a] || {};
          const numeric = !/^(date|category|multicategory)$/.test(
            fa.type || get(L, [a, "type"]) || "",
          );
          const bound = (i) =>
            c("number", i ? "max" : "min", ["2", a, "range", i], {
              placeholder:
                fa.range && typeof fa.range[i] === "number"
                  ? +fa.range[i].toPrecision(4)
                  : "auto",
              set: (v) => {
                if (v === undefined)
                  return put(state, ["2", a, "range"], undefined, orig);
                const r = get(state, ["2", a, "range"]);
                const next = Array.isArray(r)
                  ? [...r]
                  : fa.range
                    ? [...fa.range]
                    : [0, 1];
                next[i] = v;
                put(state, ["2", a, "range"], next, orig);
                if (get(state, ["2", a, "autorange"]) !== undefined)
                  put(state, ["2", a, "autorange"], undefined, orig);
              },
            });
          covered.add(key(["2", a, "range"]));
          sec(a.replace("axis", " axis"), [
            title("title", ["2", a, "title"]),
            c("select", "scale", ["2", a, "type"], {
              options: opts("linear log category date"),
            }),
            numeric && bound(0),
            numeric && bound(1),
            c("checkbox", "grid lines", ["2", a, "showgrid"], {
              def: fa.showgrid ?? true,
            }),
            c("checkbox", "zero line", ["2", a, "zeroline"], {
              def: fa.zeroline ?? true,
            }),
            c("text", "tick format", ["2", a, "tickformat"], {
              placeholder: "e.g. .0% or .2f",
            }),
            c("number", "tick angle", ["2", a, "tickangle"], {
              step: 15,
              placeholder: "auto",
            }),
          ]);
        }
      }
      traces.forEach((t, i) => {
        if (!isObj(t)) return;
        const b = ["1", i];
        const ft = full[i] || {};
        const type = t.type || "scatter";
        const scatter = /^scatter/.test(type);
        const mode = str(t.mode) || ft.mode || "lines+markers";
        const lines = scatter && /lines/.test(mode);
        const markers = !scatter || /markers/.test(mode);
        const fm = ft.marker || {};
        const fl = ft.line || {};
        sec(`Series ${i + 1}${str(t.name) ? " · " + t.name : ""}`, [
          c("text", "name", [...b, "name"], {
            placeholder: ft.name || `trace ${i}`,
          }),
          c("select", "type", [...b, "type"], {
            options: opts("scatter bar histogram box violin pie heatmap"),
            defLabel: "(default: scatter)",
          }),
          scatter &&
            c("select", "mode", [...b, "mode"], {
              options: opts(
                "lines markers lines+markers text lines+text markers+text none",
              ),
            }),
          /^(bar|histogram|box|violin)$/.test(type) &&
            c("select", "orientation", [...b, "orientation"], {
              options: [
                ["v", "vertical"],
                ["h", "horizontal"],
              ],
            }),
          lines && colour("line colour", [...b, "line", "color"], fl.color),
          lines &&
            c("number", "line width", [...b, "line", "width"], {
              min: 0,
              step: 0.5,
              placeholder: fl.width,
            }),
          lines &&
            c("select", "line style", [...b, "line", "dash"], {
              options: opts("solid dot dash longdash dashdot"),
            }),
          lines &&
            c("select", "line shape", [...b, "line", "shape"], {
              options: opts("linear spline hv vh"),
            }),
          markers &&
            type !== "heatmap" &&
            type !== "pie" &&
            colour(
              scatter ? "marker colour" : "colour",
              [...b, "marker", "color"],
              fm.color,
            ),
          scatter &&
            markers &&
            !Array.isArray(get(t, ["marker", "size"])) &&
            c("number", "marker size", [...b, "marker", "size"], {
              min: 0,
              placeholder: fm.size,
            }),
          type === "heatmap" &&
            c("select", "colour scale", [...b, "colorscale"], {
              options: opts(
                "Viridis Cividis Blues Greens Reds YlGnBu RdBu Greys Hot",
              ),
            }),
          type === "pie" &&
            c("number", "hole", [...b, "hole"], {
              min: 0,
              max: 0.9,
              step: 0.05,
              placeholder: "0",
            }),
          c("range", "opacity", [...b, "opacity"], {
            min: 0,
            max: 1,
            step: 0.05,
            def: 1,
          }),
          c("select", "visible", [...b, "visible"], {
            options: [
              [true, "shown"],
              ["legendonly", "legend only"],
              [false, "hidden"],
            ],
          }),
          c("checkbox", "in legend", [...b, "showlegend"], { def: true }),
        ]);
      });
    }

    if (kind === "chartjs" && isObj(state["1"])) {
      const cfg = state["1"];
      const type = str(cfg.type) || "bar";
      const O = ["1", "options"];
      const cartesian = !/^(pie|doughnut|radar|polarArea)$/.test(type);
      const scales = get(cfg, ["options", "scales"]);
      const ids = isObj(scales) ? Object.keys(scales) : [];
      if (cartesian)
        for (const a of ["x", "y"]) if (!ids.includes(a)) ids.push(a);
      covered.add(key([...O, "scales", "x", "stacked"]));
      covered.add(key([...O, "scales", "y", "stacked"]));
      sec("Chart", [
        c("select", "type", ["1", "type"], {
          options: opts("bar line pie doughnut radar polarArea scatter bubble"),
          noDefault: true,
        }),
        c("text", "title", [...O, "plugins", "title", "text"], {
          set: (v) => {
            put(state, [...O, "plugins", "title", "text"], v, orig);
            if (
              v !== undefined &&
              get(state, [...O, "plugins", "title", "display"]) !== true
            )
              put(state, [...O, "plugins", "title", "display"], true, orig);
          },
        }),
        c("checkbox", "show title", [...O, "plugins", "title", "display"], {
          def: false,
        }),
        c("checkbox", "show legend", [...O, "plugins", "legend", "display"], {
          def: true,
        }),
        c(
          "select",
          "legend position",
          [...O, "plugins", "legend", "position"],
          {
            options: opts("top bottom left right chartArea"),
          },
        ),
        cartesian &&
          c("checkbox", "horizontal", [...O, "indexAxis"], {
            value: get(cfg, ["options", "indexAxis"]) === "y",
            set: (v) =>
              put(state, [...O, "indexAxis"], v ? "y" : undefined, orig),
          }),
        cartesian && {
          type: "checkbox",
          label: "stacked",
          path: [...O, "scales", "x", "stacked"],
          raw: get(cfg, ["options", "scales", "x", "stacked"]),
          value: get(cfg, ["options", "scales", "x", "stacked"]) === true,
          set: (v) => {
            for (const a of ["x", "y"])
              put(
                state,
                [...O, "scales", a, "stacked"],
                v ? true : undefined,
                orig,
              );
          },
        },
        c("number", "aspect ratio", [...O, "aspectRatio"], {
          min: 0.2,
          step: 0.1,
          placeholder: cartesian ? "2" : "1",
        }),
      ]);
      if (!Array.isArray(scales))
        for (const a of ids) {
          const S = [...O, "scales", a];
          sec(`${a} axis`, [
            c("text", "title", [...S, "title", "text"], {
              set: (v) => {
                put(state, [...S, "title", "text"], v, orig);
                if (
                  v !== undefined &&
                  get(state, [...S, "title", "display"]) !== true
                )
                  put(state, [...S, "title", "display"], true, orig);
              },
            }),
            c("checkbox", "show title", [...S, "title", "display"], {
              def: false,
            }),
            c("select", "scale", [...S, "type"], {
              options: opts("linear logarithmic category time"),
            }),
            c("checkbox", "start at zero", [...S, "beginAtZero"], {
              def: false,
            }),
            c("number", "min", [...S, "min"], { placeholder: "auto" }),
            c("number", "max", [...S, "max"], { placeholder: "auto" }),
            c("checkbox", "grid lines", [...S, "grid", "display"], {
              def: true,
            }),
            c("checkbox", "show axis", [...S, "display"], { def: true }),
          ]);
        }
      const sets = get(cfg, ["data", "datasets"]);
      (Array.isArray(sets) ? sets : []).forEach((d, i) => {
        if (!isObj(d)) return;
        const b = ["1", "data", "datasets", i];
        const dtype = str(d.type) || type;
        const line = /^(line|radar)$/.test(dtype);
        sec(`Dataset ${i + 1}${str(d.label) ? " · " + d.label : ""}`, [
          c("text", "label", [...b, "label"]),
          cartesian &&
            c("select", "type", [...b, "type"], {
              options: opts("bar line scatter bubble"),
              defLabel: `(chart: ${type})`,
            }),
          colour("fill colour", [...b, "backgroundColor"]),
          colour("border colour", [...b, "borderColor"]),
          c("number", "border width", [...b, "borderWidth"], {
            min: 0,
            step: 0.5,
            placeholder: line ? "3" : "0",
          }),
          line && c("checkbox", "fill area", [...b, "fill"], { def: false }),
          line &&
            c("range", "curve", [...b, "tension"], {
              min: 0,
              max: 1,
              step: 0.05,
              def: 0,
            }),
          line &&
            c("number", "point size", [...b, "pointRadius"], {
              min: 0,
              placeholder: "3",
            }),
          dtype === "bar" &&
            c("number", "corner radius", [...b, "borderRadius"], {
              min: 0,
              placeholder: "0",
            }),
          c("checkbox", "hidden", [...b, "hidden"], { def: false }),
        ]);
      });
    }

    if (kind === "vega" && isObj(state["1"])) {
      const S = state["1"];
      const rows = get(S, ["data", "values"]);
      const fields = Array.isArray(rows)
        ? [...new Set(rows.flatMap((r) => (isObj(r) ? Object.keys(r) : [])))]
        : [];
      sec("Chart", [
        title("title", ["1", "title"], { plain: true }),
        c("auto", "width", ["1", "width"], { placeholder: "auto" }),
        c("auto", "height", ["1", "height"], { placeholder: "auto" }),
      ]);
      const units = Array.isArray(S.layer)
        ? S.layer.map((l, i) => [["1", "layer", i], `Layer ${i + 1} · `])
        : [[["1"], ""]];
      for (const [b, prefix] of units) {
        const unit = get(state, b);
        if (!isObj(unit)) continue;
        const M = [...b, "mark"];
        const mark = unit.mark;
        if (mark !== undefined && !isMarker(mark)) {
          const mtype =
            typeof mark === "string" ? mark : str(get(mark, ["type"]));
          // Mark may be "bar" or {type: "bar", …}; props turn a string into an object.
          const prop = (type, label, p, x = {}) => {
            covered.add(key([...M, p]));
            const raw = isObj(mark) ? mark[p] : undefined;
            return {
              type,
              label,
              path: [...M, p],
              raw,
              value: raw === undefined ? x.def : raw,
              code: isMarker(raw),
              set: (v) => {
                const m = get(state, M);
                if (typeof m === "string") {
                  if (v !== undefined) put(state, M, { type: m, [p]: v }, orig);
                } else put(state, [...M, p], v, orig);
              },
              ...x,
            };
          };
          covered.add(key(M));
          covered.add(key([...M, "type"]));
          const area = /^(line|area|trail)$/.test(mtype);
          sec(prefix + "Mark", [
            {
              type: "select",
              label: "type",
              path: M,
              raw: mtype,
              value: mtype,
              noDefault: true,
              options: opts(
                "bar line point area circle square tick rule arc text rect boxplot trail",
              ),
              set: (v) => {
                const m = get(state, M);
                if (typeof m === "string") put(state, M, v, orig);
                else put(state, [...M, "type"], v, orig);
              },
            },
            prop("color", "colour", "color"),
            prop("range", "opacity", "opacity", {
              min: 0,
              max: 1,
              step: 0.05,
              def: 1,
            }),
            prop("checkbox", "tooltip", "tooltip", { def: false }),
            area && prop("checkbox", "points", "point", { def: false }),
            area &&
              prop("select", "interpolate", "interpolate", {
                options: opts("linear monotone step basis"),
              }),
            area &&
              prop("number", "line width", "strokeWidth", {
                min: 0,
                step: 0.5,
                placeholder: "2",
              }),
            mtype === "bar" &&
              prop("number", "corner radius", "cornerRadiusEnd", {
                min: 0,
                placeholder: "0",
              }),
            mtype === "arc" &&
              prop("number", "inner radius", "innerRadius", {
                min: 0,
                placeholder: "0",
              }),
          ]);
        }
        const enc = unit.encoding;
        if (!isObj(enc)) continue;
        for (const ch of Object.keys(enc)) {
          const E = [...b, "encoding", ch];
          const e = enc[ch];
          if (!isObj(e)) continue;
          const fieldOpts = [
            ...new Set([...fields, ...(str(e.field) ? [e.field] : [])]),
          ].map((f) => [f, f]);
          sec(`${prefix}${ch} encoding`, [
            "value" in e && !("field" in e)
              ? ch === "color"
                ? colour("value", [...E, "value"])
                : c("auto", "value", [...E, "value"])
              : c("select", "field", [...E, "field"], {
                  options: fieldOpts,
                  defLabel: "(none)",
                }),
            "field" in e &&
              c("select", "type", [...E, "type"], {
                options: opts("quantitative nominal ordinal temporal"),
              }),
            "field" in e &&
              c("select", "aggregate", [...E, "aggregate"], {
                options: opts("sum mean median count min max"),
                defLabel: "(none)",
              }),
            c("text", "title", [...E, "title"]),
            /^(x|y|color)$/.test(ch) &&
              "field" in e &&
              c("select", "sort", [...E, "sort"], {
                options: opts("ascending descending -x -y x y"),
              }),
            /^(x|y)$/.test(ch) &&
              c("checkbox", "start at zero", [...E, "scale", "zero"], {
                def: true,
              }),
            /^(x|y)$/.test(ch) &&
              c("checkbox", "grid lines", [...E, "axis", "grid"], {
                def: ch === "y",
              }),
            ch === "color" &&
              "field" in e &&
              c("select", "colour scheme", [...E, "scale", "scheme"], {
                options: opts(
                  "tableau10 category10 set2 dark2 blues greens reds viridis magma",
                ),
              }),
          ]);
        }
        const missing = [
          "x",
          "y",
          "color",
          "size",
          "shape",
          "opacity",
          "column",
          "row",
          "tooltip",
        ].filter((ch) => !(ch in enc));
        if (missing.length && fields.length)
          sec(prefix + "Add encoding", [
            {
              type: "select",
              label: "add channel",
              path: [...b, "encoding", "+"],
              raw: undefined,
              value: undefined,
              defLabel: "choose…",
              noReset: true,
              options: missing.map((m) => [m, m]),
              set: (v) =>
                v &&
                put(
                  state,
                  [...b, "encoding", v],
                  { field: fields[0], type: "nominal" },
                  orig,
                ),
            },
          ]);
      }
    }

    // Everything else that reads like a title, label, colour or switch.
    const TEXT_KEY =
      /^(title|text|name|label|labels|ticktext|legendgroup|xlabel|ylabel)$/i;
    const COLOR_KEY = /colou?r$/i;
    const more = [];
    const walk = (v, path) => {
      if (more.length > 60) return;
      const k = String(path[path.length - 1]);
      const parent = path.length > 1 ? String(path[path.length - 2]) : "";
      if (covered.has(key(path))) return;
      if (typeof v === "string" && !isMarker(v)) {
        if (TEXT_KEY.test(k) || (TEXT_KEY.test(parent) && /^\d+$/.test(k)))
          more.push(c("text", label(path), path));
        else if (
          COLOR_KEY.test(k) ||
          (COLOR_KEY.test(parent) && /^\d+$/.test(k))
        )
          more.push(c("color", label(path), path));
      } else if (typeof v === "boolean")
        more.push(c("checkbox", label(path), path));
      else if (v && typeof v === "object") {
        if (Array.isArray(v) && v.length > 60 && prim(v[0])) return; // data columns
        if (kind === "vega" && path[1] === "data") return;
        for (const k2 of Object.keys(v)) walk(v[k2], [...path, k2]);
      }
    };
    const names =
      {
        plotly: { 1: "data", 2: "layout" },
        chartjs: { 1: "config" },
        vega: { 1: "spec" },
      }[kind] || {};
    const label = (path) =>
      [names[path[0]] || path[0], ...path.slice(1)].join(" › ");
    for (const arg of Object.keys(state || {})) walk(state[arg], [arg]);
    if (more.length)
      sections.push({
        title: "More fields",
        controls: more,
        closed: sections.length > 0,
      });
    return { sections };
  }

  // ---------- data tables ----------
  // A table: {title, columns: [name], rows, get(r, j), set(r, j, text), add(), remove(r)}
  // or {title, note} when the data can't be edited as a table.
  const MAX_ROWS = 500;
  function parseCell(text, numeric) {
    if (!numeric) return text;
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  const isNumCol = (arr) =>
    arr.some((v) => typeof v === "number") &&
    arr.every((v) => v == null || typeof v === "number");
  const nextOf = (arr) => {
    const last = arr[arr.length - 1];
    if (
      typeof last === "number" &&
      arr.length > 1 &&
      typeof arr[arr.length - 2] === "number"
    ) {
      const d = last - arr[arr.length - 2];
      return Number.isInteger(d) ? last + d : last;
    }
    return last === undefined ? "" : last;
  };
  const lastOf = (arr) => (arr.length ? arr[arr.length - 1] : "");
  // Parallel arrays (Plotly x/y, Chart.js labels/data) as one table.
  function columnsTable(state, title, cols) {
    cols = cols.filter(([, path]) => {
      const a = get(state, path);
      return Array.isArray(a) && a.every((v) => prim(v) && !isMarker(v));
    });
    if (!cols.length) return null;
    const arr = (j) => get(state, cols[j][1]);
    const rows = Math.max(...cols.map((_, j) => arr(j).length));
    if (rows > MAX_ROWS)
      return { title, note: `${rows} rows — too many to edit here; use Code.` };
    const numeric = cols.map((_, j) => isNumCol(arr(j)));
    return {
      title,
      columns: cols.map(([n]) => n),
      numeric,
      rows,
      get: (r, j) => arr(j)[r],
      set: (r, j, text) => {
        arr(j)[r] = parseCell(text, numeric[j]);
      },
      add: () => {
        for (let j = 0; j < cols.length; j++) arr(j).push(j === 0 ? nextOf(arr(j)) : lastOf(arr(j)));
      },
      remove: (r) => {
        for (let j = 0; j < cols.length; j++) arr(j).splice(r, 1);
      },
    };
  }

  function tables(kind, state) {
    const out = [];
    if (kind === "plotly" && Array.isArray(state["1"])) {
      state["1"].forEach((t, i) => {
        if (!isObj(t)) return;
        const keys = [
          "x",
          "y",
          "labels",
          "values",
          "text",
          "marker.color",
          "marker.size",
        ];
        const tb = columnsTable(
          state,
          `Series ${i + 1}${typeof t.name === "string" && !isMarker(t.name) ? " · " + t.name : ""}`,
          keys.map((k) => [k, ["1", i, ...k.split(".")]]),
        );
        if (tb) out.push(tb);
      });
    }
    if (kind === "chartjs" && isObj(state["1"])) {
      const sets = get(state, ["1", "data", "datasets"]);
      const cols = [["labels", ["1", "data", "labels"]]];
      (Array.isArray(sets) ? sets : []).forEach((d, i) => {
        const name =
          isObj(d) && typeof d.label === "string" && !isMarker(d.label)
            ? d.label
            : `dataset ${i + 1}`;
        cols.push([name, ["1", "data", "datasets", i, "data"]]);
        if (isObj(d) && Array.isArray(d.backgroundColor))
          cols.push([
            `${name} colour`,
            ["1", "data", "datasets", i, "backgroundColor"],
          ]);
      });
      const tb = columnsTable(state, "Data", cols);
      if (tb) out.push(tb);
    }
    if (kind === "vega" && isObj(state["1"])) {
      const rows = get(state, ["1", "data", "values"]);
      if (Array.isArray(rows) && rows.every(isObj)) {
        if (rows.length > MAX_ROWS)
          out.push({
            title: "data.values",
            note: `${rows.length} rows — use Code.`,
          });
        else {
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
            (k) => rows.every((r) => prim(r[k]) || r[k] === undefined),
          );
          const numeric = cols.map((k) => isNumCol(rows.map((r) => r[k])));
          out.push({
            title: "data.values",
            columns: cols,
            numeric,
            rows: rows.length,
            get: (r, j) => rows[r][cols[j]],
            set: (r, j, text) => {
              rows[r][cols[j]] = parseCell(text, numeric[j]);
            },
            add: () =>
              rows.push(rows.length ? { ...rows[rows.length - 1] } : {}),
            remove: (r) => rows.splice(r, 1),
          });
        }
      }
    }
    return out;
  }

  return { build, tables, put, get, isMarker };
});
