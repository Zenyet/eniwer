import { appendToShadow, removeFromShadow } from './ShadowHost';
import { icons } from '../icons';

export interface ShowResultOptions {
  isLoading?: boolean;
  originalText?: string;
  type?: 'translate' | 'general';
  selectionRect?: DOMRect | null;
  iconHtml?: string;
  translateTargetLanguage?: string;
}

export class ResultPanel {
  private element: HTMLElement | null = null;
  private isLoading: boolean = false;
  private originalText: string = '';
  private currentTranslatedText: string = '';
  private isComparisonMode: boolean = false;
  private resultType: 'translate' | 'general' = 'general';
  private onStopCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private onTranslateLanguageChangeCallback: ((lang: string) => void) | null = null;
  private panelIconHtml: string = '';
  private translateTargetLanguage: string = 'zh-CN';
  private isMinimized: boolean = false;
  private minimizedSide: 'left' | 'right' | null = null;
  private restoreLeft: number = 0;
  private restoreTop: number = 0;
  private suppressRestoreClickUntil: number = 0;

  constructor() {
    this.handleClick = this.handleClick.bind(this);
  }

  public show(title: string, content: string, options: ShowResultOptions = {}): void {
    this.isLoading = options.isLoading || false;
    this.originalText = options.originalText || '';
    this.resultType = options.type || 'general';
    this.currentTranslatedText = content;
    this.isComparisonMode = false;
    if (typeof options.translateTargetLanguage === 'string' && options.translateTargetLanguage) {
      this.translateTargetLanguage = options.translateTargetLanguage;
    }
    if (options.iconHtml) {
      this.panelIconHtml = options.iconHtml;
      this.updateMinimizedIcon();
    }

    if (!this.element) {
      this.createPanel(title);
      this.positionPanel(options.selectionRect || null);
    } else {
      // If panel exists, just update title and content
      const titleEl = this.element.querySelector('.thecircle-result-title');
      if (titleEl) titleEl.textContent = title;
    }

    if (this.isLoading) {
      this.renderLoading();
    } else {
      this.renderContent();
    }

    this.ensureHeaderActions();
    this.ensureFooterActions();
    this.setupScrollIndicators();
  }

  public getContentElement(): HTMLElement | null {
    return (this.element?.querySelector('.thecircle-result-content') as HTMLElement | null) || null;
  }

  public update(content: string): void {
    this.isLoading = false;
    this.currentTranslatedText = content;
    if (this.element) {
      this.renderContent();
      this.ensureHeaderActions();
      this.ensureFooterActions();
      this.setupScrollIndicators();
    }
  }

  public streamUpdate(_chunk: string, fullText: string): void {
    this.isLoading = true;
    this.currentTranslatedText = fullText;
    if (this.element) {
      this.renderContent();
      this.ensureHeaderActions();
      this.ensureFooterActions();
    }
  }

  public hide(): void {
    if (this.element) {
      this.element.classList.add('thecircle-fade-out');
      const elToRemove = this.element;
      setTimeout(() => {
        removeFromShadow(elToRemove);
        if (this.element === elToRemove) {
          this.element = null;
        }
        this.onCloseCallback?.();
      }, 200);
    }
  }

  public setOnStop(callback: () => void): void {
    this.onStopCallback = callback;
  }

  public setOnClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  public setOnTranslateLanguageChange(callback: (lang: string) => void): void {
    this.onTranslateLanguageChangeCallback = callback;
  }

  private createPanel(title: string): void {
    this.element = document.createElement('div');
    this.element.className = 'thecircle-result-panel';
    
    this.element.innerHTML = `
      <div class="thecircle-result-header">
        <span class="thecircle-result-title">${title}</span>
        <div class="thecircle-result-header-actions">
          <div class="thecircle-result-header-extra"></div>
          <button class="thecircle-result-close">×</button>
        </div>
      </div>
      <div class="thecircle-result-content-wrapper">
        <div class="thecircle-result-content"></div>
      </div>
      <div class="thecircle-result-actions"></div>
      <div class="thecircle-minimized-content"></div>
    `;

    appendToShadow(this.element);

    const closeBtn = this.element.querySelector('.thecircle-result-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.hide();
    });

    this.setupDragBehavior();
    this.updateMinimizedIcon();

