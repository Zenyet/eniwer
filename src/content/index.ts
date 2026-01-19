import './styles.css';
import { RadialMenu } from './RadialMenu';
import { MenuActions } from './MenuActions';
import { MenuItem, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig } from '../types';
import { getStorageData } from '../utils/storage';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  element: HTMLElement;
  timeoutId: number;
}

class TheCircle {
  private radialMenu: RadialMenu;
  private menuActions: MenuActions;
  private selectionMenuItems: MenuItem[] = DEFAULT_SELECTION_MENU;
  private globalMenuItems: MenuItem[] = DEFAULT_GLOBAL_MENU;
  private config: MenuConfig = DEFAULT_CONFIG;
  private lastKeyTime: number = 0;
  private lastKey: string = '';
  private readonly DOUBLE_TAP_DELAY = 300; // ms
  private activeToasts: ToastItem[] = [];
  private readonly MAX_TOASTS = 4;

  constructor() {
    this.radialMenu = new RadialMenu();
    this.menuActions = new MenuActions(DEFAULT_CONFIG);
    // Set up flow callbacks for screenshot and other async operations
    this.menuActions.setFlowCallbacks({
      onToast: (message, type) => this.showToast(message, type),
    });
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadConfig();
    this.setupKeyboardShortcut();
    this.setupMessageListener();
    this.setupStorageListener();
    console.log('The Circle: Initialized');
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await getStorageData();
      this.config = data.config;
      this.menuActions.setConfig(data.config);
      this.selectionMenuItems = data.selectionMenuItems;
      this.globalMenuItems = data.globalMenuItems;
    } catch (error) {
      console.error('The Circle: Failed to load config', error);
    }
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.thecircle_config) {
        this.config = { ...this.config, ...changes.thecircle_config.newValue };
        this.menuActions.setConfig(this.config);
      }
    });
  }

  private setupKeyboardShortcut(): void {
    const pressedKeys = new Set<string>();

    document.addEventListener('keydown', (e) => {
      pressedKeys.add(e.key);

      // Check for double-tap shortcut (format: "Double+KeyName")
      if (this.config.shortcut.startsWith('Double+')) {
        const targetKey = this.config.shortcut.slice(7); // Remove "Double+" prefix
        if (this.matchDoubleTapKey(e.key, targetKey)) {
          const now = Date.now();
          if (this.lastKey === e.key && (now - this.lastKeyTime) < this.DOUBLE_TAP_DELAY) {
            e.preventDefault();
            this.showMenu();
            this.lastKeyTime = 0; // Reset to prevent triple-tap triggering
            this.lastKey = '';
          } else {
            this.lastKeyTime = now;
            this.lastKey = e.key;
          }
        }
      } else if (this.matchShortcut(e, this.config.shortcut)) {
        e.preventDefault();
        this.showMenu();
      }
    });

    document.addEventListener('keyup', (e) => {
      pressedKeys.delete(e.key);
    });

    // Clear pressed keys when window loses focus
    window.addEventListener('blur', () => {
      pressedKeys.clear();
    });
  }

  private matchDoubleTapKey(pressedKey: string, targetKey: string): boolean {
    // Handle special key names
    const keyMap: Record<string, string[]> = {
      'Control': ['Control', 'ControlLeft', 'ControlRight'],
      'Shift': ['Shift', 'ShiftLeft', 'ShiftRight'],
      'Alt': ['Alt', 'AltLeft', 'AltRight'],
      'Meta': ['Meta', 'MetaLeft', 'MetaRight'],
      'Space': [' ', 'Space'],
      'Tab': ['Tab'],
    };

    const validKeys = keyMap[targetKey] || [targetKey];
    return validKeys.includes(pressedKey) || pressedKey.toLowerCase() === targetKey.toLowerCase();
  }

  private matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
    const parts = shortcut.split('+');
    const key = parts[parts.length - 1];

    const needCtrl = parts.includes('Ctrl');
    const needAlt = parts.includes('Alt');
    const needShift = parts.includes('Shift');

    const keyMatch = key === 'Space' ? e.key === ' ' : e.key.toUpperCase() === key.toUpperCase();

    return keyMatch &&
           (e.ctrlKey || e.metaKey) === needCtrl &&
           e.altKey === needAlt &&
           e.shiftKey === needShift;
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'TOGGLE_MENU') {
        this.showMenu();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private showMenu(): void {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';

    let x: number;
    let y: number;
    let selectionRect: DOMRect | null = null;

    // If text is selected, get position from selection
    if (selectedText && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      selectionRect = range.getBoundingClientRect();
      // Position menu below the selected text
      x = selectionRect.left + selectionRect.width / 2;
      y = selectionRect.bottom + 20;

      // Ensure menu stays within viewport
      if (y + 200 > window.innerHeight) {
        y = selectionRect.top - 20;
      }
      if (x < 150) x = 150;
      if (x > window.innerWidth - 150) x = window.innerWidth - 150;
    } else {
      // No selection, center in viewport
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    }

    // Choose menu based on whether text is selected
    const menuItems = selectedText ? this.selectionMenuItems : this.globalMenuItems;
    this.menuActions.setSelectedText(selectedText);

    // Pass selection info to RadialMenu for result panel positioning
    this.radialMenu.setSelectionInfo(selectedText ? selectionRect : null);

    this.radialMenu.show(x, y, menuItems, async (item) => {
      await this.handleMenuAction(item);
    });
  }

  private async handleMenuAction(item: MenuItem): Promise<void> {
    // Show loading for AI actions
    const aiActions = ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'];

    if (aiActions.includes(item.action)) {
      this.radialMenu.showResult(item.label, '', true);

      // Create streaming callback for typewriter effect
      const onChunk = this.config.useStreaming
        ? (chunk: string, fullText: string) => {
            this.radialMenu.streamUpdate(chunk, fullText);
          }
        : undefined;

      const result = await this.menuActions.execute(item, onChunk);

      if (result.type === 'error') {
        this.radialMenu.showResult('错误', result.result || '未知错误');
      }
      // If streaming was used, the result is already displayed
      // If not streaming, update with final result
      else if (!this.config.useStreaming && result.type === 'ai') {
        this.radialMenu.updateResult(result.result || '');
      }
    } else {
      const result = await this.menuActions.execute(item);

      if (result.type === 'error') {
        this.showToast(result.result || '未知错误', 'error');
      } else if (result.type === 'success') {
        this.showToast(result.result || '操作成功', 'success');
      } else if (result.type === 'info') {
        this.showToast(result.result || '', 'info');
      }
      // 'silent' and 'redirect' types don't show toast
    }
  }

  private getToastIcon(type: ToastType): string {
    const icons: Record<ToastType, string> = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`,
    };
    return icons[type];
  }

  private showToast(message: string, type: ToastType = 'info'): void {
    // Remove oldest toast if we've reached the limit
    if (this.activeToasts.length >= this.MAX_TOASTS) {
      const oldest = this.activeToasts.shift();
      if (oldest) {
        clearTimeout(oldest.timeoutId);
        oldest.element.remove();
      }
    }

    const toast = document.createElement('div');
    toast.className = `thecircle-toast thecircle-toast-${type}`;
    toast.innerHTML = `
      <span class="thecircle-toast-icon">${this.getToastIcon(type)}</span>
      <span class="thecircle-toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Update positions of all toasts
    this.updateToastPositions();

    // Create timeout for removal
    const timeoutId = window.setTimeout(() => {
      this.removeToast(toast);
    }, 2000);

    this.activeToasts.push({ element: toast, timeoutId });
  }

  private updateToastPositions(): void {
    this.activeToasts.forEach((item, index) => {
      item.element.setAttribute('data-index', String(index));
    });
  }

  private removeToast(toastElement: HTMLElement): void {
    const index = this.activeToasts.findIndex(item => item.element === toastElement);

    if (index !== -1) {
      const item = this.activeToasts[index];
      clearTimeout(item.timeoutId);
      this.activeToasts.splice(index, 1);

      toastElement.classList.add('thecircle-toast-exit');
      setTimeout(() => {
        toastElement.remove();
        this.updateToastPositions();
      }, 200);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TheCircle());
} else {
  new TheCircle();
}
