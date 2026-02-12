// Command Palette Utility Functions
import { icons } from '../../icons';
import { AIResultData, MinimizedTask } from './types';
import { SavedTask } from '../../utils/taskStorage';

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format AI content with basic markdown support
 */
export function formatAIContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

/**
 * Get loading HTML
 */
export function getLoadingHTML(): string {
  return `
    <div class="glass-loading">
      <div class="glass-spinner"></div>
      <span>正在思考...</span>
    </div>
  `;
}

/**
 * Get thinking section HTML (collapsible)
 */
export function getThinkingSectionHTML(thinking: string | undefined): string {
  if (!thinking) return '';
  return `
    <div class="glass-thinking-section">
      <div class="glass-thinking-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>思考过程</span>
        <svg class="glass-thinking-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="glass-thinking-content">
        ${formatAIContent(thinking)}
      </div>
    </div>
  `;
}

/**
 * Format timestamp to relative time
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get translate language select HTML
 */
export function getTranslateLanguageSelectHTML(currentLang: string): string {
  const languages = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'zh-TW', label: '繁体中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
  ];

  const options = languages.map(({ value, label }) =>
    `<option value="${value}"${value === currentLang ? ' selected' : ''}>${label}</option>`
  ).join('');

  return `<select class="glass-lang-select">${options}</select>`;
}

/**
 * Get translation provider hint text
 */
export function getTranslationHint(provider: string): string {
  switch (provider) {
    case 'ai': return '使用配置的 AI 服务商进行翻译，效果最佳但需要 API Key';
    case 'google': return '使用 Google 翻译，免费，无需配置';
    case 'microsoft': return '使用微软翻译，免费，无需配置';
    case 'deeplx': return '使用 DeepLX 翻译服务，需要填写 API Key';
    case 'custom': return '自定义翻译 API，接口格式: POST { text, source_lang, target_lang }';
    default: return '';
  }
}

/**
 * Get API key hint text
 */
export function getAPIKeyHint(provider: string): string {
  if (provider === 'groq') return '使用 Groq 免费服务无需配置 API Key';
  if (provider === 'custom') return '如果你的 API 需要认证，请填写 API Key';
  return `请填写你的 ${provider.toUpperCase()} API Key`;
}

/**
 * Get default minimized task icon
 */
export function getDefaultMinimizedIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>`;
}

/**
 * Get action icon by action type
 */
export function getActionIcon(actionType: string): string {
  const iconMap: Record<string, string> = {
    translate: icons.translate,
    summarize: icons.summarize,
    summarizePage: icons.summarizePage,
    explain: icons.explain,
    rewrite: icons.rewrite,
    codeExplain: icons.codeExplain,
  };
  return iconMap[actionType] || icons.messageCircle;
}

/**
 * Get minimized task meta info
 */
export function getTaskMetaInfo(task: MinimizedTask): string {
  const parts: string[] = [];

  const timeAgo = formatTimeAgo(task.createdAt);
  parts.push(timeAgo);

  if (task.actionType === 'summarizePage') {
    if (task.sourceTitle) {
      parts.push(task.sourceTitle);
    } else if (task.sourceUrl) {
      try {
        parts.push(new URL(task.sourceUrl).hostname);
      } catch { /* ignore */ }
    }
  } else if (task.resultType === 'translate') {
    if (task.sourceUrl) {
      try {
        parts.push(new URL(task.sourceUrl).hostname);
      } catch { /* ignore */ }
    }
    if (task.originalText) {
      const preview = task.originalText.slice(0, 30) + (task.originalText.length > 30 ? '...' : '');
      parts.push(`"${preview}"`);
    }
  }

  if (task.isLoading) {
    parts.push('处理中');
  }

  return parts.join(' · ');
}

/**
 * Get saved task meta info
 */
export function getSavedTaskMetaInfo(task: SavedTask): string {
  const parts: string[] = [];

  const timeAgo = formatTimeAgo(task.savedAt);
  parts.push(timeAgo);

  if (task.actionType === 'summarizePage') {
    if (task.sourceTitle) {
      parts.push(task.sourceTitle);
    } else if (task.sourceUrl) {
      try {
        parts.push(new URL(task.sourceUrl).hostname);
      } catch { /* ignore */ }
    }
  } else if (task.resultType === 'translate') {
    if (task.sourceUrl) {
      try {
        parts.push(new URL(task.sourceUrl).hostname);
      } catch { /* ignore */ }
    }
    if (task.originalText) {
      const preview = task.originalText.slice(0, 30) + (task.originalText.length > 30 ? '...' : '');
      parts.push(`"${preview}"`);
    }
  }

  return parts.join(' · ');
}

/**
 * Get source info HTML for AI results
 */
export function getSourceInfoHTML(data: AIResultData): string {
  const isPageAction = data.actionType === 'summarizePage';
  const isTranslate = data.resultType === 'translate';

  if (!isPageAction && !isTranslate) return '';
  if (!data.sourceUrl && !data.sourceTitle && !data.originalText) return '';

  let titlePart = '';
  let metaPart = '';

  if (isPageAction) {
    const displayTitle = data.sourceTitle || (data.sourceUrl ? new URL(data.sourceUrl).hostname : '');
    if (data.sourceUrl) {
      titlePart = `<a class="glass-source-link" href="${escapeHtml(data.sourceUrl)}" target="_blank" title="${escapeHtml(data.sourceUrl)}">${escapeHtml(displayTitle)}</a>`;
    } else if (displayTitle) {
      titlePart = `<span class="glass-source-title">${escapeHtml(displayTitle)}</span>`;
    }
  } else if (isTranslate) {
    if (data.sourceUrl) {
      try {
        const hostname = new URL(data.sourceUrl).hostname;
        titlePart = `<span class="glass-source-title">${escapeHtml(hostname)}</span>`;
      } catch { /* ignore */ }
    }
  }

  if (data.createdAt) {
    metaPart = formatTimeAgo(data.createdAt);
  }

  if (!titlePart && !metaPart) return '';

  return `
    <div class="glass-source-info">
      <div class="glass-source-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </div>
      <div class="glass-source-content">
        ${titlePart}
        ${metaPart ? `<span class="glass-source-meta">${metaPart}</span>` : ''}
      </div>
    </div>
  `;
}
