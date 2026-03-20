// Screenshot Plugin — fully self-contained screenshot view with minimize support

import type { Plugin, ViewContributor, MinimizableContributor, SettingsContributor, MinimizedPluginData, PluginContext } from '../../plugins';
import type { ScreenshotData, ScreenshotCallbacks } from '../../content/CommandPalette/types';
import type { MenuConfig, ScreenshotConfig } from '../../types';
import { DEFAULT_SCREENSHOT_CONFIG } from '../../types';
import { t } from '../../i18n';
import { icons } from '../../icons';
import {
  getScreenshotViewHTML as getScreenshotViewHTMLFromController,
  renderScreenshotContent as renderScreenshotContentFromController,
  bindScreenshotViewEvents as bindScreenshotViewEventsFromController,
} from '../../content/CommandPalette/controllers';

export class ScreenshotPlugin implements Plugin, ViewContributor, MinimizableContributor, SettingsContributor {
  readonly id = 'screenshot';
  readonly name = 'Screenshot';
  readonly description = 'plugin.screenshot.description';
  readonly icon = icons.screenshot;
  readonly viewType = 'screenshot';

  private ctx!: PluginContext;

  // Screenshot state (moved from CommandPalette)
  private screenshotData: ScreenshotData | null = null;
  private screenshotCallbacks: ScreenshotCallbacks | null = null;
  private _screenshotStreamRAF: number | null = null;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.screenshotData = null;
    this.screenshotCallbacks = null;
    if (this._screenshotStreamRAF) {
      cancelAnimationFrame(this._screenshotStreamRAF);
      this._screenshotStreamRAF = null;
    }
  }

  // ========================================
  // ViewContributor
  // ========================================

  getViewHTML(): string {
    return getScreenshotViewHTMLFromController({
      screenshotData: this.screenshotData,
    });
  }

  bindEvents(_shadowRoot: ShadowRoot): void {
    const sr = this.ctx.getShadowRoot();
    if (!sr) return;

    bindScreenshotViewEventsFromController({
      handleDragStart: this.ctx.getHandleDragStart(),
      onClose: () => {
        if (this.screenshotData?.isLoading) {
          // Minimize instead of discarding
          const data = this.saveAsMinimized();
          if (data) {
            // Push minimized task via CP (using getCommandPalette for now)
            const cp = this.ctx.getCommandPalette() as { createPluginMinimizedTask?(data: MinimizedPluginData): void } | null;
            if (cp && typeof (cp as Record<string, unknown>).createPluginMinimizedTask === 'function') {
              (cp as unknown as { createPluginMinimizedTask(data: MinimizedPluginData): void }).createPluginMinimizedTask(data);
            }
          }
        }
        this.screenshotData = null;
        this.screenshotCallbacks?.onClose?.();
        this.screenshotCallbacks = null;
        this.ctx.ui.navigateToView('commands');
      },
      onCopyImage: () => {
        this.screenshotCallbacks?.onCopy?.();
      },
      onCopyResult: (button, text) => {
        navigator.clipboard.writeText(text);
        this.showCopyFeedback(button);
      },
      onDescribe: () => {
        if (!this.screenshotData) return;
        this.screenshotData.currentQuestion = t('screenshot.describeImage');
        this.screenshotData.result = undefined;
        this.screenshotData.isLoading = true;
        this.renderContent();
        this.screenshotCallbacks?.onDescribe?.();
      },
      onSave: () => {
        this.screenshotCallbacks?.onSave?.();
      },
      onStop: () => {
        if (this.screenshotData) {
          this.screenshotData.isLoading = false;
        }
        this.screenshotCallbacks?.onStop?.();
        this.renderContent();
      },
      onSubmitQuestion: (question, input) => {
        if (!this.screenshotData) return;
        this.screenshotData.currentQuestion = question;
        this.screenshotData.result = undefined;
        this.screenshotData.isLoading = true;
        this.renderContent();
        this.screenshotCallbacks?.onAskAI?.(question);
        input.value = '';
      },
      shadowRoot: sr,
    });

    // Escape key handler
    const keydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        document.removeEventListener('keydown', keydownHandler);
        if (this.screenshotData?.isLoading) {
          const data = this.saveAsMinimized();
          if (data) {
            const cp = this.ctx.getCommandPalette() as { createPluginMinimizedTask?(data: MinimizedPluginData): void } | null;
            if (cp && typeof (cp as Record<string, unknown>).createPluginMinimizedTask === 'function') {
              (cp as unknown as { createPluginMinimizedTask(data: MinimizedPluginData): void }).createPluginMinimizedTask(data);
            }
          }
        }
        this.screenshotData = null;
        this.screenshotCallbacks?.onClose?.();
        this.screenshotCallbacks = null;
        this.ctx.ui.navigateToView('commands');
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  // ========================================
  // MinimizableContributor
  // ========================================

  saveAsMinimized(): MinimizedPluginData | null {
    if (!this.screenshotData) return null;

    const data: MinimizedPluginData = {
      pluginId: this.id,
      title: t('screenshot.screenshotAnalysis'),
      iconHtml: icons.screenshot || icons.image,
      isLoading: !!this.screenshotData.isLoading,
      pluginData: {
        screenshotData: { ...this.screenshotData },
        screenshotCallbacks: this.screenshotCallbacks,
      },
    };

    this.screenshotData = null;
    this.screenshotCallbacks = null;

    return data;
  }

  restoreFromMinimized(data: MinimizedPluginData): void {
    const pd = data.pluginData as {
      screenshotData: ScreenshotData;
      screenshotCallbacks: ScreenshotCallbacks | null;
    };

    this.screenshotData = pd.screenshotData;
    this.screenshotCallbacks = pd.screenshotCallbacks;

    this.ctx.ui.setActiveCommand({
      id: 'screenshot',
      action: 'screenshot',
      label: t('menu.screenshot'),
      icon: '',
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('screenshot');
  }

  // ========================================
  // Public API (called by MenuActions via CP thin proxy)
  // ========================================

  public showScreenshot(dataUrl: string, callbacks?: ScreenshotCallbacks): void {
    this.screenshotData = {
      dataUrl,
      isLoading: false,
    };
    this.screenshotCallbacks = callbacks || null;

    this.ctx.ui.setActiveCommand({
      id: 'screenshot',
      action: 'screenshot',
      label: t('menu.screenshot'),
      icon: '',
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('screenshot');
  }

  public updateScreenshotResult(result: string, isLoading: boolean = false): void {
    if (this.screenshotData) {
      this.screenshotData.result = result;
      this.screenshotData.isLoading = isLoading;

      // When finished, save to history
      if (!isLoading && result && !result.startsWith('AI') && !result.includes(t('aiResult.configureHint')) && !result.includes(t('aiResult.requestFailed'))) {
        if (!this.screenshotData.history) this.screenshotData.history = [];
        this.screenshotData.history.push({
          question: this.screenshotData.currentQuestion || t('screenshot.describeImage'),
          answer: result,
        });
        this.screenshotData.currentQuestion = undefined;
      }

      // Throttle DOM updates during streaming via rAF
      if (isLoading) {
        if (!this._screenshotStreamRAF) {
          this._screenshotStreamRAF = requestAnimationFrame(() => {
            this._screenshotStreamRAF = null;
            this.renderContent();
          });
        }
      } else {
        if (this._screenshotStreamRAF) {
          cancelAnimationFrame(this._screenshotStreamRAF);
          this._screenshotStreamRAF = null;
        }
        this.renderContent();
      }
    } else {
      // If screenshot was minimized, update the minimized task badge
      this.ctx.minimizedTasks.findAndUpdate(
        this.id,
        () => true, // Match any screenshot task
        (task) => {
          task.content = result;
          task.isLoading = isLoading;
        }
      );
    }
  }

  public updateScreenshotGeneratedImage(imageUrl: string): void {
    if (this.screenshotData) {
      this.screenshotData.generatedImageUrl = imageUrl;
      this.screenshotData.isLoading = false;
      this.renderContent();
    }
  }

  // ========================================
  // SettingsContributor
  // ========================================

  getSettingsHTML(config: MenuConfig): string {
    const sc = config.screenshot || DEFAULT_SCREENSHOT_CONFIG;
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.screenshotSection')}</div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.saveToFile')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="save-to-file" ${sc.saveToFile ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.copyToClipboard')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="copy-to-clipboard" ${sc.copyToClipboard ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.aiAnalysis')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="enable-ai" ${sc.enableAI ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div class="glass-form-group">
          <label class="glass-form-label">${t('settings.defaultAIAction')}</label>
          <select class="glass-select" id="default-ai-action">
            <option value="none"${sc.defaultAIAction === 'none' ? ' selected' : ''}>${t('settings.actionNone')}</option>
            <option value="ask"${sc.defaultAIAction === 'ask' ? ' selected' : ''}>${t('settings.actionAsk')}</option>
            <option value="describe"${sc.defaultAIAction === 'describe' ? ' selected' : ''}>${t('settings.actionDescribe')}</option>
          </select>
        </div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.aiImageGen')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="enable-image-gen" ${sc.enableImageGen ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div id="image-gen-settings"${sc.enableImageGen ? '' : ' style="display: none"'}>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.imageGenService')}</label>
            <select class="glass-select" id="image-gen-provider">
              <option value="openai"${sc.imageGenProvider === 'openai' ? ' selected' : ''}>OpenAI DALL-E</option>
              <option value="custom"${sc.imageGenProvider === 'custom' ? ' selected' : ''}>${t('settings.custom')}</option>
            </select>
          </div>
          <div class="glass-form-group" id="custom-image-gen-url-group"${sc.imageGenProvider === 'custom' ? '' : ' style="display: none"'}>
            <label class="glass-form-label">${t('settings.customImageGenApi')}</label>
            <input type="text" class="glass-input-field" id="custom-image-gen-url" value="${sc.customImageGenUrl || ''}" placeholder="https://api.example.com/v1/images/generations">
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.imageSize')}</label>
            <select class="glass-select" id="image-size-select">
              <option value="1024x1024"${sc.imageSize === '1024x1024' ? ' selected' : ''}>1024 × 1024</option>
              <option value="1792x1024"${sc.imageSize === '1792x1024' ? ' selected' : ''}>${t('settings.imageSizeLandscape')}</option>
              <option value="1024x1792"${sc.imageSize === '1024x1792' ? ' selected' : ''}>${t('settings.imageSizePortrait')}</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const sc = tempConfig.screenshot || { ...DEFAULT_SCREENSHOT_CONFIG };

    const bindToggle = (id: string, handler: (checked: boolean) => void) => {
      const input = shadowRoot.querySelector(`#${id}`) as HTMLInputElement | null;
      input?.addEventListener('change', () => { handler(input.checked); onChange(); });
    };
    const bindSelect = (id: string, handler: (value: string) => void) => {
      const select = shadowRoot.querySelector(`#${id}`) as HTMLSelectElement | null;
      select?.addEventListener('change', () => { handler(select.value); onChange(); });
    };
    const bindText = (id: string, handler: (value: string) => void) => {
      const input = shadowRoot.querySelector(`#${id}`) as HTMLInputElement | null;
      input?.addEventListener('input', () => { handler(input.value); onChange(); });
    };

    bindToggle('save-to-file', (v) => { sc.saveToFile = v; tempConfig.screenshot = sc; });
    bindToggle('copy-to-clipboard', (v) => { sc.copyToClipboard = v; tempConfig.screenshot = sc; });
    bindToggle('enable-ai', (v) => { sc.enableAI = v; tempConfig.screenshot = sc; });
    bindSelect('default-ai-action', (v) => { sc.defaultAIAction = v as ScreenshotConfig['defaultAIAction']; tempConfig.screenshot = sc; });

    const imageGenSettings = shadowRoot.querySelector('#image-gen-settings') as HTMLElement | null;
    bindToggle('enable-image-gen', (v) => {
      sc.enableImageGen = v; tempConfig.screenshot = sc;
      if (imageGenSettings) imageGenSettings.style.display = v ? 'block' : 'none';
    });

    const customImageGenUrlGroup = shadowRoot.querySelector('#custom-image-gen-url-group') as HTMLElement | null;
    bindSelect('image-gen-provider', (v) => {
      sc.imageGenProvider = v as ScreenshotConfig['imageGenProvider']; tempConfig.screenshot = sc;
      if (customImageGenUrlGroup) customImageGenUrlGroup.style.display = v === 'custom' ? 'block' : 'none';
    });
    bindText('custom-image-gen-url', (v) => { sc.customImageGenUrl = v || undefined; tempConfig.screenshot = sc; });
    bindSelect('image-size-select', (v) => { sc.imageSize = v as ScreenshotConfig['imageSize']; tempConfig.screenshot = sc; });
  }

  // ========================================
  // Internal
  // ========================================

  private renderContent(): void {
    const sr = this.ctx.getShadowRoot();
    if (!sr || !this.screenshotData) return;
    renderScreenshotContentFromController(sr, this.screenshotData);
  }

  private showCopyFeedback(btn: HTMLButtonElement): void {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 1500);
  }
}
