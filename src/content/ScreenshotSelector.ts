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

export class ScreenshotSelector {
  private overlay: HTMLElement | null = null;
  private selectionBox: HTMLElement | null = null;
  private sizeIndicator: HTMLElement | null = null;
  private hintText: HTMLElement | null = null;
  private isSelecting: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private callbacks: ScreenshotSelectorCallbacks | null = null;

  constructor() {
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
      }, 200);
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'thecircle-screenshot-overlay';

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

    this.isSelecting = true;
    this.startX = e.clientX;
    this.startY = e.clientY;

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
    if (!this.isSelecting) {
      // Click without drag = full screen capture
      this.hide();
      this.callbacks?.onSelect(null);
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
      this.hide();
      this.callbacks?.onSelect(null);
      return;
    }

    const area: SelectionArea = { x, y, width, height };
    this.hide();
    this.callbacks?.onSelect(area);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      this.callbacks?.onCancel();
    }
  }
}
