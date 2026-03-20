import { MenuConfig, MenuItem, TrailEntry } from '../../../types';
import { icons } from '../../../icons';
import { t } from '../../../i18n';
import { SavedTask } from '../../../utils/taskStorage';
import { AIResultData, MinimizedTask } from '../types';
import {
  escapeHtml,
  formatAIContent,
  formatTokenUsage,
  getActionIcon,
  getLoadingHTML,
  getSavedTaskMetaInfo,
  getSourceInfoHTML,
  getThinkingSectionHTML,
  getTranslateLanguageSelectHTML,
} from '../utils';
import { KnowledgeItem, getActionTypeLabel } from '../views';
import { bindMinimizedTasksEvents, getMinimizedTasksHTML } from './MinimizedTasksManager';

export interface CommandsSearchResults {
  commands: MenuItem[];
  knowledge: KnowledgeItem[];
  trails: TrailEntry[];
}

export interface CommandsViewModel {
  activeCommand: MenuItem | null;
  aiResultData: AIResultData | null;
  config: MenuConfig;
  filteredItems: MenuItem[];
  globalSearchResults: CommandsSearchResults;
  isGlobalSearchLoading: boolean;
  minimizedTasks: MinimizedTask[];
  recentCommands: string[];
  recentTasks: SavedTask[];
  searchQuery: string;
  selectedIndex: number;
}

export interface CommandsEventDeps {
  handleDragStart: (event: MouseEvent) => void;
  onActiveInputChange: (value: string) => void;
  onBindThinkingSections: (container: Element) => void;
  onClearActiveCommand: () => Promise<void> | void;
  onCopyResult: (button: HTMLButtonElement) => void;
  onDeleteRecentTask: (taskId: string) => Promise<void> | void;
  onDismissMinimizedTask: (taskId: string) => void;
  onExecuteSelected: () => Promise<void> | void;
  onFilterInput: (query: string) => void;
  onHide: () => void;
  onHoverCommand: (index: number) => void;
  onLeaveCommands: () => void;
  onRefresh: () => void;
  onRestoreMinimizedTask: (taskId: string) => void;
  onRestoreRecentTask: (taskId: string) => void;
  onSaveToAnnotation: (button: HTMLButtonElement) => void;
  onSaveTask: (button: HTMLButtonElement) => void;
  onSearchCommandSelect: (id: string) => void;
  onSelectCommand: (index: number) => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  onStop: () => void;
  onToggleCompare: () => void;
  onTranslateInput: (text: string) => void;
  onTranslateLanguageChange: (language: string) => void;
  onExportToDrive: (button: HTMLButtonElement) => void;
  onOpenSearchResultUrl: (url: string) => void;
  shadowRoot: ShadowRoot;
}

function isAIAction(action: string | undefined): boolean {
  return ['translate', 'summarize', 'explain', 'rewrite', 'codeExplain', 'summarizePage'].includes(action || '');
}

function needsInput(action: string | undefined): boolean {
  return ['contextChat', 'translateInput'].includes(action || '');
}

function getCommandsContentHTML(model: CommandsViewModel): string {
  if (model.filteredItems.length === 0) {
    return `
      <div class="glass-empty">
        <span>${t('palette.noMatchingCommands')}</span>
      </div>
    `;
  }

  return model.filteredItems.map((item, index) => {
    const isSelected = index === model.selectedIndex;
    const displayIcon = item.customIcon || item.icon;
    const displayLabel = item.customLabel || t(item.label);
    const shortcutKey = index < 9 && !model.searchQuery ? index + 1 : null;
    const isRecent = model.recentCommands.includes(item.id) && !model.searchQuery;

    return `
      <div class="glass-item ${isSelected ? 'selected' : ''}" data-index="${index}">
        <div class="glass-item-icon">${displayIcon}</div>
        <div class="glass-item-label">${escapeHtml(displayLabel)}</div>
        ${isRecent ? `<span class="glass-item-badge">${t('palette.recent')}</span>` : ''}
        ${shortcutKey ? `<kbd class="glass-item-key">${shortcutKey}</kbd>` : ''}
      </div>
    `;
  }).join('');
}

