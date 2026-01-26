import { RadialMenu } from './RadialMenu';
import { MenuActions } from './MenuActions';
import { ResultPanel } from './ResultPanel';
import { SelectionPopover, PopoverPosition } from './SelectionPopover';
import { MenuItem, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig } from '../types';
import { getStorageData } from '../utils/storage';
import { abortAllRequests } from '../utils/ai';
import { getShadowRoot, loadStyles, appendToShadow, removeFromShadow, getShadowHost } from './ShadowHost';
import './styles.css';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  element: HTMLElement;
  timeoutId: number;
}

class TheCircle {
  private radialMenu: RadialMenu;
  private menuActions: MenuActions;
  private selectionPopover: SelectionPopover;
  private selectionMenuItems: MenuItem[] = DEFAULT_SELECTION_MENU;
  private globalMenuItems: MenuItem[] = DEFAULT_GLOBAL_MENU;
  private config: MenuConfig = DEFAULT_CONFIG;
  private lastKeyTime: number = 0;
  private lastKey: string = '';
  private readonly DOUBLE_TAP_DELAY = 300; // ms
  private activeToasts: ToastItem[] = [];
  private readonly MAX_TOASTS = 4;
  private currentSelectedText: string = '';
  private resultPanels: Set<ResultPanel> = new Set();

  constructor() {
    this.radialMenu = new RadialMenu();
    this.menuActions = new MenuActions(DEFAULT_CONFIG);
    this.selectionPopover = new SelectionPopover();
    // Set up flow callbacks for screenshot and other async operations
    this.menuActions.setFlowCallbacks({
      onToast: (message, type) => this.showToast(message, type),
    });

    this.radialMenu.setOnClose(() => {
      // Ensure popover is hidden when result panel closes
      this.selectionPopover.hide();
    });

    this.init();
  }

