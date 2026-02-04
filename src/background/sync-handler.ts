// Cloud sync handler using Google Drive AppData folder
import { SyncData, MenuConfig, BrowseSession } from '../types';
import { getAuthToken, refreshTokenIfNeeded } from './auth-handler';

const SYNC_FILE_NAME = 'thepanel-sync.json';
const SYNC_VERSION = 1;

// Debounce timer for auto-sync
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 5000;

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

// Find the sync file in AppData folder
async function findSyncFile(token: string): Promise<DriveFile | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to find sync file:', response.status);
      return null;
    }

    const data = await response.json();
    return data.files?.[0] || null;
  } catch (error) {
    console.error('Error finding sync file:', error);
    return null;
  }
}

// Read sync data from Drive
async function readSyncFile(token: string, fileId: string): Promise<SyncData | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to read sync file:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error reading sync file:', error);
    return null;
  }
}

// Create or update sync file in Drive
async function writeSyncFile(token: string, data: SyncData, fileId?: string): Promise<boolean> {
  try {
    const metadata = {
      name: SYNC_FILE_NAME,
      mimeType: 'application/json',
      ...(fileId ? {} : { parents: ['appDataFolder'] }),
    };

    const boundary = '-------314159265358979323846';
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const response = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to write sync file:', response.status, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error writing sync file:', error);
    return false;
  }
}

// Get current local data to sync
async function getLocalSyncData(): Promise<SyncData> {
  const result = await chrome.storage.local.get(['thecircle_data', 'thecircle_browse_trail']);

  const config = result.thecircle_data?.config || {};
  const browseTrail = result.thecircle_browse_trail || [];

  return {
    version: SYNC_VERSION,
    timestamp: Date.now(),
    config,
    browseTrail,
  };
}

// Apply remote sync data to local storage
async function applyRemoteSyncData(data: SyncData): Promise<void> {
  const updates: Record<string, unknown> = {};

  // Get current local data
  const localData = await chrome.storage.local.get(['thecircle_data']);
  const currentConfig = localData.thecircle_data?.config || {};

  // Merge config (remote overrides local for non-sensitive fields)
  if (data.config) {
    const mergedConfig = {
      ...currentConfig,
      ...data.config,
      // Keep local API key (sensitive)
      apiKey: currentConfig.apiKey,
    };
    updates.thecircle_data = {
      ...localData.thecircle_data,
      config: mergedConfig,
    };
  }

  // Merge browse trail (newer entries from remote)
  if (data.browseTrail) {
    const localTrail = (await chrome.storage.local.get(['thecircle_browse_trail'])).thecircle_browse_trail || [];
    const mergedTrail = mergeBrowseTrail(localTrail, data.browseTrail);
    updates.thecircle_browse_trail = mergedTrail;
  }

  await chrome.storage.local.set(updates);
}

// Merge browse trail from two sources, keeping unique entries
function mergeBrowseTrail(local: BrowseSession[], remote: BrowseSession[]): BrowseSession[] {
  const sessionMap = new Map<string, BrowseSession>();

  // Add local sessions
  for (const session of local) {
    sessionMap.set(session.id, session);
  }

  // Merge remote sessions (newer wins)
  for (const session of remote) {
    const existing = sessionMap.get(session.id);
    if (!existing || session.startedAt > existing.startedAt) {
      sessionMap.set(session.id, session);
    }
  }

  // Sort by start time (newest first)
  return Array.from(sessionMap.values()).sort((a, b) => b.startedAt - a.startedAt);
}

// Sync local data to cloud
export async function syncToCloud(): Promise<{ success: boolean; error?: string }> {
  const token = await refreshTokenIfNeeded();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    // Get local data
    const localData = await getLocalSyncData();

    // Find existing sync file
    const existingFile = await findSyncFile(token);

    // Write to Drive
    const success = await writeSyncFile(token, localData, existingFile?.id);

    if (success) {
      console.log('Synced to cloud successfully');
      return { success: true };
    } else {
      return { success: false, error: '写入云端失败' };
    }
  } catch (error) {
    console.error('Sync to cloud error:', error);
    return { success: false, error: String(error) };
  }
}

// Sync from cloud to local
export async function syncFromCloud(): Promise<{ success: boolean; data?: SyncData; error?: string }> {
  const token = await refreshTokenIfNeeded();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    // Find sync file
    const existingFile = await findSyncFile(token);
    if (!existingFile) {
      // No sync file yet, nothing to sync
      return { success: true };
    }

    // Read sync data
    const remoteData = await readSyncFile(token, existingFile.id);
    if (!remoteData) {
      return { success: false, error: '读取云端数据失败' };
    }

    // Check version compatibility
    if (remoteData.version > SYNC_VERSION) {
      return { success: false, error: '云端数据版本较新，请更新扩展' };
    }

    // Get local data for comparison
    const localData = await getLocalSyncData();

    // Use "last write wins" strategy
    if (remoteData.timestamp > localData.timestamp) {
      // Remote is newer, apply it
      await applyRemoteSyncData(remoteData);
      console.log('Applied remote sync data');
    } else {
      // Local is newer or same, push to cloud
      await syncToCloud();
    }

    return { success: true, data: remoteData };
  } catch (error) {
    console.error('Sync from cloud error:', error);
    return { success: false, error: String(error) };
  }
}

// Auto-sync handler (debounced)
export function scheduleSyncToCloud(): void {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(async () => {
    // Check if sync is enabled
    const result = await chrome.storage.local.get(['thecircle_sync_enabled']);
    if (result.thecircle_sync_enabled) {
      await syncToCloud();
    }
  }, SYNC_DEBOUNCE_MS);
}

// Setup storage change listener for auto-sync
export function setupAutoSync(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if relevant data changed
    const watchedKeys = ['thecircle_data', 'thecircle_browse_trail'];
    const hasRelevantChange = watchedKeys.some(key => key in changes);

    if (hasRelevantChange) {
      scheduleSyncToCloud();
    }
  });
}
