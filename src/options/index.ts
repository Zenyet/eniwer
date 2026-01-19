import './styles.css';
import { getStorageData, saveConfig, saveSelectionMenuItems, saveGlobalMenuItems } from '../utils/storage';
import { DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, DEFAULT_SCREENSHOT_CONFIG, MenuConfig, MenuItem, CustomMenuItem, ScreenshotConfig } from '../types';
import { icons, IconName } from '../icons';

// Track current menu items state
let selectionMenuItems: MenuItem[] = [];
let globalMenuItems: MenuItem[] = [];

// Modal state
let currentMenuType: 'selection' | 'global' = 'selection';
let editingItemId: string | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  const apiProviderEl = document.getElementById('apiProvider') as HTMLSelectElement;
  const apiKeyEl = document.getElementById('apiKey') as HTMLInputElement;
  const customApiUrlEl = document.getElementById('customApiUrl') as HTMLInputElement;
  const customModelEl = document.getElementById('customModel') as HTMLInputElement;
  const customApiUrlGroup = document.getElementById('customApiUrlGroup') as HTMLDivElement;
  const customModelGroup = document.getElementById('customModelGroup') as HTMLDivElement;
  const apiKeyHelpText = document.getElementById('apiKeyHelpText') as HTMLParagraphElement;
  const useStreamingEl = document.getElementById('useStreaming') as HTMLInputElement;
  const preferredLanguageEl = document.getElementById('preferredLanguage') as HTMLSelectElement;
  const themeEl = document.getElementById('theme') as HTMLSelectElement;
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const shortcutDisplayEl = document.getElementById('shortcutDisplay');
  const recordShortcutBtn = document.getElementById('recordShortcutBtn');
  const shortcutHelpText = document.getElementById('shortcutHelpText');

  // Screenshot settings elements
  const screenshotSaveToFileEl = document.getElementById('screenshotSaveToFile') as HTMLInputElement;
  const screenshotCopyToClipboardEl = document.getElementById('screenshotCopyToClipboard') as HTMLInputElement;
  const screenshotEnableAIEl = document.getElementById('screenshotEnableAI') as HTMLInputElement;
  const screenshotDefaultAIActionEl = document.getElementById('screenshotDefaultAIAction') as HTMLSelectElement;
  const screenshotEnableImageGenEl = document.getElementById('screenshotEnableImageGen') as HTMLInputElement;
  const imageGenProviderEl = document.getElementById('imageGenProvider') as HTMLSelectElement;
  const customImageGenUrlEl = document.getElementById('customImageGenUrl') as HTMLInputElement;
  const customImageGenUrlGroup = document.getElementById('customImageGenUrlGroup') as HTMLDivElement;
  const imageSizeEl = document.getElementById('imageSize') as HTMLSelectElement;

  let isRecording = false;
  let currentShortcut = 'Alt+Tab';

  // Load current settings
  const data = await getStorageData();
  const config = data.config;
  const screenshotConfig = config.screenshot || DEFAULT_SCREENSHOT_CONFIG;
  selectionMenuItems = data.selectionMenuItems;
  globalMenuItems = data.globalMenuItems;

  // Ensure all items have enabled and order fields (migration)
  selectionMenuItems = migrateMenuItems(selectionMenuItems, DEFAULT_SELECTION_MENU);
  globalMenuItems = migrateMenuItems(globalMenuItems, DEFAULT_GLOBAL_MENU);

  apiProviderEl.value = config.apiProvider;
  apiKeyEl.value = config.apiKey || '';
  customApiUrlEl.value = config.customApiUrl || '';
  customModelEl.value = config.customModel || '';
  useStreamingEl.checked = config.useStreaming ?? true;
  preferredLanguageEl.value = config.preferredLanguage;
  themeEl.value = config.theme;
  currentShortcut = config.shortcut || 'Alt+Tab';
  updateShortcutDisplay(currentShortcut);
  toggleCustomProviderUI(config.apiProvider);

  // Populate screenshot settings
  screenshotSaveToFileEl.checked = screenshotConfig.saveToFile;
  screenshotCopyToClipboardEl.checked = screenshotConfig.copyToClipboard;
  screenshotEnableAIEl.checked = screenshotConfig.enableAI;
  screenshotDefaultAIActionEl.value = screenshotConfig.defaultAIAction;
  screenshotEnableImageGenEl.checked = screenshotConfig.enableImageGen;
  imageGenProviderEl.value = screenshotConfig.imageGenProvider;
  customImageGenUrlEl.value = screenshotConfig.customImageGenUrl || '';
  imageSizeEl.value = screenshotConfig.imageSize;
  toggleImageGenProviderUI(screenshotConfig.imageGenProvider);

  // Render menu configuration
  renderMenuList('selectionMenuList', selectionMenuItems);
  renderMenuList('globalMenuList', globalMenuItems);

  // Setup modal
  setupModal();

  // Setup add item buttons
  document.getElementById('addSelectionItem')?.addEventListener('click', () => {
    currentMenuType = 'selection';
    editingItemId = null;
    openModal('添加自定义菜单项');
  });

  document.getElementById('addGlobalItem')?.addEventListener('click', () => {
    currentMenuType = 'global';
    editingItemId = null;
    openModal('添加自定义菜单项');
  });

  // Handle provider change
  apiProviderEl.addEventListener('change', () => {
    toggleCustomProviderUI(apiProviderEl.value);
  });

  function toggleCustomProviderUI(provider: string) {
    const isCustom = provider === 'custom';
    customApiUrlGroup.style.display = isCustom ? 'block' : 'none';
    customModelGroup.style.display = isCustom ? 'block' : 'none';

    if (provider === 'groq') {
      apiKeyHelpText.textContent = '使用 Groq 免费服务无需配置 API Key';
    } else if (isCustom) {
      apiKeyHelpText.textContent = '如果你的 API 需要认证，请填写 API Key';
    } else {
      apiKeyHelpText.textContent = `请填写你的 ${provider.toUpperCase()} API Key`;
    }
  }

  function toggleImageGenProviderUI(provider: string) {
    const isCustom = provider === 'custom';
    customImageGenUrlGroup.style.display = isCustom ? 'block' : 'none';
  }

  // Handle image gen provider change
  imageGenProviderEl?.addEventListener('change', () => {
    toggleImageGenProviderUI(imageGenProviderEl.value);
  });

  // Handle shortcut recording
  recordShortcutBtn?.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function startRecording() {
    isRecording = true;
    recordShortcutBtn!.textContent = '取消录制';
    recordShortcutBtn!.classList.add('recording');
    shortcutDisplayEl!.classList.add('recording');
    shortcutHelpText!.textContent = '请按下快捷键组合... (ESC 取消)';
    document.addEventListener('keydown', handleShortcutKeyDown);
  }

  function stopRecording() {
    isRecording = false;
    recordShortcutBtn!.textContent = '录制快捷键';
    recordShortcutBtn!.classList.remove('recording');
    shortcutDisplayEl!.classList.remove('recording');
    shortcutHelpText!.textContent = '点击"录制快捷键"按钮，然后按下你想要的快捷键组合';
    document.removeEventListener('keydown', handleShortcutKeyDown);
  }

  function handleShortcutKeyDown(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      stopRecording();
      return;
    }

    // Build shortcut string
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Add the actual key (excluding modifiers)
    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      // Format special keys
      const formattedKey = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;
      parts.push(formattedKey);

      if (parts.length >= 2) {
        currentShortcut = parts.join('+');
        updateShortcutDisplay(currentShortcut);
        stopRecording();
        showToast('快捷键已设置，请点击保存按钮');
      }
    }
  }

  function updateShortcutDisplay(shortcut: string) {
    if (shortcutDisplayEl) {
      const keys = shortcut.split('+');
      shortcutDisplayEl.innerHTML = keys.map((key, index) => {
        const separator = index < keys.length - 1 ? '<span class="plus">+</span>' : '';
        return `<span class="key">${key}</span>${separator}`;
      }).join('');
    }
  }

  // Save settings
  saveBtn?.addEventListener('click', async () => {
    const provider = apiProviderEl.value as MenuConfig['apiProvider'];

    // Validate custom provider config
    if (provider === 'custom') {
      if (!customApiUrlEl.value) {
        showToast('请填写自定义 API URL', 'error');
        return;
      }
      if (!customModelEl.value) {
        showToast('请填写模型名称', 'error');
        return;
      }
      try {
        new URL(customApiUrlEl.value);
      } catch {
        showToast('API URL 格式不正确', 'error');
        return;
      }
    }

    const newScreenshotConfig: ScreenshotConfig = {
      saveToFile: screenshotSaveToFileEl.checked,
      copyToClipboard: screenshotCopyToClipboardEl.checked,
      enableAI: screenshotEnableAIEl.checked,
      defaultAIAction: screenshotDefaultAIActionEl.value as ScreenshotConfig['defaultAIAction'],
      imageQuality: 0.92,
      enableImageGen: screenshotEnableImageGenEl.checked,
      imageGenProvider: imageGenProviderEl.value as ScreenshotConfig['imageGenProvider'],
      customImageGenUrl: customImageGenUrlEl.value || undefined,
      imageSize: imageSizeEl.value as ScreenshotConfig['imageSize'],
    };

    const newConfig: Partial<MenuConfig> = {
      apiProvider: provider,
      apiKey: apiKeyEl.value || undefined,
      customApiUrl: customApiUrlEl.value || undefined,
      customModel: customModelEl.value || undefined,
      useStreaming: useStreamingEl.checked,
      preferredLanguage: preferredLanguageEl.value,
      theme: themeEl.value as MenuConfig['theme'],
      shortcut: currentShortcut,
      screenshot: newScreenshotConfig,
    };

    await saveConfig(newConfig);
    await saveSelectionMenuItems(selectionMenuItems);
    await saveGlobalMenuItems(globalMenuItems);
    showToast('设置已保存', 'success');
  });

  // Reset settings
  resetBtn?.addEventListener('click', async () => {
    await saveConfig(DEFAULT_CONFIG);
    await saveSelectionMenuItems(DEFAULT_SELECTION_MENU);
    await saveGlobalMenuItems(DEFAULT_GLOBAL_MENU);

    apiProviderEl.value = DEFAULT_CONFIG.apiProvider;
    apiKeyEl.value = '';
    customApiUrlEl.value = '';
    customModelEl.value = '';
    useStreamingEl.checked = DEFAULT_CONFIG.useStreaming;
    preferredLanguageEl.value = DEFAULT_CONFIG.preferredLanguage;
    themeEl.value = DEFAULT_CONFIG.theme;
    currentShortcut = DEFAULT_CONFIG.shortcut;
    updateShortcutDisplay(currentShortcut);
    toggleCustomProviderUI(DEFAULT_CONFIG.apiProvider);

    // Reset screenshot settings
    screenshotSaveToFileEl.checked = DEFAULT_SCREENSHOT_CONFIG.saveToFile;
    screenshotCopyToClipboardEl.checked = DEFAULT_SCREENSHOT_CONFIG.copyToClipboard;
    screenshotEnableAIEl.checked = DEFAULT_SCREENSHOT_CONFIG.enableAI;
    screenshotDefaultAIActionEl.value = DEFAULT_SCREENSHOT_CONFIG.defaultAIAction;
    screenshotEnableImageGenEl.checked = DEFAULT_SCREENSHOT_CONFIG.enableImageGen;
    imageGenProviderEl.value = DEFAULT_SCREENSHOT_CONFIG.imageGenProvider;
    customImageGenUrlEl.value = '';
    imageSizeEl.value = DEFAULT_SCREENSHOT_CONFIG.imageSize;
    toggleImageGenProviderUI(DEFAULT_SCREENSHOT_CONFIG.imageGenProvider);

    // Reset menu items
    selectionMenuItems = [...DEFAULT_SELECTION_MENU];
    globalMenuItems = [...DEFAULT_GLOBAL_MENU];
    renderMenuList('selectionMenuList', selectionMenuItems);
    renderMenuList('globalMenuList', globalMenuItems);

    showToast('已重置为默认设置', 'success');
  });
});