    const minimizedContent = this.element.querySelector('.thecircle-minimized-content');
    minimizedContent?.addEventListener('click', (e) => {
      if (!this.isMinimized) return;
      if (Date.now() < this.suppressRestoreClickUntil) return;
      e.stopPropagation();
      e.preventDefault();
      this.restore();
    });
  }

  private positionPanel(selectionRect: DOMRect | null): void {
    if (!this.element) return;

    const rect = this.element.getBoundingClientRect();
    let left: number;
    let top: number;

    if (selectionRect) {
      left = selectionRect.left + selectionRect.width / 2 - rect.width / 2;
      top = selectionRect.bottom + 15;

      if (top + rect.height > window.innerHeight - 20) {
        top = selectionRect.top - rect.height - 15;
      }
    } else {
      left = (window.innerWidth - rect.width) / 2;
      top = (window.innerHeight - rect.height) / 2;
    }

    // Adjust for multiple windows? 
    // For now, let them stack or just position based on selection.
    // If we have multiple windows, we might want to offset them slightly?
    // But usually they are triggered sequentially.

    if (left < 20) left = 20;
    if (left + rect.width > window.innerWidth - 20) {
      left = window.innerWidth - rect.width - 20;
    }
    if (top < 20) top = 20;
    if (top + rect.height > window.innerHeight - 20) {
      top = window.innerHeight - rect.height - 20;
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  private renderLoading(): void {
    if (!this.element) return;
    const contentEl = this.element.querySelector('.thecircle-result-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="thecircle-loading-container">
           <div class="thecircle-loading-row">
             <div class="thecircle-spinner"></div>
             <span class="thecircle-loading-text">正在思考...</span>
           </div>
         </div>
      `;
    }
  }

  private renderContent(): void {
    if (!this.element) return;
    
    const contentEl = this.element.querySelector('.thecircle-result-content');
    if (!contentEl) return;

    if (this.isComparisonMode && this.resultType === 'translate' && this.originalText) {
      contentEl.innerHTML = `
        <div class="thecircle-result-comparison split-view">
           <div class="thecircle-result-comparison-item">
             <div class="thecircle-result-comparison-label">原文</div>
             <div class="thecircle-result-comparison-content">${this.formatStreamContent(this.originalText)}</div>
           </div>
           <div class="thecircle-result-divider"></div>
           <div class="thecircle-result-comparison-item">
             <div class="thecircle-result-comparison-label">译文</div>
             <div class="thecircle-result-comparison-content">${this.formatStreamContent(this.currentTranslatedText)}</div>
           </div>
        </div>
      `;
      this.element.classList.add('comparison-mode');
    } else {
      contentEl.innerHTML = `
        <div class="thecircle-stream-content">${this.formatStreamContent(this.currentTranslatedText)}</div>
      `;
      this.element.classList.remove('comparison-mode');
    }
  }

  private formatStreamContent(text: string): string {
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  private ensureFooterActions(): void {
    if (!this.element) return;
    const actionsEl = this.element.querySelector('.thecircle-result-actions');
    if (!actionsEl) return;

    // Clear existing actions but keep order logic? 
    // Easier to rebuild or manage specifically.
    
    // Stop Button
    let stopBtn = actionsEl.querySelector('[data-action="stop"]');
    if (this.isLoading) {
      if (!stopBtn) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.createStopButtonHTML();
        stopBtn = tempDiv.firstElementChild;
        if (stopBtn) {
          actionsEl.insertBefore(stopBtn, actionsEl.firstChild);
          stopBtn.addEventListener('click', () => {
            // Note: This calls the callback. The controller should decide what to abort.
            // Ideally we should pass a specific requestId.
            this.isLoading = false;
            this.onStopCallback?.();
            stopBtn?.remove();
            this.ensureFooterActions();
          });
        }
      }
    } else {
      stopBtn?.remove();
    }

    // Compare Button
    let compareBtn = actionsEl.querySelector('.thecircle-compare-btn');
    if (this.resultType === 'translate' && this.originalText) {
      if (!compareBtn) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.createCompareButtonHTML();
        compareBtn = tempDiv.firstElementChild;
        if (compareBtn) {
           const copyBtn = actionsEl.querySelector('.thecircle-copy-btn');
           if (copyBtn) {
             actionsEl.insertBefore(compareBtn, copyBtn);
           } else {
             actionsEl.appendChild(compareBtn);
           }
           compareBtn.addEventListener('click', () => this.toggleComparisonMode());
        }
      }
      if (this.isComparisonMode) {
        compareBtn?.classList.add('active');
      } else {
        compareBtn?.classList.remove('active');
      }
    } else {
      compareBtn?.remove();
    }

    // Copy Button
    let copyBtn = actionsEl.querySelector('.thecircle-copy-btn');
    if (!copyBtn) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.createCopyButtonHTML();
      copyBtn = tempDiv.firstElementChild;
      if (copyBtn) {
        actionsEl.appendChild(copyBtn);
      }
    }
    
    // Always update copy button listener
    const newCopyBtn = copyBtn!.cloneNode(true) as HTMLButtonElement;
    newCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.currentTranslatedText);
      this.showCopyFeedback(newCopyBtn);
    });
    copyBtn!.replaceWith(newCopyBtn);
  }

  private ensureHeaderActions(): void {
    if (!this.element) return;
    const headerExtra = this.element.querySelector('.thecircle-result-header-extra') as HTMLElement | null;
    if (!headerExtra) return;

    if (!(this.resultType === 'translate' && this.originalText)) {
      headerExtra.innerHTML = '';
      return;
    }

    let langSelect = headerExtra.querySelector('.thecircle-translate-lang-select') as HTMLSelectElement | null;
    if (!langSelect) {
      headerExtra.innerHTML = this.createTranslateLanguageSelectHTML();
      langSelect = headerExtra.querySelector('.thecircle-translate-lang-select') as HTMLSelectElement | null;
    }

    if (!langSelect) return;
    if (langSelect.value !== this.translateTargetLanguage) {
      langSelect.value = this.translateTargetLanguage;
    }
    langSelect.disabled = false;
    langSelect.onchange = () => {
      const nextLang = langSelect?.value;
      if (!nextLang || nextLang === this.translateTargetLanguage) return;
      this.translateTargetLanguage = nextLang;
      this.onTranslateLanguageChangeCallback?.(nextLang);
    };
  }

  private createTranslateLanguageSelectHTML(): string {
    const languages: Array<{ value: string; label: string }> = [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'zh-TW', label: '繁体中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'ko', label: '한국어' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
      { value: 'de', label: 'Deutsch' },
    ];

    const optionsHtml = languages
      .map(({ value, label }) => {
        const selected = value === this.translateTargetLanguage ? ' selected' : '';
        return `<option value="${value}"${selected}>${label}</option>`;
      })
      .join('');

    return `<select class="thecircle-translate-lang-select" title="翻译目标语言">${optionsHtml}</select>`;
  }

  private toggleComparisonMode(): void {
    this.isComparisonMode = !this.isComparisonMode;
    this.renderContent();
    this.ensureFooterActions();
  }

  private createStopButtonHTML(): string {
    return `
      <button class="thecircle-stop-btn" data-action="stop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12" rx="2"></rect>
        </svg>
        终止
      </button>
    `;
  }

  private createCompareButtonHTML(): string {
    return `
      <button class="thecircle-compare-btn" title="显示原文">
        <span class="thecircle-compare-btn-icon">${icons.columns}</span>
        <span>对比</span>
      </button>
    `;
  }

  private createCopyButtonHTML(): string {
    return `
      <button class="thecircle-copy-btn">
        <span class="thecircle-copy-btn-icon">${this.getCopyIcon()}</span>
        <span class="thecircle-copy-btn-text">复制</span>
      </button>
    `;
  }

  private getCopyIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
  }

  private getCheckIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  }

  private showCopyFeedback(btn: HTMLButtonElement): void {
    const iconEl = btn.querySelector('.thecircle-copy-btn-icon');
    const textEl = btn.querySelector('.thecircle-copy-btn-text');

    if (iconEl && textEl) {
      btn.classList.add('copied');
      iconEl.innerHTML = this.getCheckIcon();
      textEl.textContent = '已复制';

      setTimeout(() => {
        btn.classList.remove('copied');
        iconEl.innerHTML = this.getCopyIcon();
        textEl.textContent = '复制';
      }, 1500);
    }
  }

  private setupDragBehavior(): void {
    if (!this.element) return;
    const header = this.element.querySelector('.thecircle-result-header') as HTMLElement | null;
    const minimizedContent = this.element.querySelector('.thecircle-minimized-content') as HTMLElement | null;
    if (!header && !minimizedContent) return;

    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.thecircle-result-close')) return;
      if ((e.target as HTMLElement).closest('.thecircle-translate-lang-select')) return;
      e.stopPropagation();
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.element!.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      if (this.isMinimized && this.minimizedSide === 'right') {
        this.element!.style.right = '';
        this.element!.style.left = `${rect.left}px`;
      }
      header?.style && (header.style.cursor = 'grabbing');
      minimizedContent?.style && (minimizedContent.style.cursor = 'grabbing');
      if (this.isMinimized) {
        this.element?.classList.add('thecircle-minimized-dragging');
      }
      e.preventDefault();
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !this.element) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) hasMoved = true;
      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const rect = this.element.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (this.isMinimized) {
        if (newLeft < 0) newLeft = 0;
        if (newLeft + rect.width > windowWidth) newLeft = windowWidth - rect.width;
        if (newTop < 0) newTop = 0;
        if (newTop + rect.height > windowHeight) newTop = windowHeight - rect.height;
      } else {
        if (newLeft + rect.width < 20) newLeft = 20 - rect.width;
        if (newLeft > windowWidth - 20) newLeft = windowWidth - 20;
        if (newTop < 0) newTop = 0;
        if (newTop > windowHeight - 20) newTop = windowHeight - 20;
      }

      this.element.style.left = `${newLeft}px`;
      this.element.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      if (header) header.style.cursor = 'move';
      if (minimizedContent) minimizedContent.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (hasMoved) {
        this.suppressRestoreClickUntil = Date.now() + 250;
      }
      this.element?.classList.remove('thecircle-minimized-dragging');

      if (!this.element) return;
      if (this.isMinimized) {
        const rect = this.element.getBoundingClientRect();
        const computedSide: 'left' | 'right' =
          rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
        const side = this.minimizedSide && !hasMoved ? this.minimizedSide : computedSide;
        this.minimize(side);
        return;
      }

      this.updateMinimizedState();
    };

    header?.addEventListener('mousedown', onMouseDown);
    minimizedContent?.addEventListener('mousedown', onMouseDown);
  }

  private setupScrollIndicators(): void {
    if (!this.element) return;
    const wrapper = this.element.querySelector('.thecircle-result-content-wrapper');
    const content = this.element.querySelector('.thecircle-result-content');

    if (wrapper && content) {
      const updateIndicators = () => {
        const { scrollTop, scrollHeight, clientHeight } = content as HTMLElement;
        const hasScrollTop = scrollTop > 5;
        const hasScrollBottom = scrollTop < scrollHeight - clientHeight - 5;
        wrapper.classList.toggle('has-scroll-top', hasScrollTop);
        wrapper.classList.toggle('has-scroll-bottom', hasScrollBottom);
      };
      content.addEventListener('scroll', updateIndicators);
      requestAnimationFrame(updateIndicators);
    }
  }

  private handleClick(e: MouseEvent): void {
    void e;
  }

  private updateMinimizedIcon(): void {
    if (!this.element) return;
    const minimizedContent = this.element.querySelector('.thecircle-minimized-content') as HTMLElement | null;
    if (!minimizedContent) return;
    minimizedContent.innerHTML = this.panelIconHtml || '';
  }

  private updateMinimizedState(): void {
    if (!this.element) return;
    const rect = this.element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const intersectsLeft = rect.left <= 0;
    const intersectsRight = rect.right >= windowWidth;

    if (intersectsLeft) {
      this.minimize('left');
      return;
    }
    if (intersectsRight) {
      this.minimize('right');
      return;
    }

    if (this.isMinimized) {
      const safeLeft = Math.min(Math.max(this.restoreLeft, 20), windowWidth - rect.width - 20);
      const safeTop = Math.min(Math.max(this.restoreTop, 20), window.innerHeight - rect.height - 20);
      this.restoreLeft = safeLeft;
      this.restoreTop = safeTop;
    }
  }

  private minimize(side: 'left' | 'right'): void {
    if (!this.element) return;
    const rect = this.element.getBoundingClientRect();
    if (!this.isMinimized) {
      this.restoreLeft = rect.left;
      this.restoreTop = rect.top;
    }

    this.isMinimized = true;
    this.minimizedSide = side;

    this.element.classList.add('thecircle-minimized');
    this.element.classList.remove('minimized-left', 'minimized-right');
    this.element.classList.add(side === 'left' ? 'minimized-left' : 'minimized-right');

    const ballSize = 48;
    const top = Math.min(Math.max(rect.top, 0), window.innerHeight - ballSize);
    if (side === 'left') {
      this.element.style.right = '';
      this.element.style.left = '0px';
    } else {
      this.element.style.left = '';
      this.element.style.right = '0px';
    }
    this.element.style.top = `${top}px`;
  }

  private restore(): void {
    if (!this.element) return;
    this.isMinimized = false;
    this.minimizedSide = null;
    this.element.classList.remove('thecircle-minimized', 'minimized-left', 'minimized-right');

    this.element.style.width = '';
    this.element.style.height = '';
    this.element.style.right = '';

    const rect = this.element.getBoundingClientRect();
    const safeLeft = Math.min(Math.max(this.restoreLeft, 20), window.innerWidth - rect.width - 20);
    const safeTop = Math.min(Math.max(this.restoreTop, 20), window.innerHeight - rect.height - 20);
    this.element.style.left = `${safeLeft}px`;
    this.element.style.top = `${safeTop}px`;
  }
}
