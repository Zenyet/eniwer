import { icons } from "../icons";
import { AnnotationColor, ANNOTATION_COLORS } from "../types/annotation";
import { appendToShadow, removeFromShadow } from "./ShadowHost";

export interface SelectionPopoverCallbacks {
  onTranslate: () => void;
  onHighlight?: (color: AnnotationColor) => void;
  onNote?: () => void;
  onMore?: () => void;
}

export type PopoverPosition = "above" | "below";

// Color button order
const COLOR_ORDER: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

// Icons for the popover
const noteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`;
const moreIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;

export class SelectionPopover {
  private popover: HTMLElement | null = null;
  private callbacks: SelectionPopoverCallbacks | null = null;
  private hideTimeout: number | null = null;
  private currentRange: Range | null = null;
  private preferredPosition: PopoverPosition = "above";
  private scrollHandler: (() => void) | null = null;
  private rafId: number | null = null;

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

    // Show immediately
    requestAnimationFrame(() => {
      if (this.popover) {
        this.popover.style.opacity = "1";
      }
    });
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
      // 使用 rAF 节流，确保每帧最多更新一次
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.updatePosition();
          this.rafId = null;
        });
      }
    };
    // 监听 window 和 document 的滚动事件（捕获阶段以获取所有滚动）
    window.addEventListener("scroll", this.scrollHandler, true);
  }

  private removeScrollListener(): void {
    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler, true);
      this.scrollHandler = null;
    }
    // 取消待执行的 rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
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
    // Width now accounts for color buttons + divider + action buttons
    // 5 colors (20px each) + divider (1px + 8px margins) + note (24px) + translate (24px) + more (24px) + gaps + padding
    const popoverWidth = 200;
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

    // Build color buttons
    const colorButtons = COLOR_ORDER.map(color => {
      const config = ANNOTATION_COLORS[color];
      return `
        <button
          class="thecircle-selection-popover-color-btn"
          data-action="highlight"
          data-color="${color}"
          title="${config.label}"
          style="background-color: ${config.bg}; border-color: ${config.border}"
        ></button>
      `;
    }).join('');

    this.popover.innerHTML = `
      <div class="thecircle-selection-popover-container">
        <div class="thecircle-selection-popover-colors">
          ${colorButtons}
        </div>
        <div class="thecircle-selection-popover-divider"></div>
        <button class="thecircle-selection-popover-btn" data-action="note" title="添加批注">
          ${noteIcon}
        </button>
        <button class="thecircle-selection-popover-btn" data-action="translate" title="翻译">
          ${icons.translate}
        </button>
        <button class="thecircle-selection-popover-btn" data-action="more" title="更多">
          ${moreIcon}
        </button>
      </div>
    `;

    appendToShadow(this.popover);

    // Setup event listeners
    this.setupEventListeners();

    // Prevent popover from being hidden when clicking on it
    this.popover.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
  }

  private setupEventListeners(): void {
    if (!this.popover) return;

    // Color buttons
    const colorBtns = this.popover.querySelectorAll('[data-action="highlight"]');
    colorBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const color = (btn as HTMLElement).dataset.color as AnnotationColor;
        this.callbacks?.onHighlight?.(color);
        this.hide();
      });
    });

    // Note button
    const noteBtn = this.popover.querySelector('[data-action="note"]');
    noteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onNote?.();
      this.hide();
    });

    // Translate button
    const translateBtn = this.popover.querySelector('[data-action="translate"]');
    translateBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onTranslate();
      this.hide();
    });

    // More button
    const moreBtn = this.popover.querySelector('[data-action="more"]');
    moreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onMore?.();
      this.hide();
    });
  }
}
