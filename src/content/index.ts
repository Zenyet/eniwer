import { CommandPalette } from './CommandPalette';
import { MenuActions } from './MenuActions';
import { TrailRecorder } from './BrowseTrailPanel';
import { AnnotationSystem } from './annotation';
import { AnnotationColor, AnnotationAIResult, AIResultType } from '../types/annotation';
import { MenuItem, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig } from '../types';
import { getStorageData } from '../utils/storage';
import { abortAllRequests, callAI } from '../utils/ai';
import { initI18n, setLocale, t } from '../i18n';
import { getShadowRoot, loadStyles, appendToShadow, removeFromShadow, getShadowHost } from './ShadowHost';
import { PluginManager } from '../plugins';
import type { PluginContext } from '../plugins';
import {
  BrowseTrailPlugin, AnnotationsPlugin, KnowledgePlugin, ScreenshotPlugin,
  ContextChatPlugin, YouTubePlugin, TranslatePlugin, SummarizePlugin, SelectionPopoverPlugin, ImageSearchPlugin,
  Base64Plugin, CloudSyncPlugin, ChatTOCPlugin,
} from '../plugins/builtin';
import type { KnowledgeItem } from './CommandPalette/views';
import './styles.css';

interface ToastItem {
  element: HTMLElement;
  timeoutId: number;
}

class TheCircle {
  private commandPalette: CommandPalette;
  private menuActions: MenuActions;
  private trailRecorder: TrailRecorder;
  private annotationSystem: AnnotationSystem;
  private pluginManager: PluginManager;
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
    this.trailRecorder = new TrailRecorder();
    this.annotationSystem = new AnnotationSystem();
    this.pluginManager = new PluginManager();

    // Register built-in plugins
    this.pluginManager.register(new BrowseTrailPlugin());
    this.pluginManager.register(new AnnotationsPlugin());
    this.pluginManager.register(new KnowledgePlugin());
    this.pluginManager.register(new ScreenshotPlugin());
    this.pluginManager.register(new ContextChatPlugin());
    this.pluginManager.register(new YouTubePlugin(DEFAULT_CONFIG));
    this.pluginManager.register(new TranslatePlugin());
    this.pluginManager.register(new SummarizePlugin());
    this.pluginManager.register(new SelectionPopoverPlugin());
    this.pluginManager.register(new ImageSearchPlugin());
    this.pluginManager.register(new Base64Plugin());
    this.pluginManager.register(new CloudSyncPlugin());
    this.pluginManager.register(new ChatTOCPlugin());

    // Wire plugin manager into command palette
    this.commandPalette.setPluginManager(this.pluginManager);

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
    await initI18n(this.config.uiLanguage);

    // Apply browse trail exclude patterns from config
    if (this.config.browseTrailExcludePatterns) {
      this.trailRecorder.setExcludePatterns(this.config.browseTrailExcludePatterns);
    }
    this.setupKeyboardShortcut();
    this.setupMessageListener();
    this.setupStorageListener();

    // Register external plugins that were added before init
    if (window.__thePanelPlugins) {
      for (const plugin of window.__thePanelPlugins) {
        this.pluginManager.register(plugin);
      }
    }

    // Activate all registered plugins
    this.pluginManager.activateAll((pluginId) => this.createPluginContext(pluginId));

    // Sync plugin states from config
    if (this.config.pluginStates) {
      this.pluginManager.setPluginStates(this.config.pluginStates);
    }

    // Expose late-registration API for external plugins
    window.__thePanelRegisterPlugin = (plugin) => {
      this.pluginManager.register(plugin);
      try {
        plugin.activate(this.createPluginContext(plugin.id));
      } catch (err) {
        console.error(`[TheCircle] Failed to activate external plugin "${plugin.id}":`, err);
      }
      if (this.config.pluginStates) {
        this.pluginManager.setPluginStates(this.config.pluginStates);
      }
    };

    // Wire annotation scroll callback into the annotations plugin
    const annotationsPlugin = this.pluginManager.getPlugin<AnnotationsPlugin>('annotations');
    if (annotationsPlugin) {
      annotationsPlugin.setScrollToAnnotationCallback((id) => this.annotationSystem.scrollToAnnotation(id));
    }

    // Bridge annotation events from plugins to the annotation system
    this.pluginManager.on('annotation:highlight', (data) => {
      const { color } = data as { color: AnnotationColor };
      void this.annotationSystem.createHighlight(color);
    });
    this.pluginManager.on('annotation:note', (data) => {
      const { defaultColor } = data as { defaultColor?: AnnotationColor };
      void this.annotationSystem.createHighlightWithNote(defaultColor);
    });

