import { CommandPalette } from './CommandPalette';
import { MenuActions } from './MenuActions';
import { SelectionPopover, PopoverPosition } from './SelectionPopover';
import { TrailRecorder } from './BrowseTrailPanel';
import { AnnotationSystem } from './annotation';
import { AnnotationColor, AnnotationAIResult, AIResultType } from '../types/annotation';
import { MenuItem, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig } from '../types';
import { getStorageData } from '../utils/storage';
import { abortAllRequests } from '../utils/ai';
import { getShadowRoot, loadStyles, appendToShadow, removeFromShadow, getShadowHost } from './ShadowHost';
import './styles.css';

interface ToastItem {
  element: HTMLElement;
  timeoutId: number;
}

class TheCircle {
  private commandPalette: CommandPalette;
  private menuActions: MenuActions;
  private selectionPopover: SelectionPopover;
  private trailRecorder: TrailRecorder;
  private annotationSystem: AnnotationSystem;
  private selectionMenuItems: MenuItem[] = DEFAULT_SELECTION_MENU;
  private globalMenuItems: MenuItem[] = DEFAULT_GLOBAL_MENU;
  private config: MenuConfig = DEFAULT_CONFIG;
  private lastKeyTime: number = 0;
  private lastKey: string = '';
  private readonly DOUBLE_TAP_DELAY = 300; // ms
  private activeToasts: ToastItem[] = [];
  private readonly MAX_TOASTS = 4;
  private currentSelectedText: string = '';

