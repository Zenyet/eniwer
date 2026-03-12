import { t } from '../../../i18n';
import { icons } from '../../../icons';
import {
  KnowledgeItem,
  getFilteredKnowledgeItems,
  getKnowledgeContentHTML as getKnowledgeContentHTMLFromModule,
} from '../views';

export interface KnowledgeViewModel {
  items: KnowledgeItem[];
  filter: 'all' | 'annotations' | 'ai-results';
  search: string;
}

export interface KnowledgeEventDeps {
  handleDragStart: (e: MouseEvent) => void;
  onClose: () => void;
  onDeleteItem: (id: string) => Promise<void> | void;
  onExport: () => void;
  onFilterChange: (filter: 'all' | 'annotations' | 'ai-results') => void;
  onOpenAIResult: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onSearch: (query: string) => void;
  shadowRoot: ShadowRoot;
}

export function getLocalFilteredKnowledgeItems(model: KnowledgeViewModel): KnowledgeItem[] {
  return getFilteredKnowledgeItems(model.items, model.filter, model.search);
}

export function getKnowledgeContentHTML(model: KnowledgeViewModel): string {
  return getKnowledgeContentHTMLFromModule(model.items, model.filter, model.search, icons);
}

export function getKnowledgeViewHTML(model: KnowledgeViewModel): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="knowledge">
        <span class="glass-command-tag-icon">${icons.library}</span>
        <span class="glass-command-tag-label">${t('menu.knowledge')}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="${t('knowledge.searchPlaceholder')}"
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-knowledge-filter">
      <button class="glass-filter-btn ${model.filter === 'all' ? 'active' : ''}" data-filter="all">${t('knowledge.all')}</button>
      <button class="glass-filter-btn ${model.filter === 'annotations' ? 'active' : ''}" data-filter="annotations">${t('knowledge.annotationsOnly')}</button>
      <button class="glass-filter-btn ${model.filter === 'ai-results' ? 'active' : ''}" data-filter="ai-results">${t('knowledge.aiResultsOnly')}</button>
    </div>
    <div class="glass-body">
      <div class="glass-knowledge-content">
        ${getKnowledgeContentHTML(model)}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-footer-content">
        <div class="glass-knowledge-footer-info">
          ${t('knowledge.count', { count: getLocalFilteredKnowledgeItems(model).length })}
        </div>
        <button class="glass-footer-btn glass-btn-export-knowledge" title="${t('common.export')}">
          ${icons.download}
        </button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function renderKnowledgeContent(shadowRoot: ShadowRoot, model: KnowledgeViewModel): void {
  const content = shadowRoot.querySelector('.glass-knowledge-content');
  if (content) {
    content.innerHTML = getKnowledgeContentHTML(model);
  }
}

export function updateKnowledgeFooter(shadowRoot: ShadowRoot, model: KnowledgeViewModel): void {
  const footerInfo = shadowRoot.querySelector('.glass-knowledge-footer-info');
  if (footerInfo) {
    footerInfo.textContent = t('knowledge.count', { count: getLocalFilteredKnowledgeItems(model).length });
  }
}

export function bindKnowledgeEntryEvents(
  shadowRoot: ShadowRoot,
  onOpenAIResult: (id: string) => void,
  onOpenUrl: (url: string) => void,
  onDeleteItem: (id: string) => Promise<void> | void
): void {
  const entries = shadowRoot.querySelectorAll('.glass-knowledge-entry');
  entries.forEach((entry) => {
    entry.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).classList.contains('glass-knowledge-entry-delete')) return;

      const id = (entry as HTMLElement).dataset.id;
      const type = (entry as HTMLElement).dataset.type;
      const url = (entry as HTMLElement).dataset.url;

      if (type === 'ai-result' && id) {
        onOpenAIResult(id);
      } else if (url) {
        onOpenUrl(url);
      }
    });
  });

  const deleteButtons = shadowRoot.querySelectorAll('.glass-knowledge-entry-delete');
  deleteButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = (button as HTMLElement).dataset.id;
      if (id) {
        void onDeleteItem(id);
      }
    });
  });
}

export function bindKnowledgeEvents({
  handleDragStart,
  onClose,
  onDeleteItem,
  onExport,
  onFilterChange,
  onOpenAIResult,
  onOpenUrl,
  onSearch,
  shadowRoot,
}: KnowledgeEventDeps): void {
  const input = shadowRoot.querySelector('.glass-input') as HTMLInputElement | null;
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;

  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });

  const filterButtons = shadowRoot.querySelectorAll('.glass-filter-btn');
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      onFilterChange((button as HTMLElement).dataset.filter as 'all' | 'annotations' | 'ai-results');
      filterButtons.forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
    });
  });

  input?.addEventListener('input', () => {
    onSearch(input.value.trim());
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  });

  shadowRoot.querySelector('.glass-btn-export-knowledge')?.addEventListener('click', onExport);

  bindKnowledgeEntryEvents(shadowRoot, onOpenAIResult, onOpenUrl, onDeleteItem);
}
