---
name: ContribStack Widget
description: Embeddable multi-source contribution heatmap web component
colors:
  source-green: "#2da44e"
  source-orange: "#fc6d26"
  ink-light: "#1f2328"
  ink-dark: "#e6edf3"
  muted-light: "#656d76"
  muted-dark: "#8b949e"
  canvas-light: "#ffffff"
  canvas-dark: "#0d1117"
  panel-light: "#f6f8fa"
  panel-dark: "#161b22"
  hairline-light: "#d0d7de"
  hairline-dark: "#30363d"
  empty-light: "#ebedf0"
  empty-dark: "#21262d"
  tooltip-dark: "#21262d"
typography:
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  micro:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  xs: "2px"
  sm: "6px"
  pill: "16px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  stat-tile:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  legend-chip:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  tooltip:
    backgroundColor: "{colors.ink-light}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---

# Design System: ContribStack Widget

## 1. Overview

**Creative North Star: "The Signal Stack"**

Every source a developer connects is a distinct colored signal, and the widget stacks them onto one 53-by-7 grid without ever flattening them into a single number. Read it like an instrument panel: the density and reach of the color tell you at a glance how much a person ships and across how many places, and any day where two sources fired shows both, side by side, as split stripes. The lineage is the observability dashboard — high-contrast, engineered, comfortable in dark mode — not the marketing chart.

The widget renders on sites its author will never see: someone's portfolio, blog, or docs page. So the shell is deliberately quiet and the color does the talking. Containers are flat with hairline borders, the type is the host's own system font, and nothing floats except the tooltip. The energy is bold but it comes from the data — saturated layer colors, dense cells, sharp edges — never from gradients, glows, or motion. It has to look intentional on a stranger's homepage and it has to fit in a 15 KB gzip budget with zero dependencies.

This system explicitly rejects three things: the corporate-analytics look (KPI cards, filter bars, enterprise chrome), the bare GitHub clone (a one-to-one copy of the green-squares calendar, which misses that the overlay is the whole point), and anything loud or overdesigned that would fight the page hosting it.

**Key Characteristics:**
- Multi-source overlay: N active sources on a day split the cell into N equal color stripes, never merged.
- Intensity rides opacity, not hue: a source keeps one color; its volume is expressed 0.2 → 0.8.
- Shadow-DOM isolated, host system font, flat shell, under 15 KB.
- Dark-mode-native, crisp and high-contrast; bold through data, not decoration.

## 2. Colors

A near-monochrome GitHub Primer shell carrying saturated, per-source layer colors — the only real color in the system, and the thing the eye is meant to land on.