  constructor() {
    this.commandPalette = new CommandPalette(DEFAULT_CONFIG);
    this.menuActions = new MenuActions(DEFAULT_CONFIG);
    this.selectionPopover = new SelectionPopover();
    this.trailRecorder = new TrailRecorder();
    this.annotationSystem = new AnnotationSystem();
    // Set up flow callbacks for screenshot and other async operations
    this.menuActions.setFlowCallbacks({
      onToast: (message) => this.showToast(message),
    });
    this.menuActions.setCommandPalette(this.commandPalette);

    // Set up annotation system callbacks
    this.annotationSystem.setCallbacks({
      onToast: (message) => this.showToast(message),
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
      console.error('The Panel: Failed to load styles', error);
    }

    await this.loadConfig();
    this.setupKeyboardShortcut();
    this.setupMessageListener();
    this.setupStorageListener();
    this.setupSelectionListener();

    // Initialize annotation system (restore highlights)
    await this.annotationSystem.init();

    console.log('The Panel: Initialized with Command Palette');
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await getStorageData();
      this.config = data.config;
      this.menuActions.setConfig(data.config);
      this.commandPalette.setConfig(data.config);
      this.selectionMenuItems = data.selectionMenuItems;
      this.globalMenuItems = data.globalMenuItems;

      // Apply the loaded theme
      this.applyTheme(this.config.theme);
    } catch (error) {
      console.error('The Panel: Failed to load config', error);
    }
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.thecircle_data) {
        const newData = changes.thecircle_data.newValue;
        if (newData?.config) {
          this.config = newData.config;
          this.menuActions.setConfig(this.config);
          this.commandPalette.setConfig(this.config);
          this.applyTheme(this.config.theme);
        }
      }
      // Listen for saved tasks changes to enable cross-tab sync
      if (changes.thecircle_saved_tasks) {
        this.commandPalette.loadRecentSavedTasks();
      }
    });
  }

  private applyTheme(theme: 'dark' | 'light' | 'system'): void {
    const host = getShadowHost();
    const container = host.shadowRoot?.getElementById('thecircle-container');

    console.log('The Panel: Applying theme:', theme);

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
              el.classList?.contains('thecircle-palette') ||
              el.classList?.contains('thecircle-toast') ||
              el.classList?.contains('thecircle-note-popup') ||
              el.classList?.contains('thecircle-highlight')) {
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
          // Store selected text for later use
          this.currentSelectedText = selectedText;

          // Check if popover is enabled (default: true)
          if (this.config.showSelectionPopover === false) return;

          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Get popover position from config (default to 'above')
          const position: PopoverPosition = this.config.popoverPosition || 'above';

          // Show the selection popover with annotation callbacks
          this.selectionPopover.show(rect, {
            onTranslate: () => this.handleSelectionTranslate(),
            onHighlight: (color: AnnotationColor) => this.handleSelectionHighlight(color),
            onNote: () => this.handleSelectionNote(),
            onMore: () => this.handleSelectionMore(),
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
              el.classList?.contains('thecircle-palette') ||
              el.classList?.contains('thecircle-toast') ||
              el.classList?.contains('thecircle-note-popup') ||
              el.classList?.contains('thecircle-highlight')) {
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

  private async handleSelectionHighlight(color: AnnotationColor): Promise<void> {
    await this.annotationSystem.createHighlight(color);
  }

  private async handleSelectionNote(): Promise<void> {
    await this.annotationSystem.createHighlightWithNote();
  }

  private async handleSaveToAnnotation(
    originalText: string,
    content: string,
    thinking?: string,
    actionType?: string
  ): Promise<void> {
    // Map action type to AI result type
    const typeMap: Record<string, AIResultType> = {
      translate: 'translate',
      explain: 'explain',
      summarize: 'summarize',
      rewrite: 'rewrite',
    };

    const aiResult: AnnotationAIResult = {
      type: typeMap[actionType || ''] || 'translate',
      content,
      thinking,
      createdAt: Date.now(),
    };

    // Try to create a highlight with the original text selected
    // First, try to find and select the original text on the page
    const found = this.findAndSelectText(originalText);
    if (found) {
      await this.annotationSystem.createHighlightWithAI('yellow', aiResult);
    } else {
      this.showToast('无法定位原文，请手动选择文本');
    }
  }

  private findAndSelectText(text: string): boolean {
    // Try to find the text on the page and select it
    const trimmedText = text.trim().substring(0, 100); // Use first 100 chars for matching

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const nodeText = node.textContent || '';
      const index = nodeText.indexOf(trimmedText);
      if (index !== -1) {
        // Found the text, create a selection
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, Math.min(index + text.length, nodeText.length));

        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        }
      }
    }
    return false;
  }

  private handleSelectionMore(): void {
    // Show the command palette with selection menu items
    this.showMenu();
  }

  private async handleSelectionTranslate(): Promise<void> {
    if (!this.currentSelectedText) return;

    // Find the translate menu item from selection menu
    const translateItem = this.selectionMenuItems.find(item => item.action === 'translate');
    if (!translateItem) {
      this.showToast('翻译功能未配置');
      return;
    }

    // Hide the selection popover immediately
    this.selectionPopover.hide();

    // Set the selected text for menu actions
    this.menuActions.setSelectedText(this.currentSelectedText);

    const originalText = this.currentSelectedText;
    let translateRunId = 0;

    const runTranslate = async (targetLang: string) => {
      const runId = ++translateRunId;
      this.menuActions.setSelectedText(originalText);

      const onChunk = this.config.useStreaming
        ? (chunk: string, fullText: string, thinking?: string) => {
            if (runId !== translateRunId) return;
            this.commandPalette.streamUpdate(chunk, fullText, thinking);
          }
        : undefined;

      const result = await this.menuActions.execute(translateItem, onChunk, {
        translateTargetLanguage: targetLang,
      });

      if (runId !== translateRunId) return;

      if (result.type === 'error') {
        this.commandPalette.updateAIResult(result.result || '未知错误');
      } else if (result.type === 'ai') {
        this.commandPalette.updateAIResult(result.result || '', result.thinking);
      }
    };

    // Set active command and show AI result in command palette
    this.commandPalette.setActiveCommand(translateItem);
    this.commandPalette.showAIResult(translateItem.label, {
      onStop: () => abortAllRequests(),
      onTranslateLanguageChange: (targetLang) => {
        void runTranslate(targetLang);
      },
      onSaveToAnnotation: (originalText, content, thinking, actionType) => {
        void this.handleSaveToAnnotation(originalText, content, thinking, actionType);
      },
    }, {
      originalText,
      resultType: 'translate',
      translateTargetLanguage: this.config.preferredLanguage || 'zh-CN',
      iconHtml: translateItem.icon,
      actionType: 'translate',
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
      } else if (message.type === 'OPEN_SETTINGS') {
        this.openSettings();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private openSettings(): void {
    // Hide selection popover when opening settings
    this.selectionPopover.hide();

    // Show command palette and navigate to settings
    if (!this.commandPalette.isVisible()) {
      this.commandPalette.show(this.globalMenuItems, {
        onSelect: async (item) => {
          await this.handleMenuAction(item);
        },
        onClose: () => {
          // Cleanup if needed
        },
      });
    }
    // Navigate to settings view
    this.commandPalette.loadSettingsMenuItems().then(() => {
      this.commandPalette.showSettings();
    });
  }

  private showMenu(): void {
    // Hide selection popover when opening command palette
    this.selectionPopover.hide();

    // If already visible, hide it (toggle behavior)
    if (this.commandPalette.isVisible()) {
      this.commandPalette.hide();
      return;
    }

    // Show command palette with global menu items
    this.commandPalette.show(this.globalMenuItems, {
      onSelect: async (item) => {
        await this.handleMenuAction(item);
      },
      onClose: () => {
        // Cleanup if needed
      },
    });
  }

  private async handleMenuAction(item: MenuItem): Promise<void> {
    // Handle settings action specially - show settings in command palette
    if (item.action === 'settings') {
      await this.commandPalette.loadSettingsMenuItems();
      this.commandPalette.showSettings();
      return;
    }

    // Handle annotations action - show annotations view in command palette
    if (item.action === 'annotations') {
      await this.commandPalette.showAnnotations({
        onScrollToAnnotation: (id) => this.annotationSystem.scrollToAnnotation(id),
      });
      return;
    }

    // Handle knowledge action - show knowledge base view in command palette
    if (item.action === 'knowledge') {
      await this.commandPalette.showKnowledge();
      return;
    }

    // Show loading for AI actions
    const aiActions = ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'];

    if (aiActions.includes(item.action)) {
      const originalText = this.currentSelectedText || window.getSelection()?.toString() || '';

      if (item.action === 'translate') {
        let translateRunId = 0;

        const runTranslate = async (targetLang: string) => {
          const runId = ++translateRunId;
          this.menuActions.setSelectedText(originalText);

          const onChunk = this.config.useStreaming
            ? (chunk: string, fullText: string, thinking?: string) => {
                if (runId !== translateRunId) return;
                this.commandPalette.streamUpdate(chunk, fullText, thinking);
              }
            : undefined;

          const result = await this.menuActions.execute(item, onChunk, {
            translateTargetLanguage: targetLang,
          });

          if (runId !== translateRunId) return;

          if (result.type === 'error') {
            this.commandPalette.updateAIResult(result.result || '未知错误');
          } else if (result.type === 'ai') {
            this.commandPalette.updateAIResult(result.result || '', result.thinking);
          }
        };

        // Set active command and show AI result in command palette
        this.commandPalette.setActiveCommand(item);
        this.commandPalette.showAIResult(item.label, {
          onStop: () => abortAllRequests(),
          onTranslateLanguageChange: (targetLang) => {
            void runTranslate(targetLang);
          },
          onSaveToAnnotation: (originalText, content, thinking, actionType) => {
            void this.handleSaveToAnnotation(originalText, content, thinking, actionType);
          },
        }, {
          originalText,
          resultType: 'translate',
          translateTargetLanguage: this.config.preferredLanguage || 'zh-CN',
          iconHtml: item.icon,
          actionType: 'translate',
        });

        await runTranslate(this.config.preferredLanguage || 'zh-CN');
      } else {
        this.menuActions.setSelectedText(originalText);

        // Determine action type for metadata
        const actionType = item.action;

        // Create refresh handler for page actions
        const onRefresh = actionType === 'summarizePage' ? async () => {
          // Reset content and start new request
          this.commandPalette.setActiveCommand(item);
          this.commandPalette.showAIResult(item.label, {
            onStop: () => abortAllRequests(),
            onRefresh,
          }, {
            originalText,
            resultType: 'general',
            iconHtml: item.icon,
            actionType,
            sourceUrl: window.location.href,
            sourceTitle: document.title,
          });

          const onChunk = this.config.useStreaming
            ? (chunk: string, fullText: string, thinking?: string) => {
                this.commandPalette.streamUpdate(chunk, fullText, thinking);
              }
            : undefined;

          const result = await this.menuActions.execute(item, onChunk);

          if (result.type === 'error') {
            this.commandPalette.updateAIResult(result.result || '未知错误');
          } else if (result.type === 'ai') {
            this.commandPalette.updateAIResult(result.result || '', result.thinking);
          }
        } : undefined;

        // Set active command and show AI result in command palette
        this.commandPalette.setActiveCommand(item);
        const restored = this.commandPalette.showAIResult(item.label, {
          onStop: () => abortAllRequests(),
          onRefresh,
          onSaveToAnnotation: (originalText, content, thinking, actionType) => {
            void this.handleSaveToAnnotation(originalText, content, thinking, actionType);
          },
        }, {
          originalText,
          resultType: 'general',
          iconHtml: item.icon,
          actionType,
          sourceUrl: window.location.href,
          sourceTitle: document.title,
        });

        // If restored existing task, don't start new request
        if (restored) return;

        const onChunk = this.config.useStreaming
          ? (chunk: string, fullText: string, thinking?: string) => {
              this.commandPalette.streamUpdate(chunk, fullText, thinking);
            }
          : undefined;

        const result = await this.menuActions.execute(item, onChunk);

        if (result.type === 'error') {
          this.commandPalette.updateAIResult(result.result || '未知错误');
        } else if (result.type === 'ai') {
          this.commandPalette.updateAIResult(result.result || '', result.thinking);
        }
      }
    } else {
      // Hide command palette for screenshot to allow area selection
      if (item.action === 'screenshot') {
        this.commandPalette.hide();
      }

      const result = await this.menuActions.execute(item);

      if (result.type === 'error') {
        this.showToast(result.result || '未知错误');
      } else if (result.type === 'success') {
        this.showToast(result.result || '操作成功');
      } else if (result.type === 'info') {
        this.showToast(result.result || '');
      }
      // 'silent' and 'redirect' types don't show toast
    }
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'thecircle-toast';

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

    toast.textContent = message;

    appendToShadow(toast);

    const timeoutId = window.setTimeout(() => {
      toast.classList.add('thecircle-toast-exit');
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
