import { icons } from '../../../icons';
import { t } from '../../../i18n';
import { ScreenshotData } from '../types';
import { escapeHtml } from '../utils';

export interface ScreenshotViewModel {
  screenshotData: ScreenshotData | null;
}

export interface ScreenshotEventDeps {
  handleDragStart: (e: MouseEvent) => void;
  onClose: () => void;
  onCopyImage: () => void;
  onCopyResult: (button: HTMLButtonElement, text: string) => void;
  onDescribe: () => void;
  onSave: () => void;
  onStop: () => void;
  onSubmitQuestion: (question: string, input: HTMLInputElement) => void;
  shadowRoot: ShadowRoot;
}

export function getScreenshotViewHTML({ screenshotData }: ScreenshotViewModel): string {
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="screenshot">
        <span class="glass-command-tag-icon">${icons.screenshot || icons.camera || ''}</span>
        <span class="glass-command-tag-label">${t('menu.screenshot')}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input glass-screenshot-input"
        placeholder="${t('screenshot.inputPlaceholder')}"
        autocomplete="off"
        spellcheck="false"
      />
      <button class="glass-header-btn glass-btn-stop glass-btn-screenshot-stop-header" title="${t('common.abort')}" style="display: ${screenshotData?.isLoading ? 'flex' : 'none'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12" rx="2"></rect>
        </svg>
      </button>
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body glass-screenshot-body">
      <div class="glass-screenshot-preview">
        <img src="${screenshotData?.dataUrl || ''}" alt="Screenshot" />
      </div>
      <div class="glass-screenshot-content">
        ${getScreenshotContentHTML(screenshotData)}
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
          ${t('common.save')}
        </button>
        <button class="glass-btn glass-btn-copy-img">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          ${t('common.copy')}
        </button>
        <button class="glass-btn glass-btn-describe">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          ${t('screenshot.describeBtn')}
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

  let html = '';

  if (screenshotData.history?.length) {
    for (const item of screenshotData.history) {
      html += `
        <div class="glass-screenshot-qa">
          <div class="glass-screenshot-question">${escapeHtml(item.question)}</div>
          <div class="glass-screenshot-answer">${escapeHtml(item.answer)}</div>
        </div>
      `;
    }
  }

  if (screenshotData.generatedImageUrl) {
    html += `
      <div class="glass-screenshot-result">
        <div class="glass-screenshot-generated-label">${t('screenshot.generatedImage')}</div>
        <img class="glass-screenshot-generated-img" src="${screenshotData.generatedImageUrl}" alt="Generated" />
        <div class="glass-screenshot-result-actions">
          <button class="glass-btn glass-btn-copy-result">${t('screenshot.copyImage')}</button>
          <button class="glass-btn glass-btn-save-result">${t('screenshot.saveImage')}</button>
        </div>
      </div>
    `;
    return html;
  }

  if (screenshotData.result) {
    html += `
      <div class="glass-screenshot-qa">
        <div class="glass-screenshot-question">${escapeHtml(screenshotData.currentQuestion || t('screenshot.describeImage'))}</div>
        <div class="glass-screenshot-answer">${escapeHtml(screenshotData.result)}</div>
        ${!screenshotData.isLoading ? `<div class="glass-screenshot-result-actions">
          <button class="glass-footer-btn glass-btn-copy-result" title="${t('common.copy')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>` : ''}
      </div>
    `;
    return html;
  }

  if (screenshotData.isLoading) {
    html += `
      <div class="glass-loading">
        <div class="glass-loading-spinner"></div>
        <span>${t('common.processing')}</span>
      </div>
    `;
  }

  return html;
}

export function renderScreenshotContent(shadowRoot: ShadowRoot, screenshotData: ScreenshotData | null): void {
  if (!screenshotData) return;
  const contentArea = shadowRoot.querySelector('.glass-screenshot-content');
  if (contentArea) {
    contentArea.innerHTML = getScreenshotContentHTML(screenshotData);
  }
  const stopHeader = shadowRoot.querySelector('.glass-btn-screenshot-stop-header') as HTMLElement | null;
  if (stopHeader) {
    stopHeader.style.display = screenshotData.isLoading ? 'flex' : 'none';
  }
}

export function bindScreenshotViewEvents({
  handleDragStart,
  onClose,
  onCopyImage,
  onCopyResult,
  onDescribe,
  onSave,
  onStop,
  onSubmitQuestion,
  shadowRoot,
}: ScreenshotEventDeps): void {
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;
  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', onClose);
  shadowRoot.querySelector('.glass-btn-save')?.addEventListener('click', onSave);
  shadowRoot.querySelector('.glass-btn-copy-img')?.addEventListener('click', onCopyImage);

  const screenshotInput = shadowRoot.querySelector('.glass-screenshot-input') as HTMLInputElement | null;
  screenshotInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      const question = screenshotInput.value.trim();
      if (question) {
        onSubmitQuestion(question, screenshotInput);
      }
    }
  });
  setTimeout(() => screenshotInput?.focus(), 100);

  shadowRoot.querySelector('.glass-btn-describe')?.addEventListener('click', onDescribe);
  shadowRoot.querySelector('.glass-btn-screenshot-stop-header')?.addEventListener('click', onStop);

  const contentArea = shadowRoot.querySelector('.glass-screenshot-content');
  contentArea?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.glass-btn-copy-result');
    if (!target) return;

    const qaBlock = target.closest('.glass-screenshot-qa');
    const answerEl = qaBlock?.querySelector('.glass-screenshot-answer');
    const text = answerEl?.textContent || '';
    if (text) {
      onCopyResult(target as HTMLButtonElement, text);
    }
  });
}
