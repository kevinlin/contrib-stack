import type { Theme } from "./types";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function themeCss(resolved: ResolvedTheme): string {
  const vars =
    resolved === "dark"
      ? `--cs-bg:#0d1117;--cs-text:#e6edf3;--cs-muted:#8b949e;--cs-border:#30363d;--cs-chip-bg:#161b22;--cs-tile-bg:#161b22;--cs-tooltip-bg:#21262d;--cs-empty:#21262d`
      : `--cs-bg:#ffffff;--cs-text:#1f2328;--cs-muted:#656d76;--cs-border:#d0d7de;--cs-chip-bg:#f6f8fa;--cs-tile-bg:#f6f8fa;--cs-tooltip-bg:#1f2328;--cs-empty:#ebedf0`;

  return `:host{display:block;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:var(--cs-text);background:var(--cs-bg);color-scheme:${resolved};font-variant-numeric:tabular-nums;${vars}}.cs-root{box-sizing:border-box;padding:16px}.cs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px}.cs-tile{background:var(--cs-tile-bg);border:1px solid var(--cs-border);border-radius:6px;padding:8px 10px}.cs-tile-val{font-size:18px;font-weight:600}.cs-tile-lbl{font-size:11px;color:var(--cs-muted)}.cs-legend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.cs-chip{position:relative;display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--cs-border);border-radius:16px;background:var(--cs-chip-bg);color:var(--cs-text);cursor:pointer;font-family:inherit;font-size:12px;font-variant-numeric:tabular-nums;user-select:none;transition:border-color .15s,color .15s,transform .1s}.cs-chip::after{content:"";position:absolute;inset:-8px -3px}.cs-chip:hover{border-color:var(--cs-muted)}.cs-chip:active{transform:translateY(1px)}.cs-chip:focus-visible{outline:2px solid var(--cs-muted);outline-offset:1px}.cs-chip.off{color:var(--cs-muted)}.cs-chip.off .cs-swatch{opacity:.35}.cs-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0;transition:opacity .15s}.cs-scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}.cs-scroll:focus-visible{outline:2px solid var(--cs-muted);outline-offset:2px}.cs-scroll svg{display:block}.cs-link{cursor:pointer}rect.cs-today,g.cs-today .cs-oline{stroke:var(--cs-muted)}rect.cs-cell:hover,g.cs-cell:hover .cs-oline{stroke:var(--cs-text);stroke-opacity:.5}.cs-tooltip{position:fixed;z-index:9999;padding:6px 10px;border-radius:6px;background:var(--cs-tooltip-bg);color:#fff;font-size:12px;pointer-events:none;white-space:nowrap;transform:translate(-50%,calc(-100% + 4px));margin-top:-8px;box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:0;transition:opacity .12s ease-out,transform .12s ease-out}.cs-tooltip.on{opacity:1;transform:translate(-50%,-100%)}.cs-tooltip.below{margin-top:8px;transform:translate(-50%,-4px)}.cs-tooltip.below.on{transform:translate(-50%,0)}.cs-tt-date{font-weight:600;margin-bottom:3px}.cs-tt-row{display:flex;align-items:center;gap:6px}.cs-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}.cs-tt-count{margin-left:auto;padding-left:8px;font-weight:600}.cs-bone{background:var(--cs-empty);border-radius:3px}.cs-bone-val{width:36px;height:16px;margin:2px 0 5px}.cs-bone-lbl{width:72px;height:9px}.cs-skel{animation:cs-pulse 1.6s ease-in-out infinite}.cs-skel .cs-chip{cursor:default}@keyframes cs-pulse{50%{opacity:.5}}.cs-loading,.cs-error{padding:24px;text-align:center;color:var(--cs-muted)}.cs-empty-msg{padding:12px 0 4px;text-align:center;color:var(--cs-muted)}@media (prefers-reduced-motion:reduce){.cs-skel{animation:none}.cs-chip,.cs-swatch,.cs-tooltip{transition:none}}`;
}
