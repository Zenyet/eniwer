// Plugin Manager — registers, activates, and routes to plugins

import { MenuConfig, MenuItem } from '../types';
import {
  Plugin,
  PluginContext,
  ViewContributor,
  SettingsContributor,
  MinimizableContributor,
  isCommandContributor,
  isViewContributor,
  isSettingsContributor,
  isMinimizableContributor,
} from './types';

export class PluginManager {
  private plugins: Plugin[] = [];
  private configListeners: Array<(config: MenuConfig) => void> = [];
  private pluginStates: Record<string, boolean> = {};
  private eventListeners: Map<string, Array<(data: unknown) => void>> = new Map();
  private ctxFactory: ((pluginId: string) => PluginContext) | null = null;

  /** Register a plugin (does not activate it yet) */
  register(plugin: Plugin): void {
    if (this.plugins.some(p => p.id === plugin.id)) {
      console.warn(`[PluginManager] Plugin "${plugin.id}" is already registered.`);
      return;
    }
    this.plugins.push(plugin);
  }

  /** Set plugin enabled/disabled states. Missing key = enabled. */
  setPluginStates(states: Record<string, boolean>): void {
    const oldStates = this.pluginStates;
    this.pluginStates = { ...states };

    // Deactivate plugins that were enabled but are now disabled
    for (const plugin of this.plugins) {
      const wasEnabled = oldStates[plugin.id] !== false;
      const isNowEnabled = states[plugin.id] !== false;

      if (wasEnabled && !isNowEnabled) {
        try { plugin.deactivate(); } catch (err) {
          console.error(`[PluginManager] Failed to deactivate plugin "${plugin.id}":`, err);
        }
      } else if (!wasEnabled && isNowEnabled && this.ctxFactory) {
        try { plugin.activate(this.ctxFactory(plugin.id)); } catch (err) {
          console.error(`[PluginManager] Failed to activate plugin "${plugin.id}":`, err);
        }
      }
    }
  }

  /** Check if a plugin is enabled. Missing key = enabled (true). */
  isPluginEnabled(id: string): boolean {
    return this.pluginStates[id] !== false;
  }

  /** Check if a given id corresponds to a registered plugin. */
  hasPlugin(id: string): boolean {
    return this.plugins.some(p => p.id === id);
  }

  /**
   * Check if a menu item should be visible.
   * Returns false only when the item is owned by a registered-but-disabled plugin.
   */
  isMenuItemEnabled(menuItemId: string): boolean {
    for (const p of this.plugins) {
      if (p.id === menuItemId || p.menuItemIds?.includes(menuItemId)) {
        return this.isPluginEnabled(p.id);
      }
    }
    return true; // no plugin owns this item
  }

