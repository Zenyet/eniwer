// Command Palette - Apple Liquid Glass Design
// The unified interface for The Panel with authentic iOS 26 Liquid Glass aesthetics
import { MenuItem, MenuConfig, ScreenshotConfig, DEFAULT_SCREENSHOT_CONFIG, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_HISTORY_CONFIG, CustomMenuItem, BrowseSession, TrailEntry, ChatSession } from '../types';
import { icons } from '../icons';
import { getStorageData, saveConfig, saveGlobalMenuItems } from '../utils/storage';
import { saveTask, getAllTasks, deleteTask, SavedTask, enforceMaxCount } from '../utils/taskStorage';
import { loadBrowseTrailSessions, deleteTrailEntry, clearTrailHistory, exportTrailData } from './BrowseTrailPanel';
import { loadChatSession, saveChatSession, createNewChatSession, createChatMessage, getContextChatSystemPrompt, buildConversationPrompt, parseReferences } from './ContextChatPanel';
import { callAI, OnChunkCallback, getTranslatePrompt, abortAllRequests } from '../utils/ai';

// View types for multi-view system
export type ViewType =
  | 'commands'
  | 'ai-result'
  | 'settings'
  | 'settings-menu'
  | 'screenshot'
  | 'browseTrail'
  | 'contextChat';

export interface ViewState {
  type: ViewType;
  title: string;
  data?: unknown;
}

export interface AIResultData {
  title: string;
  content: string;
  originalText?: string;
  isLoading: boolean;
  resultType: 'translate' | 'general';
  translateTargetLanguage?: string;
  iconHtml?: string;
  streamKey?: string; // Unique key to identify this stream
  // Extended metadata
  actionType?: string; // 'summarizePage' | 'translate' | 'summarize' | 'explain' etc.
  sourceUrl?: string; // Source URL for page actions
  sourceTitle?: string; // Source page title
  createdAt?: number; // Creation timestamp
}

export interface CommandPaletteCallbacks {
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
}

export interface AIResultCallbacks {
  onStop?: () => void;
  onTranslateLanguageChange?: (lang: string) => void;
  onRefresh?: () => void; // For re-running the action (e.g., re-summarize)
}

export interface ScreenshotData {
  dataUrl: string;
  isLoading?: boolean;
  result?: string;
  generatedImageUrl?: string;
}

export interface ScreenshotCallbacks {
  onSave?: () => void;
  onCopy?: () => void;
  onAskAI?: (question: string) => void;
  onDescribe?: () => void;
  onGenerateImage?: (prompt: string) => void;
  onClose?: () => void;
}

export interface MinimizedTask {
  id: string;
  title: string;
  content: string;
  originalText?: string;
  resultType: 'translate' | 'general';
  translateTargetLanguage?: string;
  iconHtml?: string;
  isLoading: boolean;
  minimizedAt: number;
  streamKey?: string; // Unique key to identify which stream this task belongs to
  callbacks?: AIResultCallbacks; // Preserved callbacks for restore
  // Extended metadata
  actionType?: string; // 'summarizePage' | 'translate' | 'summarize' | 'explain' etc.
  sourceUrl?: string; // Source URL for page actions
  sourceTitle?: string; // Source page title
  createdAt: number; // Creation timestamp
}

export class CommandPalette {
  private container: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private config: MenuConfig;
  private menuItems: MenuItem[] = [];
  private filteredItems: MenuItem[] = [];
  private selectedIndex = 0;
  private callbacks: CommandPaletteCallbacks | null = null;
  private recentCommands: string[] = [];
  private searchQuery = '';
  private theme: 'dark' | 'light' = 'dark';

  // Multi-view system
  private viewStack: ViewState[] = [];
  private currentView: ViewType = 'commands';

  // Active command state (unified interface)
  private activeCommand: MenuItem | null = null;
  private activeCommandInput = '';

  // AI Result state
  private aiResultData: AIResultData | null = null;
  private aiResultCallbacks: AIResultCallbacks | null = null;

  // Screenshot state
  private screenshotData: ScreenshotData | null = null;
  private screenshotCallbacks: ScreenshotCallbacks | null = null;

  // Settings state
  private settingsMenuItems: MenuItem[] = [];
  private editingItemId: string | null = null;
  private tempConfig: MenuConfig | null = null;
  private settingsChanged = false;

  // Browse Trail state
  private browseTrailSessions: BrowseSession[] = [];
  private browseTrailSearch = '';
  private browseTrailDisplayCount = 50;

  // Context Chat state
  private chatSession: ChatSession | null = null;
  private isChatStreaming = false;
  private isQuickAsk = false;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panelStartX = 0;
  private panelStartY = 0;
  // Saved panel position (persists across hide/show)
  private savedPanelPosition: { top: string; left: string; right: string; transform: string } | null = null;

  // Minimized tasks storage (in-memory for current session)
  private minimizedTasks: MinimizedTask[] = [];
  private minimizedTaskIdCounter = 0;
  private currentStreamKey: string | null = null; // Key to identify current active stream

  // Recent saved tasks from IndexedDB
  private recentSavedTasks: SavedTask[] = [];

  constructor(config: MenuConfig) {
    this.config = config;
    this.loadRecentCommands();
    this.updateTheme();
    this.loadRecentSavedTasks();
  }

  public setConfig(config: MenuConfig): void {
    this.config = config;
    this.updateTheme();
    // Reload recent tasks when config changes (display count may have changed)
    this.loadRecentSavedTasks();
  }

  private updateTheme(overrideTheme?: 'dark' | 'light' | 'system'): void {
    const themeSetting = overrideTheme ?? this.config.theme;
    if (themeSetting === 'light') {
      this.theme = 'light';
    } else if (themeSetting === 'dark') {
      this.theme = 'dark';
    } else {
      this.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  public show(items: MenuItem[], callbacks: CommandPaletteCallbacks): void {
    this.menuItems = items.filter(item => item.enabled !== false);
    this.filteredItems = this.sortByRecent(this.menuItems);
    this.callbacks = callbacks;
    this.selectedIndex = 0;
    this.searchQuery = '';
    // Reset view state - clear active command to show commands list
    this.currentView = 'commands';
    this.viewStack = [];
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.aiResultData = null;
    this.aiResultCallbacks = null;
    this.updateTheme();
    // Refresh recent saved tasks when showing
    this.loadRecentSavedTasks();
    this.render();
  }

  public hide(): void {
    if (this.container) {
      // Clean up drag event listeners
      document.removeEventListener('mousemove', this.handleDragMove);
      document.removeEventListener('mouseup', this.handleDragEnd);

      // Auto-minimize active AI task before hiding (regardless of current view)
      // But don't minimize tasks restored from saved records (they're already saved)
      const isSavedTask = this.activeCommand?.id?.startsWith('saved_') ?? false;
      if (this.aiResultData && !isSavedTask) {
        this.minimize();
      }

      const panel = this.shadowRoot?.querySelector('.glass-panel') as HTMLElement;
      if (panel) {
        // Save panel position before hiding (for restoring on next show)
        this.savedPanelPosition = {
          top: panel.style.top,
          left: panel.style.left,
          right: panel.style.right,
          transform: panel.style.transform,
        };

        // Check if panel was dragged (has explicit left/top positioning)
        const wasDragged = panel.style.transform === 'none';
        if (wasDragged) {
          panel.classList.add('glass-panel-exit-dragged');
        } else {
          panel.classList.add('glass-panel-exit');
        }
      }
      setTimeout(() => {
        this.container?.remove();
        this.container = null;
        this.shadowRoot = null;
        this.callbacks?.onClose();
        // Reset view state (but NOT minimizedTasks - they persist across open/close)
        this.viewStack = [];
        this.currentView = 'commands';
        this.aiResultData = null;
        this.aiResultCallbacks = null;
      }, 250);
    }
  }

  public isVisible(): boolean {
    return this.container !== null;
  }

  // View navigation methods
  public pushView(view: ViewState): void {
    this.viewStack.push({ type: this.currentView, title: this.getViewTitle(this.currentView), data: this.getViewData() });
    this.currentView = view.type;
    this.renderCurrentView(true, true);
  }

  public popView(): void {
    const previousView = this.viewStack.pop();
    if (previousView) {
      this.currentView = previousView.type;
      this.restoreViewData(previousView);
      this.renderCurrentView(true, true);
    }
  }

  private getViewTitle(view: ViewType): string {
    const titles: Record<ViewType, string> = {
      'commands': '命令',
      'ai-result': this.aiResultData?.title || 'AI 结果',
      'settings': '设置',
      'settings-menu': '菜单管理',
      'screenshot': '截图',
      'browseTrail': '浏览轨迹',
      'contextChat': '上下文追问',
    };
    return titles[view];
  }

  private getViewData(): unknown {
    if (this.currentView === 'ai-result') {
      return this.aiResultData;
    }
    return null;
  }

  private restoreViewData(view: ViewState): void {
    if (view.type === 'ai-result' && view.data) {
      this.aiResultData = view.data as AIResultData;
    }
  }

  // AI Result methods
  public showAIResult(title: string, callbacks?: AIResultCallbacks, options?: {
    originalText?: string;
    resultType?: 'translate' | 'general';
    translateTargetLanguage?: string;
    iconHtml?: string;
    actionType?: string;
    sourceUrl?: string;
    sourceTitle?: string;
  }): boolean {
    const actionType = options?.actionType || '';

    // Check if there's already a minimized task for this action type
    // If so, restore it instead of creating a new one
    if (actionType) {
      const existingTask = this.minimizedTasks.find(t => t.actionType === actionType);
      if (existingTask) {
        // Set callbacks before restoring so stop/refresh buttons work
        this.aiResultCallbacks = callbacks || null;
        this.restoreMinimizedTask(existingTask.id);
        return true; // Restored existing task, don't start new request
      }
    }

    // Generate unique stream key for this AI request
    this.currentStreamKey = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.aiResultData = {
      title,
      content: '',
      originalText: options?.originalText || '',
      isLoading: true,
      resultType: options?.resultType || 'general',
      translateTargetLanguage: options?.translateTargetLanguage || this.config.preferredLanguage || 'zh-CN',
      iconHtml: options?.iconHtml,
      streamKey: this.currentStreamKey,
      actionType,
      sourceUrl: options?.sourceUrl || window.location.href,
      sourceTitle: options?.sourceTitle || document.title,
      createdAt: Date.now(),
    };
    this.aiResultCallbacks = callbacks || null;

    // Use unified interface - stay in commands view with active command
    this.currentView = 'commands';
    this.viewStack = [];

    if (!this.container) {
      this.updateTheme();
      this.render();
    } else {
      this.renderCurrentView();
    }

    return false; // New request started
  }

  // Set active command for unified interface
  public setActiveCommand(item: MenuItem): void {
    this.activeCommand = item;
    this.activeCommandInput = '';
    this.searchQuery = '';
  }

  // Screenshot methods
  public showScreenshot(dataUrl: string, callbacks?: ScreenshotCallbacks): void {
    // Set active command for screenshot
    this.activeCommand = {
      id: 'screenshot',
      action: 'screenshot',
      label: '截图',
      icon: '',
      enabled: true,
      order: 0,
    };

    this.screenshotData = {
      dataUrl,
      isLoading: false,
    };
    this.screenshotCallbacks = callbacks || null;
    this.currentView = 'screenshot';
    this.viewStack = [];

    if (!this.container) {
      this.updateTheme();
      this.render();
    } else {
      this.renderCurrentView();
    }
  }

  public updateScreenshotResult(result: string, isLoading: boolean = false): void {
    if (this.screenshotData) {
      this.screenshotData.result = result;
      this.screenshotData.isLoading = isLoading;
      this.renderScreenshotContent();
    }
  }

  public updateScreenshotGeneratedImage(imageUrl: string): void {
    if (this.screenshotData) {
      this.screenshotData.generatedImageUrl = imageUrl;
      this.screenshotData.isLoading = false;
      this.renderScreenshotContent();
    }
  }

  private renderScreenshotContent(): void {
    if (!this.shadowRoot || !this.screenshotData) return;
    const contentArea = this.shadowRoot.querySelector('.glass-screenshot-content');
    if (contentArea) {
      contentArea.innerHTML = this.getScreenshotContentHTML();
    }
  }

  public streamUpdate(_chunk: string, fullText: string): void {
    // Update active AI result if streamKey matches
    if (this.aiResultData && this.aiResultData.streamKey === this.currentStreamKey) {
      this.aiResultData.content = fullText;
      this.aiResultData.isLoading = true;
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    }

    // Also update minimized task with matching streamKey
    // Note: Don't re-render the list during streaming - just update the data
    // The loading indicator is already showing, no need to re-render
    if (this.currentStreamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === this.currentStreamKey);
      if (task) {
        task.content = fullText;
        task.isLoading = true;
      }
    }
  }

  public updateAIResult(content: string): void {
    // Update active AI result if streamKey matches
    if (this.aiResultData && this.aiResultData.streamKey === this.currentStreamKey) {
      this.aiResultData.content = content;
      this.aiResultData.isLoading = false;
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    }

    // Also update minimized task with matching streamKey
    if (this.currentStreamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === this.currentStreamKey);
      if (task) {
        task.content = content;
        const wasLoading = task.isLoading;
        task.isLoading = false;
        // Only re-render if loading state changed (to update the loading indicator)
        if (wasLoading) {
          this.renderMinimizedTasksIfVisible();
        }
      }
      // Clear the stream key since this stream is complete
      this.currentStreamKey = null;
    }
  }

