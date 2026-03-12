// Minimized Tasks Manager - handles task minimization and restoration
import { MinimizedTask, AIResultData, AIResultCallbacks } from '../types';
import { escapeHtml, getDefaultMinimizedIcon, getTaskMetaInfo } from '../utils';

export interface MinimizedTasksState {
  minimizedTasks: MinimizedTask[];
  minimizedTaskIdCounter: number;
  currentStreamKey: string | null;
}

export function createMinimizedTasksState(): MinimizedTasksState {
  return {
    minimizedTasks: [],
    minimizedTaskIdCounter: 0,
    currentStreamKey: null,
  };
}

export function createMinimizedTask(
  state: MinimizedTasksState,
  aiResultData: AIResultData,
  aiResultCallbacks: AIResultCallbacks | null
): MinimizedTask {
  const task: MinimizedTask = {
    id: `task-${++state.minimizedTaskIdCounter}`,
    title: aiResultData.title,
    content: aiResultData.content,
    originalText: aiResultData.originalText,
    resultType: aiResultData.resultType,
    translateTargetLanguage: aiResultData.translateTargetLanguage,
    iconHtml: aiResultData.iconHtml,
    isLoading: aiResultData.isLoading,
    minimizedAt: Date.now(),
    streamKey: aiResultData.streamKey,
    callbacks: aiResultCallbacks || undefined,
    actionType: aiResultData.actionType,
    sourceUrl: aiResultData.sourceUrl,
    sourceTitle: aiResultData.sourceTitle,
    createdAt: aiResultData.createdAt || Date.now(),
  };

  state.minimizedTasks.push(task);

  if (task.streamKey) {
    state.currentStreamKey = task.streamKey;
  }

  return task;
}

export function findMinimizedTaskByStreamKey(
  state: MinimizedTasksState,
  streamKey: string
): MinimizedTask | undefined {
  return state.minimizedTasks.find(t => t.streamKey === streamKey);
}

export function updateMinimizedTaskContent(
  task: MinimizedTask,
  content: string,
  isLoading: boolean = true
): void {
  task.content = content;
  task.isLoading = isLoading;
}

export function removeMinimizedTask(
  state: MinimizedTasksState,
  taskId: string
): MinimizedTask | null {
  const taskIndex = state.minimizedTasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return null;

  const task = state.minimizedTasks[taskIndex];
  state.minimizedTasks.splice(taskIndex, 1);

  if (task.streamKey && state.currentStreamKey === task.streamKey) {
    state.currentStreamKey = null;
  }

  return task;
}

export function getMinimizedTasksHTML(
  tasks: MinimizedTask[],
  sectionLabel: string
): string {
  if (tasks.length === 0) return '';

  const tasksHTML = tasks.map(task => {
    const icon = task.iconHtml || getDefaultMinimizedIcon();
    const metaInfo = getTaskMetaInfo(task);

    return `
      <div class="glass-minimized-task" data-task-id="${task.id}">
        <div class="glass-task-icon">${icon}</div>
        <div class="glass-task-info">
          <div class="glass-task-title">${escapeHtml(task.title)}</div>
          <div class="glass-task-meta">${metaInfo}</div>
        </div>
        ${task.isLoading ? '<div class="glass-minimized-task-loading"></div>' : ''}
        <button class="glass-minimized-close" data-task-id="${task.id}">&times;</button>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-section-label">${sectionLabel}</div>
    ${tasksHTML}
  `;
}

export function bindMinimizedTasksEvents(
  container: ParentNode | null,
  onRestore: (taskId: string) => void,
  onDismiss: (taskId: string) => void
): void {
  if (!container) return;

  container.querySelectorAll('.glass-minimized-task').forEach(el => {
    const taskId = el.getAttribute('data-task-id');
    if (!taskId) return;

    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.glass-minimized-close')) return;
      onRestore(taskId);
    });
  });

  container.querySelectorAll('.glass-minimized-close').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = (e.currentTarget as HTMLElement).getAttribute('data-task-id');
      if (taskId) {
        onDismiss(taskId);
      }
    });
  });
}