function getGlobalSearchResultsHTML(model: CommandsViewModel): string {
  const { commands, knowledge, trails } = model.globalSearchResults;
  const hasResults = commands.length > 0 || knowledge.length > 0 || trails.length > 0;

  if (!hasResults && !model.isGlobalSearchLoading) {
    return `
      <div class="glass-empty">
        <span>${t('palette.noMatchingResults')}</span>
      </div>
    `;
  }

  let html = '';

  if (commands.length > 0) {
    html += `
      <div class="glass-search-section">
        <div class="glass-search-section-title">${icons.command} ${t('palette.commandsSection')}</div>
        ${commands.slice(0, 5).map((item, index) => `
          <div class="glass-item ${index === model.selectedIndex ? 'selected' : ''}" data-type="command" data-index="${index}" data-id="${item.id}">
            <div class="glass-item-icon">${item.customIcon || item.icon}</div>
            <div class="glass-item-label">${escapeHtml(item.customLabel || t(item.label))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (knowledge.length > 0) {
    html += `
      <div class="glass-search-section">
        <div class="glass-search-section-title">${icons.library} ${t('palette.knowledgeSection')}</div>
        ${knowledge.map((item) => {
          const typeIcon = item.type === 'annotation' ? icons.highlighter : icons.sparkles;
          const typeLabel = item.type === 'annotation' ? t('knowledge.annotationType') : getActionTypeLabel(item.actionType || '');
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

  if (trails.length > 0) {
    html += `
      <div class="glass-search-section">
        <div class="glass-search-section-title">${icons.history} ${t('palette.browseTrailSection')}</div>
        ${trails.map((entry) => {
          let hostname = '';
          try {
            hostname = new URL(entry.url).hostname;
          } catch {
            hostname = '';
          }

          return `
            <div class="glass-search-result" data-type="trail" data-url="${escapeHtml(entry.url)}">
              <div class="glass-search-result-icon">${icons.globe}</div>
              <div class="glass-search-result-content">
                <div class="glass-search-result-title">${escapeHtml(entry.title || t('trail.noTitle'))}</div>
                ${entry.summary ? `<div class="glass-search-result-preview">${escapeHtml(entry.summary.substring(0, 60))}...</div>` : ''}
                <div class="glass-search-result-meta">${escapeHtml(hostname)}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (model.isGlobalSearchLoading && !hasResults) {
    html += `
      <div class="glass-search-loading">
        <span class="glass-search-loading-spinner"></span>
        <span>${t('palette.searchingResults')}</span>
      </div>
    `;
  }

  return html;
}

function getRecentTasksHTML(tasks: SavedTask[]): string {
  if (tasks.length === 0) {
    return '';
  }

  return `
    <div class="glass-section-label">${t('palette.recentRecords')}</div>
    ${tasks.map((task) => {
      const icon = getActionIcon(task.actionType);
      const meta = getSavedTaskMetaInfo(task);

      return `
        <div class="glass-recent-task" data-task-id="${task.id}">
          <div class="glass-task-icon">${icon}</div>
          <div class="glass-task-info">
            <div class="glass-task-title">${escapeHtml(t(task.title))}</div>
            <div class="glass-task-meta">${meta}</div>
          </div>
          <button class="glass-recent-close" data-task-id="${task.id}">&times;</button>
        </div>
      `;
    }).join('')}
  `;
}

export function getFilteredRecentTasks(
  recentSavedTasks: SavedTask[],
  unsavedRecentTasks: SavedTask[],
  searchQuery: string
): SavedTask[] {
  const savedIds = new Set(recentSavedTasks.map((task) => task.id));
  const merged = [
    ...unsavedRecentTasks.filter((task) => !savedIds.has(task.id)),
    ...recentSavedTasks,
  ];

  if (!searchQuery) {
    return merged;
  }

  return merged.filter((task) => {
    const title = task.title.toLowerCase();
    const content = task.content.toLowerCase();
    const actionType = task.actionType.toLowerCase();
    const sourceTitle = (task.sourceTitle || '').toLowerCase();
    const originalText = (task.originalText || '').toLowerCase();

    return title.includes(searchQuery) ||
      content.includes(searchQuery) ||
      actionType.includes(searchQuery) ||
      sourceTitle.includes(searchQuery) ||
      originalText.includes(searchQuery);
  });
}

export function getCommandsViewHTML(model: CommandsViewModel): string {
  const hasActiveCommand = model.activeCommand !== null;
  const activeAction = model.activeCommand?.action;
  const isLoading = model.aiResultData?.isLoading ?? false;
  const isTranslate = model.aiResultData?.resultType === 'translate';
  const isSavedTask = model.activeCommand?.id?.startsWith('saved_') ?? false;

  let placeholder = t('palette.searchPlaceholder');
  if (hasActiveCommand) {
    if (needsInput(activeAction)) {
      placeholder = t('palette.inputPlaceholder');
    } else if (isTranslate && model.aiResultData?.originalText) {
      placeholder = '';
    } else if (isLoading) {
      placeholder = t('palette.processingPlaceholder');
    } else {
      placeholder = '';
    }
  }

  const inputValue = isTranslate && model.aiResultData?.originalText ? model.aiResultData.originalText : '';

  return `
    <div class="glass-search glass-draggable">
      ${hasActiveCommand ? `
        <div class="glass-command-tag" data-action="${activeAction}">
          <span class="glass-command-tag-icon">${model.activeCommand?.icon || ''}</span>
          <span class="glass-command-tag-label">${escapeHtml(model.activeCommand?.customLabel || t(model.activeCommand?.label || ''))}</span>
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
        ${isAIAction(activeAction) && !needsInput(activeAction) ? 'readonly' : ''}
      />
      ${hasActiveCommand ? `
        <button class="glass-header-btn glass-btn-stop" title="${t('common.abort')}" style="display: ${isLoading ? 'flex' : 'none'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
      ` : ''}
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    ${hasActiveCommand && model.aiResultData ? getSourceInfoHTML(model.aiResultData) : ''}
    <div class="glass-body">
      ${hasActiveCommand ? `
        <div class="glass-ai-content-area">
          ${getThinkingSectionHTML(model.aiResultData?.thinking)}
          ${isLoading && !model.aiResultData?.content ? getLoadingHTML() : ''}
          ${model.aiResultData?.content ? `<div class="glass-ai-content">${formatAIContent(model.aiResultData.content)}</div>` : ''}
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
          ${isTranslate ? getTranslateLanguageSelectHTML(model.aiResultData?.translateTargetLanguage || model.config.preferredLanguage || 'zh-CN') : ''}
          ${isTranslate && model.aiResultData?.originalText ? `
            <button class="glass-footer-btn glass-btn-compare" title="${t('aiResult.compareOriginal')}">
              ${icons.columns}
            </button>
          ` : ''}
          <button class="glass-footer-btn glass-btn-copy" title="${t('common.copy')}" style="display: ${model.aiResultData?.content ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          ${activeAction === 'summarizePage' && !isSavedTask ? `
            <button class="glass-footer-btn glass-btn-refresh" title="${t('aiResult.resummarize')}" style="display: ${!isLoading ? 'flex' : 'none'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
            </button>
          ` : ''}
          ${!isSavedTask ? `
          <button class="glass-footer-btn glass-btn-save" title="${t('common.save')}" style="display: ${model.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </button>
          ${model.aiResultData?.originalText ? `
          <button class="glass-footer-btn glass-btn-annotate" title="${t('aiResult.saveToAnnotation')}" style="display: ${model.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          ` : ''}
          <button class="glass-footer-btn glass-btn-export-drive" title="${t('aiResult.exportToDrive')}" style="display: ${model.aiResultData?.content && !isLoading ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4.5 12.5h5.5v9.5h4v-9.5h5.5L12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 18.5L8 12.5L12 18.5L16 12.5L20 18.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          ` : ''}
          <span class="glass-token-usage" style="display: ${model.aiResultData?.usage && !isLoading ? 'inline' : 'none'}">${formatTokenUsage(model.aiResultData?.usage)}</span>
        </div>
      ` : `
        <div class="glass-hints">
          <span><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></kbd><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></kbd> ${t('palette.navigate')}</span>
          <span><kbd><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg></kbd> ${t('palette.execute')}</span>
        </div>
      `}
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function renderCommandsContent(
  shadowRoot: ShadowRoot,
  model: CommandsViewModel,
  deps: Pick<
    CommandsEventDeps,
    'onDeleteRecentTask' |
    'onDismissMinimizedTask' |
    'onHoverCommand' |
    'onLeaveCommands' |
    'onRestoreMinimizedTask' |
    'onRestoreRecentTask' |
    'onSearchCommandSelect' |
    'onSelectCommand' |
    'onOpenSearchResultUrl'
  >
): void {
  const container = shadowRoot.querySelector('.glass-commands') as HTMLElement | null;
  if (!container) return;

  container.innerHTML = model.searchQuery
    ? getGlobalSearchResultsHTML(model)
    : getCommandsContentHTML(model);

  if (model.searchQuery) {
    bindGlobalSearchResultEvents(container, deps);
  } else {
    bindCommandListEvents(container, deps);
  }

  renderMinimizedTasksSection(shadowRoot, model.minimizedTasks, deps.onRestoreMinimizedTask, deps.onDismissMinimizedTask);
  renderRecentTasksSection(shadowRoot, model.recentTasks, deps.onRestoreRecentTask, deps.onDeleteRecentTask);
}

function bindCommandListEvents(
  container: HTMLElement,
  deps: Pick<CommandsEventDeps, 'onHoverCommand' | 'onLeaveCommands' | 'onSelectCommand'>
): void {
  container.querySelectorAll('.glass-item').forEach((element) => {
    element.addEventListener('click', () => {
      deps.onSelectCommand(parseInt(element.getAttribute('data-index') || '0', 10));
    });

    element.addEventListener('mouseenter', () => {
      deps.onHoverCommand(parseInt(element.getAttribute('data-index') || '0', 10));
    });
  });

  container.addEventListener('mouseleave', () => {
    deps.onLeaveCommands();
  });
}

function bindGlobalSearchResultEvents(
  container: HTMLElement,
  deps: Pick<CommandsEventDeps, 'onSearchCommandSelect' | 'onOpenSearchResultUrl'>
): void {
  container.querySelectorAll('.glass-item[data-type="command"]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.getAttribute('data-id');
      if (id) {
        deps.onSearchCommandSelect(id);
      }
    });
  });

  container.querySelectorAll('.glass-search-result[data-type="knowledge"], .glass-search-result[data-type="trail"]').forEach((element) => {
    element.addEventListener('click', () => {
      const url = element.getAttribute('data-url');
      if (url) {
        deps.onOpenSearchResultUrl(url);
      }
    });
  });
}

export function renderMinimizedTasksSection(
  shadowRoot: ShadowRoot,
  minimizedTasks: MinimizedTask[],
  onRestoreMinimizedTask: (taskId: string) => void,
  onDismissMinimizedTask: (taskId: string) => void
): void {
  const section = shadowRoot.querySelector('.glass-minimized-section');
  if (!section) return;

  if (minimizedTasks.length === 0) {
    section.innerHTML = '';
    return;
  }

  section.innerHTML = getMinimizedTasksHTML(minimizedTasks, t('palette.inProgress'));
  bindMinimizedTasksEvents(section, onRestoreMinimizedTask, onDismissMinimizedTask);
}

export function renderRecentTasksSection(
  shadowRoot: ShadowRoot,
  tasks: SavedTask[],
  onRestoreRecentTask: (taskId: string) => void,
  onDeleteRecentTask: (taskId: string) => Promise<void> | void
): void {
  const section = shadowRoot.querySelector('.glass-recent-section');
  if (!section) return;

  section.innerHTML = getRecentTasksHTML(tasks);

  if (tasks.length === 0) {
    return;
  }

  section.querySelectorAll('.glass-recent-task').forEach((element) => {
    element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('glass-recent-close')) return;
      const taskId = element.getAttribute('data-task-id');
      if (taskId) {
        onRestoreRecentTask(taskId);
      }
    });
  });

  section.querySelectorAll('.glass-recent-close').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      const taskId = element.getAttribute('data-task-id');
      if (taskId) {
        void onDeleteRecentTask(taskId);
      }
    });
  });
}

export function bindCommandsEvents(model: CommandsViewModel, deps: CommandsEventDeps): void {
  const input = deps.shadowRoot.querySelector('.glass-input') as HTMLInputElement | null;
  const searchArea = deps.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;
  const hasActiveCommand = model.activeCommand !== null;

  searchArea?.addEventListener('mousedown', deps.handleDragStart);

  deps.shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    void deps.onClearActiveCommand();
  });

  if (hasActiveCommand) {
    deps.shadowRoot.querySelector('.glass-btn-stop')?.addEventListener('click', () => {
      deps.onStop();
    });

    const copyButton = deps.shadowRoot.querySelector('.glass-btn-copy') as HTMLButtonElement | null;
    copyButton?.addEventListener('click', () => {
      deps.onCopyResult(copyButton);
    });

    deps.shadowRoot.querySelector('.glass-btn-compare')?.addEventListener('click', () => {
      deps.onToggleCompare();
    });

    const languageSelect = deps.shadowRoot.querySelector('.glass-lang-select') as HTMLSelectElement | null;
    languageSelect?.addEventListener('change', () => {
      deps.onTranslateLanguageChange(languageSelect.value);
    });

    deps.shadowRoot.querySelector('.glass-btn-refresh')?.addEventListener('click', () => {
      deps.onRefresh();
    });

    const saveButton = deps.shadowRoot.querySelector('.glass-btn-save') as HTMLButtonElement | null;
    saveButton?.addEventListener('click', () => {
      deps.onSaveTask(saveButton);
    });

    const exportButton = deps.shadowRoot.querySelector('.glass-btn-export-drive') as HTMLButtonElement | null;
    exportButton?.addEventListener('click', () => {
      deps.onExportToDrive(exportButton);
    });

    const annotateButton = deps.shadowRoot.querySelector('.glass-btn-annotate') as HTMLButtonElement | null;
    annotateButton?.addEventListener('click', () => {
      deps.onSaveToAnnotation(annotateButton);
    });
  }

  input?.addEventListener('input', () => {
    if (!hasActiveCommand) {
      deps.onFilterInput(input.value.toLowerCase().trim());
      return;
    }
    deps.onActiveInputChange(input.value);
  });

  input?.addEventListener('keydown', (event) => {
    if (event.isComposing) return;

    if (hasActiveCommand) {
      if (event.key === 'Escape') {
        event.preventDefault();
        void deps.onClearActiveCommand();
      } else if (event.key === 'Enter' && model.activeCommand?.action === 'translateInput') {
        event.preventDefault();
        const text = input.value.trim();
        if (text) {
          deps.onTranslateInput(text);
          input.value = '';
          deps.onActiveInputChange('');
        }
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        deps.onSelectNext();
        break;
      case 'ArrowUp':
        event.preventDefault();
        deps.onSelectPrev();
        break;
      case 'Enter':
        event.preventDefault();
        void deps.onExecuteSelected();
        break;
      case 'Escape':
        event.preventDefault();
        deps.onHide();
        break;
      case 'Tab':
        event.preventDefault();
        if (event.shiftKey) {
          deps.onSelectPrev();
        } else {
          deps.onSelectNext();
        }
        break;
    }
  });

  if (!hasActiveCommand) {
    input?.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key >= '1' && event.key <= '9' && !model.searchQuery) {
        const index = parseInt(event.key, 10) - 1;
        if (index < model.filteredItems.length) {
          event.preventDefault();
          deps.onSelectCommand(index);
        }
      }
    });
  }

  if (hasActiveCommand) {
    const contentArea = deps.shadowRoot.querySelector('.glass-ai-content-area');
    if (contentArea) {
      deps.onBindThinkingSections(contentArea);
    }
  }
}
