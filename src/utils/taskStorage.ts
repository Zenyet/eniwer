// Task Storage - chrome.storage.local based persistence for AI task results

export interface SavedTask {
  id: string;
  title: string;
  content: string;
  thinking?: string;
  originalText?: string;
  resultType: 'translate' | 'general';
  actionType: string;
  sourceUrl: string;
  sourceTitle: string;
  translateTargetLanguage?: string;
  createdAt: number;
  savedAt: number;
}

const STORAGE_KEY = 'thecircle_saved_tasks';

async function getAllTasksFromStorage(): Promise<SavedTask[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function setAllTasksToStorage(tasks: SavedTask[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
}

export async function saveTask(task: Omit<SavedTask, 'id' | 'savedAt'>): Promise<SavedTask> {
  const tasks = await getAllTasksFromStorage();

  const savedTask: SavedTask = {
    ...task,
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    savedAt: Date.now(),
  };

  // Add to beginning (newest first)
  tasks.unshift(savedTask);
  await setAllTasksToStorage(tasks);

  return savedTask;
}

export async function getAllTasks(limit = 50, offset = 0): Promise<SavedTask[]> {
  const tasks = await getAllTasksFromStorage();
  // Tasks are already sorted by savedAt desc (newest first)
  return tasks.slice(offset, offset + limit);
}

export async function getTasksByActionType(actionType: string, limit = 50): Promise<SavedTask[]> {
  const tasks = await getAllTasksFromStorage();
  const filtered = tasks.filter(task => task.actionType === actionType);
  return filtered.slice(0, limit);
}

export async function getTask(id: string): Promise<SavedTask | null> {
  const tasks = await getAllTasksFromStorage();
  return tasks.find(task => task.id === id) || null;
}

export async function deleteTask(id: string): Promise<void> {
  const tasks = await getAllTasksFromStorage();
  const filtered = tasks.filter(task => task.id !== id);
  await setAllTasksToStorage(filtered);
}

export async function getTaskCount(): Promise<number> {
  const tasks = await getAllTasksFromStorage();
  return tasks.length;
}

export async function clearAllTasks(): Promise<void> {
  await setAllTasksToStorage([]);
}

export async function enforceMaxCount(maxCount: number): Promise<void> {
  const tasks = await getAllTasksFromStorage();

  if (tasks.length <= maxCount) return;

  // Keep only the newest maxCount tasks (tasks are sorted newest first)
  const trimmed = tasks.slice(0, maxCount);
  await setAllTasksToStorage(trimmed);
}
