#!/usr/bin/env node
/**
 * Fluidity build script.
 *
 * Emits the shipped stylesheet (`index.css`) plus the validation assets
 * (`examples/coverage.html`, `examples/manifest.json`) from the utility table
 * below. The published library is plain CSS: this generator is a dev-time tool
 * only, never a runtime dependency.
 *
 * Usage:
 *   node scripts/build-css.mjs           write generated files
 *   node scripts/build-css.mjs --check   fail if generated files are stale
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "f6y";

/* ------------------------------------------------------------------------- *
 * Core math
 * ------------------------------------------------------------------------- */

/** Measured axis. Any <length>: viewport units (default) or container units. */
const AXIS = `var(--${PREFIX}-axis, 100vw)`;
/** Axis size at which scaling starts. */
const LOWER = `var(--${PREFIX}-lower, var(--breakpoint-sm, 40rem))`;
/** Axis size at which scaling stops. */
const UPPER = `var(--${PREFIX}-upper, var(--breakpoint-2xl, 96rem))`;
/** Exponent/logarithm base for the non-linear curves. Must be > 1. */
const BASE = `var(--${PREFIX}-base, 2)`;
/** Multiplier applied to the min value when no max is given. */
const RATIO = `var(--${PREFIX}-ratio, 2)`;

/**
 * Normalised progress, clamped to [0, 1].
 *
 * `tan(atan2(a, b))` divides two <length>s into a unitless <number>; plain
 * `calc()` cannot divide a length by a length. Clamping progress (instead of
 * clamping the output) keeps the result bounded by min/max with one fewer
 * math node per declaration.
 */
const T = `clamp(0, tan(atan2(${AXIS} - ${LOWER}, ${UPPER} - ${LOWER})), 1)`;

/** Easing curves: [0,1] -> [0,1], all three meeting at 0 and 1. */
const CURVES = [
  {
    id: "lin",
    ns: "",
    label: "linear",
    ease: T,
    doc: "Linear ramp: progress is used as-is.",
  },
  {
    id: "exp",
    ns: "exp-",
    label: "exponential",
    ease: `calc((pow(${BASE}, ${T}) - 1) / (${BASE} - 1))`,
    doc: `Exponential ease-in: \`(base^t - 1) / (base - 1)\`, base \`--${PREFIX}-base\` (default 2).`,
  },
  {
    id: "log",
    ns: "log-",
    label: "logarithmic",
    ease: `log(1 + (${BASE} - 1) * ${T}, ${BASE})`,
    doc: `Logarithmic ease-out: \`log(1 + (base - 1)t, base)\`, the exact inverse of the exponential curve.`,
  },
];

/** `min` given, `max` omitted: max is `min * ratio`, folded to one product. */
const outDefault = (min, ease) => `calc(${min} * (1 + (${RATIO} - 1) * ${ease}))`;
/** Both bounds given. */
const outPair = (min, max, ease) => `calc(${min} + (${max} - ${min}) * ${ease})`;

/* ------------------------------------------------------------------------- *
 * Value kinds
 *
 * `mins`/`maxs` are alternative token sets for one bound. Tailwind drops any
 * declaration whose `--value()`/`--modifier()` fails to resolve, so emitting
 * one declaration per combination leaves exactly one live declaration per
 * class in the compiled output. Bounds that need no wrapper are merged into a
 * single `--value()` call; wrapped forms (spacing scale, px counts) need their
 * own declaration.
 * ------------------------------------------------------------------------- */

