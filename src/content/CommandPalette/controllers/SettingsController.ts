import {
  DEFAULT_ANNOTATION_CONFIG,
  DEFAULT_HISTORY_CONFIG,
  DEFAULT_KNOWLEDGE_CONFIG,
  DEFAULT_SCREENSHOT_CONFIG,
  DEFAULT_TTS_CONFIG,
  AuthState,
  KnowledgeConfig,
  MenuConfig,
  MenuItem,
  ScreenshotConfig,
  SyncOptions,
} from '../../../types';
import { setLocale, t } from '../../../i18n';
import { saveGlobalMenuItems } from '../../../utils/storage';
import { PROVIDER_MODELS } from '../views';
import { getAPIKeyHint, getTranslationHint } from '../utils';

export interface SettingsControllerDeps {
  authState: AuthState | null;
  getSettingsMenuItems: () => MenuItem[];
  getTheme: () => 'dark' | 'light';
  handleDragStart: (e: MouseEvent) => void;
  onCancelSettings: () => void;
  onClearHistory: () => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onLoadBackupList: () => Promise<void>;
  onLoadStorageUsage: () => Promise<void>;
  onPopView: () => void;
  onRenderCurrentView: () => void;
  onResetSettings: () => Promise<void>;
  onSaveSettings: () => Promise<void>;
  onShowToast: (message: string) => void;
  onSyncFromCloud: (btn: HTMLButtonElement) => Promise<void>;
  onSyncToCloud: (btn: HTMLButtonElement) => Promise<void>;
  onSyncToggle: (enabled: boolean) => Promise<void>;
  onUpdateTheme: (theme?: 'dark' | 'light' | 'system') => void;
  setSettingsChanged: (changed: boolean) => void;
  setSettingsMenuItems: (items: MenuItem[]) => void;
  shadowRoot: ShadowRoot;
  tempConfig: MenuConfig;
}

function bindToggleInput(
  root: ParentNode,
  selector: string,
  handler: (input: HTMLInputElement) => void
): void {
  const input = root.querySelector(selector) as HTMLInputElement | null;
  input?.addEventListener('change', () => handler(input));
}

function bindTextInput(
  root: ParentNode,
  selector: string,
  handler: (input: HTMLInputElement) => void
): void {
  const input = root.querySelector(selector) as HTMLInputElement | null;
  input?.addEventListener('input', () => handler(input));
}

function bindSelectInput(
  root: ParentNode,
  selector: string,
  handler: (input: HTMLSelectElement) => void
): void {
  const input = root.querySelector(selector) as HTMLSelectElement | null;
  input?.addEventListener('change', () => handler(input));
}

