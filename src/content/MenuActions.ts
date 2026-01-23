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
import { ScreenshotPanel } from './ScreenshotPanel';

export interface ScreenshotFlowCallbacks {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export interface ExecuteAIOptions {
  translateTargetLanguage?: string;
}

export class MenuActions {
  private selectedText: string = '';
  private config: MenuConfig;
  private screenshotSelector: ScreenshotSelector | null = null;
  private screenshotPanel: ScreenshotPanel | null = null;
  private currentScreenshotDataUrl: string = '';
  private flowCallbacks: ScreenshotFlowCallbacks | null = null;

  constructor(config: MenuConfig) {
    this.config = config;
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
      case 'switchTab':
        return this.handleSwitchTab();
      case 'history':
        return this.handleHistory();
      case 'screenshot':
        return this.handleScreenshotFlow();
      case 'bookmark':
        return this.handleBookmark();
      case 'newTab':
        return this.handleNewTab();
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

  private async handleSwitchTab(): Promise<{ type: string; result?: string }> {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'GET_TABS',
      } as Message)) as { success?: boolean; tabs?: chrome.tabs.Tab[] };

      if (!response?.success || !response.tabs?.length) {
        return { type: 'error', result: '获取标签页失败' };
      }

      const tabs = response.tabs.filter((t) => typeof t.id === 'number');
      const candidates = tabs.filter((t) => !t.active);
      if (!candidates.length) {
        return { type: 'info', result: '当前窗口只有一个标签页' };
      }

      const hasLastAccessed = candidates.some((t) => typeof (t as unknown as { lastAccessed?: number }).lastAccessed === 'number');
      const sorted = hasLastAccessed
        ? [...candidates].sort((a, b) => {
            const aTime = (a as unknown as { lastAccessed?: number }).lastAccessed ?? 0;
            const bTime = (b as unknown as { lastAccessed?: number }).lastAccessed ?? 0;
            return bTime - aTime;
          })
        : candidates;

