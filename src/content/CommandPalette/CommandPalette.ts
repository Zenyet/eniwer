// Command Palette - Apple Liquid Glass Design
// The unified interface for The Panel with authentic iOS 26 Liquid Glass aesthetics
import { MenuItem, MenuConfig, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_HISTORY_CONFIG, CustomMenuItem, BrowseSession, TrailEntry, ChatSession, AuthState } from '../../types';
import { icons } from '../../icons';
import { getStorageData, saveConfig, saveGlobalMenuItems } from '../../utils/storage';
import { saveTask, getAllTasks, deleteTask, SavedTask, enforceMaxCount } from '../../utils/taskStorage';
import { loadBrowseTrailSessions, deleteTrailEntry, clearTrailHistory, exportTrailData } from '../BrowseTrailPanel';
import { loadChatSession, saveChatSession, createNewChatSession, createChatMessage, getContextChatSystemPrompt, buildConversationPrompt, parseReferences } from '../ContextChatPanel';
import { callAI, OnChunkCallback, getTranslatePrompt, abortAllRequests } from '../../utils/ai';
import { getAllAnnotations, deleteAnnotation as deleteAnnotationFromStorage } from '../annotation/storage';
import { Annotation, ANNOTATION_COLORS } from '../../types/annotation';
import { t } from '../../i18n';

