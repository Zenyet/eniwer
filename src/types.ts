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
  screenshot?: ScreenshotConfig;
  popoverPosition?: 'above' | 'below';
  history?: HistoryConfig;
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
  { id: 'browseTrail', icon: icons.history, label: '浏览轨迹', action: 'browseTrail', enabled: true, order: 2 },
  { id: 'screenshot', icon: icons.screenshot, label: '截图', action: 'screenshot', enabled: true, order: 3 },
  { id: 'settings', icon: icons.settings, label: '设置', action: 'settings', enabled: true, order: 4 },
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
  | 'GET_TABS'
  | 'SWITCH_TAB'
  | 'NEW_TAB'
  | 'SCREENSHOT'
  | 'CAPTURE_VISIBLE_TAB'
  | 'DOWNLOAD_IMAGE'
  | 'ADD_BOOKMARK'
  | 'GET_PAGE_CONTENT';

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
