import { icons } from './icons';

export interface MenuItem {
  id: string;
  icon: string;
  label: string;
  action: string;
  enabled: boolean;
  order: number;
  customIcon?: string;
  customLabel?: string;
}

export interface CustomMenuItem extends MenuItem {
  isCustom: true;
  customPrompt?: string;
}

export interface ScreenshotConfig {
  saveToFile: boolean;
  copyToClipboard: boolean;
  enableAI: boolean;
  defaultAIAction: 'ask' | 'describe' | 'none';
  imageQuality: number;
  enableImageGen: boolean;
  imageGenProvider: 'openai' | 'custom';
  customImageGenUrl?: string;
  imageSize: '1024x1024' | '1792x1024' | '1024x1792';
}

export interface HistoryConfig {
  maxSaveCount: number; // Maximum number of saved tasks in IndexedDB
  panelDisplayCount: number; // Number of tasks to display in panel
}

// Annotation config
export interface AnnotationConfig {
  defaultColor: string;
  autoSaveAIResult: boolean; // Auto save AI results to annotations
  showPageFilter: boolean; // Show current page filter by default
}

// Knowledge base config
export interface KnowledgeConfig {
  defaultFilter: 'all' | 'annotations' | 'ai-results';
  maxDisplayCount: number; // Maximum items to display per group
  groupByDate: boolean;
}

export interface SyncOptions {
  translation: boolean;
  summary: boolean;
  knowledge: boolean;
  annotation: boolean;
  browseTrail: boolean;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  translation: true,
  summary: true,
  knowledge: true,
  annotation: true,
  browseTrail: true,
};

export interface MenuConfig {
  shortcut: string;
  theme: 'dark' | 'light' | 'system';
  preferredLanguage: string;
  summaryLanguage: string;
  apiProvider: 'groq' | 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey?: string;
  customApiUrl?: string;
  customModel?: string;
  useStreaming: boolean;
  useThinkingModel?: boolean;
  screenshot?: ScreenshotConfig;
  popoverPosition?: 'above' | 'below';
  history?: HistoryConfig;
  showSelectionPopover?: boolean;
  translationFallback?: TranslationFallbackConfig;
  translation?: TranslationConfig;
  imageSearch?: ImageSearchConfig;
  annotation?: AnnotationConfig;
  knowledge?: KnowledgeConfig;
  syncOptions?: SyncOptions;
  autoSaveTask?: boolean;
}

export interface StorageData {
  config: MenuConfig;
  selectionMenuItems: MenuItem[];
  globalMenuItems: MenuItem[];
}

export const DEFAULT_SCREENSHOT_CONFIG: ScreenshotConfig = {
  saveToFile: true,
  copyToClipboard: false,
  enableAI: true,
  defaultAIAction: 'none',
  imageQuality: 0.92,
  enableImageGen: false,
  imageGenProvider: 'openai',
  imageSize: '1024x1024',
};

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxSaveCount: 100,
  panelDisplayCount: 10,
};

export const DEFAULT_ANNOTATION_CONFIG: AnnotationConfig = {
  defaultColor: 'yellow',
  autoSaveAIResult: false,
  showPageFilter: false,
};

export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig = {
  defaultFilter: 'all',
  maxDisplayCount: 50,
  groupByDate: true,
};

export const DEFAULT_CONFIG: MenuConfig = {
  shortcut: 'Double+Shift',
  theme: 'system',
  preferredLanguage: 'zh-CN',
  summaryLanguage: 'auto',
  apiProvider: 'groq',
  useStreaming: true,
  screenshot: DEFAULT_SCREENSHOT_CONFIG,
  popoverPosition: 'above',
  history: DEFAULT_HISTORY_CONFIG,
  showSelectionPopover: true,
  annotation: DEFAULT_ANNOTATION_CONFIG,
  knowledge: DEFAULT_KNOWLEDGE_CONFIG,
  syncOptions: DEFAULT_SYNC_OPTIONS,
};

export const DEFAULT_SELECTION_MENU: MenuItem[] = [
  { id: 'translate', icon: icons.translate, label: '翻译', action: 'translate', enabled: true, order: 0 },
  { id: 'summarize', icon: icons.summarize, label: '总结', action: 'summarize', enabled: true, order: 1 },
  { id: 'explain', icon: icons.explain, label: '解释', action: 'explain', enabled: true, order: 2 },
  { id: 'rewrite', icon: icons.rewrite, label: '改写', action: 'rewrite', enabled: true, order: 3 },
  { id: 'search', icon: icons.search, label: '搜索', action: 'search', enabled: true, order: 4 },
  { id: 'copy', icon: icons.copy, label: '复制', action: 'copy', enabled: true, order: 5 },
  { id: 'sendToAI', icon: icons.sendToAI, label: '发送到 AI', action: 'sendToAI', enabled: true, order: 6 },
  { id: 'codeExplain', icon: icons.codeExplain, label: '代码解释', action: 'codeExplain', enabled: true, order: 7 },
];