export function bindSettingsEvents({
  authState,
  getTheme,
  handleDragStart,
  onCancelSettings,
  onClearHistory,
  onGoogleLogin,
  onGoogleLogout,
  onLoadBackupList,
  onLoadStorageUsage,
  onResetSettings,
  onSaveSettings,
  onShowToast,
  onSyncFromCloud,
  onSyncToCloud,
  onSyncToggle,
  onUpdateTheme,
  setSettingsChanged,
  shadowRoot,
  tempConfig,
}: SettingsControllerDeps): void {
  const screenshotConfig = tempConfig.screenshot || { ...DEFAULT_SCREENSHOT_CONFIG };
  const historyConfig = tempConfig.history || { ...DEFAULT_HISTORY_CONFIG };
  const annotationConfig = tempConfig.annotation || { ...DEFAULT_ANNOTATION_CONFIG };
  const knowledgeConfig = tempConfig.knowledge || { ...DEFAULT_KNOWLEDGE_CONFIG };
  const imageSearchConfig = tempConfig.imageSearch || { google: true, yandex: true, bing: true, tineye: true };
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

  const changed = () => {
    setSettingsChanged(true);
  };

  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;
  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', onCancelSettings);
  shadowRoot.querySelector('.glass-btn-cancel')?.addEventListener('click', onCancelSettings);
  shadowRoot.querySelector('.glass-btn-save')?.addEventListener('click', () => void onSaveSettings());

  shadowRoot.querySelector('#google-login-btn')?.addEventListener('click', () => void onGoogleLogin());
  shadowRoot.querySelector('#google-relogin-btn')?.addEventListener('click', () => void onGoogleLogin());
  shadowRoot.querySelector('.glass-btn-logout')?.addEventListener('click', () => void onGoogleLogout());

  const syncToggle = shadowRoot.querySelector('#sync-enabled-toggle') as HTMLInputElement | null;
  const syncActions = shadowRoot.querySelector('#sync-actions') as HTMLElement | null;
  const backupSection = shadowRoot.querySelector('#backup-history-section') as HTMLElement | null;
  const syncOptionsSection = shadowRoot.querySelector('#sync-options') as HTMLElement | null;
  syncToggle?.addEventListener('change', () => {
    if (syncActions) syncActions.style.display = syncToggle.checked ? 'flex' : 'none';
    if (backupSection) backupSection.style.display = syncToggle.checked ? 'block' : 'none';
    if (syncOptionsSection) syncOptionsSection.style.display = syncToggle.checked ? 'block' : 'none';
    void onSyncToggle(syncToggle.checked);
    if (syncToggle.checked) {
      void onLoadBackupList();
    }
  });

  const syncOptKeys: Array<{ id: string; key: keyof SyncOptions }> = [
    { id: 'sync-opt-translation', key: 'translation' },
    { id: 'sync-opt-summary', key: 'summary' },
    { id: 'sync-opt-knowledge', key: 'knowledge' },
    { id: 'sync-opt-annotation', key: 'annotation' },
    { id: 'sync-opt-browseTrail', key: 'browseTrail' },
  ];
  for (const { id, key } of syncOptKeys) {
    bindToggleInput(shadowRoot, `#${id}`, (checkbox) => {
      if (!tempConfig.syncOptions) {
        tempConfig.syncOptions = { translation: true, summary: true, knowledge: true, annotation: true, browseTrail: true };
      }
      tempConfig.syncOptions[key] = checkbox.checked;
      changed();
    });
  }

  const syncToCloudBtn = shadowRoot.querySelector('#sync-to-cloud-btn') as HTMLButtonElement | null;
  syncToCloudBtn?.addEventListener('click', () => void onSyncToCloud(syncToCloudBtn));

  const syncFromCloudBtn = shadowRoot.querySelector('#sync-from-cloud-btn') as HTMLButtonElement | null;
  syncFromCloudBtn?.addEventListener('click', () => void onSyncFromCloud(syncFromCloudBtn));

  shadowRoot.querySelector('#refresh-backups-btn')?.addEventListener('click', () => void onLoadBackupList());
  if (authState?.syncEnabled) {
    void onLoadBackupList();
  }

  const translationDeeplxKeyGroup = shadowRoot.querySelector('#translation-deeplx-key-group') as HTMLElement | null;
  const translationCustomUrlGroup = shadowRoot.querySelector('#translation-custom-url-group') as HTMLElement | null;
  const translationHint = shadowRoot.querySelector('#translation-hint') as HTMLElement | null;

  bindSelectInput(shadowRoot, '#translation-provider-select', (select) => {
    const provider = select.value;
    tempConfig.translation = tempConfig.translation || { provider: provider as never };
    tempConfig.translation.provider = provider as never;
    if (translationDeeplxKeyGroup) translationDeeplxKeyGroup.style.display = provider === 'deeplx' ? 'flex' : 'none';
    if (translationCustomUrlGroup) translationCustomUrlGroup.style.display = provider === 'custom' ? 'flex' : 'none';
    if (translationHint) translationHint.textContent = getTranslationHint(provider);
    changed();
  });

  bindTextInput(shadowRoot, '#translation-deeplx-key', (input) => {
    tempConfig.translation = tempConfig.translation || { provider: 'deeplx' };
    tempConfig.translation.deeplxApiKey = input.value;
    changed();
  });

  bindTextInput(shadowRoot, '#translation-custom-url', (input) => {
    tempConfig.translation = tempConfig.translation || { provider: 'custom' };
    tempConfig.translation.customUrl = input.value;
    changed();
  });

  bindSelectInput(shadowRoot, '#theme-select', (select) => {
    tempConfig.theme = select.value as 'dark' | 'light' | 'system';
    changed();
    onUpdateTheme(tempConfig.theme);
    const panel = shadowRoot.querySelector('.glass-panel');
    panel?.classList.remove('dark', 'light');
    panel?.classList.add(getTheme());
  });

  bindSelectInput(shadowRoot, '#popover-position-select', (select) => {
    tempConfig.popoverPosition = select.value as 'above' | 'below';
    changed();
  });

  const popoverPositionGroup = shadowRoot.querySelector('#popover-position-group') as HTMLElement | null;
  bindToggleInput(shadowRoot, '#show-popover-toggle', (input) => {
    tempConfig.showSelectionPopover = input.checked;
    if (popoverPositionGroup) popoverPositionGroup.style.display = input.checked ? 'flex' : 'none';
    changed();
  });

  bindSelectInput(shadowRoot, '#translate-lang-select', (select) => {
    tempConfig.preferredLanguage = select.value;
    changed();
  });

  bindSelectInput(shadowRoot, '#ui-lang-select', (select) => {
    tempConfig.uiLanguage = select.value;
    setLocale(select.value);
    changed();
  });

  bindSelectInput(shadowRoot, '#summary-lang-select', (select) => {
    tempConfig.summaryLanguage = select.value;
    changed();
  });

  const customUrlGroup = shadowRoot.querySelector('#custom-url-group') as HTMLElement | null;
  const customModelGroup = shadowRoot.querySelector('#custom-model-group') as HTMLElement | null;
  const apiKeyHint = shadowRoot.querySelector('#api-key-hint') as HTMLElement | null;
  const modelSelectGroup = shadowRoot.querySelector('#model-select-group') as HTMLElement | null;
  const modelSelect = shadowRoot.querySelector('#model-select') as HTMLSelectElement | null;

  bindSelectInput(shadowRoot, '#api-provider-select', (select) => {
    const provider = select.value as MenuConfig['apiProvider'];
    const isCustom = provider === 'custom';
    if (customUrlGroup) customUrlGroup.style.display = isCustom ? 'flex' : 'none';
    if (customModelGroup) customModelGroup.style.display = isCustom ? 'flex' : 'none';
    if (modelSelectGroup) modelSelectGroup.style.display = isCustom ? 'none' : 'flex';
    if (apiKeyHint) apiKeyHint.textContent = getAPIKeyHint(provider);
    tempConfig.apiProvider = provider;
    if (!isCustom && modelSelect) {
      const models = PROVIDER_MODELS[provider] || [];
      modelSelect.innerHTML = models.map((model) => `<option value="${model.id}">${model.label}</option>`).join('');
      tempConfig.customModel = undefined;
    }
    changed();
  });

  bindSelectInput(shadowRoot, '#model-select', (select) => {
    tempConfig.customModel = select.value || undefined;
    changed();
  });
  bindTextInput(shadowRoot, '#api-key-input', (input) => {
    tempConfig.apiKey = input.value || undefined;
    changed();
  });
  bindTextInput(shadowRoot, '#custom-url-input', (input) => {
    tempConfig.customApiUrl = input.value || undefined;
    changed();
  });
  bindTextInput(shadowRoot, '#custom-model-input', (input) => {
    tempConfig.customModel = input.value || undefined;
    changed();
  });
  bindToggleInput(shadowRoot, '#streaming-toggle', (input) => {
    tempConfig.useStreaming = input.checked;
    changed();
  });
  bindToggleInput(shadowRoot, '#thinking-mode-toggle', (input) => {
    tempConfig.useThinkingModel = input.checked;
    changed();
  });

  bindToggleInput(shadowRoot, '#save-to-file', (input) => {
    screenshotConfig.saveToFile = input.checked;
    tempConfig.screenshot = screenshotConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#copy-to-clipboard', (input) => {
    screenshotConfig.copyToClipboard = input.checked;
    tempConfig.screenshot = screenshotConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#enable-ai', (input) => {
    screenshotConfig.enableAI = input.checked;
    tempConfig.screenshot = screenshotConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#default-ai-action', (select) => {
    screenshotConfig.defaultAIAction = select.value as ScreenshotConfig['defaultAIAction'];
    tempConfig.screenshot = screenshotConfig;
    changed();
  });

  const imageGenSettings = shadowRoot.querySelector('#image-gen-settings') as HTMLElement | null;
  bindToggleInput(shadowRoot, '#enable-image-gen', (input) => {
    screenshotConfig.enableImageGen = input.checked;
    tempConfig.screenshot = screenshotConfig;
    if (imageGenSettings) imageGenSettings.style.display = input.checked ? 'block' : 'none';
    changed();
  });

  const customImageGenUrlGroup = shadowRoot.querySelector('#custom-image-gen-url-group') as HTMLElement | null;
  bindSelectInput(shadowRoot, '#image-gen-provider', (select) => {
    screenshotConfig.imageGenProvider = select.value as ScreenshotConfig['imageGenProvider'];
    tempConfig.screenshot = screenshotConfig;
    if (customImageGenUrlGroup) customImageGenUrlGroup.style.display = select.value === 'custom' ? 'block' : 'none';
    changed();
  });
  bindTextInput(shadowRoot, '#custom-image-gen-url', (input) => {
    screenshotConfig.customImageGenUrl = input.value || undefined;
    tempConfig.screenshot = screenshotConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#image-size-select', (select) => {
    screenshotConfig.imageSize = select.value as ScreenshotConfig['imageSize'];
    tempConfig.screenshot = screenshotConfig;
    changed();
  });

  bindToggleInput(shadowRoot, '#image-search-google', (input) => {
    imageSearchConfig.google = input.checked;
    tempConfig.imageSearch = imageSearchConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#image-search-yandex', (input) => {
    imageSearchConfig.yandex = input.checked;
    tempConfig.imageSearch = imageSearchConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#image-search-bing', (input) => {
    imageSearchConfig.bing = input.checked;
    tempConfig.imageSearch = imageSearchConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#image-search-tineye', (input) => {
    imageSearchConfig.tineye = input.checked;
    tempConfig.imageSearch = imageSearchConfig;
    changed();
  });

  bindSelectInput(shadowRoot, '#history-max-count', (select) => {
    historyConfig.maxSaveCount = parseInt(select.value, 10);
    tempConfig.history = historyConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#history-display-count', (select) => {
    historyConfig.panelDisplayCount = parseInt(select.value, 10);
    tempConfig.history = historyConfig;
    changed();
  });

  shadowRoot.querySelector('#clear-history')?.addEventListener('click', () => {
    if (confirm(t('confirm.clearHistory'))) {
      void onClearHistory();
    }
  });

  bindToggleInput(shadowRoot, '#auto-save-task', (input) => {
    tempConfig.autoSaveTask = input.checked;
    changed();
  });

  const colorPicker = shadowRoot.querySelector('#annotation-color-picker');
  colorPicker?.querySelectorAll('.glass-color-option:not(.glass-color-option-custom)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = (btn as HTMLElement).dataset.color as string;
      annotationConfig.defaultColor = color;
      tempConfig.annotation = annotationConfig;
      colorPicker.querySelectorAll('.glass-color-option').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      changed();
    });
  });

  const customColorDiv = colorPicker?.querySelector('.glass-color-option-custom') as HTMLElement | null;
  bindTextInput(shadowRoot, '#annotation-custom-color', (input) => {
    const hex = input.value;
    annotationConfig.defaultColor = hex;
    tempConfig.annotation = annotationConfig;
    colorPicker?.querySelectorAll('.glass-color-option').forEach((node) => node.classList.remove('active'));
    if (customColorDiv) {
      customColorDiv.classList.add('active');
      customColorDiv.style.setProperty('--color', `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.4)`);
      customColorDiv.style.setProperty('--color-border', `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.8)`);
    }
    changed();
  });

  bindToggleInput(shadowRoot, '#annotation-auto-save', (input) => {
    annotationConfig.autoSaveAIResult = input.checked;
    tempConfig.annotation = annotationConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#annotation-page-filter', (input) => {
    annotationConfig.showPageFilter = input.checked;
    tempConfig.annotation = annotationConfig;
    changed();
  });

  bindSelectInput(shadowRoot, '#knowledge-filter-select', (select) => {
    knowledgeConfig.defaultFilter = select.value as KnowledgeConfig['defaultFilter'];
    tempConfig.knowledge = knowledgeConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#knowledge-max-display', (select) => {
    knowledgeConfig.maxDisplayCount = parseInt(select.value, 10);
    tempConfig.knowledge = knowledgeConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#knowledge-group-date', (input) => {
    knowledgeConfig.groupByDate = input.checked;
    tempConfig.knowledge = knowledgeConfig;
    changed();
  });

  const ytSubtitleSettings = shadowRoot.querySelector('#yt-subtitle-settings') as HTMLElement | null;
  bindToggleInput(shadowRoot, '#yt-subtitle-enabled', (input) => {
    ytSubtitleConfig.enabled = input.checked;
    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    if (ytSubtitleSettings) ytSubtitleSettings.style.display = input.checked ? 'block' : 'none';
    changed();
  });
  bindSelectInput(shadowRoot, '#yt-subtitle-source-lang', (select) => {
    ytSubtitleConfig.sourceLanguage = select.value;
    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#yt-subtitle-target-lang', (select) => {
    ytSubtitleConfig.targetLanguage = select.value;
    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#yt-subtitle-font-size', (select) => {
    ytSubtitleConfig.fontSize = select.value as 'small' | 'medium' | 'large';
    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    changed();
  });
  bindSelectInput(shadowRoot, '#yt-subtitle-display-mode', (select) => {
    ytSubtitleConfig.displayMode = select.value as 'bilingual' | 'translated';
    tempConfig.youtubeSubtitle = ytSubtitleConfig;
    changed();
  });

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

  bindToggleInput(shadowRoot, '#tts-enabled', (input) => {
    ttsConfig.enabled = input.checked;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    if (ttsSettings) ttsSettings.style.display = input.checked ? 'block' : 'none';
    changed();
  });

  bindSelectInput(shadowRoot, '#tts-engine', (select) => {
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

  bindSelectInput(shadowRoot, '#tts-cloud-provider', (select) => {
    ttsConfig.cloudProvider = select.value as 'openai' | 'custom';
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    if (ttsCustomUrlGroup) ttsCustomUrlGroup.style.display = ttsConfig.cloudProvider === 'custom' ? 'flex' : 'none';
    changed();
  });
  bindTextInput(shadowRoot, '#tts-cloud-api-key', (input) => {
    ttsConfig.cloudApiKey = input.value;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });
  bindTextInput(shadowRoot, '#tts-cloud-api-url', (input) => {
    ttsConfig.cloudApiUrl = input.value;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });
  bindTextInput(shadowRoot, '#tts-cloud-model', (input) => {
    ttsConfig.cloudModel = input.value;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });

  if (ttsConfig.engine !== 'edge') {
    bindTextInput(shadowRoot, '#tts-voice', (input) => {
      ttsConfig.voice = input.value;
      tempConfig.youtubeSubtitleTTS = ttsConfig;
      changed();
    });
  }

  bindSelectInput(shadowRoot, '#tts-rate', (select) => {
    ttsConfig.rate = parseFloat(select.value);
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#tts-auto-play', (input) => {
    ttsConfig.autoPlay = input.checked;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });
  bindToggleInput(shadowRoot, '#tts-mute-original', (input) => {
    ttsConfig.muteOriginal = input.checked;
    tempConfig.youtubeSubtitleTTS = ttsConfig;
    changed();
  });

  void onLoadStorageUsage();
  shadowRoot.querySelector('#storage-refresh-btn')?.addEventListener('click', () => void onLoadStorageUsage());

  shadowRoot.querySelector('.glass-btn-reset')?.addEventListener('click', () => {
    if (confirm(t('confirm.resetSettings'))) {
      void onResetSettings();
    }
  });

  shadowRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelSettings();
    }
  });
}

