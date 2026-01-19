import { icons } from '../icons';
import { MenuConfig, ScreenshotConfig, DEFAULT_SCREENSHOT_CONFIG } from '../types';

export interface ScreenshotPanelCallbacks {
  onSave: () => void;
  onCopy: () => void;
  onAskAI: (question: string) => void;
  onDescribe: () => void;
  onGenerateImage: (prompt: string) => void;
  onClose: () => void;
}

export class ScreenshotPanel {
  private panel: HTMLElement | null = null;
  private imageDataUrl: string = '';
  private callbacks: ScreenshotPanelCallbacks | null = null;
  private config: ScreenshotConfig = DEFAULT_SCREENSHOT_CONFIG;
  private isShowingInput: boolean = false;
  private inputMode: 'ask' | 'generate' = 'ask';

  constructor() {}

  public show(
    imageDataUrl: string,
    callbacks: ScreenshotPanelCallbacks,
    config?: ScreenshotConfig
  ): void {
    this.imageDataUrl = imageDataUrl;
    this.callbacks = callbacks;
    this.config = config || DEFAULT_SCREENSHOT_CONFIG;
    this.createPanel();
  }

  public hide(): void {
    if (this.panel) {
      this.panel.classList.add('thecircle-screenshot-panel-exit');
      setTimeout(() => {
        this.panel?.remove();
        this.panel = null;
      }, 200);
    }
  }

  public showLoading(title: string): void {
    if (!this.panel) return;

    const actionsArea = this.panel.querySelector('.thecircle-screenshot-actions');
    if (actionsArea) {
      actionsArea.innerHTML = `
        <div class="thecircle-screenshot-loading">
          <div class="thecircle-spinner"></div>
          <span>${title}</span>
        </div>
      `;
    }
  }

  public showResult(title: string, content: string): void {
    if (!this.panel) return;

    const actionsArea = this.panel.querySelector('.thecircle-screenshot-actions');
    if (actionsArea) {
      actionsArea.innerHTML = `
        <div class="thecircle-screenshot-result">
          <div class="thecircle-screenshot-result-header">${title}</div>
          <div class="thecircle-screenshot-result-content">${content}</div>
          <div class="thecircle-screenshot-result-actions">
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="copy-result">
              ${icons.copy}
              <span>复制</span>
            </button>
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="back">
              <span>返回</span>
            </button>
          </div>
        </div>
      `;

      // Add event listeners
      const copyBtn = actionsArea.querySelector('[data-action="copy-result"]');
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        const span = copyBtn.querySelector('span');
        if (span) {
          const originalText = span.textContent;
          span.textContent = '已复制!';
          setTimeout(() => {
            span.textContent = originalText;
          }, 1500);
        }
      });