const KINDS = {
  spacing: {
    accepts:
      "spacing-scale numbers (`4`, `2.5`) or arbitrary `[length]` / `[percentage]`",
    bare: "`--spacing(4)`",
    mins: [`--spacing(--value(number, --default(4)))`, `--value([length], [percentage])`],
    maxs: [`--spacing(--modifier(number))`, `--modifier([length], [percentage])`],
    instances: [
      { id: "pair", suffix: "-2/8" },
      { id: "arb", suffix: "-[1rem]/[3rem]" },
      { id: "mixed", suffix: "-2/[3rem]" },
      { id: "min", suffix: "-2", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
  sizing: {
    accepts:
      "spacing-scale numbers (`16`), `--container-*` keys (`md`) or arbitrary `[length]` / `[percentage]`",
    bare: "`--spacing(16)`",
    mins: [
      `--spacing(--value(number, --default(16)))`,
      `--value(--container-*, [length], [percentage])`,
    ],
    maxs: [
      `--spacing(--modifier(number))`,
      `--modifier(--container-*, [length], [percentage])`,
    ],
    instances: [
      { id: "pair", suffix: "-8/24" },
      { id: "theme", suffix: "-xs/md" },
      { id: "arb", suffix: "-[4rem]/[12rem]" },
      { id: "min", suffix: "-8", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
  fontSize: {
    accepts: "`--text-*` keys (`sm`) or arbitrary `[length]` / `[percentage]`",
    bare: "`var(--text-base)`",
    mins: [
      `--value(--text-*, [length], [percentage], --default(var(--text-base, 1rem)))`,
    ],
    maxs: [`--modifier(--text-*, [length], [percentage])`],
    instances: [
      { id: "pair", suffix: "-sm/3xl" },
      { id: "arb", suffix: "-[10px]/[30px]" },
      { id: "min", suffix: "-sm", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
  leading: {
    accepts:
      "spacing-scale numbers (`6`), `--leading-*` keys (`tight`) or arbitrary `[number]` / `[length]` / `[percentage]`",
    bare: "`--spacing(6)`",
    mins: [
      `--spacing(--value(number, --default(6)))`,
      `--value(--leading-*, [number], [length], [percentage])`,
    ],
    maxs: [
      `--spacing(--modifier(number))`,
      `--modifier(--leading-*, [number], [length], [percentage])`,
    ],
    instances: [
      { id: "pair", suffix: "-4/8" },
      { id: "theme", suffix: "-tight/loose" },
      { id: "arb", suffix: "-[1.2]/[2]" },
      { id: "min", suffix: "-4", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
  tracking: {
    accepts: "`--tracking-*` keys (`wide`) or arbitrary `[length]` / `[percentage]`",
    bare: "`var(--tracking-normal)` (`0em`)",
    mins: [
      `--value(--tracking-*, [length], [percentage], --default(var(--tracking-normal, 0em)))`,
    ],
    maxs: [`--modifier(--tracking-*, [length], [percentage])`],
    instances: [
      { id: "pair", suffix: "-normal/widest" },
      { id: "arb", suffix: "-[0.01em]/[0.1em]" },
      { id: "min", suffix: "-wide", ratio: true },
      { id: "bare", suffix: "", ratio: true, constant: true },
    ],
  },
  radius: {
    accepts: "`--radius-*` keys (`sm`) or arbitrary `[length]` / `[percentage]`",
    bare: "`var(--radius-md)`",
    mins: [
      `--value(--radius-*, [length], [percentage], --default(var(--radius-md, 0.375rem)))`,
    ],
    maxs: [`--modifier(--radius-*, [length], [percentage])`],
    instances: [
      { id: "pair", suffix: "-sm/2xl" },
      { id: "arb", suffix: "-[2px]/[10px]" },
      { id: "min", suffix: "-sm", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
  lineWidth: {
    accepts: "px counts (`2`) or arbitrary `[length]`",
    bare: "`1px`",
    mins: [`calc(--value(number, --default(1)) * 1px)`, `--value([length])`],
    maxs: [`calc(--modifier(number) * 1px)`, `--modifier([length])`],
    instances: [
      { id: "pair", suffix: "-1/8" },
      { id: "arb", suffix: "-[1px]/[6px]" },
      { id: "min", suffix: "-2", ratio: true },
      { id: "bare", suffix: "", ratio: true },
    ],
  },
};

/* ------------------------------------------------------------------------- *
 * Utility table
 * ------------------------------------------------------------------------- */

/** @type {{group: string, blurb: string, kind?: string, childSelector?: boolean, items: [string, string|string[], {kind?: string, wrap?: string}?][]}[]} */
const GROUPS = [
  {
    group: "Padding",
    blurb: "Fluid `padding` on every edge and logical axis.",
    kind: "spacing",
    items: [
      ["p", "padding"],
      ["px", "padding-inline"],
      ["py", "padding-block"],
      ["ps", "padding-inline-start"],
      ["pe", "padding-inline-end"],
      ["pt", "padding-top"],
      ["pr", "padding-right"],
      ["pb", "padding-bottom"],
      ["pl", "padding-left"],
    ],
  },
  {
    group: "Margin",
    blurb: "Fluid `margin` on every edge and logical axis.",
    kind: "spacing",
    items: [
      ["m", "margin"],
      ["mx", "margin-inline"],
      ["my", "margin-block"],
      ["ms", "margin-inline-start"],
      ["me", "margin-inline-end"],
      ["mt", "margin-top"],
      ["mr", "margin-right"],
      ["mb", "margin-bottom"],
      ["ml", "margin-left"],
    ],
  },
  {
    group: "Gap",
    blurb: "Fluid grid and flex gutters.",
    kind: "spacing",
    items: [
      ["gap", "gap"],
      ["gap-x", "column-gap"],
      ["gap-y", "row-gap"],
    ],
  },
  {
    group: "Space between",
    blurb:
      "Fluid spacing between direct children. Applies to every child except the last; no reverse variant.",
    kind: "spacing",
    childSelector: true,
    items: [
      ["space-x", "margin-inline-end"],
      ["space-y", "margin-block-end"],
    ],
  },
  {
    group: "Position",
    blurb: "Fluid offsets for positioned elements.",
    kind: "spacing",
    items: [
      ["inset", "inset"],
      ["inset-x", "inset-inline"],
      ["inset-y", "inset-block"],
      ["start", "inset-inline-start"],
      ["end", "inset-inline-end"],
      ["top", "top"],
      ["right", "right"],
      ["bottom", "bottom"],
      ["left", "left"],
    ],
  },
  {
    group: "Scroll margin",
    blurb: "Fluid scroll snap/anchor margins.",
    kind: "spacing",
    items: [
      ["scroll-m", "scroll-margin"],
      ["scroll-mx", "scroll-margin-inline"],
      ["scroll-my", "scroll-margin-block"],
      ["scroll-ms", "scroll-margin-inline-start"],
      ["scroll-me", "scroll-margin-inline-end"],
      ["scroll-mt", "scroll-margin-top"],
      ["scroll-mr", "scroll-margin-right"],
      ["scroll-mb", "scroll-margin-bottom"],
      ["scroll-ml", "scroll-margin-left"],
    ],
  },
  {
    group: "Scroll padding",
    blurb: "Fluid scroll snap/anchor padding.",
    kind: "spacing",
    items: [
      ["scroll-p", "scroll-padding"],
      ["scroll-px", "scroll-padding-inline"],
      ["scroll-py", "scroll-padding-block"],
      ["scroll-ps", "scroll-padding-inline-start"],
      ["scroll-pe", "scroll-padding-inline-end"],
      ["scroll-pt", "scroll-padding-top"],
      ["scroll-pr", "scroll-padding-right"],
      ["scroll-pb", "scroll-padding-bottom"],
      ["scroll-pl", "scroll-padding-left"],
    ],
  },
  {
    group: "Sizing",
    blurb: "Fluid box dimensions and flex basis.",
    kind: "sizing",
    items: [
      ["w", "width"],
      ["h", "height"],
      ["size", ["width", "height"]],
      ["min-w", "min-width"],
      ["min-h", "min-height"],
      ["max-w", "max-width"],
      ["max-h", "max-height"],
      ["basis", "flex-basis", { wrap: "flex" }],
    ],
  },
  {
    group: "Typography",
    blurb: "Fluid type scale, leading, tracking and indent.",
    items: [
      ["text", "font-size", { kind: "fontSize" }],
      ["leading", "line-height", { kind: "leading" }],
      ["tracking", "letter-spacing", { kind: "tracking" }],
      ["indent", "text-indent", { kind: "spacing" }],
    ],
  },
  {
    group: "Border radius",
    blurb: "Fluid corner rounding.",
    kind: "radius",
    items: [
      ["rounded", "border-radius"],
      ["rounded-t", ["border-top-left-radius", "border-top-right-radius"]],
      ["rounded-r", ["border-top-right-radius", "border-bottom-right-radius"]],
      ["rounded-b", ["border-bottom-right-radius", "border-bottom-left-radius"]],
      ["rounded-l", ["border-top-left-radius", "border-bottom-left-radius"]],
      ["rounded-s", ["border-start-start-radius", "border-end-start-radius"]],
      ["rounded-e", ["border-start-end-radius", "border-end-end-radius"]],
      ["rounded-tl", "border-top-left-radius"],
      ["rounded-tr", "border-top-right-radius"],
      ["rounded-br", "border-bottom-right-radius"],
      ["rounded-bl", "border-bottom-left-radius"],
      ["rounded-ss", "border-start-start-radius"],
      ["rounded-se", "border-start-end-radius"],
      ["rounded-es", "border-end-start-radius"],
      ["rounded-ee", "border-end-end-radius"],
    ],
  },
  {
    group: "Border and outline width",
    blurb: "Fluid border, outline and outline offset widths.",
    kind: "lineWidth",
    items: [
      ["border", "border-width"],
      ["border-x", "border-inline-width"],
      ["border-y", "border-block-width"],
      ["border-s", "border-inline-start-width"],
      ["border-e", "border-inline-end-width"],
      ["border-t", "border-top-width"],
      ["border-r", "border-right-width"],
      ["border-b", "border-bottom-width"],
      ["border-l", "border-left-width"],
      ["outline", "outline-width"],
      ["outline-offset", "outline-offset"],
    ],
  },
];

/** Longhand to read with `getComputedStyle` when the utility sets a shorthand. */
const PROBE_OVERRIDES = {
  padding: "paddingTop",
  "padding-inline": "paddingInlineStart",
  "padding-block": "paddingBlockStart",
  margin: "marginTop",
  "margin-inline": "marginInlineStart",
  "margin-block": "marginBlockStart",
  gap: "rowGap",
  inset: "top",
  "inset-inline": "insetInlineStart",
  "inset-block": "insetBlockStart",
  "scroll-margin": "scrollMarginTop",
  "scroll-margin-inline": "scrollMarginInlineStart",
  "scroll-margin-block": "scrollMarginBlockStart",
  "scroll-padding": "scrollPaddingTop",
  "scroll-padding-inline": "scrollPaddingInlineStart",
  "scroll-padding-block": "scrollPaddingBlockStart",
  "border-width": "borderTopWidth",
  "border-inline-width": "borderInlineStartWidth",
  "border-block-width": "borderBlockStartWidth",
  "border-radius": "borderTopLeftRadius",
};

const camel = (prop) => prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const probeFor = (prop) => PROBE_OVERRIDES[prop] ?? camel(prop);

/* ------------------------------------------------------------------------- *
 * Emitters
 * ------------------------------------------------------------------------- */

function declarationsFor(props, kind, ease, indent) {
  const out = [];
  for (const prop of props) {
    for (const min of kind.mins) out.push(`${indent}${prop}: ${outDefault(min, ease)};`);
    for (const min of kind.mins) {
      for (const max of kind.maxs) out.push(`${indent}${prop}: ${outPair(min, max, ease)};`);
    }
  }
  return out;
}

function utilityRule({ name, props, kind, curve, childSelector }) {
  const cls = `${PREFIX}-${curve.ns}${name}`;
  const propList = props.join("`, `");
  const doc = [
    "/**",
    ` * \`${cls}-<min>[/<max>]\` -> \`${propList}\` (${curve.label})`,
    " *",
    ` * ${curve.doc}`,
    ` * Bounds accept ${kind.accepts}.`,
    ` * Omit the modifier and max becomes \`min * var(--${PREFIX}-ratio, 2)\`;`,
    ` * omit the value entirely (\`${cls}\`) and min falls back to ${kind.bare}.`,
    childSelector ? " * Applies to every direct child except the last." : null,
    " */",
  ].filter(Boolean);

  const body = childSelector
    ? [
      `  :where(& > :not(:last-child)) {`,
      ...declarationsFor(props, kind, curve.ease, "    "),
      `  }`,
    ]
    : declarationsFor(props, kind, curve.ease, "  ");

  return [...doc, `@utility ${cls}-* {`, ...body, `}`].join("\n");
}

const AXIS_UNITS = [
  ["vw", "100vw", "viewport width"],
  ["vh", "100vh", "viewport height"],
  ["vmin", "100vmin", "smaller viewport axis"],
  ["vmax", "100vmax", "larger viewport axis"],
  ["cqi", "100cqi", "container inline size"],
  ["cqb", "100cqb", "container block size"],
  ["cqw", "100cqw", "container width"],
  ["cqh", "100cqh", "container height"],
  ["cqmin", "100cqmin", "smaller container axis"],
  ["cqmax", "100cqmax", "larger container axis"],
];

function configSection() {
  const parts = [];

  parts.push(`/**
 * \`${PREFIX}-lower-<breakpoint|container|[length]>\` -> \`--${PREFIX}-lower\`
 *
 * Axis size at which scaling starts. Defaults to \`--breakpoint-sm\` (40rem).
 * Inherits, so it can be set once on an ancestor.
 */
@utility ${PREFIX}-lower-* {
  --${PREFIX}-lower: --value(--breakpoint-*, --container-*, [length]);
}`);

  parts.push(`/**
 * \`${PREFIX}-upper-<breakpoint|container|[length]>\` -> \`--${PREFIX}-upper\`
 *
 * Axis size at which scaling stops. Defaults to \`--breakpoint-2xl\` (96rem).
 * Inherits, so it can be set once on an ancestor.
 */
@utility ${PREFIX}-upper-* {
  --${PREFIX}-upper: --value(--breakpoint-*, --container-*, [length]);
}`);

  parts.push(`/**
 * \`${PREFIX}-base-<number>\` -> \`--${PREFIX}-base\`
 *
 * Base of the \`exp-\` and \`log-\` curves. Must be greater than 1; higher
 * values bend the curve harder. Defaults to 2. Ignored by linear utilities.
 */
@utility ${PREFIX}-base-* {
  --${PREFIX}-base: --value(number, [number]);
}`);

  parts.push(`/**
 * \`${PREFIX}-ratio-<number>\` -> \`--${PREFIX}-ratio\`
 *
 * Multiplier used to derive max from min when no modifier is given.
 * Defaults to 2.
 */
@utility ${PREFIX}-ratio-* {
  --${PREFIX}-ratio: --value(number, [number]);
}`);

  const axisDocs = AXIS_UNITS.map(([id, , label]) => ` * \`${PREFIX}-axis-${id}\` - ${label} (\`100${id}\`)`);
  parts.push(`/**
 * \`${PREFIX}-axis-<unit>\` / \`${PREFIX}-axis-[<length>]\` -> \`--${PREFIX}-axis\`
 *
 * Length that drives every fluid utility on this element and its descendants.
 * Defaults to \`100vw\`. Container units require an ancestor with
 * \`container-type\` set (Tailwind's \`@container\` utility).
 *
${axisDocs.join("\n")}
 */
${AXIS_UNITS.map(([id, value]) => `@utility ${PREFIX}-axis-${id} {\n  --${PREFIX}-axis: ${value};\n}`).join("\n")}
@utility ${PREFIX}-axis-* {
  --${PREFIX}-axis: --value([length]);
}`);

  return parts.join("\n\n");
}

const HEADER = `/*! fluidity - fluid UI scaling utilities for Tailwind CSS v4
 * Generated by scripts/build-css.mjs. Do not edit by hand.
 */

/**
 * Fluidity scales sizing and spacing values between a min and a max as the
 * measured axis grows, clamped at both ends.
 *
 *   <div class="${PREFIX}-p-2/8">        linear   0.5rem -> 2rem
 *   <div class="${PREFIX}-exp-p-2/8">    exponential
 *   <div class="${PREFIX}-log-p-2/8">    logarithmic
 *   <div class="${PREFIX}-p-2">          max defaults to min * ratio
 *   <div class="${PREFIX}-p">            min defaults per property group
 *
 * Progress is \`clamp(0, (axis - lower) / (upper - lower), 1)\`, computed with
 * \`tan(atan2())\` because \`calc()\` cannot divide a length by a length.
 *
 * Configuration (custom properties; all inherit, all have matching utilities):
 *
 *   --${PREFIX}-axis    measured length         default 100vw
 *   --${PREFIX}-lower   start of the ramp       default var(--breakpoint-sm)
 *   --${PREFIX}-upper   end of the ramp         default var(--breakpoint-2xl)
 *   --${PREFIX}-base    exp/log curve base      default 2      (must be > 1)
 *   --${PREFIX}-ratio   max = min * ratio       default 2
 *
 * Requires Tailwind CSS v4. Import after Tailwind:
 *
 *   @import "tailwindcss";
 *   @import "fluidity";
 */`;

function buildCss() {
  const chunks = [HEADER, "", "/* === Configuration ===================================================== */", "", configSection()];

  for (const group of GROUPS) {
    chunks.push("", `/* === ${group.group} ${"=".repeat(Math.max(3, 66 - group.group.length))} */`, "", `/* ${group.blurb} */`);
    for (const curve of CURVES) {
      for (const [name, propSpec, opts = {}] of group.items) {
        const kindId = opts.kind ?? group.kind;
        const kind = KINDS[kindId];
        const props = Array.isArray(propSpec) ? propSpec : [propSpec];
        chunks.push(
          "",
          utilityRule({
            name,
            props,
            kind,
            curve,
            childSelector: Boolean(group.childSelector),
          }),
        );
      }
    }
  }

  return `${chunks.join("\n")}\n`;
}

/* ------------------------------------------------------------------------- *
 * Validation assets
 * ------------------------------------------------------------------------- */

function buildManifestAndPage() {
  const cases = [];

  for (const group of GROUPS) {
    for (const [name, propSpec, opts = {}] of group.items) {
      const kindId = opts.kind ?? group.kind;
      const kind = KINDS[kindId];
      const props = Array.isArray(propSpec) ? propSpec : [propSpec];
      const probes = props.map(probeFor);
      for (const curve of CURVES) {
        for (const instance of kind.instances) {
          cases.push({
            id: `c${cases.length}`,
            cls: `${PREFIX}-${curve.ns}${name}${instance.suffix}`,
            group: group.group,
            name,
            kind: kindId,
            curve: curve.id,
            instance: instance.id,
            probes,
            probe: group.childSelector ? "child" : "self",
            wrap: opts.wrap ?? "none",
            ratio: Boolean(instance.ratio),
            constant: Boolean(instance.constant),
          });
        }
      }
    }
  }

  const rows = cases
    .map((c) => {
      const inner =
        c.probe === "child"
          ? `<div class="${c.cls}" data-u><b></b><b></b></div>`
          : `<div class="${c.cls}" data-u></div>`;
      const wrapOpen = c.wrap === "flex" ? `<div class="flex">` : "";
      const wrapClose = c.wrap === "flex" ? `</div>` : "";
      return `<div class="case" id="${c.id}">${wrapOpen}${inner}${wrapClose}</div>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>fluidity coverage fixtures</title>
<link rel="stylesheet" href="./dist/coverage.css">
<style>
  /* Fixtures only: keep every probe readable and layout-stable. */
  html { font-size: 16px; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .case { position: relative; }
  .case > * { position: relative; }
  [data-u] { position: relative; outline-style: solid; outline-color: #0000; }
  [data-u] > b { display: block; }
</style>
</head>
<body>
<!-- Generated by scripts/build-css.mjs. One element per utility x curve x value form. -->
${rows}
</body>
</html>
`;

  return { cases, html };
}

/* ------------------------------------------------------------------------- *
 * Write / check
 * ------------------------------------------------------------------------- */

const { cases, html } = buildManifestAndPage();
const files = {
  "index.css": buildCss(),
  "examples/src/coverage.css": [
    `/*! Generated by scripts/build-css.mjs. Do not edit by hand. */`,
    `@import "tailwindcss" source(none);`,
    `@import "../../index.css";`,
    `@source "../coverage.html";`,
    "",
  ].join("\n"),
  "examples/coverage.html": html,
  "examples/manifest.json": `${JSON.stringify(cases, null, 2)}\n`,
};

const check = process.argv.includes("--check");
let stale = 0;

for (const [rel, content] of Object.entries(files)) {
  const path = resolve(ROOT, rel);
  if (check) {
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch { }
    if (current !== content) {
      stale += 1;
      console.error(`stale: ${rel}`);
    }
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const ruleCount = (files["index.css"].match(/^@utility /gm) ?? []).length;

if (check) {
  if (stale) {
    console.error(`${stale} generated file(s) out of date. Run: npm run build`);
    process.exit(1);
  }
  console.log(`generated files up to date (${ruleCount} @utility rules)`);
} else {
  console.log(
    `index.css: ${ruleCount} @utility rules, ${files["index.css"].split("\n").length} lines\n` +
    `examples/coverage.html: ${cases.length} fixtures\n` +
    `examples/manifest.json: ${cases.length} cases`,
  );
}
