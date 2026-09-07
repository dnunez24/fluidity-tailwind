#!/usr/bin/env node
/**
 * Generates the two exhaustive reference pages under website/docs/05-reference/ by
 * parsing the doc comments already embedded in index.css — the single
 * source of truth scripts/build-css.mjs produces. Never hand-edit the
 * generated files; re-run this script (via `pnpm run docs:reference`)
 * whenever `pnpm run build` regenerates index.css.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(ROOT, "fluidity-tailwind/index.css"), "utf8");
const lines = css.split("\n");

/* ------------------------------------------------------------------------- *
 * Parse index.css into { groups: [{ name, blurb, rules: [{ doc, rules }] }] }
 * ------------------------------------------------------------------------- */

const groups = [];
let current = null;
let i = 0;
while (i < lines.length && !lines[i].startsWith("/* === ")) i++;

while (i < lines.length) {
  const line = lines[i];
  const header = line.match(/^\/\* === (.+?) =+ \*\/$/);
  if (header) {
    current = { name: header[1], blurb: "", rules: [] };
    groups.push(current);
    i++;
    continue;
  }
  const blurb = line.match(/^\/\* (.+) \*\/$/);
  if (blurb && current && !current.blurb) {
    current.blurb = blurb[1];
    i++;
    continue;
  }
  if (line.trim() === "/**") {
    const doc = [];
    i++;
    while (i < lines.length && lines[i].trim() !== "*/") {
      doc.push(lines[i].replace(/^\s*\*\s?/, ""));
      i++;
    }
    i++;
    const ruleNames = [];
    while (i < lines.length && lines[i].startsWith("@utility ")) {
      const m = lines[i].match(/^@utility ([a-z0-9-]+(?:-\*)?)/);
      if (m) ruleNames.push(m[1]);
      let depth = 0;
      do {
        depth += (lines[i].match(/{/g) ?? []).length;
        depth -= (lines[i].match(/}/g) ?? []).length;
        i++;
      } while (depth > 0 && i < lines.length);
    }
    if (current) current.rules.push({ doc, rules: ruleNames });
    continue;
  }
  i++;
}

/* ------------------------------------------------------------------------- *
 * Build per-group [{ base, linear, exp, log, target, childSelector }] rows
 * ------------------------------------------------------------------------- */

function parseFirstLine(line) {
  const m = line.match(/^`([^`]+)`\s*->\s*(.+?)\s*\(([^)]+)\)$/);
  if (!m) return null;
  const targets = [...m[2].matchAll(/`([^`]+)`/g)].map((t) => t[1]);
  return { classPattern: m[1], cssTargets: targets, curveLabel: m[3] };
}

function buildGroupRows(group) {
  const n = group.rules.length / 3;
  if (!Number.isInteger(n)) {
    throw new Error(`Group "${group.name}" has ${group.rules.length} doc blocks, not divisible by 3 curves`);
  }
  const rows = [];
  for (let idx = 0; idx < n; idx++) {
    const variants = [0, 1, 2].map((c) => group.rules[idx + c * n]);
    const parsed = variants.map((v) => parseFirstLine(v.doc[0]));
    if (parsed.some((p) => !p)) {
      throw new Error(`Unparseable doc line in group "${group.name}" idx ${idx}: ${JSON.stringify(variants.map((v) => v.doc[0]))}`);
    }
    const target = parsed[0].cssTargets.join(", ");
    if (!parsed.every((p) => p.cssTargets.join(", ") === target)) {
      throw new Error(`CSS target mismatch across curves in group "${group.name}" idx ${idx}`);
    }
    rows.push({
      linear: parsed[0].classPattern,
      exp: parsed[1].classPattern,
      log: parsed[2].classPattern,
      target,
      childSelector: variants[0].doc.some((l) => l.includes("Applies to every direct child")),
    });
  }
  return rows;
}

const utilityGroups = groups
  .filter((g) => g.name !== "Configuration")
  .map((g) => ({ name: g.name, blurb: g.blurb, rows: buildGroupRows(g) }));

const configGroup = groups.find((g) => g.name === "Configuration");

const totalBase = utilityGroups.reduce((n, g) => n + g.rows.length, 0);
const ruleCount = (css.match(/^@utility /gm) ?? []).length;
if (totalBase * 3 + 15 !== ruleCount) {
  throw new Error(`Rule count mismatch: parsed ${totalBase * 3 + 15}, index.css has ${ruleCount}`);
}

/* ------------------------------------------------------------------------- *
 * Render website/docs/05-reference/01-utility-index.mdx
 * ------------------------------------------------------------------------- */

function mdTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const utilitySections = utilityGroups
  .map((g) => {
    const multiProp = g.rows.some((r) => r.target.includes(","));
    const rows = g.rows.map((r) => [`\`${r.linear}\``, `\`${r.exp}\``, `\`${r.log}\``, `\`${r.target}\``]);
    const table = mdTable(["Linear", "Exponential", "Logarithmic", multiProp ? "CSS properties" : "CSS property"], rows);
    const note = g.rows.some((r) => r.childSelector)
      ? "\n\n:::note\nApplies only to direct children, via `:where(& > :not(:last-child))` — every child but the last. There is no `-reverse` variant.\n:::"
      : "";
    return `## ${g.name}\n\n${g.blurb}\n\n${table}${note}`;
  })
  .join("\n\n");

