// Plugin Architecture — public API
export { PluginManager } from './PluginManager';
export type {
  Plugin,
  PluginContext,
  CommandContributor,
  ViewContributor,
  SettingsContributor,
  MinimizableContributor,
  MinimizedPluginData,
  PluginEventMap,
  PluginEventName,
} from './types';
export {
  isCommandContributor,
  isViewContributor,
  isSettingsContributor,
  isMinimizableContributor,
} from './types';
