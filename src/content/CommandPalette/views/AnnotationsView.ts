// Annotations View - handles annotation list display and management
import { Annotation, getAnnotationColorConfig } from '../../../types/annotation';
import { icons } from '../../../icons';
import { escapeHtml } from '../utils';

export interface AnnotationsState {
  annotationsList: Annotation[];
  annotationsSearch: string;
  annotationsFilter: 'all' | 'current';
}

export function createAnnotationsState(): AnnotationsState {
  return {
    annotationsList: [],
    annotationsSearch: '',
    annotationsFilter: 'all',
  };
}

export function getAnnotationsViewHTML(
  state: AnnotationsState,
  icons: Record<string, string>,
  getFilteredCount: () => number,
  getContentHTML: () => string
): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="annotations">
        <span class="glass-command-tag-icon">${icons.highlighter}</span>
        <span class="glass-command-tag-label">批注</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="搜索批注..."
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-knowledge-filter">
      <button class="glass-filter-btn ${state.annotationsFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
      <button class="glass-filter-btn ${state.annotationsFilter === 'current' ? 'active' : ''}" data-filter="current">当前页面</button>
    </div>
    <div class="glass-body">
      <div class="glass-knowledge-content">
        ${getContentHTML()}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-knowledge-footer-info">
        ${getFilteredCount()} 条批注
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function normalizeUrlForAnnotation(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

export function getFilteredAnnotations(
  annotations: Annotation[],
  filter: 'all' | 'current',
  searchQuery: string,
  currentUrl: string
): Annotation[] {
  let filtered = annotations;

  // Filter by page
  if (filter === 'current') {
    const normalizedUrl = normalizeUrlForAnnotation(currentUrl);
    filtered = filtered.filter(a => a.url === normalizedUrl);
  }

  // Filter by search
  const query = searchQuery.toLowerCase();
  if (query) {
    filtered = filtered.filter(a =>
      a.highlightText.toLowerCase().includes(query) ||
      a.note?.toLowerCase().includes(query) ||
      a.pageTitle.toLowerCase().includes(query) ||
      a.aiResult?.content?.toLowerCase().includes(query)
    );
  }

  // Sort by creation date (newest first)
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function groupAnnotationsByDate(annotations: Annotation[]): Record<string, Annotation[]> {
  const groups: Record<string, Annotation[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const annotation of annotations) {
    const date = new Date(annotation.createdAt).toDateString();
    let label: string;

    if (date === today) {
      label = '今天';
    } else if (date === yesterday) {
      label = '昨天';
    } else {
      label = new Date(annotation.createdAt).toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(annotation);
  }

  return groups;
}

export function getAnnotationsContentHTML(
  annotations: Annotation[],
  filter: 'all' | 'current',
  searchQuery: string,
  currentUrl: string,
  icons: Record<string, string>
): string {
  const filteredAnnotations = getFilteredAnnotations(annotations, filter, searchQuery, currentUrl);

  if (filteredAnnotations.length === 0) {
    return `
      <div class="glass-knowledge-empty">
        <div class="glass-knowledge-empty-icon">${icons.highlighter}</div>
        <div class="glass-knowledge-empty-text">
          ${searchQuery ? '没有找到匹配的批注' : (filter === 'current' ? '当前页面没有批注' : '还没有批注')}
        </div>
        <div class="glass-knowledge-empty-hint">
          ${searchQuery ? '试试其他关键词' : '选择文本后点击高亮按钮添加批注'}
        </div>
      </div>
    `;
  }

  // Group by date
  const groups = groupAnnotationsByDate(filteredAnnotations);

  return Object.entries(groups).map(([date, items]) => `
    <div class="glass-knowledge-group">
      <div class="glass-knowledge-date"><span>${date}</span></div>
      <div class="glass-knowledge-entries">
        ${items.map(annotation => getAnnotationEntryHTML(annotation, icons)).join('')}
      </div>
    </div>
  `).join('');
}

export function getAnnotationEntryHTML(annotation: Annotation, icons: Record<string, string>): string {
  const colorConfig = getAnnotationColorConfig(annotation.color);
  const time = new Date(annotation.createdAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  let domain = '';
  try { domain = new URL(annotation.url).hostname; } catch {}

  const truncatedText = annotation.highlightText.length > 120
    ? annotation.highlightText.substring(0, 120) + '...'
    : annotation.highlightText;

  const hasNote = annotation.note && annotation.note.trim().length > 0;
  const hasAI = annotation.aiResult && annotation.aiResult.content;

  return `
    <div class="glass-knowledge-entry" data-id="${annotation.id}" data-url="${escapeHtml(annotation.url)}" style="border-left: 3px solid ${colorConfig.border}">
      <div class="glass-knowledge-entry-header">
        <span class="glass-knowledge-entry-type">
          <span class="glass-knowledge-entry-type-icon">${icons.highlighter}</span>
          批注
        </span>
        <span class="glass-knowledge-entry-time">${time}</span>
      </div>
      <div class="glass-knowledge-entry-content">${escapeHtml(truncatedText)}</div>
      ${hasNote ? `<div class="glass-knowledge-entry-note">${escapeHtml(annotation.note || '')}</div>` : ''}
      ${hasAI ? `
        <div class="glass-knowledge-entry-ai">
          <span class="glass-knowledge-entry-ai-badge">AI ${getAIResultTypeLabelLocal(annotation.aiResult?.type || 'translate')}</span>
          <span class="glass-knowledge-entry-ai-preview">${escapeHtml(annotation.aiResult?.content?.substring(0, 60) || '')}...</span>
        </div>
      ` : ''}
      <div class="glass-knowledge-entry-meta">
        <span class="glass-knowledge-entry-page" title="${escapeHtml(annotation.pageTitle)}">${escapeHtml(annotation.pageTitle || domain)}</span>
      </div>
      <button class="glass-knowledge-entry-delete" data-id="${annotation.id}" title="删除">&times;</button>
    </div>
  `;
}

// Local helper function (not exported to avoid conflict with KnowledgeView)
function getAIResultTypeLabelLocal(type: string): string {
  const labels: Record<string, string> = {
    translate: '翻译',
    explain: '解释',
    summarize: '总结',
    rewrite: '改写',
  };
  return labels[type] || type;
}
