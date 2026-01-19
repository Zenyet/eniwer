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

export interface MenuConfig {
  shortcut: string;
  theme: 'dark' | 'light' | 'system';
  preferredLanguage: string;
  apiProvider: 'groq' | 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey?: string;
  customApiUrl?: string;
  customModel?: string;
  useStreaming: boolean;
  screenshot?: ScreenshotConfig;
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

export const DEFAULT_CONFIG: MenuConfig = {
  shortcut: 'Double+Shift',
  theme: 'dark',
  preferredLanguage: 'zh-CN',
  apiProvider: 'groq',
  useStreaming: true,
  screenshot: DEFAULT_SCREENSHOT_CONFIG,
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
  { id: 'aiChat', icon: icons.aiChat, label: 'AI 对话', action: 'aiChat', enabled: true, order: 0 },
  { id: 'summarizePage', icon: icons.summarizePage, label: '总结页面', action: 'summarizePage', enabled: true, order: 1 },
  { id: 'switchTab', icon: icons.switchTab, label: '标签切换', action: 'switchTab', enabled: true, order: 2 },
  { id: 'history', icon: icons.history, label: '历史记录', action: 'history', enabled: true, order: 3 },
  { id: 'screenshot', icon: icons.screenshot, label: '截图', action: 'screenshot', enabled: true, order: 4 },
  { id: 'bookmark', icon: icons.bookmark, label: '书签', action: 'bookmark', enabled: true, order: 5 },
  { id: 'newTab', icon: icons.newTab, label: '新标签', action: 'newTab', enabled: true, order: 6 },
  { id: 'settings', icon: icons.settings, label: '设置', action: 'settings', enabled: true, order: 7 },
];

export type MessageType =
  | 'TOGGLE_MENU'
  | 'AI_REQUEST'
  | 'AI_RESPONSE'
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
