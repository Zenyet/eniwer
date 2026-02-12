// Command Palette Type Definitions
import { MenuItem, MenuConfig, AuthState, BrowseSession, ChatSession } from '../../types';
import { SavedTask } from '../../utils/taskStorage';

// View types for multi-view system
export type ViewType =
  | 'commands'
  | 'ai-result'
  | 'settings'
  | 'settings-menu'
  | 'screenshot'
  | 'browseTrail'
  | 'contextChat'
  | 'annotations'
  | 'knowledge';

export interface ViewState {
  type: ViewType;
  title: string;
  data?: unknown;
}

export interface AIResultData {
  title: string;
  content: string;
  thinking?: string;
  originalText?: string;
  isLoading: boolean;
  resultType: 'translate' | 'general';
  translateTargetLanguage?: string;
  iconHtml?: string;
  streamKey?: string;
  actionType?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt?: number;
}

export interface CommandPaletteCallbacks {
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
}

export interface AIResultCallbacks {
  onStop?: () => void;
  onTranslateLanguageChange?: (lang: string) => void;
  onRefresh?: () => void;
  onSaveToAnnotation?: (originalText: string, content: string, thinking?: string, actionType?: string) => void;
}

export interface ScreenshotData {
  dataUrl: string;
  isLoading?: boolean;
  result?: string;
  generatedImageUrl?: string;
}

export interface ScreenshotCallbacks {
  onSave?: () => void;
  onCopy?: () => void;
  onAskAI?: (question: string) => void;
  onDescribe?: () => void;
  onGenerateImage?: (prompt: string) => void;
  onClose?: () => void;
}

export interface MinimizedTask {
  id: string;
  title: string;
  content: string;
  thinking?: string;
  originalText?: string;
  resultType: 'translate' | 'general';
  translateTargetLanguage?: string;
  iconHtml?: string;
  isLoading: boolean;
  minimizedAt: number;
  streamKey?: string;
  callbacks?: AIResultCallbacks;
  actionType?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt: number;
}
