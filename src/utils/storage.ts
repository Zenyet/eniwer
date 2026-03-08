import { StorageData, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig, MenuItem } from '../types';

const STORAGE_KEY = 'thecircle_data';

// Legacy Chinese labels -> i18n keys migration map
const LEGACY_LABEL_MAP: Record<string, string> = {
  '翻译': 'menu.translate',
  '总结': 'menu.summarize',
  '解释': 'menu.explain',
  '改写': 'menu.rewrite',
  '搜索': 'menu.search',
  '复制': 'menu.copy',
  '发送到 AI': 'menu.sendToAI',
  '代码解释': 'menu.codeExplain',
  '上下文追问': 'menu.contextChat',
  '总结页面': 'menu.summarizePage',
  '知识库': 'menu.knowledge',
  '批注': 'menu.annotations',
  '浏览轨迹': 'menu.browseTrail',
  '截图': 'menu.screenshot',
  '设置': 'menu.settings',
};

/**
 * Migrate legacy Chinese labels to i18n keys
 */
function migrateMenuLabels(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
  let changed = false;
  const migrated = items.map(item => {
    const newLabel = LEGACY_LABEL_MAP[item.label];
    if (newLabel) {
      changed = true;
      return { ...item, label: newLabel };
    }
    return item;
  });
  return { items: migrated, changed };
}

// Merge new default menu items into existing items (preserves user customizations)
function mergeMenuItems(existing: MenuItem[], defaults: MenuItem[]): MenuItem[] {
  const existingIds = new Set(existing.map(item => item.id));
  const newItems = defaults.filter(item => !existingIds.has(item.id));

  if (newItems.length === 0) {
    return existing;
  }

  // Add new items at the end, adjusting order
  const maxOrder = Math.max(...existing.map(item => item.order), -1);
  const mergedNewItems = newItems.map((item, index) => ({
    ...item,
    order: maxOrder + 1 + index,
  }));

  return [...existing, ...mergedNewItems];
}

export async function getStorageData(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    const data = result[STORAGE_KEY] as StorageData;

    // Ensure arrays exist with defaults
    const globalItems = data.globalMenuItems || DEFAULT_GLOBAL_MENU;
    const selectionItems = data.selectionMenuItems || DEFAULT_SELECTION_MENU;
    data.config = { ...DEFAULT_CONFIG, ...data.config };

    // Auto-merge new default menu items
    const mergedGlobalMenu = mergeMenuItems(globalItems, DEFAULT_GLOBAL_MENU);
    const mergedSelectionMenu = mergeMenuItems(selectionItems, DEFAULT_SELECTION_MENU);

    // Migrate legacy Chinese labels to i18n keys
    const globalMigration = migrateMenuLabels(mergedGlobalMenu);
    const selectionMigration = migrateMenuLabels(mergedSelectionMenu);

    // Always update arrays (handles missing fields + new items)
    data.globalMenuItems = globalMigration.items;
    data.selectionMenuItems = selectionMigration.items;

    // Save if arrays were missing, new items added, or labels migrated
    if (mergedGlobalMenu.length !== globalItems.length ||
        mergedSelectionMenu.length !== selectionItems.length ||
        !result[STORAGE_KEY].globalMenuItems ||
        !result[STORAGE_KEY].selectionMenuItems ||
        globalMigration.changed ||
        selectionMigration.changed) {
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    }

    return data;
  }
  return {
    config: DEFAULT_CONFIG,
    selectionMenuItems: DEFAULT_SELECTION_MENU,
    globalMenuItems: DEFAULT_GLOBAL_MENU,
  };
}

export async function saveStorageData(data: Partial<StorageData>): Promise<void> {
  const current = await getStorageData();
  const updated = { ...current, ...data };
  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

export async function getConfig(): Promise<MenuConfig> {
  const data = await getStorageData();
  return data.config;
}

export async function saveConfig(config: Partial<MenuConfig>): Promise<void> {
  const data = await getStorageData();
  data.config = { ...data.config, ...config };
  await saveStorageData(data);
}

export async function getSelectionMenuItems(): Promise<MenuItem[]> {
  const data = await getStorageData();
  return data.selectionMenuItems;
}

export async function getGlobalMenuItems(): Promise<MenuItem[]> {
  const data = await getStorageData();
  return data.globalMenuItems;
}

export async function saveSelectionMenuItems(items: MenuItem[]): Promise<void> {
  await saveStorageData({ selectionMenuItems: items });
}

export async function saveGlobalMenuItems(items: MenuItem[]): Promise<void> {
  await saveStorageData({ globalMenuItems: items });
}
