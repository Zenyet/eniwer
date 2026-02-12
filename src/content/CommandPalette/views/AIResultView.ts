// AI Result View - displays AI response results
import { AIResultData, AIResultCallbacks } from '../types';
import { escapeHtml, formatAIContent, getLoadingHTML, getSourceInfoHTML, getTranslateLanguageSelectHTML } from '../utils';

function getThinkingHTML(thinking: string | undefined): string {
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

export function getAIResultViewHTML(
  data: AIResultData,
  icons: Record<string, string>
): string {
  const isTranslate = data.resultType === 'translate';
  const isPageAction = data.actionType === 'summarizePage';

  return `
    <div class="glass-header glass-draggable">
      <div class="glass-header-left">
        <button class="glass-back-btn" title="返回">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="glass-title-icon">${data.iconHtml || ''}</div>
        <span class="glass-title">${escapeHtml(data.title)}</span>
      </div>
      <div class="glass-header-right">
        ${isTranslate ? getTranslateLanguageSelectHTML(data.translateTargetLanguage || 'zh-CN') : ''}
        ${isTranslate && data.originalText ? `
          <button class="glass-btn glass-btn-compare" title="对比原文">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="12" y1="3" x2="12" y2="21"></line>
            </svg>
          </button>
        ` : ''}
        ${isPageAction ? `
          <button class="glass-btn glass-btn-refresh" title="重新生成">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        ` : ''}
        <button class="glass-btn glass-btn-stop" title="停止" style="display: ${data.isLoading ? 'flex' : 'none'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
          </svg>
        </button>
        <button class="glass-btn glass-btn-copy" title="复制">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="glass-minimize-btn" title="最小化">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="glass-divider"></div>
    ${getSourceInfoHTML(data)}
    <div class="glass-body glass-ai-result-body">
      ${getThinkingHTML(data.thinking)}
      <div class="glass-ai-content" data-compare="false">
        ${data.isLoading && !data.content ? getLoadingHTML() : formatAIContent(data.content)}
      </div>
    </div>
  `;
}

export function updateAIResultContent(
  shadowRoot: ShadowRoot | null,
  data: AIResultData
): void {
  if (!shadowRoot || !data) return;

  const contentEl = shadowRoot.querySelector('.glass-ai-content');
  const stopBtn = shadowRoot.querySelector('.glass-btn-stop') as HTMLElement;
  const bodyEl = shadowRoot.querySelector('.glass-ai-result-body');

  // Update thinking section
  if (bodyEl) {
    let thinkingSection = bodyEl.querySelector('.glass-thinking-section');
    if (data.thinking) {
      if (!thinkingSection) {
        // Insert thinking section before content
        const thinkingHTML = getThinkingHTML(data.thinking);
        if (contentEl) {
          contentEl.insertAdjacentHTML('beforebegin', thinkingHTML);
          thinkingSection = bodyEl.querySelector('.glass-thinking-section');
          // Bind toggle event for newly created section
          if (thinkingSection) {
            const header = thinkingSection.querySelector('.glass-thinking-header');
            header?.addEventListener('click', () => {
              thinkingSection?.classList.toggle('collapsed');
            });
          }
        }
      } else {
        // Update existing thinking content
        const thinkingContent = thinkingSection.querySelector('.glass-thinking-content');
        if (thinkingContent) {
          thinkingContent.innerHTML = formatAIContent(data.thinking);
        }
      }
    }
  }

  if (contentEl) {
    const isCompare = contentEl.getAttribute('data-compare') === 'true';
    if (isCompare && data.originalText) {
      contentEl.innerHTML = `
        <div class="glass-compare-view">
          <div class="glass-compare-item">
            <div class="glass-compare-label">原文</div>
            <div class="glass-compare-content">${formatAIContent(data.originalText)}</div>
          </div>
          <div class="glass-compare-divider"></div>
          <div class="glass-compare-item">
            <div class="glass-compare-label">译文</div>
            <div class="glass-compare-content">${data.isLoading && !data.content ? getLoadingHTML() : formatAIContent(data.content)}</div>
          </div>
        </div>
      `;
    } else {
      contentEl.innerHTML = data.isLoading && !data.content
        ? getLoadingHTML()
        : formatAIContent(data.content);
    }
  }

  // Update stop button visibility based on loading state
  if (stopBtn) {
    stopBtn.style.display = data.isLoading ? 'flex' : 'none';
  }
}

export function toggleCompareMode(shadowRoot: ShadowRoot | null): boolean {
  if (!shadowRoot) return false;
  const contentEl = shadowRoot.querySelector('.glass-ai-content');
  if (contentEl) {
    const isCompare = contentEl.getAttribute('data-compare') === 'true';
    contentEl.setAttribute('data-compare', isCompare ? 'false' : 'true');

    // Update panel width for compare mode
    const panel = shadowRoot.querySelector('.glass-panel');
    panel?.classList.toggle('glass-panel-wide', !isCompare);

    return !isCompare;
  }
  return false;
}

export interface AIResultViewCallbacks {
  onBack: () => void;
  onMinimize: () => void;
  onStop: () => void;
  onCopy: () => void;
  onCompare: () => void;
  onRefresh: () => void;
  onLanguageChange: (lang: string) => void;
  handleDragStart: (e: MouseEvent) => void;
}

export function bindAIResultEvents(
  shadowRoot: ShadowRoot | null,
  data: AIResultData,
  callbacks: AIResultViewCallbacks
): () => void {
  if (!shadowRoot) return () => {};

  // Back button
  const backBtn = shadowRoot.querySelector('.glass-back-btn');
  backBtn?.addEventListener('click', callbacks.onBack);

  // Minimize button
  const minimizeBtn = shadowRoot.querySelector('.glass-minimize-btn');
  minimizeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onMinimize();
  });

  // Draggable header
  const header = shadowRoot.querySelector('.glass-draggable') as HTMLElement;
  if (header) {
    header.addEventListener('mousedown', callbacks.handleDragStart);
  }

  // Thinking section toggle
  const thinkingSection = shadowRoot.querySelector('.glass-thinking-section');
  const thinkingHeader = thinkingSection?.querySelector('.glass-thinking-header');
  thinkingHeader?.addEventListener('click', () => {
    thinkingSection?.classList.toggle('collapsed');
  });

  // Refresh button (for page actions like summarize)
  const refreshBtn = shadowRoot.querySelector('.glass-btn-refresh');
  refreshBtn?.addEventListener('click', callbacks.onRefresh);

  // Stop button
  const stopBtn = shadowRoot.querySelector('.glass-btn-stop');
  stopBtn?.addEventListener('click', callbacks.onStop);

  // Copy button
  const copyBtn = shadowRoot.querySelector('.glass-btn-copy');
  copyBtn?.addEventListener('click', callbacks.onCopy);

  // Compare button
  const compareBtn = shadowRoot.querySelector('.glass-btn-compare');
  compareBtn?.addEventListener('click', callbacks.onCompare);

  // Language select
  const langSelect = shadowRoot.querySelector('.glass-lang-select') as HTMLSelectElement;
  langSelect?.addEventListener('change', () => {
    callbacks.onLanguageChange(langSelect.value);
  });

  // Escape key handler
  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      callbacks.onBack();
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}
