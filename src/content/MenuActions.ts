import { MenuItem, MenuConfig, Message, DEFAULT_SCREENSHOT_CONFIG } from '../types';
import {
  callAI,
  callVisionAI,
  generateImage,
  getTranslatePrompt,
  getSummarizePrompt,
  getExplainPrompt,
  getRewritePrompt,
  getCodeExplainPrompt,
  getSummarizePagePrompt,
  getDescribeImagePrompt,
  getAskImagePrompt,
  OnChunkCallback,
} from '../utils/ai';
import { ScreenshotSelector, SelectionArea } from './ScreenshotSelector';
import type { CommandPalette } from './CommandPalette';

export interface ScreenshotFlowCallbacks {
  onToast: (message: string) => void;
}

export interface ExecuteAIOptions {
  translateTargetLanguage?: string;
  pageQuestion?: string;
  rewriteInstruction?: string;
  rewriteUseSelection?: boolean;
}

export class MenuActions {
  private selectedText: string = '';
  private config: MenuConfig;
  private screenshotSelector: ScreenshotSelector | null = null;
  private commandPalette: CommandPalette | null = null;
  private currentScreenshotDataUrl: string = '';
  private flowCallbacks: ScreenshotFlowCallbacks | null = null;

  constructor(config: MenuConfig) {
    this.config = config;
  }

  public setCommandPalette(palette: CommandPalette): void {
    this.commandPalette = palette;
  }

  public setSelectedText(text: string): void {
    this.selectedText = text;
  }

  public setConfig(config: MenuConfig): void {
    this.config = config;
  }

  public setFlowCallbacks(callbacks: ScreenshotFlowCallbacks): void {
    this.flowCallbacks = callbacks;
  }

  public async execute(
    item: MenuItem,
    onChunk?: OnChunkCallback,
    options: ExecuteAIOptions = {}
  ): Promise<{ type: string; result?: string; url?: string }> {
    switch (item.action) {
      case 'translate':
        return this.handleTranslate(onChunk, options);
      case 'summarize':
        return this.handleSummarize(onChunk, options);
      case 'explain':
        return this.handleExplain(onChunk);
      case 'rewrite':
        return this.handleRewrite(onChunk);
      case 'codeExplain':
        return this.handleCodeExplain(onChunk);
      case 'search':
        return this.handleSearch();
      case 'copy':
        return this.handleCopy();
      case 'sendToAI':
        return this.handleSendToAI();
      case 'aiChat':
        return this.handleAIChat();
      case 'summarizePage':
        return this.handleSummarizePage(onChunk, options);
      case 'contextChat':
        return this.handleContextChat();
      case 'browseTrail':
        return this.handleBrowseTrail();
      case 'screenshot':
        return this.handleScreenshotFlow();
      case 'settings':
        return this.handleSettings();
      default:
        return { type: 'error', result: 'Unknown action' };
    }
  }

  private async handleTranslate(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    if (!this.selectedText) {
      return { type: 'error', result: '请先选择要翻译的文字' };
    }

    return this.callAIAction('translate', this.selectedText, onChunk, options);
  }

  private async handleSummarize(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    if (!this.selectedText) {
      return { type: 'error', result: '请先选择要总结的文字' };
    }

    return this.callAIAction('summarize', this.selectedText, onChunk, options);
  }

  private async handleExplain(onChunk?: OnChunkCallback): Promise<{ type: string; result?: string }> {
    if (!this.selectedText) {
      return { type: 'error', result: '请先选择要解释的文字' };
    }

    return this.callAIAction('explain', this.selectedText, onChunk);
  }

  private async handleRewrite(onChunk?: OnChunkCallback): Promise<{ type: string; result?: string }> {
    if (!this.selectedText) {
      return { type: 'error', result: '请先选择要改写的文字' };
    }

    return this.callAIAction('rewrite', this.selectedText, onChunk);
  }

  private async handleCodeExplain(onChunk?: OnChunkCallback): Promise<{ type: string; result?: string }> {
    if (!this.selectedText) {
      return { type: 'error', result: '请先选择要解释的代码' };
    }

    return this.callAIAction('codeExplain', this.selectedText, onChunk);
  }