// Migration helper for existing items without enabled/order fields
function migrateMenuItems(items: MenuItem[], defaults: MenuItem[]): MenuItem[] {
  return items.map((item, index) => {
    const defaultItem = defaults.find(d => d.id === item.id);
    return {
      ...item,
      enabled: item.enabled ?? true,
      order: item.order ?? (defaultItem?.order ?? index),
    };
  });
}

// Render menu items list
function renderMenuList(listId: string, items: MenuItem[]) {
  const list = document.getElementById(listId);
  if (!list) return;

  // Sort by order
  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  list.innerHTML = sortedItems.map(item => {
    const isCustom = (item as CustomMenuItem).isCustom;
    return `
      <div class="menu-item-config" draggable="true" data-id="${item.id}">
        <span class="drag-handle">⋮⋮</span>
        <span class="item-icon">${item.customIcon || item.icon}</span>
        <span class="item-label">${item.customLabel || item.label}</span>
        <span class="item-action">${item.action}</span>
        <div class="item-actions">
          ${isCustom ? `
            <button class="item-btn edit" data-id="${item.id}" title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
              </svg>
            </button>
            <button class="item-btn delete" data-id="${item.id}" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          ` : ''}
          <label class="toggle-switch small">
            <input type="checkbox" ${item.enabled ? 'checked' : ''} data-id="${item.id}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  // Setup event listeners
  setupDragAndDrop(listId);
  setupToggleListeners(listId);
  setupItemButtons(listId);
}

// Setup drag and drop
function setupDragAndDrop(listId: string) {
  const list = document.getElementById(listId);
  if (!list) return;

  const items = list.querySelectorAll('.menu-item-config');
  let draggedItem: HTMLElement | null = null;

  items.forEach(item => {
    const el = item as HTMLElement;

    el.addEventListener('dragstart', (e) => {
      draggedItem = el;
      el.classList.add('dragging');
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      draggedItem = null;
      // Update order based on DOM position
      updateOrderFromDOM(listId);
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      el.classList.add('drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (draggedItem && draggedItem !== el) {
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if ((e as DragEvent).clientY < midY) {
          list.insertBefore(draggedItem, el);
        } else {
          list.insertBefore(draggedItem, el.nextSibling);
        }
      }
    });
  });
}

// Update order based on DOM position
function updateOrderFromDOM(listId: string) {
  const list = document.getElementById(listId);
  if (!list) return;

  const items = list.querySelectorAll('.menu-item-config');
  const isSelection = listId === 'selectionMenuList';
  const menuItems = isSelection ? selectionMenuItems : globalMenuItems;

  items.forEach((item, index) => {
    const id = (item as HTMLElement).dataset.id;
    const menuItem = menuItems.find(m => m.id === id);
    if (menuItem) {
      menuItem.order = index;
    }
  });
}

// Setup toggle listeners
function setupToggleListeners(listId: string) {
  const list = document.getElementById(listId);
  if (!list) return;

  const toggles = list.querySelectorAll('.toggle-switch input');
  const isSelection = listId === 'selectionMenuList';
  const menuItems = isSelection ? selectionMenuItems : globalMenuItems;

  toggles.forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const id = input.dataset.id;
      const menuItem = menuItems.find(m => m.id === id);
      if (menuItem) {
        menuItem.enabled = input.checked;
      }
    });
  });
}

// Setup item buttons (edit, delete)
function setupItemButtons(listId: string) {
  const list = document.getElementById(listId);
  if (!list) return;

  const isSelection = listId === 'selectionMenuList';

  // Edit buttons
  list.querySelectorAll('.item-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id) {
        currentMenuType = isSelection ? 'selection' : 'global';
        editingItemId = id;
        const menuItems = isSelection ? selectionMenuItems : globalMenuItems;
        const item = menuItems.find(m => m.id === id) as CustomMenuItem;
        if (item) {
          openModal('编辑自定义菜单项', item);
        }
      }
    });
  });

  // Delete buttons
  list.querySelectorAll('.item-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id) {
        if (isSelection) {
          selectionMenuItems = selectionMenuItems.filter(m => m.id !== id);
          renderMenuList('selectionMenuList', selectionMenuItems);
        } else {
          globalMenuItems = globalMenuItems.filter(m => m.id !== id);
          renderMenuList('globalMenuList', globalMenuItems);
        }
        showToast('菜单项已删除');
      }
    });
  });
}

// Modal functions
function setupModal() {
  const modal = document.getElementById('customItemModal');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn = document.getElementById('cancelCustomItem');
  const saveBtn = document.getElementById('saveCustomItem');
  const actionSelect = document.getElementById('customItemAction') as HTMLSelectElement;
  const promptGroup = document.getElementById('customPromptGroup');
  const urlGroup = document.getElementById('customUrlGroup');

  // Render icon picker
  renderIconPicker();

  // Close modal events
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Handle action type change
  actionSelect?.addEventListener('change', () => {
    const action = actionSelect.value;
    if (promptGroup) promptGroup.style.display = action === 'customAI' ? 'block' : 'none';
    if (urlGroup) urlGroup.style.display = action === 'openUrl' ? 'block' : 'none';
  });

  // Save custom item
  saveBtn?.addEventListener('click', () => {
    const selectedIcon = (document.getElementById('selectedIcon') as HTMLInputElement).value;
    const label = (document.getElementById('customItemLabel') as HTMLInputElement).value.trim();
    const action = (document.getElementById('customItemAction') as HTMLSelectElement).value;
    const prompt = (document.getElementById('customPrompt') as HTMLTextAreaElement).value.trim();
    const url = (document.getElementById('customUrl') as HTMLInputElement).value.trim();

    // Validation
    if (!selectedIcon) {
      showToast('请选择一个图标', 'error');
      return;
    }
    if (!label) {
      showToast('请输入菜单项名称', 'error');
      return;
    }
    if (action === 'customAI' && !prompt) {
      showToast('请输入 AI 提示词', 'error');
      return;
    }
    if (action === 'openUrl' && !url) {
      showToast('请输入链接地址', 'error');
      return;
    }

    const menuItems = currentMenuType === 'selection' ? selectionMenuItems : globalMenuItems;
    const iconSvg = icons[selectedIcon as IconName];

    if (editingItemId) {
      // Update existing item
      const item = menuItems.find(m => m.id === editingItemId) as CustomMenuItem;
      if (item) {
        item.icon = iconSvg;
        item.label = label;
        item.action = action;
        if (action === 'customAI') {
          item.customPrompt = prompt;
        }
      }
    } else {
      // Create new item
      const newItem: CustomMenuItem = {
        id: `custom_${Date.now()}`,
        icon: iconSvg,
        label: label,
        action: action,
        enabled: true,
        order: menuItems.length,
        isCustom: true,
        customPrompt: action === 'customAI' ? prompt : undefined,
      };

      if (currentMenuType === 'selection') {
        selectionMenuItems.push(newItem);
      } else {
        globalMenuItems.push(newItem);
      }
    }

    // Re-render the list
    if (currentMenuType === 'selection') {
      renderMenuList('selectionMenuList', selectionMenuItems);
    } else {
      renderMenuList('globalMenuList', globalMenuItems);
    }

    closeModal();
    showToast(editingItemId ? '菜单项已更新' : '菜单项已添加', 'success');
  });
}

function renderIconPicker() {
  const picker = document.getElementById('iconPicker');
  if (!picker) return;

  const iconNames = Object.keys(icons) as IconName[];
  picker.innerHTML = iconNames.map(name => `
    <div class="icon-option" data-icon="${name}" title="${name}">
      ${icons[name]}
    </div>
  `).join('');

  // Setup click handlers
  picker.querySelectorAll('.icon-option').forEach(option => {
    option.addEventListener('click', () => {
      picker.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      (document.getElementById('selectedIcon') as HTMLInputElement).value = (option as HTMLElement).dataset.icon || '';
    });
  });
}

function openModal(title: string, item?: CustomMenuItem) {
  const modal = document.getElementById('customItemModal');
  const modalTitle = document.getElementById('modalTitle');
  const selectedIconInput = document.getElementById('selectedIcon') as HTMLInputElement;
  const labelInput = document.getElementById('customItemLabel') as HTMLInputElement;
  const actionSelect = document.getElementById('customItemAction') as HTMLSelectElement;
  const promptTextarea = document.getElementById('customPrompt') as HTMLTextAreaElement;
  const urlInput = document.getElementById('customUrl') as HTMLInputElement;
  const promptGroup = document.getElementById('customPromptGroup');
  const urlGroup = document.getElementById('customUrlGroup');

  if (modalTitle) modalTitle.textContent = title;

  // Reset or populate form
  if (item) {
    // Find which icon this is
    const iconName = Object.entries(icons).find(([_, svg]) => svg === item.icon)?.[0] || '';
    selectedIconInput.value = iconName;
    document.querySelectorAll('.icon-option').forEach(o => {
      o.classList.toggle('selected', (o as HTMLElement).dataset.icon === iconName);
    });
    labelInput.value = item.label;
    actionSelect.value = item.action;
    promptTextarea.value = item.customPrompt || '';
  } else {
    selectedIconInput.value = '';
    document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
    labelInput.value = '';
    actionSelect.value = 'customAI';
    promptTextarea.value = '';
    urlInput.value = '';
  }

  // Show/hide appropriate fields
  if (promptGroup) promptGroup.style.display = actionSelect.value === 'customAI' ? 'block' : 'none';
  if (urlGroup) urlGroup.style.display = actionSelect.value === 'openUrl' ? 'block' : 'none';

  modal?.classList.add('show');
}

function closeModal() {
  const modal = document.getElementById('customItemModal');
  modal?.classList.remove('show');
  editingItemId = null;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
}
