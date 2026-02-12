// Knowledge View - handles knowledge base display and management
import { Annotation, ANNOTATION_COLORS } from '../../../types/annotation';
import { SavedTask } from '../../../utils/taskStorage';
import { icons } from '../../../icons';
import { escapeHtml } from '../utils';

// Knowledge item - unified type for annotations and saved AI results
export interface KnowledgeItem {
  id: string;
  type: 'annotation' | 'ai-result';
  title: string;
  content: string;
  originalText?: string;
  url: string;
  pageTitle: string;
  createdAt: number;
  // For annotations
  color?: string;
  note?: string;
  aiResult?: { type: string; content: string; thinking?: string };
  // For AI results
  actionType?: string;
  thinking?: string;
}

export interface KnowledgeState {
  knowledgeItems: KnowledgeItem[];
  knowledgeSearch: string;
  knowledgeFilter: 'all' | 'annotations' | 'ai-results';
}

export function createKnowledgeState(): KnowledgeState {
  return {
    knowledgeItems: [],
    knowledgeSearch: '',
    knowledgeFilter: 'all',
  };
}

export function annotationToKnowledgeItem(annotation: Annotation): KnowledgeItem {
  return {
    id: `ann_${annotation.id}`,
    type: 'annotation',
    title: annotation.highlightText.substring(0, 50) + (annotation.highlightText.length > 50 ? '...' : ''),
    content: annotation.highlightText,
    url: annotation.url,
    pageTitle: annotation.pageTitle,
    createdAt: annotation.createdAt,
    color: annotation.color,
    note: annotation.note,
    aiResult: annotation.aiResult ? {
      type: annotation.aiResult.type,
      content: annotation.aiResult.content,
      thinking: annotation.aiResult.thinking,
    } : undefined,
  };
}

export function savedTaskToKnowledgeItem(task: SavedTask): KnowledgeItem {
  return {
    id: `task_${task.id}`,
    type: 'ai-result',
    title: task.title,
    content: task.content,
    originalText: task.originalText,
    url: task.sourceUrl || '',
    pageTitle: task.sourceTitle || '',
    createdAt: task.createdAt,
    actionType: task.actionType,
    thinking: task.thinking,
  };
}

export function getKnowledgeViewHTML(
  state: KnowledgeState,
  icons: Record<string, string>,
  getFilteredCount: () => number,
  getContentHTML: () => string
): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="knowledge">
        <span class="glass-command-tag-icon">${icons.library}</span>
        <span class="glass-command-tag-label">知识库</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder="搜索知识库..."
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-knowledge-filter">
      <button class="glass-filter-btn ${state.knowledgeFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
      <button class="glass-filter-btn ${state.knowledgeFilter === 'annotations' ? 'active' : ''}" data-filter="annotations">批注</button>
      <button class="glass-filter-btn ${state.knowledgeFilter === 'ai-results' ? 'active' : ''}" data-filter="ai-results">AI 结果</button>
    </div>
    <div class="glass-body">
      <div class="glass-knowledge-content">
        ${getContentHTML()}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-footer-content">
        <div class="glass-knowledge-footer-info">
          ${getFilteredCount()} 条记录
        </div>
        <button class="glass-footer-btn glass-btn-export-knowledge" title="导出">
          ${icons.download}
        </button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getFilteredKnowledgeItems(
  items: KnowledgeItem[],
  filter: 'all' | 'annotations' | 'ai-results',
  searchQuery: string
): KnowledgeItem[] {
  let filtered = items;

  // Filter by type
  if (filter === 'annotations') {
    filtered = filtered.filter(item => item.type === 'annotation');
  } else if (filter === 'ai-results') {
    filtered = filtered.filter(item => item.type === 'ai-result');
  }

  // Filter by search
  const query = searchQuery.toLowerCase();
  if (query) {
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query) ||
      item.pageTitle.toLowerCase().includes(query) ||
      item.note?.toLowerCase().includes(query) ||
      item.originalText?.toLowerCase().includes(query) ||
      item.aiResult?.content?.toLowerCase().includes(query)
    );
  }

  return filtered;
}

