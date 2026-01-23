import { MenuItem } from '../types';
import { appendToShadow, removeFromShadow } from './ShadowHost';

export interface ShowResultOptions {
  isLoading?: boolean;
  originalText?: string;
  type?: 'translate' | 'general';
}

export class RadialMenu {
  private container: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private menuItems: MenuItem[] = [];
  private selectedIndex: number = -1;
  private centerX: number = 0;
  private centerY: number = 0;
  private isVisible: boolean = false;
  private onSelect: ((item: MenuItem) => void) | null = null;
  private radius: number = 120;
  
  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
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
      const overlayToRemove = this.overlay;
      overlayToRemove.classList.add('thecircle-fade-out');
      
      // If we're closing completely (not just replacing), remove container too
      // But container logic is tricky if we're reopening. 
      // Actually container is just for menu items? 
      // Looking at createMenu(), it creates this.container.
      // So we should capture container too.
      const containerToRemove = this.container;
      
      setTimeout(() => {
        removeFromShadow(overlayToRemove);
        if (containerToRemove) {
          removeFromShadow(containerToRemove);
        }
        
        // Only clear references if they haven't been replaced by a new show() call
        if (this.overlay === overlayToRemove) {
          this.overlay = null;
        }
        if (this.container === containerToRemove) {
          this.container = null;
        }
      }, 200);
    }
  }

  public setOnStop(callback: () => void): void {
    void callback;
  }

  public setOnClose(callback: () => void): void {
    void callback;
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'thecircle-overlay';
    appendToShadow(this.overlay);
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
      // const displayLabel = item.customLabel || item.label; // Label shown in center now

      itemEl.innerHTML = `
        <span class="thecircle-item-icon">${displayIcon}</span>
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
      
      if (centerLabel) {
        const item = this.menuItems[index];
        centerLabel.textContent = item.customLabel || item.label;
        if (centerIcon) {
          centerIcon.innerHTML = item.customIcon || item.icon;
        }
      }
    } else {
      // Hide center
      center?.classList.remove('thecircle-center-visible');

      // Reset center
      const centerLabel = this.container?.querySelector('.thecircle-center-label');
      if (centerLabel) {
        centerLabel.textContent = '选择操作';
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

    // Use composedPath to get the actual target inside Shadow DOM
    const path = e.composedPath() as HTMLElement[];
    let itemEl: HTMLElement | null = null;
    let isInsideMenu = false;

    for (const el of path) {
      if (el instanceof HTMLElement) {
        if (el.classList?.contains('thecircle-item')) {
          itemEl = el;
        }
        if (el.classList?.contains('thecircle-menu')) {
          isInsideMenu = true;
        }
      }
    }

    if (itemEl) {
      const index = parseInt(itemEl.getAttribute('data-index') || '-1');
      if (index >= 0) {
        this.selectedIndex = index;
        this.executeSelection();
      }
    } else if (!isInsideMenu) {
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
