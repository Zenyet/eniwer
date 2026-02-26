// Settings View - handles settings configuration
import { MenuConfig, ScreenshotConfig, MenuItem, AuthState, AnnotationConfig, KnowledgeConfig, DEFAULT_SCREENSHOT_CONFIG, DEFAULT_HISTORY_CONFIG, DEFAULT_ANNOTATION_CONFIG, DEFAULT_KNOWLEDGE_CONFIG, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_SYNC_OPTIONS, SyncOptions } from '../../../types';
import { PRESET_COLORS, getAnnotationColorConfig } from '../../../types/annotation';
import { icons } from '../../../icons';
import { saveConfig, saveGlobalMenuItems } from '../../../utils/storage';
import { enforceMaxCount } from '../../../utils/taskStorage';
import { escapeHtml, getTranslationHint, getAPIKeyHint } from '../utils';

// Model options per provider
export const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fast)' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B' },
    { id: 'qwen/qwen-3-32b', label: 'Qwen 3 32B' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  ],
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  ],
};

function getModelOptions(provider: string, currentModel?: string): string {
  const models = PROVIDER_MODELS[provider];
  if (!models) return '';
  return models.map(m => {
    const selected = currentModel === m.id ? ' selected' : (!currentModel && m === models[0] ? ' selected' : '');
    return `<option value="${m.id}"${selected}>${m.label}</option>`;
  }).join('');
}

export interface SettingsState {
  tempConfig: MenuConfig | null;
  settingsChanged: boolean;
  settingsMenuItems: MenuItem[];
  editingItemId: string | null;
  authState: AuthState | null;
}

export function createSettingsState(): SettingsState {
  return {
    tempConfig: null,
    settingsChanged: false,
    settingsMenuItems: [],
    editingItemId: null,
    authState: null,
  };
}