const utilityIndexMdx = `---
title: Utility index
description: The complete, generated list of every fluidity utility — all ${ruleCount} @utility rules, grouped by property and curve. Regenerated from index.css.
sidebar:
  label: Utility index
  order: 1
---

Every fluidity class, grouped the same way as [Utilities](/utilities). This page is **generated directly from \`index.css\`** by \`scripts/build-docs-reference.mjs\` — it can't drift from what actually ships, because it's built from the same file Tailwind compiles. Regenerate it with \`npm run docs:reference\` after \`npm run build\`.

${totalBase} base utilities × 3 curves (linear, \`exp-\`, \`log-\`) = **${totalBase * 3} utility classes**, plus [15 configuration utilities](/reference/css-variables) — ${ruleCount} \`@utility\` rules in total.

Every \`<min>[/<max>]\` follows the value syntax for its property's kind — see [Utilities](/utilities) for what each kind accepts, or [How it works](/concepts/how-it-works) for the value-form table (pair, arbitrary, mixed, min-only, bare).

${utilitySections}

## Next steps

<CardGroup cols={2}>
  <Card title="CSS variables" href="/reference/css-variables" icon="settings">
    The 15 configuration utilities and the 5 custom properties they set.
  </Card>
  <Card title="Limitations" href="/reference/limitations" icon="triangle-alert">
    Browser support and what fluidity deliberately doesn't do.
  </Card>
</CardGroup>
`;

/* ------------------------------------------------------------------------- *
 * Render website/docs/05-reference/02-css-variables.mdx
 * ------------------------------------------------------------------------- */

const [lowerDoc, upperDoc, baseDoc, ratioDoc, axisDoc] = configGroup.rules;

function firstLineProp(doc) {
  return parseFirstLine(doc[0].replace(/\//g, " / ").replace(" / ", " -> ", 0)) ?? null;
}

const axisUnitLines = axisDoc.doc.filter((l) => /^`f6y-axis-\S+` - /.test(l));
const axisUnitRows = axisUnitLines.map((l) => {
  const m = l.match(/^`([^`]+)` - (.+)$/);
  return [`\`${m[1]}\``, m[2]];
});

const cssVariablesMdx = `---
title: CSS variables
description: The 5 custom properties every fluid utility reads and the 15 utilities that set them, with their defaults. Regenerated from index.css.
sidebar:
  label: CSS variables
  order: 2
---

Every fluid utility reads 5 inheriting custom properties. Each has a matching setter utility, so scoping any of them to a subtree is one class on an ancestor — see [Configuration](/concepts/configuration) for how that powers container-scoped scaling.

| Custom property | Setter utility | Default | Controls |
| --- | --- | --- | --- |
| \`--f6y-axis\` | \`f6y-axis-*\` | \`100vw\` | The measured length every ramp's progress is computed from. |
| \`--f6y-lower\` | \`f6y-lower-*\` | \`var(--breakpoint-sm, 40rem)\` | Axis size where scaling starts. |
| \`--f6y-upper\` | \`f6y-upper-*\` | \`var(--breakpoint-2xl, 96rem)\` | Axis size where scaling stops. |
| \`--f6y-base\` | \`f6y-base-*\` | \`2\` | Base of the \`exp-\`/\`log-\` curves. Must be greater than 1. |
| \`--f6y-ratio\` | \`f6y-ratio-*\` | \`2\` | Multiplier deriving \`max\` from \`min\` when the modifier is omitted. |

## \`f6y-lower-*\` / \`f6y-upper-*\`

${lowerDoc.doc.join("\n")}

${upperDoc.doc.join("\n")}

Both accept a breakpoint key (\`sm\`, \`2xl\`, …), a \`--container-*\` key, or an arbitrary \`[length]\`.

## \`f6y-base-*\`

${baseDoc.doc.join("\n")}

## \`f6y-ratio-*\`

${ratioDoc.doc.join("\n")}

## \`f6y-axis-*\`

${axisDoc.doc.filter((l) => !/^`f6y-axis-\S+` - /.test(l)).join("\n")}

${mdTable(["Utility", "Resolves to"], axisUnitRows)}

Anything else — a fixed length, or a unit not in that list — goes through the arbitrary form: \`f6y-axis-[<length>]\`.

## Next steps

<CardGroup cols={2}>
  <Card title="Configuration" href="/concepts/configuration" icon="settings">
    How these custom properties compose — container scoping, curve tuning.
  </Card>
  <Card title="Utility index" href="/reference/utility-index" icon="list">
    Every property-scaling utility these custom properties drive.
  </Card>
</CardGroup>
`;

writeFileSync(resolve(ROOT, "website/docs/05-reference/01-utility-index.mdx"), utilityIndexMdx);
writeFileSync(resolve(ROOT, "website/docs/05-reference/02-css-variables.mdx"), cssVariablesMdx);

console.log(
  `website/docs/05-reference/01-utility-index.mdx: ${totalBase} base utilities, ${totalBase * 3} classes\n` +
  `website/docs/05-reference/02-css-variables.mdx: 5 custom properties, 15 setter utilities`,
);
