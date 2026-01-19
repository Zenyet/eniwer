import { Message, MenuConfig } from '../types';
import {
  callAI,
  getTranslatePrompt,
  getSummarizePrompt,
  getExplainPrompt,
  getRewritePrompt,
  getCodeExplainPrompt,
  getSummarizePagePrompt,
} from '../utils/ai';

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: String(error) }));
  return true; // Keep the message channel open for async response
});

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'AI_REQUEST':
      return handleAIRequest(message.payload as { action: string; text: string; config: MenuConfig });

    case 'GET_TABS':
      return handleGetTabs();

    case 'SWITCH_TAB':
      return handleSwitchTab(message.payload as number);

    case 'NEW_TAB':
      return handleNewTab();

    case 'SCREENSHOT':
      return handleScreenshot();

    case 'CAPTURE_VISIBLE_TAB':
      return handleCaptureVisibleTab();

    case 'DOWNLOAD_IMAGE':
      return handleDownloadImage(message.payload as { dataUrl: string; filename: string });

    case 'ADD_BOOKMARK':
      return handleAddBookmark(message.payload as { title: string; url: string });

    case 'OPEN_URL':
      return handleOpenURL(message.payload as string);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function handleAIRequest(payload: { action: string; text: string; config: MenuConfig }): Promise<{ success: boolean; result?: string; error?: string }> {
  const { action, text, config } = payload;

  let systemPrompt: string;

  switch (action) {
    case 'translate':
      systemPrompt = getTranslatePrompt(config.preferredLanguage || 'zh-CN');
      break;
    case 'summarize':
      systemPrompt = getSummarizePrompt();
      break;
    case 'explain':
      systemPrompt = getExplainPrompt();
      break;
    case 'rewrite':
      systemPrompt = getRewritePrompt();
      break;
    case 'codeExplain':
      systemPrompt = getCodeExplainPrompt();
      break;
    case 'summarizePage':
      systemPrompt = getSummarizePagePrompt();
      break;
    default:
      return { success: false, error: 'Unknown AI action' };
  }

  return callAI(text, systemPrompt, config);
}

async function handleGetTabs(): Promise<{ success: boolean; tabs?: chrome.tabs.Tab[] }> {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return { success: true, tabs };
  } catch (error) {
    return { success: false };
  }
}

async function handleSwitchTab(tabId: number): Promise<{ success: boolean }> {
  try {
    await chrome.tabs.update(tabId, { active: true });
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function handleNewTab(): Promise<{ success: boolean }> {
  try {
    await chrome.tabs.create({});
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function handleScreenshot(): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    // Download the screenshot using chrome.downloads API
    const filename = `screenshot-${Date.now()}.png`;
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false,
    });
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleCaptureVisibleTab(): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleDownloadImage(payload: { dataUrl: string; filename: string }): Promise<{ success: boolean; error?: string }> {
  try {
    await chrome.downloads.download({
      url: payload.dataUrl,
      filename: payload.filename,
      saveAs: false,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleAddBookmark(payload: { title: string; url: string }): Promise<{ success: boolean }> {
  try {
    await chrome.bookmarks.create({
      title: payload.title,
      url: payload.url,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function handleOpenURL(url: string): Promise<{ success: boolean }> {
  try {
    await chrome.tabs.create({ url });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MENU' });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MENU' });
    }
  }
});

console.log('The Circle: Background service worker initialized');
