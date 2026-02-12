// Browse Trail View - displays browsing history
import { BrowseSession } from '../../../types';
import { escapeHtml } from '../utils';

// Re-export TrailEntry type for convenience
export type { BrowseSession } from '../../../types';

export interface TrailEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  summary?: string;
}

export interface BrowseTrailState {
  sessions: BrowseSession[];
  search: string;
  displayCount: number;
}

export function createBrowseTrailState(): BrowseTrailState {
  return {
    sessions: [],
    search: '',
    displayCount: 50,
  };
}

export function getBrowseTrailViewHTML(
  state: BrowseTrailState,
  icons: Record<string, string>,
  getContentHTML: () => string
): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="browseTrail">
        <span class="glass-command-tag-icon">${icons.history}</span>
        <span class="glass-command-tag-label">浏览轨迹</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="搜索历史记录..."
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body">
      <div class="glass-trail-content">
        ${getContentHTML()}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-trail-footer-actions">
        <button class="glass-btn glass-btn-trail-clear">清空历史</button>
        <button class="glass-btn glass-btn-trail-export">导出</button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getBrowseTrailContentHTML(
  state: BrowseTrailState,
  icons: Record<string, string>
): string {
  // Flatten all entries
  const allEntries: TrailEntry[] = [];
  for (const session of state.sessions) {
    allEntries.push(...session.entries);
  }
  allEntries.sort((a, b) => b.visitedAt - a.visitedAt);

  // Filter by search
  const query = state.search.toLowerCase();
  const filtered = query
    ? allEntries.filter(e =>
        e.title.toLowerCase().includes(query) ||
        e.url.toLowerCase().includes(query) ||
        (e.summary?.toLowerCase().includes(query))
      )
    : allEntries;

  if (filtered.length === 0) {
    return `
      <div class="glass-trail-empty">
        <div class="glass-trail-empty-icon">${icons.history}</div>
        <div class="glass-trail-empty-text">
          ${query ? '没有找到匹配的记录' : '还没有浏览记录'}
        </div>
        <div class="glass-trail-empty-hint">
          ${query ? '试试其他关键词' : '浏览网页时会自动记录'}
        </div>
      </div>
    `;
  }

  // Progressive loading: only show up to displayCount
  const displayEntries = filtered.slice(0, state.displayCount);
  const hasMore = filtered.length > state.displayCount;

  // Group by date
  const groups = groupTrailByDate(displayEntries);

  const entriesHTML = Object.entries(groups).map(([date, entries]) => `
    <div class="glass-trail-group">
      <div class="glass-trail-date">${date}</div>
      <div class="glass-trail-entries">
        ${entries.map(entry => {
          const time = new Date(entry.visitedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          });
          let domain = '';
          try { domain = new URL(entry.url).hostname; } catch {}

          return `
            <div class="glass-trail-entry" data-url="${escapeHtml(entry.url)}">
              <div class="glass-trail-entry-info">
                <div class="glass-trail-entry-title">${escapeHtml(entry.title || '无标题')}</div>
                <div class="glass-trail-entry-meta">
                  <span class="glass-trail-entry-domain">${escapeHtml(domain)}</span>
                  <span class="glass-trail-entry-time">${time}</span>
                </div>
              </div>
              <button class="glass-trail-entry-delete" data-id="${entry.id}" title="删除">&times;</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  const loadMoreHTML = hasMore ? `
    <div class="glass-trail-load-more">
      <button class="glass-btn glass-btn-load-more">
        加载更多 (${filtered.length - state.displayCount} 条)
      </button>
    </div>
  ` : '';

  return entriesHTML + loadMoreHTML;
}

function groupTrailByDate(entries: TrailEntry[]): Record<string, TrailEntry[]> {
  const groups: Record<string, TrailEntry[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const date = new Date(entry.visitedAt).toDateString();
    let label: string;

    if (date === today) {
      label = '今天';
    } else if (date === yesterday) {
      label = '昨天';
    } else {
      label = new Date(entry.visitedAt).toLocaleDateString('zh-CN', {
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

export interface BrowseTrailCallbacks {
  onClose: () => void;
  onClear: () => Promise<void>;
  onExport: () => void;
  onEntryClick: (url: string) => void;
  onEntryDelete: (id: string) => Promise<BrowseSession[]>;
  onLoadMore: () => void;
  onSearch: (query: string) => void;
  handleDragStart: (e: MouseEvent) => void;
}

export function bindBrowseTrailEvents(
  shadowRoot: ShadowRoot | null,
  state: BrowseTrailState,
  callbacks: BrowseTrailCallbacks,
  rebindEntryEvents: () => void
): void {
  if (!shadowRoot) return;

  const input = shadowRoot.querySelector('.glass-input') as HTMLInputElement;
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;

  if (searchArea) {
    searchArea.addEventListener('mousedown', callbacks.handleDragStart);
  }

  // Command tag close
  const tagClose = shadowRoot.querySelector('.glass-command-tag-close');
  tagClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onClose();
  });

  // Search
  input?.addEventListener('input', () => {
    callbacks.onSearch(input.value.trim());
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      callbacks.onClose();
    }
  });

  // Footer actions
  const clearBtn = shadowRoot.querySelector('.glass-btn-trail-clear');
  clearBtn?.addEventListener('click', async () => {
    if (confirm('确定要清空所有浏览记录吗？')) {
      await callbacks.onClear();
    }
  });

  const exportBtn = shadowRoot.querySelector('.glass-btn-trail-export');
  exportBtn?.addEventListener('click', () => {
    callbacks.onExport();
  });

  // Bind entry events
  rebindEntryEvents();
}

export function bindTrailEntryEvents(
  shadowRoot: ShadowRoot | null,
  callbacks: BrowseTrailCallbacks,
  rebindEntryEvents: () => void
): void {
  if (!shadowRoot) return;

  shadowRoot.querySelectorAll('.glass-trail-entry').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.glass-trail-entry-delete')) return;
      const url = el.getAttribute('data-url');
      if (url) {
        callbacks.onEntryClick(url);
      }
    });
  });

  shadowRoot.querySelectorAll('.glass-trail-entry-delete').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.getAttribute('data-id');
      if (id) {
        await callbacks.onEntryDelete(id);
        rebindEntryEvents();
      }
    });
  });

  // Load more button
  const loadMoreBtn = shadowRoot.querySelector('.glass-btn-load-more');
  loadMoreBtn?.addEventListener('click', () => {
    callbacks.onLoadMore();
    rebindEntryEvents();
  });
}