export function getSettingsViewHTML(
  config: MenuConfig,
  authState: AuthState | null,
  icons: Record<string, string>,
  getAccountSettingsHTML: () => string
): string {
  const isCustomProvider = config.apiProvider === 'custom';
  const screenshotConfig = config.screenshot || DEFAULT_SCREENSHOT_CONFIG;
  const historyConfig = config.history || DEFAULT_HISTORY_CONFIG;
  const imageSearchConfig = config.imageSearch || { google: true, yandex: true, bing: true, tineye: true };

  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="settings">
        <span class="glass-command-tag-icon">${icons.settings}</span>
        <span class="glass-command-tag-label">设置</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input"
        placeholder=""
        autocomplete="off"
        spellcheck="false"
        readonly
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body glass-settings-body">
      <div class="glass-settings-flat">
        <!-- 账号 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">账号</div>
          ${getAccountSettingsHTML()}
        </div>

        <!-- 翻译设置 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">翻译服务</div>
          <div class="glass-form-group">
            <label class="glass-form-label">翻译引擎</label>
            <select class="glass-select" id="translation-provider-select">
              <option value="ai"${(config.translation?.provider || 'ai') === 'ai' ? ' selected' : ''}>AI 翻译 (使用配置的 AI 服务)</option>
              <option value="google"${config.translation?.provider === 'google' ? ' selected' : ''}>Google 翻译</option>
              <option value="microsoft"${config.translation?.provider === 'microsoft' ? ' selected' : ''}>微软翻译</option>
              <option value="deeplx"${config.translation?.provider === 'deeplx' ? ' selected' : ''}>DeepLX</option>
              <option value="custom"${config.translation?.provider === 'custom' ? ' selected' : ''}>自定义</option>
            </select>
          </div>
          <div class="glass-form-group" id="translation-deeplx-key-group" style="display: ${config.translation?.provider === 'deeplx' ? 'flex' : 'none'}">
            <label class="glass-form-label">DeepLX API Key</label>
            <input type="text" class="glass-input" id="translation-deeplx-key" value="${config.translation?.deeplxApiKey || ''}" placeholder="请输入 API Key">
          </div>
          <div class="glass-form-group" id="translation-custom-url-group" style="display: ${config.translation?.provider === 'custom' ? 'flex' : 'none'}">
            <label class="glass-form-label">自定义翻译地址</label>
            <input type="text" class="glass-input" id="translation-custom-url" value="${config.translation?.customUrl || ''}" placeholder="http://localhost:1188/translate">
          </div>
          <span class="glass-form-hint" id="translation-hint">${getTranslationHint(config.translation?.provider || 'ai')}</span>
        </div>

        <!-- 外观 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">外观</div>
          <div class="glass-form-group">
            <label class="glass-form-label">主题</label>
            <select class="glass-select" id="theme-select">
              <option value="system"${config.theme === 'system' ? ' selected' : ''}>跟随系统</option>
              <option value="dark"${config.theme === 'dark' ? ' selected' : ''}>深色</option>
              <option value="light"${config.theme === 'light' ? ' selected' : ''}>浅色</option>
            </select>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">选中文本弹出框</label>
            <label class="glass-toggle">
              <input type="checkbox" id="show-popover-toggle" ${config.showSelectionPopover !== false ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group" id="popover-position-group"${config.showSelectionPopover === false ? ' style="display: none"' : ''}>
            <label class="glass-form-label">弹出位置</label>
            <select class="glass-select" id="popover-position-select">
              <option value="above"${config.popoverPosition === 'above' ? ' selected' : ''}>选中文本上方</option>
              <option value="below"${config.popoverPosition === 'below' ? ' selected' : ''}>选中文本下方</option>
            </select>
          </div>
        </div>

        <!-- 语言 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">语言</div>
          <div class="glass-form-group">
            <label class="glass-form-label">翻译目标语言</label>
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
          <div class="glass-form-group">
            <label class="glass-form-label">总结输出语言</label>
            <select class="glass-select" id="summary-lang-select">
              <option value="auto"${config.summaryLanguage === 'auto' ? ' selected' : ''}>自动检测</option>
              <option value="zh-CN"${config.summaryLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
              <option value="zh-TW"${config.summaryLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
              <option value="en"${config.summaryLanguage === 'en' ? ' selected' : ''}>English</option>
              <option value="ja"${config.summaryLanguage === 'ja' ? ' selected' : ''}>日本語</option>
            </select>
          </div>
        </div>

        <!-- AI 服务 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">AI 服务</div>
          <div class="glass-form-group">
            <label class="glass-form-label">服务商</label>
            <select class="glass-select" id="api-provider-select">
              <option value="groq"${config.apiProvider === 'groq' ? ' selected' : ''}>Groq (免费)</option>
              <option value="openai"${config.apiProvider === 'openai' ? ' selected' : ''}>OpenAI</option>
              <option value="anthropic"${config.apiProvider === 'anthropic' ? ' selected' : ''}>Anthropic</option>
              <option value="gemini"${config.apiProvider === 'gemini' ? ' selected' : ''}>Google Gemini</option>
              <option value="custom"${config.apiProvider === 'custom' ? ' selected' : ''}>自定义</option>
            </select>
            <span class="glass-form-hint" id="api-key-hint">${getAPIKeyHint(config.apiProvider)}</span>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">API Key</label>
            <input type="password" class="glass-input-field" id="api-key-input" value="${config.apiKey || ''}" placeholder="输入 API Key">
          </div>
          <div class="glass-form-group" id="model-select-group"${isCustomProvider ? ' style="display: none"' : ''}>
            <label class="glass-form-label">模型</label>
            <select class="glass-select" id="model-select">
              ${getModelOptions(config.apiProvider, config.customModel)}
            </select>
          </div>
          <div class="glass-form-group" id="custom-url-group"${isCustomProvider ? '' : ' style="display: none"'}>
            <label class="glass-form-label">API URL</label>
            <input type="text" class="glass-input-field" id="custom-url-input" value="${config.customApiUrl || ''}" placeholder="https://api.example.com/v1/chat/completions">
          </div>
          <div class="glass-form-group" id="custom-model-group"${isCustomProvider ? '' : ' style="display: none"'}>
            <label class="glass-form-label">模型名称</label>
            <input type="text" class="glass-input-field" id="custom-model-input" value="${config.customModel || ''}" placeholder="gpt-4">
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">流式传输</label>
            <label class="glass-toggle">
              <input type="checkbox" id="streaming-toggle" ${config.useStreaming ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">思考模式</label>
            <label class="glass-toggle">
              <input type="checkbox" id="thinking-mode-toggle" ${config.useThinkingModel ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">启用后使用推理模型进行深度思考</span>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">AI 生图</label>
            <label class="glass-toggle">
              <input type="checkbox" id="enable-image-gen" ${screenshotConfig.enableImageGen ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div id="image-gen-settings"${screenshotConfig.enableImageGen ? '' : ' style="display: none"'}>
            <div class="glass-form-group">
              <label class="glass-form-label">生图服务</label>
              <select class="glass-select" id="image-gen-provider">
                <option value="openai"${screenshotConfig.imageGenProvider === 'openai' ? ' selected' : ''}>OpenAI DALL-E</option>
                <option value="custom"${screenshotConfig.imageGenProvider === 'custom' ? ' selected' : ''}>自定义</option>
              </select>
            </div>
            <div class="glass-form-group" id="custom-image-gen-url-group"${screenshotConfig.imageGenProvider === 'custom' ? '' : ' style="display: none"'}>
              <label class="glass-form-label">自定义生图 API</label>
              <input type="text" class="glass-input-field" id="custom-image-gen-url" value="${screenshotConfig.customImageGenUrl || ''}" placeholder="https://api.example.com/v1/images/generations">
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">图片尺寸</label>
              <select class="glass-select" id="image-size-select">
                <option value="1024x1024"${screenshotConfig.imageSize === '1024x1024' ? ' selected' : ''}>1024 × 1024</option>
                <option value="1792x1024"${screenshotConfig.imageSize === '1792x1024' ? ' selected' : ''}>1792 × 1024 (横)</option>
                <option value="1024x1792"${screenshotConfig.imageSize === '1024x1792' ? ' selected' : ''}>1024 × 1792 (竖)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 截图 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">截图</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">保存到文件</label>
            <label class="glass-toggle">
              <input type="checkbox" id="save-to-file" ${screenshotConfig.saveToFile ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">复制到剪贴板</label>
            <label class="glass-toggle">
              <input type="checkbox" id="copy-to-clipboard" ${screenshotConfig.copyToClipboard ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">AI 分析</label>
            <label class="glass-toggle">
              <input type="checkbox" id="enable-ai" ${screenshotConfig.enableAI ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">默认 AI 操作</label>
            <select class="glass-select" id="default-ai-action">
              <option value="none"${screenshotConfig.defaultAIAction === 'none' ? ' selected' : ''}>无</option>
              <option value="ask"${screenshotConfig.defaultAIAction === 'ask' ? ' selected' : ''}>询问</option>
              <option value="describe"${screenshotConfig.defaultAIAction === 'describe' ? ' selected' : ''}>描述</option>
            </select>
          </div>
        </div>

        <!-- 右键搜图 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">右键搜图</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">Google 搜图</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-google" ${imageSearchConfig.google ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">Yandex 搜图</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-yandex" ${imageSearchConfig.yandex ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">Bing 搜图</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-bing" ${imageSearchConfig.bing ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">TinEye 搜图</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-tineye" ${imageSearchConfig.tineye ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <span class="glass-form-hint">在图片上右键可使用搜图功能</span>
        </div>

        <!-- 历史记录 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">历史记录</div>
          <div class="glass-form-group">
            <label class="glass-form-label">最大保存数量</label>
            <select class="glass-select" id="history-max-count">
              <option value="50" ${historyConfig.maxSaveCount === 50 ? 'selected' : ''}>50 条</option>
              <option value="100" ${historyConfig.maxSaveCount === 100 ? 'selected' : ''}>100 条</option>
              <option value="200" ${historyConfig.maxSaveCount === 200 ? 'selected' : ''}>200 条</option>
              <option value="500" ${historyConfig.maxSaveCount === 500 ? 'selected' : ''}>500 条</option>
            </select>
            <span class="glass-form-hint">超过此数量时，最旧的记录将被自动删除</span>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">面板显示数量</label>
            <select class="glass-select" id="history-display-count">
              <option value="5" ${historyConfig.panelDisplayCount === 5 ? 'selected' : ''}>5 条</option>
              <option value="10" ${historyConfig.panelDisplayCount === 10 ? 'selected' : ''}>10 条</option>
              <option value="15" ${historyConfig.panelDisplayCount === 15 ? 'selected' : ''}>15 条</option>
              <option value="20" ${historyConfig.panelDisplayCount === 20 ? 'selected' : ''}>20 条</option>
            </select>
            <span class="glass-form-hint">命令面板中显示的最近记录数量</span>
          </div>
          <div class="glass-form-group">
            <button id="clear-history" class="glass-btn glass-btn-danger">清空所有历史记录</button>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">自动保存结果</label>
            <label class="glass-toggle">
              <input type="checkbox" id="auto-save-task" ${config.autoSaveTask ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">翻译、总结页面等 AI 结果完成后自动保存到历史记录</span>
          </div>
        </div>

        <!-- 批注 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">批注</div>
          <div class="glass-form-group">
            <label class="glass-form-label">默认高亮颜色</label>
            <div class="glass-color-picker" id="annotation-color-picker">
              <button class="glass-color-option ${(config.annotation?.defaultColor || 'yellow') === 'yellow' ? 'active' : ''}" data-color="yellow" style="--color: #fef08a; --color-border: #fbbf24;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'green' ? 'active' : ''}" data-color="green" style="--color: #bbf7d0; --color-border: #4ade80;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'blue' ? 'active' : ''}" data-color="blue" style="--color: #bfdbfe; --color-border: #60a5fa;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'pink' ? 'active' : ''}" data-color="pink" style="--color: #fbcfe8; --color-border: #f472b6;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'purple' ? 'active' : ''}" data-color="purple" style="--color: #ddd6fe; --color-border: #a78bfa;"></button>
              ${(() => {
                const dc = config.annotation?.defaultColor || 'yellow';
                const isCustom = !['yellow', 'green', 'blue', 'pink', 'purple'].includes(dc);
                const customValue = isCustom ? dc : '#ff6600';
                const customConfig = isCustom ? getAnnotationColorConfig(dc) : null;
                return `<div class="glass-color-option glass-color-option-custom ${isCustom ? 'active' : ''}" title="自定义颜色" style="${isCustom ? `--color: ${customConfig!.bg}; --color-border: ${customConfig!.border};` : ''}">
                  <input type="color" id="annotation-custom-color" value="${customValue}">
                </div>`;
              })()}
            </div>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">自动保存 AI 结果</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-auto-save" ${config.annotation?.autoSaveAIResult ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">翻译/解释等 AI 结果自动关联到高亮</span>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">默认显示当前页面</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-page-filter" ${config.annotation?.showPageFilter ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- 知识库 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">知识库</div>
          <div class="glass-form-group">
            <label class="glass-form-label">默认筛选</label>
            <select class="glass-select" id="knowledge-filter-select">
              <option value="all" ${(config.knowledge?.defaultFilter || 'all') === 'all' ? 'selected' : ''}>全部</option>
              <option value="annotations" ${config.knowledge?.defaultFilter === 'annotations' ? 'selected' : ''}>仅批注</option>
              <option value="ai-results" ${config.knowledge?.defaultFilter === 'ai-results' ? 'selected' : ''}>仅 AI 结果</option>
            </select>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">每组最大显示数量</label>
            <select class="glass-select" id="knowledge-max-display">
              <option value="20" ${(config.knowledge?.maxDisplayCount || 50) === 20 ? 'selected' : ''}>20 条</option>
              <option value="50" ${config.knowledge?.maxDisplayCount === 50 ? 'selected' : ''}>50 条</option>
              <option value="100" ${config.knowledge?.maxDisplayCount === 100 ? 'selected' : ''}>100 条</option>
              <option value="200" ${config.knowledge?.maxDisplayCount === 200 ? 'selected' : ''}>200 条</option>
            </select>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">按日期分组</label>
            <label class="glass-toggle">
              <input type="checkbox" id="knowledge-group-date" ${config.knowledge?.groupByDate !== false ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- 重置 -->
        <div class="glass-settings-section">
          <div class="glass-form-group">
            <button class="glass-btn glass-btn-reset">重置为默认设置</button>
          </div>
        </div>
      </div>
    </div>
    <div class="glass-footer glass-settings-footer">
      <div class="glass-settings-footer-actions">
        <button class="glass-btn glass-btn-cancel">取消</button>
        <button class="glass-btn glass-btn-primary glass-btn-save">保存</button>
      </div>
    </div>
  `;
}

export function getAccountSettingsHTML(authState: AuthState | null, config: MenuConfig): string {
  const auth = authState;
  const syncOpts = config.syncOptions || DEFAULT_SYNC_OPTIONS;
  if (auth?.isLoggedIn && auth.user) {
    return `
      <div class="glass-account-info">
        <div class="glass-account-avatar">
          ${auth.user.picture
            ? `<img src="${auth.user.picture}" alt="${escapeHtml(auth.user.name)}" />`
            : `<div class="glass-account-avatar-placeholder">${auth.user.name.charAt(0).toUpperCase()}</div>`
          }
        </div>
        <div class="glass-account-details">
          <div class="glass-account-name">${escapeHtml(auth.user.name)}</div>
          <div class="glass-account-email">${escapeHtml(auth.user.email)}</div>
        </div>
        <button class="glass-btn glass-btn-secondary glass-btn-logout" title="退出登录">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
      <div class="glass-sync-settings">
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">云同步</label>
          <label class="glass-toggle">
            <input type="checkbox" id="sync-enabled-toggle" ${auth.syncEnabled ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div id="sync-options" class="glass-sync-options" style="display: ${auth.syncEnabled ? 'block' : 'none'}">
          <span class="glass-form-hint" style="margin-bottom: 6px; display: block;">选择同步内容</span>
          <div class="glass-sync-chips">
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-translation" ${syncOpts.translation ? 'checked' : ''}>
              <span class="glass-sync-chip-label">翻译</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-summary" ${syncOpts.summary ? 'checked' : ''}>
              <span class="glass-sync-chip-label">总结</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-knowledge" ${syncOpts.knowledge ? 'checked' : ''}>
              <span class="glass-sync-chip-label">知识库</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-annotation" ${syncOpts.annotation ? 'checked' : ''}>
              <span class="glass-sync-chip-label">批注</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-browseTrail" ${syncOpts.browseTrail ? 'checked' : ''}>
              <span class="glass-sync-chip-label">浏览轨迹</span>
            </label>
          </div>
        </div>
        <div id="sync-actions" class="glass-sync-actions" style="display: ${auth.syncEnabled ? 'flex' : 'none'}">
          <button class="glass-btn glass-btn-secondary" id="sync-to-cloud-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            上传
          </button>
          <button class="glass-btn glass-btn-secondary" id="sync-from-cloud-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            下载
          </button>
        </div>
        <div id="backup-history-section" style="display: ${auth.syncEnabled ? 'block' : 'none'}">
          <div class="glass-backup-header">
            <span class="glass-form-label">备份历史</span>
            <button class="glass-backup-refresh-btn" id="refresh-backups-btn" title="刷新">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div id="backup-list" class="glass-backup-list">
            <div class="glass-backup-empty">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>加载中...</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="glass-account-login">
      <button id="google-login-btn" class="glass-btn glass-btn-google">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        使用 Google 登录
      </button>
      <span class="glass-form-hint">登录后可使用云同步功能</span>
    </div>
  `;
}

export function getMenuSettingsHTML(
  settingsMenuItems: MenuItem[],
  icons: Record<string, string>
): string {
  const sortedItems = [...settingsMenuItems].sort((a, b) => a.order - b.order);

  return `
    <div class="glass-header glass-draggable">
      <button class="glass-back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <span class="glass-header-title">菜单管理</span>
      <div class="glass-header-actions"></div>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body glass-settings-body">
      <div class="glass-settings-flat">
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">全局菜单项</div>
          <span class="glass-form-hint">拖拽排序，点击开关启用/禁用</span>
          <div class="glass-menu-list" id="menu-list">
            ${sortedItems.map(item => getMenuItemHTML(item)).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="glass-footer">
      <button class="glass-btn glass-btn-add">+ 添加自定义菜单项</button>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

function getMenuItemHTML(item: MenuItem): string {
  const isCustom = (item as any).isCustom;
  return `
    <div class="glass-menu-item" data-id="${item.id}" draggable="true">
      <span class="glass-menu-drag">⋮⋮</span>
      <span class="glass-menu-icon">${item.customIcon || item.icon}</span>
      <span class="glass-menu-label">${item.customLabel || item.label}</span>
      ${isCustom ? `
        <button class="glass-menu-btn glass-menu-edit" data-id="${item.id}" title="编辑">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
          </svg>
        </button>
        <button class="glass-menu-btn glass-menu-delete" data-id="${item.id}" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
      ` : ''}
      <label class="glass-toggle glass-toggle-small">
        <input type="checkbox" data-id="${item.id}" ${item.enabled ? 'checked' : ''}>
        <span class="glass-toggle-slider"></span>
      </label>
    </div>
  `;
}
