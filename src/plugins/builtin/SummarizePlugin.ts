// SummarizePlugin — handles summarize and summarizePage actions

import { icons } from '../../icons';
import { t } from '../../i18n';
import { getSummarizePrompt, getSummarizePagePrompt, abortAllRequests, OnChunkCallback } from '../../utils/ai';
import { extractPageContent } from '../../utils/pageContent';
import type { Plugin, CommandContributor, SettingsContributor, PluginContext } from '../types';
import type { MenuItem, MenuConfig } from '../../types';
import type { CommandPalette } from '../../content/CommandPalette';

export class SummarizePlugin implements Plugin, CommandContributor, SettingsContributor {
  readonly id = 'summarize';
  readonly name = 'Summarize';
  readonly description = 'plugin.summarize.description';
  readonly icon = icons.summarize;
  readonly menuItemIds = ['summarize', 'summarizePage'] as const;

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
    if (action === 'summarize') {
      void this.runSummarize(selectedText);
      return true;
    }
    if (action === 'summarizePage') {
      void this.runSummarizePage();
      return true;
    }
    return false;
  }

  // ---- Summarize selected text ----

  private async runSummarize(text: string): Promise<void> {
    if (!text) {
      this.ctx.showToast(t('validate.selectTextToSummarize'));
      return;
    }

    const config = this.ctx.getConfig();
    const cp = this.ctx.getCommandPalette() as CommandPalette;
    const item: MenuItem = {
      id: 'summarize', action: 'summarize',
      label: t('menu.summarize'), icon: icons.summarize,
      enabled: true, order: 0,
    };

    cp.setActiveCommand(item);
    const restored = cp.showAIResult(item.label, {
      onStop: () => abortAllRequests(),
      onSaveToAnnotation: (origText: string, content: string, thinking?: string, actionType?: string) => {
        (this.ctx.getCommandPalette() as any).__pluginManager?.emit('annotation:saveFromAI', {
          originalText: origText, content, thinking, actionType,
        });
      },
    }, {
      originalText: text,
      resultType: 'general' as const,
      iconHtml: item.icon,
      actionType: 'summarize',
      sourceUrl: window.location.href,
      sourceTitle: document.title,
    });

    const streamKey = cp.getCurrentStreamKey();
    if (restored) return;

    const onChunk: OnChunkCallback | undefined = config.useStreaming
      ? (chunk: string, fullText: string, thinking?: string) => {
          cp.streamUpdate(chunk, fullText, thinking, streamKey || undefined);
        }
      : undefined;

    const systemPrompt = getSummarizePrompt(config.summaryLanguage || 'auto');
    const result = await this.ctx.ai.call(text, systemPrompt, onChunk);

    if (result.success) {
      cp.updateAIResult(result.result || '', result.thinking, streamKey || undefined, result.usage);
    } else {
      cp.updateAIResult(result.error || t('content.unknownError'), undefined, streamKey || undefined);
    }
  }

  // ---- Summarize page ----

  private async runSummarizePage(): Promise<void> {
    const config = this.ctx.getConfig();
    const cp = this.ctx.getCommandPalette() as CommandPalette;
    const item: MenuItem = {
      id: 'summarizePage', action: 'summarizePage',
      label: t('menu.summarizePage'), icon: icons.summarize,
      enabled: true, order: 0,
    };

    const pageContent = extractPageContent();

    // onRefresh handler for re-running the summarization
    const onRefresh = async () => {
      cp.setActiveCommand(item);
      cp.showAIResult(item.label, {
        onStop: () => abortAllRequests(),
        onRefresh,
      }, {
        originalText: pageContent,
        resultType: 'general' as const,
        iconHtml: item.icon,
        actionType: 'summarizePage',
        sourceUrl: window.location.href,
        sourceTitle: document.title,
      });

      const refreshStreamKey = cp.getCurrentStreamKey();
      const cfg = this.ctx.getConfig();

      const onChunk: OnChunkCallback | undefined = cfg.useStreaming
        ? (chunk: string, fullText: string, thinking?: string) => {
            cp.streamUpdate(chunk, fullText, thinking, refreshStreamKey || undefined);
          }
        : undefined;

      const systemPrompt = getSummarizePagePrompt(cfg.summaryLanguage || 'auto');
      const result = await this.ctx.ai.call(pageContent, systemPrompt, onChunk);

      if (result.success) {
        cp.updateAIResult(result.result || '', result.thinking, refreshStreamKey || undefined, result.usage);
      } else {
        cp.updateAIResult(result.error || t('content.unknownError'), undefined, refreshStreamKey || undefined);
      }
    };

    cp.setActiveCommand(item);
    const restored = cp.showAIResult(item.label, {
      onStop: () => abortAllRequests(),
      onRefresh,
      onSaveToAnnotation: (origText: string, content: string, thinking?: string, actionType?: string) => {
        (this.ctx.getCommandPalette() as any).__pluginManager?.emit('annotation:saveFromAI', {
          originalText: origText, content, thinking, actionType,
        });
      },
    }, {
      originalText: pageContent,
      resultType: 'general' as const,
      iconHtml: item.icon,
      actionType: 'summarizePage',
      sourceUrl: window.location.href,
      sourceTitle: document.title,
    });

    const streamKey = cp.getCurrentStreamKey();
    if (restored) return;

    const onChunk: OnChunkCallback | undefined = config.useStreaming
      ? (chunk: string, fullText: string, thinking?: string) => {
          cp.streamUpdate(chunk, fullText, thinking, streamKey || undefined);
        }
      : undefined;

    const systemPrompt = getSummarizePagePrompt(config.summaryLanguage || 'auto');
    const result = await this.ctx.ai.call(pageContent, systemPrompt, onChunk);

    if (result.success) {
      cp.updateAIResult(result.result || '', result.thinking, streamKey || undefined, result.usage);
    } else {
      cp.updateAIResult(result.error || t('content.unknownError'), undefined, streamKey || undefined);
    }
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.summaryOutputLanguage')}</div>
        <div class="glass-form-group">
          <select class="glass-select" id="summary-lang-select">
            <option value="auto"${config.summaryLanguage === 'auto' ? ' selected' : ''}>${t('settings.summaryAutoDetect')}</option>
            <option value="zh-CN"${config.summaryLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
            <option value="zh-TW"${config.summaryLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
            <option value="en"${config.summaryLanguage === 'en' ? ' selected' : ''}>English</option>
            <option value="ja"${config.summaryLanguage === 'ja' ? ' selected' : ''}>日本語</option>
          </select>
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const select = shadowRoot.querySelector('#summary-lang-select') as HTMLSelectElement | null;
    select?.addEventListener('change', () => {
      tempConfig.summaryLanguage = select.value;
      onChange();
    });
  }
}