// Import views
import {
  // Settings View
  getSettingsViewHTML as getSettingsViewHTMLFromModule,
  getAccountSettingsHTML as getAccountSettingsHTMLFromModule,
  getMenuSettingsHTML as getMenuSettingsHTMLFromModule,
  // Annotations View
  normalizeUrlForAnnotation,
  // Knowledge View
  KnowledgeItem,
  annotationToKnowledgeItem,
  savedTaskToKnowledgeItem,
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
import {
  bindAnnotationsEvents as bindAnnotationsEventsFromController,
  bindBrowseTrailEvents as bindBrowseTrailEventsFromController,
  bindCommandsEvents as bindCommandsEventsFromController,
  renderBrowseTrailContent,
  bindContextChatEvents as bindContextChatEventsFromController,
  bindThinkingSections,
  bindKnowledgeEvents as bindKnowledgeEventsFromController,
  bindMenuSettingsEvents as bindMenuSettingsEventsFromController,
  bindScreenshotViewEvents as bindScreenshotViewEventsFromController,
  bindSettingsEvents as bindSettingsEventsFromController,
  buildRestoredTaskState,
  createAIResultMinimizedTask,
  createChatMinimizedTask,
  createDragHandlers,
  createDragState,
  createMinimizedTaskId,
  createScreenshotMinimizedTask,
  createStreamKey,
  getAnnotationsViewHTML as getAnnotationsViewHTMLFromController,
  getBrowseTrailViewHTML as getBrowseTrailViewHTMLFromController,
  getCommandsViewHTML as getCommandsViewHTMLFromController,
  getContextChatContentHTML as getContextChatContentHTMLFromController,
  getContextChatViewHTML as getContextChatViewHTMLFromController,
  getFilteredRecentTasks as getFilteredRecentTasksFromController,
  getLocalFilteredAnnotations as getLocalFilteredAnnotationsFromController,
  getKnowledgeViewHTML as getKnowledgeViewHTMLFromController,
  getLocalFilteredKnowledgeItems as getLocalFilteredKnowledgeItemsFromController,
  getScreenshotViewHTML as getScreenshotViewHTMLFromController,
  removeExistingTaskForAction,
  renderCommandsContent as renderCommandsContentFromController,
  renderAnnotationsContent,
  renderStreamingChatContent,
  renderMinimizedTasksSection as renderMinimizedTasksSectionFromController,
  renderRecentTasksSection as renderRecentTasksSectionFromController,
  renderScreenshotContent as renderScreenshotContentFromController,
  renderKnowledgeContent,
  takeMinimizedTask,
  updateAnnotationsFooter as updateAnnotationsFooterFromController,
  updateKnowledgeFooter as updateKnowledgeFooterFromController,
} from './controllers';

// Import utility functions from utils module
import {
  escapeHtml,
  formatAIContent,
  getLoadingHTML,
  getThinkingSectionHTML,
  formatTimeAgo,
  getTranslateLanguageSelectHTML,
  getActionIcon,
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
  private pendingQuickAskQuestion: string | null = null;

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
  private dragState = createDragState();
  private readonly dragHandlers = createDragHandlers(() => this.shadowRoot, this.dragState);
  private readonly handleDragStart = this.dragHandlers.handleDragStart;
  private readonly handleDragMove = this.dragHandlers.handleDragMove;
  private readonly handleDragEnd = this.dragHandlers.handleDragEnd;

  // Minimized tasks storage (in-memory for current session)
  private minimizedTasks: MinimizedTask[] = [];
  private minimizedTaskIdCounter = 0;
  private currentStreamKey: string | null = null; // Key to identify current active stream
  private autoRestoreTaskId: string | null = null; // ID of task to auto-restore on next show()
  private autoRestoreView: ViewType | null = null; // Non-task view to auto-restore on next show()
  // Track all active stream keys for concurrent tasks
  private activeStreamKeys: Set<string> = new Set();

  // Recent saved tasks from IndexedDB
  private recentSavedTasks: SavedTask[] = [];
  // Unsaved recent results (in-memory only, cleared on page refresh)
  private unsavedRecentTasks: SavedTask[] = [];

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
    this.updateTheme();
    // Refresh recent saved tasks when showing
    this.loadRecentSavedTasks();

    // Check if we should auto-restore the previous view
    if (this.autoRestoreTaskId) {
      const taskId = this.autoRestoreTaskId;
      this.autoRestoreTaskId = null;
      const task = takeMinimizedTask(this.minimizedTasks, taskId);
      if (task) {
        this.restoreStateFromTask(task);
        this.render();
        return;
      }
    }

    // Check if we should auto-restore a non-task view (settings, annotations, knowledge, etc.)
    if (this.autoRestoreView) {
      const view = this.autoRestoreView;
      this.autoRestoreView = null;
      this.currentView = view;
      this.viewStack = [];
      this.render();
      return;
    }

    // Normal flow - reset to commands view
    this.selectedIndex = 0;
    this.searchQuery = '';
    this.currentView = 'commands';
    this.viewStack = [];
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.aiResultData = null;
    this.aiResultCallbacks = null;
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

      // Auto-minimize active chat session before hiding (streaming or completed)
      if (this.chatSession) {
        this.saveChatAsMinimized();
      }

      // Auto-minimize active screenshot before hiding (loading or completed)
      if (this.screenshotData) {
        this.saveScreenshotAsMinimized();
      }

      // Determine auto-restore strategy for next show()
      this.autoRestoreTaskId = null;
      this.autoRestoreView = null;
      const nonTaskViews: ViewType[] = ['settings', 'settings-menu', 'annotations', 'knowledge', 'browseTrail'];
      if (nonTaskViews.includes(this.currentView)) {
        // Non-task view: restore the view directly (data persists in memory)
        // Restore 'settings-menu' as 'settings' since viewStack won't be preserved
        this.autoRestoreView = this.currentView === 'settings-menu' ? 'settings' : this.currentView;
      } else if (this.currentView !== 'commands' || this.activeCommand) {
        // Task-based view was saved as minimized — record its ID
        this.autoRestoreTaskId = this.minimizedTasks[this.minimizedTasks.length - 1]?.id || null;
      }

      const panel = this.shadowRoot?.querySelector('.glass-panel') as HTMLElement;
      if (panel) {
        // Save panel position before hiding (for restoring on next show)
        this.dragState.savedPanelPosition = {
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
        this.dragState.hasDragged = false;
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
      'commands': t('view.commands'),
      'ai-result': this.aiResultData?.title || t('view.aiResult'),
      'settings': t('view.settings'),
      'settings-menu': t('view.settingsMenu'),
      'screenshot': t('view.screenshot'),
      'browseTrail': t('view.browseTrail'),
      'contextChat': t('view.contextChat'),
      'annotations': t('view.annotations'),
      'knowledge': t('view.knowledge'),
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

    // Check if there's already a minimized task for this action type that is still loading
    // Only restore if the task is still in progress — completed tasks should not block new requests
    if (actionType) {
      const existingTask = this.minimizedTasks.find(t => t.actionType === actionType && t.isLoading);
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
    this.currentStreamKey = createStreamKey();
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
      this.renderCurrentView(true, true);
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
      label: t('menu.screenshot'),
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
      this.renderCurrentView(true, true);
    }
  }

  private _screenshotStreamRAF: number | null = null;

  public updateScreenshotResult(result: string, isLoading: boolean = false): void {
    if (this.screenshotData) {
      this.screenshotData.result = result;
      this.screenshotData.isLoading = isLoading;

      // When finished, save to history
      if (!isLoading && result && !result.startsWith('AI') && !result.includes(t('aiResult.configureHint')) && !result.includes(t('aiResult.requestFailed'))) {
        if (!this.screenshotData.history) this.screenshotData.history = [];
        this.screenshotData.history.push({
          question: this.screenshotData.currentQuestion || t('screenshot.describeImage'),
          answer: result,
        });
        this.screenshotData.currentQuestion = undefined;
      }

      // Throttle DOM updates during streaming via rAF
      if (isLoading) {
        if (!this._screenshotStreamRAF) {
          this._screenshotStreamRAF = requestAnimationFrame(() => {
            this._screenshotStreamRAF = null;
            this.renderScreenshotContent();
          });
        }
      } else {
        // Final update: render immediately
        if (this._screenshotStreamRAF) {
          cancelAnimationFrame(this._screenshotStreamRAF);
          this._screenshotStreamRAF = null;
        }
        this.renderScreenshotContent();
      }
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
    renderScreenshotContentFromController(this.shadowRoot, this.screenshotData);
  }

  private _streamUpdateRAF: number | null = null;

  public streamUpdate(_chunk: string, fullText: string, thinking?: string, targetStreamKey?: string): void {
    // Use targetStreamKey if provided (for routing to specific task), otherwise use currentStreamKey
    const streamKey = targetStreamKey || this.currentStreamKey;

    // Update data immediately (cheap)
    if (this.aiResultData && this.aiResultData.streamKey === streamKey) {
      this.aiResultData.content = fullText;
      this.aiResultData.isLoading = true;
      if (thinking) {
        this.aiResultData.thinking = thinking;
      }
    } else if (this.aiResultData) {
    }

    // Also update minimized task data
    if (streamKey) {
      const task = this.minimizedTasks.find(t => t.streamKey === streamKey);
      if (task) {
        task.content = fullText;
        task.isLoading = true;
        if (thinking) {
          task.thinking = thinking;
        }
      }
    }

    // Batch DOM updates to next animation frame
    if (!this._streamUpdateRAF) {
      this._streamUpdateRAF = requestAnimationFrame(() => {
        this._streamUpdateRAF = null;
        if (this.aiResultData && this.aiResultData.streamKey === (targetStreamKey || this.currentStreamKey)) {
          if (this.currentView === 'commands' && this.activeCommand) {
            this.updateUnifiedContent();
          } else {
            this.updateAIResultContent();
          }
        }
      });
    }
  }

  public updateAIResult(content: string, thinking?: string, targetStreamKey?: string): void {
    // Use targetStreamKey if provided, otherwise use currentStreamKey
    const streamKey = targetStreamKey || this.currentStreamKey;

    // Track which data completed for auto-save
    let completedData: AIResultData | null = null;

    // Update active AI result if streamKey matches
    if (this.aiResultData && this.aiResultData.streamKey === streamKey) {
      this.aiResultData.content = content;
      this.aiResultData.isLoading = false;
      if (thinking) {
        this.aiResultData.thinking = thinking;
      }
      completedData = this.aiResultData;
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
        // Use minimized task data for auto-save if active data wasn't matched
        if (!completedData) {
          completedData = {
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
        }
      }
      // Remove from active stream keys since this stream is complete
      this.activeStreamKeys.delete(streamKey);
      // Clear currentStreamKey only if it matches
      if (this.currentStreamKey === streamKey) {
        this.currentStreamKey = null;
      }
    }

    // Auto-save if enabled, otherwise add to unsaved recent for quick access
    if (completedData && completedData.content) {
      if (this.config.autoSaveTask) {
        this.autoSaveAIResult(completedData);
      } else {
        this.addToUnsavedRecent(completedData);
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
        this.renderCurrentView(true, true);
      }
    });

    // Set view state BEFORE rendering
    this.currentView = 'settings';
    this.viewStack = [];

    if (!this.container) {
      this.updateTheme();
      this.render();
    } else {
      this.renderCurrentView(true, true);
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
    const hasRestoredPosition = this.dragState.savedPanelPosition && this.dragState.savedPanelPosition.transform === 'none';
    panel.className = `glass-panel ${hasRestoredPosition ? 'glass-panel-enter-restored' : 'glass-panel-enter'} ${this.theme}`;

    // Restore saved position if available
    if (this.dragState.savedPanelPosition) {
      panel.style.top = this.dragState.savedPanelPosition.top;
      panel.style.left = this.dragState.savedPanelPosition.left;
      panel.style.right = this.dragState.savedPanelPosition.right;
      panel.style.transform = this.dragState.savedPanelPosition.transform;
      // If panel was previously dragged (fixed positioning), preserve it
      if (this.dragState.savedPanelPosition.transform === 'none') {
        panel.style.position = 'fixed';
        this.dragState.hasDragged = true;
      }
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

    // Position the panel (unless keepPosition is true or user has dragged/restored position)
    if (!keepPosition && !this.dragState.hasDragged) {
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

    // Fade-out → replace content → fade-in to eliminate flicker
    if (shouldAnimate) {
      panel.style.opacity = '0';
      // Use double-rAF to ensure opacity:0 is painted before replacing DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.applyViewContent(panel);
          panel.style.opacity = '1';
        });
      });
    } else {
      this.applyViewContent(panel);
    }
  }

  private applyViewContent(panel: HTMLElement): void {
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
          // Auto-send pending quick ask question
          if (this.pendingQuickAskQuestion) {
            const chatInput = this.shadowRoot?.querySelector('.glass-chat-input') as HTMLInputElement;
            if (chatInput) {
              chatInput.value = this.pendingQuickAskQuestion;
              this.pendingQuickAskQuestion = null;
              this.sendChatMessage(chatInput);
              return;
            }
            this.pendingQuickAskQuestion = null;
          }
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
    return getCommandsViewHTMLFromController({
      activeCommand: this.activeCommand,
      aiResultData: this.aiResultData,
      config: this.config,
      filteredItems: this.filteredItems,
      globalSearchResults: this.globalSearchResults,
      isGlobalSearchLoading: this.isGlobalSearchLoading,
      minimizedTasks: this.minimizedTasks,
      recentCommands: this.recentCommands,
      recentTasks: this.getFilteredRecentTasks(),
      searchQuery: this.searchQuery,
      selectedIndex: this.selectedIndex,
    });
  }

  private bindCommandsEvents(): void {
    if (!this.shadowRoot) return;
    bindCommandsEventsFromController(
      {
        activeCommand: this.activeCommand,
        aiResultData: this.aiResultData,
        config: this.config,
        filteredItems: this.filteredItems,
        globalSearchResults: this.globalSearchResults,
        isGlobalSearchLoading: this.isGlobalSearchLoading,
        minimizedTasks: this.minimizedTasks,
        recentCommands: this.recentCommands,
        recentTasks: this.getFilteredRecentTasks(),
        searchQuery: this.searchQuery,
        selectedIndex: this.selectedIndex,
      },
      {
        handleDragStart: this.handleDragStart,
        onActiveInputChange: (value) => {
          this.activeCommandInput = value;
        },
        onBindThinkingSections: (container) => {
          this.bindThinkingToggle(container);
        },
        onClearActiveCommand: () => this.clearActiveCommand(),
        onCopyResult: (button) => {
          if (this.aiResultData?.content) {
            navigator.clipboard.writeText(this.aiResultData.content);
            this.showCopyFeedback(button);
          }
        },
        onDeleteRecentTask: (taskId) => this.deleteSavedTask(taskId),
        onDismissMinimizedTask: (taskId) => this.dismissMinimizedTask(taskId),
        onExecuteSelected: () => this.executeSelected(),
        onExportToDrive: (button) => this.exportToDrive(button),
        onFilterInput: (query) => {
          this.searchQuery = query;
          this.filterCommands();
        },
        onHide: () => this.hide(),
        onHoverCommand: (index) => {
          this.selectedIndex = index;
          this.updateSelection();
        },
        onLeaveCommands: () => {
          this.selectedIndex = -1;
          this.updateSelection();
        },
        onOpenSearchResultUrl: (url) => {
          this.hide();
          window.open(url, '_blank');
        },
        onRefresh: () => {
          this.aiResultCallbacks?.onRefresh?.();
        },
        onRestoreMinimizedTask: (taskId) => this.restoreMinimizedTask(taskId),
        onRestoreRecentTask: (taskId) => {
          const task = this.recentSavedTasks.find(t => t.id === taskId)
            || this.unsavedRecentTasks.find(t => t.id === taskId);
          if (task) {
            this.restoreSavedTask(task);
          }
        },
        onSaveTask: (button) => this.saveCurrentTask(button),
        onSaveToAnnotation: (button) => this.saveToAnnotation(button),
        onSearchCommandSelect: (id) => {
          const item = this.menuItems.find(m => m.id === id);
          if (!item) return;
          this.selectedIndex = 0;
          this.handleSelectItem(item);
        },
        onSelectCommand: (index) => {
          this.selectedIndex = index;
          this.executeSelected();
        },
        onSelectNext: () => this.selectNext(),
        onSelectPrev: () => this.selectPrev(),
        onStop: () => {
          if (this.aiResultData) {
            this.aiResultData.isLoading = false;
          }
          this.aiResultCallbacks?.onStop?.();
          this.updateUnifiedContent();
        },
        onToggleCompare: () => this.toggleCompareMode(),
        onTranslateInput: (text) => {
          this.callbacks?.onTranslateInput?.(text);
        },
        onTranslateLanguageChange: (language) => {
          if (!this.aiResultData) return;
          this.currentStreamKey = createStreamKey();
          this.aiResultData.streamKey = this.currentStreamKey;
          this.aiResultData.translateTargetLanguage = language;
          this.aiResultData.isLoading = true;
          this.aiResultData.content = '';
          this.updateUnifiedContent();
          this.aiResultCallbacks?.onTranslateLanguageChange?.(language);
        },
        shadowRoot: this.shadowRoot,
      }
    );
  }

  // Ensure menuItems is loaded (needed when panel was opened via showAIResult without show())
  private async ensureMenuItems(): Promise<void> {
    if (this.menuItems.length === 0) {
      try {
        const data = await getStorageData();
        this.menuItems = (data.globalMenuItems || []).filter(item => item.enabled !== false);
      } catch {
        this.menuItems = [];
      }
    }
  }

  private async clearActiveCommand(): Promise<void> {
    // If there's an active AI action still loading, minimize it to background
    if (this.aiResultData && this.aiResultData.isLoading && this.activeCommand) {
      await this.minimizeToBackground();
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
      await this.ensureMenuItems();
      this.filteredItems = this.sortByRecent(this.menuItems);
      this.selectedIndex = 0;
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
      await this.ensureMenuItems();
      this.filteredItems = this.sortByRecent(this.menuItems);
      this.selectedIndex = 0;
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
    this.currentView = 'commands';
    this.viewStack = [];
    await this.ensureMenuItems();
    this.filteredItems = this.sortByRecent(this.menuItems);
    this.selectedIndex = 0;
    this.renderCurrentView(true, true);
  }

  // Minimize current task to background without aborting (streaming continues)
  private async minimizeToBackground(): Promise<void> {
    this.saveCurrentAsMinimized();

    // Clear active state but keep currentStreamKey for updates
    this.activeCommand = null;
    this.activeCommandInput = '';
    this.searchQuery = '';
    this.currentView = 'commands';
    this.viewStack = [];
    await this.ensureMenuItems();
    this.filteredItems = this.sortByRecent(this.menuItems);
    this.selectedIndex = 0;
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

  private async autoSaveAIResult(data: AIResultData): Promise<void> {
    if (!data.content) return;
    try {
      await saveTask({
        title: data.title,
        content: data.content,
        thinking: data.thinking,
        originalText: data.originalText,
        resultType: data.resultType,
        actionType: data.actionType || 'unknown',
        sourceUrl: data.sourceUrl || window.location.href,
        sourceTitle: data.sourceTitle || document.title,
        translateTargetLanguage: data.translateTargetLanguage,
        createdAt: data.createdAt || Date.now(),
      });
      const maxCount = this.config.history?.maxSaveCount || DEFAULT_HISTORY_CONFIG.maxSaveCount;
      await enforceMaxCount(maxCount);
      await this.loadRecentSavedTasks();

      // Show save feedback on the save button if visible (with slight delay)
      const saveBtn = this.shadowRoot?.querySelector('.glass-btn-save') as HTMLButtonElement;
      if (saveBtn) {
        this.showSaveFeedback(saveBtn, 600);
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  private addToUnsavedRecent(data: AIResultData): void {
    // Avoid duplicates by streamKey
    if (data.streamKey && this.unsavedRecentTasks.some(t => t.id === `unsaved-${data.streamKey}`)) {
      return;
    }
    const task: SavedTask = {
      id: `unsaved-${data.streamKey || Date.now()}`,
      title: data.title,
      content: data.content,
      thinking: data.thinking,
      originalText: data.originalText,
      resultType: data.resultType,
      actionType: data.actionType || 'unknown',
      sourceUrl: data.sourceUrl || window.location.href,
      sourceTitle: data.sourceTitle || document.title,
      translateTargetLanguage: data.translateTargetLanguage,
      createdAt: data.createdAt || Date.now(),
      savedAt: Date.now(),
    };
    this.unsavedRecentTasks.unshift(task);
    // Keep a reasonable limit
    if (this.unsavedRecentTasks.length > 20) {
      this.unsavedRecentTasks.pop();
    }
    // Re-render recent tasks if visible
    if (this.shadowRoot && this.currentView === 'commands') {
      this.renderRecentTasks();
    }
  }

  private async saveChatToKnowledge(btn: HTMLButtonElement): Promise<void> {
    if (!this.chatSession) return;
    const lastAssistantMsg = [...this.chatSession.messages].reverse().find(m => m.role === 'assistant' && m.content);
    if (!lastAssistantMsg) return;

    // Title: first 20 chars of last user message
    const lastUserMsg = [...this.chatSession.messages].reverse().find(m => m.role === 'user');
    const title = lastUserMsg
      ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
      : (this.isQuickAsk ? t('chat.quickAsk') : t('menu.contextChat'));

    try {
      await saveTask({
        title,
        content: lastAssistantMsg.content,
        thinking: lastAssistantMsg.thinking,
        resultType: 'general',
        actionType: this.isQuickAsk ? 'quickAsk' : 'contextChat',
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        createdAt: Date.now(),
      });
      const maxCount = this.config.history?.maxSaveCount || DEFAULT_HISTORY_CONFIG.maxSaveCount;
      await enforceMaxCount(maxCount);
      await this.loadRecentSavedTasks();
      this.showSaveFeedback(btn);
    } catch (error) {
      console.error('Failed to save chat:', error);
    }
  }

  private showSaveFeedback(btn: HTMLButtonElement, delay: number = 0): void {
    const originalHTML = btn.innerHTML;
    const doFeedback = () => {
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
    };
    if (delay > 0) {
      setTimeout(doFeedback, delay);
    } else {
      doFeedback();
    }
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
      this.showToast(t('chat.saveFailed'));
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
      this.showToast(t('settings.loginGoogle'));
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
        this.showToast(t('settings.exportedToDocs'));

        // Open the doc in a new tab
        setTimeout(() => {
          window.open(response.fileUrl, '_blank');
        }, 500);
      } else {
        this.showToast(response.error || t('settings.exportFailed'));
        btn.innerHTML = originalHTML;
      }
    } catch (error) {
      console.error('Export to Drive error:', error);
      this.showToast(t('settings.exportFailed'));
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
      const copyBtn = footer.querySelector('.glass-btn-copy') as HTMLElement;
      const refreshBtn = footer.querySelector('.glass-btn-refresh') as HTMLElement;
      const saveBtn = footer.querySelector('.glass-btn-save') as HTMLElement;

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

    // Update header stop button visibility
    const headerStopBtn = this.shadowRoot.querySelector('.glass-search .glass-btn-stop') as HTMLElement;
    if (headerStopBtn) {
      headerStopBtn.style.display = this.aiResultData.isLoading ? 'flex' : 'none';
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
            <button class="glass-header-btn glass-btn-compare" title="${t('aiResult.compareOriginal')}">
              ${icons.columns}
            </button>
          ` : ''}
          ${isPageAction && !data.isLoading ? `
            <button class="glass-header-btn glass-btn-refresh" title="${t('aiResult.resummarize')}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
            </button>
          ` : ''}
          <button class="glass-header-btn glass-btn-copy" title="${t('common.copy')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="glass-header-btn glass-btn-stop" title="${t('common.abort')}" style="display: ${data.isLoading ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
          </button>
          <button class="glass-minimize-btn" title="${t('common.minimize')}">
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
        this.currentStreamKey = createStreamKey();
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

  // Minimize/Restore methods

  /**
   * Save current active AI result as a minimized task without hiding the panel.
   * Used when switching between tasks to preserve the current result.
   */
  private saveCurrentAsMinimized(): void {
    if (!this.aiResultData) return;

    if (this.aiResultData.actionType === 'summarizePage') {
      removeExistingTaskForAction(this.minimizedTasks, 'summarizePage');
    }

    const task = createAIResultMinimizedTask(
      createMinimizedTaskId(++this.minimizedTaskIdCounter),
      this.aiResultData,
      this.aiResultCallbacks
    );
    this.minimizedTasks.push(task);

    this.aiResultData = null;
    this.aiResultCallbacks = null;
  }

  private saveChatAsMinimized(): void {
    if (!this.chatSession) return;

    const task = createChatMinimizedTask(
      createMinimizedTaskId(++this.minimizedTaskIdCounter),
      this.chatSession,
      this.isChatStreaming,
      this.isQuickAsk,
      t('chat.conversation')
    );
    this.minimizedTasks.push(task);

    this.chatSession = null;
    this.isChatStreaming = false;
  }

  private saveScreenshotAsMinimized(): void {
    if (!this.screenshotData) return;

    const task = createScreenshotMinimizedTask(
      createMinimizedTaskId(++this.minimizedTaskIdCounter),
      this.screenshotData,
      t('screenshot.screenshotAnalysis')
    );
    this.minimizedTasks.push(task);

    this.screenshotData = null;
    this.screenshotCallbacks = null;
  }

  private minimize(): void {
    this.saveCurrentAsMinimized();
    this.hide();
  }

  /**
   * Restore state from a minimized task without rendering.
   * Sets all relevant properties so the view can be rendered afterward.
   */
  private restoreStateFromTask(task: MinimizedTask): void {
    const restoredState = buildRestoredTaskState(task, {
      contextChatLabel: t('chat.contextChatLabel'),
      quickAskLabel: t('chat.quickAskLabel'),
      screenshotLabel: t('menu.screenshot'),
    });

    this.activeCommand = restoredState.activeCommand;
    this.aiResultData = restoredState.aiResultData;
    this.aiResultCallbacks = restoredState.aiResultCallbacks;
    this.chatSession = restoredState.chatSession;
    this.currentStreamKey = restoredState.currentStreamKey;
    this.currentView = restoredState.currentView;
    this.isChatStreaming = restoredState.isChatStreaming;
    this.isQuickAsk = restoredState.isQuickAsk;
    this.screenshotData = restoredState.screenshotData;
    this.screenshotCallbacks = null;
    this.viewStack = [];
  }

  private restoreMinimizedTask(taskId: string): void {
    const task = takeMinimizedTask(this.minimizedTasks, taskId);
    if (!task) return;

    this.saveCurrentAsMinimized();
    if (this.isChatStreaming && this.chatSession) {
      this.saveChatAsMinimized();
    }
    if (this.screenshotData?.isLoading) {
      this.saveScreenshotAsMinimized();
    }

    this.restoreStateFromTask(task);
    this.renderCurrentView(true, true);
  }

  private dismissMinimizedTask(taskId: string): void {
    const task = takeMinimizedTask(this.minimizedTasks, taskId);
    if (!task) return;

    if (task.streamKey && this.currentStreamKey === task.streamKey) {
      this.currentStreamKey = null;
    }

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
              <div class="glass-compare-label">${t('aiResult.originalText')}</div>
              <div class="glass-compare-content">${formatAIContent(this.aiResultData.originalText)}</div>
            </div>
            <div class="glass-compare-divider"></div>
            <div class="glass-compare-item">
              <div class="glass-compare-label">${t('aiResult.translatedText')}</div>
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

    bindSettingsEventsFromController({
      authState: this.authState,
      getSettingsMenuItems: () => this.settingsMenuItems,
      getTheme: () => this.theme,
      handleDragStart: this.handleDragStart,
      onCancelSettings: () => this.cancelSettings(),
      onClearHistory: async () => {
        const { clearAllTasks } = await import('../../utils/taskStorage');
        await clearAllTasks();
        this.recentSavedTasks = [];
        this.showToast(t('settings.historyCleared'));
      },
      onGoogleLogin: () => this.handleGoogleLogin(),
      onGoogleLogout: () => this.handleGoogleLogout(),
      onLoadBackupList: () => this.loadBackupList(),
      onLoadStorageUsage: () => this.loadStorageUsage(),
      onPopView: () => this.popView(),
      onRenderCurrentView: () => this.renderCurrentView(true, true),
      onResetSettings: async () => {
        await saveConfig(DEFAULT_CONFIG);
        await saveGlobalMenuItems(DEFAULT_GLOBAL_MENU);
        this.config = { ...DEFAULT_CONFIG };
        this.tempConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.settingsMenuItems = [...DEFAULT_GLOBAL_MENU];
        this.settingsChanged = false;
        this.showToast(t('settings.resetDone'));
        this.renderCurrentView(true, true);
      },
      onSaveSettings: () => this.saveSettings(),
      onShowToast: (message) => this.showToast(message),
      onSyncFromCloud: (btn) => this.handleSyncFromCloud(btn),
      onSyncToCloud: (btn) => this.handleSyncToCloud(btn),
      onSyncToggle: (enabled) => this.handleSyncToggle(enabled),
      onUpdateTheme: (theme) => this.updateTheme(theme),
      setSettingsChanged: (changed) => { this.settingsChanged = changed; },
      setSettingsMenuItems: (items) => { this.settingsMenuItems = items; },
      shadowRoot: this.shadowRoot,
      tempConfig: this.tempConfig,
    });
  }

  private async loadStorageUsage(): Promise<void> {
    if (!this.shadowRoot) return;

    const QUOTA = 10 * 1024 * 1024; // 10 MB

    const categories: { keys: string[]; label: string; color: string }[] = [
      { keys: ['thecircle_saved_tasks'], label: t('storage.aiResults'), color: '#3b82f6' },
      { keys: ['thecircle_annotations'], label: t('storage.annotations'), color: '#a855f7' },
      { keys: ['thecircle_browse_trail'], label: t('storage.browseTrail'), color: '#22c55e' },
      { keys: ['thecircle_chat_sessions'], label: t('storage.chatRecords'), color: '#f97316' },
      { keys: ['thecircle_data', 'thecircle_config'], label: t('storage.config'), color: '#9ca3af' },
    ];

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    try {
      const totalBytes = await chrome.storage.local.getBytesInUse(null);
      let knownBytes = 0;

      const results: { label: string; color: string; bytes: number }[] = [];

      for (const cat of categories) {
        const bytes = await chrome.storage.local.getBytesInUse(cat.keys);
        knownBytes += bytes;
        results.push({ label: cat.label, color: cat.color, bytes });
      }

      const otherBytes = Math.max(0, totalBytes - knownBytes);
      results.push({ label: t('storage.other'), color: '#d1d5db', bytes: otherBytes });

      // Update progress bar
      const percent = Math.min((totalBytes / QUOTA) * 100, 100);
      const fillEl = this.shadowRoot.querySelector('#storage-fill') as HTMLElement;
      const usedEl = this.shadowRoot.querySelector('#storage-used') as HTMLElement;
      const percentEl = this.shadowRoot.querySelector('#storage-percent') as HTMLElement;
      const categoriesEl = this.shadowRoot.querySelector('#storage-categories') as HTMLElement;

      if (fillEl) fillEl.style.width = `${percent}%`;
      if (usedEl) usedEl.textContent = `${formatBytes(totalBytes)} / 10 MB`;
      if (percentEl) percentEl.textContent = `${percent.toFixed(1)}%`;

      if (categoriesEl) {
        categoriesEl.innerHTML = results
          .filter(r => r.bytes > 0)
          .map(r => `
            <div class="glass-storage-category">
              <span class="glass-storage-dot" style="background: ${r.color}"></span>
              <span class="glass-storage-category-name">${r.label}</span>
              <span class="glass-storage-category-size">${formatBytes(r.bytes)}</span>
            </div>
          `).join('');
      }
    } catch {
      const usedEl = this.shadowRoot.querySelector('#storage-used') as HTMLElement;
      if (usedEl) usedEl.textContent = t('settings.cannotGetStorageInfo');
    }
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

    const langChanged = this.tempConfig.uiLanguage !== this.config.uiLanguage;

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
    this.showToast(t('settings.saved'));

    // Re-render settings view if language changed so all labels update immediately
    if (langChanged) {
      this.renderCurrentView(true, true);
    }
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
        this.showToast(t('settings.loginSuccess'));
      } else {
        this.showToast(response.error || t('settings.loginFailed'));
      }
    } catch (error) {
      console.error('Google login error:', error);
      this.showToast(t('settings.loginFailed'));
    }
  }

  // Handle Google logout
  private async handleGoogleLogout(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_LOGOUT' });
      if (response.success) {
        this.authState = { isLoggedIn: false, user: null, syncEnabled: false };
        this.renderCurrentView(true, true);
        this.showToast(t('settings.logoutSuccess'));
      } else {
        this.showToast(response.error || t('settings.logoutFailed'));
      }
    } catch (error) {
      console.error('Google logout error:', error);
      this.showToast(t('settings.logoutFailed'));
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
          this.showToast(t('settings.syncEnabledWithRestore'));
        } else {
          // No cloud data, upload current config
          await chrome.runtime.sendMessage({ type: 'SYNC_TO_CLOUD' });
          this.showToast(t('settings.syncEnabled'));
        }
      } else {
        this.showToast(t('settings.syncDisabled'));
      }
    } catch (error) {
      console.error('Sync toggle error:', error);
      this.showToast(t('settings.operationFailed'));
    }
  }

  // Manual sync to cloud
  private async handleSyncToCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> ' + t('settings.syncing');
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_TO_CLOUD' });
      if (response.success) {
        this.showToast(t('settings.uploadSuccess'));
      } else {
        this.showToast(response.error || t('settings.uploadFailed'));
      }
    } catch (error) {
      console.error('Sync to cloud error:', error);
      this.showToast(t('settings.uploadFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  // Manual sync from cloud
  private async handleSyncFromCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> ' + t('settings.syncing');
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_CLOUD' });
      if (response.success) {
        this.showToast(t('settings.downloadSuccess'));
        // Reload config to reflect changes
        const { getStorageData } = await import('../../utils/storage');
        const data = await getStorageData();
        this.config = data.config;
        this.tempConfig = JSON.parse(JSON.stringify(this.config));
        this.renderCurrentView(true, true);
      } else {
        this.showToast(response.error || t('settings.restoreFailed'));
      }
    } catch (error) {
      console.error('Sync from cloud error:', error);
      this.showToast(t('settings.restoreFailed'));
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

    listEl.innerHTML = `<div class="glass-backup-empty">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>${t('common.loading')}</span>
    </div>`;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'LIST_BACKUPS' });
      if (!response.success) {
        listEl.innerHTML = `<div class="glass-backup-empty"><span>${response.error || t('settings.loadFailed')}</span></div>`;
        return;
      }

      const backups = response.backups || [];
      if (backups.length === 0) {
        listEl.innerHTML = `<div class="glass-backup-empty">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
          <span>${t('settings.noBackups')}</span>
        </div>`;
        return;
      }

      listEl.innerHTML = backups.map((b: { id: string; name: string; timestamp: number }, i: number) => `
        <div class="glass-backup-item${i === 0 ? ' glass-backup-item-latest' : ''}" data-id="${b.id}">
          <div class="glass-backup-info">
            <div class="glass-backup-dot"></div>
            <div class="glass-backup-meta">
              <span class="glass-backup-time">${this.formatBackupTime(b.timestamp)}</span>
              <span class="glass-backup-label">${i === 0 ? t('settings.latestBackup') : this.formatRelativeTime(b.timestamp)}</span>
            </div>
          </div>
          <div class="glass-backup-actions">
            <button class="glass-backup-action-btn glass-btn-restore" data-id="${b.id}" title="${t('settings.restoreBackup')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            <button class="glass-backup-action-btn glass-backup-action-btn-danger glass-btn-delete-backup" data-id="${b.id}" title="${t('settings.deleteBackup')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
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
      listEl.innerHTML = `<div class="glass-backup-empty"><span>${t('settings.loadFailed')}</span></div>`;
    }
  }

  private formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('time.justNow');
    if (minutes < 60) return t('time.minutesAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('time.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('time.daysAgo', { n: days });
    return t('time.monthsAgo', { n: Math.floor(days / 30) });
  }

  private static SPINNER_SVG = '<svg class="glass-backup-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10" /></svg>';

  // Handle restore backup
  private async handleRestoreBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    const item = btn.closest('.glass-backup-item');
    btn.innerHTML = CommandPalette.SPINNER_SVG;
    btn.disabled = true;
    item?.classList.add('glass-backup-item-loading');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'RESTORE_BACKUP', payload: { fileId } });
      if (response.success) {
        this.showToast(t('settings.backupRestored'));
        const { getStorageData } = await import('../../utils/storage');
        const data = await getStorageData();
        this.config = data.config;
        this.tempConfig = JSON.parse(JSON.stringify(this.config));
        this.renderCurrentView(true, true);
      } else {
        this.showToast(response.error || t('settings.restoreFailed'));
      }
    } catch (error) {
      console.error('Restore backup error:', error);
      this.showToast(t('settings.restoreFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      item?.classList.remove('glass-backup-item-loading');
    }
  }

  // Handle delete backup
  private async handleDeleteBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    const item = btn.closest('.glass-backup-item');
    btn.innerHTML = CommandPalette.SPINNER_SVG;
    btn.disabled = true;
    item?.classList.add('glass-backup-item-loading');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'DELETE_BACKUP', payload: { fileId } });
      if (response.success) {
        this.showToast(t('settings.backupDeleted'));
        this.loadBackupList();
      } else {
        this.showToast(response.error || t('settings.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete backup error:', error);
      this.showToast(t('settings.deleteFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      item?.classList.remove('glass-backup-item-loading');
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

    bindMenuSettingsEventsFromController({
      getSettingsMenuItems: () => this.settingsMenuItems,
      onPopView: () => this.popView(),
      onRenderCurrentView: () => this.renderCurrentView(true, true),
      onShowToast: (message) => this.showToast(message),
      setSettingsMenuItems: (items) => { this.settingsMenuItems = items; },
      shadowRoot: this.shadowRoot,
    });
  }

  // Screenshot View
  private getScreenshotViewHTML(): string {
    return getScreenshotViewHTMLFromController({
      screenshotData: this.screenshotData,
    });
  }

  private bindScreenshotViewEvents(): void {
    if (!this.shadowRoot) return;

    bindScreenshotViewEventsFromController({
      handleDragStart: this.handleDragStart,
      onClose: () => {
        if (this.screenshotData?.isLoading) {
          this.saveScreenshotAsMinimized();
        }
        this.screenshotData = null;
        this.screenshotCallbacks?.onClose?.();
        this.screenshotCallbacks = null;
        this.activeCommand = null;
        this.currentView = 'commands';
        this.renderCurrentView(true, true);
      },
      onCopyImage: () => {
        this.screenshotCallbacks?.onCopy?.();
      },
      onCopyResult: (button, text) => {
        navigator.clipboard.writeText(text);
        this.showCopyFeedback(button);
      },
      onDescribe: () => {
        if (!this.screenshotData) return;
        this.screenshotData.currentQuestion = t('screenshot.describeImage');
        this.screenshotData.result = undefined;
        this.screenshotData.isLoading = true;
        this.renderScreenshotContent();
        this.screenshotCallbacks?.onDescribe?.();
      },
      onSave: () => {
        this.screenshotCallbacks?.onSave?.();
      },
      onStop: () => {
        if (this.screenshotData) {
          this.screenshotData.isLoading = false;
        }
        this.screenshotCallbacks?.onStop?.();
        this.renderScreenshotContent();
      },
      onSubmitQuestion: (question, input) => {
        if (!this.screenshotData) return;
        this.screenshotData.currentQuestion = question;
        this.screenshotData.result = undefined;
        this.screenshotData.isLoading = true;
        this.renderScreenshotContent();
        this.screenshotCallbacks?.onAskAI?.(question);
        input.value = '';
      },
      shadowRoot: this.shadowRoot,
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
        const label = (item.customLabel || t(item.label)).toLowerCase();
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
    return getFilteredRecentTasksFromController(
      this.recentSavedTasks,
      this.unsavedRecentTasks,
      this.searchQuery
    );
  }

  private renderCommands(): void {
    if (!this.shadowRoot) return;
    renderCommandsContentFromController(
      this.shadowRoot,
      {
        activeCommand: this.activeCommand,
        aiResultData: this.aiResultData,
        config: this.config,
        filteredItems: this.filteredItems,
        globalSearchResults: this.globalSearchResults,
        isGlobalSearchLoading: this.isGlobalSearchLoading,
        minimizedTasks: this.minimizedTasks,
        recentCommands: this.recentCommands,
        recentTasks: this.getFilteredRecentTasks(),
        searchQuery: this.searchQuery,
        selectedIndex: this.selectedIndex,
      },
      {
        onDeleteRecentTask: (taskId) => this.deleteSavedTask(taskId),
        onDismissMinimizedTask: (taskId) => this.dismissMinimizedTask(taskId),
        onHoverCommand: (index) => {
          this.selectedIndex = index;
          this.updateSelection();
        },
        onLeaveCommands: () => {
          this.selectedIndex = -1;
          this.updateSelection();
        },
        onOpenSearchResultUrl: (url) => {
          this.hide();
          window.open(url, '_blank');
        },
        onRestoreMinimizedTask: (taskId) => this.restoreMinimizedTask(taskId),
        onRestoreRecentTask: (taskId) => {
          const task = this.recentSavedTasks.find(t => t.id === taskId)
            || this.unsavedRecentTasks.find(t => t.id === taskId);
          if (task) {
            this.restoreSavedTask(task);
          }
        },
        onSearchCommandSelect: (id) => {
          const item = this.menuItems.find(m => m.id === id);
          if (!item) return;
          this.selectedIndex = 0;
          this.handleSelectItem(item);
        },
        onSelectCommand: (index) => {
          this.selectedIndex = index;
          this.executeSelected();
        },
      }
    );
  }

  private renderMinimizedTasks(): void {
    if (!this.shadowRoot) return;
    renderMinimizedTasksSectionFromController(
      this.shadowRoot,
      this.minimizedTasks,
      (taskId) => this.restoreMinimizedTask(taskId),
      (taskId) => this.dismissMinimizedTask(taskId)
    );
  }

  private renderRecentTasks(): void {
    if (!this.shadowRoot) return;
    renderRecentTasksSectionFromController(
      this.shadowRoot,
      this.getFilteredRecentTasks(),
      (taskId) => {
        const task = this.recentSavedTasks.find(t => t.id === taskId)
          || this.unsavedRecentTasks.find(t => t.id === taskId);
        if (task) {
          this.restoreSavedTask(task);
        }
      },
      (taskId) => this.deleteSavedTask(taskId)
    );
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
    // Handle unsaved (in-memory only) tasks
    if (taskId.startsWith('unsaved-')) {
      this.unsavedRecentTasks = this.unsavedRecentTasks.filter(t => t.id !== taskId);
      this.renderRecentTasks();
      return;
    }
    try {
      await deleteTask(taskId);
      this.recentSavedTasks = this.recentSavedTasks.filter(t => t.id !== taskId);
      this.renderRecentTasks();
    } catch (error) {
      console.error('Failed to delete saved task:', error);
    }
  }

  private restoreSavedTask(task: SavedTask): void {
    // Restore quickAsk/contextChat tasks as contextChat view
    if (task.actionType === 'quickAsk' || task.actionType === 'contextChat') {
      const session = createNewChatSession(task.sourceUrl || window.location.href, task.sourceTitle || document.title);
      session.messages.push(createChatMessage('user', task.title));
      session.messages.push(createChatMessage('assistant', task.content, undefined, task.thinking));
      this.chatSession = session;
      this.isQuickAsk = task.actionType === 'quickAsk';
      this.activeCommand = {
        id: task.actionType,
        action: 'contextChat',
        label: task.actionType === 'quickAsk' ? t('chat.quickAskLabel') : t('chat.contextChatLabel'),
        icon: task.actionType === 'quickAsk' ? icons.messageCircle : icons.contextChat,
        enabled: true,
        order: 0,
      };
      this.currentView = 'contextChat';
      this.viewStack = [];
      this.renderCurrentView(true, true);
      return;
    }

    // Create a mock active command to show the command tag
    const actionLabelMap: Record<string, string> = {
      translate: t('action.translate'),
      summarize: t('action.summarize'),
      summarizePage: t('action.summarizePage'),
      explain: t('action.explain'),
      rewrite: t('action.rewrite'),
      codeExplain: t('action.codeExplain'),
      contextChat: t('action.contextChat'),
      quickAsk: t('action.quickAsk'),
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
        this.updateAIResult(result.error || t('aiResult.translationFailed'));
      }
    } catch (error) {
      this.updateAIResult(t('aiResult.error', { error: String(error) }));
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

    // translateInput — enter input mode to type text for translation
    if (item.action === 'translateInput') {
      this.setActiveCommand(item);
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
      label: t('menu.browseTrail'),
      icon: icons.history,
      enabled: true,
      order: 0,
    };
    this.currentView = 'browseTrail';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getBrowseTrailViewHTML(): string {
    return getBrowseTrailViewHTMLFromController({
      displayCount: this.browseTrailDisplayCount,
      search: this.browseTrailSearch,
      sessions: this.browseTrailSessions,
    });
  }

  private bindBrowseTrailEvents(): void {
    if (!this.shadowRoot) return;

    const rerenderTrailContent = () => {
      if (!this.shadowRoot) return;
      renderBrowseTrailContent(this.shadowRoot, {
        displayCount: this.browseTrailDisplayCount,
        search: this.browseTrailSearch,
        sessions: this.browseTrailSessions,
      });
      bindBrowseTrailEventsFromController({
        handleDragStart: this.handleDragStart,
        onClearHistory: async () => {
          if (!confirm(t('confirm.clearBrowseTrail'))) return;
          await clearTrailHistory();
          this.browseTrailSessions = [];
          rerenderTrailContent();
        },
        onClose: () => {
          this.activeCommand = null;
          this.currentView = 'commands';
          this.viewStack = [];
          this.renderCurrentView(true, true);
        },
        onDeleteEntry: async (id) => {
          this.browseTrailSessions = await deleteTrailEntry(id);
          rerenderTrailContent();
        },
        onExport: () => {
          exportTrailData(this.browseTrailSessions);
          this.showToast(t('trail.exported'));
        },
        onLoadMore: () => {
          this.browseTrailDisplayCount += 50;
          rerenderTrailContent();
        },
        onOpenEntry: (url) => {
          window.open(url, '_blank');
        },
        onSearch: (query) => {
          this.browseTrailSearch = query;
          this.browseTrailDisplayCount = 50;
          rerenderTrailContent();
        },
        shadowRoot: this.shadowRoot,
      });
    };

    rerenderTrailContent();
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
      label: t('chat.quickAskLabel'),
      icon: icons.messageCircle,
      enabled: true,
      order: 0,
    };
    this.currentView = 'contextChat';
    this.viewStack = [];
    this.searchQuery = '';
    this.pendingQuickAskQuestion = question;
    this.renderCurrentView(true, true);
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
      label: t('chat.contextChatLabel'),
      icon: icons.contextChat,
      enabled: true,
      order: 0,
    };
    this.currentView = 'contextChat';
    this.viewStack = [];
    this.renderCurrentView(true, true);
  }

  private getContextChatViewHTML(): string {
    const label = this.activeCommand?.customLabel || t(this.activeCommand?.label || 'menu.contextChat');
    return getContextChatViewHTMLFromController({
      activeLabel: label,
      chatSession: this.chatSession,
      isChatStreaming: this.isChatStreaming,
      isQuickAsk: this.isQuickAsk,
    });
  }

  private getContextChatContentHTML(): string {
    return getContextChatContentHTMLFromController(this.chatSession, this.isQuickAsk);
  }

  private bindContextChatEvents(): void {
    if (!this.shadowRoot) return;

    bindContextChatEventsFromController({
      handleDragStart: this.handleDragStart,
      isChatStreaming: this.isChatStreaming,
      onClearChat: async () => {
        if (!this.chatSession) return;
        this.chatSession.messages = [];
        if (!this.isQuickAsk) {
          await saveChatSession(this.chatSession);
        }
        const content = this.shadowRoot?.querySelector('.glass-chat-content');
        if (content) {
          content.innerHTML = this.getContextChatContentHTML();
        }
        const chatSaveBtn = this.shadowRoot?.querySelector('.glass-btn-chat-save') as HTMLElement;
        if (chatSaveBtn) chatSaveBtn.style.display = 'none';
      },
      onClose: async () => {
        if (this.isChatStreaming && this.chatSession) {
          this.saveChatAsMinimized();
        }
        this.activeCommand = null;
        this.chatSession = null;
        this.currentView = 'commands';
        this.viewStack = [];
        await this.ensureMenuItems();
        this.filteredItems = this.sortByRecent(this.menuItems);
        this.selectedIndex = 0;
        this.renderCurrentView(true, true);
      },
      onSaveChat: (button) => this.saveChatToKnowledge(button),
      onScrollToBottom: () => this.scrollChatToBottom(),
      onSendMessage: (input) => this.sendChatMessage(input),
      onStop: (input) => {
        this.isChatStreaming = false;
        abortAllRequests();
        if (input) {
          input.disabled = false;
          input.placeholder = t('chat.inputPlaceholder');
        }
        const chatStopBtn = this.shadowRoot?.querySelector('.glass-btn-chat-stop') as HTMLElement;
        if (chatStopBtn) chatStopBtn.style.display = 'none';
        const content = this.shadowRoot?.querySelector('.glass-chat-content');
        if (content && this.chatSession) {
          content.innerHTML = this.getContextChatContentHTML();
          bindThinkingSections(content);
        }
      },
      shadowRoot: this.shadowRoot,
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
    input.placeholder = t('chat.aiReplying');

    // Update display
    const content = this.shadowRoot?.querySelector('.glass-chat-content');
    if (content) {
      content.innerHTML = this.getContextChatContentHTML();
      bindThinkingSections(content);
    }
    this.scrollChatToBottom();

    // Add empty assistant message placeholder
    const assistantMsg = createChatMessage('assistant', '');
    session.messages.push(assistantMsg);

    // Render the placeholder
    if (content) {
      renderStreamingChatContent(content, session, this.isQuickAsk);
    }
    this.scrollChatToBottom();

    this.isChatStreaming = true;

    // Show stop button
    const chatStopBtn = this.shadowRoot?.querySelector('.glass-btn-chat-stop') as HTMLElement;
    if (chatStopBtn) chatStopBtn.style.display = 'flex';

    // Build prompt - use simple prompt for quick ask, context prompt for context chat
    const systemPrompt = this.isQuickAsk
      ? t('chat.quickAskSystemPrompt')
      : getContextChatSystemPrompt(session);
    const conversationHistory = buildConversationPrompt(
      session.messages.slice(0, -1) // Exclude the empty assistant message
    );

    try {
      let _chatStreamRAF: number | null = null;
      // Cache DOM references for streaming to avoid repeated querySelectorAll
      let _cachedStreamingTextEl: Element | null = null;
      let _cachedStreamingContainer: Element | null = null;

      const onChunk: OnChunkCallback = (_chunk, fullText, thinking) => {
        // Update data immediately (cheap)
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = fullText;
          if (thinking) {
            lastMsg.thinking = thinking;
          }
        }

        // Batch DOM updates to next animation frame
        if (!_chatStreamRAF) {
          _chatStreamRAF = requestAnimationFrame(() => {
            _chatStreamRAF = null;

            // Resolve DOM references (use cache when possible)
            // Invalidate cache if element is detached (panel was destroyed and recreated)
            if (_cachedStreamingTextEl && !_cachedStreamingTextEl.isConnected) {
              _cachedStreamingTextEl = null;
              _cachedStreamingContainer = null;
            }
            if (!_cachedStreamingTextEl) {
              _cachedStreamingTextEl = this.shadowRoot?.querySelector('.glass-chat-streaming .glass-chat-msg-text') as Element | null;
              _cachedStreamingContainer = this.shadowRoot?.querySelector('.glass-chat-streaming') as Element | null;

              if (!_cachedStreamingTextEl && this.chatSession === session && this.shadowRoot) {
                const allAssistantTexts = this.shadowRoot.querySelectorAll('.glass-chat-msg-assistant .glass-chat-msg-text');
                _cachedStreamingTextEl = allAssistantTexts[allAssistantTexts.length - 1] || null;
                const allAssistantMsgs = this.shadowRoot.querySelectorAll('.glass-chat-msg-assistant');
                _cachedStreamingContainer = allAssistantMsgs[allAssistantMsgs.length - 1] || null;
              }
            }

            if (_cachedStreamingTextEl) {
              _cachedStreamingTextEl.innerHTML = formatAIContent(lastMsg.content);
            }

            // Update thinking section
            if (lastMsg.thinking && _cachedStreamingContainer) {
              let thinkingSection = _cachedStreamingContainer.querySelector('.glass-thinking-section');
              if (!thinkingSection) {
                const textEl = _cachedStreamingContainer.querySelector('.glass-chat-msg-text');
                if (textEl) {
                  textEl.insertAdjacentHTML('beforebegin', getThinkingSectionHTML(lastMsg.thinking));
                  thinkingSection = _cachedStreamingContainer.querySelector('.glass-thinking-section');
                  bindThinkingSections(_cachedStreamingContainer);
                }
              } else {
                const thinkingContent = thinkingSection.querySelector('.glass-thinking-content');
                if (thinkingContent) {
                  thinkingContent.innerHTML = formatAIContent(lastMsg.thinking);
                }
              }
            }

            // Auto-scroll if chat is visible
            if (this.chatSession === session) {
              this.scrollChatToBottom();
            }
          });
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
          lastMsg.content = response.error || t('chat.aiRequestFailed');
        }
      }

      // Only save chat session for context chat, not quick ask
      if (!this.isQuickAsk) {
        await saveChatSession(session);
      }
    } catch (error) {
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content = t('aiResult.error', { error: String(error) });
      }
    } finally {
      this.isChatStreaming = false;

      // Hide stop button
      const chatStopBtn = this.shadowRoot?.querySelector('.glass-btn-chat-stop') as HTMLElement;
      if (chatStopBtn) chatStopBtn.style.display = 'none';

      // Show save button if there's assistant content
      const chatSaveBtn = this.shadowRoot?.querySelector('.glass-btn-chat-save') as HTMLElement;
      if (chatSaveBtn && session.messages.some(m => m.role === 'assistant' && m.content)) {
        chatSaveBtn.style.display = 'flex';
      }

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

    // Save/record chat result (similar to AI result completion in streamComplete)
    const lastAssistantMsg = session.messages[session.messages.length - 1];
    if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content && !lastAssistantMsg.content.startsWith(t('aiResult.errorPrefix'))) {
      const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
      const chatTitle = lastUserMsg
        ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
        : (this.isQuickAsk ? t('chat.quickAsk') : t('menu.contextChat'));
      const chatResultData: AIResultData = {
        title: chatTitle,
        content: lastAssistantMsg.content,
        thinking: lastAssistantMsg.thinking,
        isLoading: false,
        resultType: 'general',
        actionType: this.isQuickAsk ? 'quickAsk' : 'contextChat',
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        createdAt: Date.now(),
      };
      if (this.config.autoSaveTask) {
        this.autoSaveAIResult(chatResultData);
      } else {
        this.addToUnsavedRecent(chatResultData);
      }
    }

    // Re-render full chat content (only if panel is still showing this chat)
    // Use fresh DOM queries since the panel may have been hidden/restored
    const currentContent = this.shadowRoot?.querySelector('.glass-chat-content');
    if (this.chatSession === session && currentContent) {
      currentContent.innerHTML = this.getContextChatContentHTML();
      bindThinkingSections(currentContent);
    }

    // Re-enable input (only if panel is still showing this chat)
    if (this.chatSession === session && this.shadowRoot) {
      const currentInput = this.shadowRoot.querySelector('.glass-chat-input') as HTMLInputElement;
      if (currentInput) {
        currentInput.disabled = false;
        currentInput.placeholder = t('chat.inputPlaceholder');
        currentInput.focus();
      }
    }
  }

  private _scrollRAF: number | null = null;
  private scrollChatToBottom(): void {
    if (!this.shadowRoot) return;
    if (this._scrollRAF) return; // Already scheduled
    this._scrollRAF = requestAnimationFrame(() => {
      this._scrollRAF = null;
      const body = this.shadowRoot?.querySelector('.glass-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    });
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
    return getAnnotationsViewHTMLFromController({
      annotations: this.annotationsList,
      currentUrl: window.location.href,
      filter: this.annotationsFilter,
      search: this.annotationsSearch,
    });
  }

  private getLocalFilteredAnnotations(): Annotation[] {
    return getLocalFilteredAnnotationsFromController({
      annotations: this.annotationsList,
      currentUrl: window.location.href,
      filter: this.annotationsFilter,
      search: this.annotationsSearch,
    });
  }

  private bindAnnotationsEvents(): void {
    if (!this.shadowRoot) return;

    const rerenderAnnotations = () => {
      if (!this.shadowRoot) return;
      renderAnnotationsContent(this.shadowRoot, {
        annotations: this.annotationsList,
        currentUrl: window.location.href,
        filter: this.annotationsFilter,
        search: this.annotationsSearch,
      });
      bindAnnotationsEventsFromController({
        handleDragStart: this.handleDragStart,
        onClose: () => {
          this.currentView = 'commands';
          this.viewStack = [];
          this.renderCurrentView(true, true);
        },
        onDeleteAnnotation: async (id) => {
          if (!confirm(t('confirm.deleteAnnotation'))) return;
          await deleteAnnotationFromStorage(id);
          this.annotationsList = this.annotationsList.filter((annotation) => annotation.id !== id);
          rerenderAnnotations();
          updateAnnotationsFooterFromController(this.shadowRoot!, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        onFilterChange: (filter) => {
          this.annotationsFilter = filter;
          rerenderAnnotations();
          updateAnnotationsFooterFromController(this.shadowRoot!, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        onOpenAnnotation: (id, url) => {
          const currentUrl = normalizeUrlForAnnotation(window.location.href);
          if (url === currentUrl) {
            this.hide();
            if (id && this.onScrollToAnnotation) {
              setTimeout(() => {
                this.onScrollToAnnotation?.(id);
              }, 300);
            }
          } else {
            window.location.href = url;
          }
        },
        onSearch: (query) => {
          this.annotationsSearch = query;
          rerenderAnnotations();
          updateAnnotationsFooterFromController(this.shadowRoot!, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        shadowRoot: this.shadowRoot,
      });
      updateAnnotationsFooterFromController(this.shadowRoot, {
        annotations: this.annotationsList,
        currentUrl: window.location.href,
        filter: this.annotationsFilter,
        search: this.annotationsSearch,
      });
    };

    rerenderAnnotations();
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
    return getKnowledgeViewHTMLFromController({
      items: this.knowledgeItems,
      filter: this.knowledgeFilter,
      search: this.knowledgeSearch,
    });
  }

  private getLocalFilteredKnowledgeItems(): KnowledgeItem[] {
    return getLocalFilteredKnowledgeItemsFromController({
      items: this.knowledgeItems,
      filter: this.knowledgeFilter,
      search: this.knowledgeSearch,
    });
  }

  private bindKnowledgeEvents(): void {
    if (!this.shadowRoot) return;

    const rerenderKnowledgeContent = () => {
      if (!this.shadowRoot) return;
      renderKnowledgeContent(this.shadowRoot, {
        items: this.knowledgeItems,
        filter: this.knowledgeFilter,
        search: this.knowledgeSearch,
      });
      bindKnowledgeEventsFromController({
        handleDragStart: this.handleDragStart,
        onClose: () => {
          this.currentView = 'commands';
          this.viewStack = [];
          this.renderCurrentView(true, true);
        },
        onDeleteItem: async (id) => {
          if (!confirm(t('confirm.deleteRecord'))) return;
          if (id.startsWith('ann_')) {
            await deleteAnnotationFromStorage(id.replace('ann_', ''));
          } else if (id.startsWith('task_')) {
            await deleteTask(parseInt(id.replace('task_', '')));
          }
          this.knowledgeItems = this.knowledgeItems.filter((item) => item.id !== id);
          rerenderKnowledgeContent();
          this.updateKnowledgeFooter();
        },
        onExport: () => this.exportKnowledge(),
        onFilterChange: (filter) => {
          this.knowledgeFilter = filter;
          rerenderKnowledgeContent();
          this.updateKnowledgeFooter();
        },
        onOpenAIResult: (id) => {
          const item = this.knowledgeItems.find((entry) => entry.id === id);
          if (item) {
            this.openKnowledgeAIResult(item);
          }
        },
        onOpenUrl: (url) => {
          window.open(url, '_blank');
        },
        onSearch: (query) => {
          this.knowledgeSearch = query;
          rerenderKnowledgeContent();
          this.updateKnowledgeFooter();
        },
        shadowRoot: this.shadowRoot,
      });
      this.updateKnowledgeFooter();
    };

    rerenderKnowledgeContent();
  }

  private updateKnowledgeFooter(): void {
    if (!this.shadowRoot) return;
    updateKnowledgeFooterFromController(this.shadowRoot, {
      items: this.knowledgeItems,
      filter: this.knowledgeFilter,
      search: this.knowledgeSearch,
    });
  }

  private openKnowledgeAIResult(item: KnowledgeItem): void {
    // Create a mock active command to show the command tag
    const actionLabelMap: Record<string, string> = {
      translate: t('action.translate'),
      summarize: t('action.summarize'),
      summarizePage: t('action.summarizePage'),
      explain: t('action.explain'),
      rewrite: t('action.rewrite'),
      codeExplain: t('action.codeExplain'),
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

    let markdown = `# ${t('knowledge.exportTitle')}\n\n`;
    markdown += `${t('knowledge.exportTime')}: ${new Date().toLocaleString()}\n`;
    markdown += `${t('knowledge.exportTotal', { count: items.length })}\n\n---\n\n`;

    const groups = groupKnowledgeByDate(items);

    for (const [date, groupItems] of Object.entries(groups)) {
      markdown += `## ${date}\n\n`;

      for (const item of groupItems) {
        const typeLabel = item.type === 'annotation' ? t('knowledge.annotationType') : getActionTypeLabel(item.actionType);
        markdown += `### ${typeLabel}\n\n`;

        if (item.pageTitle) {
          markdown += `**${t('knowledge.source')}**: [${item.pageTitle}](${item.url})\n\n`;
        }

        if (item.originalText) {
          markdown += `**${t('knowledge.originalText')}**:\n> ${item.originalText}\n\n`;
        }

        markdown += `**${t('knowledge.content')}**:\n${item.content}\n\n`;

        if (item.note) {
          markdown += `**${t('knowledge.note')}**: ${item.note}\n\n`;
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
