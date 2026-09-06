# Fluidity

Fluid UI scaling utilities for [Tailwind CSS v4](https://tailwindcss.com). CSS only —
no JavaScript, no build step, no config file. `@import` it after Tailwind and every
`f6y-*` utility scales continuously between a min and a max as the viewport (or a
container) grows, clamped at both ends.

```html
<div class="f6y-p-2/8">padding ramps 0.5rem → 2rem</div>
<div class="f6y-exp-p-2/8">…the same ramp, exponential ease-in</div>
<div class="f6y-log-p-2/8">…the same ramp, logarithmic ease-out</div>
<div class="f6y-text-sm/4xl">font-size ramps var(--text-sm) → var(--text-4xl)</div>
```

## Documentation

Full docs — concepts, every utility family with live demos, recipes, and a
generated reference of all 279 utilities — live under [`docs/`](docs), built
with [Blume](https://github.com/haydenbleasel/blume):

```sh
npm run docs:dev     # dev server with hot reload
npm run docs:build   # static site to dist/
```

## Install

```sh
npm install fluidity-css
```

Requires `tailwindcss@^4`. Import fluidity after Tailwind in your CSS entry point:

```css
@import "tailwindcss";
@import "fluidity";
```

## How it works

Every fluid utility interpolates between a `min` and `max` value as a measured
`axis` length moves between a `lower` and `upper` bound:

```
progress = clamp(0, (axis - lower) / (upper - lower), 1)
value    = min + (max - min) * ease(progress)
```

`axis` defaults to `100vw`; `lower`/`upper` default to Tailwind's `sm` (40rem) and
`2xl` (96rem) breakpoints. Division of two lengths isn't valid in `calc()`, so
progress is computed as `clamp(0, tan(atan2(axis - lower, upper - lower)), 1)`
instead — a standard trick for length ÷ length in plain CSS.

Three easing curves are provided for every utility:

| Prefix | Curve | Shape |
| --- | --- | --- |
| *(none)* | linear | even ramp |
| `exp-` | exponential ease-in | slow start, fast finish |
| `log-` | logarithmic ease-out | fast start, slow finish (exact inverse of `exp-`) |

All three curves share identical endpoints — swapping `f6y-p-2/8` for
`f6y-exp-p-2/8` changes nothing at the bounds, only the path between them.

## Values

`<min>[/<max>]` follows Tailwind's own value syntax:

```html
<div class="f6y-p-2/8"></div>          <!-- spacing scale: 0.5rem -> 2rem -->
<div class="f6y-p-[1rem]/[3rem]"></div> <!-- arbitrary values -->
<div class="f6y-p-2/[3rem]"></div>      <!-- mixed -->
<div class="f6y-text-sm/xl"></div>      <!-- theme keys (--text-*, --container-*, …) -->
<div class="f6y-p-2"></div>             <!-- max omitted -> min * ratio (default 2x) -->
<div class="f6y-p"></div>               <!-- min omitted -> per-property default -->
```

Numeric bare values resolve through the spacing scale (`--spacing()`), exactly
like Tailwind's built-in `p-*`/`w-*`/etc. — except border and outline widths,
where bare numbers are px counts (like `border-2` -> `2px`). Arbitrary
values and theme keys (`--text-*`, `--container-*`, `--leading-*`,
`--tracking-*`, `--radius-*`, `--breakpoint-*`) are accepted wherever Tailwind's
own utilities accept them.

## Configuration

Every configurable value is a custom property with a matching setter utility.
Custom properties inherit, so set one on an ancestor to affect every fluid
utility beneath it.

| Utility | Property | Effect | Default |
| --- | --- | --- | --- |
| `f6y-lower-<bp\|container\|[length]>` | `--f6y-lower` | axis size where scaling starts | `var(--breakpoint-sm)` (40rem) |
| `f6y-upper-<bp\|container\|[length]>` | `--f6y-upper` | axis size where scaling stops | `var(--breakpoint-2xl)` (96rem) |
| `f6y-base-<number>` | `--f6y-base` | `exp-`/`log-` curve base (> 1) | `2` |
| `f6y-ratio-<number>` | `--f6y-ratio` | derives max as `min * ratio` when max is omitted | `2` |
| `f6y-axis-<unit>` / `f6y-axis-[<length>]` | `--f6y-axis` | the measured length | `100vw` |

`f6y-axis-*` ships one utility per viewport and container-query unit
(`vw`, `vh`, `vmin`, `vmax`, `cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax`), plus
`f6y-axis-[<length>]` for anything else. Container units need an ancestor with
`container-type` set (Tailwind's `@container`):

```html
<div class="@container">
  <div class="f6y-p-2/8 f6y-axis-cqi f6y-lower-[20rem] f6y-upper-[60rem]">
    scales with this container's inline size, not the viewport
  </div>
</div>
```

## Utility coverage

| Group | Utilities |
| --- | --- |
| Padding | `p`, `px`, `py`, `ps`, `pe`, `pt`, `pr`, `pb`, `pl` |
| Margin | `m`, `mx`, `my`, `ms`, `me`, `mt`, `mr`, `mb`, `ml` |
| Gap | `gap`, `gap-x`, `gap-y` |
| Space between | `space-x`, `space-y` (every child but the last; no reverse variant) |
| Position | `inset`, `inset-x`, `inset-y`, `start`, `end`, `top`, `right`, `bottom`, `left` |
| Scroll margin | `scroll-m{,x,y,s,e,t,r,b,l}` |
| Scroll padding | `scroll-p{,x,y,s,e,t,r,b,l}` |
| Sizing | `w`, `h`, `size`, `min-w`, `min-h`, `max-w`, `max-h`, `basis` |
| Typography | `text` (font-size), `leading`, `tracking`, `indent` |
| Border radius | `rounded` and all logical/physical corners |
| Border & outline width | `border{,x,y,s,e,t,r,b,l}`, `outline`, `outline-offset` |

Every entry above ships in linear, `exp-` and `log-` variants (279 `@utility`
rules total) and works with any built-in Tailwind variant — `md:f6y-p-8/32`,
`hover:f6y-gap-2/8`, `dark:f6y-p-4`, etc. — since fluidity utilities are
ordinary Tailwind `@utility` rules.

## Browser support

Targets Baseline Widely Available CSS as of August 2026: `calc()`, `clamp()`,
`var()`, the CSS trigonometric functions (`atan2()`, `tan()`) and exponential
functions (`pow()`, `log()`), and container query length units (`cqi`, `cqb`,
etc.). No fallback is provided for older browsers — every declaration a
fluidity utility emits embeds `tan(atan2(...))` (plus `pow()`/`log()` for
`exp-`/`log-` variants), so an unsupported browser drops the declaration
entirely and the property falls back to its initial or inherited value
(e.g. `f6y-p-2/8` produces no padding at all, not a static fallback ramp).

## Out of scope

- **Value validation.** Fluidity does not check that `min < max`, that units are
  compatible, or that a curve `base` is greater than 1 — same trust model as
  Tailwind's own arbitrary values.
- **Third-party plugin integration** (e.g. Tailwind Merge) is not provided.
- **Negative values.** Tailwind's `-m-4` idiom has no fluidity counterpart —
  `-f6y-*` candidates don't match. Use arbitrary values for negative ramps
  (e.g. `f6y-m-[-2rem]/[-4rem]`).

## Development

```sh
npm install
npm run build        # regenerate index.css + examples/ from scripts/build-css.mjs
npm run build:check  # fail if generated files are stale
npm run docs:reference # regenerate docs/05-reference/*.mdx from index.css
```

`index.css` and `examples/{coverage.html,manifest.json,src/coverage.css}` are
generated from the utility table in `scripts/build-css.mjs` — never hand-edit
them.
`examples/kitchen-sink.html` is a hand-authored demo: every box renders a real
`f6y-*` class and shows its live computed value; resize the window or drag the
dashed container to see it recompute in real time. `examples/coverage.html` +
`examples/manifest.json` are the machine-generated fixture/assertion pair used
to validate every one of the 1,236 generated utility instances in a real
browser (clamping, shared curve endpoints, monotonicity, curve ordering, and
ratio-derived maxima).

## Prior art

- [fluid.tw](https://fluid.tw/)
- [fluid-tailwindcss](https://fluid-tailwindcss.vietnx.io.vn/)

## License

MIT © [Dave Nuñez](https://davidanunez.com/)