### Primary
- **Source Green** (#2da44e): The default GitHub layer color. A layer is a connection, so this is one signal among many; it is a starting default the profile owner can change, not a fixed brand color.
- **Source Orange** (#fc6d26): The default GitLab layer color. Sits against Source Green as a second distinguishable signal. Generic-ingest and additional connections draw further distinct hues supplied per connection by the API.

### Neutral
- **Ink** (#1f2328 light / #e6edf3 dark): Primary text — stat values, chip labels.
- **Muted Ink** (#656d76 light / #8b949e dark): Secondary text — tile captions, month and weekday axis labels.
- **Canvas** (#ffffff light / #0d1117 dark): The widget's base surface. Dark canvas is the native home.
- **Panel** (#f6f8fa light / #161b22 dark): The raised surface for stat tiles and legend chips, one tonal step off the canvas.
- **Hairline** (#d0d7de light / #30363d dark): 1px borders that define every container. This system draws boundaries, it does not shade them.
- **Empty Cell** (#ebedf0 light / #21262d dark): The color of a day with no activity. It is the grid's resting state and the visual floor the layer colors rise from.
- **Tooltip** (#1f2328 light / #21262d dark, white text): The one floating surface.

### Named Rules
**The Overlay Rule.** Sources never merge. A day with N visible active sources divides into N equal-width vertical stripes, each in its source color. Reducing a multi-source day to one blended color or one total is forbidden — the separation is the product.

**The Opacity Ramp Rule.** Intensity is expressed through opacity, never through hue shifts. Each source keeps exactly one color; the day's volume maps to five levels (0, 0.2, 0.4, 0.6, 0.8) bucketed by quartile against that source's own non-zero history. Hue is identity; opacity is volume. Never recolor a source to show "more".

## 3. Typography

**Display / Body / Label Font:** `system-ui, -apple-system, sans-serif` (the host page's native UI font)

**Character:** One system font stack does everything — headings, values, labels, axis. There is no display face and no web font, by constraint: the widget must load instantly on someone else's page and stay inside the 15 KB gzip budget. Character comes from weight and size, not from family.

### Hierarchy
- **Title** (600, 18px, 1.2): Stat-tile values — the streak counts, active-day totals, per-source totals. The largest, boldest type in the widget.
- **Body** (400, 14px, 1.4): The base size set on `:host`; loading and error messages.
- **Label** (400, 11px): Stat-tile captions ("Current streak"), set in Muted Ink. Legend chips run slightly larger at 12px.
- **Micro** (400, 10px): SVG axis labels — month names across the top, Mon/Wed/Fri down the side — in Muted Ink.

### Named Rules
**The System-Font Rule.** The widget ships no fonts and loads none. It borrows whatever `system-ui` resolves to on the host. Adding a web font is forbidden: it breaks the load-instantly promise and the gzip budget.

## 4. Elevation

Flat by default. Depth is carried by tonal layering (Panel sits one step off Canvas) and 1px Hairline borders, not by shadow. The single exception is the tooltip, the only element that genuinely floats above the grid.

### Shadow Vocabulary
- **Floating tip** (`box-shadow: 0 2px 8px rgba(0,0,0,0.25)`): Applied only to the position-fixed tooltip, to lift it off the content it hovers over.

### Named Rules
**The Flat-Shell, Floating-Tip Rule.** Every resting surface — tiles, chips, cells — is flat with a hairline border. The tooltip is the only thing in the system that casts a shadow, because it is the only thing that floats. If a container has a shadow, it is wrong.

## 5. Components

Crisp and engineered: tight boundaries, high contrast, sharp small radii. Every part is a defined container, and the parts recede so the heatmap leads.

### Stat Tiles
- **Shape:** Gently rounded (6px), 1px Hairline border.
- **Surface:** Panel background, Ink value, Muted Ink caption.
- **Value / caption:** 18px/600 value over an 11px Muted Ink label.
- **Layout:** Auto-fit grid, `minmax(120px, 1fr)`, reflowing with the container. Order is fixed: current streak, longest streak, active days, then one tile per visible source. Tiles recompute when layers toggle.

### Legend Chips
- **Shape:** Full pill (16px radius), 1px Hairline border, Panel background — a button, not decoration.
- **Contents:** Color swatch (10px, 2px radius) + source label + range total.
- **States:** Default is on. Toggled off drops to `opacity: 0.45`; the swatch keeps its hue so identity survives the dimming. Cursor pointer; clicking isolates or restores a layer and refilters the tiles. At least one layer always stays on.

### Heatmap Cells
- **Shape:** 12px square, 2px radius, 3px gap (15px step), on a 53-column by 7-row grid.
- **Single source:** Filled in the source color at the day's intensity opacity.
- **Multiple sources:** Split into equal vertical stripes, one per source, each at its own intensity — the Overlay Rule made visible.
- **Empty:** Empty Cell color at full opacity.
- **Behavior:** When click-through is on, cells carry a pointer cursor and open the profile in a new tab; the grid auto-scrolls to the most recent weeks on load.

### Tooltip
- **Style:** Position-fixed, Ink (dark: Tooltip) background, white text, 6px radius, 6px×10px padding, the one shadow in the system.
- **Content:** The formatted date plus each active source's exact count for that day. Anchored above the pointer, `pointer-events: none`.

### Loading / Error
- **Style:** Centered Muted Ink text, 24px padding, inside the themed shell. Minimal by intent today — a known place to add a real skeleton and a teaching empty state.

## 6. Do's and Don'ts

### Do:
- **Do** keep the multi-source overlay intact: split a shared day into equal per-source stripes; never blend or total them away (the Overlay Rule).
- **Do** express intensity through opacity (0.2 → 0.8) on a fixed source hue (the Opacity Ramp Rule).
- **Do** carry source identity redundantly — color plus legend label plus tooltip — so two close hues still read as two sources for color-blind viewers.
- **Do** use flat surfaces with 1px Hairline borders; reserve the only shadow for the tooltip (the Flat-Shell, Floating-Tip Rule).
- **Do** stay on the host's `system-ui` stack and inside the 15 KB gzip budget; ship no web fonts and no framework.
- **Do** keep the shell quiet so the widget looks native on any host page, and let the layer color be the boldest thing on screen.

### Don't:
- **Don't** make it look like a corporate analytics dashboard — no KPI cards, filter bars, or enterprise chrome. This is not a reporting tool.
- **Don't** let it read as a bare GitHub clone — a one-to-one copy of the green-squares calendar throws away the multi-source overlay that is the whole point.
- **Don't** go loud or overdesigned — no gradients, glows, glassmorphism, or decorative motion. It embeds on pages the owner controls and must not fight them.
- **Don't** use gradient text or a `background-clip: text` fill anywhere.
- **Don't** use a colored side-stripe border (`border-left`/`border-right` > 1px) on tiles, chips, or callouts; borders are full Hairline or nothing.
- **Don't** add a web font, a framework dependency, or anything that risks the load-instantly promise or the size budget.
