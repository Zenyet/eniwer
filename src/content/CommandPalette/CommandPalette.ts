// Command Palette - Apple Liquid Glass Design
// The unified interface for The Panel with authentic iOS 26 Liquid Glass aesthetics
import { MenuItem, MenuConfig, ScreenshotConfig, DEFAULT_SCREENSHOT_CONFIG, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_HISTORY_CONFIG, DEFAULT_ANNOTATION_CONFIG, DEFAULT_KNOWLEDGE_CONFIG, CustomMenuItem, BrowseSession, TrailEntry, ChatSession, AuthState, AnnotationConfig, KnowledgeConfig } from '../../types';
import { icons } from '../../icons';
import { getStorageData, saveConfig, saveGlobalMenuItems } from '../../utils/storage';
import { saveTask, getAllTasks, deleteTask, SavedTask, enforceMaxCount } from '../../utils/taskStorage';
import { loadBrowseTrailSessions, deleteTrailEntry, clearTrailHistory, exportTrailData } from '../BrowseTrailPanel';
import { loadChatSession, saveChatSession, createNewChatSession, createChatMessage, getContextChatSystemPrompt, buildConversationPrompt, parseReferences } from '../ContextChatPanel';
import { callAI, OnChunkCallback, getTranslatePrompt, abortAllRequests } from '../../utils/ai';
import { getAllAnnotations, deleteAnnotation as deleteAnnotationFromStorage } from '../annotation/storage';
import { Annotation, ANNOTATION_COLORS } from '../../types/annotation';

// Import views
import {
  // Settings View
  getSettingsViewHTML as getSettingsViewHTMLFromModule,
  getAccountSettingsHTML as getAccountSettingsHTMLFromModule,
  getMenuSettingsHTML as getMenuSettingsHTMLFromModule,
  PROVIDER_MODELS,
  // Annotations View
  getFilteredAnnotations,
  getAnnotationsContentHTML as getAnnotationsContentHTMLFromModule,
  normalizeUrlForAnnotation,
  // Knowledge View
  KnowledgeItem,
  annotationToKnowledgeItem,
  savedTaskToKnowledgeItem,
  getFilteredKnowledgeItems,
  getKnowledgeContentHTML as getKnowledgeContentHTMLFromModule,
  getActionTypeLabel,
  getAIResultTypeLabel,
  groupKnowledgeByDate,
  exportKnowledgeToJSON,
  exportKnowledgeToMarkdown,
} from './views';

// Import types from types module
import {
  ViewType,
  ViewState,
  AIResultData,
  CommandPaletteCallbacks,
  AIResultCallbacks,
  ScreenshotData,
  ScreenshotCallbacks,
  MinimizedTask,
} from './types';

// Re-export types for external use
export type {
  ViewType,
  ViewState,
  AIResultData,
  CommandPaletteCallbacks,
  AIResultCallbacks,
  ScreenshotData,
  ScreenshotCallbacks,
  MinimizedTask,
};

// Import styles from styles module
import { getStyles } from './styles';