export const DEFAULT_GLOBAL_MENU: MenuItem[] = [
  { id: 'contextChat', icon: icons.messageCircle, label: '上下文追问', action: 'contextChat', enabled: true, order: 0 },
  { id: 'summarizePage', icon: icons.summarizePage, label: '总结页面', action: 'summarizePage', enabled: true, order: 1 },
  { id: 'knowledge', icon: icons.library, label: '知识库', action: 'knowledge', enabled: true, order: 2 },
  { id: 'annotations', icon: icons.highlighter, label: '批注', action: 'annotations', enabled: true, order: 3 },
  { id: 'browseTrail', icon: icons.history, label: '浏览轨迹', action: 'browseTrail', enabled: true, order: 4 },
  { id: 'screenshot', icon: icons.screenshot, label: '截图', action: 'screenshot', enabled: true, order: 5 },
  { id: 'settings', icon: icons.settings, label: '设置', action: 'settings', enabled: true, order: 6 },
];

export type MessageType =
  | 'TOGGLE_MENU'
  | 'AI_REQUEST'
  | 'AI_RESPONSE'
  | 'AI_VISION_REQUEST'
  | 'AI_IMAGE_GEN_REQUEST'
  | 'AI_STREAM_CHUNK'
  | 'AI_STREAM_END'
  | 'AI_STREAM_ERROR'
  | 'OPEN_URL'
  | 'SCREENSHOT'
  | 'CAPTURE_VISIBLE_TAB'
  | 'DOWNLOAD_IMAGE'
  | 'GET_PAGE_CONTENT'
  | 'GOOGLE_AUTH_LOGIN'
  | 'GOOGLE_AUTH_LOGOUT'
  | 'GOOGLE_AUTH_STATUS'
  | 'SYNC_TO_CLOUD'
  | 'SYNC_FROM_CLOUD'
  | 'EXPORT_TO_DRIVE'
  | 'FREE_TRANSLATE'
  | 'SET_SYNC_ENABLED'
  | 'LIST_BACKUPS'
  | 'RESTORE_BACKUP'
  | 'DELETE_BACKUP';

export interface Message {
  type: MessageType;
  payload?: unknown;
}

// AI Request payload types
export interface AIRequestPayload {
  action: string;
  text: string;
  config: MenuConfig;
  requestId?: string;
  systemPrompt?: string; // For custom prompts
}

export interface AIVisionRequestPayload {
  imageDataUrl: string;
  prompt: string;
  config: MenuConfig;
  requestId?: string;
}

export interface AIImageGenRequestPayload {
  prompt: string;
  config: MenuConfig;
  screenshotConfig: ScreenshotConfig;
}

// Context Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  timestamp: number;
  references?: { text: string }[];
}

export interface ChatSession {
  id: string;
  url: string;
  title: string;
  messages: ChatMessage[];
  pageContext: string;
  updatedAt: number;
}

// Quick Actions types
export interface QuickCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: string;
  keywords: string[];
}

// Browse Trail types
export interface TrailEntry {
  id: string;
  url: string;
  title: string;
  summary?: string;
  thumbnail?: string;
  visitedAt: number;
  duration?: number;
  sessionId: string;
}

export interface BrowseSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  entries: TrailEntry[];
}

// Google Auth types
export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: GoogleUser | null;
  syncEnabled: boolean;
  tokenExpired?: boolean;
}

// Translation fallback config
export interface TranslationFallbackConfig {
  enabled: boolean;
}

// Translation config
export type TranslationProvider = 'ai' | 'google' | 'microsoft' | 'deeplx' | 'custom';

export interface TranslationConfig {
  provider: TranslationProvider;
  deeplxApiKey?: string; // For DeepLX API key
  customUrl?: string; // For custom provider URL
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'ai',
};

// Image search engines config
export interface ImageSearchConfig {
  google: boolean;
  yandex: boolean;
  bing: boolean;
  tineye: boolean;
}

export const DEFAULT_IMAGE_SEARCH_CONFIG: ImageSearchConfig = {
  google: true,
  yandex: true,
  bing: true,
  tineye: true,
};

// Sync data structure
export interface SyncData {
  version: number;
  timestamp: number;
  config: Partial<MenuConfig>;
  browseTrail?: BrowseSession[];
  savedTasks?: unknown[];
  annotations?: unknown[];
}

export interface BackupFileInfo {
  id: string;
  name: string;
  timestamp: number;
  modifiedTime: string;
}