    // Bridge quote events from popover to ContextChatPlugin
    const contextChatPlugin = this.pluginManager.getPlugin<ContextChatPlugin>('contextChat');
    if (contextChatPlugin) {
      this.pluginManager.on('contextChat:quote', (data) => {
        const { text } = data as { text: string };
        if (!this.commandPalette.isVisible()) {
          this.showMenu();
        }
        contextChatPlugin.startWithQuote(text);
      });
      this.pluginManager.on('contextChat:quoteAsk', (data) => {
        const { text } = data as { text: string };
        if (!this.commandPalette.isVisible()) {
          this.showMenu();
        }
        contextChatPlugin.startQuickAskWithQuote(text);
      });
    }
    this.pluginManager.on('annotation:saveFromAI', (data) => {
      const { originalText, content, thinking, actionType } = data as {
        originalText: string; content: string; thinking?: string; actionType?: string;
      };
      void this.handleSaveToAnnotation(originalText, content, thinking, actionType);
    });

    // Initialize annotation system (restore highlights)
    await this.annotationSystem.init();

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
          // Update locale if language changed
          if (newData.config.uiLanguage && newData.config.uiLanguage !== this.config.uiLanguage) {
            setLocale(newData.config.uiLanguage);
          }
          this.config = newData.config;
          this.menuActions.setConfig(this.config);
          this.commandPalette.setConfig(this.config);
          this.applyTheme(this.config.theme);
          this.pluginManager.notifyConfigChange(this.config);
          // Update browse trail exclude patterns
          if (this.config.browseTrailExcludePatterns) {
            this.trailRecorder.setExcludePatterns(this.config.browseTrailExcludePatterns);
          }
          // Sync plugin states
          if (this.config.pluginStates) {
            this.pluginManager.setPluginStates(this.config.pluginStates);
          }
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
      await this.annotationSystem.createHighlightWithAI(this.config.annotation?.defaultColor || 'yellow', aiResult);
    } else {
      this.showToast(t('content.cannotLocateOriginalText'));
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
    // Show command palette and navigate to settings
    if (!this.commandPalette.isVisible()) {
      this.commandPalette.show(this.globalMenuItems, {
        onSelect: async (item) => {
          await this.handleMenuAction(item);
        },
        onClose: () => {
          // Cleanup if needed
        },
        onTranslateInput: (text) => {
          this.pluginManager.handleCommand('translateInput', text);
        },
      });
    }
    // Navigate to settings view
    this.commandPalette.loadSettingsMenuItems().then(() => {
      this.commandPalette.showSettings();
    });
  }

  private showMenu(): void {
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
      onTranslateInput: (text) => {
        this.pluginManager.handleCommand('translateInput', text);
      },
    });
  }

  private async handleMenuAction(item: MenuItem): Promise<void> {
    // Let plugins handle the action first
    if (this.pluginManager.handleCommand(item.action, this.currentSelectedText)) {
      return;
    }

    // Handle settings action specially - show settings in command palette
    if (item.action === 'settings') {
      await this.commandPalette.loadSettingsMenuItems();
      this.commandPalette.showSettings();
      return;
    }

    // Show loading for AI actions (translate/summarize/summarizePage handled by plugins above)
    const aiActions = ['explain', 'rewrite', 'codeExplain'];

    if (aiActions.includes(item.action)) {
      const originalText = this.currentSelectedText || window.getSelection()?.toString() || '';
      this.menuActions.setSelectedText(originalText);

      const actionType = item.action;

      // Set active command and show AI result in command palette
      this.commandPalette.setActiveCommand(item);
      const restored = this.commandPalette.showAIResult(item.label, {
        onStop: () => abortAllRequests(),
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

      const streamKey = this.commandPalette.getCurrentStreamKey();
      if (restored) return;

      const onChunk = this.config.useStreaming
        ? (chunk: string, fullText: string, thinking?: string) => {
            this.commandPalette.streamUpdate(chunk, fullText, thinking, streamKey || undefined);
          }
        : undefined;

      const result = await this.menuActions.execute(item, onChunk);

      if (result.type === 'error') {
        this.commandPalette.updateAIResult(result.result || t('content.unknownError'), undefined, streamKey || undefined);
      } else if (result.type === 'ai') {
        this.commandPalette.updateAIResult(result.result || '', result.thinking, streamKey || undefined, result.usage);
      }
    } else {
      // Hide command palette for screenshot to allow area selection
      if (item.action === 'screenshot') {
        this.commandPalette.hide();
      }

      const result = await this.menuActions.execute(item);

      if (result.type === 'error') {
        this.showToast(result.result || t('content.unknownError'));
      } else if (result.type === 'success') {
        this.showToast(result.result || t('content.operationSuccess'));
      } else if (result.type === 'info') {
        this.showToast(result.result || '');
      }
      // 'silent' and 'redirect' types don't show toast
    }
  }

  private createPluginContext(pluginId: string): PluginContext {
    return {
      getConfig: () => this.config,
      onConfigChange: (cb) => this.pluginManager.addConfigListener(cb),
      showToast: (msg) => this.showToast(msg),
      ui: {
        show: () => {
          if (!this.commandPalette.isVisible()) {
            this.showMenu();
          }
        },
        hide: () => this.commandPalette.hide(),
        navigateToView: (viewType) => this.commandPalette.navigateToView(viewType),
        pushView: (view) => this.commandPalette.pushView(view),
        popView: () => this.commandPalette.popView(),
        setActiveCommand: (item) => this.commandPalette.setActiveCommand(item),
        renderCurrentView: (animate?, keepPosition?) =>
          (this.commandPalette as unknown as { renderCurrentView(a?: boolean, k?: boolean): void }).renderCurrentView(animate, keepPosition),
        showSavedAIResult: (data) => {
          this.commandPalette.openKnowledgeAIResult({
            id: `plugin_${Date.now()}`,
            type: 'ai-result',
            title: data.title,
            content: data.content,
            thinking: data.thinking,
            originalText: data.originalText,
            actionType: data.actionType,
            url: data.sourceUrl || '',
            pageTitle: data.sourceTitle || '',
            createdAt: data.createdAt || Date.now(),
          } as KnowledgeItem);
        },
      },
      ai: {
        call: (prompt, systemPrompt, onChunk) => callAI(prompt, systemPrompt, this.config, onChunk),
        abort: () => abortAllRequests(),
      },
      minimizedTasks: {
        findAndUpdate: (pid, predicate, updater) => {
          const cp = this.commandPalette as unknown as { minimizedTasks: Array<{ pluginId?: string; pluginData?: unknown; title: string; content: string; isLoading: boolean }>; renderMinimizedTasksIfVisible(): void };
          const task = cp.minimizedTasks?.find(t => t.pluginId === pid && predicate(t.pluginData));
          if (task) {
            updater(task);
            cp.renderMinimizedTasksIfVisible();
          }
        },
        rerenderBadges: () => {
          (this.commandPalette as unknown as { renderMinimizedTasksIfVisible(): void }).renderMinimizedTasksIfVisible();
        },
      },
      tasks: {
        autoSave: (data) => (this.commandPalette as unknown as { autoSaveAIResult(d: unknown): Promise<void> }).autoSaveAIResult(data),
        addToUnsavedRecent: (data) => (this.commandPalette as unknown as { addToUnsavedRecent(d: unknown): void }).addToUnsavedRecent(data),
      },
      storage: {
        get: async <T>(key: string): Promise<T | undefined> => {
          const storageKey = `plugin_${pluginId}_${key}`;
          const result = await chrome.storage.local.get(storageKey);
          return result[storageKey] as T | undefined;
        },
        set: async <T>(key: string, value: T): Promise<void> => {
          const storageKey = `plugin_${pluginId}_${key}`;
          await chrome.storage.local.set({ [storageKey]: value });
        },
      },
      sendMessage: (message) => chrome.runtime.sendMessage(message),
      getSelectedText: () => this.currentSelectedText || window.getSelection()?.toString() || '',
      getShadowRoot: () => (this.commandPalette as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot,
      getHandleDragStart: () => (this.commandPalette as unknown as { handleDragStart: (e: MouseEvent) => void }).handleDragStart,
      getCommandPalette: () => this.commandPalette,
      events: {
        on: (event, handler) => this.pluginManager.on(event, handler as (data: unknown) => void),
      },
      plugins: {
        isEnabled: (id: string) => this.pluginManager.isPluginEnabled(id),
        handleCommand: (action: string, selectedText: string) => this.pluginManager.handleCommand(action, selectedText),
      },
    };
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