// Import utility functions from utils module
import {
  escapeHtml,
  formatAIContent,
  getLoadingHTML,
  getThinkingSectionHTML,
  formatTimeAgo,
  getTranslateLanguageSelectHTML,
  getTranslationHint,
  getAPIKeyHint,
  getDefaultMinimizedIcon,
  getActionIcon,
  getTaskMetaInfo,
  getSavedTaskMetaInfo,
  getSourceInfoHTML,
} from './utils';

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

  // Annotations state
  private annotationsList: Annotation[] = [];
  private annotationsSearch = '';
  private annotationsFilter: 'all' | 'current' = 'all';

  // Knowledge base state
  private knowledgeItems: KnowledgeItem[] = [];
  private knowledgeSearch = '';
  private knowledgeFilter: 'all' | 'annotations' | 'ai-results' = 'all';

  // Global search state
  private globalSearchResults: {
    commands: MenuItem[];
    knowledge: KnowledgeItem[];
    trails: TrailEntry[];
  } = { commands: [], knowledge: [], trails: [] };
  private searchDebounceTimer: number | null = null;
  private isGlobalSearchLoading = false;

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
  // Track all active stream keys for concurrent tasks
  private activeStreamKeys: Set<string> = new Set();

  // Recent saved tasks from IndexedDB
  private recentSavedTasks: SavedTask[] = [];

  // Auth state for Google login
  private authState: AuthState | null = null;

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
        this.saveCurrentAsMinimized();
      }

      // Auto-minimize active chat streaming task before hiding
      if (this.isChatStreaming && this.chatSession) {
        this.saveChatAsMinimized();
      }

      // Auto-minimize active screenshot loading task before hiding
      if (this.screenshotData?.isLoading) {
        this.saveScreenshotAsMinimized();
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
        this.screenshotData = null;
        this.screenshotCallbacks = null;
        // Note: chatSession/isChatStreaming are NOT reset here because
        // sendChatMessage may still be running in the background with a local reference
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
      'annotations': '批注',
      'knowledge': '知识库',
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

    // Save current active task as minimized before creating new one
    this.saveCurrentAsMinimized();

    // Generate unique stream key for this AI request
    this.currentStreamKey = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeStreamKeys.add(this.currentStreamKey);

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

  // Get the current stream key for callbacks to capture
  public getCurrentStreamKey(): string | null {
    return this.currentStreamKey;
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
    } else {
      // If screenshot was minimized, update the minimized task
      const minimizedTask = this.minimizedTasks.find(t => t.taskType === 'screenshot' && t.isLoading);
      if (minimizedTask) {
        minimizedTask.screenshotResult = result;
        minimizedTask.content = result;
        minimizedTask.isLoading = isLoading;
        this.renderMinimizedTasksIfVisible();
      }
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

  public streamUpdate(_chunk: string, fullText: string, thinking?: string, targetStreamKey?: string): void {
    // Use targetStreamKey if provided (for routing to specific task), otherwise use currentStreamKey
    const streamKey = targetStreamKey || this.currentStreamKey;

    // Update active AI result if streamKey matches
    if (this.aiResultData && this.aiResultData.streamKey === streamKey) {
      this.aiResultData.content = fullText;
      this.aiResultData.isLoading = true;
      if (thinking) {
        this.aiResultData.thinking = thinking;
      }
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    } else if (this.aiResultData) {
    }

    // Also update minimized task with matching streamKey
    // Note: Don't re-render the list during streaming - just update the data
    // The loading indicator is already showing, no need to re-render
    if (streamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === streamKey);
      if (task) {
        task.content = fullText;
        task.isLoading = true;
        if (thinking) {
          task.thinking = thinking;
        }
        // Debug: Log that we're updating minimized task
      } else if (this.minimizedTasks.length > 0) {
        // Debug: Log why we couldn't find the task
      }
    }
  }

  public updateAIResult(content: string, thinking?: string, targetStreamKey?: string): void {
    // Use targetStreamKey if provided, otherwise use currentStreamKey
    const streamKey = targetStreamKey || this.currentStreamKey;

    // Update active AI result if streamKey matches
    if (this.aiResultData && this.aiResultData.streamKey === streamKey) {
      this.aiResultData.content = content;
      this.aiResultData.isLoading = false;
      if (thinking) {
        this.aiResultData.thinking = thinking;
      }
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    }

    // Also update minimized task with matching streamKey
    if (streamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === streamKey);
      if (task) {
        task.content = content;
        if (thinking) {
          task.thinking = thinking;
        }
        const wasLoading = task.isLoading;
        task.isLoading = false;
        // Only re-render if loading state changed (to update the loading indicator)
        if (wasLoading) {
          this.renderMinimizedTasksIfVisible();
        }
      }
      // Remove from active stream keys since this stream is complete
      this.activeStreamKeys.delete(streamKey);
      // Clear currentStreamKey only if it matches
      if (this.currentStreamKey === streamKey) {
        this.currentStreamKey = null;
      }
    }
  }

  public setAIResultLoading(isLoading: boolean, targetStreamKey?: string): void {
    // Use targetStreamKey if provided, otherwise use currentStreamKey
    const streamKey = targetStreamKey || this.currentStreamKey;

    if (this.aiResultData && this.aiResultData.streamKey === streamKey) {
      this.aiResultData.isLoading = isLoading;
      // Use unified content update if in commands view with active command
      if (this.currentView === 'commands' && this.activeCommand) {
        this.updateUnifiedContent();
      } else {
        this.updateAIResultContent();
      }
    }

    // Also update minimized task with matching streamKey
    if (streamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === streamKey);
      if (task) {
        const wasLoading = task.isLoading;
        task.isLoading = isLoading;
        // Only re-render if loading state changed
        if (wasLoading !== isLoading) {
          this.renderMinimizedTasksIfVisible();
        }
      }
      if (!isLoading) {
        // Remove from active stream keys since this stream is complete
        this.activeStreamKeys.delete(streamKey);
        // Clear currentStreamKey only if it matches
        if (this.currentStreamKey === streamKey) {
          this.currentStreamKey = null;
        }
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

    // Load auth state before rendering
    this.loadAuthState().then(() => {
      if (this.container && this.currentView === 'settings') {
        this.renderCurrentView();
      }
    });

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
    style.textContent = getStyles();
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
      case 'annotations':
        panel.innerHTML = this.getAnnotationsViewHTML();
        this.bindAnnotationsEvents();
        requestAnimationFrame(() => {
          const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
          input?.focus();
        });
        break;
      case 'knowledge':
        panel.innerHTML = this.getKnowledgeViewHTML();
        this.bindKnowledgeEvents();
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
            <span class="glass-command-tag-label">${escapeHtml(this.activeCommand?.label || '')}</span>
            <button class="glass-command-tag-close">&times;</button>
          </div>
        ` : `
          <div class="glass-search-icon">${icons.search}</div>
        `}
        <input
          type="text"
          class="glass-input"
          placeholder="${placeholder}"
          value="${escapeHtml(inputValue)}"
          autocomplete="off"
          spellcheck="false"
          ${isAIAction && !needsInput ? 'readonly' : ''}
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      ${hasActiveCommand && this.aiResultData ? getSourceInfoHTML(this.aiResultData) : ''}
      <div class="glass-body">
        ${hasActiveCommand ? `
          <div class="glass-ai-content-area">
            ${getThinkingSectionHTML(this.aiResultData?.thinking)}
            ${isLoading && !this.aiResultData?.content ? getLoadingHTML() : ''}
            ${this.aiResultData?.content ? `<div class="glass-ai-content">${formatAIContent(this.aiResultData.content)}</div>` : ''}
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
            ${isTranslate ? getTranslateLanguageSelectHTML(this.aiResultData?.translateTargetLanguage || this.config.preferredLanguage || 'zh-CN') : ''}
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
            ${this.aiResultData?.originalText ? `
            <button class="glass-footer-btn glass-btn-annotate" title="保存到批注" style="display: ${this.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            ` : ''}
            <button class="glass-footer-btn glass-btn-export-drive" title="导出到 Google Drive" style="display: ${this.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4.5 12.5h5.5v9.5h4v-9.5h5.5L12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 18.5L8 12.5L12 18.5L16 12.5L20 18.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            ` : ''}
          </div>
        ` : `
          <div class="glass-hints">
            <span><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></kbd><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></kbd> 导航</span>
            <span><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg></kbd> 执行</span>
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

      const exportDriveBtn = this.shadowRoot.querySelector('.glass-btn-export-drive');
      exportDriveBtn?.addEventListener('click', () => {
        this.exportToDrive(exportDriveBtn as HTMLButtonElement);
      });

      const annotateBtn = this.shadowRoot.querySelector('.glass-btn-annotate');
      annotateBtn?.addEventListener('click', () => {
        this.saveToAnnotation(annotateBtn as HTMLButtonElement);
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

    // Bind thinking toggle if present (for restored saved tasks)
    if (hasActiveCommand) {
      const contentArea = this.shadowRoot.querySelector('.glass-ai-content-area');
      if (contentArea) {
        this.bindThinkingToggle(contentArea);
      }
    }
  }

  private clearActiveCommand(): void {
    // If there's an active AI action still loading, minimize it to background
    if (this.aiResultData && this.aiResultData.isLoading && this.activeCommand) {
      this.minimizeToBackground();
      return;
    }

    // If there's an active chat streaming, minimize it to background
    if (this.currentView === 'contextChat' && this.isChatStreaming && this.chatSession) {
      this.saveChatAsMinimized();
      this.activeCommand = null;
      this.activeCommandInput = '';
      this.searchQuery = '';
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    // If there's an active screenshot loading, minimize it to background
    if (this.currentView === 'screenshot' && this.screenshotData?.isLoading) {
      this.saveScreenshotAsMinimized();
      this.activeCommand = null;
      this.activeCommandInput = '';
      this.searchQuery = '';
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    // For completed tasks, just clear the active state
    // Don't call abortAllRequests - there may be background tasks still streaming
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
    this.saveCurrentAsMinimized();

    // Clear active state but keep currentStreamKey for updates
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.searchQuery = '';
    this.renderCurrentView(true, true);
  }

  private async saveCurrentTask(btn: HTMLButtonElement): Promise<void> {
    if (!this.aiResultData || !this.aiResultData.content) return;

    try {
      await saveTask({
        title: this.aiResultData.title,
        content: this.aiResultData.content,
        thinking: this.aiResultData.thinking,
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

  private async saveToAnnotation(btn: HTMLButtonElement): Promise<void> {
    if (!this.aiResultData || !this.aiResultData.content || !this.aiResultData.originalText) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="glass-spinner">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"></circle>
      </svg>
    `;

    try {
      // Call the callback to save to annotation
      if (this.aiResultCallbacks?.onSaveToAnnotation) {
        this.aiResultCallbacks.onSaveToAnnotation(
          this.aiResultData.originalText,
          this.aiResultData.content,
          this.aiResultData.thinking,
          this.aiResultData.actionType
        );
      }

      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      btn.classList.add('saved');
    } catch (error) {
      console.error('Save to annotation error:', error);
      this.showToast('保存失败');
      btn.innerHTML = originalHTML;
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('saved');
      }, 1500);
    }
  }

  private async exportToDrive(btn: HTMLButtonElement): Promise<void> {
    if (!this.aiResultData || !this.aiResultData.content) return;

    // Check if logged in
    if (!this.authState?.isLoggedIn) {
      this.showToast('请先登录 Google 账号');
      return;
    }

    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
    `;
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_TO_DRIVE',
        payload: {
          title: this.aiResultData.title,
          content: this.aiResultData.content,
          sourceUrl: this.aiResultData.sourceUrl || window.location.href,
        },
      });

      if (response.success && response.fileUrl) {
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        this.showToast('已导出到 Google Docs');

        // Open the doc in a new tab
        setTimeout(() => {
          window.open(response.fileUrl, '_blank');
        }, 500);
      } else {
        this.showToast(response.error || '导出失败');
        btn.innerHTML = originalHTML;
      }
    } catch (error) {
      console.error('Export to Drive error:', error);
      this.showToast('导出失败');
      btn.innerHTML = originalHTML;
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    }
  }

  private updateUnifiedContent(): void {
    if (!this.shadowRoot || !this.aiResultData) return;

    const contentArea = this.shadowRoot.querySelector('.glass-ai-content-area');
    const footer = this.shadowRoot.querySelector('.glass-ai-footer-actions');

    if (contentArea) {
      // Handle thinking section separately
      let thinkingSection = contentArea.querySelector('.glass-thinking-section');
      if (this.aiResultData.thinking) {
        if (!thinkingSection) {
          // Create thinking section if it doesn't exist
          const thinkingHTML = getThinkingSectionHTML(this.aiResultData.thinking);
          contentArea.insertAdjacentHTML('afterbegin', thinkingHTML);
          thinkingSection = contentArea.querySelector('.glass-thinking-section');
          this.bindThinkingToggle(contentArea);
        } else {
          // Only update the thinking content, not the whole section
          const thinkingContent = thinkingSection.querySelector('.glass-thinking-content');
          if (thinkingContent) {
            thinkingContent.innerHTML = formatAIContent(this.aiResultData.thinking);
          }
        }
      }

      // Handle loading indicator separately
      let loadingEl = contentArea.querySelector('.glass-loading');
      // Handle content separately
      let contentEl = contentArea.querySelector('.glass-ai-content');

      if (this.aiResultData.isLoading && !this.aiResultData.content) {
        // Show loading, hide content
        if (!loadingEl) {
          contentArea.insertAdjacentHTML('beforeend', getLoadingHTML());
        }
        if (contentEl) {
          contentEl.remove();
        }
      } else if (this.aiResultData.content) {
        // Show content, hide loading
        if (loadingEl) {
          loadingEl.remove();
        }
        if (!contentEl) {
          // Create content element if it doesn't exist
          contentArea.insertAdjacentHTML('beforeend', `<div class="glass-ai-content">${formatAIContent(this.aiResultData.content)}</div>`);
        } else {
          // Update existing content
          contentEl.innerHTML = formatAIContent(this.aiResultData.content);
        }
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

  private bindThinkingToggle(container: Element): void {
    const thinkingSection = container.querySelector('.glass-thinking-section');
    const thinkingHeader = thinkingSection?.querySelector('.glass-thinking-header');
    if (thinkingHeader && thinkingSection && !thinkingHeader.hasAttribute('data-bound')) {
      thinkingHeader.setAttribute('data-bound', 'true');
      thinkingHeader.addEventListener('click', () => {
        thinkingSection.classList.toggle('collapsed');
      });
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
        <span class="glass-header-title">${escapeHtml(data.title)}</span>
        <div class="glass-header-actions">
          ${isTranslate ? getTranslateLanguageSelectHTML(data.translateTargetLanguage || 'zh-CN') : ''}
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
      ${getSourceInfoHTML(data)}
      <div class="glass-body glass-ai-result-body">
        <div class="glass-ai-content" data-compare="false">
          ${data.isLoading && !data.content ? getLoadingHTML() : formatAIContent(data.content)}
        </div>
      </div>
    `;
  }

  private bindAIResultEvents(): void {
    if (!this.shadowRoot) return;

    // Back button - return to commands view instead of closing
    const backBtn = this.shadowRoot.querySelector('.glass-back-btn');
    backBtn?.addEventListener('click', () => {
      // Auto-minimize active AI task before returning
      this.saveCurrentAsMinimized();
      // Always return to commands view for AI results
      this.currentView = 'commands';
      this.viewStack = [];
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
      this.saveCurrentAsMinimized();
      // Return to commands view instead of closing
      this.activeCommand = null;
      this.currentView = 'commands';
      this.viewStack = [];
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

  /**
   * Save current active AI result as a minimized task without hiding the panel.
   * Used when switching between tasks to preserve the current result.
   */
  private saveCurrentAsMinimized(): void {
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
      thinking: this.aiResultData.thinking,
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

    // Reset AI result state
    // Note: currentStreamKey is NOT cleared - it continues to be used for updates
    this.aiResultData = null;
    this.aiResultCallbacks = null;
  }

  private saveChatAsMinimized(): void {
    if (!this.chatSession) return;

    // Build title from last user message
    const lastUserMsg = [...this.chatSession.messages].reverse().find(m => m.role === 'user');
    const title = lastUserMsg
      ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
      : '对话';

    const task: MinimizedTask = {
      id: `task-${++this.minimizedTaskIdCounter}`,
      title,
      content: '',
      resultType: 'general',
      isLoading: this.isChatStreaming,
      minimizedAt: Date.now(),
      createdAt: Date.now(),
      taskType: 'contextChat',
      chatSession: this.chatSession,
      isQuickAsk: this.isQuickAsk,
      iconHtml: icons.messageCircle,
    };
    this.minimizedTasks.push(task);

    // Reset chat state
    this.chatSession = null;
    this.isChatStreaming = false;
  }

  private saveScreenshotAsMinimized(): void {
    if (!this.screenshotData) return;

    const task: MinimizedTask = {
      id: `task-${++this.minimizedTaskIdCounter}`,
      title: '截图分析',
      content: this.screenshotData.result || '',
      resultType: 'general',
      isLoading: true,
      minimizedAt: Date.now(),
      createdAt: Date.now(),
      taskType: 'screenshot',
      screenshotDataUrl: this.screenshotData.dataUrl,
      screenshotResult: this.screenshotData.result,
      iconHtml: icons.screenshot || icons.image,
    };
    this.minimizedTasks.push(task);

    // Reset screenshot state
    this.screenshotData = null;
    this.screenshotCallbacks = null;
  }

  private minimize(): void {
    this.saveCurrentAsMinimized();
    this.hide();
  }

  private restoreMinimizedTask(taskId: string): void {
    // Find and remove the target task from minimized list first
    // (before saveCurrentAsMinimized to avoid dedup conflicts)
    const taskIndex = this.minimizedTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    const task = this.minimizedTasks.splice(taskIndex, 1)[0];

    // Branch by task type
    if (task.taskType === 'contextChat') {
      // Save current active state as minimized before overwriting
      this.saveCurrentAsMinimized();
      if (this.isChatStreaming && this.chatSession) {
        this.saveChatAsMinimized();
      }
      if (this.screenshotData?.isLoading) {
        this.saveScreenshotAsMinimized();
      }

      // Restore chat session
      this.chatSession = task.chatSession || null;
      this.isQuickAsk = task.isQuickAsk || false;
      this.isChatStreaming = task.isLoading;

      this.activeCommand = {
        id: task.isQuickAsk ? 'quickAsk' : 'contextChat',
        action: 'contextChat',
        label: task.isQuickAsk ? '快速提问' : '上下文追问',
        icon: icons.messageCircle,
        enabled: true,
        order: 0,
      };

      this.currentView = 'contextChat';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    if (task.taskType === 'screenshot') {
      // Save current active state as minimized before overwriting
      this.saveCurrentAsMinimized();
      if (this.isChatStreaming && this.chatSession) {
        this.saveChatAsMinimized();
      }
      if (this.screenshotData?.isLoading) {
        this.saveScreenshotAsMinimized();
      }

      // Restore screenshot data
      this.screenshotData = {
        dataUrl: task.screenshotDataUrl || '',
        isLoading: task.isLoading,
        result: task.screenshotResult,
      };

      this.activeCommand = {
        id: 'screenshot',
        action: 'screenshot',
        label: '截图',
        icon: '',
        enabled: true,
        order: 0,
      };

      this.currentView = 'screenshot';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    // Default: ai-result task type
    // Save current active task as minimized before overwriting
    this.saveCurrentAsMinimized();

    // Restore as active AI result
    this.aiResultData = {
      title: task.title,
      content: task.content,
      thinking: task.thinking,
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
              <div class="glass-compare-content">${formatAIContent(this.aiResultData.originalText)}</div>
            </div>
            <div class="glass-compare-divider"></div>
            <div class="glass-compare-item">
              <div class="glass-compare-label">译文</div>
              <div class="glass-compare-content">${this.aiResultData.isLoading && !this.aiResultData.content ? getLoadingHTML() : formatAIContent(this.aiResultData.content)}</div>
            </div>
          </div>
        `;
      } else {
        contentEl.innerHTML = this.aiResultData.isLoading && !this.aiResultData.content
          ? getLoadingHTML()
          : formatAIContent(this.aiResultData.content);
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
    const config = this.tempConfig || this.config;
    return getSettingsViewHTMLFromModule(
      config,
      this.authState,
      icons,
      () => this.getAccountSettingsHTML()
    );
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

    // ===== Account settings =====
    // Google login button
    const googleLoginBtn = this.shadowRoot.querySelector('#google-login-btn');
    googleLoginBtn?.addEventListener('click', () => this.handleGoogleLogin());

    // Logout button
    const logoutBtn = this.shadowRoot.querySelector('.glass-btn-logout');
    logoutBtn?.addEventListener('click', () => this.handleGoogleLogout());

    // Sync toggle (immediate action, not affected by save/cancel)
    const syncToggle = this.shadowRoot.querySelector('#sync-enabled-toggle') as HTMLInputElement;
    const syncActions = this.shadowRoot.querySelector('#sync-actions') as HTMLElement;
    const backupSection = this.shadowRoot.querySelector('#backup-history-section') as HTMLElement;
    const syncOptionsSection = this.shadowRoot.querySelector('#sync-options') as HTMLElement;
    syncToggle?.addEventListener('change', () => {
      if (syncActions) syncActions.style.display = syncToggle.checked ? 'flex' : 'none';
      if (backupSection) backupSection.style.display = syncToggle.checked ? 'block' : 'none';
      if (syncOptionsSection) syncOptionsSection.style.display = syncToggle.checked ? 'block' : 'none';
      this.handleSyncToggle(syncToggle.checked);
      if (syncToggle.checked) {
        this.loadBackupList();
      }
    });

    // Sync options checkboxes
    const syncOptKeys: Array<{ id: string; key: keyof import('../../types').SyncOptions }> = [
      { id: 'sync-opt-translation', key: 'translation' },
      { id: 'sync-opt-summary', key: 'summary' },
      { id: 'sync-opt-knowledge', key: 'knowledge' },
      { id: 'sync-opt-annotation', key: 'annotation' },
      { id: 'sync-opt-browseTrail', key: 'browseTrail' },
    ];
    for (const { id, key } of syncOptKeys) {
      const checkbox = this.shadowRoot.querySelector(`#${id}`) as HTMLInputElement;
      checkbox?.addEventListener('change', () => {
        if (!tempConfig.syncOptions) {
          tempConfig.syncOptions = { translation: true, summary: true, knowledge: true, annotation: true, browseTrail: true };
        }
        tempConfig.syncOptions[key] = checkbox.checked;
        this.settingsChanged = true;
      });
    }

    // Sync buttons
    const syncToCloudBtn = this.shadowRoot.querySelector('#sync-to-cloud-btn');
    syncToCloudBtn?.addEventListener('click', () => this.handleSyncToCloud(syncToCloudBtn as HTMLButtonElement));

    const syncFromCloudBtn = this.shadowRoot.querySelector('#sync-from-cloud-btn');
    syncFromCloudBtn?.addEventListener('click', () => this.handleSyncFromCloud(syncFromCloudBtn as HTMLButtonElement));

    // Refresh backups button
    const refreshBackupsBtn = this.shadowRoot.querySelector('#refresh-backups-btn');
    refreshBackupsBtn?.addEventListener('click', () => this.loadBackupList());

    // Auto-load backup list if sync is enabled
    if (this.authState?.syncEnabled) {
      this.loadBackupList();
    }

    // Translation provider select
    const translationProviderSelect = this.shadowRoot.querySelector('#translation-provider-select') as HTMLSelectElement;
    const translationDeeplxKeyGroup = this.shadowRoot.querySelector('#translation-deeplx-key-group') as HTMLElement;
    const translationDeeplxKeyInput = this.shadowRoot.querySelector('#translation-deeplx-key') as HTMLInputElement;
    const translationCustomUrlGroup = this.shadowRoot.querySelector('#translation-custom-url-group') as HTMLElement;
    const translationCustomUrlInput = this.shadowRoot.querySelector('#translation-custom-url') as HTMLInputElement;
    const translationHint = this.shadowRoot.querySelector('#translation-hint') as HTMLElement;

    translationProviderSelect?.addEventListener('change', () => {
      const provider = translationProviderSelect.value;
      if (!tempConfig.translation) {
        tempConfig.translation = { provider: provider as any };
      }
      tempConfig.translation.provider = provider as any;

      // Show/hide DeepLX key input
      if (translationDeeplxKeyGroup) {
        translationDeeplxKeyGroup.style.display = provider === 'deeplx' ? 'flex' : 'none';
      }
      // Show/hide custom URL input
      if (translationCustomUrlGroup) {
        translationCustomUrlGroup.style.display = provider === 'custom' ? 'flex' : 'none';
      }
      // Update hint
      if (translationHint) {
        translationHint.textContent = getTranslationHint(provider);
      }
      markChanged();
    });

    translationDeeplxKeyInput?.addEventListener('input', () => {
      if (!tempConfig.translation) {
        tempConfig.translation = { provider: 'deeplx' };
      }
      tempConfig.translation.deeplxApiKey = translationDeeplxKeyInput.value;
      markChanged();
    });

    translationCustomUrlInput?.addEventListener('input', () => {
      if (!tempConfig.translation) {
        tempConfig.translation = { provider: 'custom' };
      }
      tempConfig.translation.customUrl = translationCustomUrlInput.value;
      markChanged();
    });

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
      if (popoverPositionGroup) popoverPositionGroup.style.display = showPopoverToggle.checked ? 'flex' : 'none';
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
    const modelSelectGroup = this.shadowRoot.querySelector('#model-select-group') as HTMLElement;
    const modelSelect = this.shadowRoot.querySelector('#model-select') as HTMLSelectElement;

    providerSelect?.addEventListener('change', () => {
      const provider = providerSelect.value as MenuConfig['apiProvider'];
      const isCustom = provider === 'custom';
      if (customUrlGroup) customUrlGroup.style.display = isCustom ? 'flex' : 'none';
      if (customModelGroup) customModelGroup.style.display = isCustom ? 'flex' : 'none';
      if (modelSelectGroup) modelSelectGroup.style.display = isCustom ? 'none' : 'flex';
      if (apiKeyHint) apiKeyHint.textContent = getAPIKeyHint(provider);
      tempConfig.apiProvider = provider;
      // Update model options and reset customModel
      if (!isCustom && modelSelect) {
        const models = PROVIDER_MODELS[provider] || [];
        modelSelect.innerHTML = models.map(m =>
          `<option value="${m.id}">${m.label}</option>`
        ).join('');
        tempConfig.customModel = undefined;
      }
      markChanged();
    });

    // Model select
    modelSelect?.addEventListener('change', () => {
      tempConfig.customModel = modelSelect.value || undefined;
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

    // Thinking mode toggle
    const thinkingModeToggle = this.shadowRoot.querySelector('#thinking-mode-toggle') as HTMLInputElement;
    thinkingModeToggle?.addEventListener('change', () => {
      tempConfig.useThinkingModel = thinkingModeToggle.checked;
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

    // Image search settings
    const imageSearchConfig = tempConfig.imageSearch || { google: true, yandex: true, bing: true, tineye: true };

    const imageSearchGoogle = this.shadowRoot.querySelector('#image-search-google') as HTMLInputElement;
    imageSearchGoogle?.addEventListener('change', () => {
      imageSearchConfig.google = imageSearchGoogle.checked;
      tempConfig.imageSearch = imageSearchConfig;
      markChanged();
    });

    const imageSearchYandex = this.shadowRoot.querySelector('#image-search-yandex') as HTMLInputElement;
    imageSearchYandex?.addEventListener('change', () => {
      imageSearchConfig.yandex = imageSearchYandex.checked;
      tempConfig.imageSearch = imageSearchConfig;
      markChanged();
    });

    const imageSearchBing = this.shadowRoot.querySelector('#image-search-bing') as HTMLInputElement;
    imageSearchBing?.addEventListener('change', () => {
      imageSearchConfig.bing = imageSearchBing.checked;
      tempConfig.imageSearch = imageSearchConfig;
      markChanged();
    });

    const imageSearchTineye = this.shadowRoot.querySelector('#image-search-tineye') as HTMLInputElement;
    imageSearchTineye?.addEventListener('change', () => {
      imageSearchConfig.tineye = imageSearchTineye.checked;
      tempConfig.imageSearch = imageSearchConfig;
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
        const { clearAllTasks } = await import('../../utils/taskStorage');
        await clearAllTasks();
        this.recentSavedTasks = [];
        this.showToast('历史记录已清空');
      }
    });

    // ===== Annotation settings =====
    const annotationConfig = tempConfig.annotation || { ...DEFAULT_ANNOTATION_CONFIG };

    // Color picker
    const colorPicker = this.shadowRoot.querySelector('#annotation-color-picker');
    colorPicker?.querySelectorAll('.glass-color-option:not(.glass-color-option-custom)').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = (btn as HTMLElement).dataset.color as string;
        annotationConfig.defaultColor = color;
        tempConfig.annotation = annotationConfig;
        // Update active state
        colorPicker.querySelectorAll('.glass-color-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        markChanged();
      });
    });

    // Custom color input
    const customColorInput = this.shadowRoot.querySelector('#annotation-custom-color') as HTMLInputElement;
    const customColorDiv = colorPicker?.querySelector('.glass-color-option-custom') as HTMLElement;
    customColorInput?.addEventListener('input', () => {
      const hex = customColorInput.value;
      annotationConfig.defaultColor = hex;
      tempConfig.annotation = annotationConfig;
      // Update active state
      colorPicker?.querySelectorAll('.glass-color-option').forEach(b => b.classList.remove('active'));
      if (customColorDiv) {
        customColorDiv.classList.add('active');
        customColorDiv.style.setProperty('--color', `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},0.4)`);
        customColorDiv.style.setProperty('--color-border', `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},0.8)`);
      }
      markChanged();
    });

    // Auto save AI result toggle
    const annotationAutoSave = this.shadowRoot.querySelector('#annotation-auto-save') as HTMLInputElement;
    annotationAutoSave?.addEventListener('change', () => {
      annotationConfig.autoSaveAIResult = annotationAutoSave.checked;
      tempConfig.annotation = annotationConfig;
      markChanged();
    });

    // Page filter toggle
    const annotationPageFilter = this.shadowRoot.querySelector('#annotation-page-filter') as HTMLInputElement;
    annotationPageFilter?.addEventListener('change', () => {
      annotationConfig.showPageFilter = annotationPageFilter.checked;
      tempConfig.annotation = annotationConfig;
      markChanged();
    });

    // ===== Knowledge settings =====
    const knowledgeConfig = tempConfig.knowledge || { ...DEFAULT_KNOWLEDGE_CONFIG };

    // Default filter select
    const knowledgeFilterSelect = this.shadowRoot.querySelector('#knowledge-filter-select') as HTMLSelectElement;
    knowledgeFilterSelect?.addEventListener('change', () => {
      knowledgeConfig.defaultFilter = knowledgeFilterSelect.value as KnowledgeConfig['defaultFilter'];
      tempConfig.knowledge = knowledgeConfig;
      markChanged();
    });

    // Max display count select
    const knowledgeMaxDisplay = this.shadowRoot.querySelector('#knowledge-max-display') as HTMLSelectElement;
    knowledgeMaxDisplay?.addEventListener('change', () => {
      knowledgeConfig.maxDisplayCount = parseInt(knowledgeMaxDisplay.value, 10);
      tempConfig.knowledge = knowledgeConfig;
      markChanged();
    });

    // Group by date toggle
    const knowledgeGroupDate = this.shadowRoot.querySelector('#knowledge-group-date') as HTMLInputElement;
    knowledgeGroupDate?.addEventListener('change', () => {
      knowledgeConfig.groupByDate = knowledgeGroupDate.checked;
      tempConfig.knowledge = knowledgeConfig;
      markChanged();
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

    // Keep tempConfig for continued editing, just reset changed flag
    this.tempConfig = JSON.parse(JSON.stringify(this.config));
    this.settingsChanged = false;
    this.showToast('设置已保存');
  }

  // Account Settings HTML
  private getAccountSettingsHTML(): string {
    const config = this.tempConfig || this.config;
    return getAccountSettingsHTMLFromModule(this.authState, config);
  }

  // Load auth state from background
  private async loadAuthState(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_STATUS' });
      this.authState = response;
    } catch (error) {
      console.error('Failed to load auth state:', error);
      this.authState = { isLoggedIn: false, user: null, syncEnabled: false };
    }
  }

  // Handle Google login
  private async handleGoogleLogin(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_LOGIN' });
      if (response.success) {
        await this.loadAuthState();
        this.renderCurrentView(true, true);
        this.showToast('登录成功');
      } else {
        this.showToast(response.error || '登录失败');
      }
    } catch (error) {
      console.error('Google login error:', error);
      this.showToast('登录失败');
    }
  }

  // Handle Google logout
  private async handleGoogleLogout(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_LOGOUT' });
      if (response.success) {
        this.authState = { isLoggedIn: false, user: null, syncEnabled: false };
        this.renderCurrentView(true, true);
        this.showToast('已退出登录');
      } else {
        this.showToast(response.error || '退出失败');
      }
    } catch (error) {
      console.error('Google logout error:', error);
      this.showToast('退出失败');
    }
  }

  // Handle sync toggle
  private async handleSyncToggle(enabled: boolean): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ type: 'SET_SYNC_ENABLED', payload: enabled });
      if (this.authState) {
        this.authState.syncEnabled = enabled;
      }
      if (enabled) {
        // First try to download from cloud (preserve existing cloud data)
        const syncResult = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_CLOUD' });
        if (syncResult.success && syncResult.data) {
          // Cloud had data, applied it locally
          const { getStorageData } = await import('../../utils/storage');
          const data = await getStorageData();
          this.config = data.config;
          this.tempConfig = JSON.parse(JSON.stringify(this.config));
          this.renderCurrentView(true, true);
          this.showToast('同步已开启，已恢复云端配置');
        } else {
          // No cloud data, upload current config
          await chrome.runtime.sendMessage({ type: 'SYNC_TO_CLOUD' });
          this.showToast('同步已开启');
        }
      } else {
        this.showToast('同步已关闭');
      }
    } catch (error) {
      console.error('Sync toggle error:', error);
      this.showToast('操作失败');
    }
  }

  // Manual sync to cloud
  private async handleSyncToCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> 同步中...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_TO_CLOUD' });
      if (response.success) {
        this.showToast('已上传到云端');
      } else {
        this.showToast(response.error || '上传失败');
      }
    } catch (error) {
      console.error('Sync to cloud error:', error);
      this.showToast('上传失败');
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  // Manual sync from cloud
  private async handleSyncFromCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> 同步中...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_CLOUD' });
      if (response.success) {
        this.showToast('已从云端恢复');
        // Reload config to reflect changes
        const { getStorageData } = await import('../../utils/storage');
        const data = await getStorageData();
        this.config = data.config;
        this.tempConfig = JSON.parse(JSON.stringify(this.config));
        this.renderCurrentView(true, true);
      } else {
        this.showToast(response.error || '恢复失败');
      }
    } catch (error) {
      console.error('Sync from cloud error:', error);
      this.showToast(`恢复失败: ${error}`);
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  // Format backup timestamp to MM-DD HH:mm
  private formatBackupTime(timestamp: number): string {
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  }

  // Load and render backup list
  private async loadBackupList(): Promise<void> {
    if (!this.shadowRoot) return;
    const listEl = this.shadowRoot.querySelector('#backup-list');
    if (!listEl) return;

    listEl.innerHTML = '<span class="glass-form-hint">加载中...</span>';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'LIST_BACKUPS' });
      if (!response.success) {
        listEl.innerHTML = `<span class="glass-form-hint">${response.error || '加载失败'}</span>`;
        return;
      }

      const backups = response.backups || [];
      if (backups.length === 0) {
        listEl.innerHTML = '<span class="glass-form-hint">暂无备份</span>';
        return;
      }

      listEl.innerHTML = backups.map((b: { id: string; name: string; timestamp: number }) => `
        <div class="glass-backup-item" data-id="${b.id}">
          <span>${this.formatBackupTime(b.timestamp)}</span>
          <div class="glass-backup-actions">
            <button class="glass-btn glass-btn-secondary glass-btn-restore" data-id="${b.id}" style="padding: 2px 8px; font-size: 11px;">恢复</button>
            <button class="glass-btn glass-btn-secondary glass-btn-delete-backup" data-id="${b.id}" style="padding: 2px 8px; font-size: 11px; color: #ef4444;">删除</button>
          </div>
        </div>
      `).join('');

      // Bind restore buttons
      listEl.querySelectorAll('.glass-btn-restore').forEach(btn => {
        btn.addEventListener('click', () => {
          const fileId = (btn as HTMLElement).dataset.id!;
          this.handleRestoreBackup(fileId, btn as HTMLButtonElement);
        });
      });

      // Bind delete buttons
      listEl.querySelectorAll('.glass-btn-delete-backup').forEach(btn => {
        btn.addEventListener('click', () => {
          const fileId = (btn as HTMLElement).dataset.id!;
          this.handleDeleteBackup(fileId, btn as HTMLButtonElement);
        });
      });
    } catch (error) {
      console.error('Load backup list error:', error);
      listEl.innerHTML = '<span class="glass-form-hint">加载失败</span>';
    }
  }

  // Handle restore backup
  private async handleRestoreBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalText = btn.textContent;
    btn.textContent = '恢复中...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'RESTORE_BACKUP', payload: { fileId } });
      if (response.success) {
        this.showToast('已恢复备份');
        // Reload config to reflect changes
        const { getStorageData } = await import('../../utils/storage');
        const data = await getStorageData();
        this.config = data.config;
        this.tempConfig = JSON.parse(JSON.stringify(this.config));
        this.renderCurrentView(true, true);
      } else {
        this.showToast(response.error || '恢复失败');
      }
    } catch (error) {
      console.error('Restore backup error:', error);
      this.showToast('恢复失败');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  // Handle delete backup
  private async handleDeleteBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalText = btn.textContent;
    btn.textContent = '删除中...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'DELETE_BACKUP', payload: { fileId } });
      if (response.success) {
        this.showToast('已删除备份');
        this.loadBackupList();
      } else {
        this.showToast(response.error || '删除失败');
      }
    } catch (error) {
      console.error('Delete backup error:', error);
      this.showToast('删除失败');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
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
    return getMenuSettingsHTMLFromModule(items, icons);
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
          class="glass-input glass-screenshot-input"
          placeholder="输入问题，按回车询问 AI..."
          autocomplete="off"
          spellcheck="false"
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
          <div class="glass-screenshot-result-text">${escapeHtml(this.screenshotData.result)}</div>
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
      // If loading, minimize to background instead of discarding
      if (this.screenshotData?.isLoading) {
        this.saveScreenshotAsMinimized();
      }
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

    // Screenshot input - press Enter to ask AI
    const screenshotInput = this.shadowRoot.querySelector('.glass-screenshot-input') as HTMLInputElement;
    screenshotInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const question = screenshotInput.value.trim();
        if (question) {
          this.screenshotData!.isLoading = true;
          this.renderScreenshotContent();
          this.screenshotCallbacks?.onAskAI?.(question);
          screenshotInput.value = '';
        }
      }
    });
    // Focus the input
    setTimeout(() => screenshotInput?.focus(), 100);

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
      // If loading, minimize to background instead of discarding
      if (this.screenshotData?.isLoading) {
        this.saveScreenshotAsMinimized();
      }
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
      this.globalSearchResults = { commands: [], knowledge: [], trails: [] };
      this.isGlobalSearchLoading = false;
    } else {
      // Filter commands locally (instant)
      this.filteredItems = this.menuItems.filter(item => {
        const label = (item.customLabel || item.label).toLowerCase();
        const action = item.action.toLowerCase();
        return label.includes(this.searchQuery) || action.includes(this.searchQuery);
      });
      this.globalSearchResults.commands = this.filteredItems;

      // Debounced global search for knowledge and trails
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.isGlobalSearchLoading = true;
      this.searchDebounceTimer = window.setTimeout(() => {
        this.performGlobalSearch(this.searchQuery);
      }, 150);
    }
    this.selectedIndex = 0;
    this.renderCommands();
  }

  private async performGlobalSearch(query: string): Promise<void> {
    if (!query || query !== this.searchQuery) return;

    try {
      // Search knowledge base
      const [annotations, savedTasks] = await Promise.all([
        getAllAnnotations(),
        getAllTasks(),
      ]);

      const knowledgeItems: KnowledgeItem[] = [
        ...annotations.map(a => this.annotationToKnowledgeItem(a)),
        ...savedTasks.map(t => this.savedTaskToKnowledgeItem(t)),
      ];

      const queryLower = query.toLowerCase();
      this.globalSearchResults.knowledge = knowledgeItems
        .filter(item =>
          item.content.toLowerCase().includes(queryLower) ||
          item.pageTitle.toLowerCase().includes(queryLower) ||
          item.note?.toLowerCase().includes(queryLower) ||
          item.aiResult?.content?.toLowerCase().includes(queryLower)
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5);

      // Search browse trails
      const sessions = await loadBrowseTrailSessions();
      const allEntries: TrailEntry[] = sessions.flatMap(s => s.entries);
      this.globalSearchResults.trails = allEntries
        .filter(entry =>
          entry.title.toLowerCase().includes(queryLower) ||
          entry.url.toLowerCase().includes(queryLower) ||
          entry.summary?.toLowerCase().includes(queryLower)
        )
        .sort((a, b) => b.visitedAt - a.visitedAt)
        .slice(0, 5);

    } catch (error) {
      console.error('Global search error:', error);
    }

    this.isGlobalSearchLoading = false;
    if (query === this.searchQuery) {
      this.renderCommands();
    }
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

    // If searching, show global search results
    if (this.searchQuery) {
      this.renderGlobalSearchResults(container as HTMLElement);
      return;
    }

    // Normal command list
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
            <div class="glass-item-label">${escapeHtml(displayLabel)}</div>
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

  private renderGlobalSearchResults(container: HTMLElement): void {
    const { commands, knowledge, trails } = this.globalSearchResults;
    const hasResults = commands.length > 0 || knowledge.length > 0 || trails.length > 0;

    if (!hasResults && !this.isGlobalSearchLoading) {
      container.innerHTML = `
        <div class="glass-empty">
          <span>没有找到匹配的结果</span>
        </div>
      `;
      return;
    }

    let html = '';

    // Commands section
    if (commands.length > 0) {
      html += `
        <div class="glass-search-section">
          <div class="glass-search-section-title">${icons.command} 命令</div>
          ${commands.slice(0, 5).map((item, index) => `
            <div class="glass-item ${index === this.selectedIndex ? 'selected' : ''}" data-type="command" data-index="${index}" data-id="${item.id}">
              <div class="glass-item-icon">${item.customIcon || item.icon}</div>
              <div class="glass-item-label">${escapeHtml(item.customLabel || item.label)}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Knowledge section
    if (knowledge.length > 0) {
      html += `
        <div class="glass-search-section">
          <div class="glass-search-section-title">${icons.library} 知识库</div>
          ${knowledge.map(item => {
            const typeIcon = item.type === 'annotation' ? icons.highlighter : icons.sparkles;
            const typeLabel = item.type === 'annotation' ? '批注' : getActionTypeLabel(item.actionType);
            const preview = item.content.substring(0, 60) + (item.content.length > 60 ? '...' : '');
            return `
              <div class="glass-search-result" data-type="knowledge" data-id="${item.id}" data-url="${escapeHtml(item.url)}">
                <div class="glass-search-result-icon">${typeIcon}</div>
                <div class="glass-search-result-content">
                  <div class="glass-search-result-title">${typeLabel}</div>
                  <div class="glass-search-result-preview">${escapeHtml(preview)}</div>
                  <div class="glass-search-result-meta">${escapeHtml(item.pageTitle || '')}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Browse trails section
    if (trails.length > 0) {
      html += `
        <div class="glass-search-section">
          <div class="glass-search-section-title">${icons.history} 浏览轨迹</div>
          ${trails.map(entry => `
            <div class="glass-search-result" data-type="trail" data-url="${escapeHtml(entry.url)}">
              <div class="glass-search-result-icon">${icons.globe}</div>
              <div class="glass-search-result-content">
                <div class="glass-search-result-title">${escapeHtml(entry.title || '无标题')}</div>
                ${entry.summary ? `<div class="glass-search-result-preview">${escapeHtml(entry.summary.substring(0, 60))}...</div>` : ''}
                <div class="glass-search-result-meta">${new URL(entry.url).hostname}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Loading indicator
    if (this.isGlobalSearchLoading && !hasResults) {
      html += `
        <div class="glass-search-loading">
          <span class="glass-search-loading-spinner"></span>
          <span>搜索中...</span>
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind command events
    container.querySelectorAll('.glass-item[data-type="command"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const item = this.menuItems.find(m => m.id === id);
        if (item) {
          this.selectedIndex = 0;
          this.handleSelectItem(item);
        }
      });
    });

    // Bind knowledge events
    container.querySelectorAll('.glass-search-result[data-type="knowledge"]').forEach((el) => {
      el.addEventListener('click', () => {
        const url = el.getAttribute('data-url');
        if (url) {
          this.hide();
          window.open(url, '_blank');
        }
      });
    });

    // Bind trail events
    container.querySelectorAll('.glass-search-result[data-type="trail"]').forEach((el) => {
      el.addEventListener('click', () => {
        const url = el.getAttribute('data-url');
        if (url) {
          this.hide();
          window.open(url, '_blank');
        }
      });
    });
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
        const icon = task.iconHtml || getDefaultMinimizedIcon();
        const meta = getTaskMetaInfo(task);
        return `
          <div class="glass-minimized-task" data-task-id="${task.id}">
            <div class="glass-task-icon">${icon}</div>
            <div class="glass-task-info">
              <div class="glass-task-title">${escapeHtml(task.title)}</div>
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
        const icon = getActionIcon(task.actionType);
        const meta = getSavedTaskMetaInfo(task);
        return `
          <div class="glass-recent-task" data-task-id="${task.id}">
            <div class="glass-task-icon">${icon}</div>
            <div class="glass-task-info">
              <div class="glass-task-title">${escapeHtml(task.title)}</div>
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
      icon: getActionIcon(task.actionType),
      label: actionLabelMap[task.actionType] || task.title,
      action: task.actionType,
      enabled: true,
      order: 0,
    };

    // Show the saved task content in AI result view
    this.aiResultData = {
      title: task.title,
      content: task.content,
      thinking: task.thinking,
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
      ? (_chunk: string, fullText: string, thinking?: string) => {
          this.streamUpdate(_chunk, fullText, thinking);
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
      // Load auth state
      this.loadAuthState().then(() => {
        if (this.container && this.currentView === 'settings') {
          this.renderCurrentView(true, true);
        }
      });
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

    // Annotations and Knowledge transition to their own views
    // Call onSelect without hiding the panel first
    if (item.action === 'annotations' || item.action === 'knowledge') {
      this.callbacks?.onSelect(item);
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
              <div class="glass-trail-entry" data-url="${escapeHtml(entry.url)}">
                <div class="glass-trail-entry-info">
                  <div class="glass-trail-entry-title">${escapeHtml(entry.title || '无标题')}</div>
                  <div class="glass-trail-entry-meta">
                    <span class="glass-trail-entry-domain">${escapeHtml(domain)}</span>
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
          <span class="glass-command-tag-label">${escapeHtml(label)}</span>
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
          `<div class="glass-chat-reference">"${escapeHtml(r.text)}"</div>`
        ).join('');
        contentHtml = `<div class="glass-chat-references">${refsHtml}</div>`;
      }
      // Add thinking section for assistant messages
      if (msg.role === 'assistant' && msg.thinking) {
        contentHtml += getThinkingSectionHTML(msg.thinking);
      }
      contentHtml += `<div class="glass-chat-msg-text">${formatAIContent(msg.content)}</div>`;

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
      // If streaming, minimize to background instead of discarding
      if (this.isChatStreaming && this.chatSession) {
        this.saveChatAsMinimized();
      }
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
        // If streaming, minimize to background instead of discarding
        if (this.isChatStreaming && this.chatSession) {
          this.saveChatAsMinimized();
        }
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

    // Bind thinking toggle events for existing messages
    const chatContent = this.shadowRoot.querySelector('.glass-chat-content');
    chatContent?.querySelectorAll('.glass-thinking-section').forEach(section => {
      const header = section.querySelector('.glass-thinking-header');
      if (header && !header.hasAttribute('data-bound')) {
        header.setAttribute('data-bound', 'true');
        header.addEventListener('click', () => {
          section.classList.toggle('collapsed');
        });
      }
    });
  }

  private async sendChatMessage(input: HTMLInputElement): Promise<void> {
    if (!this.chatSession || this.isChatStreaming) return;

    const rawContent = input.value.trim();
    if (!rawContent) return;

    const { cleanContent, references } = parseReferences(rawContent);

    // Keep a local reference to chatSession so streaming continues even if minimized
    // (saveChatAsMinimized sets this.chatSession = null, but the object is shared by reference)
    const session = this.chatSession;

    // Add user message
    const userMsg = createChatMessage('user', cleanContent, references.length > 0 ? references : undefined);
    session.messages.push(userMsg);

    // Clear input
    input.value = '';
    input.disabled = true;
    input.placeholder = 'AI 正在回复...';

    // Update display
    const content = this.shadowRoot?.querySelector('.glass-chat-content');
    if (content) {
      content.innerHTML = this.getContextChatContentHTML();
      // Bind thinking toggle events
      content.querySelectorAll('.glass-thinking-section').forEach(section => {
        const header = section.querySelector('.glass-thinking-header');
        if (header && !header.hasAttribute('data-bound')) {
          header.setAttribute('data-bound', 'true');
          header.addEventListener('click', () => {
            section.classList.toggle('collapsed');
          });
        }
      });
    }
    this.scrollChatToBottom();

    // Add empty assistant message placeholder
    const assistantMsg = createChatMessage('assistant', '');
    session.messages.push(assistantMsg);

    // Render the placeholder
    if (content) {
      content.innerHTML = this.getContextChatContentHTML() + `
        <div class="glass-chat-msg glass-chat-msg-assistant glass-chat-streaming">
          <div class="glass-chat-msg-label">AI</div>
          <div class="glass-chat-msg-text">${getLoadingHTML()}</div>
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
      : getContextChatSystemPrompt(session);
    const conversationHistory = buildConversationPrompt(
      session.messages.slice(0, -1) // Exclude the empty assistant message
    );

    try {
      const onChunk: OnChunkCallback = (_chunk, fullText, thinking) => {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = fullText;
          if (thinking) {
            lastMsg.thinking = thinking;
          }
        }

        // Update UI — try .glass-chat-streaming first (original render),
        // then fall back to last assistant message (after restore from minimized)
        let streamingTextEl = this.shadowRoot?.querySelector('.glass-chat-streaming .glass-chat-msg-text') as Element | null;
        let streamingContainer = this.shadowRoot?.querySelector('.glass-chat-streaming') as Element | null;

        if (!streamingTextEl && this.chatSession === session && this.shadowRoot) {
          // Chat was restored from minimized — find the last assistant message
          const allAssistantTexts = this.shadowRoot.querySelectorAll('.glass-chat-msg-assistant .glass-chat-msg-text');
          streamingTextEl = allAssistantTexts[allAssistantTexts.length - 1] || null;
          const allAssistantMsgs = this.shadowRoot.querySelectorAll('.glass-chat-msg-assistant');
          streamingContainer = allAssistantMsgs[allAssistantMsgs.length - 1] || null;
        }

        if (streamingTextEl) {
          streamingTextEl.innerHTML = formatAIContent(fullText);
        }

        // Update thinking section
        if (thinking && streamingContainer) {
          let thinkingSection = streamingContainer.querySelector('.glass-thinking-section');
          if (!thinkingSection) {
            // Insert thinking section before the text
            const textEl = streamingContainer.querySelector('.glass-chat-msg-text');
            if (textEl) {
              textEl.insertAdjacentHTML('beforebegin', getThinkingSectionHTML(thinking));
              thinkingSection = streamingContainer.querySelector('.glass-thinking-section');
              // Bind toggle event
              const header = thinkingSection?.querySelector('.glass-thinking-header');
              header?.addEventListener('click', () => {
                thinkingSection?.classList.toggle('collapsed');
              });
            }
          } else {
            // Update existing thinking content
            const thinkingContent = thinkingSection.querySelector('.glass-thinking-content');
            if (thinkingContent) {
              thinkingContent.innerHTML = formatAIContent(thinking);
            }
          }
        }

        // Auto-scroll if chat is visible
        if (this.chatSession === session) {
          this.scrollChatToBottom();
        }
      };

      const response = await callAI(conversationHistory, systemPrompt, this.config, onChunk);

      if (response.success && response.result) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.result;
          if (response.thinking) {
            lastMsg.thinking = response.thinking;
          }
        }
      } else {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.error || 'AI 请求失败';
        }
      }

      // Only save chat session for context chat, not quick ask
      if (!this.isQuickAsk) {
        await saveChatSession(session);
      }
    } catch (error) {
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content = `错误: ${error}`;
      }
    } finally {
      this.isChatStreaming = false;

      // If this chat was minimized during streaming, update the minimized task
      const minimizedTask = this.minimizedTasks.find(
        t => t.taskType === 'contextChat' && t.chatSession === session
      );
      if (minimizedTask) {
        minimizedTask.isLoading = false;
        // Update title with last assistant response preview
        const lastAssistantMsg = session.messages[session.messages.length - 1];
        if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content) {
          minimizedTask.content = lastAssistantMsg.content;
        }
        this.renderMinimizedTasksIfVisible();
      }
    }

    // Re-render full chat content (only if panel is still showing this chat)
    // Use fresh DOM queries since the panel may have been hidden/restored
    const currentContent = this.shadowRoot?.querySelector('.glass-chat-content');
    if (this.chatSession === session && currentContent) {
      currentContent.innerHTML = this.getContextChatContentHTML();
      // Bind thinking toggle events for all thinking sections
      currentContent.querySelectorAll('.glass-thinking-section').forEach(section => {
        const header = section.querySelector('.glass-thinking-header');
        if (header && !header.hasAttribute('data-bound')) {
          header.setAttribute('data-bound', 'true');
          header.addEventListener('click', () => {
            section.classList.toggle('collapsed');
          });
        }
      });
    }

    // Re-enable input (only if panel is still showing this chat)
    if (this.chatSession === session && this.shadowRoot) {
      const currentInput = this.shadowRoot.querySelector('.glass-chat-input') as HTMLInputElement;
      if (currentInput) {
        currentInput.disabled = false;
        currentInput.placeholder = '输入问题后按回车...';
        currentInput.focus();
      }
    }
  }

  private scrollChatToBottom(): void {
    if (!this.shadowRoot) return;
    const body = this.shadowRoot.querySelector('.glass-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  // ========================================
  // Annotations View Methods
  // ========================================

  // Callback for scrolling to annotation on current page
  private onScrollToAnnotation: ((id: string) => boolean) | null = null;

  public async showAnnotations(callbacks?: { onScrollToAnnotation?: (id: string) => boolean }): Promise<void> {
    this.annotationsList = await getAllAnnotations();
    this.annotationsSearch = '';
    this.onScrollToAnnotation = callbacks?.onScrollToAnnotation || null;
    this.currentView = 'annotations';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getAnnotationsViewHTML(): string {
    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="annotations">
          <span class="glass-command-tag-icon">${icons.highlighter}</span>
          <span class="glass-command-tag-label">批注</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input"
          placeholder="搜索批注..."
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-knowledge-filter">
        <button class="glass-filter-btn ${this.annotationsFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        <button class="glass-filter-btn ${this.annotationsFilter === 'current' ? 'active' : ''}" data-filter="current">当前页面</button>
      </div>
      <div class="glass-body">
        <div class="glass-knowledge-content">
          ${this.getAnnotationsContentHTML()}
        </div>
      </div>
      <div class="glass-footer">
        <div class="glass-knowledge-footer-info">
          ${this.getLocalFilteredAnnotations().length} 条批注
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getLocalFilteredAnnotations(): Annotation[] {
    return getFilteredAnnotations(
      this.annotationsList,
      this.annotationsFilter,
      this.annotationsSearch,
      window.location.href
    );
  }

  private getAnnotationsContentHTML(): string {
    return getAnnotationsContentHTMLFromModule(
      this.annotationsList,
      this.annotationsFilter,
      this.annotationsSearch,
      window.location.href,
      icons
    );
  }

  private bindAnnotationsEvents(): void {
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
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    });

    // Filter buttons
    const filterBtns = this.shadowRoot.querySelectorAll('.glass-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.annotationsFilter = (btn as HTMLElement).dataset.filter as 'all' | 'current';
        const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
        if (content) {
          content.innerHTML = this.getAnnotationsContentHTML();
          this.bindAnnotationEntryEvents();
        }
        // Update filter button states
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update footer count
        const footerInfo = this.shadowRoot?.querySelector('.glass-knowledge-footer-info');
        if (footerInfo) {
          footerInfo.textContent = `${this.getLocalFilteredAnnotations().length} 条批注`;
        }
      });
    });

    // Search
    input?.addEventListener('input', () => {
      this.annotationsSearch = input.value.trim();
      const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
      if (content) {
        content.innerHTML = this.getAnnotationsContentHTML();
        this.bindAnnotationEntryEvents();
      }
      // Update footer count
      const footerInfo = this.shadowRoot?.querySelector('.glass-knowledge-footer-info');
      if (footerInfo) {
        footerInfo.textContent = `${this.getLocalFilteredAnnotations().length} 条批注`;
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.currentView = 'commands';
        this.viewStack = [];
        this.renderCurrentView(true, true);
      }
    });

    // Bind entry events
    this.bindAnnotationEntryEvents();
  }

  private bindAnnotationEntryEvents(): void {
    if (!this.shadowRoot) return;

    // Entry click - navigate to the page and scroll to the annotation
    const entries = this.shadowRoot.querySelectorAll('.glass-knowledge-entry');
    entries.forEach(entry => {
      entry.addEventListener('click', (e) => {
        // Don't navigate if clicking delete button
        if ((e.target as HTMLElement).classList.contains('glass-knowledge-entry-delete')) return;

        const url = (entry as HTMLElement).dataset.url;
        const id = (entry as HTMLElement).dataset.id;
        if (url) {
          // If on the same page, scroll to the annotation
          const currentUrl = normalizeUrlForAnnotation(window.location.href);
          if (url === currentUrl) {
            this.hide();
            // Try to scroll to the annotation after hiding
            if (id && this.onScrollToAnnotation) {
              setTimeout(() => {
                this.onScrollToAnnotation?.(id);
              }, 300); // Wait for panel to hide
            }
          } else {
            // Navigate to the page (annotation will be visible when page loads)
            window.location.href = url;
          }
        }
      });
    });

    // Delete buttons
    const deleteButtons = this.shadowRoot.querySelectorAll('.glass-knowledge-entry-delete');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('确定要删除这条批注吗？')) {
          await deleteAnnotationFromStorage(id);
          // Remove from local list
          this.annotationsList = this.annotationsList.filter(a => a.id !== id);
          // Re-render content
          const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
          if (content) {
            content.innerHTML = this.getAnnotationsContentHTML();
            this.bindAnnotationEntryEvents();
          }
          // Update footer count
          const footerInfo = this.shadowRoot?.querySelector('.glass-knowledge-footer-info');
          if (footerInfo) {
            footerInfo.textContent = `${this.getLocalFilteredAnnotations().length} 条批注`;
          }
        }
      });
    });
  }

  // ========================================
  // Knowledge Base View Methods
  // ========================================

  public async showKnowledge(): Promise<void> {
    try {
      // Load all data
      const [annotations, savedTasks] = await Promise.all([
        getAllAnnotations(),
        getAllTasks(),
      ]);

      // Convert to unified format using extracted functions
      this.knowledgeItems = [
        ...annotations.map(a => annotationToKnowledgeItem(a)),
        ...savedTasks.map(t => savedTaskToKnowledgeItem(t)),
      ];

      // Sort by date (newest first)
      this.knowledgeItems.sort((a, b) => b.createdAt - a.createdAt);

      this.knowledgeSearch = '';
      this.knowledgeFilter = 'all';
      this.currentView = 'knowledge';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    } catch (error) {
      console.error('The Panel: Failed to load knowledge base', error);
      // Still show the view with empty content
      this.knowledgeItems = [];
      this.knowledgeSearch = '';
      this.knowledgeFilter = 'all';
      this.currentView = 'knowledge';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    }
  }

  private getKnowledgeViewHTML(): string {
    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="knowledge">
          <span class="glass-command-tag-icon">${icons.library}</span>
          <span class="glass-command-tag-label">知识库</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <input
          type="text"
          class="glass-input"
          placeholder="搜索知识库..."
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-knowledge-filter">
        <button class="glass-filter-btn ${this.knowledgeFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        <button class="glass-filter-btn ${this.knowledgeFilter === 'annotations' ? 'active' : ''}" data-filter="annotations">批注</button>
        <button class="glass-filter-btn ${this.knowledgeFilter === 'ai-results' ? 'active' : ''}" data-filter="ai-results">AI 结果</button>
      </div>
      <div class="glass-body">
        <div class="glass-knowledge-content">
          ${this.getKnowledgeContentHTML()}
        </div>
      </div>
      <div class="glass-footer">
        <div class="glass-footer-content">
          <div class="glass-knowledge-footer-info">
            ${this.getLocalFilteredKnowledgeItems().length} 条记录
          </div>
          <button class="glass-footer-btn glass-btn-export-knowledge" title="导出">
            ${icons.download}
          </button>
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
    `;
  }

  private getLocalFilteredKnowledgeItems(): KnowledgeItem[] {
    return getFilteredKnowledgeItems(this.knowledgeItems, this.knowledgeFilter, this.knowledgeSearch);
  }

  private getKnowledgeContentHTML(): string {
    return getKnowledgeContentHTMLFromModule(
      this.knowledgeItems,
      this.knowledgeFilter,
      this.knowledgeSearch,
      icons
    );
  }

  private bindKnowledgeEvents(): void {
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
      this.currentView = 'commands';
      this.viewStack = [];
      this.renderCurrentView(true, true);
    });

    // Filter buttons
    const filterBtns = this.shadowRoot.querySelectorAll('.glass-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.knowledgeFilter = (btn as HTMLElement).dataset.filter as 'all' | 'annotations' | 'ai-results';
        const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
        if (content) {
          content.innerHTML = this.getKnowledgeContentHTML();
          this.bindKnowledgeEntryEvents();
        }
        // Update filter button states
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update footer count
        this.updateKnowledgeFooter();
      });
    });

    // Search
    input?.addEventListener('input', () => {
      this.knowledgeSearch = input.value.trim();
      const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
      if (content) {
        content.innerHTML = this.getKnowledgeContentHTML();
        this.bindKnowledgeEntryEvents();
      }
      this.updateKnowledgeFooter();
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.currentView = 'commands';
        this.viewStack = [];
        this.renderCurrentView(true, true);
      }
    });

    // Export button
    const exportBtn = this.shadowRoot.querySelector('.glass-btn-export-knowledge');
    exportBtn?.addEventListener('click', () => {
      this.exportKnowledge();
    });

    // Bind entry events
    this.bindKnowledgeEntryEvents();
  }

  private updateKnowledgeFooter(): void {
    const footerInfo = this.shadowRoot?.querySelector('.glass-knowledge-footer-info');
    if (footerInfo) {
      footerInfo.textContent = `${this.getLocalFilteredKnowledgeItems().length} 条记录`;
    }
  }

  private bindKnowledgeEntryEvents(): void {
    if (!this.shadowRoot) return;

    // Entry click - open detail view for AI results, navigate for annotations
    const entries = this.shadowRoot.querySelectorAll('.glass-knowledge-entry');
    entries.forEach(entry => {
      entry.addEventListener('click', (e) => {
        // Don't navigate if clicking delete button
        if ((e.target as HTMLElement).classList.contains('glass-knowledge-entry-delete')) return;

        const id = (entry as HTMLElement).dataset.id;
        const type = (entry as HTMLElement).dataset.type;
        const url = (entry as HTMLElement).dataset.url;

        if (type === 'ai-result' && id) {
          // Open AI result in detail view like recent tasks
          const item = this.knowledgeItems.find(i => i.id === id);
          if (item) {
            this.openKnowledgeAIResult(item);
          }
        } else if (url) {
          // For annotations, navigate to the page
          window.open(url, '_blank');
        }
      });
    });

    // Delete buttons
    const deleteButtons = this.shadowRoot.querySelectorAll('.glass-knowledge-entry-delete');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('确定要删除这条记录吗？')) {
          // Delete from storage
          if (id.startsWith('ann_')) {
            await deleteAnnotationFromStorage(id.replace('ann_', ''));
          } else if (id.startsWith('task_')) {
            await deleteTask(parseInt(id.replace('task_', '')));
          }
          // Remove from local list
          this.knowledgeItems = this.knowledgeItems.filter(item => item.id !== id);
          // Re-render content
          const content = this.shadowRoot?.querySelector('.glass-knowledge-content');
          if (content) {
            content.innerHTML = this.getKnowledgeContentHTML();
            this.bindKnowledgeEntryEvents();
          }
          this.updateKnowledgeFooter();
        }
      });
    });
  }

  private openKnowledgeAIResult(item: KnowledgeItem): void {
    // Create a mock active command to show the command tag
    const actionLabelMap: Record<string, string> = {
      translate: '翻译',
      summarize: '总结',
      summarizePage: '总结页面',
      explain: '解释',
      rewrite: '改写',
      codeExplain: '代码解释',
    };

    const actionType = item.actionType || 'translate';

    this.activeCommand = {
      id: `knowledge_${item.id}`,
      icon: getActionIcon(actionType),
      label: actionLabelMap[actionType] || item.title,
      action: actionType,
      enabled: true,
      order: 0,
    };

    // Show the AI result content
    this.aiResultData = {
      title: item.title,
      content: item.content,
      thinking: item.thinking,
      originalText: item.originalText,
      isLoading: false,
      resultType: actionType === 'translate' ? 'translate' : 'general',
      actionType: actionType,
      sourceUrl: item.url,
      sourceTitle: item.pageTitle,
      createdAt: item.createdAt,
    };

    // Set up callbacks for translate actions
    if (actionType === 'translate' && item.originalText) {
      const originalText = item.originalText;
      this.aiResultCallbacks = {
        onStop: () => abortAllRequests(),
        onTranslateLanguageChange: async (targetLang: string) => {
          await this.retranslate(originalText, targetLang);
        },
      };
    } else {
      this.aiResultCallbacks = {};
    }

    // Switch to commands view to show the result
    this.currentView = 'commands';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private exportKnowledge(): void {
    const items = this.getLocalFilteredKnowledgeItems();

    let markdown = `# 知识库导出\n\n`;
    markdown += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    markdown += `总计: ${items.length} 条记录\n\n---\n\n`;

    const groups = groupKnowledgeByDate(items);

    for (const [date, groupItems] of Object.entries(groups)) {
      markdown += `## ${date}\n\n`;

      for (const item of groupItems) {
        const typeLabel = item.type === 'annotation' ? '批注' : getActionTypeLabel(item.actionType);
        markdown += `### ${typeLabel}\n\n`;

        if (item.pageTitle) {
          markdown += `**来源**: [${item.pageTitle}](${item.url})\n\n`;
        }

        if (item.originalText) {
          markdown += `**原文**:\n> ${item.originalText}\n\n`;
        }

        markdown += `**内容**:\n${item.content}\n\n`;

        if (item.note) {
          markdown += `**笔记**: ${item.note}\n\n`;
        }

        if (item.aiResult) {
          markdown += `**AI ${getAIResultTypeLabel(item.aiResult.type)}**:\n${item.aiResult.content}\n\n`;
        }

        markdown += `---\n\n`;
      }
    }

    // Download as file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-export-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Styles are now imported from ./styles.ts
  // Utility functions (escapeHtml, getTranslationHint, etc.) are imported from ./utils.ts
}
