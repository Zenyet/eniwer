import { MenuItem } from '../types';
import { icons } from '../icons';

export class RadialMenu {
  private container: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private menuItems: MenuItem[] = [];
  private selectedIndex: number = -1;
  private centerX: number = 0;
  private centerY: number = 0;
  private isVisible: boolean = false;
  private onSelect: ((item: MenuItem) => void) | null = null;
  private resultPanel: HTMLElement | null = null;
  private selectionRect: DOMRect | null = null;
  private radius: number = 120;

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public setSelectionInfo(rect: DOMRect | null): void {
    this.selectionRect = rect;
  }

  public show(
    x: number,
    y: number,
    items: MenuItem[],
    onSelect: (item: MenuItem) => void
  ): void {
    if (this.isVisible) {
      this.hide();
    }

    // Filter enabled items and sort by order
    this.menuItems = items
      .filter(item => item.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    this.onSelect = onSelect;
    this.centerX = x;
    this.centerY = y;
    this.selectedIndex = -1;
    this.isVisible = true;

    // Calculate dynamic radius based on viewport size and item count
    const baseRadius = Math.min(120, (Math.min(window.innerWidth, window.innerHeight) - 100) / 2);
    // Reduce radius for fewer items to maintain a circular appearance
    // With fewer items, a smaller radius keeps them closer together
    const itemCount = this.menuItems.length;
    if (itemCount <= 4) {
      this.radius = baseRadius * 0.75;
    } else if (itemCount <= 6) {
      this.radius = baseRadius * 0.85;
    } else {
      this.radius = baseRadius;
    }

    this.createOverlay();
    this.createMenu();
    this.attachEventListeners();
  }

  public hide(): void {
    this.isVisible = false;
    this.detachEventListeners();

    if (this.overlay) {
      this.overlay.classList.add('thecircle-fade-out');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        this.container = null;
      }, 200);
    }
  }

  public hideResultPanel(): void {
    if (this.resultPanel) {
      this.resultPanel.classList.add('thecircle-fade-out');
      setTimeout(() => {
        this.resultPanel?.remove();
        this.resultPanel = null;
      }, 200);
    }
  }

  public showResult(title: string, content: string, isLoading: boolean = false): void {
    this.hideResultPanel();

    this.resultPanel = document.createElement('div');
    this.resultPanel.className = 'thecircle-result-panel';

    // Use skeleton loading instead of spinner when loading
    const loadingContent = isLoading
      ? `<div class="thecircle-skeleton thecircle-skeleton-line" style="width: 100%"></div>
         <div class="thecircle-skeleton thecircle-skeleton-line" style="width: 90%"></div>
         <div class="thecircle-skeleton thecircle-skeleton-line" style="width: 75%"></div>
         <div class="thecircle-skeleton thecircle-skeleton-line" style="width: 60%"></div>`
      : content;

    this.resultPanel.innerHTML = `
      <div class="thecircle-result-header">
        <span class="thecircle-result-title">${title}</span>
        <button class="thecircle-result-close">×</button>
      </div>
      <div class="thecircle-result-content-wrapper">
        <div class="thecircle-result-content">
          ${loadingContent}
        </div>
      </div>
      ${!isLoading ? this.createCopyButtonHTML() : ''}
    `;

    document.body.appendChild(this.resultPanel);

    // Position based on selection or center
    const rect = this.resultPanel.getBoundingClientRect();
    let left: number;
    let top: number;

    if (this.selectionRect) {
      // Has selection - position near the selected text
      left = this.selectionRect.left + this.selectionRect.width / 2 - rect.width / 2;
      top = this.selectionRect.bottom + 15;

      // If not enough space below, show above
      if (top + rect.height > window.innerHeight - 20) {
        top = this.selectionRect.top - rect.height - 15;
      }
    } else {
      // No selection - center in viewport
      left = (window.innerWidth - rect.width) / 2;
      top = (window.innerHeight - rect.height) / 2;
    }

    // Keep within viewport bounds
    if (left < 20) left = 20;
    if (left + rect.width > window.innerWidth - 20) {
      left = window.innerWidth - rect.width - 20;
    }
    if (top < 20) top = 20;
    if (top + rect.height > window.innerHeight - 20) {
      top = window.innerHeight - rect.height - 20;
    }

    this.resultPanel.style.left = `${left}px`;
    this.resultPanel.style.top = `${top}px`;

    // Event listeners
    const closeBtn = this.resultPanel.querySelector('.thecircle-result-close');
    closeBtn?.addEventListener('click', () => this.hideResultPanel());

    // Setup copy button
    this.setupCopyButton(content);

    // Setup scroll indicators
    this.setupScrollIndicators();
  }

  private createCopyButtonHTML(): string {
    return `
      <div class="thecircle-result-actions">
        <button class="thecircle-copy-btn">
          <span class="thecircle-copy-btn-icon">${this.getCopyIcon()}</span>
          <span class="thecircle-copy-btn-text">复制</span>
        </button>
      </div>
    `;
  }

  private getCopyIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
  }

  private getCheckIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  }

  private setupCopyButton(content: string): void {
    if (!this.resultPanel) return;

    const copyBtn = this.resultPanel.querySelector('.thecircle-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        this.showCopyFeedback(copyBtn as HTMLButtonElement);
      });
    }
  }

  private showCopyFeedback(btn: HTMLButtonElement): void {
    const iconEl = btn.querySelector('.thecircle-copy-btn-icon');
    const textEl = btn.querySelector('.thecircle-copy-btn-text');

    if (iconEl && textEl) {
      btn.classList.add('copied');
      iconEl.innerHTML = this.getCheckIcon();
      textEl.textContent = '已复制!';

      setTimeout(() => {
        btn.classList.remove('copied');
        iconEl.innerHTML = this.getCopyIcon();
        textEl.textContent = '复制';
      }, 1500);
    }
  }

  private setupScrollIndicators(): void {
    if (!this.resultPanel) return;

    const wrapper = this.resultPanel.querySelector('.thecircle-result-content-wrapper');
    const content = this.resultPanel.querySelector('.thecircle-result-content');

    if (wrapper && content) {
      const updateIndicators = () => {
        const { scrollTop, scrollHeight, clientHeight } = content as HTMLElement;
        const hasScrollTop = scrollTop > 5;
        const hasScrollBottom = scrollTop < scrollHeight - clientHeight - 5;

        wrapper.classList.toggle('has-scroll-top', hasScrollTop);
        wrapper.classList.toggle('has-scroll-bottom', hasScrollBottom);
      };

      content.addEventListener('scroll', updateIndicators);
      // Initial check after content renders
      requestAnimationFrame(updateIndicators);
    }
  }

  public updateResult(content: string): void {
    if (this.resultPanel) {
      const contentEl = this.resultPanel.querySelector('.thecircle-result-content');
      if (contentEl) {
        contentEl.innerHTML = content;
      }

      this.ensureCopyButton(content);
      this.setupScrollIndicators();
    }
  }

  // Stream update for typewriter effect
  public streamUpdate(_chunk: string, fullText: string): void {
    if (this.resultPanel) {
      const contentEl = this.resultPanel.querySelector('.thecircle-result-content');
      if (contentEl) {
        // Use textContent for streaming to avoid HTML parsing issues, then format
        contentEl.innerHTML = this.formatStreamContent(fullText);
        // Auto scroll to bottom
        contentEl.scrollTop = contentEl.scrollHeight;
      }

      this.ensureCopyButton(fullText);
    }
  }

  private formatStreamContent(text: string): string {
    // Simple markdown-like formatting
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  private ensureCopyButton(content: string): void {
    if (!this.resultPanel) return;

    const actionsEl = this.resultPanel.querySelector('.thecircle-result-actions');
    if (!actionsEl) {
      const actions = document.createElement('div');
      actions.className = 'thecircle-result-actions';
      actions.innerHTML = `
        <button class="thecircle-copy-btn">
          <span class="thecircle-copy-btn-icon">${this.getCopyIcon()}</span>
          <span class="thecircle-copy-btn-text">复制</span>
        </button>
      `;
      this.resultPanel.appendChild(actions);

      const copyBtn = actions.querySelector('.thecircle-copy-btn');
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        this.showCopyFeedback(copyBtn as HTMLButtonElement);
      });
    } else {
      // Update copy button to copy latest content
      const copyBtn = actionsEl.querySelector('.thecircle-copy-btn');
      if (copyBtn) {
        const newBtn = copyBtn.cloneNode(true) as HTMLButtonElement;
        newBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(content);
          this.showCopyFeedback(newBtn);
        });
        copyBtn.replaceWith(newBtn);
      }
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'thecircle-overlay';
    document.body.appendChild(this.overlay);
  }

  private createMenu(): void {
    this.container = document.createElement('div');
    this.container.className = 'thecircle-menu';
    this.container.style.left = `${this.centerX}px`;
    this.container.style.top = `${this.centerY}px`;

    // Create center indicator
    const center = document.createElement('div');
    center.className = 'thecircle-center';
    center.innerHTML = `
      <span class="thecircle-center-icon">${icons.circle}</span>
      <span class="thecircle-center-label">选择操作</span>
    `;
    this.container.appendChild(center);

    // Create menu items (8 items in a circle)
    const itemCount = this.menuItems.length;

    this.menuItems.forEach((item, index) => {
      const angle = (index / itemCount) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * this.radius;
      const y = Math.sin(angle) * this.radius;

      const itemEl = document.createElement('div');
      itemEl.className = 'thecircle-item';
      itemEl.dataset.index = String(index);
      // Set CSS custom properties for animations
      itemEl.style.setProperty('--x', `${x}px`);
      itemEl.style.setProperty('--y', `${y}px`);
      itemEl.style.transform = `translate(${x}px, ${y}px)`;

      // Use customIcon/customLabel if available
      const displayIcon = item.customIcon || item.icon;
      const displayLabel = item.customLabel || item.label;

      itemEl.innerHTML = `
        <span class="thecircle-item-icon">${displayIcon}</span>
        <span class="thecircle-item-label">${displayLabel}</span>
      `;

      this.container!.appendChild(itemEl);
    });

    this.overlay!.appendChild(this.container);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      this.container?.classList.add('thecircle-menu-visible');
    });
  }

  private attachEventListeners(): void {
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private detachEventListeners(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isVisible || !this.container) return;

    const dx = e.clientX - this.centerX;
    const dy = e.clientY - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only highlight if mouse is far enough from center
    if (distance < 40) {
      this.setSelectedIndex(-1);
      return;
    }

    // Calculate angle and determine which item is being hovered
    let angle = Math.atan2(dy, dx);
    angle = angle + Math.PI / 2; // Adjust so top is 0
    if (angle < 0) angle += 2 * Math.PI;

    const itemCount = this.menuItems.length;
    const segmentSize = (2 * Math.PI) / itemCount;
    const index = Math.floor((angle + segmentSize / 2) % (2 * Math.PI) / segmentSize);

    this.setSelectedIndex(index);
  }

  private setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return;

    // Remove highlight from previous item
    if (this.selectedIndex >= 0) {
      const prevItem = this.container?.querySelector(`[data-index="${this.selectedIndex}"]`);
      prevItem?.classList.remove('thecircle-item-selected');
    }

    this.selectedIndex = index;

    // Get center element
    const center = this.container?.querySelector('.thecircle-center');

    // Highlight current item
    if (index >= 0 && index < this.menuItems.length) {
      const currentItem = this.container?.querySelector(`[data-index="${index}"]`);
      currentItem?.classList.add('thecircle-item-selected');

      // Show center
      center?.classList.add('thecircle-center-visible');

      // Update center label
      const centerLabel = this.container?.querySelector('.thecircle-center-label');
      const centerIcon = this.container?.querySelector('.thecircle-center-icon');
      if (centerLabel && centerIcon) {
        const item = this.menuItems[index];
        centerLabel.textContent = item.customLabel || item.label;
        centerIcon.innerHTML = item.customIcon || item.icon;
      }
    } else {
      // Hide center
      center?.classList.remove('thecircle-center-visible');

      // Reset center
      const centerLabel = this.container?.querySelector('.thecircle-center-label');
      const centerIcon = this.container?.querySelector('.thecircle-center-icon');
      if (centerLabel && centerIcon) {
        centerLabel.textContent = '选择操作';
        centerIcon.innerHTML = icons.circle;
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    // On Alt key release, execute selected action
    if (e.key === 'Alt' && this.selectedIndex >= 0) {
      this.executeSelection();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible) return;

    const itemCount = this.menuItems.length;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;

      // Arrow key navigation
      case 'ArrowRight':
        e.preventDefault();
        // Cycle to next item
        this.setSelectedIndex(this.selectedIndex < 0 ? 0 : (this.selectedIndex + 1) % itemCount);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        // Cycle to previous item
        this.setSelectedIndex(this.selectedIndex < 0 ? itemCount - 1 : (this.selectedIndex - 1 + itemCount) % itemCount);
        break;

      case 'ArrowUp':
        e.preventDefault();
        // Jump to opposite side (approximately)
        if (this.selectedIndex < 0) {
          this.setSelectedIndex(0);
        } else {
          const oppositeIndex = (this.selectedIndex + Math.floor(itemCount / 2)) % itemCount;
          this.setSelectedIndex(oppositeIndex);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        // Jump to opposite side (approximately)
        if (this.selectedIndex < 0) {
          this.setSelectedIndex(Math.floor(itemCount / 2));
        } else {
          const oppositeIndex = (this.selectedIndex + Math.floor(itemCount / 2)) % itemCount;
          this.setSelectedIndex(oppositeIndex);
        }
        break;

      // Tab for cycling
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          this.setSelectedIndex(this.selectedIndex < 0 ? itemCount - 1 : (this.selectedIndex - 1 + itemCount) % itemCount);
        } else {
          this.setSelectedIndex(this.selectedIndex < 0 ? 0 : (this.selectedIndex + 1) % itemCount);
        }
        break;

      // Enter to confirm selection
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.executeSelection();
        }
        break;

      // Number keys 1-9 for direct selection
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        e.preventDefault();
        const numIndex = parseInt(e.key) - 1;
        if (numIndex < itemCount) {
          this.setSelectedIndex(numIndex);
          this.executeSelection();
        }
        break;
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isVisible) return;

    // Check if clicked on a menu item
    const target = e.target as HTMLElement;
    const itemEl = target.closest('.thecircle-item');

    if (itemEl) {
      const index = parseInt(itemEl.getAttribute('data-index') || '-1');
      if (index >= 0) {
        this.selectedIndex = index;
        this.executeSelection();
      }
    } else if (!target.closest('.thecircle-menu')) {
      // Clicked outside menu, close it
      this.hide();
    }
  }

  private executeSelection(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.menuItems.length) {
      const item = this.menuItems[this.selectedIndex];
      this.hide();
      this.onSelect?.(item);
    }
  }
}
