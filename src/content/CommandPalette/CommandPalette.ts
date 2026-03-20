// Command Palette - Apple Liquid Glass Design
// The unified interface for The Panel with authentic iOS 26 Liquid Glass aesthetics
import { MenuItem, MenuConfig, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_HISTORY_CONFIG, TrailEntry } from '../../types';
import { icons } from '../../icons';
import { getStorageData, saveConfig, saveGlobalMenuItems } from '../../utils/storage';
import { saveTask, getAllTasks, deleteTask, SavedTask, enforceMaxCount } from '../../utils/taskStorage';
import { loadBrowseTrailSessions } from '../BrowseTrailPanel';
import { createNewChatSession, createChatMessage } from '../ContextChatPanel';
import { callAI, OnChunkCallback, getTranslatePrompt, abortAllRequests } from '../../utils/ai';
import { getAllAnnotations } from '../annotation/storage';
import { Annotation } from '../../types/annotation';
import { t } from '../../i18n';
import type { PluginManager } from '../../plugins';
import { isSettingsContributor } from '../../plugins/types';
import type { Plugin, SettingsContributor } from '../../plugins/types';

// Import views
import {
  // Settings View
  getSettingsViewHTML as getSettingsViewHTMLFromModule,
  getMenuSettingsHTML as getMenuSettingsHTMLFromModule,
  // Knowledge View
  KnowledgeItem,
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
  bindCommandsEvents as bindCommandsEventsFromController,
  bindMenuSettingsEvents as bindMenuSettingsEventsFromController,
  bindSettingsEvents as bindSettingsEventsFromController,
  buildRestoredTaskState,
  createAIResultMinimizedTask,
  createDragHandlers,
  createDragState,
  createMinimizedTaskId,
  createStreamKey,
  getCommandsViewHTML as getCommandsViewHTMLFromController,
  getFilteredRecentTasks as getFilteredRecentTasksFromController,
  removeExistingTaskForAction,
  renderCommandsContent as renderCommandsContentFromController,
  renderMinimizedTasksSection as renderMinimizedTasksSectionFromController,
  renderRecentTasksSection as renderRecentTasksSectionFromController,
  takeMinimizedTask,
} from './controllers';