export function bindMenuSettingsEvents({
  getSettingsMenuItems,
  onPopView,
  onRenderCurrentView,
  onShowToast,
  setSettingsMenuItems,
  shadowRoot,
}: Pick<SettingsControllerDeps, 'getSettingsMenuItems' | 'onPopView' | 'onRenderCurrentView' | 'onShowToast' | 'setSettingsMenuItems' | 'shadowRoot'>): void {
  shadowRoot.querySelector('.glass-back-btn')?.addEventListener('click', onPopView);

  shadowRoot.querySelectorAll('.glass-toggle input').forEach((toggle) => {
    toggle.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const item = getSettingsMenuItems().find((menuItem) => menuItem.id === input.dataset.id);
      if (item) {
        item.enabled = input.checked;
        await saveGlobalMenuItems(getSettingsMenuItems());
        onShowToast(t('settings.menuItemUpdated'));
      }
    });
  });

  shadowRoot.querySelectorAll('.glass-menu-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      setSettingsMenuItems(getSettingsMenuItems().filter((item) => item.id !== id));
      await saveGlobalMenuItems(getSettingsMenuItems());
      onRenderCurrentView();
      onShowToast(t('settings.menuItemDeleted'));
    });
  });

  shadowRoot.querySelector('.glass-btn-add')?.addEventListener('click', () => {
    onShowToast(t('settings.addCustomInSettings'));
  });

  setupMenuDragDrop(shadowRoot, getSettingsMenuItems);

  shadowRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onPopView();
    }
  });
}

