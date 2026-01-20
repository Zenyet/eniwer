import { icons } from '../icons';
import { appendToShadow, removeFromShadow } from './ShadowHost';

export interface SelectionPopoverCallbacks {
  onTranslate: () => void;
}

export type PopoverPosition = 'above' | 'below';

export class SelectionPopover {
  private popover: HTMLElement | null = null;
  private callbacks: SelectionPopoverCallbacks | null = null;
  private hideTimeout: number | null = null;

  constructor() {}

  public show(
    rect: DOMRect,
    callbacks: SelectionPopoverCallbacks,
    position: PopoverPosition = 'above'
  ): void {
    this.hide();
    this.callbacks = callbacks;
    this.createPopover(rect, position);
  }

  public hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.popover) {
      this.popover.classList.add('thecircle-selection-popover-exit');
      const popoverRef = this.popover;
      setTimeout(() => {
        removeFromShadow(popoverRef);
      }, 150);
      this.popover = null;
    }
  }

  public isVisible(): boolean {
    return this.popover !== null;
  }

  private createPopover(rect: DOMRect, position: PopoverPosition): void {
    this.popover = document.createElement('div');
    this.popover.className = 'thecircle-selection-popover';

    // Calculate position
    const popoverWidth = 40;
    const popoverHeight = 36;
    const gap = 8;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    let top: number;

    if (position === 'above') {
      top = rect.top - popoverHeight - gap;
      // If not enough space above, show below
      if (top < 10) {
        top = rect.bottom + gap;
        this.popover.classList.add('thecircle-selection-popover-below');
      }
    } else {
      top = rect.bottom + gap;
      // If not enough space below, show above
      if (top + popoverHeight > window.innerHeight - 10) {
        top = rect.top - popoverHeight - gap;
      } else {
        this.popover.classList.add('thecircle-selection-popover-below');
      }
    }

    // Keep within viewport horizontally
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }

    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;

    this.popover.innerHTML = `
      <button class="thecircle-selection-popover-btn" data-action="translate" title="翻译">
        ${icons.translate}
      </button>
    `;

    appendToShadow(this.popover);

    // Setup event listeners
    const translateBtn = this.popover.querySelector('[data-action="translate"]');
    translateBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks?.onTranslate();
      this.hide();
    });

    // Prevent popover from being hidden when clicking on it
    this.popover.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }
}
