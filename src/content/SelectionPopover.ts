import { icons } from "../icons";
import { appendToShadow, removeFromShadow } from "./ShadowHost";

export interface SelectionPopoverCallbacks {
  onTranslate: () => void;
}

export type PopoverPosition = "above" | "below";

export class SelectionPopover {
  private popover: HTMLElement | null = null;
  private callbacks: SelectionPopoverCallbacks | null = null;
  private hideTimeout: number | null = null;
  private currentRange: Range | null = null;
  private preferredPosition: PopoverPosition = "above";
  private scrollHandler: (() => void) | null = null;

  constructor() {}

  public show(
    rect: DOMRect,
    callbacks: SelectionPopoverCallbacks,
    position: PopoverPosition = "above",
  ): void {
    this.hide();
    this.callbacks = callbacks;
    this.preferredPosition = position;

    // 保存当前选区，用于滚动时更新位置
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.currentRange = selection.getRangeAt(0).cloneRange();
    }

    this.createPopover(rect, position);
    this.setupScrollListener();
  }

  public hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.removeScrollListener();
    if (this.popover) {
      this.popover.classList.add("thecircle-selection-popover-exit");
      const popoverRef = this.popover;
      setTimeout(() => {
        removeFromShadow(popoverRef);
      }, 150);
      this.popover = null;
    }
    this.currentRange = null;
  }

  public isVisible(): boolean {
    return this.popover !== null;
  }

  private setupScrollListener(): void {
    this.scrollHandler = () => {
      this.updatePosition();
    };
    // 监听 window 和 document 的滚动事件（捕获阶段以获取所有滚动）
    window.addEventListener("scroll", this.scrollHandler, true);
  }

  private removeScrollListener(): void {
    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler, true);
      this.scrollHandler = null;
    }
  }

  private updatePosition(): void {
    if (!this.popover || !this.currentRange) return;

    // 获取当前选区的最新位置
    const rect = this.currentRange.getBoundingClientRect();

    // 如果选区滚动出视口，隐藏 popover
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      this.popover.style.opacity = "0";
      this.popover.style.pointerEvents = "none";
      return;
    } else {
      this.popover.style.opacity = "1";
      this.popover.style.pointerEvents = "auto";
    }

    const { left, top } = this.calculatePosition(rect, this.preferredPosition);
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
  }

  private calculatePosition(
    rect: DOMRect,
    position: PopoverPosition,
  ): { left: number; top: number } {
    const popoverWidth = 32;
    const popoverHeight = 32;
    const gap = 8;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    let top: number;

    if (position === "above") {
      top = rect.top - popoverHeight - gap;
      if (top < 10) {
        top = rect.bottom + gap;
      }
    } else {
      top = rect.bottom + gap;
      if (top + popoverHeight > window.innerHeight - 10) {
        top = rect.top - popoverHeight - gap;
      }
    }

    // Keep within viewport horizontally
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }

    return { left, top };
  }

  private createPopover(rect: DOMRect, position: PopoverPosition): void {
    this.popover = document.createElement("div");
    this.popover.className = "thecircle-selection-popover";

    const { left, top } = this.calculatePosition(rect, position);
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;

    this.popover.innerHTML = `
      <button class="thecircle-selection-popover-btn" data-action="translate" title="翻译">
        ${icons.translate}
      </button>
    `;

    appendToShadow(this.popover);

    // Setup event listeners
    const translateBtn = this.popover.querySelector(
      '[data-action="translate"]',
    );
    translateBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onTranslate();
      this.hide();
    });

    // Prevent popover from being hidden when clicking on it
    this.popover.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
  }
}
