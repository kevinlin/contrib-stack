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

  return `:host{display:block;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:var(--cs-text);background:var(--cs-bg);${vars}}.cs-root{box-sizing:border-box;padding:16px}.cs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px}.cs-tile{background:var(--cs-tile-bg);border:1px solid var(--cs-border);border-radius:6px;padding:8px 10px}.cs-tile-val{font-size:18px;font-weight:600}.cs-tile-lbl{font-size:11px;color:var(--cs-muted)}.cs-legend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.cs-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--cs-border);border-radius:16px;background:var(--cs-chip-bg);cursor:pointer;font-size:12px;user-select:none}.cs-chip.off{opacity:.45}.cs-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0}.cs-scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}.cs-scroll svg{display:block}.cs-link{cursor:pointer}.cs-tooltip{position:fixed;z-index:9999;padding:6px 10px;border-radius:6px;background:var(--cs-tooltip-bg);color:#fff;font-size:12px;pointer-events:none;white-space:nowrap;transform:translate(-50%,-100%);margin-top:-8px;box-shadow:0 2px 8px rgba(0,0,0,.25)}.cs-loading,.cs-error{padding:24px;text-align:center;color:var(--cs-muted)}`;
}
