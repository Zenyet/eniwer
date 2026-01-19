import { StorageData, DEFAULT_CONFIG, DEFAULT_SELECTION_MENU, DEFAULT_GLOBAL_MENU, MenuConfig, MenuItem } from '../types';

const STORAGE_KEY = 'thecircle_data';

export async function getStorageData(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    return result[STORAGE_KEY] as StorageData;
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
