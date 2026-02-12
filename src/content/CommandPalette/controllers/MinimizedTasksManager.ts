// Minimized Tasks Manager - handles task minimization and restoration
import { MinimizedTask, AIResultData, AIResultCallbacks } from '../types';
import { getDefaultMinimizedIcon, getActionIcon, getTaskMetaInfo } from '../utils';

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
  icons: Record<string, string>
): string {
  if (tasks.length === 0) return '';

  const tasksHTML = tasks.map(task => {
    const icon = task.iconHtml || getDefaultMinimizedIcon();
    const actionIcon = task.actionType ? getActionIcon(task.actionType) : '';
    const metaInfo = getTaskMetaInfo(task);

    return `
      <div class="glass-minimized-task ${task.isLoading ? 'glass-minimized-loading' : ''}" data-task-id="${task.id}">
        <div class="glass-minimized-task-icon">${actionIcon || icon}</div>
        <div class="glass-minimized-task-info">
          <div class="glass-minimized-task-title">${task.title}</div>
          <div class="glass-minimized-task-meta">${metaInfo}</div>
        </div>
        <div class="glass-minimized-task-actions">
          ${task.isLoading ? `
            <div class="glass-minimized-task-spinner"></div>
          ` : ''}
          <button class="glass-minimized-task-dismiss" title="关闭">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-minimized-tasks-section">
      <div class="glass-minimized-tasks-header">
        <span class="glass-minimized-tasks-icon">${icons.layers || ''}</span>
        <span>后台任务 (${tasks.length})</span>
      </div>
      <div class="glass-minimized-tasks-list">
        ${tasksHTML}
      </div>
    </div>
  `;
}

export function bindMinimizedTasksEvents(
  shadowRoot: ShadowRoot | null,
  onRestore: (taskId: string) => void,
  onDismiss: (taskId: string) => void
): void {
  if (!shadowRoot) return;

  shadowRoot.querySelectorAll('.glass-minimized-task').forEach(el => {
    const taskId = el.getAttribute('data-task-id');
    if (!taskId) return;

    // Click to restore (but not on dismiss button)
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.glass-minimized-task-dismiss')) return;
      onRestore(taskId);
    });
  });

  shadowRoot.querySelectorAll('.glass-minimized-task-dismiss').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskEl = (e.target as HTMLElement).closest('.glass-minimized-task');
      const taskId = taskEl?.getAttribute('data-task-id');
      if (taskId) {
        onDismiss(taskId);
      }
    });
  });
}
