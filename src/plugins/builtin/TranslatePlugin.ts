// TranslatePlugin — handles translate and translateInput actions

import { icons } from '../../icons';
import { t } from '../../i18n';
import { getTranslatePrompt, abortAllRequests, OnChunkCallback } from '../../utils/ai';
import { getTranslationHint } from '../../content/CommandPalette/utils';
import type { Plugin, CommandContributor, SettingsContributor, PluginContext } from '../types';
import type { MenuItem, MenuConfig } from '../../types';
import type { CommandPalette } from '../../content/CommandPalette';

export class TranslatePlugin implements Plugin, CommandContributor, SettingsContributor {
  readonly id = 'translate';
  readonly name = 'Translate';
  readonly description = 'plugin.translate.description';
  readonly icon = icons.translate;
  readonly menuItemIds = ['translate', 'translateInput'] as const;

  private ctx!: PluginContext;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {}

  // ---- CommandContributor ----

  getCommands(): MenuItem[] {
    return [];
  }

  handleCommand(action: string, selectedText: string): boolean {
    if (action === 'translate') {
      void this.runTranslateAction(selectedText);
      return true;
    }
    if (action === 'translateInput') {
      // translateInput is triggered from the command palette input field;
      // the text comes via the same selectedText parameter
      void this.runTranslateAction(selectedText);
      return true;
    }
    return false;
  }

  // ---- Core translate logic ----

