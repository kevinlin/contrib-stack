export class TooltipController {
  private el: HTMLDivElement | null = null;
  private activeCell: Element | null = null;
  private touchPinned = false;

  attach(root: ShadowRoot | HTMLElement): void {
    const scroll = root.querySelector("[data-scroll]");
    if (!scroll) return;

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

  private show(anchor: Element, text: string): void {
    this.activeCell = anchor;
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.className = "cs-tooltip";
      document.body.appendChild(this.el);
    }
    this.el.textContent = text;
    this.el.style.display = "block";
    const rect = anchor.getBoundingClientRect();
    this.el.style.left = `${rect.left + rect.width / 2}px`;
    this.el.style.top = `${rect.top}px`;
  }

  hide(): void {
    this.activeCell = null;
    if (this.el) this.el.style.display = "none";
  }

  destroy(): void {
    this.hide();
    this.el?.remove();
    this.el = null;
  }
}
