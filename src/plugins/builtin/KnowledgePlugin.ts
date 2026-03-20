// Knowledge Plugin — manages knowledge base view

import { getAllAnnotations, deleteAnnotation as deleteAnnotationFromStorage } from '../../content/annotation/storage';
import { getAllTasks, deleteTask } from '../../utils/taskStorage';
import { DEFAULT_KNOWLEDGE_CONFIG, KnowledgeConfig, MenuConfig } from '../../types';
import { icons } from '../../icons';
import {
  KnowledgeItem,
  annotationToKnowledgeItem,
  savedTaskToKnowledgeItem,
  getActionTypeLabel,
  getAIResultTypeLabel,
  groupKnowledgeByDate,
} from '../../content/CommandPalette/views';
import {
  getKnowledgeViewHTML as getKnowledgeViewHTMLFromController,
  getLocalFilteredKnowledgeItems as getLocalFilteredKnowledgeItemsFromController,
  renderKnowledgeContent,
  bindKnowledgeEvents as bindKnowledgeEventsFromController,
  updateKnowledgeFooter as updateKnowledgeFooterFromController,
} from '../../content/CommandPalette/controllers';
import { t } from '../../i18n';
import type { Plugin, CommandContributor, ViewContributor, SettingsContributor, PluginContext } from '../../plugins';
import type { MenuItem } from '../../types';

export class KnowledgePlugin implements Plugin, CommandContributor, ViewContributor, SettingsContributor {
  readonly id = 'knowledge';
  readonly name = 'Knowledge Base';
  readonly description = 'plugin.knowledge.description';
  readonly icon = icons.library;
  readonly viewType = 'knowledge';

  private ctx!: PluginContext;

  // State (moved from CommandPalette)
  private knowledgeItems: KnowledgeItem[] = [];
  private knowledgeSearch = '';
  private knowledgeFilter: 'all' | 'annotations' | 'ai-results' = 'all';

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.knowledgeItems = [];
    this.knowledgeSearch = '';
    this.knowledgeFilter = 'all';
  }

  // ---- CommandContributor ----

  getCommands(): MenuItem[] {
    return [];
  }

  handleCommand(action: string): boolean {
    if (action !== 'knowledge') return false;
    void this.show();
    return true;
  }

  // ---- ViewContributor ----

  getViewHTML(): string {
    return getKnowledgeViewHTMLFromController({
      items: this.knowledgeItems,
      filter: this.knowledgeFilter,
      search: this.knowledgeSearch,
    });
  }

  bindEvents(shadowRoot: ShadowRoot): void {
    const rerenderKnowledgeContent = () => {
      renderKnowledgeContent(shadowRoot, {
        items: this.knowledgeItems,
        filter: this.knowledgeFilter,
        search: this.knowledgeSearch,
      });
      bindKnowledgeEventsFromController({
        handleDragStart: this.ctx.getHandleDragStart(),
        onClose: () => {
          this.ctx.ui.navigateToView('commands');
        },
        onDeleteItem: async (id) => {
          if (!confirm(t('confirm.deleteRecord'))) return;
          if (id.startsWith('ann_')) {
            await deleteAnnotationFromStorage(id.replace('ann_', ''));
          } else if (id.startsWith('task_')) {
            await deleteTask(id.replace('task_', ''));
          }
          this.knowledgeItems = this.knowledgeItems.filter((item) => item.id !== id);
          rerenderKnowledgeContent();
          this.updateFooter(shadowRoot);
        },
        onExport: () => this.exportKnowledge(),
        onFilterChange: (filter) => {
          this.knowledgeFilter = filter;
          rerenderKnowledgeContent();
          this.updateFooter(shadowRoot);
        },
        onOpenAIResult: (id) => {
          const item = this.knowledgeItems.find((entry) => entry.id === id);
          if (item) {
            this.ctx.ui.showSavedAIResult({
              title: item.title,
              content: item.content,
              thinking: item.thinking,
              originalText: item.originalText,
              actionType: item.actionType,
              sourceUrl: item.url,
              sourceTitle: item.pageTitle,
              createdAt: item.createdAt,
            });
          }
        },
        onOpenUrl: (url) => {
          window.open(url, '_blank');
        },
        onSearch: (query) => {
          this.knowledgeSearch = query;
          rerenderKnowledgeContent();
          this.updateFooter(shadowRoot);
        },
        shadowRoot,
      });
      this.updateFooter(shadowRoot);
    };

    rerenderKnowledgeContent();
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    return `
        <!-- 知识库 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.knowledgeSection')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.defaultFilter')}</label>
            <select class="glass-select" id="knowledge-filter-select">
              <option value="all" ${(config.knowledge?.defaultFilter || 'all') === 'all' ? 'selected' : ''}>${t('settings.filterAll')}</option>
              <option value="annotations" ${config.knowledge?.defaultFilter === 'annotations' ? 'selected' : ''}>${t('settings.filterAnnotationsOnly')}</option>
              <option value="ai-results" ${config.knowledge?.defaultFilter === 'ai-results' ? 'selected' : ''}>${t('settings.filterAIResultsOnly')}</option>
            </select>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.maxDisplayPerGroup')}</label>
            <select class="glass-select" id="knowledge-max-display">
              <option value="20" ${(config.knowledge?.maxDisplayCount || 50) === 20 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 20 })}</option>
              <option value="50" ${config.knowledge?.maxDisplayCount === 50 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 50 })}</option>
              <option value="100" ${config.knowledge?.maxDisplayCount === 100 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 100 })}</option>
              <option value="200" ${config.knowledge?.maxDisplayCount === 200 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 200 })}</option>
            </select>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.groupByDate')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="knowledge-group-date" ${config.knowledge?.groupByDate !== false ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const knowledgeConfig = tempConfig.knowledge || { ...DEFAULT_KNOWLEDGE_CONFIG };

    const filterSelect = shadowRoot.querySelector('#knowledge-filter-select') as HTMLSelectElement | null;
    filterSelect?.addEventListener('change', () => {
      knowledgeConfig.defaultFilter = filterSelect.value as KnowledgeConfig['defaultFilter'];
      tempConfig.knowledge = knowledgeConfig;
      onChange();
    });

    const maxDisplaySelect = shadowRoot.querySelector('#knowledge-max-display') as HTMLSelectElement | null;
    maxDisplaySelect?.addEventListener('change', () => {
      knowledgeConfig.maxDisplayCount = parseInt(maxDisplaySelect.value, 10);
      tempConfig.knowledge = knowledgeConfig;
      onChange();
    });

    const groupDateToggle = shadowRoot.querySelector('#knowledge-group-date') as HTMLInputElement | null;
    groupDateToggle?.addEventListener('change', () => {
      knowledgeConfig.groupByDate = groupDateToggle.checked;
      tempConfig.knowledge = knowledgeConfig;
      onChange();
    });
  }

  // ---- Internal ----

  private async show(): Promise<void> {
    try {
      const [annotations, savedTasks] = await Promise.all([
        getAllAnnotations(),
        getAllTasks(),
      ]);

      this.knowledgeItems = [
        ...annotations.map(a => annotationToKnowledgeItem(a)),
        ...savedTasks.map(t => savedTaskToKnowledgeItem(t)),
      ];

      this.knowledgeItems.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('KnowledgePlugin: Failed to load knowledge base', error);
      this.knowledgeItems = [];
    }

    this.knowledgeSearch = '';
    this.knowledgeFilter = 'all';
    this.ctx.ui.navigateToView('knowledge');
  }

  private updateFooter(shadowRoot: ShadowRoot): void {
    updateKnowledgeFooterFromController(shadowRoot, {
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

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-export-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
