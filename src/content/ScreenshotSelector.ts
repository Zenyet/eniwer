// Screenshot area selector component
export interface SelectionArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotSelectorCallbacks {
  onSelect: (area: SelectionArea | null) => void;
  onCancel: () => void;
}

// Inline styles for screenshot selector (injected into document, not Shadow DOM)
const SCREENSHOT_STYLES = `
.thecircle-screenshot-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: transparent;
  cursor: crosshair;
  animation: thecircle-ss-fade-in 0.15s ease-out;
}
.thecircle-screenshot-overlay.thecircle-screenshot-selecting {
  background: transparent;
}
.thecircle-screenshot-overlay.thecircle-screenshot-idle {
  background: rgba(0, 0, 0, 0.3);
}
.thecircle-screenshot-overlay.thecircle-screenshot-has-selection {
  cursor: default;
}
.thecircle-screenshot-fade-out {
  animation: thecircle-ss-fade-out 0.2s ease-out forwards;
}
@keyframes thecircle-ss-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes thecircle-ss-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
.thecircle-screenshot-hint {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transition: opacity 0.2s ease;
}
.thecircle-screenshot-hint-divider {
  color: rgba(255, 255, 255, 0.3);
}
.thecircle-screenshot-hint-key {
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.thecircle-screenshot-selection {
  position: fixed;
  border: 2px solid #3b82f6;
  background: transparent;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  cursor: move;
}
.thecircle-screenshot-selection.thecircle-screenshot-selection-active {
  pointer-events: auto;
  cursor: move;
}
.thecircle-screenshot-selection.thecircle-screenshot-selection-breathe {
  animation: thecircle-ss-breathe 0.4s ease-out;
}
@keyframes thecircle-ss-breathe {
  0% { border-color: #3b82f6; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5); }
  50% { border-color: #60a5fa; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.5); }
  100% { border-color: #3b82f6; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5); }
}
.thecircle-screenshot-size {
  position: fixed;
  transform: translateX(-50%);
  padding: 4px 10px;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  pointer-events: none;
}
.thecircle-screenshot-toolbar {
  position: fixed;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 0.5px 0 rgba(255, 255, 255, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: thecircle-ss-fade-in 0.15s ease-out;
  z-index: 2147483647;
}
.thecircle-screenshot-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  transition: all 0.15s ease;
}
.thecircle-screenshot-toolbar-btn svg {
  width: 16px;
  height: 16px;
}
.thecircle-screenshot-toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}
.thecircle-screenshot-toolbar-btn-primary {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}
.thecircle-screenshot-toolbar-btn-primary:hover {
  background: rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.6);
}
@media (prefers-color-scheme: light) {
  .thecircle-screenshot-toolbar {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), inset 0 0.5px 0 rgba(255, 255, 255, 0.8);
  }
  .thecircle-screenshot-toolbar-btn {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.85);
  }
  .thecircle-screenshot-toolbar-btn:hover {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.2);
  }
  .thecircle-screenshot-toolbar-btn-primary {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
    color: #2563eb;
  }
  .thecircle-screenshot-toolbar-btn-primary:hover {
    background: rgba(59, 130, 246, 0.25);
    border-color: rgba(59, 130, 246, 0.5);
  }
}
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;

  // Remove existing style tag if present (for extension reload)
  const existingStyle = document.getElementById('thecircle-screenshot-styles');
  if (existingStyle) {
    existingStyle.remove();
  }

  const style = document.createElement('style');
  style.id = 'thecircle-screenshot-styles';
  style.textContent = SCREENSHOT_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

export class ScreenshotSelector {
  private overlay: HTMLElement | null = null;
  private selectionBox: HTMLElement | null = null;
  private sizeIndicator: HTMLElement | null = null;
  private hintText: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private isSelecting: boolean = false;
  private isDragging: boolean = false;
  private hasSelection: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private currentArea: SelectionArea | null = null;
  private callbacks: ScreenshotSelectorCallbacks | null = null;

  constructor() {
    injectStyles();
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public show(callbacks: ScreenshotSelectorCallbacks): void {
    this.callbacks = callbacks;
    this.createOverlay();
    this.attachEventListeners();
  }

  public hide(): void {
    this.detachEventListeners();
    if (this.overlay) {
      this.overlay.classList.add('thecircle-screenshot-fade-out');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        this.selectionBox = null;
        this.sizeIndicator = null;
        this.hintText = null;
        this.toolbar = null;
      }, 200);
    }
  }

  // Hide overlay immediately without animation (for screenshot capture)
  private hideImmediately(): void {
    this.detachEventListeners();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.selectionBox = null;
      this.sizeIndicator = null;
      this.hintText = null;
      this.toolbar = null;
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'thecircle-screenshot-overlay thecircle-screenshot-idle';

    // Hint text at top
    this.hintText = document.createElement('div');
    this.hintText.className = 'thecircle-screenshot-hint';
    this.hintText.innerHTML = `
      <span>拖拽选择截图区域</span>
      <span class="thecircle-screenshot-hint-divider">|</span>
      <span class="thecircle-screenshot-hint-key">ESC</span>
      <span>取消</span>
      <span class="thecircle-screenshot-hint-divider">|</span>
      <span>点击截取全屏</span>
    `;
    this.overlay.appendChild(this.hintText);

    // Selection box (hidden initially)
    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'thecircle-screenshot-selection';
    this.selectionBox.style.display = 'none';
    this.overlay.appendChild(this.selectionBox);

    // Size indicator
    this.sizeIndicator = document.createElement('div');
    this.sizeIndicator.className = 'thecircle-screenshot-size';
    this.sizeIndicator.style.display = 'none';
    this.overlay.appendChild(this.sizeIndicator);

    document.body.appendChild(this.overlay);
  }

  private createToolbar(): void {
    if (!this.overlay || !this.currentArea) return;

    // Remove existing toolbar if any
    this.toolbar?.remove();

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'thecircle-screenshot-toolbar';

    // Position toolbar below the selection
    const toolbarTop = this.currentArea.y + this.currentArea.height + 10;
    const toolbarLeft = this.currentArea.x + this.currentArea.width / 2;

    this.toolbar.style.left = `${toolbarLeft}px`;
    this.toolbar.style.top = `${toolbarTop}px`;

    // If toolbar would go off screen, position it above the selection
    if (toolbarTop + 50 > window.innerHeight) {
      this.toolbar.style.top = `${this.currentArea.y - 50}px`;
    }

    this.toolbar.innerHTML = `
      <button class="thecircle-screenshot-toolbar-btn thecircle-screenshot-toolbar-btn-primary" data-action="confirm" title="确认">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
      <button class="thecircle-screenshot-toolbar-btn" data-action="reselect" title="重选">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6"></path>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </button>
      <button class="thecircle-screenshot-toolbar-btn" data-action="cancel" title="取消">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    // Add click handlers
    this.toolbar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button');
      if (!btn) return;

      const action = btn.dataset.action;
      if (action === 'confirm') {
        this.confirmSelection();
      } else if (action === 'reselect') {
        this.resetSelection();
      } else if (action === 'cancel') {
        this.hide();
        this.callbacks?.onCancel();
      }
    });

    this.overlay.appendChild(this.toolbar);
  }

  private confirmSelection(): void {
    const area = this.currentArea;
    // Hide overlay immediately (no animation) before capturing
    this.hideImmediately();
    // Use requestAnimationFrame to ensure DOM is updated before capture
    requestAnimationFrame(() => {
      this.callbacks?.onSelect(area);
    });
  }

  private resetSelection(): void {
    this.hasSelection = false;
    this.currentArea = null;
    this.isDragging = false;
    this.toolbar?.remove();
    this.toolbar = null;

    // Add back idle state and remove selection-related classes
    if (this.overlay) {
      this.overlay.classList.add('thecircle-screenshot-idle');
      this.overlay.classList.remove('thecircle-screenshot-has-selection');
    }

    if (this.selectionBox) {
      this.selectionBox.style.display = 'none';
      this.selectionBox.classList.remove('thecircle-screenshot-selection-active');
      this.selectionBox.classList.remove('thecircle-screenshot-selection-breathe');
    }
    if (this.sizeIndicator) {
      this.sizeIndicator.style.display = 'none';
    }
    if (this.hintText) {
      this.hintText.style.opacity = '1';
    }
  }

  private attachEventListeners(): void {
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private detachEventListeners(): void {
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.overlay || e.button !== 0) return;

    // Check if clicking on toolbar
    if (this.toolbar && this.toolbar.contains(e.target as Node)) {
      return;
    }

    const clickX = e.clientX;
    const clickY = e.clientY;

    // If we have a selection, check if clicking inside it
    if (this.hasSelection && this.currentArea) {
      const { x, y, width, height } = this.currentArea;
      const isInsideSelection =
        clickX >= x && clickX <= x + width &&
        clickY >= y && clickY <= y + height;

      if (isInsideSelection) {
        // Start dragging the selection
        this.isDragging = true;
        this.dragOffsetX = clickX - x;
        this.dragOffsetY = clickY - y;
        e.preventDefault();
        return;
      } else {
        // Clicking outside selection - show breathe animation
        this.triggerBreatheAnimation();
        e.preventDefault();
        return;
      }
    }

    // No selection yet - start new selection
    this.isSelecting = true;
    this.startX = clickX;
    this.startY = clickY;

    // Remove idle state - overlay becomes transparent, selection box shadow creates dimming
    this.overlay.classList.remove('thecircle-screenshot-idle');

    if (this.selectionBox) {
      this.selectionBox.style.display = 'block';
      this.selectionBox.style.left = `${this.startX}px`;
      this.selectionBox.style.top = `${this.startY}px`;
      this.selectionBox.style.width = '0px';
      this.selectionBox.style.height = '0px';
    }

    if (this.sizeIndicator) {
      this.sizeIndicator.style.display = 'block';
    }

    // Hide hint when starting selection
    if (this.hintText) {
      this.hintText.style.opacity = '0';
    }

    e.preventDefault();
  }

  private handleMouseMove(e: MouseEvent): void {
    // Handle dragging
    if (this.isDragging && this.currentArea && this.selectionBox) {
      const newX = Math.max(0, Math.min(window.innerWidth - this.currentArea.width, e.clientX - this.dragOffsetX));
      const newY = Math.max(0, Math.min(window.innerHeight - this.currentArea.height, e.clientY - this.dragOffsetY));

      this.currentArea.x = newX;
      this.currentArea.y = newY;

      this.selectionBox.style.left = `${newX}px`;
      this.selectionBox.style.top = `${newY}px`;

      // Update toolbar position
      this.updateToolbarPosition();

      // Update size indicator position
      if (this.sizeIndicator) {
        this.sizeIndicator.style.left = `${newX + this.currentArea.width / 2}px`;
        this.sizeIndicator.style.top = `${newY + this.currentArea.height + 10}px`;
      }
      return;
    }

    // Handle selecting
    if (!this.isSelecting || !this.selectionBox || !this.sizeIndicator) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(this.startX, currentX);
    const y = Math.min(this.startY, currentY);
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);

    this.selectionBox.style.left = `${x}px`;
    this.selectionBox.style.top = `${y}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;

    // Update size indicator
    this.sizeIndicator.textContent = `${width} × ${height}`;
    this.sizeIndicator.style.left = `${x + width / 2}px`;
    this.sizeIndicator.style.top = `${y + height + 10}px`;
  }

  private handleMouseUp(e: MouseEvent): void {
    // Handle end of drag
    if (this.isDragging) {
      this.isDragging = false;
      return;
    }

    if (!this.isSelecting) {
      // Click without drag = full screen capture (only if no current selection)
      if (!this.hasSelection) {
        this.hideImmediately();
        requestAnimationFrame(() => {
          this.callbacks?.onSelect(null);
        });
      }
      return;
    }

    this.isSelecting = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(this.startX, currentX);
    const y = Math.min(this.startY, currentY);
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);

    // Minimum size check
    if (width < 10 || height < 10) {
      // Too small, treat as full screen capture
      this.hideImmediately();
      requestAnimationFrame(() => {
        this.callbacks?.onSelect(null);
      });
      return;
    }

    // Store the selection area and show toolbar
    this.currentArea = { x, y, width, height };
    this.hasSelection = true;

    // Add has-selection class to overlay and active class to selection box
    this.overlay?.classList.add('thecircle-screenshot-has-selection');
    this.selectionBox?.classList.add('thecircle-screenshot-selection-active');

    this.createToolbar();
  }

  private triggerBreatheAnimation(): void {
    if (!this.selectionBox) return;

    // Remove and re-add class to restart animation
    this.selectionBox.classList.remove('thecircle-screenshot-selection-breathe');
    // Force reflow
    void this.selectionBox.offsetWidth;
    this.selectionBox.classList.add('thecircle-screenshot-selection-breathe');

    // Remove class after animation completes
    setTimeout(() => {
      this.selectionBox?.classList.remove('thecircle-screenshot-selection-breathe');
    }, 400);
  }

  private updateToolbarPosition(): void {
    if (!this.toolbar || !this.currentArea) return;

    const toolbarTop = this.currentArea.y + this.currentArea.height + 10;
    const toolbarLeft = this.currentArea.x + this.currentArea.width / 2;

    this.toolbar.style.left = `${toolbarLeft}px`;

    // If toolbar would go off screen, position it above the selection
    if (toolbarTop + 50 > window.innerHeight) {
      this.toolbar.style.top = `${this.currentArea.y - 50}px`;
    } else {
      this.toolbar.style.top = `${toolbarTop}px`;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      this.callbacks?.onCancel();
    } else if (e.key === 'Enter' && this.hasSelection) {
      // Allow Enter key to confirm selection
      e.preventDefault();
      this.confirmSelection();
    }
  }
}