  private async init(): Promise<void> {
    // Initialize Shadow DOM and load styles
    getShadowRoot();
    
    try {
      const cssUrl = chrome.runtime.getURL('assets/content.css');
      const response = await fetch(cssUrl);
      const cssText = await response.text();
      loadStyles(cssText);
    } catch (error) {
      console.error('The Circle: Failed to load styles', error);
    }

    await this.loadConfig();
    this.setupKeyboardShortcut();
    this.setupMessageListener();
    this.setupStorageListener();
    this.setupSelectionListener();
    console.log('The Circle: Initialized with Shadow DOM');
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await getStorageData();
      this.config = data.config;
      this.menuActions.setConfig(data.config);
      this.selectionMenuItems = data.selectionMenuItems;
      this.globalMenuItems = data.globalMenuItems;
      
      // Apply the loaded theme
      this.applyTheme(this.config.theme);
    } catch (error) {
      console.error('The Circle: Failed to load config', error);
    }
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.thecircle_config) {
        this.config = { ...this.config, ...changes.thecircle_config.newValue };
        this.menuActions.setConfig(this.config);
        this.applyTheme(this.config.theme);
      }
    });
  }

  private applyTheme(theme: 'dark' | 'light' | 'system'): void {
    const host = getShadowHost();
    const container = host.shadowRoot?.getElementById('thecircle-container');
    
    console.log('The Circle: Applying theme:', theme);

    // Remove existing theme classes from both host and container
    const removeClasses = ['dark', 'light'];
    host.classList.remove(...removeClasses);
    container?.classList.remove(...removeClasses);

    if (theme === 'dark') {
      host.classList.add('dark');
      container?.classList.add('dark');
    } else if (theme === 'light') {
      host.classList.add('light');
      container?.classList.add('light');
    } else if (theme === 'system') {
      // Check system preference
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const updateSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
        // Remove classes first to avoid conflicts
        host.classList.remove(...removeClasses);
        container?.classList.remove(...removeClasses);
        
        if (e.matches) {
          host.classList.add('dark');
          container?.classList.add('dark');
        } else {
          host.classList.add('light');
          container?.classList.add('light');
        }
      };

      // Initial check
      updateSystemTheme(darkModeQuery);

      // Listen for changes
      // Note: We might want to store this listener to remove it later if theme changes away from 'system'
      // But for simplicity in this context, adding a new one is acceptable as applyTheme cleans classes.
      // A more robust solution would track the listener.
      darkModeQuery.onchange = updateSystemTheme;
    }
  }

  private setupSelectionListener(): void {
    let selectionTimeout: number | null = null;

    document.addEventListener('mouseup', (e) => {
      // Ignore if clicking on our UI elements
      const path = e.composedPath() as HTMLElement[];
      for (const el of path) {
        if (el instanceof HTMLElement) {
          if (el.classList?.contains('thecircle-selection-popover') ||
              el.classList?.contains('thecircle-result-panel') ||
              el.classList?.contains('thecircle-menu') ||
              el.classList?.contains('thecircle-toast')) {
            return;
          }
        }
      }

      // Clear any pending timeout
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
      }

      // Small delay to let selection finalize
      selectionTimeout = window.setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() || '';

        if (selectedText && selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Store selected text for later use
          this.currentSelectedText = selectedText;

          // Get popover position from config (default to 'above')
          const position: PopoverPosition = this.config.popoverPosition || 'above';

          // Show the selection popover
          this.selectionPopover.show(rect, {
            onTranslate: () => this.handleSelectionTranslate(),
          }, position);
        } else {
          // No selection, hide popover
          this.selectionPopover.hide();
          this.currentSelectedText = '';
        }
      }, 10);
    });

    // Hide popover when clicking elsewhere (but not on our UI elements)
    document.addEventListener('mousedown', (e) => {
      const path = e.composedPath() as HTMLElement[];
      for (const el of path) {
        if (el instanceof HTMLElement) {
          if (el.classList?.contains('thecircle-selection-popover') ||
              el.classList?.contains('thecircle-result-panel') ||
              el.classList?.contains('thecircle-menu') ||
              el.classList?.contains('thecircle-toast')) {
            return;
          }
        }
      }

      // Only hide if there's no ongoing selection
      if (!window.getSelection()?.toString().trim()) {
        this.selectionPopover.hide();
      }
    });
  }

  private async handleSelectionTranslate(): Promise<void> {
    if (!this.currentSelectedText) return;

    // Find the translate menu item from selection menu
    const translateItem = this.selectionMenuItems.find(item => item.action === 'translate');
    if (!translateItem) {
      this.showToast('翻译功能未配置', 'error');
      return;
    }

    // Hide the selection popover immediately
    this.selectionPopover.hide();

    // Set the selected text for menu actions
    this.menuActions.setSelectedText(this.currentSelectedText);

    // Show the radial menu result panel for AI response
    const selection = window.getSelection();
    let selectionRect: DOMRect | null = null;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      selectionRect = range.getBoundingClientRect();
    }

    // Create a new ResultPanel
    const resultPanel = new ResultPanel();
    this.resultPanels.add(resultPanel);
    
    resultPanel.setOnClose(() => {
        this.resultPanels.delete(resultPanel);
    });
    resultPanel.setOnStop(() => abortAllRequests());

    const originalText = this.currentSelectedText;
    let translateRunId = 0;

    const runTranslate = async (targetLang: string) => {
      const runId = ++translateRunId;
      this.menuActions.setSelectedText(originalText);

      resultPanel.show(translateItem.label, '', {
        isLoading: true,
        originalText,
        type: 'translate',
        selectionRect: selectionRect,
        iconHtml: translateItem.icon,
        translateTargetLanguage: targetLang,
      });

      const onChunk = this.config.useStreaming
        ? (chunk: string, fullText: string) => {
            if (runId !== translateRunId) return;
            resultPanel.streamUpdate(chunk, fullText);
          }
        : undefined;

      const result = await this.menuActions.execute(translateItem, onChunk, {
        translateTargetLanguage: targetLang,
      });

      if (runId !== translateRunId) return;

      if (result.type === 'error') {
        resultPanel.show('错误', result.result || '未知错误', { isLoading: false });
      } else if (result.type === 'ai') {
        resultPanel.update(result.result || '');
      }
    };

    resultPanel.setOnTranslateLanguageChange((targetLang) => {
      void runTranslate(targetLang);
    });

    await runTranslate(this.config.preferredLanguage || 'zh-CN');
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
    if (!e.key) return false;

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
    // Hide selection popover when opening radial menu
    this.selectionPopover.hide();

    // Always use global menu items (selection-based actions now handled by popover)
    const menuItems = this.globalMenuItems;

    // Center in viewport
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;

    this.radialMenu.show(x, y, menuItems, async (item) => {
      await this.handleMenuAction(item);
    });
  }

  private async handleMenuAction(item: MenuItem): Promise<void> {
    // Show loading for AI actions
    const aiActions = ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage', 'askPage', 'rewritePage'];

    if (aiActions.includes(item.action)) {
      const resultPanel = new ResultPanel();
      this.resultPanels.add(resultPanel);
      
      resultPanel.setOnClose(() => {
        this.resultPanels.delete(resultPanel);
      });
      resultPanel.setOnStop(() => abortAllRequests());

      // Try to get selection rect for positioning
      const selection = window.getSelection();
      let selectionRect: DOMRect | null = null;
      if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
        try {
          const range = selection.getRangeAt(0);
          selectionRect = range.getBoundingClientRect();
        } catch (e) {
          // ignore
        }
      }

      const originalText = this.currentSelectedText || window.getSelection()?.toString() || '';

      if (item.action === 'translate') {
        let translateRunId = 0;

        const runTranslate = async (targetLang: string) => {
          const runId = ++translateRunId;
          this.menuActions.setSelectedText(originalText);

          resultPanel.show(item.label, '', {
            isLoading: true,
            originalText,
            type: 'translate',
            selectionRect: selectionRect,
            iconHtml: item.icon,
            translateTargetLanguage: targetLang,
          });

          const onChunk = this.config.useStreaming
            ? (chunk: string, fullText: string) => {
                if (runId !== translateRunId) return;
                resultPanel.streamUpdate(chunk, fullText);
              }
            : undefined;

          const result = await this.menuActions.execute(item, onChunk, {
            translateTargetLanguage: targetLang,
          });

          if (runId !== translateRunId) return;

          if (result.type === 'error') {
            resultPanel.show('错误', result.result || '未知错误', { isLoading: false });
          } else if (result.type === 'ai') {
            resultPanel.update(result.result || '');
          }
        };

        resultPanel.setOnTranslateLanguageChange((targetLang) => {
          void runTranslate(targetLang);
        });

        await runTranslate(this.config.preferredLanguage || 'zh-CN');
      } else {
        this.menuActions.setSelectedText(originalText);

        if (item.action === 'askPage') {
          resultPanel.show(item.label, '', {
            isLoading: false,
            originalText: '',
            type: 'general',
            selectionRect: selectionRect,
            iconHtml: item.icon,
          });

          const contentEl = resultPanel.getContentElement();
          if (contentEl) {
            contentEl.innerHTML = `
              <div class="thecircle-screenshot-input-area">
                <input type="text" class="thecircle-screenshot-input" placeholder="输入你想问当前页面的问题…" />
                <div class="thecircle-screenshot-input-actions">
                  <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="cancel">取消</button>
                  <button class="thecircle-screenshot-btn thecircle-screenshot-btn-primary" data-action="submit">提交</button>
                </div>
              </div>
            `;

            const inputEl = contentEl.querySelector('input') as HTMLInputElement | null;
            const cancelBtn = contentEl.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
            const submitBtn = contentEl.querySelector('[data-action="submit"]') as HTMLButtonElement | null;

            cancelBtn?.addEventListener('click', () => {
              resultPanel.hide();
            });

            let runId = 0;
            const runAsk = async () => {
              const question = inputEl?.value.trim() || '';
              if (!question) {
                this.showToast('请输入问题', 'error');
                return;
              }

              const currentRun = ++runId;
              resultPanel.show(item.label, '', {
                isLoading: true,
                originalText: question,
                type: 'general',
                selectionRect: selectionRect,
                iconHtml: item.icon,
              });

              const onChunk = this.config.useStreaming
                ? (_chunk: string, fullText: string) => {
                    if (currentRun !== runId) return;
                    resultPanel.streamUpdate('', fullText);
                  }
                : undefined;

              const result = await this.menuActions.execute(item, onChunk, { pageQuestion: question });
              if (currentRun !== runId) return;

              if (result.type === 'error') {
                resultPanel.show('错误', result.result || '未知错误', { isLoading: false });
              } else if (result.type === 'ai') {
                resultPanel.update(result.result || '');
              }
            };

            submitBtn?.addEventListener('click', () => {
              void runAsk();
            });

            inputEl?.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runAsk();
              }
            });

            setTimeout(() => inputEl?.focus(), 0);
          }
        } else if (item.action === 'rewritePage') {
          const hasSelection = !!originalText.trim();
          const defaultUseSelection = hasSelection;

          resultPanel.show(item.label, '', {
            isLoading: false,
            originalText: '',
            type: 'general',
            selectionRect: selectionRect,
            iconHtml: item.icon,
          });

          const contentEl = resultPanel.getContentElement();
          if (contentEl) {
            contentEl.innerHTML = `
              <div class="thecircle-screenshot-input-area">
                <input type="text" class="thecircle-screenshot-input" placeholder="改写要求（可选，例如：更口语/更正式/更短/更长）" />
                ${hasSelection ? `
                  <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;opacity:.9;">
                    <input type="checkbox" data-action="use-selection" ${defaultUseSelection ? 'checked' : ''} />
                    优先改写选中内容（否则改写整页内容）
                  </label>
                ` : ''}
                <div class="thecircle-screenshot-input-actions">
                  <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="cancel">取消</button>
                  <button class="thecircle-screenshot-btn thecircle-screenshot-btn-primary" data-action="submit">开始改写</button>
                </div>
              </div>
            `;

            const inputEl = contentEl.querySelector('input.thecircle-screenshot-input') as HTMLInputElement | null;
            const useSelectionEl = contentEl.querySelector('[data-action="use-selection"]') as HTMLInputElement | null;
            const cancelBtn = contentEl.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
            const submitBtn = contentEl.querySelector('[data-action="submit"]') as HTMLButtonElement | null;

            cancelBtn?.addEventListener('click', () => {
              resultPanel.hide();
            });

            let runId = 0;
            const runRewrite = async () => {
              const instruction = inputEl?.value.trim() || '';
              const currentRun = ++runId;

              resultPanel.show(item.label, '', {
                isLoading: true,
                originalText: instruction || (hasSelection && (useSelectionEl?.checked ?? defaultUseSelection) ? originalText : document.title),
                type: 'general',
                selectionRect: selectionRect,
                iconHtml: item.icon,
              });

              const onChunk = this.config.useStreaming
                ? (_chunk: string, fullText: string) => {
                    if (currentRun !== runId) return;
                    resultPanel.streamUpdate('', fullText);
                  }
                : undefined;

              const result = await this.menuActions.execute(item, onChunk, {
                rewriteInstruction: instruction,
                rewriteUseSelection: hasSelection ? (useSelectionEl?.checked ?? defaultUseSelection) : false,
              });

              if (currentRun !== runId) return;

              if (result.type === 'error') {
                resultPanel.show('错误', result.result || '未知错误', { isLoading: false });
              } else if (result.type === 'ai') {
                resultPanel.update(result.result || '');
              }
            };

            submitBtn?.addEventListener('click', () => {
              void runRewrite();
            });

            inputEl?.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runRewrite();
              }
            });

            setTimeout(() => inputEl?.focus(), 0);
          }
        } else {
          resultPanel.show(item.label, '', {
            isLoading: true,
            originalText,
            type: 'general',
            selectionRect: selectionRect,
            iconHtml: item.icon,
          });

          const onChunk = this.config.useStreaming
            ? (chunk: string, fullText: string) => {
                resultPanel.streamUpdate(chunk, fullText);
              }
            : undefined;

          const result = await this.menuActions.execute(item, onChunk);

          if (result.type === 'error') {
            resultPanel.show('错误', result.result || '未知错误', { isLoading: false });
          } else if (result.type === 'ai') {
            resultPanel.update(result.result || '');
          }
        }
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
    const toast = document.createElement('div');
    const typeClasses = {
      success: 'thecircle-toast-success',
      error: 'thecircle-toast-error',
      warning: 'thecircle-toast-warning',
      info: 'thecircle-toast-info'
    }[type];

    toast.className = `thecircle-toast ${typeClasses}`;

    // Limit active toasts
    if (this.activeToasts.length >= this.MAX_TOASTS) {
      const oldest = this.activeToasts.shift();
      if (oldest) {
        clearTimeout(oldest.timeoutId);
        removeFromShadow(oldest.element);
      }
    }

    // Set position based on stack
    const index = this.activeToasts.length;
    toast.style.bottom = `${24 + index * 50}px`;
    toast.setAttribute('data-index', String(index));

    const iconEl = document.createElement('div');
    iconEl.className = 'thecircle-toast-icon';

    iconEl.innerHTML = this.getToastIcon(type);

    const textEl = document.createElement('span');
    textEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(textEl);

    appendToShadow(toast);

    const timeoutId = window.setTimeout(() => {
      toast.classList.add('animate-[thecircle-toast-out_0.2s_ease-out_forwards]', 'thecircle-toast-exit');
      setTimeout(() => {
        removeFromShadow(toast);
        this.activeToasts = this.activeToasts.filter(t => t.element !== toast);
      }, 200);
    }, 3000);

    this.activeToasts.push({ element: toast, timeoutId });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TheCircle());
} else {
  new TheCircle();
}
