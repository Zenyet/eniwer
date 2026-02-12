import { StorageData, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig, MenuItem } from '../types';

const STORAGE_KEY = 'thecircle_data';

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

    // Auto-merge new default menu items
    const mergedGlobalMenu = mergeMenuItems(data.globalMenuItems, DEFAULT_GLOBAL_MENU);
    const mergedSelectionMenu = mergeMenuItems(data.selectionMenuItems, DEFAULT_SELECTION_MENU);

    // Save if there were new items added
    if (mergedGlobalMenu.length !== data.globalMenuItems.length ||
        mergedSelectionMenu.length !== data.selectionMenuItems.length) {
      data.globalMenuItems = mergedGlobalMenu;
      data.selectionMenuItems = mergedSelectionMenu;
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
