// Cloud sync handler using Google Drive AppData folder
import { SyncData, BackupFileInfo, BrowseSession, SyncOptions, DEFAULT_SYNC_OPTIONS, DEFAULT_GLOBAL_MENU, DEFAULT_SELECTION_MENU, DEFAULT_CONFIG } from '../types';
import { refreshTokenIfNeeded, refreshTokenInteractive } from './auth-handler';
import { getStorageData } from '../utils/storage';

const SYNC_FILE_NAME = 'eniwer-sync.json';
const SYNC_VERSION = 1;
const BACKUP_FILE_PREFIX = 'eniwer-backup-';
const MAX_BACKUPS = 5;
const BACKUP_THROTTLE_MS = 3600000; // 1 hour

// Debounce timer for auto-sync
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 5000;

// Throttle for auto-sync backup
let lastAutoBackupTime = 0;

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
async function writeSyncFile(token: string, data: SyncData, fileId?: string): Promise<{ ok: boolean; error?: string }> {
  return writeFileToAppData(token, SYNC_FILE_NAME, data, fileId);
}

// Generic write file to appDataFolder
async function writeFileToAppData(token: string, fileName: string, data: unknown, fileId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const metadata = {
      name: fileName,
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
      return { ok: false, error: `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error writing sync file:', error);
    return { ok: false, error: String(error) };
  }
}

// Get current local data to sync
async function getLocalSyncData(): Promise<SyncData> {
  const storageData = await getStorageData();
  const syncOptions: SyncOptions = storageData.config?.syncOptions || DEFAULT_SYNC_OPTIONS;

  const result = await chrome.storage.local.get([
    'thecircle_browse_trail',
    'thecircle_saved_tasks',
    'thecircle_annotations',
  ]);

  const data: SyncData = {
    version: SYNC_VERSION,
    timestamp: Date.now(),
    config: storageData.config,
  };

  if (syncOptions.browseTrail) {
    data.browseTrail = result.thecircle_browse_trail || [];
  }

  // savedTasks covers translation, summary, and knowledge (they're all SavedTask records)
  if (syncOptions.translation || syncOptions.summary || syncOptions.knowledge) {
    data.savedTasks = result.thecircle_saved_tasks || [];
  }

  if (syncOptions.annotation) {
    const annotationData = result.thecircle_annotations;
    data.annotations = annotationData?.annotations || [];
  }

  return data;
}

// Apply remote sync data to local storage
async function applyRemoteSyncData(data: SyncData): Promise<void> {
  const updates: Record<string, unknown> = {};

  // Get current local data
  const localData = await chrome.storage.local.get(['thecircle_data']);
  const currentConfig = localData.thecircle_data?.config || {};

  // Merge config (remote overrides local)
  if (data.config) {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...currentConfig,
      ...data.config,
    };
    const currentData = localData.thecircle_data || {};
    updates.thecircle_data = {
      globalMenuItems: DEFAULT_GLOBAL_MENU,
      selectionMenuItems: DEFAULT_SELECTION_MENU,
      ...currentData,
      config: mergedConfig,
    };
  }

  // Merge browse trail (newer entries from remote)
  if (data.browseTrail) {
    const localTrail = (await chrome.storage.local.get(['thecircle_browse_trail'])).thecircle_browse_trail || [];
    const mergedTrail = mergeBrowseTrail(localTrail, data.browseTrail);
    updates.thecircle_browse_trail = mergedTrail;
  }

  // Merge saved tasks (by id, remote wins on conflict)
  if (data.savedTasks && data.savedTasks.length > 0) {
    const localTasks = (await chrome.storage.local.get(['thecircle_saved_tasks'])).thecircle_saved_tasks || [];
    const taskMap = new Map<string, unknown>();
    for (const task of localTasks) {
      taskMap.set((task as { id: string }).id, task);
    }
    for (const task of data.savedTasks) {
      taskMap.set((task as { id: string }).id, task);
    }
    // Sort by savedAt desc (newest first)
    const merged = Array.from(taskMap.values()).sort((a, b) =>
      ((b as { savedAt: number }).savedAt || 0) - ((a as { savedAt: number }).savedAt || 0)
    );
    updates.thecircle_saved_tasks = merged;
  }

  // Merge annotations (by id, remote wins on conflict)
  if (data.annotations && data.annotations.length > 0) {
    const localAnnotations = (await chrome.storage.local.get(['thecircle_annotations'])).thecircle_annotations;
    const localList = localAnnotations?.annotations || [];
    const annMap = new Map<string, unknown>();
    for (const ann of localList) {
      annMap.set((ann as { id: string }).id, ann);
    }
    for (const ann of data.annotations) {
      annMap.set((ann as { id: string }).id, ann);
    }
    // Sort by createdAt desc (newest first)
    const merged = Array.from(annMap.values()).sort((a, b) =>
      ((b as { createdAt: number }).createdAt || 0) - ((a as { createdAt: number }).createdAt || 0)
    );
    updates.thecircle_annotations = { annotations: merged };
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

// Find all backup files in AppData folder, sorted by modifiedTime desc
async function findBackupFiles(token: string): Promise<DriveFile[]> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name contains '${BACKUP_FILE_PREFIX}'&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to find backup files:', response.status);
      return [];
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error finding backup files:', error);
    return [];
  }
}

// Delete a file from Drive
async function deleteFile(token: string, fileId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.ok || response.status === 204;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// Parse timestamp from backup file name
function parseTimestampFromName(name: string): number {
  const match = name.match(/eniwer-backup-(\d+)\.json/);
  return match ? parseInt(match[1], 10) : 0;
}

// Create a backup of the current sync file
async function createBackup(token: string, isAutoSync: boolean): Promise<void> {
  // Throttle auto-sync backups (1 hour)
  if (isAutoSync) {
    const now = Date.now();
    if (now - lastAutoBackupTime < BACKUP_THROTTLE_MS) {
      return;
    }
  }

  // Find current sync file
  const syncFile = await findSyncFile(token);
  if (!syncFile) {
    // No sync file yet, nothing to backup
    return;
  }

  // Read current sync data
  const syncData = await readSyncFile(token, syncFile.id);
  if (!syncData) {
    return;
  }

  // Write backup file
  const timestamp = Date.now();
  const backupFileName = `${BACKUP_FILE_PREFIX}${timestamp}.json`;
  const writeResult = await writeFileToAppData(token, backupFileName, syncData);

  if (writeResult.ok) {
    if (isAutoSync) {
      lastAutoBackupTime = timestamp;
    }
    console.log('Backup created:', backupFileName);

    // Clean up old backups (keep MAX_BACKUPS)
    const backups = await findBackupFiles(token);
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        await deleteFile(token, file.id);
      }
    }
  }
}

// Sync local data to cloud
export async function syncToCloud(options?: { isAutoSync?: boolean }): Promise<{ success: boolean; error?: string }> {
  // Auto-sync: silent only; Manual sync: allow interactive login
  const token = options?.isAutoSync
    ? await refreshTokenIfNeeded()
    : await refreshTokenInteractive();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    // Get local data
    const localData = await getLocalSyncData();

    // Find existing sync file
    const existingFile = await findSyncFile(token);

    // Create backup before overwriting
    await createBackup(token, options?.isAutoSync ?? false);

    // Write to Drive
    const writeResult = await writeSyncFile(token, localData, existingFile?.id);

    if (writeResult.ok) {
      console.log('Synced to cloud successfully');
      return { success: true };
    } else {
      return { success: false, error: `写入云端失败: ${writeResult.error}` };
    }
  } catch (error) {
    console.error('Sync to cloud error:', error);
    return { success: false, error: String(error) };
  }
}

// Sync from cloud to local
export async function syncFromCloud(): Promise<{ success: boolean; data?: SyncData; error?: string }> {
  const token = await refreshTokenInteractive();
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

    // Always apply remote data when user explicitly downloads
    await applyRemoteSyncData(remoteData);
    console.log('Applied remote sync data');

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
      await syncToCloud({ isAutoSync: true });
    }
  }, SYNC_DEBOUNCE_MS);
}

// Setup storage change listener for auto-sync
export function setupAutoSync(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if relevant data changed
    const watchedKeys = ['thecircle_data', 'thecircle_browse_trail', 'thecircle_saved_tasks', 'thecircle_annotations'];
    const hasRelevantChange = watchedKeys.some(key => key in changes);

    if (hasRelevantChange) {
      scheduleSyncToCloud();
    }
  });
}

// List all backup files
export async function listBackups(): Promise<{ success: boolean; backups?: BackupFileInfo[]; error?: string }> {
  const token = await refreshTokenIfNeeded();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    const files = await findBackupFiles(token);
    const backups: BackupFileInfo[] = files.map(f => ({
      id: f.id,
      name: f.name,
      timestamp: parseTimestampFromName(f.name),
      modifiedTime: f.modifiedTime,
    }));
    return { success: true, backups };
  } catch (error) {
    console.error('List backups error:', error);
    return { success: false, error: String(error) };
  }
}

// Restore a backup by file ID
export async function restoreBackup(fileId: string): Promise<{ success: boolean; error?: string }> {
  const token = await refreshTokenInteractive();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    const data = await readSyncFile(token, fileId);
    if (!data) {
      return { success: false, error: '读取备份失败' };
    }

    await applyRemoteSyncData(data);
    console.log('Restored backup:', fileId);
    return { success: true };
  } catch (error) {
    console.error('Restore backup error:', error);
    return { success: false, error: String(error) };
  }
}

// Delete a backup by file ID
export async function deleteBackup(fileId: string): Promise<{ success: boolean; error?: string }> {
  const token = await refreshTokenInteractive();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    const ok = await deleteFile(token, fileId);
    if (ok) {
      return { success: true };
    }
    return { success: false, error: '删除备份失败' };
  } catch (error) {
    console.error('Delete backup error:', error);
    return { success: false, error: String(error) };
  }
}