export function groupKnowledgeByDate(items: KnowledgeItem[]): Record<string, KnowledgeItem[]> {
  const groups: Record<string, KnowledgeItem[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const item of items) {
    const date = new Date(item.createdAt).toDateString();
    let label: string;

    if (date === today) {
      label = '今天';
    } else if (date === yesterday) {
      label = '昨天';
    } else {
      label = new Date(item.createdAt).toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(item);
  }

  return groups;
}

export function getKnowledgeContentHTML(
  items: KnowledgeItem[],
  filter: 'all' | 'annotations' | 'ai-results',
  searchQuery: string,
  icons: Record<string, string>
): string {
  const filteredItems = getFilteredKnowledgeItems(items, filter, searchQuery);

  if (filteredItems.length === 0) {
    return `
      <div class="glass-knowledge-empty">
        <div class="glass-knowledge-empty-icon">${icons.library}</div>
        <div class="glass-knowledge-empty-text">
          ${searchQuery ? '没有找到匹配的记录' : '知识库为空'}
        </div>
        <div class="glass-knowledge-empty-hint">
          ${searchQuery ? '试试其他关键词' : '批注和 AI 结果会自动保存到这里'}
        </div>
      </div>
    `;
  }

  // Group by date
  const groups = groupKnowledgeByDate(filteredItems);

  return Object.entries(groups).map(([date, groupItems]) => `
    <div class="glass-knowledge-group">
      <div class="glass-knowledge-date"><span>${date}</span></div>
      <div class="glass-knowledge-entries">
        ${groupItems.map(item => getKnowledgeItemHTML(item, icons)).join('')}
      </div>
    </div>
  `).join('');
}

export function getKnowledgeItemHTML(item: KnowledgeItem, icons: Record<string, string>): string {
  const time = new Date(item.createdAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let domain = '';
  try { domain = new URL(item.url).hostname; } catch {}

  const typeIcon = item.type === 'annotation' ? icons.highlighter : icons.sparkles;
  const typeLabel = item.type === 'annotation' ? '批注' : getActionTypeLabel(item.actionType);
  const colorStyle = item.color ? `border-left: 3px solid ${ANNOTATION_COLORS[item.color as keyof typeof ANNOTATION_COLORS]?.border || '#fbbf24'}` : '';

  const truncatedContent = item.content.length > 120
    ? item.content.substring(0, 120) + '...'
    : item.content;

  return `
    <div class="glass-knowledge-entry" data-id="${item.id}" data-type="${item.type}" data-url="${escapeHtml(item.url)}" style="${colorStyle}">
      <div class="glass-knowledge-entry-header">
        <span class="glass-knowledge-entry-type">
          <span class="glass-knowledge-entry-type-icon">${typeIcon}</span>
          ${typeLabel}
        </span>
        <span class="glass-knowledge-entry-time">${time}</span>
      </div>
      <div class="glass-knowledge-entry-content">${escapeHtml(truncatedContent)}</div>
      ${item.note ? `<div class="glass-knowledge-entry-note">${escapeHtml(item.note)}</div>` : ''}
      ${item.aiResult ? `
        <div class="glass-knowledge-entry-ai">
          <span class="glass-knowledge-entry-ai-badge">AI ${getAIResultTypeLabel(item.aiResult.type)}</span>
          <span class="glass-knowledge-entry-ai-preview">${escapeHtml(item.aiResult.content.substring(0, 60))}...</span>
        </div>
      ` : ''}
      <div class="glass-knowledge-entry-meta">
        <span class="glass-knowledge-entry-page" title="${escapeHtml(item.pageTitle)}">${escapeHtml(item.pageTitle || domain)}</span>
      </div>
      <button class="glass-knowledge-entry-delete" data-id="${item.id}" title="删除">&times;</button>
    </div>
  `;
}

export function getActionTypeLabel(actionType?: string): string {
  const labels: Record<string, string> = {
    translate: '翻译',
    summarize: '总结',
    explain: '解释',
    rewrite: '改写',
    summarizePage: '页面总结',
    codeExplain: '代码解释',
  };
  return labels[actionType || ''] || 'AI 结果';
}

export function getAIResultTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    translate: '翻译',
    explain: '解释',
    summarize: '总结',
    rewrite: '改写',
  };
  return labels[type] || type;
}

export function exportKnowledgeToJSON(items: KnowledgeItem[]): string {
  return JSON.stringify(items, null, 2);
}

export function exportKnowledgeToMarkdown(items: KnowledgeItem[]): string {
  let markdown = '# 知识库导出\n\n';

  const groups = groupKnowledgeByDate(items);

  for (const [date, groupItems] of Object.entries(groups)) {
    markdown += `## ${date}\n\n`;

    for (const item of groupItems) {
      const typeLabel = item.type === 'annotation' ? '批注' : getActionTypeLabel(item.actionType);
      markdown += `### ${typeLabel}\n\n`;
      markdown += `> ${item.content}\n\n`;

      if (item.note) {
        markdown += `**笔记:** ${item.note}\n\n`;
      }

      if (item.aiResult) {
        markdown += `**AI ${getAIResultTypeLabel(item.aiResult.type)}:** ${item.aiResult.content}\n\n`;
      }

      markdown += `*来源: [${item.pageTitle || item.url}](${item.url})*\n\n`;
      markdown += '---\n\n';
    }
  }

  return markdown;
}
