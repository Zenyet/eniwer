// ImageSearchPlugin — manages right-click image search settings

import { t } from '../../i18n';
import { icons } from '../../icons';
import type { Plugin, SettingsContributor, PluginContext } from '../types';
import type { MenuConfig } from '../../types';

export class ImageSearchPlugin implements Plugin, SettingsContributor {
  readonly id = 'imageSearch';
  readonly name = 'Image Search';
  readonly description = 'plugin.imageSearch.description';
  readonly icon = icons.image;

  private ctx!: PluginContext;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {}

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    const imageSearchConfig = config.imageSearch || { google: true, yandex: true, bing: true, tineye: true };
    return `
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
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const imageSearchConfig = tempConfig.imageSearch || { google: true, yandex: true, bing: true, tineye: true };

    const bind = (id: string, key: keyof typeof imageSearchConfig) => {
      const input = shadowRoot.querySelector(`#${id}`) as HTMLInputElement | null;
      input?.addEventListener('change', () => {
        imageSearchConfig[key] = input.checked;
        tempConfig.imageSearch = imageSearchConfig;
        onChange();
      });
    };

    bind('image-search-google', 'google');
    bind('image-search-yandex', 'yandex');
    bind('image-search-bing', 'bing');
    bind('image-search-tineye', 'tineye');
  }
}