  private async runTranslateAction(text: string): Promise<void> {
    if (!text) {
      this.ctx.showToast(t('validate.selectTextToTranslate'));
      return;
    }

    const config = this.ctx.getConfig();
    const cp = this.ctx.getCommandPalette() as CommandPalette;
    const translateItem: MenuItem = {
      id: 'translate', action: 'translate',
      label: t('menu.translate'), icon: icons.translate,
      enabled: true, order: 0,
    };

    let translateRunId = 0;

    cp.setActiveCommand(translateItem);
    cp.showAIResult(translateItem.label, {
      onStop: () => abortAllRequests(),
      onTranslateLanguageChange: (targetLang: string) => {
        void runTranslate(targetLang);
      },
      onSaveToAnnotation: (origText: string, content: string, thinking?: string, actionType?: string) => {
        this.ctx.events.on('command:before', () => {}); // no-op, event used below
        // Emit event so TheCircle can handle annotation saving
        (this.ctx.getCommandPalette() as any).__pluginManager?.emit('annotation:saveFromAI', {
          originalText: origText, content, thinking, actionType,
        });
      },
    }, {
      originalText: text,
      resultType: 'translate' as const,
      translateTargetLanguage: config.preferredLanguage || 'zh-CN',
      iconHtml: translateItem.icon,
      actionType: 'translate',
    });

    const streamKey = cp.getCurrentStreamKey();

    const runTranslate = async (targetLang: string) => {
      const runId = ++translateRunId;
      const cfg = this.ctx.getConfig();

      // Try non-AI translation providers first
      const translationProvider = cfg.translation?.provider || 'ai';
      if (translationProvider !== 'ai') {
        try {
          const customValue = translationProvider === 'deeplx'
            ? cfg.translation?.deeplxApiKey
            : cfg.translation?.customUrl;
          const response = await this.ctx.sendMessage({
            type: 'FREE_TRANSLATE',
            payload: { text, targetLang, provider: translationProvider, customUrl: customValue },
          }) as { success: boolean; result?: string; error?: string };

          if (runId !== translateRunId) return;
          if (response.success && response.result) {
            cp.streamUpdate('', response.result, undefined, streamKey || undefined);
            cp.updateAIResult(response.result, undefined, streamKey || undefined);
          } else {
            cp.updateAIResult(response.error || t('validate.translationFailed'), undefined, streamKey || undefined);
          }
          return;
        } catch (error) {
          if (runId !== translateRunId) return;
          cp.updateAIResult(t('validate.translationFailedWithError', { error: String(error) }), undefined, streamKey || undefined);
          return;
        }
      }

      // Legacy fallback: no API key and fallback not disabled
      const hasApiKey = !!cfg.apiKey;
      const fallbackEnabled = cfg.translationFallback?.enabled;
      if (!hasApiKey && fallbackEnabled !== false) {
        try {
          const response = await this.ctx.sendMessage({
            type: 'FREE_TRANSLATE',
            payload: { text, targetLang },
          }) as { success: boolean; result?: string; error?: string };

          if (runId !== translateRunId) return;
          if (response.success && response.result) {
            cp.streamUpdate('', response.result, undefined, streamKey || undefined);
            cp.updateAIResult(response.result, undefined, streamKey || undefined);
          } else {
            cp.updateAIResult(response.error || t('validate.translationFailed'), undefined, streamKey || undefined);
          }
          return;
        } catch (error) {
          if (runId !== translateRunId) return;
          cp.updateAIResult(t('validate.translationFailedWithError', { error: String(error) }), undefined, streamKey || undefined);
          return;
        }
      }

      // AI translation
      const onChunk: OnChunkCallback | undefined = cfg.useStreaming
        ? (chunk: string, fullText: string, thinking?: string) => {
            if (runId !== translateRunId) return;
            cp.streamUpdate(chunk, fullText, thinking, streamKey || undefined);
          }
        : undefined;

      const systemPrompt = getTranslatePrompt(targetLang);
      const result = await this.ctx.ai.call(text, systemPrompt, onChunk);

      if (runId !== translateRunId) return;
      if (result.success) {
        cp.updateAIResult(result.result || '', result.thinking, streamKey || undefined, result.usage);
      } else {
        cp.updateAIResult(result.error || t('content.unknownError'), undefined, streamKey || undefined);
      }
    };

    await runTranslate(config.preferredLanguage || 'zh-CN');
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.translationService')}</div>
        <div class="glass-form-group">
          <label class="glass-form-label">${t('settings.translationEngine')}</label>
          <select class="glass-select" id="translation-provider-select">
            <option value="ai"${(config.translation?.provider || 'ai') === 'ai' ? ' selected' : ''}>${t('settings.aiTranslation')}</option>
            <option value="google"${config.translation?.provider === 'google' ? ' selected' : ''}>${t('settings.googleTranslation')}</option>
            <option value="microsoft"${config.translation?.provider === 'microsoft' ? ' selected' : ''}>${t('settings.microsoftTranslation')}</option>
            <option value="deeplx"${config.translation?.provider === 'deeplx' ? ' selected' : ''}>DeepLX</option>
            <option value="custom"${config.translation?.provider === 'custom' ? ' selected' : ''}>${t('settings.customTranslation')}</option>
          </select>
        </div>
        <div class="glass-form-group" id="translation-deeplx-key-group" style="display: ${config.translation?.provider === 'deeplx' ? 'flex' : 'none'}">
          <label class="glass-form-label">DeepLX API Key</label>
          <input type="text" class="glass-input" id="translation-deeplx-key" value="${config.translation?.deeplxApiKey || ''}" placeholder="${t('settings.deeplxApiKeyPlaceholder')}">
        </div>
        <div class="glass-form-group" id="translation-custom-url-group" style="display: ${config.translation?.provider === 'custom' ? 'flex' : 'none'}">
          <label class="glass-form-label">${t('settings.customTranslationUrl')}</label>
          <input type="text" class="glass-input" id="translation-custom-url" value="${config.translation?.customUrl || ''}" placeholder="http://localhost:1188/translate">
        </div>
        <span class="glass-form-hint" id="translation-hint">${getTranslationHint(config.translation?.provider || 'ai')}</span>
      </div>
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.translateTargetLanguage')}</div>
        <div class="glass-form-group">
          <select class="glass-select" id="translate-lang-select">
            <option value="zh-CN"${config.preferredLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
            <option value="zh-TW"${config.preferredLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
            <option value="en"${config.preferredLanguage === 'en' ? ' selected' : ''}>English</option>
            <option value="ja"${config.preferredLanguage === 'ja' ? ' selected' : ''}>日本語</option>
            <option value="ko"${config.preferredLanguage === 'ko' ? ' selected' : ''}>한국어</option>
            <option value="es"${config.preferredLanguage === 'es' ? ' selected' : ''}>Español</option>
            <option value="fr"${config.preferredLanguage === 'fr' ? ' selected' : ''}>Français</option>
            <option value="de"${config.preferredLanguage === 'de' ? ' selected' : ''}>Deutsch</option>
          </select>
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const translationDeeplxKeyGroup = shadowRoot.querySelector('#translation-deeplx-key-group') as HTMLElement | null;
    const translationCustomUrlGroup = shadowRoot.querySelector('#translation-custom-url-group') as HTMLElement | null;
    const translationHint = shadowRoot.querySelector('#translation-hint') as HTMLElement | null;

    const providerSelect = shadowRoot.querySelector('#translation-provider-select') as HTMLSelectElement | null;
    providerSelect?.addEventListener('change', () => {
      const provider = providerSelect.value;
      tempConfig.translation = tempConfig.translation || { provider: provider as never };
      tempConfig.translation.provider = provider as never;
      if (translationDeeplxKeyGroup) translationDeeplxKeyGroup.style.display = provider === 'deeplx' ? 'flex' : 'none';
      if (translationCustomUrlGroup) translationCustomUrlGroup.style.display = provider === 'custom' ? 'flex' : 'none';
      if (translationHint) translationHint.textContent = getTranslationHint(provider);
      onChange();
    });

    const deeplxKeyInput = shadowRoot.querySelector('#translation-deeplx-key') as HTMLInputElement | null;
    deeplxKeyInput?.addEventListener('input', () => {
      tempConfig.translation = tempConfig.translation || { provider: 'deeplx' };
      tempConfig.translation.deeplxApiKey = deeplxKeyInput.value;
      onChange();
    });

    const customUrlInput = shadowRoot.querySelector('#translation-custom-url') as HTMLInputElement | null;
    customUrlInput?.addEventListener('input', () => {
      tempConfig.translation = tempConfig.translation || { provider: 'custom' };
      tempConfig.translation.customUrl = customUrlInput.value;
      onChange();
    });

    const langSelect = shadowRoot.querySelector('#translate-lang-select') as HTMLSelectElement | null;
    langSelect?.addEventListener('change', () => {
      tempConfig.preferredLanguage = langSelect.value;
      onChange();
    });
  }
}
