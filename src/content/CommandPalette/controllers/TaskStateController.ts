import { MenuItem, ChatSession } from '../../../types';
import { icons } from '../../../icons';
import { abortAllRequests } from '../../../utils/ai';
import { AIResultCallbacks, AIResultData, MinimizedTask, ScreenshotData, ViewType } from '../types';

export interface RestoredTaskState {
  activeCommand: MenuItem;
  aiResultCallbacks: AIResultCallbacks | null;
  aiResultData: AIResultData | null;
  chatSession: ChatSession | null;
  currentStreamKey: string | null;
  currentView: ViewType;
  isChatStreaming: boolean;
  isQuickAsk: boolean;
  screenshotData: ScreenshotData | null;
}

export function createStreamKey(): string {
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createMinimizedTaskId(nextCounter: number): string {
  return `task-${nextCounter}`;
}

export function removeExistingTaskForAction(tasks: MinimizedTask[], actionType?: string): void {
  if (!actionType) return;
  const existingIndex = tasks.findIndex(task => task.actionType === actionType);
  if (existingIndex !== -1) {
    tasks.splice(existingIndex, 1);
  }
}

export function takeMinimizedTask(tasks: MinimizedTask[], taskId: string): MinimizedTask | null {
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) {
    return null;
  }

  return tasks.splice(taskIndex, 1)[0];
}

export function createAIResultMinimizedTask(
  taskId: string,
  aiResultData: AIResultData,
  aiResultCallbacks: AIResultCallbacks | null
): MinimizedTask {
  return {
    id: taskId,
    title: aiResultData.title,
    content: aiResultData.content,
    thinking: aiResultData.thinking,
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
}

export function createChatMinimizedTask(
  taskId: string,
  chatSession: ChatSession,
  isChatStreaming: boolean,
  isQuickAsk: boolean,
  conversationLabel: string
): MinimizedTask {
  const lastUserMessage = [...chatSession.messages].reverse().find(message => message.role === 'user');
  const title = lastUserMessage
    ? lastUserMessage.content.slice(0, 20) + (lastUserMessage.content.length > 20 ? '...' : '')
    : conversationLabel;

  return {
    id: taskId,
    title,
    content: '',
    resultType: 'general',
    isLoading: isChatStreaming,
    minimizedAt: Date.now(),
    createdAt: Date.now(),
    taskType: 'contextChat',
    chatSession,
    isQuickAsk,
    iconHtml: isQuickAsk ? icons.messageCircle : icons.contextChat,
  };
}

export function createScreenshotMinimizedTask(
  taskId: string,
  screenshotData: ScreenshotData,
  screenshotTitle: string
): MinimizedTask {
  return {
    id: taskId,
    title: screenshotTitle,
    content: screenshotData.result || '',
    resultType: 'general',
    isLoading: screenshotData.isLoading,
    minimizedAt: Date.now(),
    createdAt: Date.now(),
    taskType: 'screenshot',
    screenshotDataUrl: screenshotData.dataUrl,
    screenshotResult: screenshotData.result,
    iconHtml: icons.screenshot || icons.image,
  };
}

export function buildRestoredTaskState(
  task: MinimizedTask,
  labels: {
    contextChatLabel: string;
    quickAskLabel: string;
    screenshotLabel: string;
  }
): RestoredTaskState {
  if (task.taskType === 'contextChat') {
    return {
      activeCommand: {
        id: task.isQuickAsk ? 'quickAsk' : 'contextChat',
        action: 'contextChat',
        label: task.isQuickAsk ? labels.quickAskLabel : labels.contextChatLabel,
        icon: task.isQuickAsk ? icons.messageCircle : icons.contextChat,
        enabled: true,
        order: 0,
      },
      aiResultCallbacks: null,
      aiResultData: null,
      chatSession: task.chatSession || null,
      currentStreamKey: null,
      currentView: 'contextChat',
      isChatStreaming: task.isLoading,
      isQuickAsk: task.isQuickAsk || false,
      screenshotData: null,
    };
  }

  if (task.taskType === 'screenshot') {
    return {
      activeCommand: {
        id: 'screenshot',
        action: 'screenshot',
        label: labels.screenshotLabel,
        icon: '',
        enabled: true,
        order: 0,
      },
      aiResultCallbacks: null,
      aiResultData: null,
      chatSession: null,
      currentStreamKey: null,
      currentView: 'screenshot',
      isChatStreaming: false,
      isQuickAsk: false,
      screenshotData: {
        dataUrl: task.screenshotDataUrl || '',
        isLoading: task.isLoading,
        result: task.screenshotResult,
      },
    };
  }

  return {
    activeCommand: {
      id: task.actionType || 'unknown',
      label: task.title,
      icon: task.iconHtml || '',
      action: task.actionType || 'unknown',
      enabled: true,
      order: 0,
    },
    aiResultCallbacks: {
      ...task.callbacks,
      onStop: () => abortAllRequests(),
    },
    aiResultData: {
      title: task.title,
      content: task.content,
      thinking: task.thinking,
      originalText: task.originalText,
      isLoading: task.isLoading,
      resultType: task.resultType,
      translateTargetLanguage: task.translateTargetLanguage,
      iconHtml: task.iconHtml,
      streamKey: task.streamKey,
      actionType: task.actionType,
      sourceUrl: task.sourceUrl,
      sourceTitle: task.sourceTitle,
      createdAt: task.createdAt,
    },
    chatSession: null,
    currentStreamKey: task.isLoading ? task.streamKey || null : null,
    currentView: 'commands',
    isChatStreaming: false,
    isQuickAsk: false,
    screenshotData: null,
  };
}