  private async handleSummarizePage(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    return this.callAIAction('summarizePage', document.body.innerText.slice(0, 10000), onChunk, options);
  }

  private async handleAskPage(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    const question = options.pageQuestion?.trim() || '';
    if (!question) {
      return { type: 'error', result: '请输入你想问的问题' };
    }
    const pageContent = document.body.innerText.slice(0, 10000);
    const prompt = `Webpage content:\n${pageContent}\n\nUser question:\n${question}`;
    return this.callAIAction('askPage', prompt, onChunk, options);
  }

  private async handleRewritePage(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    const validationError = this.validateAIConfig();
    if (validationError) {
      return { type: 'error', result: validationError };
    }

    const useSelection = options.rewriteUseSelection !== false;
    const selectionText = useSelection ? this.selectedText.trim() : '';
    const hasSelection = !!selectionText;

    const pageContent = document.body.innerText.trim().slice(0, 10000);
    const content = hasSelection ? selectionText.slice(0, 10000) : pageContent;

    if (!content) {
      return { type: 'error', result: '页面内容为空，无法改写' };
    }

    const instruction = options.rewriteInstruction?.trim();
    const systemPrompt = instruction
      ? `${getRewritePrompt()}\n\nUser instruction:\n${instruction}`
      : getRewritePrompt();

    const prompt = `Title: ${document.title}\nURL: ${window.location.href}\n\n${hasSelection ? 'Selected content' : 'Content'}:\n${content}`;

    try {
      const response = await callAI(prompt, systemPrompt, this.config, onChunk);

      if (response.success) {
        return { type: 'ai', result: response.result };
      }
      return { type: 'error', result: response.error || 'AI 请求失败' };
    } catch (error) {
      return { type: 'error', result: `请求失败: ${error}` };
    }
  }

  private async handleNotesPage(onChunk?: OnChunkCallback, options: ExecuteAIOptions = {}): Promise<{ type: string; result?: string }> {
    const pageContent = document.body.innerText.slice(0, 10000);
    return this.callAIAction('notesPage', pageContent, onChunk, options);
  }

  private async callAIAction(
    action: string,
    text: string,
    onChunk?: OnChunkCallback,
    options: ExecuteAIOptions = {}
  ): Promise<{ type: string; result?: string }> {
    const validationError = this.validateAIConfig();
    if (validationError) {
      return { type: 'error', result: validationError };
    }

    let systemPrompt: string;

    switch (action) {
      case 'translate':
        systemPrompt = getTranslatePrompt(options.translateTargetLanguage || this.config.preferredLanguage || 'zh-CN');
        break;
      case 'summarize':
        systemPrompt = getSummarizePrompt(this.config.summaryLanguage || 'auto');
        break;
      case 'explain':
        systemPrompt = getExplainPrompt();
        break;
      case 'rewrite':
        systemPrompt = getRewritePrompt();
        break;
      case 'codeExplain':
        systemPrompt = getCodeExplainPrompt();
        break;
      case 'summarizePage':
        systemPrompt = getSummarizePagePrompt(this.config.summaryLanguage || 'auto');
        break;
      case 'askPage':
        systemPrompt = `You are a web reading assistant. Answer the user's question using only the provided webpage content. If the answer is not present, say you cannot find it in the content. Be concise. When helpful, include short exact quotes from the content as evidence.`;
        break;
      case 'notesPage':
        systemPrompt = `You are a web page note-taking assistant. Convert the provided webpage content into a concise, highly actionable Markdown note with these sections:\n\n# Title\n# Summary\n# Key Points\n# Action Items\n# Notable Quotes\n# Tags\n\nKeep it practical and skimmable.`;
        break;
      default:
        return { type: 'error', result: 'Unknown AI action' };
    }

    try {
      const response = await callAI(text, systemPrompt, this.config, onChunk);

      if (response.success) {
        return { type: 'ai', result: response.result };
      } else {
        return { type: 'error', result: response.error || 'AI 请求失败' };
      }
    } catch (error) {
      return { type: 'error', result: `请求失败: ${error}` };
    }
  }