      const backBtn = actionsArea.querySelector('[data-action="back"]');
      backBtn?.addEventListener('click', () => {
        this.resetActions();
      });
    }
  }

  public showGeneratedImage(imageUrl: string): void {
    if (!this.panel) return;

    const actionsArea = this.panel.querySelector('.thecircle-screenshot-actions');
    if (actionsArea) {
      actionsArea.innerHTML = `
        <div class="thecircle-screenshot-generated">
          <img src="${imageUrl}" alt="Generated image" class="thecircle-screenshot-generated-img" />
          <div class="thecircle-screenshot-result-actions">
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-primary" data-action="save-generated">
              ${icons.download}
              <span>保存</span>
            </button>
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="back">
              <span>返回</span>
            </button>
          </div>
        </div>
      `;

      // Add event listeners
      const saveBtn = actionsArea.querySelector('[data-action="save-generated"]');
      saveBtn?.addEventListener('click', async () => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `generated-${Date.now()}.png`;
        link.click();
      });

      const backBtn = actionsArea.querySelector('[data-action="back"]');
      backBtn?.addEventListener('click', () => {
        this.resetActions();
      });
    }
  }

  public streamUpdate(chunk: string, fullText: string): void {
    if (!this.panel) return;

    const resultContent = this.panel.querySelector('.thecircle-screenshot-result-content');
    if (resultContent) {
      resultContent.innerHTML = this.formatContent(fullText);
      resultContent.scrollTop = resultContent.scrollHeight;
    }
  }

  private formatContent(text: string): string {
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  private resetActions(): void {
    if (!this.panel) return;

    const actionsArea = this.panel.querySelector('.thecircle-screenshot-actions');
    if (actionsArea) {
      actionsArea.innerHTML = this.createActionsHTML();
      this.setupActionListeners();
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'thecircle-screenshot-panel';

    this.panel.innerHTML = `
      <div class="thecircle-screenshot-header">
        <span class="thecircle-screenshot-title">截图预览</span>
        <button class="thecircle-screenshot-close">${icons.x}</button>
      </div>
      <div class="thecircle-screenshot-preview">
        <img src="${this.imageDataUrl}" alt="Screenshot preview" />
      </div>
      <div class="thecircle-screenshot-actions">
        ${this.createActionsHTML()}
      </div>
    `;

    document.body.appendChild(this.panel);

    // Position panel in center
    this.positionPanel();

    // Setup event listeners
    const closeBtn = this.panel.querySelector('.thecircle-screenshot-close');
    closeBtn?.addEventListener('click', () => {
      this.hide();
      this.callbacks?.onClose();
    });

    this.setupActionListeners();

    // Handle ESC key
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        this.callbacks?.onClose();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  private createActionsHTML(): string {
    const buttons = [
      { action: 'save', icon: icons.download, label: '保存', primary: true },
      { action: 'copy', icon: icons.copy, label: '复制' },
    ];

    if (this.config.enableAI) {
      buttons.push(
        { action: 'ask', icon: icons.messageCircle, label: '问AI' },
        { action: 'describe', icon: icons.fileText, label: '描述图片' }
      );
    }

    if (this.config.enableImageGen) {
      buttons.push({ action: 'generate', icon: icons.sparkles, label: 'AI生图' });
    }

    return `
      <div class="thecircle-screenshot-btn-group">
        ${buttons.map(btn => `
          <button class="thecircle-screenshot-btn ${btn.primary ? 'thecircle-screenshot-btn-primary' : 'thecircle-screenshot-btn-secondary'}" data-action="${btn.action}">
            ${btn.icon}
            <span>${btn.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  private setupActionListeners(): void {
    if (!this.panel) return;

    const saveBtn = this.panel.querySelector('[data-action="save"]');
    saveBtn?.addEventListener('click', () => this.callbacks?.onSave());

    const copyBtn = this.panel.querySelector('[data-action="copy"]');
    copyBtn?.addEventListener('click', () => {
      this.callbacks?.onCopy();
      const span = copyBtn.querySelector('span');
      if (span) {
        const originalText = span.textContent;
        span.textContent = '已复制!';
        setTimeout(() => {
          span.textContent = originalText;
        }, 1500);
      }
    });

    const askBtn = this.panel.querySelector('[data-action="ask"]');
    askBtn?.addEventListener('click', () => this.showInputField('ask'));

    const describeBtn = this.panel.querySelector('[data-action="describe"]');
    describeBtn?.addEventListener('click', () => this.callbacks?.onDescribe());

    const generateBtn = this.panel.querySelector('[data-action="generate"]');
    generateBtn?.addEventListener('click', () => this.showInputField('generate'));
  }

  private showInputField(mode: 'ask' | 'generate'): void {
    if (!this.panel) return;

    this.inputMode = mode;
    this.isShowingInput = true;

    const actionsArea = this.panel.querySelector('.thecircle-screenshot-actions');
    if (actionsArea) {
      const placeholder = mode === 'ask'
        ? '输入你想问的问题...'
        : '输入生成提示词...';
      const submitLabel = mode === 'ask' ? '发送' : '生成';

      actionsArea.innerHTML = `
        <div class="thecircle-screenshot-input-area">
          <input
            type="text"
            class="thecircle-screenshot-input"
            placeholder="${placeholder}"
            autofocus
          />
          <div class="thecircle-screenshot-input-actions">
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-secondary" data-action="cancel-input">
              取消
            </button>
            <button class="thecircle-screenshot-btn thecircle-screenshot-btn-primary" data-action="submit-input">
              ${submitLabel}
            </button>
          </div>
        </div>
      `;

      const input = actionsArea.querySelector('.thecircle-screenshot-input') as HTMLInputElement;
      input?.focus();

      // Handle enter key
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitInput(input.value);
        }
      });

      const cancelBtn = actionsArea.querySelector('[data-action="cancel-input"]');
      cancelBtn?.addEventListener('click', () => this.resetActions());

      const submitBtn = actionsArea.querySelector('[data-action="submit-input"]');
      submitBtn?.addEventListener('click', () => this.submitInput(input.value));
    }
  }

  private submitInput(value: string): void {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    if (this.inputMode === 'ask') {
      this.callbacks?.onAskAI(trimmedValue);
    } else {
      this.callbacks?.onGenerateImage(trimmedValue);
    }
  }

  private positionPanel(): void {
    if (!this.panel) return;

    const rect = this.panel.getBoundingClientRect();
    const left = (window.innerWidth - rect.width) / 2;
    const top = (window.innerHeight - rect.height) / 2;

    this.panel.style.left = `${Math.max(20, left)}px`;
    this.panel.style.top = `${Math.max(20, top)}px`;
  }
}
