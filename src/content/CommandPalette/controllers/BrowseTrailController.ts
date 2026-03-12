import { BrowseSession, TrailEntry } from '../../../types';
import { icons } from '../../../icons';
import { t } from '../../../i18n';
import { escapeHtml } from '../utils';

export interface BrowseTrailViewModel {
  displayCount: number;
  search: string;
  sessions: BrowseSession[];
}

export interface BrowseTrailEventDeps {
  handleDragStart: (e: MouseEvent) => void;
  onClearHistory: () => Promise<void> | void;
  onClose: () => void;
  onDeleteEntry: (id: string) => Promise<void> | void;
  onExport: () => void;
  onLoadMore: () => void;
  onOpenEntry: (url: string) => void;
  onSearch: (query: string) => void;
  shadowRoot: ShadowRoot;
}

function groupTrailByDate(entries: TrailEntry[]): Record<string, TrailEntry[]> {
  const groups: Record<string, TrailEntry[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const date = new Date(entry.visitedAt).toDateString();
    let label: string;

    if (date === today) {
      label = t('time.today');
    } else if (date === yesterday) {
      label = t('time.yesterday');
    } else {
      label = new Date(entry.visitedAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(entry);
  }

  return groups;
}

function flattenTrailEntries(sessions: BrowseSession[]): TrailEntry[] {
  const entries: TrailEntry[] = [];
  for (const session of sessions) {
    entries.push(...session.entries);
  }
  entries.sort((a, b) => b.visitedAt - a.visitedAt);
  return entries;
}

export function getBrowseTrailViewHTML(model: BrowseTrailViewModel): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="browseTrail">
        <span class="glass-command-tag-icon">${icons.history}</span>
        <span class="glass-command-tag-label">${t('menu.browseTrail')}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="${t('trail.searchPlaceholder')}"
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body">
      <div class="glass-trail-content">
        ${getBrowseTrailContentHTML(model)}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-trail-footer-actions">
        <button class="glass-btn glass-btn-trail-clear">${t('trail.clearHistory')}</button>
        <button class="glass-btn glass-btn-trail-export">${t('common.export')}</button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getBrowseTrailContentHTML(model: BrowseTrailViewModel): string {
  const allEntries = flattenTrailEntries(model.sessions);
  const query = model.search.toLowerCase();
  const filtered = query
    ? allEntries.filter((entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        (entry.summary?.toLowerCase().includes(query))
      )
    : allEntries;

  if (filtered.length === 0) {
    return `
      <div class="glass-trail-empty">
        <div class="glass-trail-empty-icon">${icons.history}</div>
        <div class="glass-trail-empty-text">
          ${query ? t('trail.noMatchingRecords') : t('trail.noRecordsYet')}
        </div>
        <div class="glass-trail-empty-hint">
          ${query ? t('trail.tryOtherKeywords') : t('trail.autoRecordHint')}
        </div>
      </div>
    `;
  }

  const displayEntries = filtered.slice(0, model.displayCount);
  const hasMore = filtered.length > model.displayCount;
  const groups = groupTrailByDate(displayEntries);

  const entriesHTML = Object.entries(groups).map(([date, entries]) => `
    <div class="glass-trail-group">
      <div class="glass-trail-date">${date}</div>
      <div class="glass-trail-entries">
        ${entries.map((entry) => {
          const time = new Date(entry.visitedAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          });
          let domain = '';
          try {
            domain = new URL(entry.url).hostname;
          } catch {
            domain = '';
          }

          return `
            <div class="glass-trail-entry" data-url="${escapeHtml(entry.url)}">
              <div class="glass-trail-entry-info">
                <div class="glass-trail-entry-title">${escapeHtml(entry.title || t('trail.noTitle'))}</div>
                <div class="glass-trail-entry-meta">
                  <span class="glass-trail-entry-domain">${escapeHtml(domain)}</span>
                  <span class="glass-trail-entry-time">${time}</span>
                </div>
              </div>
              <button class="glass-trail-entry-delete" data-id="${entry.id}" title="${t('common.delete')}">&times;</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  const loadMoreHTML = hasMore ? `
    <div class="glass-trail-load-more">
      <button class="glass-btn glass-btn-load-more">
        ${t('trail.loadMore', { count: filtered.length - model.displayCount })}
      </button>
    </div>
  ` : '';

  return entriesHTML + loadMoreHTML;
}

export function renderBrowseTrailContent(shadowRoot: ShadowRoot, model: BrowseTrailViewModel): void {
  const content = shadowRoot.querySelector('.glass-trail-content');
  if (content) {
    content.innerHTML = getBrowseTrailContentHTML(model);
  }
}

export function bindBrowseTrailEntryEvents(
  shadowRoot: ShadowRoot,
  onOpenEntry: (url: string) => void,
  onDeleteEntry: (id: string) => Promise<void> | void,
  onLoadMore: () => void
): void {
  shadowRoot.querySelectorAll('.glass-trail-entry').forEach((element) => {
    element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.glass-trail-entry-delete')) return;
      const url = element.getAttribute('data-url');
      if (url) {
        onOpenEntry(url);
      }
    });
  });

  shadowRoot.querySelectorAll('.glass-trail-entry-delete').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = element.getAttribute('data-id');
      if (id) {
        void onDeleteEntry(id);
      }
    });
  });

  shadowRoot.querySelector('.glass-btn-load-more')?.addEventListener('click', onLoadMore);
}

export function bindBrowseTrailEvents({
  handleDragStart,
  onClearHistory,
  onClose,
  onDeleteEntry,
  onExport,
  onLoadMore,
  onOpenEntry,
  onSearch,
  shadowRoot,
}: BrowseTrailEventDeps): void {
  const input = shadowRoot.querySelector('.glass-input') as HTMLInputElement | null;
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;

  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
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

  shadowRoot.querySelector('.glass-btn-trail-clear')?.addEventListener('click', () => {
    void onClearHistory();
  });
  shadowRoot.querySelector('.glass-btn-trail-export')?.addEventListener('click', onExport);

  bindBrowseTrailEntryEvents(shadowRoot, onOpenEntry, onDeleteEntry, onLoadMore);
}
