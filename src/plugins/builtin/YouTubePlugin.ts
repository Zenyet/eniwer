// YouTube Plugin — manages subtitle translation, overlay, and TTS as a self-contained plugin

import type { Plugin, SettingsContributor, PluginContext } from '../../plugins';
import type { MenuConfig } from '../../types';
import { DEFAULT_YOUTUBE_SUBTITLE_CONFIG, DEFAULT_TTS_CONFIG } from '../../types';
import { YouTubeSubtitleManager } from '../../content/youtube';
import { t } from '../../i18n';
import { icons } from '../../icons';

export class YouTubePlugin implements Plugin, SettingsContributor {
  readonly id = 'youtube';
  readonly name = 'YouTube Subtitles';
  readonly description = 'plugin.youtube.description';
  readonly icon = icons.youtube;

  private ctx!: PluginContext;
  private manager: YouTubeSubtitleManager;

  constructor(config: MenuConfig) {
    this.manager = new YouTubeSubtitleManager(config);
  }

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
    const config = ctx.getConfig();
    this.manager.updateConfig(config);
    this.manager.init();

    ctx.onConfigChange((newConfig) => {
      this.manager.updateConfig(newConfig);
    });
  }

  deactivate(): void {
    this.manager.destroy();
  }

  // ========================================
  // SettingsContributor
  // ========================================

  getSettingsHTML(config: MenuConfig): string {
    return `
        <!-- YouTube 字幕 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.youtubeSubtitleToolsSection')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.youtubeSubtitleEnabled')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="yt-subtitle-enabled" ${(config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG).enabled ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.youtubeSubtitleHint')}</span>
          </div>
          <div class="glass-form-group-stack" id="yt-subtitle-settings"${(config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG).enabled ? '' : ' style="display: none"'}>
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
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.ttsEnabled')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="tts-enabled" ${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).enabled ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.ttsHint')}</span>
          </div>
          <div class="glass-form-group-stack" id="tts-settings"${(config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG).enabled ? '' : ' style="display: none"'}>
            <div class="glass-form-group">
              <label class="glass-form-label">${t('settings.ttsEngine')}</label>
              <select class="glass-select" id="tts-engine">
                <option value="native"${(config.youtubeSubtitleTTS?.engine || 'native') === 'native' ? ' selected' : ''}>${t('settings.ttsEngineNative')}</option>
                <option value="edge"${config.youtubeSubtitleTTS?.engine === 'edge' ? ' selected' : ''}>${t('settings.ttsEngineEdge')}</option>
                <option value="cloud"${config.youtubeSubtitleTTS?.engine === 'cloud' ? ' selected' : ''}>${t('settings.ttsEngineCloud')}</option>
              </select>
            </div>
            <div id="tts-edge-settings" style="display: ${config.youtubeSubtitleTTS?.engine === 'edge' ? 'block' : 'none'}">
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
            <div class="glass-form-group" id="tts-voice-group">
              <label class="glass-form-label">${t('settings.ttsVoice')}</label>
              <div id="tts-voice-container">
                ${(config.youtubeSubtitleTTS?.engine === 'edge')
                  ? `<select class="glass-select" id="tts-voice"><option value="${config.youtubeSubtitleTTS?.voice || ''}">${config.youtubeSubtitleTTS?.voice || t('settings.ttsVoiceLoading')}</option></select>`
                  : `<input type="text" class="glass-input" id="tts-voice" value="${config.youtubeSubtitleTTS?.voice || ''}" placeholder="${t('settings.ttsVoicePlaceholder')}">`
                }
              </div>
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
        </div>`;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const ytSubtitleConfig = tempConfig.youtubeSubtitle || {
      enabled: false,
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      fontSize: 'medium' as const,
      displayMode: 'bilingual' as const,
    };
    const ttsConfig = tempConfig.youtubeSubtitleTTS || { ...DEFAULT_TTS_CONFIG };

    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    tempConfig.youtubeSubtitleTTS = ttsConfig;

    const changed = onChange;

    // --- YouTube Subtitle settings ---
    const ytSubtitleSettings = shadowRoot.querySelector('#yt-subtitle-settings') as HTMLElement | null;
    bindToggle(shadowRoot, '#yt-subtitle-enabled', (input) => {
      ytSubtitleConfig.enabled = input.checked;
      tempConfig.youtubeSubtitle = ytSubtitleConfig;
      if (ytSubtitleSettings) ytSubtitleSettings.style.display = input.checked ? 'block' : 'none';
      changed();
    });
    bindSelect(shadowRoot, '#yt-subtitle-source-lang', (select) => {
      ytSubtitleConfig.sourceLanguage = select.value;
      tempConfig.youtubeSubtitle = ytSubtitleConfig;
      changed();
    });
    bindSelect(shadowRoot, '#yt-subtitle-target-lang', (select) => {
      ytSubtitleConfig.targetLanguage = select.value;
      tempConfig.youtubeSubtitle = ytSubtitleConfig;
      changed();
    });
    bindSelect(shadowRoot, '#yt-subtitle-font-size', (select) => {
      ytSubtitleConfig.fontSize = select.value as 'small' | 'medium' | 'large';
      tempConfig.youtubeSubtitle = ytSubtitleConfig;
      changed();
    });
    bindSelect(shadowRoot, '#yt-subtitle-display-mode', (select) => {
      ytSubtitleConfig.displayMode = select.value as 'bilingual' | 'translated';
      tempConfig.youtubeSubtitle = ytSubtitleConfig;
      changed();
    });

    // --- TTS settings ---
    const ttsSettings = shadowRoot.querySelector('#tts-settings') as HTMLElement | null;
    const ttsCloudSettings = shadowRoot.querySelector('#tts-cloud-settings') as HTMLElement | null;
    const ttsEdgeSettings = shadowRoot.querySelector('#tts-edge-settings') as HTMLElement | null;
    const ttsVoiceContainer = shadowRoot.querySelector('#tts-voice-container') as HTMLElement | null;
    const ttsCustomUrlGroup = shadowRoot.querySelector('#tts-custom-url-group') as HTMLElement | null;

    const switchToTextInput = () => {
      if (!ttsVoiceContainer) return;
      ttsVoiceContainer.innerHTML = `<input type="text" class="glass-input" id="tts-voice" value="${ttsConfig.voice || ''}" placeholder="${t('settings.ttsVoicePlaceholder')}">`;
      const newInput = ttsVoiceContainer.querySelector('#tts-voice') as HTMLInputElement | null;
      newInput?.addEventListener('input', () => {
        ttsConfig.voice = newInput.value;
        tempConfig.youtubeSubtitleTTS = ttsConfig;
        changed();
      });
    };

    const loadEdgeVoices = async () => {
      if (!ttsVoiceContainer) return;
      ttsVoiceContainer.innerHTML = `<select class="glass-select" id="tts-voice"><option value="">${t('settings.ttsVoiceLoading')}</option></select>`;
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'EDGE_VOICE_LIST' });
        if (resp.success && Array.isArray(resp.voices)) {
          const voices = resp.voices as { ShortName: string; Locale: string; Gender: string }[];
          const priority = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'zh-TW', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'];
          const grouped = new Map<string, typeof voices>();
          for (const voice of voices) {
            const locale = voice.Locale || voice.ShortName.split('-').slice(0, 2).join('-');
            if (!grouped.has(locale)) grouped.set(locale, []);
            grouped.get(locale)!.push(voice);
          }
          const sortedLocales = [...grouped.keys()].sort((a, b) => {
            const ai = priority.indexOf(a);
            const bi = priority.indexOf(b);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return a.localeCompare(b);
          });

          let html = '<select class="glass-select" id="tts-voice">';
          for (const locale of sortedLocales) {
            html += `<optgroup label="${locale}">`;
            for (const voice of grouped.get(locale) || []) {
              const selected = voice.ShortName === ttsConfig.voice ? ' selected' : '';
              html += `<option value="${voice.ShortName}"${selected}>${voice.ShortName} (${voice.Gender})</option>`;
            }
            html += '</optgroup>';
          }
          html += '</select>';
          ttsVoiceContainer.innerHTML = html;

          const newSelect = ttsVoiceContainer.querySelector('#tts-voice') as HTMLSelectElement | null;
          newSelect?.addEventListener('change', () => {
            ttsConfig.voice = newSelect.value;
            tempConfig.youtubeSubtitleTTS = ttsConfig;
            changed();
          });
        } else {
          ttsVoiceContainer.innerHTML = `<select class="glass-select" id="tts-voice"><option value="">${t('settings.ttsVoiceLoadError')}</option></select>`;
        }
      } catch {
        ttsVoiceContainer.innerHTML = `<select class="glass-select" id="tts-voice"><option value="">${t('settings.ttsVoiceLoadError')}</option></select>`;
      }
    };

    bindToggle(shadowRoot, '#tts-enabled', (input) => {
      ttsConfig.enabled = input.checked;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      if (ttsSettings) ttsSettings.style.display = input.checked ? 'block' : 'none';
      changed();
    });

    bindSelect(shadowRoot, '#tts-engine', (select) => {
      ttsConfig.engine = select.value as 'native' | 'cloud' | 'edge';
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      if (ttsCloudSettings) ttsCloudSettings.style.display = ttsConfig.engine === 'cloud' ? 'block' : 'none';
      if (ttsEdgeSettings) ttsEdgeSettings.style.display = ttsConfig.engine === 'edge' ? 'block' : 'none';
      if (ttsConfig.engine === 'edge') {
        void loadEdgeVoices();
      } else {
        switchToTextInput();
      }
      changed();
    });

    if (ttsConfig.engine === 'edge') {
      void loadEdgeVoices();
    }

    bindSelect(shadowRoot, '#tts-cloud-provider', (select) => {
      ttsConfig.cloudProvider = select.value as 'openai' | 'custom';
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      if (ttsCustomUrlGroup) ttsCustomUrlGroup.style.display = ttsConfig.cloudProvider === 'custom' ? 'flex' : 'none';
      changed();
    });
    bindText(shadowRoot, '#tts-cloud-api-key', (input) => {
      ttsConfig.cloudApiKey = input.value;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
    bindText(shadowRoot, '#tts-cloud-api-url', (input) => {
      ttsConfig.cloudApiUrl = input.value;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
    bindText(shadowRoot, '#tts-cloud-model', (input) => {
      ttsConfig.cloudModel = input.value;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });

    if (ttsConfig.engine !== 'edge') {
      bindText(shadowRoot, '#tts-voice', (input) => {
        ttsConfig.voice = input.value;
        tempConfig.youtubeSubtitleTTS = ttsConfig;
        changed();
      });
    }

    bindSelect(shadowRoot, '#tts-rate', (select) => {
      ttsConfig.rate = parseFloat(select.value);
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
    bindToggle(shadowRoot, '#tts-auto-play', (input) => {
      ttsConfig.autoPlay = input.checked;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
    bindToggle(shadowRoot, '#tts-mute-original', (input) => {
      ttsConfig.muteOriginal = input.checked;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
  }
}

// ========================================
// Local helpers (same pattern as SettingsController)
// ========================================

function bindToggle(root: ParentNode, selector: string, handler: (input: HTMLInputElement) => void): void {
  const input = root.querySelector(selector) as HTMLInputElement | null;
  input?.addEventListener('change', () => handler(input));
}

function bindText(root: ParentNode, selector: string, handler: (input: HTMLInputElement) => void): void {
  const input = root.querySelector(selector) as HTMLInputElement | null;
  input?.addEventListener('input', () => handler(input));
}

function bindSelect(root: ParentNode, selector: string, handler: (input: HTMLSelectElement) => void): void {
  const input = root.querySelector(selector) as HTMLSelectElement | null;
  input?.addEventListener('change', () => handler(input));
}
