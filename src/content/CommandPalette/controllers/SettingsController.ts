import {
  DEFAULT_HISTORY_CONFIG,
  MenuConfig,
  MenuItem,
} from '../../../types';
import { setLocale, t } from '../../../i18n';
import { saveGlobalMenuItems } from '../../../utils/storage';
import { PROVIDER_MODELS } from '../views';
import { getAPIKeyHint } from '../utils';

export interface SettingsControllerDeps {
  getSettingsMenuItems: () => MenuItem[];
  getTheme: () => 'dark' | 'light';
  handleDragStart: (e: MouseEvent) => void;
  onCancelSettings: () => void;
  onClearHistory: () => Promise<void>;
  onLoadStorageUsage: () => Promise<void>;
  onPopView: () => void;
  onRenderCurrentView: () => void;
  onResetSettings: () => Promise<void>;
  onSaveSettings: () => Promise<void>;
  onShowToast: (message: string) => void;
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
  getTheme,
  handleDragStart,
  onCancelSettings,
  onClearHistory,
  onLoadStorageUsage,
  onResetSettings,
  onSaveSettings,
  onUpdateTheme,
  setSettingsChanged,
  shadowRoot,
  tempConfig,
}: SettingsControllerDeps): void {
  const historyConfig = tempConfig.history || { ...DEFAULT_HISTORY_CONFIG };

  const changed = () => {
    setSettingsChanged(true);
  };

  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;
  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', onCancelSettings);
  shadowRoot.querySelector('.glass-btn-cancel')?.addEventListener('click', onCancelSettings);
  shadowRoot.querySelector('.glass-btn-save')?.addEventListener('click', () => void onSaveSettings());

  bindSelectInput(shadowRoot, '#theme-select', (select) => {
    tempConfig.theme = select.value as 'dark' | 'light' | 'system';
    changed();
    onUpdateTheme(tempConfig.theme);
    const panel = shadowRoot.querySelector('.glass-panel');
    panel?.classList.remove('dark', 'light');
    panel?.classList.add(getTheme());
  });

  bindSelectInput(shadowRoot, '#ui-lang-select', (select) => {
    tempConfig.uiLanguage = select.value;
    setLocale(select.value);
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
