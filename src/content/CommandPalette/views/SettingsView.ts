// Settings View - handles settings configuration
import { MenuConfig, ScreenshotConfig, MenuItem, AuthState, AnnotationConfig, KnowledgeConfig, DEFAULT_SCREENSHOT_CONFIG, DEFAULT_HISTORY_CONFIG, DEFAULT_ANNOTATION_CONFIG, DEFAULT_KNOWLEDGE_CONFIG, DEFAULT_CONFIG, DEFAULT_GLOBAL_MENU, DEFAULT_SYNC_OPTIONS, SyncOptions, DEFAULT_YOUTUBE_SUBTITLE_CONFIG, DEFAULT_TTS_CONFIG } from '../../../types';
import { PRESET_COLORS, getAnnotationColorConfig } from '../../../types/annotation';
import { icons } from '../../../icons';
import { saveConfig, saveGlobalMenuItems } from '../../../utils/storage';
import { enforceMaxCount } from '../../../utils/taskStorage';
import { escapeHtml, getTranslationHint, getAPIKeyHint } from '../utils';
import { t } from '../../../i18n';

// Model options per provider
export const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { id: 'gpt-3.5-turbo-16k', label: 'GPT-3.5 Turbo 16K' },
    { id: 'gpt-4', label: 'GPT-4' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'o1', label: 'o1' },
    { id: 'o1-pro', label: 'o1-pro' },
    { id: 'o3-mini', label: 'o3-mini' },
    { id: 'o3-mini-high', label: 'o3-mini-high' },
    { id: 'o3', label: 'o3' },
    { id: 'o3-pro', label: 'o3-pro' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { id: 'gpt-5-pro', label: 'GPT-5 Pro' },
    { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
    { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
    { id: 'gpt-5.1-chat', label: 'GPT-5.1 Chat' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
    { id: 'gpt-5.2-chat', label: 'GPT-5.2 Chat' },
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  ],
  anthropic: [
    { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  ],
  qwen: [
    { id: 'qwen-max', label: 'Qwen Max' },
    { id: 'qwen-turbo', label: 'Qwen Turbo' },
    { id: 'qwen3-max', label: 'Qwen3 Max' },
    { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max (2026-01-23)' },
    { id: 'qwen3-max-2025-09-23', label: 'Qwen3 Max (2025-09-23)' },
    { id: 'qwen3-max-preview', label: 'Qwen3 Max Preview' },
    { id: 'qwen3.5-plus', label: 'Qwen3.5 Plus' },
    { id: 'qwen3.5-plus-2026-02-15', label: 'Qwen3.5 Plus (2026-02-15)' },
    { id: 'qwen-plus', label: 'Qwen Plus' },
    { id: 'qwen-plus-latest', label: 'Qwen Plus Latest' },
    { id: 'qwen-plus-2025-12-01', label: 'Qwen Plus (2025-12-01)' },
    { id: 'qwen-plus-2025-09-11', label: 'Qwen Plus (2025-09-11)' },
    { id: 'qwen-plus-2025-07-28', label: 'Qwen Plus (2025-07-28)' },
    { id: 'qwen-plus-2025-07-14', label: 'Qwen Plus (2025-07-14)' },
    { id: 'qwen-plus-2025-04-28', label: 'Qwen Plus (2025-04-28)' },
    { id: 'qwen3.5-flash', label: 'Qwen3.5 Flash' },
    { id: 'qwen3.5-flash-2026-02-23', label: 'Qwen3.5 Flash (2026-02-23)' },
    { id: 'qwen-flash', label: 'Qwen Flash' },
    { id: 'qwen-flash-2025-07-28', label: 'Qwen Flash (2025-07-28)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
  ],
  minimax: [
    { id: 'minimax-01', label: 'MiniMax 01' },
    { id: 'minimax-m1', label: 'MiniMax M1' },
    { id: 'minimax-m2', label: 'MiniMax M2' },
    { id: 'minimax-m2.1', label: 'MiniMax M2.1' },
    { id: 'minimax-m2-her', label: 'MiniMax M2 Her' },
    { id: 'minimax-m2.5', label: 'MiniMax M2.5' },
  ],
  xai: [
    { id: 'grok-3', label: 'Grok 3' },
    { id: 'grok-3-mini', label: 'Grok 3 Mini' },
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-code-fast-1', label: 'Grok Code Fast' },
    { id: 'grok-4-fast', label: 'Grok 4 Fast' },
    { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast' },
  ],
  moonshot: [
    { id: 'kimi-k2', label: 'Kimi K2' },
    { id: 'kimi-k2-0905', label: 'Kimi K2 (0905)' },
    { id: 'kimi-k2-thinking', label: 'Kimi K2 (思考)' },
    { id: 'kimi-k2.5', label: 'Kimi K2.5' },
  ],
  zhipu: [
    { id: 'glm-4-32b', label: 'GLM-4 32B' },
    { id: 'glm-4.5-air', label: 'GLM-4.5 Air' },
    { id: 'glm-4.5', label: 'GLM-4.5' },
    { id: 'glm-4.5v', label: 'GLM-4.5V (视觉)' },
    { id: 'glm-4.6', label: 'GLM-4.6' },
    { id: 'glm-4.6v', label: 'GLM-4.6V (视觉)' },
    { id: 'glm-4.7', label: 'GLM-4.7' },
    { id: 'glm-4.7-flash', label: 'GLM-4.7 Flash' },
    { id: 'glm-5', label: 'GLM-5' },
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
        <span class="glass-command-tag-label">${t('view.settings')}</span>
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
          <div class="glass-settings-section-title">${t('settings.account')}</div>
          ${getAccountSettingsHTML()}
        </div>

        <!-- AI 服务 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.aiService')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.provider')}</label>
            <select class="glass-select" id="api-provider-select">
              <option value="openai"${config.apiProvider === 'openai' ? ' selected' : ''}>OpenAI</option>
              <option value="anthropic"${config.apiProvider === 'anthropic' ? ' selected' : ''}>Anthropic</option>
              <option value="gemini"${config.apiProvider === 'gemini' ? ' selected' : ''}>Google Gemini</option>
              <option value="xai"${config.apiProvider === 'xai' ? ' selected' : ''}>xAI (Grok)</option>
              <option value="qwen"${config.apiProvider === 'qwen' ? ' selected' : ''}>${t('settings.providerQwen')}</option>
              <option value="deepseek"${config.apiProvider === 'deepseek' ? ' selected' : ''}>DeepSeek</option>
              <option value="minimax"${config.apiProvider === 'minimax' ? ' selected' : ''}>MiniMax</option>
              <option value="moonshot"${config.apiProvider === 'moonshot' ? ' selected' : ''}>Moonshot (Kimi)</option>
              <option value="zhipu"${config.apiProvider === 'zhipu' ? ' selected' : ''}>${t('settings.providerZhipu')}</option>
              <option value="custom"${config.apiProvider === 'custom' ? ' selected' : ''}>${t('settings.custom')}</option>
            </select>
            <span class="glass-form-hint" id="api-key-hint">${getAPIKeyHint(config.apiProvider)}</span>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">API Key</label>
            <input type="text" class="glass-input-field" id="api-key-input" value="${config.apiKey || ''}" placeholder="${t('settings.apiKeyPlaceholder')}" autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" style="-webkit-text-security: disc;">
          </div>
          <div class="glass-form-group" id="model-select-group"${isCustomProvider ? ' style="display: none"' : ''}>
            <label class="glass-form-label">${t('settings.model')}</label>
            <select class="glass-select" id="model-select">
              ${getModelOptions(config.apiProvider, config.customModel)}
            </select>
          </div>
          <div class="glass-form-group" id="custom-url-group"${isCustomProvider ? '' : ' style="display: none"'}>
            <label class="glass-form-label">API URL</label>
            <input type="text" class="glass-input-field" id="custom-url-input" value="${config.customApiUrl || ''}" placeholder="https://api.example.com/v1/chat/completions">
          </div>
          <div class="glass-form-group" id="custom-model-group"${isCustomProvider ? '' : ' style="display: none"'}>
            <label class="glass-form-label">${t('settings.modelName')}</label>
            <input type="text" class="glass-input-field" id="custom-model-input" value="${config.customModel || ''}" placeholder="gpt-4">
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.streaming')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="streaming-toggle" ${config.useStreaming ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.thinkingMode')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="thinking-mode-toggle" ${config.useThinkingModel ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.thinkingModeHint')}</span>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.aiImageGen')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="enable-image-gen" ${screenshotConfig.enableImageGen ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div id="image-gen-settings"${screenshotConfig.enableImageGen ? '' : ' style="display: none"'}>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.imageGenService')}</label>
              <select class="glass-select" id="image-gen-provider">
                <option value="openai"${screenshotConfig.imageGenProvider === 'openai' ? ' selected' : ''}>OpenAI DALL-E</option>
                <option value="custom"${screenshotConfig.imageGenProvider === 'custom' ? ' selected' : ''}>${t('settings.custom')}</option>
              </select>
            </div>
            <div class="glass-form-group" id="custom-image-gen-url-group"${screenshotConfig.imageGenProvider === 'custom' ? '' : ' style="display: none"'}>
              <label class="glass-form-label">${t('settings.customImageGenApi')}</label>
              <input type="text" class="glass-input-field" id="custom-image-gen-url" value="${screenshotConfig.customImageGenUrl || ''}" placeholder="https://api.example.com/v1/images/generations">
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.imageSize')}</label>
              <select class="glass-select" id="image-size-select">
                <option value="1024x1024"${screenshotConfig.imageSize === '1024x1024' ? ' selected' : ''}>1024 × 1024</option>
                <option value="1792x1024"${screenshotConfig.imageSize === '1792x1024' ? ' selected' : ''}>${t('settings.imageSizeLandscape')}</option>
                <option value="1024x1792"${screenshotConfig.imageSize === '1024x1792' ? ' selected' : ''}>${t('settings.imageSizePortrait')}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 翻译设置 -->
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

        <!-- YouTube 字幕翻译 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.youtubeSubtitleSection')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.youtubeSubtitleEnabled')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="yt-subtitle-enabled" ${(config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG).enabled ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.youtubeSubtitleHint')}</span>
          </div>
          <div id="yt-subtitle-settings"${(config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG).enabled ? '' : ' style="display: none"'}>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.youtubeSubtitleSourceLang')}</label>
              <select class="glass-select" id="yt-subtitle-source-lang">
                <option value="auto"${(config.youtubeSubtitle?.sourceLanguage || 'auto') === 'auto' ? ' selected' : ''}>${t('settings.youtubeSubtitleAutoDetect')}</option>
                <option value="en"${config.youtubeSubtitle?.sourceLanguage === 'en' ? ' selected' : ''}>English</option>
                <option value="zh-CN"${config.youtubeSubtitle?.sourceLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
                <option value="zh-TW"${config.youtubeSubtitle?.sourceLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
                <option value="ja"${config.youtubeSubtitle?.sourceLanguage === 'ja' ? ' selected' : ''}>日本語</option>
                <option value="ko"${config.youtubeSubtitle?.sourceLanguage === 'ko' ? ' selected' : ''}>한국어</option>
                <option value="es"${config.youtubeSubtitle?.sourceLanguage === 'es' ? ' selected' : ''}>Español</option>
                <option value="fr"${config.youtubeSubtitle?.sourceLanguage === 'fr' ? ' selected' : ''}>Français</option>
                <option value="de"${config.youtubeSubtitle?.sourceLanguage === 'de' ? ' selected' : ''}>Deutsch</option>
              </select>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.youtubeSubtitleTargetLang')}</label>
              <select class="glass-select" id="yt-subtitle-target-lang">
                <option value="zh-CN"${(config.youtubeSubtitle?.targetLanguage || 'zh-CN') === 'zh-CN' ? ' selected' : ''}>简体中文</option>
                <option value="zh-TW"${config.youtubeSubtitle?.targetLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
                <option value="en"${config.youtubeSubtitle?.targetLanguage === 'en' ? ' selected' : ''}>English</option>
                <option value="ja"${config.youtubeSubtitle?.targetLanguage === 'ja' ? ' selected' : ''}>日本語</option>
                <option value="ko"${config.youtubeSubtitle?.targetLanguage === 'ko' ? ' selected' : ''}>한국어</option>
                <option value="es"${config.youtubeSubtitle?.targetLanguage === 'es' ? ' selected' : ''}>Español</option>
                <option value="fr"${config.youtubeSubtitle?.targetLanguage === 'fr' ? ' selected' : ''}>Français</option>
                <option value="de"${config.youtubeSubtitle?.targetLanguage === 'de' ? ' selected' : ''}>Deutsch</option>
              </select>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.youtubeSubtitleFontSize')}</label>
              <select class="glass-select" id="yt-subtitle-font-size">
                <option value="small"${(config.youtubeSubtitle?.fontSize || 'medium') === 'small' ? ' selected' : ''}>${t('settings.youtubeSubtitleFontSmall')}</option>
                <option value="medium"${(config.youtubeSubtitle?.fontSize || 'medium') === 'medium' ? ' selected' : ''}>${t('settings.youtubeSubtitleFontMedium')}</option>
                <option value="large"${(config.youtubeSubtitle?.fontSize || 'medium') === 'large' ? ' selected' : ''}>${t('settings.youtubeSubtitleFontLarge')}</option>
              </select>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.youtubeSubtitleDisplayMode')}</label>
              <select class="glass-select" id="yt-subtitle-display-mode">
                <option value="bilingual"${(config.youtubeSubtitle?.displayMode || 'bilingual') === 'bilingual' ? ' selected' : ''}>${t('settings.youtubeSubtitleModeBilingual')}</option>
                <option value="translated"${config.youtubeSubtitle?.displayMode === 'translated' ? ' selected' : ''}>${t('settings.youtubeSubtitleModeTranslated')}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 字幕朗读 TTS -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.ttsSection')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.ttsEnabled')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="tts-enabled" ${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).enabled ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.ttsHint')}</span>
          </div>
          <div id="tts-settings"${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).enabled ? '' : ' style="display: none"'}>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.ttsEngine')}</label>
              <select class="glass-select" id="tts-engine">
                <option value="native"${(config.youtubeSubtitleTTS?.engine || 'native') === 'native' ? ' selected' : ''}>${t('settings.ttsEngineNative')}</option>
                <option value="edge"${config.youtubeSubtitleTTS?.engine === 'edge' ? ' selected' : ''}>${t('settings.ttsEngineEdge')}</option>
                <option value="cloud"${config.youtubeSubtitleTTS?.engine === 'cloud' ? ' selected' : ''}>${t('settings.ttsEngineCloud')}</option>
              </select>
            </div>
            <div id="tts-edge-settings" style="display: ${config.youtubeSubtitleTTS?.engine === 'edge' ? 'block' : 'none'}">
              <span class="glass-form-hint">${t('settings.ttsEdgeVoiceHint')}</span>
            </div>
            <div id="tts-cloud-settings" style="display: ${config.youtubeSubtitleTTS?.engine === 'cloud' ? 'block' : 'none'}">
              <div class="glass-form-group">
                <label class="glass-form-label">${t('settings.ttsCloudProvider')}</label>
                <select class="glass-select" id="tts-cloud-provider">
                  <option value="openai"${(config.youtubeSubtitleTTS?.cloudProvider || 'openai') === 'openai' ? ' selected' : ''}>OpenAI</option>
                  <option value="custom"${config.youtubeSubtitleTTS?.cloudProvider === 'custom' ? ' selected' : ''}>${t('settings.custom')}</option>
                </select>
              </div>
              <div class="glass-form-group">
                <label class="glass-form-label">${t('settings.ttsCloudApiKey')}</label>
                <input type="text" class="glass-input" id="tts-cloud-api-key" value="${config.youtubeSubtitleTTS?.cloudApiKey || ''}" placeholder="${t('settings.ttsCloudApiKeyPlaceholder')}">
              </div>
              <div class="glass-form-group" id="tts-custom-url-group" style="display: ${config.youtubeSubtitleTTS?.cloudProvider === 'custom' ? 'flex' : 'none'}">
                <label class="glass-form-label">${t('settings.ttsCloudApiUrl')}</label>
                <input type="text" class="glass-input" id="tts-cloud-api-url" value="${config.youtubeSubtitleTTS?.cloudApiUrl || ''}" placeholder="${t('settings.ttsCloudApiUrlPlaceholder')}">
              </div>
              <div class="glass-form-group">
                <label class="glass-form-label">${t('settings.ttsCloudModel')}</label>
                <input type="text" class="glass-input" id="tts-cloud-model" value="${config.youtubeSubtitleTTS?.cloudModel || 'tts-1'}" placeholder="tts-1">
              </div>
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.ttsVoice')}</label>
              <input type="text" class="glass-input" id="tts-voice" value="${config.youtubeSubtitleTTS?.voice || ''}" placeholder="${t('settings.ttsVoicePlaceholder')}">
            </div>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.ttsRate')}</label>
              <select class="glass-select" id="tts-rate">
                <option value="0.5"${(config.youtubeSubtitleTTS?.rate || 1) === 0.5 ? ' selected' : ''}>0.5x</option>
                <option value="0.75"${(config.youtubeSubtitleTTS?.rate || 1) === 0.75 ? ' selected' : ''}>0.75x</option>
                <option value="1"${(config.youtubeSubtitleTTS?.rate || 1) === 1 ? ' selected' : ''}>1.0x</option>
                <option value="1.25"${(config.youtubeSubtitleTTS?.rate || 1) === 1.25 ? ' selected' : ''}>1.25x</option>
                <option value="1.5"${(config.youtubeSubtitleTTS?.rate || 1) === 1.5 ? ' selected' : ''}>1.5x</option>
                <option value="2"${(config.youtubeSubtitleTTS?.rate || 1) === 2 ? ' selected' : ''}>2.0x</option>
              </select>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">${t('settings.ttsAutoPlay')}</label>
              <label class="glass-toggle">
                <input type="checkbox" id="tts-auto-play" ${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).autoPlay ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
              <span class="glass-form-hint">${t('settings.ttsAutoPlayHint')}</span>
            </div>
            <div class="glass-form-group glass-form-toggle">
              <label class="glass-form-label">${t('settings.ttsMuteOriginal')}</label>
              <label class="glass-toggle">
                <input type="checkbox" id="tts-mute-original" ${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).muteOriginal ? 'checked' : ''}>
                <span class="glass-toggle-slider"></span>
              </label>
              <span class="glass-form-hint">${t('settings.ttsMuteOriginalHint')}</span>
            </div>
          </div>
        </div>

        <!-- 外观 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.appearance')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.theme')}</label>
            <select class="glass-select" id="theme-select">
              <option value="system"${config.theme === 'system' ? ' selected' : ''}>${t('settings.themeSystem')}</option>
              <option value="dark"${config.theme === 'dark' ? ' selected' : ''}>${t('settings.themeDark')}</option>
              <option value="light"${config.theme === 'light' ? ' selected' : ''}>${t('settings.themeLight')}</option>
            </select>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.selectionPopover')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="show-popover-toggle" ${config.showSelectionPopover !== false ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group" id="popover-position-group"${config.showSelectionPopover === false ? ' style="display: none"' : ''}>
            <label class="glass-form-label">${t('settings.popoverPosition')}</label>
            <select class="glass-select" id="popover-position-select">
              <option value="above"${config.popoverPosition === 'above' ? ' selected' : ''}>${t('settings.popoverAbove')}</option>
              <option value="below"${config.popoverPosition === 'below' ? ' selected' : ''}>${t('settings.popoverBelow')}</option>
            </select>
          </div>
        </div>

        <!-- 语言 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.language')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.uiLanguage')}</label>
            <select class="glass-select" id="ui-lang-select">
              <option value="zh-CN"${(config as any).uiLanguage !== 'en' ? ' selected' : ''}>简体中文</option>
              <option value="en"${(config as any).uiLanguage === 'en' ? ' selected' : ''}>English</option>
            </select>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.translateTargetLanguage')}</label>
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
            <label class="glass-form-label">${t('settings.summaryOutputLanguage')}</label>
            <select class="glass-select" id="summary-lang-select">
              <option value="auto"${config.summaryLanguage === 'auto' ? ' selected' : ''}>${t('settings.summaryAutoDetect')}</option>
              <option value="zh-CN"${config.summaryLanguage === 'zh-CN' ? ' selected' : ''}>简体中文</option>
              <option value="zh-TW"${config.summaryLanguage === 'zh-TW' ? ' selected' : ''}>繁体中文</option>
              <option value="en"${config.summaryLanguage === 'en' ? ' selected' : ''}>English</option>
              <option value="ja"${config.summaryLanguage === 'ja' ? ' selected' : ''}>日本語</option>
            </select>
          </div>
        </div>

        <!-- 截图 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.screenshotSection')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.saveToFile')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="save-to-file" ${screenshotConfig.saveToFile ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.copyToClipboard')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="copy-to-clipboard" ${screenshotConfig.copyToClipboard ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.aiAnalysis')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="enable-ai" ${screenshotConfig.enableAI ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.defaultAIAction')}</label>
            <select class="glass-select" id="default-ai-action">
              <option value="none"${screenshotConfig.defaultAIAction === 'none' ? ' selected' : ''}>${t('settings.actionNone')}</option>
              <option value="ask"${screenshotConfig.defaultAIAction === 'ask' ? ' selected' : ''}>${t('settings.actionAsk')}</option>
              <option value="describe"${screenshotConfig.defaultAIAction === 'describe' ? ' selected' : ''}>${t('settings.actionDescribe')}</option>
            </select>
          </div>
        </div>

        <!-- 右键搜图 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.imageSearch')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.googleImageSearch')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-google" ${imageSearchConfig.google ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.yandexImageSearch')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-yandex" ${imageSearchConfig.yandex ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.bingImageSearch')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-bing" ${imageSearchConfig.bing ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.tineyeImageSearch')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="image-search-tineye" ${imageSearchConfig.tineye ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <span class="glass-form-hint">${t('settings.imageSearchHint')}</span>
        </div>

        <!-- 历史记录 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.history')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.maxSaveCount')}</label>
            <select class="glass-select" id="history-max-count">
              <option value="50" ${historyConfig.maxSaveCount === 50 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 50 })}</option>
              <option value="100" ${historyConfig.maxSaveCount === 100 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 100 })}</option>
              <option value="200" ${historyConfig.maxSaveCount === 200 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 200 })}</option>
              <option value="500" ${historyConfig.maxSaveCount === 500 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 500 })}</option>
            </select>
            <span class="glass-form-hint">${t('settings.historyMaxHint')}</span>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.panelDisplayCount')}</label>
            <select class="glass-select" id="history-display-count">
              <option value="5" ${historyConfig.panelDisplayCount === 5 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 5 })}</option>
              <option value="10" ${historyConfig.panelDisplayCount === 10 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 10 })}</option>
              <option value="15" ${historyConfig.panelDisplayCount === 15 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 15 })}</option>
              <option value="20" ${historyConfig.panelDisplayCount === 20 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 20 })}</option>
            </select>
            <span class="glass-form-hint">${t('settings.panelDisplayHint')}</span>
          </div>
          <div class="glass-form-group">
            <button id="clear-history" class="glass-btn glass-btn-danger">${t('settings.clearAllHistory')}</button>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.autoSaveResult')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="auto-save-task" ${config.autoSaveTask ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.autoSaveHint')}</span>
          </div>
        </div>

        <!-- 批注 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.annotationSection')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.defaultHighlightColor')}</label>
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
                return `<div class="glass-color-option glass-color-option-custom ${isCustom ? 'active' : ''}" title="${t('settings.customColor')}" style="${isCustom ? `--color: ${customConfig!.bg}; --color-border: ${customConfig!.border};` : ''}">
                  <input type="color" id="annotation-custom-color" value="${customValue}">
                </div>`;
              })()}
            </div>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.autoSaveAIResult')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-auto-save" ${config.annotation?.autoSaveAIResult ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.autoSaveAIHint')}</span>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.defaultShowCurrentPage')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-page-filter" ${config.annotation?.showPageFilter ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- 知识库 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.knowledgeSection')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.defaultFilter')}</label>
            <select class="glass-select" id="knowledge-filter-select">
              <option value="all" ${(config.knowledge?.defaultFilter || 'all') === 'all' ? 'selected' : ''}>${t('settings.filterAll')}</option>
              <option value="annotations" ${config.knowledge?.defaultFilter === 'annotations' ? 'selected' : ''}>${t('settings.filterAnnotationsOnly')}</option>
              <option value="ai-results" ${config.knowledge?.defaultFilter === 'ai-results' ? 'selected' : ''}>${t('settings.filterAIResultsOnly')}</option>
            </select>
          </div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.maxDisplayPerGroup')}</label>
            <select class="glass-select" id="knowledge-max-display">
              <option value="20" ${(config.knowledge?.maxDisplayCount || 50) === 20 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 20 })}</option>
              <option value="50" ${config.knowledge?.maxDisplayCount === 50 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 50 })}</option>
              <option value="100" ${config.knowledge?.maxDisplayCount === 100 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 100 })}</option>
              <option value="200" ${config.knowledge?.maxDisplayCount === 200 ? 'selected' : ''}>${t('settings.historyCountSuffix', { n: 200 })}</option>
            </select>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.groupByDate')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="knowledge-group-date" ${config.knowledge?.groupByDate !== false ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- 存储空间 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">
            ${t('settings.storage')}
            <button class="glass-storage-refresh-btn" id="storage-refresh-btn" title="${t('common.refresh')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div id="storage-usage-container">
            <div class="glass-storage-summary">
              <div class="glass-storage-bar">
                <div class="glass-storage-fill" id="storage-fill" style="width: 0%"></div>
              </div>
              <div class="glass-storage-text">
                <span id="storage-used">${t('common.loading')}</span>
                <span id="storage-percent"></span>
              </div>
            </div>
            <div class="glass-storage-categories" id="storage-categories">
              <div class="glass-storage-category">
                <span class="glass-storage-dot" style="background: var(--text-tertiary)"></span>
                <span class="glass-storage-category-name">${t('common.loading')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 重置 -->
        <div class="glass-settings-section">
          <div class="glass-form-group">
            <button class="glass-btn glass-btn-reset">${t('settings.resetToDefault')}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="glass-footer glass-settings-footer">
      <div class="glass-settings-footer-actions">
        <button class="glass-btn glass-btn-cancel">${t('common.cancel')}</button>
        <button class="glass-btn glass-btn-primary glass-btn-save">${t('common.save')}</button>
      </div>
    </div>
  `;
}

export function getAccountSettingsHTML(authState: AuthState | null, config: MenuConfig): string {
  const auth = authState;
  const syncOpts = config.syncOptions || DEFAULT_SYNC_OPTIONS;
  if (auth?.isLoggedIn && auth.user) {
    const tokenExpiredNotice = auth.tokenExpired
      ? `<div class="glass-token-expired-notice">
          <span>${t('settings.tokenExpired')}</span>
          <button class="glass-btn-relogin" id="google-relogin-btn">${t('settings.relogin')}</button>
        </div>`
      : '';
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
        <button class="glass-btn glass-btn-secondary glass-btn-logout" title="${t('settings.logout')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
      ${tokenExpiredNotice}
      <div class="glass-sync-settings">
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.cloudSync')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="sync-enabled-toggle" ${auth.syncEnabled ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div id="sync-options" class="glass-sync-options" style="display: ${auth.syncEnabled ? 'block' : 'none'}">
          <span class="glass-form-hint" style="margin-bottom: 6px; display: block;">${t('settings.selectSyncContent')}</span>
          <div class="glass-sync-chips">
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-translation" ${syncOpts.translation ? 'checked' : ''}>
              <span class="glass-sync-chip-label">${t('settings.syncTranslation')}</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-summary" ${syncOpts.summary ? 'checked' : ''}>
              <span class="glass-sync-chip-label">${t('settings.syncSummary')}</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-knowledge" ${syncOpts.knowledge ? 'checked' : ''}>
              <span class="glass-sync-chip-label">${t('settings.syncKnowledge')}</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-annotation" ${syncOpts.annotation ? 'checked' : ''}>
              <span class="glass-sync-chip-label">${t('settings.syncAnnotation')}</span>
            </label>
            <label class="glass-sync-chip">
              <input type="checkbox" id="sync-opt-browseTrail" ${syncOpts.browseTrail ? 'checked' : ''}>
              <span class="glass-sync-chip-label">${t('settings.syncBrowseTrail')}</span>
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
            ${t('settings.upload')}
          </button>
          <button class="glass-btn glass-btn-secondary" id="sync-from-cloud-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            ${t('settings.download')}
          </button>
        </div>
        <div id="backup-history-section" style="display: ${auth.syncEnabled ? 'block' : 'none'}">
          <div class="glass-backup-header">
            <span class="glass-form-label">${t('settings.backupHistory')}</span>
            <button class="glass-backup-refresh-btn" id="refresh-backups-btn" title="${t('common.refresh')}">
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
              <span>${t('common.loading')}</span>
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
        ${t('settings.googleLogin')}
      </button>
      <span class="glass-form-hint">${t('settings.loginHint')}</span>
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
      <span class="glass-header-title">${t('settings.menuManagement')}</span>
      <div class="glass-header-actions"></div>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body glass-settings-body">
      <div class="glass-settings-flat">
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.globalMenuItems')}</div>
          <span class="glass-form-hint">${t('settings.dragToSort')}</span>
          <div class="glass-menu-list" id="menu-list">
            ${sortedItems.map(item => getMenuItemHTML(item)).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="glass-footer">
      <button class="glass-btn glass-btn-add">${t('settings.addCustomMenuItem')}</button>
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
      <span class="glass-menu-label">${item.customLabel || t(item.label)}</span>
      ${isCustom ? `
        <button class="glass-menu-btn glass-menu-edit" data-id="${item.id}" title="${t('common.edit')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
          </svg>
        </button>
        <button class="glass-menu-btn glass-menu-delete" data-id="${item.id}" title="${t('common.delete')}">
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
