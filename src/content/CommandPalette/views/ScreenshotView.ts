// Screenshot View Module
import { ScreenshotData, ScreenshotCallbacks } from '../types';
import { escapeHtml } from '../utils';

export interface ScreenshotViewContext {
  shadowRoot: ShadowRoot | null;
  screenshotData: ScreenshotData | null;
  screenshotCallbacks: ScreenshotCallbacks | null;
  currentView: string;
  activeCommand: unknown;
  icons: Record<string, string>;
  handleDragStart: (e: MouseEvent) => void;
  renderCurrentView: (animate?: boolean, keepPosition?: boolean) => void;
  renderScreenshotContent: () => void;
  showToast: (message: string) => void;
  setScreenshotData: (data: ScreenshotData | null) => void;
  setScreenshotCallbacks: (callbacks: ScreenshotCallbacks | null) => void;
  setCurrentView: (view: string) => void;
  setActiveCommand: (cmd: unknown) => void;
}

export function getScreenshotViewHTML(
  screenshotData: ScreenshotData | null,
  icons: Record<string, string>,
  getContentHTML: () => string
): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="screenshot">
        <span class="glass-command-tag-icon">${icons.screenshot || icons.camera || ''}</span>
        <span class="glass-command-tag-label">截图</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input glass-screenshot-input"
        placeholder="输入问题，按回车询问 AI..."
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body glass-screenshot-body">
      <div class="glass-screenshot-preview">
        <img src="${screenshotData?.dataUrl || ''}" alt="Screenshot" />
      </div>
      <div class="glass-screenshot-content">
        ${getContentHTML()}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-screenshot-actions">
        <button class="glass-btn glass-btn-save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          保存
        </button>
        <button class="glass-btn glass-btn-copy-img">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          复制
        </button>
        <button class="glass-btn glass-btn-describe">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          描述
        </button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getScreenshotContentHTML(screenshotData: ScreenshotData | null): string {
  if (!screenshotData) return '';

  if (screenshotData.isLoading) {
    return `
      <div class="glass-loading">
        <div class="glass-loading-spinner"></div>
        <span>处理中...</span>
      </div>
    `;
  }

  if (screenshotData.generatedImageUrl) {
    return `
      <div class="glass-screenshot-result">
        <div class="glass-screenshot-generated-label">生成的图片</div>
        <img class="glass-screenshot-generated-img" src="${screenshotData.generatedImageUrl}" alt="Generated" />
        <div class="glass-screenshot-result-actions">
          <button class="glass-btn glass-btn-copy-result">复制图片</button>
          <button class="glass-btn glass-btn-save-result">保存图片</button>
        </div>
      </div>
    `;
  }

  if (screenshotData.result) {
    return `
      <div class="glass-screenshot-result">
        <div class="glass-screenshot-result-label">AI 分析结果</div>
        <div class="glass-screenshot-result-text">${escapeHtml(screenshotData.result)}</div>
        <div class="glass-screenshot-result-actions">
          <button class="glass-btn glass-btn-copy-result">复制结果</button>
        </div>
      </div>
    `;
  }

  return '';
}

export function bindScreenshotViewEvents(ctx: ScreenshotViewContext): () => void {
  if (!ctx.shadowRoot) return () => {};

  // Drag events on search area
  const searchArea = ctx.shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;
  if (searchArea) {
    searchArea.addEventListener('mousedown', ctx.handleDragStart);
  }

  // Command tag close button
  const closeBtn = ctx.shadowRoot.querySelector('.glass-command-tag-close');
  const handleClose = () => {
    ctx.setScreenshotData(null);
    ctx.screenshotCallbacks?.onClose?.();
    ctx.setScreenshotCallbacks(null);
    ctx.setActiveCommand(null);
    ctx.setCurrentView('commands');
    ctx.renderCurrentView(true, true);
  };
  closeBtn?.addEventListener('click', handleClose);

  // Save button
  const saveBtn = ctx.shadowRoot.querySelector('.glass-btn-save');
  const handleSave = () => ctx.screenshotCallbacks?.onSave?.();
  saveBtn?.addEventListener('click', handleSave);

  // Copy button
  const copyBtn = ctx.shadowRoot.querySelector('.glass-btn-copy-img');
  const handleCopy = () => ctx.screenshotCallbacks?.onCopy?.();
  copyBtn?.addEventListener('click', handleCopy);

  // Screenshot input - press Enter to ask AI
  const screenshotInput = ctx.shadowRoot.querySelector('.glass-screenshot-input') as HTMLInputElement;
  const handleInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !(e as KeyboardEvent & { isComposing: boolean }).isComposing) {
      e.preventDefault();
      const question = screenshotInput.value.trim();
      if (question && ctx.screenshotData) {
        ctx.setScreenshotData({ ...ctx.screenshotData, isLoading: true });
        ctx.renderScreenshotContent();
        ctx.screenshotCallbacks?.onAskAI?.(question);
        screenshotInput.value = '';
      }
    }
  };
  screenshotInput?.addEventListener('keydown', handleInputKeydown);
  // Focus the input
  setTimeout(() => screenshotInput?.focus(), 100);

  // Describe button
  const describeBtn = ctx.shadowRoot.querySelector('.glass-btn-describe');
  const handleDescribe = () => {
    if (ctx.screenshotData) {
      ctx.setScreenshotData({ ...ctx.screenshotData, isLoading: true });
      ctx.renderScreenshotContent();
      ctx.screenshotCallbacks?.onDescribe?.();
    }
  };
  describeBtn?.addEventListener('click', handleDescribe);

  // Copy result button
  const copyResultBtn = ctx.shadowRoot.querySelector('.glass-btn-copy-result');
  const handleCopyResult = () => {
    if (ctx.screenshotData?.result) {
      navigator.clipboard.writeText(ctx.screenshotData.result);
      ctx.showToast('已复制结果');
    }
  };
  copyResultBtn?.addEventListener('click', handleCopyResult);

  // Escape key handler
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && ctx.currentView === 'screenshot') {
      e.preventDefault();
      document.removeEventListener('keydown', handleKeydown);
      ctx.setScreenshotData(null);
      ctx.screenshotCallbacks?.onClose?.();
      ctx.setScreenshotCallbacks(null);
      ctx.setActiveCommand(null);
      ctx.setCurrentView('commands');
      ctx.renderCurrentView(true, true);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}