  /** Get info about all registered plugins (for settings UI) */
  getPluginsInfo(): Array<{ id: string; name: string; description?: string; icon?: string; enabled: boolean; hasSettings: boolean }> {
    return this.plugins.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
      enabled: this.isPluginEnabled(p.id),
      hasSettings: isSettingsContributor(p),
    }));
  }

  /** Activate all registered plugins with the given context factory */
  activateAll(ctxFactory: (pluginId: string) => PluginContext): void {
    this.ctxFactory = ctxFactory;
    for (const plugin of this.plugins) {
      if (!this.isPluginEnabled(plugin.id)) continue;
      try {
        plugin.activate(ctxFactory(plugin.id));
      } catch (err) {
        console.error(`[PluginManager] Failed to activate plugin "${plugin.id}":`, err);
      }
    }
  }

  /** Deactivate a single plugin by id */
  deactivatePlugin(id: string): void {
    const plugin = this.plugins.find(p => p.id === id);
    if (plugin) {
      try {
        plugin.deactivate();
      } catch (err) {
        console.error(`[PluginManager] Failed to deactivate plugin "${id}":`, err);
      }
    }
  }

  /** Deactivate all plugins */
  deactivateAll(): void {
    for (const plugin of this.plugins) {
      try {
        plugin.deactivate();
      } catch (err) {
        console.error(`[PluginManager] Failed to deactivate plugin "${plugin.id}":`, err);
      }
    }
  }

  /** Route a command action to registered CommandContributors (first match wins). */
  handleCommand(action: string, selectedText: string): boolean {
    this.emit('command:before', { action, selectedText });
    let handled = false;
    for (const plugin of this.plugins) {
      if (this.isPluginEnabled(plugin.id) && isCommandContributor(plugin)) {
        try {
          if (plugin.handleCommand(action, selectedText)) {
            handled = true;
            break;
          }
        } catch (err) {
          console.error(`[PluginManager] Error in handleCommand for plugin "${plugin.id}":`, err);
        }
      }
    }
    this.emit('command:after', { action, handled });
    return handled;
  }

  /** Find the ViewContributor that owns the given viewType */
  getViewContributor(viewType: string): (Plugin & ViewContributor) | undefined {
    return this.plugins.find(
      (p): p is Plugin & ViewContributor => this.isPluginEnabled(p.id) && isViewContributor(p) && p.viewType === viewType
    );
  }

  /** Return all SettingsContributors (only from enabled plugins) */
  getSettingsContributors(): (Plugin & SettingsContributor)[] {
    return this.plugins.filter(
      (p): p is Plugin & SettingsContributor => this.isPluginEnabled(p.id) && isSettingsContributor(p)
    );
  }

  /** Return SettingsContributors that have a settingsOrder (inline on main settings page), sorted ascending */
  getInlineSettingsContributors(): (Plugin & SettingsContributor)[] {
    return this.getSettingsContributors()
      .filter(p => p.settingsOrder != null)
      .sort((a, b) => a.settingsOrder! - b.settingsOrder!);
  }

  /** Return all MinimizableContributors (only from enabled plugins) */
  getMinimizableContributors(): (Plugin & MinimizableContributor)[] {
    return this.plugins.filter(
      (p): p is Plugin & MinimizableContributor => this.isPluginEnabled(p.id) && isMinimizableContributor(p)
    );
  }

  /** Get a specific MinimizableContributor by plugin id */
  getMinimizableContributor(pluginId: string): (Plugin & MinimizableContributor) | undefined {
    return this.plugins.find(
      (p): p is Plugin & MinimizableContributor => p.id === pluginId && this.isPluginEnabled(p.id) && isMinimizableContributor(p)
    );
  }

  /** Broadcast a config change to all listeners registered by plugins */
  notifyConfigChange(config: MenuConfig): void {
    for (const cb of this.configListeners) {
      try {
        cb(config);
      } catch (err) {
        console.error('[PluginManager] Error in config change listener:', err);
      }
    }
  }

  /** Used internally by PluginContext.onConfigChange */
  addConfigListener(cb: (config: MenuConfig) => void): void {
    this.configListeners.push(cb);
  }

  /** Aggregate commands from all enabled CommandContributors */
  getAllCommands(): MenuItem[] {
    const commands: MenuItem[] = [];
    for (const plugin of this.plugins) {
      if (this.isPluginEnabled(plugin.id) && isCommandContributor(plugin)) {
        try {
          commands.push(...plugin.getCommands());
        } catch (err) {
          console.error(`[PluginManager] Error getting commands from plugin "${plugin.id}":`, err);
        }
      }
    }
    return commands;
  }

  /** Get a plugin by id */
  getPlugin<T extends Plugin = Plugin>(id: string): T | undefined {
    return this.plugins.find(p => p.id === id) as T | undefined;
  }

  /** Get a plugin by id (alias for getPlugin) */
  getPluginById(id: string): Plugin | undefined {
    return this.plugins.find(p => p.id === id);
  }

  /** Check if a plugin implements SettingsContributor */
  hasSettings(id: string): boolean {
    const plugin = this.getPluginById(id);
    return !!plugin && isSettingsContributor(plugin);
  }

  // ========================================
  // Event Bus
  // ========================================

  /** Subscribe to a plugin event. Returns an unsubscribe function. */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    };
  }

  /** Emit a plugin event to all subscribers. */
  emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const handler of listeners) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[PluginManager] Error in event handler for "${event}":`, err);
      }
    }
  }
}
