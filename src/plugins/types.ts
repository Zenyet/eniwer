// Plugin Architecture — Core Type Definitions

import { MenuConfig, MenuItem } from '../types';

// ========================================
// Plugin Events
// ========================================

export type PluginEventMap = {
  'command:before': { action: string; selectedText: string };
  'command:after': { action: string; handled: boolean };
  'view:change': { from: string; to: string };
};

export type PluginEventName = keyof PluginEventMap;

// ========================================
// Plugin Context — services available to plugins
// ========================================

export interface PluginContext {
  /** Read the current extension config */
  getConfig(): MenuConfig;
  /** Register a callback that fires whenever config changes */
  onConfigChange(cb: (config: MenuConfig) => void): void;

  /** Show a toast notification */
  showToast(msg: string): void;

  /** UI helpers */
  ui: {
    show(): void;
    hide(): void;
    /** Navigate to a view (replaces current view, resets stack) */
    navigateToView(viewType: string): void;
    /** Push a view onto the navigation stack */
    pushView(view: { type: string; title: string; data?: unknown }): void;
    /** Pop the top view from the navigation stack */
    popView(): void;
    /** Set active command tag shown in the search bar */
    setActiveCommand(item: MenuItem): void;
    /** Render current view (optionally with animation) */
    renderCurrentView(animate?: boolean, keepPosition?: boolean): void;
    /** Display a saved AI result in the commands view */
    showSavedAIResult(data: {
      title: string;
      content: string;
      thinking?: string;
      originalText?: string;
      actionType?: string;
      sourceUrl?: string;
      sourceTitle?: string;
      createdAt?: number;
    }): void;
  };

  /** AI service */
  ai: {
    /** Call AI with a prompt and system prompt, optionally streaming via onChunk */
    call(prompt: string, systemPrompt: string, onChunk?: (chunk: string, fullText: string, thinking?: string) => void): Promise<{ success: boolean; result?: string; thinking?: string; error?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }>;
    /** Abort all active AI requests */
    abort(): void;
  };

  /** Minimized tasks management */
  minimizedTasks: {
    /** Find a minimized task by pluginId and predicate, then update it */
    findAndUpdate(pluginId: string, predicate: (data: unknown) => boolean, updater: (task: { title: string; content: string; isLoading: boolean }) => void): void;
    /** Re-render minimized task badges if visible */
    rerenderBadges(): void;
  };

  /** Task persistence (auto-save / unsaved recent) */
  tasks: {
    /** Auto-save an AI result to IndexedDB */
    autoSave(data: { title: string; content: string; thinking?: string; originalText?: string; resultType: 'translate' | 'general'; actionType?: string; sourceUrl?: string; sourceTitle?: string; translateTargetLanguage?: string; createdAt?: number }): Promise<void>;
    /** Add an AI result to the unsaved recent list (in-memory only) */
    addToUnsavedRecent(data: { title: string; content: string; thinking?: string; originalText?: string; resultType: 'translate' | 'general'; actionType?: string; sourceUrl?: string; sourceTitle?: string; translateTargetLanguage?: string; createdAt?: number; streamKey?: string }): void;
  };

  /** Namespaced storage (scoped by plugin id) */
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };

  /** Send a message to background script */
  sendMessage(message: unknown): Promise<unknown>;
  /** Get currently selected text on the page */
  getSelectedText(): string;
  /** Get the shadow root of the command palette */
  getShadowRoot(): ShadowRoot | null;
  /** Get the drag start handler for draggable views */
  getHandleDragStart(): (e: MouseEvent) => void;
  /** Get the CommandPalette instance (for advanced plugin integrations) */
  getCommandPalette(): unknown;

  /** Event system for cross-plugin communication */
  events: {
    /** Subscribe to a plugin event. Returns an unsubscribe function. */
    on<E extends PluginEventName>(event: E, handler: (data: PluginEventMap[E]) => void): () => void;
  };

  /** Access to other plugins' state and commands */
  plugins: {
    /** Check if a plugin is enabled */
    isEnabled(id: string): boolean;
    /** Route a command to other plugins. Returns true if handled. */
    handleCommand(action: string, selectedText: string): boolean;
  };
}

// ========================================
// Plugin interface
// ========================================

export interface Plugin {
  /** Unique plugin identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Description (i18n key) */
  readonly description?: string;
  /** Icon emoji */
  readonly icon?: string;
  /** Additional menu-item IDs this plugin owns (besides its own id) */
  readonly menuItemIds?: readonly string[];
  /** Called when the plugin is activated; receives the context */
  activate(ctx: PluginContext): void;
  /** Called when the plugin is deactivated */
  deactivate(): void;
}

// ========================================
// Minimizable Plugin Data (for plugins that support minimize/restore)
// ========================================

export interface MinimizedPluginData {
  pluginId: string;
  title: string;
  iconHtml?: string;
  isLoading: boolean;
  pluginData: unknown;
}

export interface MinimizableContributor {
  saveAsMinimized(): MinimizedPluginData | null;
  restoreFromMinimized(data: MinimizedPluginData): void;
}

// ========================================
// Capability interfaces (mix-in style)
// ========================================

export interface CommandContributor {
  /** Return the list of commands this plugin provides */
  getCommands(): MenuItem[];
  /** Handle a command action. Return true if handled. */
  handleCommand(action: string, selectedText: string): boolean;
}

export interface ViewContributor {
  /** The view type string this plugin owns */
  readonly viewType: string;
  /** Return HTML for the view */
  getViewHTML(): string;
  /** Bind DOM events after the view HTML is injected */
  bindEvents(shadowRoot: ShadowRoot): void;
  /** Called when navigating away from this view (optional cleanup) */
  onViewLeave?(): void;
}

export interface SettingsContributor {
  /** Return HTML for the settings section */
  getSettingsHTML(config: MenuConfig): string;
  /** Bind settings DOM events. onChange signals that tempConfig was mutated. */
  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void;
  /**
   * When set, this contributor's settings are rendered inline on the main
   * settings page (sorted by ascending order) instead of on a sub-page.
   */
  settingsOrder?: number;
}

// ========================================
// Type guards
// ========================================

export function isCommandContributor(plugin: Plugin): plugin is Plugin & CommandContributor {
  return 'getCommands' in plugin && 'handleCommand' in plugin;
}

export function isViewContributor(plugin: Plugin): plugin is Plugin & ViewContributor {
  return 'viewType' in plugin && 'getViewHTML' in plugin && 'bindEvents' in plugin;
}

export function isSettingsContributor(plugin: Plugin): plugin is Plugin & SettingsContributor {
  return 'getSettingsHTML' in plugin && 'bindSettingsEvents' in plugin;
}

export function isMinimizableContributor(plugin: Plugin): plugin is Plugin & MinimizableContributor {
  return 'saveAsMinimized' in plugin && 'restoreFromMinimized' in plugin;
}

// ========================================
// External plugin registration API
// ========================================

declare global {
  interface Window {
    /** Pre-registered plugins (set before TheCircle initialises) */
    __thePanelPlugins?: Plugin[];
    /** Late-registration function (available after TheCircle initialises) */
    __thePanelRegisterPlugin?: (plugin: Plugin) => void;
  }
}
