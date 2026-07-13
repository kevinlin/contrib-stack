# Plan: Design overhaul

## Widget polish pass: state completeness, contrast, and overlay fidelity

Date: 2026-07-13. Scope: `packages/widget` (`<contrib-stack>`). No changes to `apps/web` or `packages/connectors`.

### Context

A polish pass over the rendered widget, driven by browser evidence (Chrome, light/dark/mobile) rather than static review. The widget was functionally complete; this pass closed correctness bugs and craft gaps against [packages/widget/DESIGN.md](../../packages/widget/DESIGN.md) and the product register (design serves a visitor's glance; the shell stays quiet, the layer color leads).

Two defects were real bugs, not cosmetics. The rest are state-completeness and legibility gaps that only showed up when the widget was driven on a host page it doesn't control.

Bundle stayed within budget: 6.76 KB gzip against the 15 KB cap. All existing tests plus the e2e suite stayed green.

### What changed

#### Bugs

1. **Legend totals jumped when a layer toggled.** `computeStats` summed only *visible* connections, so hiding one connection recomputed the others' range totals against a different set — a chip you never touched would show a different number. Root cause: conceptual, not a style patch. Fix: `computeStats` now returns range-scoped totals for **every** connection ([layout.ts](../../packages/widget/src/layout.ts)); the stat *tiles* filter by visibility at render time ([render.ts](../../packages/widget/src/render.ts) `renderStats`). Chip totals are now stable; only the tile set changes on toggle.

2. **Chip text near-invisible in dark mode.** Chips set no `color`, so they inherited the host page's ink — e.g. black text on a dark chip on a dark host site. Shadow DOM isolates styles but does **not** stop `color` inheritance across the boundary. Fix ([theme.ts](../../packages/widget/src/theme.ts)): `.cs-chip` sets `color: var(--cs-text)` and `font-family: inherit`; `:host` sets `color-scheme:<resolved>` so form/scroll UI themes correctly regardless of host.

#### State completeness

3. **Tooltip clipped at viewport edges.** Anchored above the cell, it fell off-screen near the top of a host page and past the left/right edges. Fix ([tooltip.ts](../../packages/widget/src/tooltip.ts) `show`): clamp center-x into `[half+4, innerWidth-half-4]`; flip below the cell (`.below` class) when there's no room above. CSS variants added in [theme.ts](../../packages/widget/src/theme.ts).

4. **Teaching empty state.** `connections.length === 0` rendered a bare "No contribution activity yet" line. Fix: `renderEmptyState` ([render.ts](../../packages/widget/src/render.ts)) reuses the skeleton's ghost grid (extracted to shared `ghostGridSvg`) with a static message beneath — the empty state now teaches the heatmap's shape. Wired via `renderEmpty()` in [contrib-stack.ts](../../packages/widget/src/contrib-stack.ts).

#### Legibility & a11y

5. **Off-chip contrast.** Toggled-off chips dropped the whole chip to `opacity: 0.45`, pushing the label under 4.5:1. Fix: label goes to Muted Ink (readable), only the swatch dims to 35%; hue survives, so source identity does too (the "keep every source legible as itself" principle).

6. **Multi-source cell corners.** Split-stripe cells had square corners while single-source cells were rounded. Fix ([render.ts](../../packages/widget/src/render.ts)): stripes wrapped in a group clipped by a shared `clipPath#cs-r` (objectBoundingBox, 2px-equivalent radius). Overlay days now match single-source cells.

7. **ARIA + keyboard.** Legend chips carry `aria-pressed`; the error state gets `role="alert"`; the scroll region becomes `tabindex=0` + `role="region"` with a label **only when it actually overflows** ([contrib-stack.ts](../../packages/widget/src/contrib-stack.ts) `autoScroll`). Chips gained an invisible extended hit area (`::after`, ~8px vertical) for touch.

8. **Numerals.** `font-variant-numeric: tabular-nums` on host + chips + tile values; totals formatted with thousands separators (`fmt` in [render.ts](../../packages/widget/src/render.ts)). Counts align and don't jitter as layers toggle.

Reduced-motion path extended to cover the swatch transition.

#### Verified, no change needed

- **Skeleton vs. content dimensions.** Measured in-browser: tiles 52.5px, chips 24px in both skeleton and loaded states. No layout shift on data arrival.

### Files

| File | Change |
|---|---|
| `packages/widget/src/layout.ts` | `connectionTotals` covers all connections (range-scoped), not just visible |
| `packages/widget/src/render.ts` | tile visibility filter; `fmt` thousands separators; `aria-pressed`; `clipPath` + clipped stripe group; month-label overflow guard; `ghostGridSvg` extracted; `renderEmptyState` |
| `packages/widget/src/tooltip.ts` | viewport horizontal clamp + flip-below placement |
| `packages/widget/src/contrib-stack.ts` | `renderEmpty()`; `role="alert"` on error; conditional scroll-region a11y attrs |
| `packages/widget/src/theme.ts` | chip `color`/`font-family: inherit`; `color-scheme`; tabular-nums; off-chip label+swatch states; chip hit area; scroll focus ring; tooltip `.below`; `.cs-empty-msg` |
| `packages/widget/src/render.test.ts` | tests for `aria-pressed`, thousands separators, `renderEmptyState`; updated toggled-off total-count assertion |
| `packages/widget/src/layout.test.ts` | updated `connectionTotals` assertion (totals for all connections) |
| `packages/widget/DESIGN.md` | synced: legend states, clipped stripes, tooltip placement, loading/empty/error triad, tabular numerals |
| `packages/widget/dist/widget.js` | rebuilt bundle |

### Verification

```bash
pnpm --filter @contrib-stack/widget test    # 21 unit tests
pnpm exec tsc --noEmit -p packages/widget/tsconfig.json
pnpm --filter @contrib-stack/widget build    # 6.76 KB gzip, under 15 KB
pnpm --filter web e2e                         # 6 specs (widget DOM selectors unchanged)
```

Browser proof: driven in Chrome across light, dark, and 375px mobile. Confirmed by hand — multi-source tooltip content, off-chip state, empty state, error state, tooltip edge-flip — by driving the real shadow DOM, not just asserting markup.

### Gotchas

- **Shadow DOM does not isolate `color`.** Inherited text properties cross the boundary; the widget must set its own `color`/`font-family` or it picks up the host's. This was the dark-mode chip bug.
- **`dist/widget.js` is committed and served.** `next.config.ts` copies it into `apps/web/public/`. After any `src` change, rebuild and commit `dist` **together** — a stale `dist` ships old behavior.
- **e2e depends on widget class names.** `apps/web/e2e/*.spec.ts` select `.cs-chip`, `.cs-tile`, `.cs-tile-lbl`, `.cs-tile-val`, `.off`. None were renamed; keep them stable or update the specs in lockstep.
- **Scroll-region a11y attrs are conditional.** Applied only when `scrollWidth > clientWidth`, so a non-overflowing grid isn't announced as scrollable.

## Mobile-friendly responsive web app + embedded widget

Date: 2026-07-13. Scope: `apps/web` (all public pages + settings) and `packages/widget` (`<contrib-stack>` scroll behavior). No changes to `packages/connectors`.

### Context

Made both surfaces the user named — the deployed site and the embedded view — usable on phones. Driven by browser evidence (Chrome device emulation, 320px and 390px, light and dark) against a seeded file DB, not static review. The web app already carried per-page breakpoints; this pass fixed one real overflow bug, closed touch-target and input-zoom gaps, and hardened the widget's scroll against a touch host.

One defect was a real bug (the profile page clipped the heatmap on mobile). The rest are touch-input and safe-area completeness gaps that only show up on a real device.

Widget bundle stayed within budget: 6.79 KB gzip against the 15 KB cap. Lint clean; all 128 unit/integration tests green.

### What changed

#### Bugs

1. **Profile page clipped the heatmap on mobile.** The third stat tile and recent weeks were cut off at the right edge — clipped, not scrollable. Root cause was structural, not a breakpoint miss: `body` is a column flexbox ([globals.css](../../apps/web/src/app/globals.css)), so `.main` is a flex item that, under `align-items: stretch`, sized itself to the 820px grid's *max-content* width instead of the viewport; `body`'s `overflow-x: hidden` then clipped the excess rather than letting the widget's own scroll container take over. Fix ([[handle]/page.module.css](../../apps/web/src/app/[handle]/page.module.css)): `width: 100%` + `min-width: 0` on `.main`. A definite width forces the constraint to cascade so `.cs-scroll` scrolls. This is why the widget looked correct in an isolated harness but broke in-page — the harness body was normal block flow.

#### Touch & input

2. **iOS focus-zoom on form controls.** Any focused input under 16px makes mobile Safari zoom the page. Fix: a `@media (pointer: coarse)` rule lifting `input, select, textarea` to 16px ([globals.css](../../apps/web/src/app/globals.css)), keeping the desktop scale. The settings form needed a **class-scoped** duplicate ([settings/page.module.css](../../apps/web/src/app/settings/page.module.css)) because `.field input` (0.95rem) out-specifies the global element rule — a media query adds no specificity (see Gotchas).

3. **Undersized tap targets.** Under `pointer: coarse`: profile year tabs → 40px min-height ([[handle]/page.module.css](../../apps/web/src/app/[handle]/page.module.css)); settings buttons → 44px, color swatches → 40px ([settings/page.module.css](../../apps/web/src/app/settings/page.module.css)); welcome submit button enlarged ([welcome/page.tsx](../../apps/web/src/app/welcome/page.tsx)).

4. **Cramped settings chrome.** The account bar overflowed on narrow screens — now `flex-wrap` (sign-out drops to its own right-aligned line). The API-key modal actions stack full-width on mobile (`Done` at the bottom for thumb reach).

#### Safe areas & viewport

5. **Notch handling.** Added a `viewport` export with `viewport-fit=cover` ([layout.tsx](../../apps/web/src/app/layout.tsx)); pinch-zoom left enabled (a11y). Content pages fold `env(safe-area-inset-*)` into their horizontal padding via `max()` so nothing slides under the notch in landscape ([page.module.css](../../apps/web/src/app/page.module.css), [[handle]/page.module.css](../../apps/web/src/app/[handle]/page.module.css), [settings/page.module.css](../../apps/web/src/app/settings/page.module.css)). Home uses `100dvh` to avoid the mobile-toolbar height jump.

#### Embedded widget

6. **Scroll containment on touch.** `overscroll-behavior-x: contain` + `touch-action: pan-x` on `.cs-scroll` ([theme.ts](../../packages/widget/src/theme.ts)) so dragging the heatmap horizontally doesn't chain to the host page's back-swipe navigation or steal its vertical scroll. No grid-geometry change: the 53-column horizontal-scroll model is intentional (extends the calendar mental model) and matches DESIGN.md.

#### Verified, no change needed

- **Widget in-page layout.** Stat tiles reflow to 2-up, legend chips wrap, grid auto-scrolls to recent weeks and stays contained (page never scrolls horizontally). Measured at 320px and 390px.

### Files

| File | Change |
|---|---|
| `apps/web/src/app/layout.tsx` | `viewport` export: `viewport-fit=cover`, device-width, zoom enabled |
| `apps/web/src/app/globals.css` | `@media (pointer: coarse)` → 16px form controls (iOS zoom fix) |
| `apps/web/src/app/page.module.css` | safe-area padding via `max()`; `100dvh` |
| `apps/web/src/app/[handle]/page.module.css` | `width:100%`+`min-width:0` flex fix; safe-area padding; 40px touch tabs |
| `apps/web/src/app/settings/page.module.css` | account-bar `flex-wrap`; 44px buttons / 40px swatches; class-scoped 16px inputs; full-width stacked modal actions; safe-area padding |
| `apps/web/src/app/welcome/page.tsx` | larger submit tap target |
| `packages/widget/src/theme.ts` | `.cs-scroll`: `overscroll-behavior-x: contain` + `touch-action: pan-x` |
| `apps/web/public/widget.js` | rebuilt bundle |

### Verification

```bash
pnpm lint                                    # 0 errors
pnpm test                                    # 128 tests, 25 files, all green
pnpm --filter @contrib-stack/widget build    # 6.79 KB gzip, under 15 KB
```

Browser proof: booted the dev server against a seeded file DB (two ingest connections + ~1y of daily counts) with a forged database session, then drove Chrome device emulation at 320px and 390px, light and dark, across home, profile, settings, the API-key modal, and the embedded widget. Confirmed by hand — no horizontal page overflow, contained widget scroll, 16px inputs, wrapped account bar, stacked modal — with DOM measurements, not just screenshots.

### Gotchas

- **Flexbox min-content blowout.** `body` is a column flexbox, so `align-items: stretch` does **not** guarantee a flex-item `<main>` fits the viewport — with a wide intrinsic child (the widget grid) the item takes its content's max-content width and `body { overflow-x: hidden }` silently clips it. Any page hosting wide content needs `width: 100%` + `min-width: 0` on that container. This was the profile-page clipping bug.
- **`@media` adds no specificity.** A global `input { font-size: 16px }` inside a media query still loses to a module's `.field input { font-size: 0.95rem }` (class beats element). Where a CSS module sets a control's font-size, the touch override must live in that module at matching specificity, not only in globals.
- **`viewport-fit=cover` is opt-in edge-to-edge.** Once set, content extends under the notch/home-indicator; you **must** add `env(safe-area-inset-*)` padding or edge content is obscured. It's not free.
- **Chrome window resize clamps ~500px.** `resize_page` can't reach true phone widths; use the `emulate` viewport tool (`320x568x2,mobile,touch`) for sub-500px layout testing. `pointer: coarse` / `hover: none` are emulated correctly under `mobile,touch`.
- **`dist/widget.js` rebuild + commit together.** Same as the polish pass: the widget scroll change means the committed `dist` (copied to `apps/web/public/`) must be rebuilt in lockstep or a stale bundle ships old behavior.