  public setAIResultLoading(isLoading: boolean): void {
    if (this.aiResultData && this.aiResultData.streamKey === this.currentStreamKey) {
      this.aiResultData.isLoading = isLoading;
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    }

    // Also update minimized task with matching streamKey
    if (this.currentStreamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === this.currentStreamKey);
      if (task) {
        const wasLoading = task.isLoading;
        task.isLoading = isLoading;
        // Only re-render if loading state changed
        if (wasLoading !== isLoading) {
          this.renderMinimizedTasksIfVisible();
        }
      }
      if (!isLoading) {
        // Clear the stream key since this stream is complete
        this.currentStreamKey = null;
      }
    }
  }

  // Helper to re-render minimized tasks section if currently visible
  private renderMinimizedTasksIfVisible(): void {
    if (this.currentView === 'commands' && this.shadowRoot) {
      this.renderMinimizedTasks();
    }
  }

  // Settings methods
  public showSettings(): void {
    // Initialize temp config for editing
    this.tempConfig = JSON.parse(JSON.stringify(this.config));
    this.settingsChanged = false;

    // Set view state BEFORE rendering
    this.currentView = 'settings';
    this.viewStack = [];

    if (!this.container) {
      this.updateTheme();
      this.render();
    } else {
      this.renderCurrentView();
    }
  }

  private async loadRecentCommands(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('thecircle_recent_commands');
      this.recentCommands = result.thecircle_recent_commands || [];
    } catch {
      this.recentCommands = [];
    }
  }

  private async saveRecentCommand(commandId: string): Promise<void> {
    this.recentCommands = [commandId, ...this.recentCommands.filter(id => id !== commandId)].slice(0, 5);
    await chrome.storage.local.set({ thecircle_recent_commands: this.recentCommands });
  }

  private sortByRecent(items: MenuItem[]): MenuItem[] {
    const recentItems = this.recentCommands
      .map(id => items.find(item => item.id === id))
      .filter(Boolean) as MenuItem[];
    const otherItems = items.filter(item => !this.recentCommands.includes(item.id));
    return [...recentItems, ...otherItems];
  }

  private render(): void {
    this.container?.remove();

    this.container = document.createElement('div');
    this.container.id = 'thecircle-palette-root';
    this.shadowRoot = this.container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadowRoot.appendChild(style);

    // Transparent overlay to capture clicks outside panel
    const overlay = document.createElement('div');
    overlay.className = 'glass-overlay';
    overlay.addEventListener('click', () => this.hide());
    this.shadowRoot.appendChild(overlay);

    // Main panel
    const panel = document.createElement('div');
    const hasRestoredPosition = this.savedPanelPosition && this.savedPanelPosition.transform === 'none';
    panel.className = `glass-panel ${hasRestoredPosition ? 'glass-panel-enter-restored' : 'glass-panel-enter'} ${this.theme}`;

    // Restore saved position if available
    if (this.savedPanelPosition) {
      panel.style.top = this.savedPanelPosition.top;
      panel.style.left = this.savedPanelPosition.left;
      panel.style.right = this.savedPanelPosition.right;
      panel.style.transform = this.savedPanelPosition.transform;
    }

    this.shadowRoot.appendChild(panel);

    document.body.appendChild(this.container);
    // First render - no view transition animation (panel already has panelIn animation)
    this.renderCurrentView(false, true);

    // Remove enter animation class after animation completes
    setTimeout(() => {
      panel.classList.remove('glass-panel-enter');
      panel.classList.remove('glass-panel-enter-restored');
    }, 300);
  }

  private renderCurrentView(animate: boolean = true, keepPosition: boolean = false): void {
    if (!this.shadowRoot) return;

    const panel = this.shadowRoot.querySelector('.glass-panel') as HTMLElement;
    if (!panel) return;

    // Get previous view from data attribute to avoid animating same-view transitions
    const previousView = panel.getAttribute('data-view');
    const shouldAnimate = animate && previousView !== this.currentView;

    // Store current view
    panel.setAttribute('data-view', this.currentView);

    // Only animate actual view transitions (different view types)
    if (shouldAnimate) {
      panel.classList.add('glass-view-transition');
      setTimeout(() => panel.classList.remove('glass-view-transition'), 200);
    }

    // Position the panel (unless keepPosition is true)
    if (!keepPosition) {
      if (this.currentView === 'ai-result') {
        // Position panel to the right side if not already dragged
        if (panel.style.transform !== 'none') {
          panel.style.position = 'fixed';
          panel.style.top = '80px';
          panel.style.left = 'auto';
          panel.style.right = '20px';
          panel.style.transform = 'none';
        }
      } else if (this.currentView === 'commands') {
        // Only reset to center position for commands view (initial state)
        panel.style.position = '';
        panel.style.top = '';
        panel.style.left = '';
        panel.style.right = '';
        panel.style.transform = '';
      }
      // For other views (browseTrail, contextChat, settings, etc.), keep current position
    }

    switch (this.currentView) {
      case 'commands':
        panel.innerHTML = this.getCommandsViewHTML();
        this.bindCommandsEvents();
        this.renderCommands();
        requestAnimationFrame(() => {
          const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
          input?.focus();
        });
        break;
      case 'ai-result':
        panel.innerHTML = this.getAIResultViewHTML();
        this.bindAIResultEvents();
        break;
      case 'settings':
        panel.innerHTML = this.getSettingsViewHTML();
        this.bindSettingsEvents();
        break;
      case 'settings-menu':
        panel.innerHTML = this.getMenuSettingsHTML();
        this.bindMenuSettingsEvents();
        break;
      case 'screenshot':
        panel.innerHTML = this.getScreenshotViewHTML();
        this.bindScreenshotViewEvents();
        break;
      case 'browseTrail':
        panel.innerHTML = this.getBrowseTrailViewHTML();
        this.bindBrowseTrailEvents();
        requestAnimationFrame(() => {
          const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
          input?.focus();
        });
        break;
      case 'contextChat':
        panel.innerHTML = this.getContextChatViewHTML();
        this.bindContextChatEvents();
        requestAnimationFrame(() => {
          const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
          input?.focus();
        });
        break;
    }
  }

  private getCommandsViewHTML(): string {
    const hasActiveCommand = this.activeCommand !== null;
    const isAIAction = hasActiveCommand && ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'].includes(this.activeCommand?.action || '');
    const needsInput = hasActiveCommand && ['contextChat'].includes(this.activeCommand?.action || '');
    const isLoading = this.aiResultData?.isLoading ?? false;
    const isTranslate = this.aiResultData?.resultType === 'translate';
    const isSavedTask = this.activeCommand?.id?.startsWith('saved_') ?? false;

    // Determine placeholder text
    let placeholder = '搜索命令或直接提问...';
    if (hasActiveCommand) {
      if (needsInput) {
        placeholder = '输入内容后按回车...';
      } else if (isTranslate && this.aiResultData?.originalText) {
        placeholder = '';  // Will show original text in input
      } else if (isLoading) {
        placeholder = '处理中...';
      } else {
        placeholder = '';
      }
    }

    // For translate, show original text in input
    const inputValue = isTranslate && this.aiResultData?.originalText ? this.aiResultData.originalText : '';

    return `
      <div class="glass-search glass-draggable">
        ${hasActiveCommand ? `
          <div class="glass-command-tag" data-action="${this.activeCommand?.action}">
            <span class="glass-command-tag-icon">${this.activeCommand?.icon || ''}</span>
            <span class="glass-command-tag-label">${this.escapeHtml(this.activeCommand?.label || '')}</span>
            <button class="glass-command-tag-close">&times;</button>
          </div>
        ` : `
          <div class="glass-search-icon">${icons.search}</div>
        `}
        <input
          type="text"
          class="glass-input"
          placeholder="${placeholder}"
          value="${this.escapeHtml(inputValue)}"
          autocomplete="off"
          spellcheck="false"
          ${isAIAction && !needsInput ? 'readonly' : ''}
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      ${hasActiveCommand && this.aiResultData ? this.getSourceInfoHTML(this.aiResultData) : ''}
      <div class="glass-body">
        ${hasActiveCommand ? `
          <div class="glass-ai-content-area">
            ${isLoading && !this.aiResultData?.content ? this.getLoadingHTML() : ''}
            ${this.aiResultData?.content ? `<div class="glass-ai-content">${this.formatAIContent(this.aiResultData.content)}</div>` : ''}
          </div>
        ` : `
          <div class="glass-commands"></div>
          <div class="glass-minimized-section"></div>
          <div class="glass-recent-section"></div>
        `}
      </div>
      <div class="glass-footer">
        ${hasActiveCommand ? `
          <div class="glass-ai-footer-actions">
            <button class="glass-footer-btn glass-btn-stop" title="终止" style="display: ${isLoading ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
              </svg>
            </button>
            ${isTranslate ? this.getTranslateLanguageSelectHTML(this.aiResultData?.translateTargetLanguage || this.config.preferredLanguage || 'zh-CN') : ''}
            ${isTranslate && this.aiResultData?.originalText ? `
              <button class="glass-footer-btn glass-btn-compare" title="对比原文">
                ${icons.columns}
              </button>
            ` : ''}
            <button class="glass-footer-btn glass-btn-copy" title="复制" style="display: ${this.aiResultData?.content ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${this.activeCommand?.action === 'summarizePage' && !isSavedTask ? `
              <button class="glass-footer-btn glass-btn-refresh" title="重新总结" style="display: ${!isLoading ? 'flex' : 'none'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
              </button>
            ` : ''}
            ${!isSavedTask ? `
            <button class="glass-footer-btn glass-btn-save" title="保存" style="display: ${this.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
            ` : ''}
          </div>
        ` : `
          <div class="glass-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
            <span><kbd>↵</kbd> 执行</span>
          </div>
        `}
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private bindCommandsEvents(): void {
    if (!this.shadowRoot) return;

    const input = this.shadowRoot.querySelector('.glass-input') as HTMLInputElement;
    const hasActiveCommand = this.activeCommand !== null;

    // Bind drag events on search area
    const searchArea = this.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;
    if (searchArea) {
      searchArea.addEventListener('mousedown', this.handleDragStart);
    }

    // Command tag close button
    const tagClose = this.shadowRoot.querySelector('.glass-command-tag-close');
    tagClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearActiveCommand();
    });

    // Footer action buttons (when command is active)
    if (hasActiveCommand) {
      const stopBtn = this.shadowRoot.querySelector('.glass-btn-stop');
      stopBtn?.addEventListener('click', () => {
        if (this.aiResultData) {
          this.aiResultData.isLoading = false;
        }
        this.aiResultCallbacks?.onStop?.();
        this.updateUnifiedContent();
      });

      const copyBtn = this.shadowRoot.querySelector('.glass-btn-copy');
      copyBtn?.addEventListener('click', () => {
        if (this.aiResultData?.content) {
          navigator.clipboard.writeText(this.aiResultData.content);
          this.showCopyFeedback(copyBtn as HTMLButtonElement);
        }
      });

      const compareBtn = this.shadowRoot.querySelector('.glass-btn-compare');
      compareBtn?.addEventListener('click', () => {
        this.toggleCompareMode();
      });

      // Language select for translate
      const langSelect = this.shadowRoot.querySelector('.glass-lang-select') as HTMLSelectElement;
      langSelect?.addEventListener('change', () => {
        if (this.aiResultData) {
          // Generate new stream key so streaming updates work
          this.currentStreamKey = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          this.aiResultData.streamKey = this.currentStreamKey;
          this.aiResultData.translateTargetLanguage = langSelect.value;
          this.aiResultData.isLoading = true;
          this.aiResultData.content = '';
          this.updateUnifiedContent();
          this.aiResultCallbacks?.onTranslateLanguageChange?.(langSelect.value);
        }
      });

      const refreshBtn = this.shadowRoot.querySelector('.glass-btn-refresh');
      refreshBtn?.addEventListener('click', () => {
        this.aiResultCallbacks?.onRefresh?.();
      });

      const saveBtn = this.shadowRoot.querySelector('.glass-btn-save');
      saveBtn?.addEventListener('click', () => {
        this.saveCurrentTask(saveBtn as HTMLButtonElement);
      });
    }

    input?.addEventListener('input', () => {
      if (!hasActiveCommand) {
        this.searchQuery = input.value.toLowerCase().trim();
        this.filterCommands();
      } else {
        this.activeCommandInput = input.value;
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (hasActiveCommand) {
        // When command is active
        if (e.key === 'Escape') {
          e.preventDefault();
          this.clearActiveCommand();
        }
        // For commands that need input (like contextChat), handle Enter
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.selectPrev();
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            this.selectPrev();
          } else {
            this.selectNext();
          }
          break;
      }
    });

    // Number keys for quick selection (1-9)
    if (!hasActiveCommand) {
      input?.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key >= '1' && e.key <= '9' && !this.searchQuery) {
          const index = parseInt(e.key) - 1;
          if (index < this.filteredItems.length) {
            e.preventDefault();
            this.selectedIndex = index;
            this.executeSelected();
          }
        }
      });
    }
  }

  private clearActiveCommand(): void {
    // If there's an active AI action still loading, minimize it instead of aborting
    if (this.aiResultData && this.aiResultData.isLoading && this.activeCommand) {
      this.minimizeToBackground();
      return;
    }

    // Otherwise, stop any ongoing requests and clear
    if (this.aiResultCallbacks?.onStop) {
      this.aiResultCallbacks.onStop();
    }
    this.currentStreamKey = null;
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.aiResultData = null;
    this.aiResultCallbacks = null;
    this.searchQuery = '';
    this.renderCurrentView(true, true);
  }

  // Minimize current task to background without aborting (streaming continues)
  private minimizeToBackground(): void {
    if (!this.aiResultData) return;

    // For page-level actions, only allow one minimized task per type
    if (this.aiResultData.actionType) {
      const existingIndex = this.minimizedTasks.findIndex(t => t.actionType === this.aiResultData!.actionType);
      if (existingIndex !== -1) {
        this.minimizedTasks.splice(existingIndex, 1);
      }
    }

    // Store as minimized task with streamKey for ongoing updates
    const task: MinimizedTask = {
      id: `task-${++this.minimizedTaskIdCounter}`,
      title: this.aiResultData.title,
      content: this.aiResultData.content,
      originalText: this.aiResultData.originalText,
      resultType: this.aiResultData.resultType,
      translateTargetLanguage: this.aiResultData.translateTargetLanguage,
      iconHtml: this.aiResultData.iconHtml,
      isLoading: this.aiResultData.isLoading,
      minimizedAt: Date.now(),
      streamKey: this.aiResultData.streamKey,
      callbacks: this.aiResultCallbacks || undefined,
      actionType: this.aiResultData.actionType,
      sourceUrl: this.aiResultData.sourceUrl,
      sourceTitle: this.aiResultData.sourceTitle,
      createdAt: this.aiResultData.createdAt || Date.now(),
    };
    this.minimizedTasks.push(task);

    // Clear active state but keep currentStreamKey for updates
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.aiResultData = null;
    this.aiResultCallbacks = null;
    this.searchQuery = '';
    this.renderCurrentView(true, true);
  }

  private async saveCurrentTask(btn: HTMLButtonElement): Promise<void> {
    if (!this.aiResultData || !this.aiResultData.content) return;

    try {
      await saveTask({
        title: this.aiResultData.title,
        content: this.aiResultData.content,
        originalText: this.aiResultData.originalText,
        resultType: this.aiResultData.resultType,
        actionType: this.aiResultData.actionType || 'unknown',
        sourceUrl: this.aiResultData.sourceUrl || window.location.href,
        sourceTitle: this.aiResultData.sourceTitle || document.title,
        translateTargetLanguage: this.aiResultData.translateTargetLanguage,
        createdAt: this.aiResultData.createdAt || Date.now(),
      });

      // Enforce max count limit
      const maxCount = this.config.history?.maxSaveCount || DEFAULT_HISTORY_CONFIG.maxSaveCount;
      await enforceMaxCount(maxCount);

      // Refresh recent tasks list
      await this.loadRecentSavedTasks();

      // Show save success feedback
      this.showSaveFeedback(btn);
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  }

  private showSaveFeedback(btn: HTMLButtonElement): void {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    btn.classList.add('saved');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('saved');
    }, 1500);
  }

  private updateUnifiedContent(): void {
    if (!this.shadowRoot || !this.aiResultData) return;

    const contentArea = this.shadowRoot.querySelector('.glass-ai-content-area');
    const footer = this.shadowRoot.querySelector('.glass-ai-footer-actions');

    if (contentArea) {
      if (this.aiResultData.isLoading && !this.aiResultData.content) {
        contentArea.innerHTML = this.getLoadingHTML();
      } else if (this.aiResultData.content) {
        contentArea.innerHTML = `<div class="glass-ai-content">${this.formatAIContent(this.aiResultData.content)}</div>`;
      }
    }

    // Update footer buttons visibility
    if (footer) {
      const stopBtn = footer.querySelector('.glass-btn-stop') as HTMLElement;
      const copyBtn = footer.querySelector('.glass-btn-copy') as HTMLElement;
      const refreshBtn = footer.querySelector('.glass-btn-refresh') as HTMLElement;
      const saveBtn = footer.querySelector('.glass-btn-save') as HTMLElement;

      if (stopBtn) {
        stopBtn.style.display = this.aiResultData.isLoading ? 'flex' : 'none';
      }
      if (copyBtn) {
        copyBtn.style.display = this.aiResultData.content ? 'flex' : 'none';
      }
      if (refreshBtn) {
        refreshBtn.style.display = !this.aiResultData.isLoading ? 'flex' : 'none';
      }
      if (saveBtn) {
        saveBtn.style.display = this.aiResultData.content && !this.aiResultData.isLoading ? 'flex' : 'none';
      }
    }

    // Update input placeholder
    const input = this.shadowRoot.querySelector('.glass-input') as HTMLInputElement;
    if (input && !this.aiResultData.isLoading) {
      input.placeholder = '';
    }
  }

  // AI Result View
  private getAIResultViewHTML(): string {
    const data = this.aiResultData;
    if (!data) return '';

    const isTranslate = data.resultType === 'translate' && data.originalText;
    const isPageAction = data.actionType === 'summarizePage';

    return `
      <div class="glass-header glass-draggable">
        <button class="glass-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="glass-header-title">${this.escapeHtml(data.title)}</span>
        <div class="glass-header-actions">
          ${isTranslate ? this.getTranslateLanguageSelectHTML(data.translateTargetLanguage || 'zh-CN') : ''}
          ${isTranslate ? `
            <button class="glass-header-btn glass-btn-compare" title="对比原文">
              ${icons.columns}
            </button>
          ` : ''}
          ${isPageAction && !data.isLoading ? `
            <button class="glass-header-btn glass-btn-refresh" title="重新总结">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
            </button>
          ` : ''}
          <button class="glass-header-btn glass-btn-copy" title="复制">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="glass-header-btn glass-btn-stop" title="终止" style="display: ${data.isLoading ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
          </button>
          <button class="glass-minimize-btn" title="最小化">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="glass-divider"></div>
      ${this.getSourceInfoHTML(data)}
      <div class="glass-body glass-ai-result-body">
        <div class="glass-ai-content" data-compare="false">
          ${data.isLoading && !data.content ? this.getLoadingHTML() : this.formatAIContent(data.content)}
        </div>
      </div>
    `;
  }

  private getSourceInfoHTML(data: AIResultData): string {
    const isPageAction = data.actionType === 'summarizePage';
    const isTranslate = data.resultType === 'translate';

    // Only show source info for page actions or translations with sourceUrl
    if (!isPageAction && !isTranslate) return '';
    if (!data.sourceUrl && !data.sourceTitle && !data.originalText) return '';

    let titlePart = '';
    let metaPart = '';

    if (isPageAction) {
      // Page summary: show page title as clickable link
      const displayTitle = data.sourceTitle || (data.sourceUrl ? new URL(data.sourceUrl).hostname : '');
      if (data.sourceUrl) {
        titlePart = `<a class="glass-source-link" href="${this.escapeHtml(data.sourceUrl)}" target="_blank" title="${this.escapeHtml(data.sourceUrl)}">${this.escapeHtml(displayTitle)}</a>`;
      } else if (displayTitle) {
        titlePart = `<span class="glass-source-title">${this.escapeHtml(displayTitle)}</span>`;
      }
    } else if (isTranslate) {
      // Translation: show source site domain
      if (data.sourceUrl) {
        try {
          const hostname = new URL(data.sourceUrl).hostname;
          titlePart = `<span class="glass-source-title">${this.escapeHtml(hostname)}</span>`;
        } catch {
          // ignore invalid URL
        }
      }
    }

    // Time info
    if (data.createdAt) {
      metaPart = this.formatTimeAgo(data.createdAt);
    }

    if (!titlePart && !metaPart) return '';

    return `
      <div class="glass-source-info">
        <div class="glass-source-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </div>
        <div class="glass-source-content">
          ${titlePart}
          ${metaPart ? `<span class="glass-source-meta">${metaPart}</span>` : ''}
        </div>
      </div>
    `;
  }

  private getTranslateLanguageSelectHTML(currentLang: string): string {
    const languages = [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'zh-TW', label: '繁体中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'ko', label: '한국어' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
      { value: 'de', label: 'Deutsch' },
    ];

    const options = languages.map(({ value, label }) =>
      `<option value="${value}"${value === currentLang ? ' selected' : ''}>${label}</option>`
    ).join('');

    return `<select class="glass-lang-select">${options}</select>`;
  }

  private getLoadingHTML(): string {
    return `
      <div class="glass-loading">
        <div class="glass-spinner"></div>
        <span>正在思考...</span>
      </div>
    `;
  }

  private formatAIContent(text: string): string {
    if (!text) return '';
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  private bindAIResultEvents(): void {
    if (!this.shadowRoot) return;

    // Back button - return to commands view instead of closing
    const backBtn = this.shadowRoot.querySelector('.glass-back-btn');
    backBtn?.addEventListener('click', () => {
      // Auto-minimize active AI task before returning
      if (this.aiResultData) {
        this.minimize();
      }
      // Always return to commands view for AI results
      this.currentView = 'commands';
      this.viewStack = [];
      this.aiResultData = null;
      this.aiResultCallbacks = null;
      this.renderCurrentView(true, true);
    });

    // Minimize button
    const minimizeBtn = this.shadowRoot.querySelector('.glass-minimize-btn');
    minimizeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimize();
    });

    // Draggable header
    const header = this.shadowRoot.querySelector('.glass-draggable') as HTMLElement;
    if (header) {
      header.addEventListener('mousedown', this.handleDragStart);
    }

    // Refresh button (for page actions like summarize)
    const refreshBtn = this.shadowRoot.querySelector('.glass-btn-refresh');
    refreshBtn?.addEventListener('click', () => {
      this.aiResultCallbacks?.onRefresh?.();
    });

    // Stop button
    const stopBtn = this.shadowRoot.querySelector('.glass-btn-stop');
    stopBtn?.addEventListener('click', () => {
      if (this.aiResultData) {
        this.aiResultData.isLoading = false;
      }
      this.aiResultCallbacks?.onStop?.();
      this.updateAIResultContent();
    });

    // Copy button
    const copyBtn = this.shadowRoot.querySelector('.glass-btn-copy');
    copyBtn?.addEventListener('click', () => {
      if (this.aiResultData?.content) {
        navigator.clipboard.writeText(this.aiResultData.content);
        this.showCopyFeedback(copyBtn as HTMLButtonElement);
      }
    });

    // Compare button
    const compareBtn = this.shadowRoot.querySelector('.glass-btn-compare');
    compareBtn?.addEventListener('click', () => {
      this.toggleCompareMode();
    });

    // Language select
    const langSelect = this.shadowRoot.querySelector('.glass-lang-select') as HTMLSelectElement;
    langSelect?.addEventListener('change', () => {
      if (this.aiResultData) {
        // Generate new stream key so streaming updates work
        this.currentStreamKey = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.aiResultData.streamKey = this.currentStreamKey;
        this.aiResultData.translateTargetLanguage = langSelect.value;
        this.aiResultData.isLoading = true;
        this.aiResultData.content = '';
        this.updateAIResultContent();
        this.aiResultCallbacks?.onTranslateLanguageChange?.(langSelect.value);
      }
    });

    // Escape key - remove old listener first to prevent duplicates
    document.removeEventListener('keydown', this.handleAIResultKeydown);
    document.addEventListener('keydown', this.handleAIResultKeydown);
  }

  private handleAIResultKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.currentView === 'ai-result') {
      e.preventDefault();
      // Remove the listener when leaving ai-result view
      document.removeEventListener('keydown', this.handleAIResultKeydown);
      // Auto-minimize active AI task before returning
      if (this.aiResultData) {
        this.minimize();
      }
      // Return to commands view instead of closing
      this.activeCommand = null;
      this.currentView = 'commands';
      this.viewStack = [];
      this.aiResultData = null;
      this.aiResultCallbacks = null;
      this.renderCurrentView(true, true);
    }
  };

  // Drag handlers
  private handleDragStart = (e: MouseEvent): void => {
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input')) return;

    const panel = this.shadowRoot?.querySelector('.glass-panel') as HTMLElement;
    if (!panel) return;

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    const rect = panel.getBoundingClientRect();
    this.panelStartX = rect.left;
    this.panelStartY = rect.top;

    // Switch to absolute positioning for dragging
    panel.style.position = 'fixed';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.transform = 'none';
    panel.classList.add('glass-panel-dragging');

    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
    e.preventDefault();
  };

  private handleDragMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    const panel = this.shadowRoot?.querySelector('.glass-panel') as HTMLElement;
    if (!panel) return;

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    let newX = this.panelStartX + dx;
    let newY = this.panelStartY + dy;

    // Keep panel within viewport bounds
    const rect = panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
  };

  private handleDragEnd = (): void => {
    this.isDragging = false;

    const panel = this.shadowRoot?.querySelector('.glass-panel') as HTMLElement;
    if (panel) {
      panel.classList.remove('glass-panel-dragging');
    }

    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  // Minimize/Restore methods
  private minimize(): void {
    if (!this.aiResultData) return;

    // For page-level actions (summarizePage), only allow one minimized task
    // Replace existing one if present
    if (this.aiResultData.actionType === 'summarizePage') {
      const existingIndex = this.minimizedTasks.findIndex(t => t.actionType === 'summarizePage');
      if (existingIndex !== -1) {
        this.minimizedTasks.splice(existingIndex, 1);
      }
    }

    // Store as minimized task with streamKey for ongoing updates
    const task: MinimizedTask = {
      id: `task-${++this.minimizedTaskIdCounter}`,
      title: this.aiResultData.title,
      content: this.aiResultData.content,
      originalText: this.aiResultData.originalText,
      resultType: this.aiResultData.resultType,
      translateTargetLanguage: this.aiResultData.translateTargetLanguage,
      iconHtml: this.aiResultData.iconHtml,
      isLoading: this.aiResultData.isLoading,
      minimizedAt: Date.now(),
      streamKey: this.aiResultData.streamKey, // Preserve streamKey for ongoing updates
      callbacks: this.aiResultCallbacks || undefined,
      // Extended metadata
      actionType: this.aiResultData.actionType,
      sourceUrl: this.aiResultData.sourceUrl,
      sourceTitle: this.aiResultData.sourceTitle,
      createdAt: this.aiResultData.createdAt || Date.now(),
    };
    this.minimizedTasks.push(task);

    // Reset AI result state and close palette
    // Note: currentStreamKey is NOT cleared - it continues to be used for updates
    this.aiResultData = null;
    this.aiResultCallbacks = null;
    this.hide();
  }

  private restoreMinimizedTask(taskId: string): void {
    const taskIndex = this.minimizedTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = this.minimizedTasks[taskIndex];

    // Remove from minimized tasks
    this.minimizedTasks.splice(taskIndex, 1);

    // Restore as active AI result
    this.aiResultData = {
      title: task.title,
      content: task.content,
      originalText: task.originalText,
      isLoading: task.isLoading,
      resultType: task.resultType,
      translateTargetLanguage: task.translateTargetLanguage,
      iconHtml: task.iconHtml,
      streamKey: task.streamKey, // Restore streamKey for ongoing updates
      // Extended metadata
      actionType: task.actionType,
      sourceUrl: task.sourceUrl,
      sourceTitle: task.sourceTitle,
      createdAt: task.createdAt,
    };

    // If this task is still loading, restore the stream key reference
    if (task.isLoading && task.streamKey) {
      this.currentStreamKey = task.streamKey;
    }

    // Create a mock MenuItem for the active command
    this.activeCommand = {
      id: task.actionType || 'unknown',
      label: task.title,
      icon: task.iconHtml || '',
      action: task.actionType || 'unknown',
      enabled: true,
      order: 0,
    };

    // Restore callbacks from minimized task, ensuring onStop is available
    this.aiResultCallbacks = {
      ...task.callbacks,
      onStop: () => abortAllRequests(),
    };

    // Use unified interface - stay in commands view with active command
    this.currentView = 'commands';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private dismissMinimizedTask(taskId: string): void {
    const taskIndex = this.minimizedTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = this.minimizedTasks[taskIndex];

    // Remove from minimized tasks
    this.minimizedTasks.splice(taskIndex, 1);

    // Clear stream key if it matches the dismissed task
    if (task.streamKey && this.currentStreamKey === task.streamKey) {
      this.currentStreamKey = null;
    }

    // Re-render commands view to update the minimized tasks section
    if (this.currentView === 'commands') {
      this.renderMinimizedTasks();
    }
  }

  private getDefaultMinimizedIcon(): string {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>`;
  }

  private updateAIResultContent(): void {
    if (!this.shadowRoot || !this.aiResultData) return;

    const contentEl = this.shadowRoot.querySelector('.glass-ai-content');
    const stopBtn = this.shadowRoot.querySelector('.glass-btn-stop') as HTMLElement;

    if (contentEl) {
      const isCompare = contentEl.getAttribute('data-compare') === 'true';
      if (isCompare && this.aiResultData.originalText) {
        contentEl.innerHTML = `
          <div class="glass-compare-view">
            <div class="glass-compare-item">
              <div class="glass-compare-label">原文</div>
              <div class="glass-compare-content">${this.formatAIContent(this.aiResultData.originalText)}</div>
            </div>
            <div class="glass-compare-divider"></div>
            <div class="glass-compare-item">
              <div class="glass-compare-label">译文</div>
              <div class="glass-compare-content">${this.aiResultData.isLoading && !this.aiResultData.content ? this.getLoadingHTML() : this.formatAIContent(this.aiResultData.content)}</div>
            </div>
          </div>
        `;
      } else {
        contentEl.innerHTML = this.aiResultData.isLoading && !this.aiResultData.content
          ? this.getLoadingHTML()
          : this.formatAIContent(this.aiResultData.content);
      }
    }

    // Update stop button visibility based on loading state
    if (stopBtn) {
      stopBtn.style.display = this.aiResultData.isLoading ? 'flex' : 'none';
    }
  }

  private toggleCompareMode(): void {
    if (!this.shadowRoot) return;
    const contentEl = this.shadowRoot.querySelector('.glass-ai-content');
    if (contentEl) {
      const isCompare = contentEl.getAttribute('data-compare') === 'true';
      contentEl.setAttribute('data-compare', isCompare ? 'false' : 'true');

      // Update panel width for compare mode
      const panel = this.shadowRoot.querySelector('.glass-panel');
      panel?.classList.toggle('glass-panel-wide', !isCompare);

      this.updateAIResultContent();
    }
  }

  private showCopyFeedback(btn: HTMLButtonElement): void {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 1500);
  }

  // Settings Views
  private getSettingsViewHTML(): string {
    // Use tempConfig if available, otherwise use config
    const config = this.tempConfig || this.config;
    const isCustomProvider = config.apiProvider === 'custom';
    const screenshotConfig = config.screenshot || DEFAULT_SCREENSHOT_CONFIG;
    const historyConfig = config.history || DEFAULT_HISTORY_CONFIG;

    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="settings">
          <span class="glass-command-tag-icon">${icons.settings}</span>
          <span class="glass-command-tag-label">设置</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input"
          placeholder=""
          autocomplete="off"
          spellcheck="false"
          readonly
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body glass-settings-body">
        <div class="glass-settings-flat">
          <!-- 外观 -->
          <div class="glass-settings-section">
            <div class="glass-settings-section-title">外观</div>
            <div class="glass-form-group">
              <label class="glass-form-label">主题</label>
              <select class="glass-select" id="theme-select">
                <option value="system"${config.theme === 'system' ? ' selected' : ''}>跟随系统</option>
                <option value="dark"${config.theme === 'dark' ? ' selected' : ''}>深色</option>
                <option value="light"${config.theme === 'light' ? ' selected' : ''}>浅色</option>
              </select>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">选中文本弹出框</label>
              <label class="glass-toggle">
                <input type="checkbox" id="show-popover-toggle" ${config.showSelectionPopover !== false ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
            <div class="glass-form-group" id="popover-position-group" style="display: ${config.showSelectionPopover !== false ? 'block' : 'none'}">
              <label class="glass-form-label">弹出位置</label>
              <select class="glass-select" id="popover-position-select">
                <option value="above"${config.popoverPosition === 'above' ? ' selected' : ''}>选中文本上方</option>
                <option value="below"${config.popoverPosition === 'below' ? ' selected' : ''}>选中文本下方</option>
              </select>
            </div>
          </div>

          <!-- 语言 -->
          <div class="glass-settings-section">
            <div class="glass-settings-section-title">语言</div>
            <div class="glass-form-group">
              <label class="glass-form-label">翻译目标语言</label>
              <select class="glass-select" id="translate-lang-select">
                <option value="zh-CN"${config.preferredLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
                <option value="zh-TW"${config.preferredLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
                <option value="en"${config.preferredLanguage === 'en' ? ' selected' : ''}>English</option>
                <option value="ja"${config.preferredLanguage === 'ja' ? ' selected' : ''}>日本語</option>
                <option value="ko"${config.preferredLanguage === 'ko' ? ' selected' : ''}>한국어</option>
                <option value="es"${config.preferredLanguage === 'es' ? ' selected' : ''}>Español</option>
                <option value="fr"${config.preferredLanguage === 'fr' ? ' selected' : ''}>Français</option>
                <option value="de"${config.preferredLanguage === 'de' ? ' selected' : ''}>Deutsch</option>
              </select>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">总结输出语言</label>
              <select class="glass-select" id="summary-lang-select">
                <option value="auto"${config.summaryLanguage === 'auto' ? ' selected' : ''}>自动检测</option>
                <option value="zh-CN"${config.summaryLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
                <option value="zh-TW"${config.summaryLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
                <option value="en"${config.summaryLanguage === 'en' ? ' selected' : ''}>English</option>
                <option value="ja"${config.summaryLanguage === 'ja' ? ' selected' : ''}>日本語</option>
              </select>
            </div>
          </div>

          <!-- AI 服务 -->
          <div class="glass-settings-section">
            <div class="glass-settings-section-title">AI 服务</div>
            <div class="glass-form-group">
              <label class="glass-form-label">服务商</label>
              <select class="glass-select" id="api-provider-select">
                <option value="groq"${config.apiProvider === 'groq' ? ' selected' : ''}>Groq (免费)</option>
                <option value="openai"${config.apiProvider === 'openai' ? ' selected' : ''}>OpenAI</option>
                <option value="anthropic"${config.apiProvider === 'anthropic' ? ' selected' : ''}>Anthropic</option>
                <option value="gemini"${config.apiProvider === 'gemini' ? ' selected' : ''}>Google Gemini</option>
                <option value="custom"${config.apiProvider === 'custom' ? ' selected' : ''}>自定义</option>
              </select>
              <span class="glass-form-hint" id="api-key-hint">${this.getAPIKeyHint(config.apiProvider)}</span>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">API Key</label>
              <input type="password" class="glass-input-field" id="api-key-input" value="${config.apiKey || ''}" placeholder="输入 API Key">
            </div>
            <div class="glass-form-group" id="custom-url-group" style="display: ${isCustomProvider ? 'block' : 'none'}">
              <label class="glass-form-label">API URL</label>
              <input type="text" class="glass-input-field" id="custom-url-input" value="${config.customApiUrl || ''}" placeholder="https://api.example.com/v1/chat/completions">
            </div>
            <div class="glass-form-group" id="custom-model-group" style="display: ${isCustomProvider ? 'block' : 'none'}">
              <label class="glass-form-label">模型名称</label>
              <input type="text" class="glass-input-field" id="custom-model-input" value="${config.customModel || ''}" placeholder="gpt-4">
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">流式传输</label>
              <label class="glass-toggle">
                <input type="checkbox" id="streaming-toggle" ${config.useStreaming ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 截图 -->
          <div class="glass-settings-section">
            <div class="glass-settings-section-title">截图</div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">保存到文件</label>
              <label class="glass-toggle">
                <input type="checkbox" id="save-to-file" ${screenshotConfig.saveToFile ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">复制到剪贴板</label>
              <label class="glass-toggle">
                <input type="checkbox" id="copy-to-clipboard" ${screenshotConfig.copyToClipboard ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">AI 分析</label>
              <label class="glass-toggle">
                <input type="checkbox" id="enable-ai" ${screenshotConfig.enableAI ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">默认 AI 操作</label>
              <select class="glass-select" id="default-ai-action">
                <option value="none"${screenshotConfig.defaultAIAction === 'none' ? ' selected' : ''}>无</option>
                <option value="ask"${screenshotConfig.defaultAIAction === 'ask' ? ' selected' : ''}>询问</option>
                <option value="describe"${screenshotConfig.defaultAIAction === 'describe' ? ' selected' : ''}>描述</option>
              </select>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">AI 生图</label>
              <label class="glass-toggle">
                <input type="checkbox" id="enable-image-gen" ${screenshotConfig.enableImageGen ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
            </div>
            <div id="image-gen-settings" style="display: ${screenshotConfig.enableImageGen ? 'block' : 'none'}">
              <div class="glass-form-group">
                <label class="glass-form-label">生图服务</label>
                <select class="glass-select" id="image-gen-provider">
                  <option value="openai"${screenshotConfig.imageGenProvider === 'openai' ? ' selected' : ''}>OpenAI DALL-E</option>
                  <option value="custom"${screenshotConfig.imageGenProvider === 'custom' ? ' selected' : ''}>自定义</option>
                </select>
              </div>
              <div class="glass-form-group" id="custom-image-gen-url-group" style="display: ${screenshotConfig.imageGenProvider === 'custom' ? 'block' : 'none'}">
                <label class="glass-form-label">自定义生图 API</label>
                <input type="text" class="glass-input-field" id="custom-image-gen-url" value="${screenshotConfig.customImageGenUrl || ''}" placeholder="https://api.example.com/v1/images/generations">
              </div>
              <div class="glass-form-group">
                <label class="glass-form-label">图片尺寸</label>
                <select class="glass-select" id="image-size-select">
                  <option value="1024x1024"${screenshotConfig.imageSize === '1024x1024' ? ' selected' : ''}>1024 × 1024</option>
                  <option value="1792x1024"${screenshotConfig.imageSize === '1792x1024' ? ' selected' : ''}>1792 × 1024 (横)</option>
                  <option value="1024x1792"${screenshotConfig.imageSize === '1024x1792' ? ' selected' : ''}>1024 × 1792 (竖)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- 历史记录 -->
          <div class="glass-settings-section">
            <div class="glass-settings-section-title">历史记录</div>
            <div class="glass-form-group">
              <label class="glass-form-label">最大保存数量</label>
              <select class="glass-select" id="history-max-count">
                <option value="50" ${historyConfig.maxSaveCount === 50 ? 'selected' : ''}>50 条</option>
                <option value="100" ${historyConfig.maxSaveCount === 100 ? 'selected' : ''}>100 条</option>
                <option value="200" ${historyConfig.maxSaveCount === 200 ? 'selected' : ''}>200 条</option>
                <option value="500" ${historyConfig.maxSaveCount === 500 ? 'selected' : ''}>500 条</option>
              </select>
              <span class="glass-form-hint">超过此数量时，最旧的记录将被自动删除</span>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">面板显示数量</label>
              <select class="glass-select" id="history-display-count">
                <option value="5" ${historyConfig.panelDisplayCount === 5 ? 'selected' : ''}>5 条</option>
                <option value="10" ${historyConfig.panelDisplayCount === 10 ? 'selected' : ''}>10 条</option>
                <option value="15" ${historyConfig.panelDisplayCount === 15 ? 'selected' : ''}>15 条</option>
                <option value="20" ${historyConfig.panelDisplayCount === 20 ? 'selected' : ''}>20 条</option>
              </select>
              <span class="glass-form-hint">命令面板中显示的最近记录数量</span>
            </div>
            <div class="glass-form-group">
              <button id="clear-history" class="glass-btn glass-btn-danger">清空所有历史记录</button>
            </div>
          </div>

          <!-- 重置 -->
          <div class="glass-settings-section">
            <div class="glass-form-group">
              <button class="glass-btn glass-btn-reset">重置为默认设置</button>
            </div>
          </div>
        </div>
      </div>
      <div class="glass-footer glass-settings-footer">
        <div class="glass-settings-footer-actions">
          <button class="glass-btn glass-btn-cancel">取消</button>
          <button class="glass-btn glass-btn-primary glass-btn-save">保存</button>
        </div>
      </div>
    `;
  }

  private bindSettingsEvents(): void {
    if (!this.shadowRoot || !this.tempConfig) return;

    const tempConfig = this.tempConfig;
    const screenshotConfig = tempConfig.screenshot || { ...DEFAULT_SCREENSHOT_CONFIG };
    const historyConfig = tempConfig.history || { ...DEFAULT_HISTORY_CONFIG };

    // Drag events on search area
    const searchArea = this.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;
    if (searchArea) {
      searchArea.addEventListener('mousedown', this.handleDragStart);
    }

    // Helper to mark settings as changed
    const markChanged = () => { this.settingsChanged = true; };

    // Command tag close button - same as cancel
    const tagClose = this.shadowRoot.querySelector('.glass-command-tag-close');
    tagClose?.addEventListener('click', () => this.cancelSettings());

    // Cancel button
    const cancelBtn = this.shadowRoot.querySelector('.glass-btn-cancel');
    cancelBtn?.addEventListener('click', () => this.cancelSettings());

    // Save button
    const saveBtn = this.shadowRoot.querySelector('.glass-btn-save');
    saveBtn?.addEventListener('click', () => this.saveSettings());

    // Theme select
    const themeSelect = this.shadowRoot.querySelector('#theme-select') as HTMLSelectElement;
    themeSelect?.addEventListener('change', () => {
      tempConfig.theme = themeSelect.value as 'dark' | 'light' | 'system';
      markChanged();
      // Preview theme change immediately
      this.updateTheme(tempConfig.theme);
      const panel = this.shadowRoot?.querySelector('.glass-panel');
      panel?.classList.remove('dark', 'light');
      panel?.classList.add(this.theme);
    });

    // Popover position select
    const popoverSelect = this.shadowRoot.querySelector('#popover-position-select') as HTMLSelectElement;
    popoverSelect?.addEventListener('change', () => {
      tempConfig.popoverPosition = popoverSelect.value as 'above' | 'below';
      markChanged();
    });

    // Show selection popover toggle
    const showPopoverToggle = this.shadowRoot.querySelector('#show-popover-toggle') as HTMLInputElement;
    const popoverPositionGroup = this.shadowRoot.querySelector('#popover-position-group') as HTMLElement;
    showPopoverToggle?.addEventListener('change', () => {
      tempConfig.showSelectionPopover = showPopoverToggle.checked;
      if (popoverPositionGroup) popoverPositionGroup.style.display = showPopoverToggle.checked ? 'block' : 'none';
      markChanged();
    });

    // Translate language select
    const translateSelect = this.shadowRoot.querySelector('#translate-lang-select') as HTMLSelectElement;
    translateSelect?.addEventListener('change', () => {
      tempConfig.preferredLanguage = translateSelect.value;
      markChanged();
    });

    // Summary language select
    const summarySelect = this.shadowRoot.querySelector('#summary-lang-select') as HTMLSelectElement;
    summarySelect?.addEventListener('change', () => {
      tempConfig.summaryLanguage = summarySelect.value;
      markChanged();
    });

    // Provider select
    const providerSelect = this.shadowRoot.querySelector('#api-provider-select') as HTMLSelectElement;
    const customUrlGroup = this.shadowRoot.querySelector('#custom-url-group') as HTMLElement;
    const customModelGroup = this.shadowRoot.querySelector('#custom-model-group') as HTMLElement;
    const apiKeyHint = this.shadowRoot.querySelector('#api-key-hint') as HTMLElement;

    providerSelect?.addEventListener('change', () => {
      const provider = providerSelect.value as MenuConfig['apiProvider'];
      const isCustom = provider === 'custom';
      if (customUrlGroup) customUrlGroup.style.display = isCustom ? 'block' : 'none';
      if (customModelGroup) customModelGroup.style.display = isCustom ? 'block' : 'none';
      if (apiKeyHint) apiKeyHint.textContent = this.getAPIKeyHint(provider);
      tempConfig.apiProvider = provider;
      markChanged();
    });

    // API Key input
    const apiKeyInput = this.shadowRoot.querySelector('#api-key-input') as HTMLInputElement;
    apiKeyInput?.addEventListener('input', () => {
      tempConfig.apiKey = apiKeyInput.value || undefined;
      markChanged();
    });

    // Custom URL input
    const customUrlInput = this.shadowRoot.querySelector('#custom-url-input') as HTMLInputElement;
    customUrlInput?.addEventListener('input', () => {
      tempConfig.customApiUrl = customUrlInput.value || undefined;
      markChanged();
    });

    // Custom model input
    const customModelInput = this.shadowRoot.querySelector('#custom-model-input') as HTMLInputElement;
    customModelInput?.addEventListener('input', () => {
      tempConfig.customModel = customModelInput.value || undefined;
      markChanged();
    });

    // Streaming toggle
    const streamingToggle = this.shadowRoot.querySelector('#streaming-toggle') as HTMLInputElement;
    streamingToggle?.addEventListener('change', () => {
      tempConfig.useStreaming = streamingToggle.checked;
      markChanged();
    });

    // Screenshot settings
    const saveToFile = this.shadowRoot.querySelector('#save-to-file') as HTMLInputElement;
    saveToFile?.addEventListener('change', () => {
      screenshotConfig.saveToFile = saveToFile.checked;
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    const copyToClipboard = this.shadowRoot.querySelector('#copy-to-clipboard') as HTMLInputElement;
    copyToClipboard?.addEventListener('change', () => {
      screenshotConfig.copyToClipboard = copyToClipboard.checked;
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    const enableAI = this.shadowRoot.querySelector('#enable-ai') as HTMLInputElement;
    enableAI?.addEventListener('change', () => {
      screenshotConfig.enableAI = enableAI.checked;
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    const defaultAIAction = this.shadowRoot.querySelector('#default-ai-action') as HTMLSelectElement;
    defaultAIAction?.addEventListener('change', () => {
      screenshotConfig.defaultAIAction = defaultAIAction.value as ScreenshotConfig['defaultAIAction'];
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    // Image gen toggle
    const enableImageGen = this.shadowRoot.querySelector('#enable-image-gen') as HTMLInputElement;
    const imageGenSettings = this.shadowRoot.querySelector('#image-gen-settings') as HTMLElement;
    enableImageGen?.addEventListener('change', () => {
      screenshotConfig.enableImageGen = enableImageGen.checked;
      tempConfig.screenshot = screenshotConfig;
      if (imageGenSettings) imageGenSettings.style.display = enableImageGen.checked ? 'block' : 'none';
      markChanged();
    });

    // Image gen provider
    const imageGenProvider = this.shadowRoot.querySelector('#image-gen-provider') as HTMLSelectElement;
    const customImageGenUrlGroup = this.shadowRoot.querySelector('#custom-image-gen-url-group') as HTMLElement;
    imageGenProvider?.addEventListener('change', () => {
      screenshotConfig.imageGenProvider = imageGenProvider.value as ScreenshotConfig['imageGenProvider'];
      tempConfig.screenshot = screenshotConfig;
      if (customImageGenUrlGroup) customImageGenUrlGroup.style.display = imageGenProvider.value === 'custom' ? 'block' : 'none';
      markChanged();
    });

    // Custom image gen URL
    const customImageGenUrl = this.shadowRoot.querySelector('#custom-image-gen-url') as HTMLInputElement;
    customImageGenUrl?.addEventListener('input', () => {
      screenshotConfig.customImageGenUrl = customImageGenUrl.value || undefined;
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    // Image size
    const imageSizeSelect = this.shadowRoot.querySelector('#image-size-select') as HTMLSelectElement;
    imageSizeSelect?.addEventListener('change', () => {
      screenshotConfig.imageSize = imageSizeSelect.value as ScreenshotConfig['imageSize'];
      tempConfig.screenshot = screenshotConfig;
      markChanged();
    });

    // History settings
    const maxCount = this.shadowRoot.querySelector('#history-max-count') as HTMLSelectElement;
    maxCount?.addEventListener('change', () => {
      historyConfig.maxSaveCount = parseInt(maxCount.value, 10);
      tempConfig.history = historyConfig;
      markChanged();
    });

    const displayCount = this.shadowRoot.querySelector('#history-display-count') as HTMLSelectElement;
    displayCount?.addEventListener('change', () => {
      historyConfig.panelDisplayCount = parseInt(displayCount.value, 10);
      tempConfig.history = historyConfig;
      markChanged();
    });

    // Clear history (immediate action, not affected by save/cancel)
    const clearBtn = this.shadowRoot.querySelector('#clear-history');
    clearBtn?.addEventListener('click', async () => {
      if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
        const { clearAllTasks } = await import('../utils/taskStorage');
        await clearAllTasks();
        this.recentSavedTasks = [];
        this.showToast('历史记录已清空');
      }
    });

    // Reset button (immediate action)
    const resetBtn = this.shadowRoot.querySelector('.glass-btn-reset');
    resetBtn?.addEventListener('click', async () => {
      if (confirm('确定要重置所有设置吗？')) {
        await saveConfig(DEFAULT_CONFIG);
        await saveGlobalMenuItems(DEFAULT_GLOBAL_MENU);
        this.config = { ...DEFAULT_CONFIG };
        this.tempConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.settingsMenuItems = [...DEFAULT_GLOBAL_MENU];
        this.settingsChanged = false;
        this.showToast('已重置为默认设置');
        this.renderCurrentView(true, true);
      }
    });

    // Escape key - same as cancel
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelSettings();
      }
    });
  }

  private cancelSettings(): void {
    // Restore original theme if changed
    if (this.settingsChanged && this.tempConfig?.theme !== this.config.theme) {
      this.updateTheme(this.config.theme);
      const panel = this.shadowRoot?.querySelector('.glass-panel');
      panel?.classList.remove('dark', 'light');
      panel?.classList.add(this.theme);
    }
    this.tempConfig = null;
    this.settingsChanged = false;
    this.activeCommand = null;
    this.currentView = 'commands';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private async saveSettings(): Promise<void> {
    if (!this.tempConfig) return;

    // Save to storage
    await saveConfig(this.tempConfig);
    this.config = this.tempConfig;

    // Apply history settings if changed
    if (this.tempConfig.history) {
      await enforceMaxCount(this.tempConfig.history.maxSaveCount);
      await this.loadRecentSavedTasks();
    }

    this.tempConfig = null;
    this.settingsChanged = false;
    this.showToast('设置已保存');

    this.activeCommand = null;
    this.currentView = 'commands';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getAPIKeyHint(provider: string): string {
    if (provider === 'groq') return '使用 Groq 免费服务无需配置 API Key';
    if (provider === 'custom') return '如果你的 API 需要认证，请填写 API Key';
    return `请填写你的 ${provider.toUpperCase()} API Key`;
  }

  private showToast(message: string): void {
    if (!this.shadowRoot) return;

    // Remove existing toast
    this.shadowRoot.querySelector('.glass-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = 'glass-toast';
    toast.textContent = message;
    this.shadowRoot.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 2000);
  }

  // Menu Settings
  private getMenuSettingsHTML(): string {
    const items = this.settingsMenuItems.length > 0 ? this.settingsMenuItems : DEFAULT_GLOBAL_MENU;
    const sortedItems = [...items].sort((a, b) => a.order - b.order);

    return `
      <div class="glass-header">
        <button class="glass-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="glass-header-title">菜单管理</span>
        <div class="glass-header-actions"></div>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body">
        <div class="glass-menu-list" id="menu-list">
          ${sortedItems.map(item => this.getMenuItemHTML(item)).join('')}
        </div>
      </div>
      <div class="glass-footer">
        <button class="glass-btn glass-btn-add">+ 添加自定义菜单项</button>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getMenuItemHTML(item: MenuItem): string {
    const isCustom = (item as CustomMenuItem).isCustom;
    return `
      <div class="glass-menu-item" data-id="${item.id}" draggable="true">
        <span class="glass-menu-drag">⋮⋮</span>
        <span class="glass-menu-icon">${item.customIcon || item.icon}</span>
        <span class="glass-menu-label">${item.customLabel || item.label}</span>
        ${isCustom ? `
          <button class="glass-menu-btn glass-menu-edit" data-id="${item.id}" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
            </svg>
          </button>
          <button class="glass-menu-btn glass-menu-delete" data-id="${item.id}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
        <label class="glass-toggle glass-toggle-small">
          <input type="checkbox" data-id="${item.id}" ${item.enabled ? 'checked' : ''}>
          <span class="glass-toggle-slider"></span>
        </label>
      </div>
    `;
  }

  private bindMenuSettingsEvents(): void {
    if (!this.shadowRoot) return;

    // Back button
    const backBtn = this.shadowRoot.querySelector('.glass-back-btn');
    backBtn?.addEventListener('click', () => this.popView());

    // Toggle switches
    this.shadowRoot.querySelectorAll('.glass-toggle input').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement;
        const id = input.dataset.id;
        const item = this.settingsMenuItems.find(m => m.id === id);
        if (item) {
          item.enabled = input.checked;
          await saveGlobalMenuItems(this.settingsMenuItems);
          this.showToast('菜单项已更新');
        }
      });
    });

    // Delete buttons
    this.shadowRoot.querySelectorAll('.glass-menu-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          this.settingsMenuItems = this.settingsMenuItems.filter(m => m.id !== id);
          await saveGlobalMenuItems(this.settingsMenuItems);
          this.renderCurrentView(true, true);
          this.showToast('菜单项已删除');
        }
      });
    });

    // Add button
    const addBtn = this.shadowRoot.querySelector('.glass-btn-add');
    addBtn?.addEventListener('click', () => {
      this.showToast('请在设置页面添加自定义菜单项');
    });

    // Setup drag and drop
    this.setupMenuDragDrop();

    // Escape key
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.popView();
      }
    });
  }

  private setupMenuDragDrop(): void {
    if (!this.shadowRoot) return;

    const list = this.shadowRoot.querySelector('#menu-list');
    if (!list) return;

    let draggedItem: HTMLElement | null = null;

    list.querySelectorAll('.glass-menu-item').forEach(item => {
      const el = item as HTMLElement;

      el.addEventListener('dragstart', () => {
        draggedItem = el;
        setTimeout(() => el.classList.add('dragging'), 0);
      });

      el.addEventListener('dragend', async () => {
        el.classList.remove('dragging');
        draggedItem = null;
        // Update order
        const items = list.querySelectorAll('.glass-menu-item');
        items.forEach((item, index) => {
          const id = (item as HTMLElement).dataset.id;
          const menuItem = this.settingsMenuItems.find(m => m.id === id);
          if (menuItem) menuItem.order = index;
        });
        await saveGlobalMenuItems(this.settingsMenuItems);
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (draggedItem && draggedItem !== el) {
          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if ((e as DragEvent).clientY < midY) {
            list.insertBefore(draggedItem, el);
          } else {
            list.insertBefore(draggedItem, el.nextSibling);
          }
        }
      });
    });
  }

  // Screenshot View
  private getScreenshotViewHTML(): string {
    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="screenshot">
          <span class="glass-command-tag-icon">${icons.screenshot || icons.camera || ''}</span>
          <span class="glass-command-tag-label">截图</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input"
          placeholder=""
          autocomplete="off"
          spellcheck="false"
          readonly
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body glass-screenshot-body">
        <div class="glass-screenshot-preview">
          <img src="${this.screenshotData?.dataUrl || ''}" alt="Screenshot" />
        </div>
        <div class="glass-screenshot-content">
          ${this.getScreenshotContentHTML()}
        </div>
      </div>
      <div class="glass-footer">
        <div class="glass-screenshot-actions">
          <button class="glass-btn glass-btn-save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            保存
          </button>
          <button class="glass-btn glass-btn-copy-img">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            复制
          </button>
          <button class="glass-btn glass-btn-ask">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            询问AI
          </button>
          <button class="glass-btn glass-btn-describe">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            描述
          </button>
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getScreenshotContentHTML(): string {
    if (!this.screenshotData) return '';

    if (this.screenshotData.isLoading) {
      return `
        <div class="glass-loading">
          <div class="glass-loading-spinner"></div>
          <span>处理中...</span>
        </div>
      `;
    }

    if (this.screenshotData.generatedImageUrl) {
      return `
        <div class="glass-screenshot-result">
          <div class="glass-screenshot-generated-label">生成的图片</div>
          <img class="glass-screenshot-generated-img" src="${this.screenshotData.generatedImageUrl}" alt="Generated" />
          <div class="glass-screenshot-result-actions">
            <button class="glass-btn glass-btn-copy-result">复制图片</button>
            <button class="glass-btn glass-btn-save-result">保存图片</button>
          </div>
        </div>
      `;
    }

    if (this.screenshotData.result) {
      return `
        <div class="glass-screenshot-result">
          <div class="glass-screenshot-result-label">AI 分析结果</div>
          <div class="glass-screenshot-result-text">${this.escapeHtml(this.screenshotData.result)}</div>
          <div class="glass-screenshot-result-actions">
            <button class="glass-btn glass-btn-copy-result">复制结果</button>
          </div>
        </div>
      `;
    }

    return '';
  }

  private bindScreenshotViewEvents(): void {
    if (!this.shadowRoot) return;

    // Drag events on search area
    const searchArea = this.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;
    if (searchArea) {
      searchArea.addEventListener('mousedown', this.handleDragStart);
    }

    // Command tag close button
    const closeBtn = this.shadowRoot.querySelector('.glass-command-tag-close');
    closeBtn?.addEventListener('click', () => {
      this.screenshotData = null;
      this.screenshotCallbacks?.onClose?.();
      this.screenshotCallbacks = null;
      this.activeCommand = null;
      this.currentView = 'commands';
      this.renderCurrentView(true, true);
    });

    // Save button
    const saveBtn = this.shadowRoot.querySelector('.glass-btn-save');
    saveBtn?.addEventListener('click', () => {
      this.screenshotCallbacks?.onSave?.();
    });

    // Copy button
    const copyBtn = this.shadowRoot.querySelector('.glass-btn-copy-img');
    copyBtn?.addEventListener('click', () => {
      this.screenshotCallbacks?.onCopy?.();
    });

    // Ask AI button
    const askBtn = this.shadowRoot.querySelector('.glass-btn-ask');
    askBtn?.addEventListener('click', () => {
      const question = prompt('请输入你想问的问题：');
      if (question) {
        this.screenshotData!.isLoading = true;
        this.renderScreenshotContent();
        this.screenshotCallbacks?.onAskAI?.(question);
      }
    });

    // Describe button
    const describeBtn = this.shadowRoot.querySelector('.glass-btn-describe');
    describeBtn?.addEventListener('click', () => {
      this.screenshotData!.isLoading = true;
      this.renderScreenshotContent();
      this.screenshotCallbacks?.onDescribe?.();
    });

    // Copy result button
    this.shadowRoot.querySelector('.glass-btn-copy-result')?.addEventListener('click', () => {
      if (this.screenshotData?.result) {
        navigator.clipboard.writeText(this.screenshotData.result);
        this.showToast('已复制结果');
      }
    });

    // Escape key
    document.removeEventListener('keydown', this.handleScreenshotKeydown);
    document.addEventListener('keydown', this.handleScreenshotKeydown);
  }

  private handleScreenshotKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.currentView === 'screenshot') {
      e.preventDefault();
      document.removeEventListener('keydown', this.handleScreenshotKeydown);
      this.screenshotData = null;
      this.screenshotCallbacks?.onClose?.();
      this.screenshotCallbacks = null;
      this.activeCommand = null;
      this.currentView = 'commands';
      this.renderCurrentView(true, true);
    }
  };

  // Load settings menu items
  public async loadSettingsMenuItems(): Promise<void> {
    try {
      const data = await getStorageData();
      this.settingsMenuItems = data.globalMenuItems;
    } catch {
      this.settingsMenuItems = [...DEFAULT_GLOBAL_MENU];
    }
  }

  private filterCommands(): void {
    if (!this.searchQuery) {
      this.filteredItems = this.sortByRecent(this.menuItems);
    } else {
      this.filteredItems = this.menuItems.filter(item => {
        const label = (item.customLabel || item.label).toLowerCase();
        const action = item.action.toLowerCase();
        return label.includes(this.searchQuery) || action.includes(this.searchQuery);
      });
    }
    this.selectedIndex = 0;
    this.renderCommands();
  }

  private getFilteredRecentTasks(): SavedTask[] {
    if (!this.searchQuery) {
      return this.recentSavedTasks;
    }
    return this.recentSavedTasks.filter(task => {
      const title = task.title.toLowerCase();
      const content = task.content.toLowerCase();
      const actionType = task.actionType.toLowerCase();
      const sourceTitle = (task.sourceTitle || '').toLowerCase();
      const originalText = (task.originalText || '').toLowerCase();
      return title.includes(this.searchQuery) ||
             content.includes(this.searchQuery) ||
             actionType.includes(this.searchQuery) ||
             sourceTitle.includes(this.searchQuery) ||
             originalText.includes(this.searchQuery);
    });
  }

  private renderCommands(): void {
    if (!this.shadowRoot) return;

    const container = this.shadowRoot.querySelector('.glass-commands');
    if (!container) return;

    if (this.filteredItems.length === 0) {
      container.innerHTML = `
        <div class="glass-empty">
          <span>没有匹配的命令</span>
        </div>
      `;
    } else {
      container.innerHTML = this.filteredItems.map((item, index) => {
        const isSelected = index === this.selectedIndex;
        const displayIcon = item.customIcon || item.icon;
        const displayLabel = item.customLabel || item.label;
        const shortcutKey = index < 9 && !this.searchQuery ? index + 1 : null;
        const isRecent = this.recentCommands.includes(item.id) && !this.searchQuery;

        return `
          <div class="glass-item ${isSelected ? 'selected' : ''}" data-index="${index}">
            <div class="glass-item-icon">${displayIcon}</div>
            <div class="glass-item-label">${this.escapeHtml(displayLabel)}</div>
            ${isRecent ? '<span class="glass-item-badge">最近</span>' : ''}
            ${shortcutKey ? `<kbd class="glass-item-key">${shortcutKey}</kbd>` : ''}
          </div>
        `;
      }).join('');

      // Bind events
      container.querySelectorAll('.glass-item').forEach((el) => {
        el.addEventListener('click', () => {
          this.selectedIndex = parseInt(el.getAttribute('data-index') || '0');
          this.executeSelected();
        });
        el.addEventListener('mouseenter', () => {
          this.selectedIndex = parseInt(el.getAttribute('data-index') || '0');
          this.updateSelection();
        });
      });
    }

    // Render minimized tasks section
    this.renderMinimizedTasks();
    // Render recent saved tasks section
    this.renderRecentTasks();
  }

  private renderMinimizedTasks(): void {
    if (!this.shadowRoot) return;

    const section = this.shadowRoot.querySelector('.glass-minimized-section');
    if (!section) return;

    if (this.minimizedTasks.length === 0) {
      section.innerHTML = '';
      return;
    }

    section.innerHTML = `
      <div class="glass-section-label">进行中</div>
      ${this.minimizedTasks.map(task => {
        const icon = task.iconHtml || this.getDefaultMinimizedIcon();
        const meta = this.getTaskMetaInfo(task);
        return `
          <div class="glass-minimized-task" data-task-id="${task.id}">
            <div class="glass-task-icon">${icon}</div>
            <div class="glass-task-info">
              <div class="glass-task-title">${this.escapeHtml(task.title)}</div>
              <div class="glass-task-meta">${meta}</div>
            </div>
            ${task.isLoading ? '<div class="glass-minimized-task-loading"></div>' : ''}
            <button class="glass-minimized-close" data-task-id="${task.id}">&times;</button>
          </div>
        `;
      }).join('')}
    `;

    // Bind click events for restoring tasks
    section.querySelectorAll('.glass-minimized-task').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't restore if clicking the close button
        if (target.classList.contains('glass-minimized-close')) return;
        const taskId = el.getAttribute('data-task-id');
        if (taskId) {
          this.restoreMinimizedTask(taskId);
        }
      });
    });

    // Bind click events for dismissing tasks
    section.querySelectorAll('.glass-minimized-close').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = el.getAttribute('data-task-id');
        if (taskId) {
          this.dismissMinimizedTask(taskId);
        }
      });
    });
  }

  private renderRecentTasks(): void {
    if (!this.shadowRoot) return;

    const section = this.shadowRoot.querySelector('.glass-recent-section');
    if (!section) return;

    const filteredTasks = this.getFilteredRecentTasks();

    if (filteredTasks.length === 0) {
      section.innerHTML = '';
      return;
    }

    section.innerHTML = `
      <div class="glass-section-label">最近记录</div>
      ${filteredTasks.map(task => {
        const icon = this.getActionIcon(task.actionType);
        const meta = this.getSavedTaskMetaInfo(task);
        return `
          <div class="glass-recent-task" data-task-id="${task.id}">
            <div class="glass-task-icon">${icon}</div>
            <div class="glass-task-info">
              <div class="glass-task-title">${this.escapeHtml(task.title)}</div>
              <div class="glass-task-meta">${meta}</div>
            </div>
            <button class="glass-recent-close" data-task-id="${task.id}">&times;</button>
          </div>
        `;
      }).join('')}
    `;

    // Bind click events for restoring saved tasks
    section.querySelectorAll('.glass-recent-task').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't restore if clicking the close button
        if (target.classList.contains('glass-recent-close')) return;
        const taskId = el.getAttribute('data-task-id');
        if (taskId) {
          const task = this.recentSavedTasks.find(t => t.id === taskId);
          if (task) {
            this.restoreSavedTask(task);
          }
        }
      });
    });

    // Bind click events for deleting saved tasks
    section.querySelectorAll('.glass-recent-close').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = el.getAttribute('data-task-id');
        if (taskId) {
          this.deleteSavedTask(taskId);
        }
      });
    });
  }

  private getActionIcon(actionType: string): string {
    const iconMap: Record<string, string> = {
      translate: icons.translate,
      summarize: icons.summarize,
      summarizePage: icons.summarizePage,
      explain: icons.explain,
      rewrite: icons.rewrite,
      codeExplain: icons.codeExplain,
    };
    return iconMap[actionType] || icons.messageCircle;
  }

  private getSavedTaskMetaInfo(task: SavedTask): string {
    const parts: string[] = [];

    // Time info
    const timeAgo = this.formatTimeAgo(task.savedAt);
    parts.push(timeAgo);

    // Type-specific info
    if (task.actionType === 'summarizePage') {
      // For page summary: show page title and source site
      if (task.sourceTitle) {
        parts.push(task.sourceTitle);
      } else if (task.sourceUrl) {
        try {
          parts.push(new URL(task.sourceUrl).hostname);
        } catch {
          // ignore invalid URL
        }
      }
    } else if (task.resultType === 'translate') {
      // For translation: show source site domain
      if (task.sourceUrl) {
        try {
          parts.push(new URL(task.sourceUrl).hostname);
        } catch {
          // ignore invalid URL
        }
      }
      // Also show original text preview
      if (task.originalText) {
        const preview = task.originalText.slice(0, 30) + (task.originalText.length > 30 ? '...' : '');
        parts.push(`"${preview}"`);
      }
    }

    return parts.join(' · ');
  }

  private getTaskMetaInfo(task: MinimizedTask): string {
    const parts: string[] = [];

    // Time info
    const timeAgo = this.formatTimeAgo(task.createdAt);
    parts.push(timeAgo);

    // Type-specific info
    if (task.actionType === 'summarizePage') {
      // For page summary: show page title or source site
      if (task.sourceTitle) {
        parts.push(task.sourceTitle);
      } else if (task.sourceUrl) {
        try {
          parts.push(new URL(task.sourceUrl).hostname);
        } catch {
          // ignore invalid URL
        }
      }
    } else if (task.resultType === 'translate') {
      // For translation: show source site domain
      if (task.sourceUrl) {
        try {
          parts.push(new URL(task.sourceUrl).hostname);
        } catch {
          // ignore invalid URL
        }
      }
      // Also show original text preview
      if (task.originalText) {
        const preview = task.originalText.slice(0, 30) + (task.originalText.length > 30 ? '...' : '');
        parts.push(`"${preview}"`);
      }
    }

    // Loading status
    if (task.isLoading) {
      parts.push('处理中');
    }

    return parts.join(' · ');
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return new Date(timestamp).toLocaleDateString();
  }

  public async loadRecentSavedTasks(): Promise<void> {
    try {
      const displayCount = this.config.history?.panelDisplayCount || DEFAULT_HISTORY_CONFIG.panelDisplayCount;
      this.recentSavedTasks = await getAllTasks(displayCount);
      // Re-render if visible
      if (this.shadowRoot && this.currentView === 'commands') {
        this.renderRecentTasks();
      }
    } catch (error) {
      console.error('Failed to load recent saved tasks:', error);
      this.recentSavedTasks = [];
    }
  }

  private async deleteSavedTask(taskId: string): Promise<void> {
    try {
      await deleteTask(taskId);
      this.recentSavedTasks = this.recentSavedTasks.filter(t => t.id !== taskId);
      this.renderRecentTasks();
    } catch (error) {
      console.error('Failed to delete saved task:', error);
    }
  }

  private restoreSavedTask(task: SavedTask): void {
    // Create a mock active command to show the command tag
    const actionLabelMap: Record<string, string> = {
      translate: '翻译',
      summarize: '总结',
      summarizePage: '总结页面',
      explain: '解释',
      rewrite: '改写',
      codeExplain: '代码解释',
    };

    this.activeCommand = {
      id: `saved_${task.id}`,
      icon: this.getActionIcon(task.actionType),
      label: actionLabelMap[task.actionType] || task.title,
      action: task.actionType,
      enabled: true,
      order: 0,
    };

    // Show the saved task content in AI result view
    this.aiResultData = {
      title: task.title,
      content: task.content,
      originalText: task.originalText,
      isLoading: false,
      resultType: task.resultType,
      translateTargetLanguage: task.translateTargetLanguage,
      actionType: task.actionType,
      sourceUrl: task.sourceUrl,
      sourceTitle: task.sourceTitle,
      createdAt: task.createdAt,
    };

    // Set up callbacks for translate actions
    if (task.actionType === 'translate' && task.originalText) {
      const originalText = task.originalText;
      this.aiResultCallbacks = {
        onStop: () => abortAllRequests(),
        onTranslateLanguageChange: async (targetLang: string) => {
          await this.retranslate(originalText, targetLang);
        },
      };
    } else {
      this.aiResultCallbacks = {};
    }

    // Stay in commands view to show the command tag style
    this.currentView = 'commands';
    // Re-render commands view with active command set
    this.renderCurrentView(false, true);
  }

  private async retranslate(originalText: string, targetLang: string): Promise<void> {
    if (!this.aiResultData) return;

    const onChunk: OnChunkCallback | undefined = this.config.useStreaming
      ? (_chunk: string, fullText: string) => {
          this.streamUpdate(_chunk, fullText);
        }
      : undefined;

    const systemPrompt = getTranslatePrompt(targetLang);

    try {
      const result = await callAI(originalText, systemPrompt, this.config, onChunk);

      if (result.success && result.result) {
        this.updateAIResult(result.result);
      } else {
        this.updateAIResult(result.error || '翻译失败');
      }
    } catch (error) {
      this.updateAIResult(`错误: ${error}`);
    }
  }

  private updateSelection(): void {
    if (!this.shadowRoot) return;

    const items = this.shadowRoot.querySelectorAll('.glass-item');
    items.forEach((el, index) => {
      if (index === this.selectedIndex) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });
  }

  private selectNext(): void {
    if (this.filteredItems.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
    this.updateSelection();
  }

  private selectPrev(): void {
    if (this.filteredItems.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    this.updateSelection();
  }

  private async executeSelected(): Promise<void> {
    // If no filtered items but has search query, start quick ask
    if (this.filteredItems.length === 0) {
      // Get the original input value (preserving case)
      const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
      const question = input?.value?.trim();
      if (question) {
        this.startQuickAsk(question);
      }
      return;
    }

    const item = this.filteredItems[this.selectedIndex];
    if (!item) return;

    await this.saveRecentCommand(item.id);

    // Handle settings action specially - switch to settings view instead of closing
    if (item.action === 'settings') {
      await this.loadSettingsMenuItems();
      // Initialize temp config for editing
      this.tempConfig = JSON.parse(JSON.stringify(this.config));
      this.settingsChanged = false;
      this.currentView = 'settings';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    // AI actions will call showAIResult() which transitions the view,
    // so we should not hide the palette for these actions
    const aiActions = ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'];
    if (aiActions.includes(item.action)) {
      this.callbacks?.onSelect(item);
      return;
    }

    // BrowseTrail and ContextChat transition to their own views
    if (item.action === 'browseTrail') {
      this.showBrowseTrail();
      return;
    }
    if (item.action === 'contextChat') {
      this.showContextChat();
      return;
    }

    this.hide();
    this.callbacks?.onSelect(item);
  }

  // ========================================
  // Browse Trail View
  // ========================================

  private async showBrowseTrail(): Promise<void> {
    this.browseTrailSessions = await loadBrowseTrailSessions();
    this.browseTrailSearch = '';
    this.browseTrailDisplayCount = 50;
    this.activeCommand = {
      id: 'browseTrail',
      action: 'browseTrail',
      label: '浏览轨迹',
      icon: icons.history,
      enabled: true,
      order: 0,
    };
    this.currentView = 'browseTrail';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getBrowseTrailViewHTML(): string {
    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="browseTrail">
          <span class="glass-command-tag-icon">${icons.history}</span>
          <span class="glass-command-tag-label">浏览轨迹</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input"
          placeholder="搜索历史记录..."
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body">
        <div class="glass-trail-content">
          ${this.getBrowseTrailContentHTML()}
        </div>
      </div>
      <div class="glass-footer">
        <div class="glass-trail-footer-actions">
          <button class="glass-btn glass-btn-trail-clear">清空历史</button>
          <button class="glass-btn glass-btn-trail-export">导出</button>
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getBrowseTrailContentHTML(): string {
    // Flatten all entries
    const allEntries: TrailEntry[] = [];
    for (const session of this.browseTrailSessions) {
      allEntries.push(...session.entries);
    }
    allEntries.sort((a, b) => b.visitedAt - a.visitedAt);

    // Filter by search
    const query = this.browseTrailSearch.toLowerCase();
    const filtered = query
      ? allEntries.filter(e =>
          e.title.toLowerCase().includes(query) ||
          e.url.toLowerCase().includes(query) ||
          (e.summary?.toLowerCase().includes(query))
        )
      : allEntries;

    if (filtered.length === 0) {
      return `
        <div class="glass-trail-empty">
          <div class="glass-trail-empty-icon">${icons.history}</div>
          <div class="glass-trail-empty-text">
            ${query ? '没有找到匹配的记录' : '还没有浏览记录'}
          </div>
          <div class="glass-trail-empty-hint">
            ${query ? '试试其他关键词' : '浏览网页时会自动记录'}
          </div>
        </div>
      `;
    }

    // Progressive loading: only show up to displayCount
    const displayEntries = filtered.slice(0, this.browseTrailDisplayCount);
    const hasMore = filtered.length > this.browseTrailDisplayCount;

    // Group by date
    const groups = this.groupTrailByDate(displayEntries);

    const entriesHTML = Object.entries(groups).map(([date, entries]) => `
      <div class="glass-trail-group">
        <div class="glass-trail-date">${date}</div>
        <div class="glass-trail-entries">
          ${entries.map(entry => {
            const time = new Date(entry.visitedAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            });
            let domain = '';
            try { domain = new URL(entry.url).hostname; } catch {}

            return `
              <div class="glass-trail-entry" data-url="${this.escapeHtml(entry.url)}">
                <div class="glass-trail-entry-info">
                  <div class="glass-trail-entry-title">${this.escapeHtml(entry.title || '无标题')}</div>
                  <div class="glass-trail-entry-meta">
                    <span class="glass-trail-entry-domain">${this.escapeHtml(domain)}</span>
                    <span class="glass-trail-entry-time">${time}</span>
                  </div>
                </div>
                <button class="glass-trail-entry-delete" data-id="${entry.id}" title="删除">&times;</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    const loadMoreHTML = hasMore ? `
      <div class="glass-trail-load-more">
        <button class="glass-btn glass-btn-load-more">
          加载更多 (${filtered.length - this.browseTrailDisplayCount} 条)
        </button>
      </div>
    ` : '';

    return entriesHTML + loadMoreHTML;
  }

  private groupTrailByDate(entries: TrailEntry[]): Record<string, TrailEntry[]> {
    const groups: Record<string, TrailEntry[]> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    for (const entry of entries) {
      const date = new Date(entry.visitedAt).toDateString();
      let label: string;

      if (date === today) {
        label = '今天';
      } else if (date === yesterday) {
        label = '昨天';
      } else {
        label = new Date(entry.visitedAt).toLocaleDateString('zh-CN', {
          month: 'long',
          day: 'numeric',
          weekday: 'short',
        });
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(entry);
    }

    return groups;
  }

  private bindBrowseTrailEvents(): void {
    if (!this.shadowRoot) return;

    const input = this.shadowRoot.querySelector('.glass-input') as HTMLInputElement;
    const searchArea = this.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;

    if (searchArea) {
      searchArea.addEventListener('mousedown', this.handleDragStart);
    }

    // Command tag close
    const tagClose = this.shadowRoot.querySelector('.glass-command-tag-close');
    tagClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeCommand = null;
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    });

    // Search
    input?.addEventListener('input', () => {
      this.browseTrailSearch = input.value.trim();
      this.browseTrailDisplayCount = 50;
      const content = this.shadowRoot?.querySelector('.glass-trail-content');
      if (content) {
        content.innerHTML = this.getBrowseTrailContentHTML();
        this.bindTrailEntryEvents();
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.activeCommand = null;
        this.currentView = 'commands';
        this.viewStack = [];
        this.renderCurrentView(true, true);
      }
    });

    // Footer actions
    const clearBtn = this.shadowRoot.querySelector('.glass-btn-trail-clear');
    clearBtn?.addEventListener('click', async () => {
      if (confirm('确定要清空所有浏览记录吗？')) {
        await clearTrailHistory();
        this.browseTrailSessions = [];
        const content = this.shadowRoot?.querySelector('.glass-trail-content');
        if (content) {
          content.innerHTML = this.getBrowseTrailContentHTML();
        }
      }
    });

    const exportBtn = this.shadowRoot.querySelector('.glass-btn-trail-export');
    exportBtn?.addEventListener('click', () => {
      exportTrailData(this.browseTrailSessions);
      this.showToast('已导出浏览历史');
    });

    // Bind entry events
    this.bindTrailEntryEvents();
  }

  private bindTrailEntryEvents(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.querySelectorAll('.glass-trail-entry').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.glass-trail-entry-delete')) return;
        const url = el.getAttribute('data-url');
        if (url) {
          window.open(url, '_blank');
        }
      });
    });

    this.shadowRoot.querySelectorAll('.glass-trail-entry-delete').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-id');
        if (id) {
          this.browseTrailSessions = await deleteTrailEntry(id);
          const content = this.shadowRoot?.querySelector('.glass-trail-content');
          if (content) {
            content.innerHTML = this.getBrowseTrailContentHTML();
            this.bindTrailEntryEvents();
          }
        }
      });
    });

    // Load more button
    const loadMoreBtn = this.shadowRoot.querySelector('.glass-btn-load-more');
    loadMoreBtn?.addEventListener('click', () => {
      this.browseTrailDisplayCount += 50;
      const content = this.shadowRoot?.querySelector('.glass-trail-content');
      if (content) {
        content.innerHTML = this.getBrowseTrailContentHTML();
        this.bindTrailEntryEvents();
      }
    });
  }

  // ========================================
  // Quick Ask (direct AI question from search)
  // ========================================

  private async startQuickAsk(question: string): Promise<void> {
    const url = window.location.href;
    // Create a fresh chat session for quick ask (without page context)
    this.chatSession = createNewChatSession(url, document.title);

    this.isChatStreaming = false;
    this.isQuickAsk = true;
    this.activeCommand = {
      id: 'quickAsk',
      action: 'contextChat',
      label: '快速提问',
      icon: icons.messageCircle,
      enabled: true,
      order: 0,
    };
    this.currentView = 'contextChat';
    this.viewStack = [];
    this.searchQuery = '';
    this.renderCurrentView(true, true);

    // Auto-send the question after view is rendered
    requestAnimationFrame(() => {
      const input = this.shadowRoot?.querySelector('.glass-chat-input') as HTMLInputElement;
      if (input) {
        input.value = question;
        this.sendChatMessage(input);
      }
    });
  }

  // ========================================
  // Context Chat View
  // ========================================

  private async showContextChat(): Promise<void> {
    const url = window.location.href;
    const existing = await loadChatSession(url);

    if (existing) {
      this.chatSession = existing;
    } else {
      this.chatSession = createNewChatSession(url, document.title);
    }

    this.isChatStreaming = false;
    this.isQuickAsk = false;
    this.activeCommand = {
      id: 'contextChat',
      action: 'contextChat',
      label: '上下文追问',
      icon: icons.messageCircle,
      enabled: true,
      order: 0,
    };
    this.currentView = 'contextChat';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getContextChatViewHTML(): string {
    const label = this.activeCommand?.label || '上下文追问';
    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="contextChat">
          <span class="glass-command-tag-icon">${icons.messageCircle}</span>
          <span class="glass-command-tag-label">${this.escapeHtml(label)}</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input glass-chat-input"
          placeholder="输入问题后按回车..."
          autocomplete="off"
          spellcheck="false"
          ${this.isChatStreaming ? 'disabled' : ''}
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body">
        <div class="glass-chat-content">
          ${this.getContextChatContentHTML()}
        </div>
      </div>
      <div class="glass-footer">
        <div class="glass-chat-footer-actions">
          <button class="glass-btn glass-btn-chat-clear">清空对话</button>
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getContextChatContentHTML(): string {
    if (!this.chatSession || this.chatSession.messages.length === 0) {
      const emptyText = this.isQuickAsk
        ? '直接输入问题，AI 将为你解答'
        : '开始提问，AI 将基于当前页面内容回答';
      return `
        <div class="glass-chat-empty">
          <div class="glass-chat-empty-icon">${icons.messageCircle}</div>
          <div class="glass-chat-empty-text">${emptyText}</div>
        </div>
      `;
    }

    return this.chatSession.messages.map(msg => {
      const roleLabel = msg.role === 'user' ? '你' : 'AI';
      const roleClass = msg.role === 'user' ? 'glass-chat-msg-user' : 'glass-chat-msg-assistant';

      let contentHtml = '';
      if (msg.references && msg.references.length > 0) {
        const refsHtml = msg.references.map(r =>
          `<div class="glass-chat-reference">"${this.escapeHtml(r.text)}"</div>`
        ).join('');
        contentHtml = `<div class="glass-chat-references">${refsHtml}</div>`;
      }
      contentHtml += `<div class="glass-chat-msg-text">${this.formatAIContent(msg.content)}</div>`;

      return `
        <div class="glass-chat-msg ${roleClass}">
          <div class="glass-chat-msg-label">${roleLabel}</div>
          ${contentHtml}
        </div>
      `;
    }).join('');
  }

  private bindContextChatEvents(): void {
    if (!this.shadowRoot) return;

    const input = this.shadowRoot.querySelector('.glass-chat-input') as HTMLInputElement;
    const searchArea = this.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;

    if (searchArea) {
      searchArea.addEventListener('mousedown', this.handleDragStart);
    }

    // Command tag close
    const tagClose = this.shadowRoot.querySelector('.glass-command-tag-close');
    tagClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeCommand = null;
      this.chatSession = null;
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    });

    // Send message on Enter
    input?.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isChatStreaming) {
          this.sendChatMessage(input);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.activeCommand = null;
        this.chatSession = null;
        this.currentView = 'commands';
        this.viewStack = [];
        this.renderCurrentView(true, true);
      }
    });

    // Clear chat
    const clearBtn = this.shadowRoot.querySelector('.glass-btn-chat-clear');
    clearBtn?.addEventListener('click', async () => {
      if (this.chatSession) {
        this.chatSession.messages = [];
        if (!this.isQuickAsk) {
          await saveChatSession(this.chatSession);
        }
        const content = this.shadowRoot?.querySelector('.glass-chat-content');
        if (content) {
          content.innerHTML = this.getContextChatContentHTML();
        }
      }
    });

    // Scroll to bottom
    this.scrollChatToBottom();
  }

  private async sendChatMessage(input: HTMLInputElement): Promise<void> {
    if (!this.chatSession || this.isChatStreaming) return;

    const rawContent = input.value.trim();
    if (!rawContent) return;

    const { cleanContent, references } = parseReferences(rawContent);

    // Add user message
    const userMsg = createChatMessage('user', cleanContent, references.length > 0 ? references : undefined);
    this.chatSession.messages.push(userMsg);

    // Clear input
    input.value = '';
    input.disabled = true;
    input.placeholder = 'AI 正在回复...';

    // Update display
    const content = this.shadowRoot?.querySelector('.glass-chat-content');
    if (content) {
      content.innerHTML = this.getContextChatContentHTML();
    }
    this.scrollChatToBottom();

    // Add empty assistant message placeholder
    const assistantMsg = createChatMessage('assistant', '');
    this.chatSession.messages.push(assistantMsg);

    // Render the placeholder
    if (content) {
      content.innerHTML = this.getContextChatContentHTML() + `
        <div class="glass-chat-msg glass-chat-msg-assistant glass-chat-streaming">
          <div class="glass-chat-msg-label">AI</div>
          <div class="glass-chat-msg-text">${this.getLoadingHTML()}</div>
        </div>
      `;
      // Remove the empty assistant msg from the rendered chat (it shows in streaming div)
      const lastMsg = content.querySelector('.glass-chat-msg:nth-last-child(2)');
      if (lastMsg && lastMsg.querySelector('.glass-chat-msg-text')?.textContent === '') {
        lastMsg.remove();
      }
    }
    this.scrollChatToBottom();

    this.isChatStreaming = true;

    // Build prompt - use simple prompt for quick ask, context prompt for context chat
    const systemPrompt = this.isQuickAsk
      ? '你是一个有帮助的AI助手。请简洁、准确地回答用户的问题。'
      : getContextChatSystemPrompt(this.chatSession);
    const conversationHistory = buildConversationPrompt(
      this.chatSession.messages.slice(0, -1) // Exclude the empty assistant message
    );

    try {
      const onChunk: OnChunkCallback = (_chunk, fullText) => {
        if (!this.chatSession) return;
        const lastMsg = this.chatSession.messages[this.chatSession.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = fullText;
        }
        // Update streaming message
        const streamingEl = this.shadowRoot?.querySelector('.glass-chat-streaming .glass-chat-msg-text');
        if (streamingEl) {
          streamingEl.innerHTML = this.formatAIContent(fullText);
        }
      };

      const response = await callAI(conversationHistory, systemPrompt, this.config, onChunk);

      if (response.success && response.result) {
        const lastMsg = this.chatSession.messages[this.chatSession.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.result;
        }
      } else {
        const lastMsg = this.chatSession.messages[this.chatSession.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.error || 'AI 请求失败';
        }
      }

      // Only save chat session for context chat, not quick ask
      if (!this.isQuickAsk) {
        await saveChatSession(this.chatSession);
      }
    } catch (error) {
      const lastMsg = this.chatSession.messages[this.chatSession.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content = `错误: ${error}`;
      }
    } finally {
      this.isChatStreaming = false;
    }

    // Re-render full chat content
    if (content) {
      content.innerHTML = this.getContextChatContentHTML();
    }

    // Re-enable input
    input.disabled = false;
    input.placeholder = '输入问题后按回车...';
    input.focus();
  }

  private scrollChatToBottom(): void {
    if (!this.shadowRoot) return;
    const body = this.shadowRoot.querySelector('.glass-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getStyles(): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Transparent overlay to capture clicks outside panel */
      .glass-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
      }

      /* ========================================
         Apple Liquid Glass Design System
         Authentic iOS 26 / visionOS aesthetics
         ======================================== */

      :host {
        /* Dark mode - Primary palette */
        --glass-bg: rgba(28, 28, 30, 0.72);
        --glass-bg-elevated: rgba(44, 44, 46, 0.65);
        --glass-bg-hover: rgba(255, 255, 255, 0.08);
        --glass-bg-selected: rgba(255, 255, 255, 0.12);
        --glass-border: rgba(255, 255, 255, 0.08);
        --glass-border-strong: rgba(255, 255, 255, 0.15);
        --glass-divider: rgba(255, 255, 255, 0.06);

        /* Text hierarchy */
        --text-primary: rgba(255, 255, 255, 0.92);
        --text-secondary: rgba(255, 255, 255, 0.55);
        --text-tertiary: rgba(255, 255, 255, 0.35);

        /* Shadows - subtle depth */
        --shadow-panel:
          0 0 0 0.5px rgba(255, 255, 255, 0.1),
          0 24px 80px -12px rgba(0, 0, 0, 0.5),
          0 12px 40px -8px rgba(0, 0, 0, 0.3);
        --shadow-item: 0 1px 3px rgba(0, 0, 0, 0.12);

        /* Blur values */
        --blur-panel: 40px;
        --blur-overlay: 8px;

        /* Timing */
        --duration-fast: 150ms;
        --duration-normal: 250ms;
        --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
        --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      /* Light mode overrides */
      .light {
        --glass-bg: rgba(255, 255, 255, 0.72);
        --glass-bg-elevated: rgba(255, 255, 255, 0.85);
        --glass-bg-hover: rgba(0, 0, 0, 0.04);
        --glass-bg-selected: rgba(0, 0, 0, 0.08);
        --glass-border: rgba(0, 0, 0, 0.06);
        --glass-border-strong: rgba(0, 0, 0, 0.12);
        --glass-divider: rgba(0, 0, 0, 0.05);

        --text-primary: rgba(0, 0, 0, 0.88);
        --text-secondary: rgba(0, 0, 0, 0.50);
        --text-tertiary: rgba(0, 0, 0, 0.30);

        --shadow-panel:
          0 0 0 0.5px rgba(0, 0, 0, 0.08),
          0 24px 80px -12px rgba(0, 0, 0, 0.18),
          0 12px 40px -8px rgba(0, 0, 0, 0.1);
      }

      /* ========================================
         Main Panel - Liquid Glass container
         ======================================== */
      .glass-panel {
        /* Reset inherited styles to prevent page style pollution */
        text-align: left;
        line-height: normal;
        letter-spacing: normal;
        word-spacing: normal;
        text-transform: none;
        text-indent: 0;
        text-shadow: none;
        direction: ltr;
        white-space: normal;
        cursor: default;
        visibility: visible;

        position: fixed;
        top: 18%;
        left: 50%;
        transform: translateX(-50%);
        width: 520px;
        max-width: calc(100vw - 40px);
        max-height: 65vh;

        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--blur-panel)) saturate(180%);

        border: 0.5px solid var(--glass-border-strong);
        border-radius: 18px;
        box-shadow: var(--shadow-panel);

        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 2147483647;

        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        font-feature-settings: "kern" 1, "liga" 1;
        -webkit-font-smoothing: antialiased;
      }

      .glass-panel.glass-panel-enter {
        animation: panelIn var(--duration-normal) var(--ease-spring);
      }

      .glass-panel.glass-panel-enter-restored {
        animation: panelInRestored var(--duration-normal) var(--ease-spring);
      }

      @keyframes panelIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
      }

      @keyframes panelInRestored {
        from {
          opacity: 0;
          transform: translateY(-16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      .glass-panel-exit {
        animation: panelOut var(--duration-fast) var(--ease-out) forwards;
      }

      @keyframes panelOut {
        from {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(-50%) translateY(-8px) scale(0.98);
        }
      }

      .glass-panel-exit-dragged {
        animation: panelOutDragged var(--duration-fast) var(--ease-out) forwards;
      }

      @keyframes panelOutDragged {
        from {
          opacity: 1;
          transform: scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
      }

      /* ========================================
         Search Bar
         ======================================== */
      .glass-search {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }

      .glass-search.glass-draggable {
        cursor: move;
        user-select: none;
      }

      .glass-search-icon {
        color: var(--text-tertiary);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 26px;
        width: 18px;
      }

      .glass-search-icon svg {
        width: 18px;
        height: 18px;
      }

      /* Command Tag (active command indicator) */
      .glass-command-tag {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 8px 0 6px;
        background: var(--glass-bg-selected);
        border: 0.5px solid var(--glass-border-strong);
        border-radius: 8px;
        flex-shrink: 0;
        cursor: default;
        box-sizing: border-box;
      }

      .glass-command-tag-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-command-tag-icon svg {
        width: 14px;
        height: 14px;
      }

      .glass-command-tag-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
      }

      .glass-command-tag-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
        margin-left: 2px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-command-tag-close:hover {
        color: var(--text-primary);
      }

      .glass-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 16px;
        font-weight: 400;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        font-family: inherit;
      }

      .glass-input:disabled {
        cursor: default;
      }

      .glass-input::placeholder {
        color: var(--text-tertiary);
      }

      .glass-kbd {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.02em;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        height: 26px;
        padding: 0 7px;
        border-radius: 5px;
        font-family: "SF Mono", ui-monospace, monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      /* ========================================
         AI Content Area (unified interface)
         ======================================== */
      .glass-ai-content-area {
        padding: 16px;
        min-height: 100px;
      }

      .glass-ai-content-area .glass-ai-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-ai-content-area .glass-ai-content code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      /* Footer action buttons */
      .glass-ai-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-footer-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-footer-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-footer-btn svg {
        width: 16px;
        height: 16px;
      }

      .glass-footer-btn.glass-btn-stop {
        color: #ff6b6b;
        border-color: rgba(255, 107, 107, 0.3);
      }

      .glass-footer-btn.glass-btn-stop:hover {
        background: rgba(255, 107, 107, 0.15);
        color: #ff5252;
      }

      .glass-footer-btn.copied,
      .glass-footer-btn.saved {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.3);
      }

      /* ========================================
         Divider
         ======================================== */
      .glass-divider {
        height: 0.5px;
        background: var(--glass-divider);
        margin: 0 16px;
      }

      /* ========================================
         Commands List
         ======================================== */
      .glass-body {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .glass-commands {
        padding: 8px;
      }

      .glass-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition:
          background var(--duration-fast) var(--ease-out),
          transform var(--duration-fast) var(--ease-out);
      }

      .glass-item:hover {
        background: var(--glass-bg-hover);
      }

      .glass-item.selected {
        background: var(--glass-bg-selected);
      }

      .glass-item:active {
        transform: scale(0.98);
      }

      .glass-item-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-primary);
        flex-shrink: 0;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-item.selected .glass-item-icon {
        background: var(--text-primary);
        border-color: transparent;
        color: var(--glass-bg);
      }

      .glass-item-icon svg {
        width: 16px;
        height: 16px;
      }

      .glass-item-label {
        flex: 1;
        font-size: 14px;
        font-weight: 450;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-item-badge {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
      }

      .glass-item-key {
        font-size: 11px;
        font-weight: 500;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        padding: 2px 6px;
        border-radius: 5px;
        font-family: "SF Mono", ui-monospace, monospace;
        min-width: 20px;
        text-align: center;
      }

      /* ========================================
         Empty State
         ======================================== */
      .glass-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--text-tertiary);
        font-size: 14px;
      }

      /* ========================================
         Footer
         ======================================== */
      .glass-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        border-top: 0.5px solid var(--glass-divider);
      }

      .glass-hints {
        display: flex;
        gap: 14px;
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-hints span {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .glass-hints kbd {
        font-size: 10px;
        font-weight: 500;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
      }

      .glass-brand {
        display: flex;
        align-items: center;
      }

      .glass-logo {
        width: 16px;
        height: 16px;
        color: var(--text-tertiary);
        opacity: 0.6;
      }

      .glass-logo svg {
        width: 100%;
        height: 100%;
      }

      /* ========================================
         Scrollbar - Minimal & Isolated
         ======================================== */
      .glass-body,
      .glass-ai-content,
      .glass-ai-result-body {
        /* Firefox */
        scrollbar-width: thin;
        scrollbar-color: var(--glass-border) transparent;
      }

      .glass-body::-webkit-scrollbar,
      .glass-ai-content::-webkit-scrollbar,
      .glass-ai-result-body::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
        background: transparent !important;
      }

      .glass-body::-webkit-scrollbar-track,
      .glass-ai-content::-webkit-scrollbar-track,
      .glass-ai-result-body::-webkit-scrollbar-track {
        background: transparent !important;
        border-radius: 3px;
      }

      .glass-body::-webkit-scrollbar-thumb,
      .glass-ai-content::-webkit-scrollbar-thumb,
      .glass-ai-result-body::-webkit-scrollbar-thumb {
        background: var(--glass-border) !important;
        border-radius: 3px;
        border: none !important;
      }

      .glass-body::-webkit-scrollbar-thumb:hover,
      .glass-ai-content::-webkit-scrollbar-thumb:hover,
      .glass-ai-result-body::-webkit-scrollbar-thumb:hover {
        background: var(--glass-border-strong) !important;
      }

      .glass-body::-webkit-scrollbar-corner,
      .glass-ai-content::-webkit-scrollbar-corner,
      .glass-ai-result-body::-webkit-scrollbar-corner {
        background: transparent !important;
      }

      /* ========================================
         Responsive
         ======================================== */
      @media (max-width: 580px) {
        .glass-panel {
          top: 12%;
          width: calc(100vw - 24px);
          max-height: 75vh;
          border-radius: 14px;
        }

        .glass-hints {
          display: none;
        }

        .glass-item-key {
          display: none;
        }

        .glass-item-badge {
          display: none;
        }
      }

      /* ========================================
         Reduced Motion
         ======================================== */
      @media (prefers-reduced-motion: reduce) {
        .glass-panel,
        .glass-item,
        .glass-item-icon {
          animation: none;
          transition: none;
        }
      }

      /* ========================================
         Header with Back Button
         ======================================== */
      .glass-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }

      .glass-header.glass-draggable {
        cursor: move;
        user-select: none;
      }

      .glass-header.glass-draggable:active {
        cursor: grabbing;
      }

      .glass-back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-primary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-back-btn:hover {
        background: var(--glass-bg-selected);
      }

      .glass-header-title {
        flex: 1;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .glass-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-header-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-header-btn.active {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-header-btn svg {
        width: 16px;
        height: 16px;
      }

      .glass-header-btn.glass-btn-stop {
        color: #ff6b6b;
      }

      .glass-header-btn.glass-btn-stop:hover {
        background: rgba(255, 107, 107, 0.15);
        color: #ff5252;
      }

      .glass-header-btn.copied {
        color: #4ade80;
      }

      .glass-minimize-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-minimize-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      /* ========================================
         Dragging State
         ======================================== */
      .glass-panel-dragging {
        transition: none !important;
        user-select: none;
      }

      /* ========================================
         Minimized Icon
         ======================================== */
      .glass-minimized-icon {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        border: 0.5px solid var(--glass-border-strong);
        box-shadow: var(--shadow-panel);
        cursor: pointer;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--duration-fast) var(--ease-out);
        animation: minimizedIn var(--duration-normal) var(--ease-spring);
      }

      @keyframes minimizedIn {
        from {
          opacity: 0;
          transform: scale(0.5);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .glass-minimized-icon:hover {
        transform: scale(1.08);
        box-shadow:
          0 0 0 0.5px rgba(255, 255, 255, 0.15),
          0 12px 40px -8px rgba(0, 0, 0, 0.4);
      }

      .glass-minimized-icon:hover .glass-minimized-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }

      .glass-minimized-icon-inner {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-minimized-icon-inner svg {
        width: 20px;
        height: 20px;
      }

      .glass-minimized-loading {
        position: absolute;
        inset: -4px;
        border: 2px solid transparent;
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .glass-minimized-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        padding: 6px 12px;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all var(--duration-fast) var(--ease-out);
        box-shadow: var(--shadow-item);
      }

      /* ========================================
         Minimized Tasks Section (in Commands View)
         ======================================== */
      .glass-minimized-section:empty {
        display: none;
      }

      .glass-minimized-section {
        border-top: 0.5px solid var(--glass-divider);
        padding: 8px 0;
      }

      .glass-section-label {
        padding: 4px 16px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
      }

      .glass-minimized-task {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 10px;
        margin: 0 8px 4px;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-minimized-task:hover {
        background: var(--glass-bg-hover);
      }

      .glass-task-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 10px;
        color: var(--text-primary);
        flex-shrink: 0;
      }

      .glass-task-icon svg {
        width: 18px;
        height: 18px;
      }

      .glass-task-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .glass-task-title {
        font-size: 14px;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-task-meta {
        font-size: 12px;
        color: var(--text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-minimized-task-loading {
        width: 14px;
        height: 14px;
        border: 1.5px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      .glass-minimized-close {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
        line-height: 1;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-minimized-close:hover {
        color: #ff6b6b;
      }

      /* ========================================
         Recent Tasks Section (Saved Tasks from IndexedDB)
         ======================================== */
      .glass-recent-section:empty {
        display: none;
      }

      .glass-recent-section {
        border-top: 0.5px solid var(--glass-divider);
        padding: 8px 0;
      }

      .glass-recent-task {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 10px;
        margin: 0 8px 4px;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-recent-task:hover {
        background: var(--glass-bg-hover);
      }

      .glass-recent-close {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
        line-height: 1;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-recent-close:hover {
        color: #ff6b6b;
      }

      /* ========================================
         AI Result View
         ======================================== */
      .glass-source-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--glass-bg-hover);
        border-bottom: 0.5px solid var(--glass-divider);
      }

      .glass-source-icon {
        color: var(--text-tertiary);
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }

      .glass-source-content {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }

      .glass-source-link {
        color: var(--text-secondary);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color var(--duration-fast) var(--ease-out);
      }

      .glass-source-link:hover {
        color: var(--text-primary);
        text-decoration: underline;
      }

      .glass-source-title {
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-source-meta {
        color: var(--text-tertiary);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .glass-source-meta::before {
        content: '·';
        margin-right: 8px;
      }

      .glass-ai-result-body {
        padding: 16px;
      }

      .glass-ai-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-ai-content code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      .glass-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 40px 20px;
        color: var(--text-secondary);
      }

      .glass-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .glass-ai-footer {
        padding: 12px 16px;
        border-top: 0.5px solid var(--glass-divider);
      }

      .glass-ai-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .glass-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        white-space: nowrap;
      }

      .glass-btn:hover {
        background: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      .glass-btn.active {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
      }

      .glass-btn.copied {
        background: rgba(34, 197, 94, 0.2);
        border-color: rgba(34, 197, 94, 0.5);
      }

      .glass-btn svg {
        width: 14px;
        height: 14px;
      }

      .glass-btn-stop {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .glass-btn-stop:hover {
        background: rgba(239, 68, 68, 0.2);
      }

      /* Compare View */
      .glass-compare-view {
        display: flex;
        gap: 16px;
      }

      .glass-compare-item {
        flex: 1;
        min-width: 0;
      }

      .glass-compare-label {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
        margin-bottom: 8px;
      }

      .glass-compare-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-compare-divider {
        width: 1px;
        background: var(--glass-divider);
      }

      .glass-panel-wide {
        width: 680px;
        max-width: calc(100vw - 40px);
      }

      /* Language Select */
      .glass-lang-select {
        appearance: none;
        height: 32px;
        padding: 0 28px 0 10px;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-lang-select:hover {
        background-color: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      /* ========================================
         Settings Views
         ======================================== */
      .glass-settings-flat {
        padding: 0;
      }

      .glass-settings-section {
        padding: 12px 16px;
        border-bottom: 1px solid var(--glass-divider);
      }

      .glass-settings-section:last-child {
        border-bottom: none;
      }

      .glass-settings-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary);
        margin-bottom: 10px;
      }

      .glass-settings-body {
        max-height: 400px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--glass-border) transparent;
      }

      .glass-settings-body::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
        background: transparent !important;
      }

      .glass-settings-body::-webkit-scrollbar-track {
        background: transparent !important;
        border-radius: 3px;
      }

      .glass-settings-body::-webkit-scrollbar-thumb {
        background: var(--glass-border) !important;
        border-radius: 3px;
        border: none !important;
      }

      .glass-settings-body::-webkit-scrollbar-thumb:hover {
        background: var(--glass-border-strong) !important;
      }

      .glass-settings-body::-webkit-scrollbar-corner {
        background: transparent !important;
      }

      .glass-settings-list {
        padding: 8px;
      }

      .glass-settings-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-settings-item:hover {
        background: var(--glass-bg-hover);
      }

      .glass-settings-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-primary);
        flex-shrink: 0;
      }

      .glass-settings-icon svg {
        width: 18px;
        height: 18px;
      }

      .glass-settings-label {
        flex: 1;
        font-size: 14px;
        font-weight: 450;
        color: var(--text-primary);
      }

      .glass-settings-arrow {
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .glass-settings-arrow svg {
        width: 14px;
        height: 14px;
      }

      /* Form Elements */
      .glass-form {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .glass-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .glass-form-group + .glass-form-group {
        margin-top: 10px;
      }

      .glass-form-group.glass-form-toggle {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
        gap: 12px;
      }

      .glass-form-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .glass-form-hint {
        font-size: 11px;
        color: var(--text-tertiary);
        line-height: 1.4;
      }

      .glass-select {
        appearance: none;
        width: 100%;
        padding: 8px 32px 8px 10px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg-hover);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        box-sizing: border-box;
      }

      .glass-select:hover {
        background-color: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      .glass-select:focus {
        outline: none;
        border-color: rgba(59, 130, 246, 0.5);
      }

      .glass-input-field {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        outline: none;
        transition: all var(--duration-fast) var(--ease-out);
        box-sizing: border-box;
      }

      .glass-input-field:focus {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.1);
      }

      .glass-input-field::placeholder {
        color: var(--text-tertiary);
      }

      /* Toggle Switch */
      .glass-toggle {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
      }

      .glass-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .glass-toggle-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        border-radius: 20px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-toggle-slider::before {
        content: "";
        position: absolute;
        height: 14px;
        width: 14px;
        left: 2px;
        bottom: 2px;
        background: var(--text-primary);
        border-radius: 50%;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-toggle input:checked + .glass-toggle-slider {
        background: rgba(59, 130, 246, 0.8);
        border-color: rgba(59, 130, 246, 0.8);
      }

      .glass-toggle input:checked + .glass-toggle-slider::before {
        transform: translateX(16px);
        background: white;
      }

      .glass-toggle-small {
        width: 32px;
        height: 18px;
      }

      .glass-toggle-small .glass-toggle-slider::before {
        height: 12px;
        width: 12px;
      }

      .glass-toggle-small input:checked + .glass-toggle-slider::before {
        transform: translateX(14px);
      }

      /* Menu Management */
      .glass-menu-list {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .glass-menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        border-radius: 10px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-menu-item:hover {
        background: var(--glass-bg-selected);
      }

      .glass-menu-item.dragging {
        opacity: 0.5;
      }

      .glass-menu-item.drag-over {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.1);
      }

      .glass-menu-drag {
        color: var(--text-tertiary);
        cursor: grab;
        font-size: 12px;
        letter-spacing: 2px;
      }

      .glass-menu-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-menu-icon svg {
        width: 16px;
        height: 16px;
      }

      .glass-menu-label {
        flex: 1;
        font-size: 14px;
        color: var(--text-primary);
      }

      .glass-menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 6px;
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-menu-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--text-primary);
      }

      .glass-menu-delete:hover {
        background: rgba(239, 68, 68, 0.1);
        color: rgb(239, 68, 68);
      }

      /* Footer */
      .glass-footer-hint {
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-btn-danger {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
        color: rgb(239, 68, 68);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-danger:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.5);
      }

      .glass-btn-reset {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-reset:hover {
        background: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
        color: var(--text-primary);
      }

      .glass-settings-footer {
        justify-content: flex-end;
      }

      .glass-settings-footer-actions {
        display: flex;
        gap: 8px;
      }

      .glass-btn-cancel {
        padding: 6px 16px;
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-cancel:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-btn-primary {
        padding: 6px 16px;
        background: var(--text-primary);
        border: 1px solid transparent;
        border-radius: 8px;
        color: var(--glass-bg);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-primary:hover {
        opacity: 0.85;
      }

      .glass-btn-add {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
        color: rgb(59, 130, 246);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-add:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
      }

      /* Screenshot View */
      .glass-screenshot-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 400px;
        overflow-y: auto;
      }

      .glass-screenshot-preview {
        padding: 12px;
        display: flex;
        justify-content: center;
        background: var(--glass-bg-hover);
        border-radius: 8px;
      }

      .glass-screenshot-preview img {
        max-width: 100%;
        max-height: 200px;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .glass-screenshot-content {
        padding: 0 12px 12px;
      }

      .glass-screenshot-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-screenshot-actions .glass-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 10px;
        font-size: 12px;
      }

      .glass-screenshot-result {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .glass-screenshot-result-label,
      .glass-screenshot-generated-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .glass-screenshot-result-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
        white-space: pre-wrap;
        max-height: 150px;
        overflow-y: auto;
        padding: 12px;
        background: var(--glass-bg-hover);
        border-radius: 8px;
      }

      .glass-screenshot-generated-img {
        max-width: 100%;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .glass-screenshot-result-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .glass-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 20px;
        color: var(--text-secondary);
      }

      .glass-loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: glass-spin 0.8s linear infinite;
      }

      @keyframes glass-spin {
        to { transform: rotate(360deg); }
      }

      /* Toast */
      .glass-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 10px 20px;
        background: var(--glass-bg);
        border: 0.5px solid var(--glass-border-strong);
        border-radius: 20px;
        color: var(--text-primary);
        font-size: 13px;
        opacity: 0;
        transition: all var(--duration-fast) var(--ease-out);
        z-index: 10;
      }

      .glass-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* View Transition */
      .glass-view-transition {
        animation: viewTransition var(--duration-fast) var(--ease-out);
      }

      @keyframes viewTransition {
        from {
          opacity: 0.8;
        }
        to {
          opacity: 1;
        }
      }

      /* ========================================
         Browse Trail View
         ======================================== */
      .glass-trail-content {
        padding: 8px;
      }

      .glass-trail-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }

      .glass-trail-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 12px;
      }

      .glass-trail-empty-icon svg {
        width: 32px;
        height: 32px;
      }

      .glass-trail-empty-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 4px;
      }

      .glass-trail-empty-hint {
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-trail-group {
        margin-bottom: 12px;
      }

      .glass-trail-date {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        padding: 4px 12px;
        margin-bottom: 4px;
      }

      .glass-trail-entries {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .glass-trail-entry {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-trail-entry:hover {
        background: var(--glass-bg-hover);
      }

      .glass-trail-entry-info {
        flex: 1;
        min-width: 0;
      }

      .glass-trail-entry-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }

      .glass-trail-entry-meta {
        display: flex;
        gap: 8px;
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-trail-entry-domain {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-trail-entry-delete {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 6px;
        font-size: 16px;
        opacity: 0;
        transition: all var(--duration-fast) var(--ease-out);
        margin-left: 8px;
        flex-shrink: 0;
      }

      .glass-trail-entry:hover .glass-trail-entry-delete {
        opacity: 1;
      }

      .glass-trail-entry-delete:hover {
        color: #ff6b6b;
      }

      .glass-trail-load-more {
        display: flex;
        justify-content: center;
        padding: 12px 0;
      }

      .glass-btn-load-more {
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        color: var(--text-secondary);
        padding: 6px 16px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-load-more:hover {
        background: var(--glass-border);
        color: var(--text-primary);
      }

      .glass-trail-footer-actions {
        display: flex;
        gap: 8px;
      }

      /* ========================================
         Context Chat View
         ======================================== */
      .glass-chat-content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .glass-chat-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }

      .glass-chat-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 12px;
      }

      .glass-chat-empty-icon svg {
        width: 32px;
        height: 32px;
      }

      .glass-chat-empty-text {
        font-size: 14px;
        color: var(--text-secondary);
      }

      .glass-chat-msg {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .glass-chat-msg-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
      }

      .glass-chat-msg-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-chat-msg-text code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      .glass-chat-msg-user .glass-chat-msg-text {
        background: var(--glass-bg-selected);
        padding: 10px 14px;
        border-radius: 12px;
        border-top-left-radius: 4px;
      }

      .glass-chat-msg-assistant .glass-chat-msg-text {
        background: var(--glass-bg-hover);
        padding: 10px 14px;
        border-radius: 12px;
        border-top-left-radius: 4px;
      }

      .glass-chat-references {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
      }

      .glass-chat-reference {
        font-size: 12px;
        color: var(--text-secondary);
        background: var(--glass-bg-hover);
        padding: 6px 10px;
        border-radius: 6px;
        border-left: 3px solid var(--glass-border-strong);
        font-style: italic;
      }

      .glass-chat-streaming .glass-chat-msg-text {
        box-shadow: inset 0 0 0 1px var(--glass-border-strong);
      }

      .glass-chat-footer-actions {
        display: flex;
        gap: 8px;
      }
    `;
  }
}
