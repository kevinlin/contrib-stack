import {
  CELL_SIZE,
  CELL_STEP,
  GRID_COLS,
  GRID_ROWS,
  INTENSITY_OPACITY,
  cellPosition,
  dayLayers,
  gridPixelSize,
  splitCellStripes,
} from "./layout";
import type { RenderState } from "./types";

const DAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];

const LABEL_LEFT = 28;
const LABEL_TOP = 16;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function formatTooltipDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function tooltipText(
  date: string,
  layers: ReturnType<typeof dayLayers>,
): string {
  if (layers.length === 0) return formatTooltipDate(date);
  const parts = layers.map((l) => `${l.label}: ${l.count}`).join(", ");
  return `${formatTooltipDate(date)} — ${parts}`;
}

function renderStats(state: RenderState): string {
  const tiles = [
    { val: state.stats.currentStreak, lbl: "Current streak" },
    { val: state.stats.longestStreak, lbl: "Longest streak" },
    { val: state.stats.activeDays, lbl: "Active days" },
    ...state.stats.connectionTotals.map((c) => ({
      val: c.total,
      lbl: c.label,
    })),
  ];
  return `<div class="cs-stats">${tiles
    .map(
      (t) =>
        `<div class="cs-tile"><div class="cs-tile-val">${t.val}</div><div class="cs-tile-lbl">${esc(t.lbl)}</div></div>`,
    )
    .join("")}</div>`;
}

function renderLegend(state: RenderState): string {
  return `<div class="cs-legend">${state.profile.connections
    .map((c) => {
      const on = state.visibleSlugs.has(c.slug);
      const rangeTotal = state.stats.connectionTotals.find(
        (t) => t.slug === c.slug,
      )?.total;
      const total = rangeTotal ?? c.total;
      return `<button type="button" class="cs-chip${on ? "" : " off"}" data-slug="${esc(c.slug)}"><span class="cs-swatch" style="background:${esc(c.color)}"></span><span>${esc(c.label)}</span><span>${total}</span></button>`;
    })
    .join("")}</div>`;
}

function renderGridSvg(state: RenderState): string {
  const originX = LABEL_LEFT;
  const originY = LABEL_TOP;
  const { width, height } = gridPixelSize(originX, originY);
  const { layout, profile, visibleSlugs, nonZeroBySlug } = state;
  const linkClass = state.linkEnabled ? " cs-link" : "";
  const linkAttr = state.linkEnabled
    ? ` data-href="${esc(state.profileUrl)}"`
    : "";

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution heatmap">`;

  for (const { col, label } of layout.monthLabels) {
    const x = originX + col * CELL_STEP;
    svg += `<text x="${x}" y="10" fill="var(--cs-muted)" font-size="10">${label}</text>`;
  }

  for (const { row, label } of DAY_LABELS) {
    const y = originY + row * CELL_STEP + CELL_SIZE - 1;
    svg += `<text x="0" y="${y}" fill="var(--cs-muted)" font-size="10">${label}</text>`;
  }

  for (const [date, cell] of layout.cells) {
    const { x, y } = cellPosition(cell.col, cell.row, originX, originY);
    const layers = dayLayers(
      profile.connections,
      visibleSlugs,
      date,
      nonZeroBySlug,
    );
    const tip = esc(tooltipText(date, layers));
    const dataDate = esc(date);

    if (layers.length === 0) {
      svg += `<rect class="cs-cell${linkClass}" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="var(--cs-empty)" data-date="${dataDate}" data-tip="${tip}"${linkAttr}/>`;
      continue;
    }

    if (layers.length === 1) {
      const layer = layers[0];
      const opacity = INTENSITY_OPACITY[layer.level];
      svg += `<rect class="cs-cell${linkClass}" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${esc(layer.color)}" fill-opacity="${opacity}" data-date="${dataDate}" data-tip="${tip}"${linkAttr}/>`;
      continue;
    }

    const stripes = splitCellStripes(layers.length, x, y);
    svg += `<g class="cs-cell${linkClass}" data-date="${dataDate}" data-tip="${tip}"${linkAttr}>`;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const stripe = stripes[i];
      const opacity = INTENSITY_OPACITY[layer.level];
      svg += `<rect x="${stripe.x}" y="${stripe.y}" width="${stripe.width}" height="${stripe.height}" fill="${esc(layer.color)}" fill-opacity="${opacity}"/>`;
    }
    svg += `</g>`;
  }

  svg += "</svg>";
  return svg;
}

export function renderWidget(state: RenderState): string {
  return `${renderStats(state)}${renderLegend(state)}<div class="cs-scroll" data-scroll>${renderGridSvg(state)}</div>`;
}

export function maxGridColumn(layout: RenderState["layout"]): number {
  let max = 0;
  for (const cell of layout.cells.values()) {
    max = Math.max(max, cell.col);
  }
  return max;
}

export function scrollTargetX(maxCol: number): number {
  const originX = LABEL_LEFT;
  const visibleWeeks = 20;
  const targetCol = Math.max(0, maxCol - visibleWeeks + 1);
  return originX + targetCol * CELL_STEP;
}

export { GRID_COLS, GRID_ROWS, CELL_SIZE, CELL_STEP };
