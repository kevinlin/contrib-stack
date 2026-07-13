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
