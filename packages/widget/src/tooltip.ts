import { formatTooltipDate } from "./render";

export class TooltipController {
  private el: HTMLDivElement | null = null;
  private mount: ParentNode | null = null;
  private activeCell: Element | null = null;
  private touchPinned = false;

  attach(root: ShadowRoot | HTMLElement): void {
    const scroll = root.querySelector("[data-scroll]");
    if (!scroll) return;
    this.mount = root.querySelector(".cs-root") ?? root;

    scroll.addEventListener("mouseover", (e) => this.onHover(e));
    scroll.addEventListener("mouseout", (e) => this.onLeave(e));
    scroll.addEventListener("click", (e) => this.onTap(e));
  }

  private cellFromEvent(e: Event): Element | null {
    const target = e.target as Element | null;
    if (!target) return null;
    return target.closest(".cs-cell");
  }

  private onHover(e: Event): void {
    if (this.touchPinned) return;
    const cell = this.cellFromEvent(e);
    if (!cell) return;
    const tip = cell.getAttribute("data-tip");
    if (!tip) return;
    this.show(cell, tip);
  }

  private onLeave(e: Event): void {
    if (this.touchPinned) return;
    const cell = this.cellFromEvent(e);
    if (!cell || cell !== this.activeCell) return;
    const related = (e as MouseEvent).relatedTarget as Element | null;
    if (related && cell.contains(related)) return;
    this.hide();
  }

  private onTap(e: Event): void {
    if (!("ontouchstart" in window)) return;
    const cell = this.cellFromEvent(e);
    if (!cell) {
      this.touchPinned = false;
      this.hide();
      return;
    }
    const tip = cell.getAttribute("data-tip");
    if (!tip) return;
    if (this.activeCell === cell && this.touchPinned) {
      this.touchPinned = false;
      this.hide();
      return;
    }
    this.touchPinned = true;
    this.show(cell, tip);
  }

  private setContent(anchor: Element, text: string): void {
    const el = this.el;
    if (!el) return;
    el.textContent = "";
    const date = anchor.getAttribute("data-date");
    const raw = anchor.getAttribute("data-tipr");
    let rows: Array<[string, string, number]> | null = null;
    if (raw) {
      try {
        rows = JSON.parse(raw) as Array<[string, string, number]>;
      } catch {
        rows = null;
      }
    }
    if (!rows || !date) {
      el.textContent = text;
      return;
    }
    const header = document.createElement("div");
    header.className = "cs-tt-date";
    header.textContent = formatTooltipDate(date);
    el.appendChild(header);
    for (const [color, label, count] of rows) {
      const row = document.createElement("div");
      row.className = "cs-tt-row";
      const dot = document.createElement("span");
      dot.className = "cs-dot";
      dot.style.background = color;
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "cs-tt-count";
      value.textContent = String(count);
      row.append(dot, name, value);
      el.appendChild(row);
    }
  }

  private show(anchor: Element, text: string): void {
    this.activeCell = anchor;
    if (!this.el || !this.el.isConnected) {
      if (!this.mount) return;
      this.el = document.createElement("div");
      this.el.className = "cs-tooltip";
      this.mount.appendChild(this.el);
    }
    const el = this.el;
    const wasHidden = el.style.display !== "block";
    this.setContent(anchor, text);
    el.style.display = "block";
    const rect = anchor.getBoundingClientRect();
    const half = el.offsetWidth / 2;
    const cx = Math.min(
      Math.max(rect.left + rect.width / 2, half + 4),
      window.innerWidth - half - 4,
    );
    const below = rect.top - el.offsetHeight - 12 < 0;
    el.classList.toggle("below", below);
    el.style.left = `${cx}px`;
    el.style.top = `${below ? rect.bottom : rect.top}px`;
    if (wasHidden) {
      el.classList.remove("on");
      void el.offsetWidth;
      el.classList.add("on");
    }
  }

  hide(): void {
    this.activeCell = null;
    if (this.el) {
      this.el.classList.remove("on");
      this.el.style.display = "none";
    }
  }

  destroy(): void {
    this.hide();
    this.el?.remove();
    this.el = null;
    this.mount = null;
  }
}
