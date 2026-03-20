// BrowseTrail Plugin — manages browse history view

import { BrowseSession } from '../../types';
import { icons } from '../../icons';
import { t } from '../../i18n';
import { loadBrowseTrailSessions, deleteTrailEntry, clearTrailHistory, exportTrailData } from '../../content/BrowseTrailPanel';
import {
  getBrowseTrailViewHTML as getBrowseTrailViewHTMLFromController,
  renderBrowseTrailContent,
  bindBrowseTrailEvents as bindBrowseTrailEventsFromController,
} from '../../content/CommandPalette/controllers';
import type { Plugin, CommandContributor, ViewContributor, SettingsContributor, PluginContext } from '../../plugins';
import type { MenuItem, MenuConfig } from '../../types';

export class BrowseTrailPlugin implements Plugin, CommandContributor, ViewContributor, SettingsContributor {
  readonly id = 'browseTrail';
  readonly name = 'Browse Trail';
  readonly description = 'plugin.browseTrail.description';
  readonly icon = icons.history;
  readonly viewType = 'browseTrail';

  private ctx!: PluginContext;

  // State (moved from CommandPalette)
  private sessions: BrowseSession[] = [];
  private search = '';
  private displayCount = 50;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.sessions = [];
    this.search = '';
    this.displayCount = 50;
  }

  // ---- CommandContributor ----

  getCommands(): MenuItem[] {
    return [];
  }

  handleCommand(action: string): boolean {
    if (action !== 'browseTrail') return false;
    void this.show();
    return true;
  }

  // ---- ViewContributor ----

  getViewHTML(): string {
    return getBrowseTrailViewHTMLFromController({
      displayCount: this.displayCount,
      search: this.search,
      sessions: this.sessions,
    });
  }

  bindEvents(shadowRoot: ShadowRoot): void {
    const rerenderTrailContent = () => {
      renderBrowseTrailContent(shadowRoot, {
        displayCount: this.displayCount,
        search: this.search,
        sessions: this.sessions,
      });
      bindBrowseTrailEventsFromController({
        handleDragStart: this.ctx.getHandleDragStart(),
        onClearHistory: async () => {
          if (!confirm(t('confirm.clearBrowseTrail'))) return;
          await clearTrailHistory();
          this.sessions = [];
          rerenderTrailContent();
        },
        onClose: () => {
          this.ctx.ui.setActiveCommand(null as unknown as MenuItem);
          this.ctx.ui.navigateToView('commands');
        },
        onDeleteEntry: async (id) => {
          this.sessions = await deleteTrailEntry(id);
          rerenderTrailContent();
        },
        onExport: () => {
          exportTrailData(this.sessions);
          this.ctx.showToast(t('trail.exported'));
        },
        onLoadMore: () => {
          this.displayCount += 50;
          rerenderTrailContent();
        },
        onOpenEntry: (url) => {
          window.open(url, '_blank');
        },
        onSearch: (query) => {
          this.search = query;
          this.displayCount = 50;
          rerenderTrailContent();
        },
        shadowRoot,
      });
    };

    rerenderTrailContent();
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    const patterns = (config.browseTrailExcludePatterns || []).join('\n');
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.browseTrailExclude')}</div>
        <div class="glass-form-group">
          <label class="glass-form-label">${t('settings.browseTrailExcludeLabel')}</label>
          <textarea id="browse-trail-exclude" class="glass-select" rows="4"
            style="resize:vertical;min-height:60px;font-family:'SF Mono','Menlo','Monaco','Consolas',monospace;font-size:12px;line-height:1.5;padding:8px;"
            placeholder="${t('settings.browseTrailExcludePlaceholder')}">${patterns}</textarea>
          <span class="glass-form-hint">${t('settings.browseTrailExcludeHint')}</span>
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const textarea = shadowRoot.querySelector('#browse-trail-exclude') as HTMLTextAreaElement | null;
    textarea?.addEventListener('input', () => {
      const lines = textarea.value.split('\n').filter(l => l.trim());
      tempConfig.browseTrailExcludePatterns = lines;
      onChange();
    });
  }

  // ---- Internal ----

  private async show(): Promise<void> {
    this.sessions = await loadBrowseTrailSessions();
    this.search = '';
    this.displayCount = 50;
    this.ctx.ui.setActiveCommand({
      id: 'browseTrail',
      action: 'browseTrail',
      label: t('menu.browseTrail'),
      icon: icons.history,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('browseTrail');
  }
}