async function persistMenuOrder(list: Element, settingsMenuItems: MenuItem[]): Promise<void> {
  const items = list.querySelectorAll('.glass-menu-item');
  items.forEach((item, index) => {
    const id = (item as HTMLElement).dataset.id;
    const menuItem = settingsMenuItems.find((entry) => entry.id === id);
    if (menuItem) {
      menuItem.order = index;
    }
  });
  await saveGlobalMenuItems(settingsMenuItems);
}

function setupMenuDragDrop(shadowRoot: ShadowRoot, getSettingsMenuItems: () => MenuItem[]): void {
  const list = shadowRoot.querySelector('#menu-list');
  if (!list) return;

  let draggedItem: HTMLElement | null = null;

  list.querySelectorAll('.glass-menu-item').forEach((item) => {
    const element = item as HTMLElement;

    element.addEventListener('dragstart', () => {
      draggedItem = element;
      setTimeout(() => element.classList.add('dragging'), 0);
    });

    element.addEventListener('dragend', async () => {
      element.classList.remove('dragging');
      draggedItem = null;
      await persistMenuOrder(list, getSettingsMenuItems());
    });

    element.addEventListener('dragover', (event) => {
      event.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (event) => {
      event.preventDefault();
      element.classList.remove('drag-over');
      if (!draggedItem || draggedItem === element) return;

      const rect = element.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if ((event as DragEvent).clientY < midY) {
        list.insertBefore(draggedItem, element);
      } else {
        list.insertBefore(draggedItem, element.nextSibling);
      }
    });
  });
}
