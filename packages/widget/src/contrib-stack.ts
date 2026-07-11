import { fetchProfile, filterSources } from "./api";
import {
  buildGridLayout,
  computeStats,
  nonZeroCountsBySlug,
  resolveRange,
  todayIso,
} from "./layout";
import { maxGridColumn, renderWidget, scrollTargetX } from "./render";
import { resolveTheme, themeCss } from "./theme";
import { TooltipController } from "./tooltip";
import type { ProfileData, RenderState, Theme } from "./types";

const OBSERVED = ["user", "theme", "range", "sources", "api", "link"] as const;

export class ContribStack extends HTMLElement {
  private shadow: ShadowRoot;
  private tooltip = new TooltipController();
  private profile: ProfileData | null = null;
  private visibleSlugs = new Set<string>();
  private mediaQuery: MediaQueryList | null = null;
  private mediaHandler: (() => void) | null = null;
  private loading = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return OBSERVED;
  }

  connectedCallback(): void {
    void this.load();
    this.watchTheme();
  }

  disconnectedCallback(): void {
    this.tooltip.destroy();
    this.unwatchTheme();
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    _new: string | null,
  ): void {
    if (OBSERVED.includes(name as (typeof OBSERVED)[number])) {
      void this.load();
    }
  }

  private get user(): string {
    return this.getAttribute("user") ?? "";
  }

  private get themeAttr(): Theme {
    const t = this.getAttribute("theme") ?? "auto";
    return t === "light" || t === "dark" || t === "auto" ? t : "auto";
  }

  private get range(): string {
    return this.getAttribute("range") ?? "1y";
  }

  private get sources(): string | null {
    return this.getAttribute("sources");
  }

  private get apiBase(): string {
    return (
      this.getAttribute("api") ??
      (typeof location !== "undefined" ? location.origin : "")
    );
  }

  private get linkEnabled(): boolean {
    return (this.getAttribute("link") ?? "on") !== "off";
  }

  private profilePageUrl(): string {
    const base = this.apiBase.replace(/\/$/, "");
    return `${base}/${encodeURIComponent(this.user)}`;
  }

  private watchTheme(): void {
    if (this.themeAttr !== "auto" || typeof matchMedia === "undefined") return;
    this.mediaQuery = matchMedia("(prefers-color-scheme: dark)");
    this.mediaHandler = () => this.paint();
    this.mediaQuery.addEventListener("change", this.mediaHandler);
  }

  private unwatchTheme(): void {
    if (this.mediaQuery && this.mediaHandler) {
      this.mediaQuery.removeEventListener("change", this.mediaHandler);
    }
    this.mediaQuery = null;
    this.mediaHandler = null;
  }

  private async load(): Promise<void> {
    if (!this.user || this.loading) return;
    this.loading = true;
    this.renderMessage("Loading…");
    try {
      const raw = await fetchProfile(this.apiBase, this.user, this.range);
      this.profile = filterSources(raw, this.sources);
      if (this.visibleSlugs.size === 0) {
        this.visibleSlugs = new Set(
          this.profile.connections.map((c) => c.slug),
        );
      } else {
        const valid = new Set(this.profile.connections.map((c) => c.slug));
        this.visibleSlugs = new Set(
          [...this.visibleSlugs].filter((s) => valid.has(s)),
        );
        if (this.visibleSlugs.size === 0) {
          this.visibleSlugs = valid;
        }
      }
      this.paint();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load";
      this.renderMessage(msg, true);
    } finally {
      this.loading = false;
    }
  }

  private buildState(): RenderState | null {
    if (!this.profile) return null;
    const range = resolveRange(this.range);
    const layout = buildGridLayout(range);
    const nonZeroBySlug = nonZeroCountsBySlug(this.profile.connections);
    const stats = computeStats(
      this.profile.connections,
      this.visibleSlugs,
      range,
      todayIso(),
    );
    const theme = resolveTheme(this.themeAttr);
    return {
      profile: this.profile,
      layout,
      visibleSlugs: this.visibleSlugs,
      stats,
      nonZeroBySlug,
      theme,
      linkEnabled: this.linkEnabled,
      profileUrl: this.profilePageUrl(),
    };
  }

  private renderMessage(msg: string, error = false): void {
    const theme = resolveTheme(this.themeAttr);
    this.shadow.innerHTML = `<style>${themeCss(theme)}</style><div class="cs-root"><div class="${error ? "cs-error" : "cs-loading"}">${msg}</div></div>`;
  }

  private paint(): void {
    const state = this.buildState();
    if (!state) return;

    this.shadow.innerHTML = `<style>${themeCss(state.theme)}</style><div class="cs-root">${renderWidget(state)}</div>`;
    this.bindEvents(state);
    this.autoScroll(state);
    this.tooltip.attach(this.shadow);
  }

  private bindEvents(_state: RenderState): void {
    const root = this.shadow.querySelector(".cs-root");
    if (!root) return;

    root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const chip = target.closest(".cs-chip") as HTMLElement | null;
      if (chip?.dataset.slug) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSlug(chip.dataset.slug);
        return;
      }

      if (!this.linkEnabled) return;
      const cell = target.closest(".cs-cell") as HTMLElement | null;
      if (cell?.dataset.href) {
        window.open(cell.dataset.href, "_blank", "noopener");
      }
    });
  }

  private toggleSlug(slug: string): void {
    if (!this.profile) return;
    if (this.visibleSlugs.has(slug)) {
      if (this.visibleSlugs.size > 1) {
        this.visibleSlugs.delete(slug);
      }
    } else {
      this.visibleSlugs.add(slug);
    }
    this.paint();
  }

  private autoScroll(state: RenderState): void {
    const scroll = this.shadow.querySelector("[data-scroll]") as HTMLElement | null;
    if (!scroll) return;
    const maxCol = maxGridColumn(state.layout);
    scroll.scrollLeft = scrollTargetX(maxCol);
  }
}

export function registerContribStack(): void {
  if (typeof customElements !== "undefined" && !customElements.get("contrib-stack")) {
    customElements.define("contrib-stack", ContribStack);
  }
}
