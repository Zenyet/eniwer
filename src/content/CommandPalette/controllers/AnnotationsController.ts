import { t } from '../../../i18n';
import { icons } from '../../../icons';
import { Annotation } from '../../../types/annotation';
import {
  getAnnotationsContentHTML as getAnnotationsContentHTMLFromModule,
  getFilteredAnnotations,
} from '../views';

export interface AnnotationsViewModel {
  annotations: Annotation[];
  currentUrl: string;
  filter: 'all' | 'current';
  search: string;
}

export interface AnnotationsEventDeps {
  handleDragStart: (e: MouseEvent) => void;
  onClose: () => void;
  onDeleteAnnotation: (id: string) => Promise<void> | void;
  onFilterChange: (filter: 'all' | 'current') => void;
  onOpenAnnotation: (id: string | null, url: string) => void;
  onSearch: (query: string) => void;
  shadowRoot: ShadowRoot;
}

export function getLocalFilteredAnnotations(model: AnnotationsViewModel): Annotation[] {
  return getFilteredAnnotations(model.annotations, model.filter, model.search, model.currentUrl);
}

export function getAnnotationsContentHTML(model: AnnotationsViewModel): string {
  return getAnnotationsContentHTMLFromModule(
    model.annotations,
    model.filter,
    model.search,
    model.currentUrl,
    icons
  );
}

export function getAnnotationsViewHTML(model: AnnotationsViewModel): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="annotations">
        <span class="glass-command-tag-icon">${icons.highlighter}</span>
        <span class="glass-command-tag-label">${t('menu.annotations')}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="${t('annotations.searchPlaceholder')}"
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-knowledge-filter">
      <button class="glass-filter-btn ${model.filter === 'all' ? 'active' : ''}" data-filter="all">${t('annotations.all')}</button>
      <button class="glass-filter-btn ${model.filter === 'current' ? 'active' : ''}" data-filter="current">${t('annotations.currentPage')}</button>
    </div>
    <div class="glass-body">
      <div class="glass-knowledge-content">
        ${getAnnotationsContentHTML(model)}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-knowledge-footer-info">
        ${t('annotations.count', { count: getLocalFilteredAnnotations(model).length })}
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function renderAnnotationsContent(shadowRoot: ShadowRoot, model: AnnotationsViewModel): void {
  const content = shadowRoot.querySelector('.glass-knowledge-content');
  if (content) {
    content.innerHTML = getAnnotationsContentHTML(model);
  }
}

export function updateAnnotationsFooter(shadowRoot: ShadowRoot, model: AnnotationsViewModel): void {
  const footerInfo = shadowRoot.querySelector('.glass-knowledge-footer-info');
  if (footerInfo) {
    footerInfo.textContent = t('annotations.count', { count: getLocalFilteredAnnotations(model).length });
  }
}

export function bindAnnotationEntryEvents(
  shadowRoot: ShadowRoot,
  onOpenAnnotation: (id: string | null, url: string) => void,
  onDeleteAnnotation: (id: string) => Promise<void> | void
): void {
  const entries = shadowRoot.querySelectorAll('.glass-knowledge-entry');
  entries.forEach((entry) => {
    entry.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).classList.contains('glass-knowledge-entry-delete')) return;
      const url = (entry as HTMLElement).dataset.url;
      if (!url) return;
      const id = (entry as HTMLElement).dataset.id || null;
      onOpenAnnotation(id, url);
    });
  });

  const deleteButtons = shadowRoot.querySelectorAll('.glass-knowledge-entry-delete');
  deleteButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = (button as HTMLElement).dataset.id;
      if (id) {
        void onDeleteAnnotation(id);
      }
    });
  });
}

export function bindAnnotationsEvents({
  handleDragStart,
  onClose,
  onDeleteAnnotation,
  onFilterChange,
  onOpenAnnotation,
  onSearch,
  shadowRoot,
}: AnnotationsEventDeps): void {
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
      onFilterChange((button as HTMLElement).dataset.filter as 'all' | 'current');
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

  bindAnnotationEntryEvents(shadowRoot, onOpenAnnotation, onDeleteAnnotation);
}