  private validateAIConfig(): string | null {
    const { apiProvider, apiKey, customApiUrl, customModel } = this.config;

    if (apiProvider === 'custom') {
      if (!customApiUrl) return '请在设置中配置自定义 API 地址';
      if (!customModel) return '请在设置中配置自定义模型名称';
    } else {
      // Standard providers need a key
      if (!apiKey) {
        const providerNames: Record<string, string> = {
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          gemini: 'Google Gemini',
          groq: 'Groq'
        };
        const name = providerNames[apiProvider] || apiProvider;
        return `请在设置中配置 ${name} API Key`;
      }
    }
    return null;
  }

  private handleSearch(): { type: string; url: string } {
    const query = encodeURIComponent(this.selectedText || '');
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, '_blank');
    return { type: 'redirect', url };
  }

  private handleCopy(): { type: string; result: string } {
    if (this.selectedText) {
      navigator.clipboard.writeText(this.selectedText);
      return { type: 'success', result: '已复制到剪贴板' };
    }
    return { type: 'error', result: '没有选中的文字' };
  }

  private handleSendToAI(): { type: string; url: string } {
    const text = encodeURIComponent(this.selectedText || '');
    const url = `https://chat.openai.com/?q=${text}`;
    window.open(url, '_blank');
    return { type: 'redirect', url };
  }

  private handleAIChat(): { type: string; url: string } {
    window.open('https://chat.openai.com/', '_blank');
    return { type: 'redirect', url: 'https://chat.openai.com/' };
  }

  private handleScreenshotFlow(): { type: string; result: string } {
    // Start the screenshot selection flow
    this.screenshotSelector = new ScreenshotSelector();
    this.screenshotSelector.show({
      onSelect: async (area: SelectionArea | null) => {
        await this.captureAndShowPanel(area);
      },
      onCancel: () => {
        this.flowCallbacks?.onToast('截图已取消');
      },
    });
    return { type: 'silent', result: '' };
  }

  private async captureAndShowPanel(area: SelectionArea | null): Promise<void> {
    try {
      // Capture the visible tab
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_VISIBLE_TAB',
      } as Message);

      if (!response?.success || !response.dataUrl) {
        this.flowCallbacks?.onToast('截图失败');
        return;
      }

      let finalDataUrl = response.dataUrl;

      // If area is specified, crop the image
      if (area) {
        finalDataUrl = await this.cropImage(response.dataUrl, area);
      }

      this.currentScreenshotDataUrl = finalDataUrl;

      // Show screenshot in CommandPalette
      if (this.commandPalette) {
        this.commandPalette.showScreenshot(finalDataUrl, {
          onSave: () => this.saveScreenshot(),
          onCopy: () => this.copyScreenshotToClipboard(),
          onAskAI: (question) => this.askAIAboutImage(question),
          onDescribe: () => this.describeImage(),
          onGenerateImage: (prompt) => this.generateImageFromPrompt(prompt),
          onClose: () => {
            // Cleanup handled in CommandPalette
          },
        });
      } else {
        this.flowCallbacks?.onToast('无法显示截图面板');
      }

    } catch (error) {
      this.flowCallbacks?.onToast(`截图失败: ${error}`);
    }
  }

  private async cropImage(dataUrl: string, area: SelectionArea): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Account for device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        canvas.width = area.width * dpr;
        canvas.height = area.height * dpr;

        ctx.drawImage(
          img,
          area.x * dpr,
          area.y * dpr,
          area.width * dpr,
          area.height * dpr,
          0,
          0,
          area.width * dpr,
          area.height * dpr
        );

        const screenshotConfig = this.config.screenshot || DEFAULT_SCREENSHOT_CONFIG;
        resolve(canvas.toDataURL('image/png', screenshotConfig.imageQuality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  private async saveScreenshot(): Promise<void> {
    try {
      const filename = `screenshot-${Date.now()}.png`;
      await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_IMAGE',
        payload: { dataUrl: this.currentScreenshotDataUrl, filename },
      } as Message);
      this.flowCallbacks?.onToast('截图已保存');
    } catch (error) {
      this.flowCallbacks?.onToast(`保存失败: ${error}`);
    }
  }

  private async copyScreenshotToClipboard(): Promise<void> {
    try {
      const response = await fetch(this.currentScreenshotDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      this.flowCallbacks?.onToast('已复制到剪贴板');
    } catch (error) {
      this.flowCallbacks?.onToast(`复制失败: ${error}`);
    }
  }

  private async askAIAboutImage(question: string): Promise<void> {
    if (!this.commandPalette) return;

    const validationError = this.validateAIConfig();
    if (validationError) {
      this.commandPalette.updateScreenshotResult(validationError);
      return;
    }

    this.commandPalette.updateScreenshotResult('AI 正在分析...', true);

    const prompt = getAskImagePrompt(question);
    const response = await callVisionAI(
      this.currentScreenshotDataUrl,
      prompt,
      this.config,
      (_chunk, fullText) => {
        this.commandPalette?.updateScreenshotResult(fullText, true);
      }
    );

    if (response.success && response.result) {
      this.commandPalette.updateScreenshotResult(response.result);
    } else {
      this.commandPalette.updateScreenshotResult(response.error || 'AI 请求失败');
    }
  }

  private async describeImage(): Promise<void> {
    if (!this.commandPalette) return;

    const validationError = this.validateAIConfig();
    if (validationError) {
      this.commandPalette.updateScreenshotResult(validationError);
      return;
    }

    this.commandPalette.updateScreenshotResult('AI 正在描述图片...', true);

    const prompt = getDescribeImagePrompt();
    const response = await callVisionAI(
      this.currentScreenshotDataUrl,
      prompt,
      this.config,
      (_chunk, fullText) => {
        this.commandPalette?.updateScreenshotResult(fullText, true);
      }
    );

    if (response.success && response.result) {
      this.commandPalette.updateScreenshotResult(response.result);
    } else {
      this.commandPalette.updateScreenshotResult(response.error || 'AI 请求失败');
    }
  }

  private async generateImageFromPrompt(prompt: string): Promise<void> {
    if (!this.commandPalette) return;

    const screenshotConfig = this.config.screenshot || DEFAULT_SCREENSHOT_CONFIG;

    if (!screenshotConfig.enableImageGen) {
      this.commandPalette.updateScreenshotResult('请先在设置中启用 AI 生图功能');
      return;
    }

    if (screenshotConfig.imageGenProvider === 'openai') {
      if (!this.config.apiKey) {
        this.commandPalette.updateScreenshotResult('使用 OpenAI 生图需要配置 API Key');
        return;
      }
    } else if (screenshotConfig.imageGenProvider === 'custom') {
      if (!screenshotConfig.customImageGenUrl) {
        this.commandPalette.updateScreenshotResult('请配置自定义生图 API 地址');
        return;
      }
    }

    this.commandPalette.updateScreenshotResult('正在生成图片...', true);

    // First describe the current image to get context
    const describeResponse = await callVisionAI(
      this.currentScreenshotDataUrl,
      '用简洁的英文描述这张图片的主要内容和风格特征，不超过100词。',
      this.config
    );

    const imageContext = describeResponse.success ? describeResponse.result : '';
    const fullPrompt = imageContext
      ? `Based on this context: "${imageContext}". User request: ${prompt}`
      : prompt;

    const response = await generateImage(fullPrompt, this.config, screenshotConfig);

    if (response.success && response.imageUrl) {
      this.commandPalette.updateScreenshotGeneratedImage(response.imageUrl);
    } else {
      this.commandPalette.updateScreenshotResult(response.error || '图像生成失败');
    }
  }

  // New feature handlers

  private handleContextChat(): { type: string; result: string } {
    return { type: 'contextChat', result: '' };
  }

  private handleBrowseTrail(): { type: string; result: string } {
    return { type: 'browseTrail', result: '' };
  }

  private handleSettings(): { type: string; result: string } {
    // Settings are handled directly in CommandPalette, this is a fallback
    return { type: 'silent', result: '' };
  }
}