      const target = sorted[0];
      await chrome.runtime.sendMessage({ type: 'SWITCH_TAB', payload: target.id } as Message);
      const title = target.title || target.url || '标签页';
      return { type: 'success', result: `已切换到：${title}` };
    } catch {
      return { type: 'error', result: '获取标签页失败' };
    }
  }

  private handleHistory(): { type: string; url: string } {
    chrome.runtime.sendMessage({ type: 'OPEN_URL', payload: 'chrome://history' } as Message);
    return { type: 'redirect', url: 'chrome://history' };
  }

  private handleScreenshotFlow(): { type: string; result: string } {
    // Start the screenshot selection flow
    this.screenshotSelector = new ScreenshotSelector();
    this.screenshotSelector.show({
      onSelect: async (area: SelectionArea | null) => {
        await this.captureAndShowPanel(area);
      },
      onCancel: () => {
        this.flowCallbacks?.onToast('截图已取消', 'info');
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
        this.flowCallbacks?.onToast('截图失败', 'error');
        return;
      }

      let finalDataUrl = response.dataUrl;

      // If area is specified, crop the image
      if (area) {
        finalDataUrl = await this.cropImage(response.dataUrl, area);
      }

      this.currentScreenshotDataUrl = finalDataUrl;
      const screenshotConfig = this.config.screenshot || DEFAULT_SCREENSHOT_CONFIG;

      // Show the screenshot panel
      this.screenshotPanel = new ScreenshotPanel();
      this.screenshotPanel.show(finalDataUrl, {
        onSave: () => this.saveScreenshot(),
        onCopy: () => this.copyScreenshotToClipboard(),
        onAskAI: (question) => this.askAIAboutImage(question),
        onDescribe: () => this.describeImage(),
        onGenerateImage: (prompt) => this.generateImageFromPrompt(prompt),
        onClose: () => {
          this.screenshotPanel = null;
        },
      }, screenshotConfig);

    } catch (error) {
      this.flowCallbacks?.onToast(`截图失败: ${error}`, 'error');
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
      this.flowCallbacks?.onToast('截图已保存', 'success');
    } catch (error) {
      this.flowCallbacks?.onToast(`保存失败: ${error}`, 'error');
    }
  }

  private async copyScreenshotToClipboard(): Promise<void> {
    try {
      const response = await fetch(this.currentScreenshotDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      this.flowCallbacks?.onToast('已复制到剪贴板', 'success');
    } catch (error) {
      this.flowCallbacks?.onToast(`复制失败: ${error}`, 'error');
    }
  }

  private async askAIAboutImage(question: string): Promise<void> {
    if (!this.screenshotPanel) return;

    const validationError = this.validateAIConfig();
    if (validationError) {
      this.screenshotPanel.showResult('错误', validationError);
      return;
    }

    this.screenshotPanel.showLoading('AI 正在分析...');

    const prompt = getAskImagePrompt(question);
    const response = await callVisionAI(
      this.currentScreenshotDataUrl,
      prompt,
      this.config,
      (chunk, fullText) => {
        this.screenshotPanel?.streamUpdate(chunk, fullText);
      }
    );

    if (response.success && response.result) {
      this.screenshotPanel.showResult('AI 回答', response.result);
    } else {
      this.screenshotPanel.showResult('错误', response.error || 'AI 请求失败');
    }
  }

  private async describeImage(): Promise<void> {
    if (!this.screenshotPanel) return;

    const validationError = this.validateAIConfig();
    if (validationError) {
      this.screenshotPanel.showResult('错误', validationError);
      return;
    }

    this.screenshotPanel.showLoading('AI 正在描述图片...');

    const prompt = getDescribeImagePrompt();
    const response = await callVisionAI(
      this.currentScreenshotDataUrl,
      prompt,
      this.config,
      (chunk, fullText) => {
        this.screenshotPanel?.streamUpdate(chunk, fullText);
      }
    );

    if (response.success && response.result) {
      this.screenshotPanel.showResult('图片描述', response.result);
    } else {
      this.screenshotPanel.showResult('错误', response.error || 'AI 请求失败');
    }
  }

  private async generateImageFromPrompt(prompt: string): Promise<void> {
    if (!this.screenshotPanel) return;

    const screenshotConfig = this.config.screenshot || DEFAULT_SCREENSHOT_CONFIG;

    if (!screenshotConfig.enableImageGen) {
      this.screenshotPanel.showResult('错误', '请先在设置中启用 AI 生图功能');
      return;
    }

    if (screenshotConfig.imageGenProvider === 'openai') {
      if (!this.config.apiKey) {
        this.screenshotPanel.showResult('错误', '使用 OpenAI 生图需要配置 API Key');
        return;
      }
    } else if (screenshotConfig.imageGenProvider === 'custom') {
      if (!screenshotConfig.customImageGenUrl) {
        this.screenshotPanel.showResult('错误', '请配置自定义生图 API 地址');
        return;
      }
    }

    this.screenshotPanel.showLoading('正在生成图片...');

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
      this.screenshotPanel.showGeneratedImage(response.imageUrl);
    } else {
      this.screenshotPanel.showResult('错误', response.error || '图像生成失败');
    }
  }

  private async handleBookmark(): Promise<{ type: string; result?: string }> {
    try {
      await chrome.runtime.sendMessage({
        type: 'ADD_BOOKMARK',
        payload: { title: document.title, url: window.location.href },
      } as Message);
      return { type: 'success', result: '已添加书签' };
    } catch {
      return { type: 'error', result: '添加书签失败' };
    }
  }

  private handleNewTab(): { type: string; result: string } {
    chrome.runtime.sendMessage({ type: 'NEW_TAB' } as Message);
    return { type: 'success', result: '已打开新标签页' };
  }

  private handleSettings(): { type: string; result: string } {
    try {
      const url = chrome.runtime.getURL('options/index.html');
      chrome.runtime.sendMessage({ type: 'OPEN_URL', payload: url } as Message);
      return { type: 'success', result: '已打开设置页面' };
    } catch {
      return { type: 'error', result: '打开设置页面失败' };
    }
  }
}