// Import utility functions from utils module
import {
  escapeHtml,
  formatAIContent,
  formatTokenUsage,
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

  // Settings state
  private settingsMenuItems: MenuItem[] = [];
  private editingItemId: string | null = null;
  private tempConfig: MenuConfig | null = null;
  private settingsChanged = false;

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

  // Plugin manager (set via setPluginManager)
  private pluginManager: PluginManager | null = null;
  private currentPluginSettingsId: string | null = null;

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
    // Refresh menu items so disabled plugin commands are removed
    this.refreshMenuItems();
  }

  /** Filter out base menu items whose id matches a disabled plugin. */
  private filterDisabledPluginItems(items: MenuItem[]): MenuItem[] {
    if (!this.pluginManager) return items;
    return items.filter(item => this.pluginManager!.isMenuItemEnabled(item.id));
  }

  /** Rebuild menuItems by merging stored global items with enabled plugin commands. */
  public refreshMenuItems(): void {
    if (this.menuItems.length === 0) return; // not initialized yet
    const baseItems = this.filterDisabledPluginItems(this.menuItems.filter(item => !item._fromPlugin));
    const pluginCommands = (this.pluginManager?.getAllCommands() ?? []).map(c => ({ ...c, _fromPlugin: true } as MenuItem));
    this.menuItems = [...baseItems, ...pluginCommands];
    this.filteredItems = this.sortByRecent(this.menuItems);
  }

  public setPluginManager(pm: PluginManager): void {
    this.pluginManager = pm;
  }

  /** Navigate to a plugin-provided (or built-in) view, resetting the view stack. */
  public navigateToView(viewType: string): void {
    const from = this.currentView as string;
    this.currentView = viewType as ViewType;
    this.viewStack = [];

    // When returning to commands, clear active command state so the command tag doesn't persist
    if (viewType === 'commands') {
      this.currentStreamKey = null;
      this.activeCommand = null;
      this.activeCommandInput = '';
      this.aiResultData = null;
      this.aiResultCallbacks = null;
      this.searchQuery = '';
      void this.ensureMenuItems().then(() => {
        this.filteredItems = this.sortByRecent(this.menuItems);
        this.selectedIndex = 0;
        this.renderCurrentView(true, true);
        this.pluginManager?.emit('view:change', { from, to: viewType });
      });
      return;
    }

    this.renderCurrentView(true, true);
    this.pluginManager?.emit('view:change', { from, to: viewType });
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
    // Merge static menu items with dynamic plugin commands (filtered by enabled state)
    const pluginCommands = (this.pluginManager?.getAllCommands() ?? []).map(c => ({ ...c, _fromPlugin: true }));
    const baseItems = this.filterDisabledPluginItems(items.filter(item => item.enabled !== false));
    this.menuItems = [...baseItems, ...pluginCommands];
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

      // Auto-minimize any plugin MinimizableContributors (handles chat, screenshot, etc.)
      if (this.pluginManager) {
        for (const contributor of this.pluginManager.getMinimizableContributors()) {
          try {
            const data = contributor.saveAsMinimized();
            if (data) {
              this.createPluginMinimizedTask(data);
            }
          } catch (err) {
            console.error(`[CommandPalette] Error saving minimized state for plugin "${contributor.id}":`, err);
          }
        }
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
        this.dragState.hasDragged = false;
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
      'plugins': t('settings.pluginManagement'),
      'screenshot': t('view.screenshot'),
      'browseTrail': t('view.browseTrail'),
      'contextChat': t('view.contextChat'),
      'annotations': t('view.annotations'),
      'knowledge': t('view.knowledge'),
      'plugin-settings': '',
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

  // Screenshot methods — thin proxies delegating to ScreenshotPlugin
  public showScreenshot(dataUrl: string, callbacks?: ScreenshotCallbacks): void {
    const plugin = this.pluginManager?.getPlugin('screenshot') as { showScreenshot(d: string, c?: ScreenshotCallbacks): void } | undefined;
    if (plugin) {
      // Ensure palette is visible first
      if (!this.container) {
        this.updateTheme();
        this.render();
      }
      plugin.showScreenshot(dataUrl, callbacks);
    }
  }

  public updateScreenshotResult(result: string, isLoading: boolean = false): void {
    const plugin = this.pluginManager?.getPlugin('screenshot') as { updateScreenshotResult(r: string, l?: boolean): void } | undefined;
    plugin?.updateScreenshotResult(result, isLoading);
  }

  public updateScreenshotGeneratedImage(imageUrl: string): void {
    const plugin = this.pluginManager?.getPlugin('screenshot') as { updateScreenshotGeneratedImage(u: string): void } | undefined;
    plugin?.updateScreenshotGeneratedImage(imageUrl);
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

  public updateAIResult(content: string, thinking?: string, targetStreamKey?: string, usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): void {
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
      if (usage) {
        this.aiResultData.usage = usage;
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
  public renderMinimizedTasksIfVisible(): void {
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
      case 'plugins':
        panel.innerHTML = this.getPluginsViewHTML();
        this.bindPluginsViewEvents();
        break;
      case 'plugin-settings': {
        const pluginId = this.currentPluginSettingsId;
        const plugin = pluginId ? this.pluginManager?.getPluginById(pluginId) : null;
        if (plugin && isSettingsContributor(plugin)) {
          const config = this.tempConfig || this.config;
          panel.innerHTML = this.getPluginSettingsViewHTML(plugin.name, plugin.getSettingsHTML(config));
          this.bindPluginSettingsEvents(plugin);
        }
        break;
      }
      default: {
        // Delegate to plugin ViewContributor if available
        const contributor = this.pluginManager?.getViewContributor(this.currentView);
        if (contributor) {
          panel.innerHTML = contributor.getViewHTML();
          contributor.bindEvents(this.shadowRoot!);
          requestAnimationFrame(() => {
            const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
            input?.focus();
          });
        }
        break;
      }
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
        const pluginCommands = (this.pluginManager?.getAllCommands() ?? []).map(c => ({ ...c, _fromPlugin: true }));
        const baseItems = this.filterDisabledPluginItems((data.globalMenuItems || []).filter(item => item.enabled !== false));
        this.menuItems = [
          ...baseItems,
          ...pluginCommands,
        ];
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

    // If the current view is owned by a MinimizableContributor plugin, let it minimize
    if (this.pluginManager && this.currentView !== 'commands' && this.currentView !== 'ai-result') {
      const contributor = this.pluginManager.getMinimizableContributor(
        // Try to find a minimizable plugin whose viewType matches current view
        this.pluginManager.getViewContributor(this.currentView)?.id || ''
      );
      if (contributor) {
        const data = contributor.saveAsMinimized();
        if (data) {
          this.createPluginMinimizedTask(data);
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
      }
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

  public async autoSaveAIResult(data: AIResultData): Promise<void> {
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

  public addToUnsavedRecent(data: AIResultData): void {
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
    try {
      const authStatus = await chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_STATUS' });
      if (!authStatus?.isLoggedIn) {
        this.showToast(t('settings.loginGoogle'));
        return;
      }
    } catch {
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

      // Update token usage display
      const tokenUsageEl = footer.querySelector('.glass-token-usage') as HTMLElement;
      if (tokenUsageEl) {
        const usageText = formatTokenUsage(this.aiResultData.usage);
        tokenUsageEl.textContent = usageText;
        tokenUsageEl.style.display = usageText && !this.aiResultData.isLoading ? 'inline' : 'none';
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

  public createPluginMinimizedTask(data: import('../../plugins/types').MinimizedPluginData): void {
    const task: MinimizedTask = {
      id: createMinimizedTaskId(++this.minimizedTaskIdCounter),
      title: data.title,
      content: '',
      resultType: 'general',
      iconHtml: data.iconHtml,
      isLoading: data.isLoading,
      minimizedAt: Date.now(),
      createdAt: Date.now(),
      pluginId: data.pluginId,
      pluginData: data.pluginData,
    };
    this.minimizedTasks.push(task);
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
    // Plugin-based minimized tasks: delegate to the plugin's restoreFromMinimized
    if (task.pluginId && this.pluginManager) {
      const contributor = this.pluginManager.getMinimizableContributor(task.pluginId);
      if (contributor) {
        contributor.restoreFromMinimized({
          pluginId: task.pluginId,
          title: task.title,
          iconHtml: task.iconHtml,
          isLoading: task.isLoading,
          pluginData: task.pluginData,
        });
        return;
      }
    }

    const restoredState = buildRestoredTaskState(task, {
      contextChatLabel: t('chat.contextChatLabel'),
      quickAskLabel: t('chat.quickAskLabel'),
      screenshotLabel: t('menu.screenshot'),
    });

    this.activeCommand = restoredState.activeCommand;
    this.aiResultData = restoredState.aiResultData;
    this.aiResultCallbacks = restoredState.aiResultCallbacks;
    this.currentStreamKey = restoredState.currentStreamKey;
    this.currentView = restoredState.currentView;
    this.viewStack = [];
  }

  private restoreMinimizedTask(taskId: string): void {
    const task = takeMinimizedTask(this.minimizedTasks, taskId);
    if (!task) return;

    this.saveCurrentAsMinimized();
    // Save any active plugin minimizable state before restoring
    if (this.pluginManager) {
      for (const contributor of this.pluginManager.getMinimizableContributors()) {
        try {
          const data = contributor.saveAsMinimized();
          if (data) {
            this.createPluginMinimizedTask(data);
          }
        } catch (err) {
          console.error(`[CommandPalette] Error saving minimized state for plugin "${contributor.id}":`, err);
        }
      }
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

    // Update token usage display
    const tokenUsageEl = this.shadowRoot.querySelector('.glass-token-usage') as HTMLElement;
    if (tokenUsageEl) {
      const usageText = formatTokenUsage(this.aiResultData.usage);
      tokenUsageEl.textContent = usageText;
      tokenUsageEl.style.display = usageText && !this.aiResultData.isLoading ? 'inline' : 'none';
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

    // Collect inline settings from plugins with settingsOrder
    let inlineSettingsHTML = '';
    if (this.pluginManager) {
      const inlineContributors = this.pluginManager.getInlineSettingsContributors();
      inlineSettingsHTML = inlineContributors.map(c => c.getSettingsHTML(config)).join('');
    }

    // Generate plugin nav card (replaces old inline plugin list)
    let pluginListHTML = '';
    if (this.pluginManager) {
      const pluginsInfo = this.pluginManager.getPluginsInfo();
      const enabledCount = pluginsInfo.filter(p => p.enabled).length;
      const totalCount = pluginsInfo.length;
      pluginListHTML = `
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.plugins')}</div>
          <div class="glass-plugin-nav" id="plugin-nav-card">
            <div class="glass-plugin-nav-icon">${icons.puzzle}</div>
            <div class="glass-plugin-nav-content">
              <div class="glass-plugin-nav-title">${t('settings.pluginManagement')}</div>
              <div class="glass-plugin-nav-subtitle">${t('settings.pluginsEnabledCount', { enabled: enabledCount, total: totalCount })}</div>
            </div>
            <span class="glass-plugin-nav-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </span>
          </div>
        </div>
      `;
    }

    return getSettingsViewHTMLFromModule(
      config,
      icons,
      inlineSettingsHTML,
      pluginListHTML || undefined,
    );
  }

  private bindSettingsEvents(): void {
    if (!this.shadowRoot || !this.tempConfig) return;

    bindSettingsEventsFromController({
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
      onUpdateTheme: (theme) => this.updateTheme(theme),
      setSettingsChanged: (changed) => { this.settingsChanged = changed; },
      setSettingsMenuItems: (items) => { this.settingsMenuItems = items; },
      shadowRoot: this.shadowRoot,
      tempConfig: this.tempConfig,
    });

    // Bind inline plugin settings events (e.g. CloudSync)
    if (this.pluginManager) {
      const inlineContributors = this.pluginManager.getInlineSettingsContributors();
      const onChange = () => { this.settingsChanged = true; };
      for (const contributor of inlineContributors) {
        try {
          contributor.bindSettingsEvents(this.shadowRoot, this.tempConfig, onChange);
        } catch (err) {
          console.error(`[CommandPalette] Error binding inline settings for plugin "${contributor.id}":`, err);
        }
      }
    }

    // Bind plugin nav card → navigate to plugins management page
    const pluginNavCard = this.shadowRoot.querySelector('#plugin-nav-card');
    if (pluginNavCard) {
      pluginNavCard.addEventListener('click', () => {
        this.pushView({ type: 'plugins', title: t('settings.pluginManagement') });
      });
    }
  }

  private getPluginSettingsViewHTML(pluginName: string, settingsHTML: string): string {
    return `
      <div class="glass-header glass-draggable">
        <button class="glass-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="glass-header-title">${escapeHtml(pluginName)}</span>
        <div class="glass-header-actions"></div>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body glass-settings-body">
        <div class="glass-settings-flat">
          ${settingsHTML}
        </div>
      </div>
      <div class="glass-footer glass-settings-footer">
        <div class="glass-settings-footer-actions">
          <button class="glass-btn glass-btn-cancel">${t('common.cancel')}</button>
          <button class="glass-btn glass-btn-primary glass-btn-save">${t('common.save')}</button>
        </div>
      </div>
    `;
  }

  private bindPluginSettingsEvents(plugin: Plugin & SettingsContributor): void {
    if (!this.shadowRoot || !this.tempConfig) return;

    // Back button
    const backBtn = this.shadowRoot.querySelector('.glass-back-btn');
    backBtn?.addEventListener('click', () => this.popView());

    // Cancel button
    const cancelBtn = this.shadowRoot.querySelector('.glass-btn-cancel');
    cancelBtn?.addEventListener('click', () => this.popView());

    // Save button
    const saveBtn = this.shadowRoot.querySelector('.glass-btn-save');
    saveBtn?.addEventListener('click', async () => {
      await this.saveSettings();
    });

    // Bind the plugin's own settings events
    const onChange = () => { this.settingsChanged = true; };
    try {
      plugin.bindSettingsEvents(this.shadowRoot, this.tempConfig, onChange);
    } catch (err) {
      console.error(`[CommandPalette] Error binding settings events for plugin "${plugin.id}":`, err);
    }

    // Escape key → popView
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot?.removeEventListener('keydown', keyHandler);
        this.popView();
      }
    };
    this.shadowRoot.addEventListener('keydown', keyHandler);

    // Make header draggable
    const header = this.shadowRoot.querySelector('.glass-draggable') as HTMLElement;
    if (header) {
      header.addEventListener('mousedown', this.handleDragStart);
    }
  }

  // ---- Plugins Management View ----

  private getPluginsViewHTML(): string {
    const pluginsInfo = this.pluginManager?.getPluginsInfo() || [];
    const cards = pluginsInfo.map(p => {
      const disabledClass = p.enabled ? '' : ' glass-plugin-card-disabled';
      const clickableClass = p.hasSettings ? ' glass-plugin-card-clickable' : '';
      const desc = p.description ? t(p.description) : '';
      return `
        <div class="glass-plugin-card${disabledClass}${clickableClass}" data-plugin-id="${escapeHtml(p.id)}">
          <div class="glass-plugin-card-icon">${p.icon || icons.puzzle}</div>
          <div class="glass-plugin-card-info">
            <div class="glass-plugin-card-name">${escapeHtml(p.name)}</div>
            ${desc ? `<div class="glass-plugin-card-desc">${escapeHtml(desc)}</div>` : ''}
          </div>
          <label class="glass-toggle glass-toggle-small glass-plugin-toggle-wrap">
            <input type="checkbox" data-plugin-id="${escapeHtml(p.id)}" class="plugin-toggle" ${p.enabled ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
      `;
    }).join('');

    return `
      <div class="glass-header glass-draggable">
        <button class="glass-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="glass-header-title">${t('settings.pluginManagement')}</span>
        <div class="glass-header-actions"></div>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body glass-settings-body">
        <div class="glass-plugin-cards-list">
          ${cards}
        </div>
      </div>
    `;
  }

  private bindPluginsViewEvents(): void {
    if (!this.shadowRoot) return;

    // Back button
    const backBtn = this.shadowRoot.querySelector('.glass-back-btn');
    backBtn?.addEventListener('click', () => this.popView());

    // Stop toggle clicks from bubbling to card (prevents navigation)
    this.shadowRoot.querySelectorAll('.glass-plugin-toggle-wrap').forEach((label) => {
      label.addEventListener('click', (e) => e.stopPropagation());
    });

    // Plugin toggle events
    this.shadowRoot.querySelectorAll('.plugin-toggle').forEach((toggle) => {
      toggle.addEventListener('change', async () => {
        const input = toggle as HTMLInputElement;
        const pluginId = input.dataset.pluginId;
        if (!pluginId || !this.tempConfig) return;
        if (!this.tempConfig.pluginStates) {
          this.tempConfig.pluginStates = {};
        }
        this.tempConfig.pluginStates[pluginId] = input.checked;

        // Apply immediately: persist + activate/deactivate
        this.config.pluginStates = { ...this.tempConfig.pluginStates };
        await saveConfig(this.config);
        this.pluginManager?.setPluginStates(this.config.pluginStates);
        this.refreshMenuItems();

        // Toggle disabled visual state on the card
        const card = input.closest('.glass-plugin-card');
        if (card) {
          card.classList.toggle('glass-plugin-card-disabled', !input.checked);
        }
      });
    });

    // Plugin card click → navigate to plugin settings (only for hasSettings plugins)
    this.shadowRoot.querySelectorAll('.glass-plugin-card-clickable').forEach((card) => {
      card.addEventListener('click', () => {
        const pluginId = (card as HTMLElement).dataset.pluginId;
        if (!pluginId) return;
        this.currentPluginSettingsId = pluginId;
        this.pushView({ type: 'plugin-settings', title: '' });
      });
    });

    // Escape key → popView
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot?.removeEventListener('keydown', keyHandler);
        this.popView();
      }
    };
    this.shadowRoot.addEventListener('keydown', keyHandler);

    // Make header draggable
    const header = this.shadowRoot.querySelector('.glass-draggable') as HTMLElement;
    if (header) {
      header.addEventListener('mousedown', this.handleDragStart);
    }
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
    const savedConfig = JSON.parse(JSON.stringify(this.tempConfig));
    const settingsBody = this.shadowRoot?.querySelector('.glass-settings-body') as HTMLElement | null;
    const scrollTop = settingsBody?.scrollTop || 0;

    // Save to storage
    await saveConfig(savedConfig);
    this.config = savedConfig;

    // Immediately sync plugin states so menuItems refresh doesn't wait for storage listener
    if (savedConfig.pluginStates && this.pluginManager) {
      this.pluginManager.setPluginStates(savedConfig.pluginStates);
      this.refreshMenuItems();
    }

    // Apply history settings if changed
    if (savedConfig.history) {
      await enforceMaxCount(savedConfig.history.maxSaveCount);
      await this.loadRecentSavedTasks();
    }

    // Recreate tempConfig and re-render so event handlers bind to the new draft object.
    this.tempConfig = JSON.parse(JSON.stringify(savedConfig));
    this.settingsChanged = false;
    this.showToast(t('settings.saved'));
    this.renderCurrentView(langChanged, true);

    // Restores the scroll position after the settings DOM is rebuilt.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nextSettingsBody = this.shadowRoot?.querySelector('.glass-settings-body') as HTMLElement | null;
        if (nextSettingsBody) {
          nextSettingsBody.scrollTop = scrollTop;
        }
      });
    });
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
    // Restore quickAsk/contextChat tasks via plugin
    if (task.actionType === 'quickAsk' || task.actionType === 'contextChat') {
      const chatPlugin = this.pluginManager?.getPlugin('contextChat') as {
        restoreFromMinimized(data: { pluginId: string; title: string; iconHtml?: string; isLoading: boolean; pluginData: unknown }): void;
      } | undefined;
      if (chatPlugin) {
        const session = createNewChatSession(task.sourceUrl || window.location.href, task.sourceTitle || document.title);
        session.messages.push(createChatMessage('user', task.title));
        session.messages.push(createChatMessage('assistant', task.content, undefined, task.thinking));
        chatPlugin.restoreFromMinimized({
          pluginId: 'contextChat',
          title: task.title,
          iconHtml: task.actionType === 'quickAsk' ? icons.messageCircle : icons.contextChat,
          isLoading: false,
          pluginData: {
            chatSession: session,
            isQuickAsk: task.actionType === 'quickAsk',
            isChatStreaming: false,
          },
        });
      }
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
        this.updateAIResult(result.result, undefined, undefined, result.usage);
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
    // If no filtered items but has search query, start quick ask via plugin
    if (this.filteredItems.length === 0) {
      // Get the original input value (preserving case)
      const input = this.shadowRoot?.querySelector('.glass-input') as HTMLInputElement;
      const question = input?.value?.trim();
      if (question) {
        const chatPlugin = this.pluginManager?.getPlugin('contextChat') as { startQuickAsk(q: string): void } | undefined;
        chatPlugin?.startQuickAsk(question);
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

    // translateInput — enter input mode to type text for translation
    if (item.action === 'translateInput') {
      this.setActiveCommand(item);
      this.renderCurrentView(true, true);
      return;
    }

    // Route to plugin CommandContributors (browseTrail, contextChat, annotations, knowledge, etc.)
    if (this.pluginManager?.handleCommand(item.action, '')) {
      return;
    }

    // AI actions will call showAIResult() which transitions the view,
    // so we should not hide the palette for these actions
    const aiActions = ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'];
    if (aiActions.includes(item.action)) {
      this.callbacks?.onSelect(item);
      return;
    }

    this.hide();
    this.callbacks?.onSelect(item);
  }

  // ========================================
  // Knowledge Base — openKnowledgeAIResult kept here
  // because it manipulates internal CP state (activeCommand, aiResultData, etc.)
  // ========================================

  public openKnowledgeAIResult(item: KnowledgeItem): void {
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

  // Styles are now imported from ./styles.ts
  // Utility functions (escapeHtml, getTranslationHint, etc.) are imported from ./utils.ts
}
