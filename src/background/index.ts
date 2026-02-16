import {
  Message,
  AIRequestPayload,
  AIVisionRequestPayload,
  AIImageGenRequestPayload,
} from '../types';
import {
  callAI,
  callVisionAI,
  generateImage,
  getTranslatePrompt,
  getSummarizePrompt,
  getExplainPrompt,
  getRewritePrompt,
  getCodeExplainPrompt,
  getSummarizePagePrompt,
} from './ai-handler';
import { googleLogin, googleLogout, getAuthStatus, setSyncEnabled } from './auth-handler';
import { freeTranslate, shouldUseFreeTranslate } from './free-translate-handler';
import { syncToCloud, syncFromCloud, setupAutoSync, listBackups, restoreBackup, deleteBackup } from './sync-handler';
import { exportToGoogleDocs } from './drive-export-handler';

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: String(error) }));
  return true; // Keep the message channel open for async response
});

// Handle port connections for streaming
const activeAbortControllers = new Map<chrome.runtime.Port, AbortController>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'ai-stream') {
    const abortController = new AbortController();
    activeAbortControllers.set(port, abortController);

    // Handle port disconnect - abort request
    port.onDisconnect.addListener(() => {
      const controller = activeAbortControllers.get(port);
      if (controller) {
        controller.abort();
        activeAbortControllers.delete(port);
      }
    });

    port.onMessage.addListener(async (message: Message) => {
      const signal = abortController.signal;
      if (message.type === 'AI_REQUEST') {
        await handleStreamingAIRequest(port, message.payload as AIRequestPayload, signal);
      } else if (message.type === 'AI_VISION_REQUEST') {
        await handleStreamingVisionRequest(port, message.payload as AIVisionRequestPayload, signal);
      }
      // Clean up after request completes
      activeAbortControllers.delete(port);
    });
  }
});

async function handleMessage(message: Message, _sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'AI_REQUEST':
      return handleAIRequest(message.payload as AIRequestPayload);

    case 'AI_VISION_REQUEST':
      return handleVisionRequest(message.payload as AIVisionRequestPayload);

    case 'AI_IMAGE_GEN_REQUEST':
      return handleImageGenRequest(message.payload as AIImageGenRequestPayload);

    case 'SCREENSHOT':
      return handleScreenshot();

    case 'CAPTURE_VISIBLE_TAB':
      return handleCaptureVisibleTab();

    case 'DOWNLOAD_IMAGE':
      return handleDownloadImage(message.payload as { dataUrl: string; filename: string });

    case 'OPEN_URL':
      return handleOpenURL(message.payload as string);

    case 'GOOGLE_AUTH_LOGIN':
      return googleLogin();

    case 'GOOGLE_AUTH_LOGOUT':
      return googleLogout();

    case 'GOOGLE_AUTH_STATUS':
      return getAuthStatus();

    case 'SYNC_TO_CLOUD':
      return syncToCloud();

    case 'SYNC_FROM_CLOUD':
      return syncFromCloud();

    case 'LIST_BACKUPS':
      return listBackups();

    case 'RESTORE_BACKUP':
      return restoreBackup((message.payload as { fileId: string }).fileId);

    case 'DELETE_BACKUP':
      return deleteBackup((message.payload as { fileId: string }).fileId);

    case 'EXPORT_TO_DRIVE':
      return handleExportToDrive(message.payload as { title: string; content: string; sourceUrl?: string });

    case 'FREE_TRANSLATE':
      return handleFreeTranslate(message.payload as { text: string; targetLang: string; sourceLang?: string; provider?: string; customUrl?: string });

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// Non-streaming AI request handler
async function handleAIRequest(payload: AIRequestPayload): Promise<{ success: boolean; result?: string; error?: string; provider?: string }> {
  const { action, text, config, systemPrompt: customPrompt } = payload;

  // Check if we should use non-AI translation
  if (action === 'translate' && !customPrompt) {
    const translationProvider = config.translation?.provider || 'ai';
    if (translationProvider !== 'ai') {
      const customValue = translationProvider === 'deeplx'
        ? config.translation?.deeplxApiKey
        : config.translation?.customUrl;
      return freeTranslate(
        text,
        config.preferredLanguage || 'zh-CN',
        undefined,
        translationProvider,
        customValue
      );
    }
    // Legacy fallback check
    const useFreeTranslate = shouldUseFreeTranslate(
      config.apiProvider,
      config.apiKey,
      config.translationFallback?.enabled
    );
    if (useFreeTranslate) {
      return freeTranslate(text, config.preferredLanguage || 'zh-CN');
    }
  }

  let systemPrompt: string;

  // Use custom prompt if provided
  if (customPrompt) {
    systemPrompt = customPrompt;
  } else {
    switch (action) {
      case 'translate':
        systemPrompt = getTranslatePrompt(config.preferredLanguage || 'zh-CN');
        break;
      case 'summarize':
        systemPrompt = getSummarizePrompt(config.summaryLanguage || 'auto');
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
        systemPrompt = getSummarizePagePrompt(config.summaryLanguage || 'auto');
        break;
      default:
        return { success: false, error: 'Unknown AI action' };
    }
  }

  return callAI(text, systemPrompt, config);
}

// Streaming AI request handler
async function handleStreamingAIRequest(port: chrome.runtime.Port, payload: AIRequestPayload, signal: AbortSignal): Promise<void> {
  const { action, text, config, requestId, systemPrompt: customPrompt } = payload;

  // Check if we should use non-AI translation
  if (action === 'translate' && !customPrompt) {
    const translationProvider = config.translation?.provider || 'ai';
    let useNonAI = translationProvider !== 'ai';

    // Legacy fallback check
    if (!useNonAI) {
      useNonAI = shouldUseFreeTranslate(
        config.apiProvider,
        config.apiKey,
        config.translationFallback?.enabled
      );
    }

    if (useNonAI) {
      const provider = translationProvider !== 'ai' ? translationProvider : 'google';
      const customValue = provider === 'deeplx'
        ? config.translation?.deeplxApiKey
        : config.translation?.customUrl;
      const result = await freeTranslate(
        text,
        config.preferredLanguage || 'zh-CN',
        undefined,
        provider,
        customValue
      );
      if (result.success && result.result) {
        port.postMessage({ type: 'AI_STREAM_CHUNK', payload: { requestId, chunk: result.result, fullText: result.result } });
        port.postMessage({ type: 'AI_STREAM_END', payload: { requestId, ...result } });
      } else {
        port.postMessage({ type: 'AI_STREAM_ERROR', payload: { requestId, error: result.error || '翻译失败' } });
      }
      return;
    }
  }

  let systemPrompt: string;

  // Use custom prompt if provided
  if (customPrompt) {
    systemPrompt = customPrompt;
  } else {
    switch (action) {
      case 'translate':
        systemPrompt = getTranslatePrompt(config.preferredLanguage || 'zh-CN');
        break;
      case 'summarize':
        systemPrompt = getSummarizePrompt(config.summaryLanguage || 'auto');
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
        systemPrompt = getSummarizePagePrompt(config.summaryLanguage || 'auto');
        break;
      default:
        port.postMessage({ type: 'AI_STREAM_ERROR', payload: { requestId, error: 'Unknown AI action' } });
        return;
    }
  }

  try {
    const result = await callAI(text, systemPrompt, config, (chunk, fullText, thinking) => {
      if (!signal.aborted) {
        port.postMessage({ type: 'AI_STREAM_CHUNK', payload: { requestId, chunk, fullText, thinking } });
      }
    }, signal);

    if (!signal.aborted) {
      port.postMessage({ type: 'AI_STREAM_END', payload: { requestId, ...result } });
    }
  } catch (error) {
    if (!signal.aborted) {
      port.postMessage({ type: 'AI_STREAM_ERROR', payload: { requestId, error: String(error) } });
    }
  }
}

// Non-streaming vision request handler
async function handleVisionRequest(payload: AIVisionRequestPayload): Promise<{ success: boolean; result?: string; error?: string }> {
  const { imageDataUrl, prompt, config } = payload;
  return callVisionAI(imageDataUrl, prompt, config);
}

// Streaming vision request handler
async function handleStreamingVisionRequest(port: chrome.runtime.Port, payload: AIVisionRequestPayload, signal: AbortSignal): Promise<void> {
  const { imageDataUrl, prompt, config, requestId } = payload;

  try {
    const result = await callVisionAI(imageDataUrl, prompt, config, (chunk, fullText, thinking) => {
      if (!signal.aborted) {
        port.postMessage({ type: 'AI_STREAM_CHUNK', payload: { requestId, chunk, fullText, thinking } });
      }
    }, signal);

    if (!signal.aborted) {
      port.postMessage({ type: 'AI_STREAM_END', payload: { requestId, ...result } });
    }
  } catch (error) {
    if (!signal.aborted) {
      port.postMessage({ type: 'AI_STREAM_ERROR', payload: { requestId, error: String(error) } });
    }
  }
}

// Image generation request handler
async function handleImageGenRequest(payload: AIImageGenRequestPayload): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const { prompt, config, screenshotConfig } = payload;
  return generateImage(prompt, config, screenshotConfig);
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

async function handleOpenURL(url: string): Promise<{ success: boolean }> {
  try {
    await chrome.tabs.create({ url });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// Export to Google Docs handler
async function handleExportToDrive(payload: { title: string; content: string; sourceUrl?: string }): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  return exportToGoogleDocs(payload.title, payload.content, payload.sourceUrl);
}

// Free translation handler
async function handleFreeTranslate(payload: { text: string; targetLang: string; sourceLang?: string; provider?: string; customUrl?: string }): Promise<{ success: boolean; result?: string; error?: string }> {
  return freeTranslate(payload.text, payload.targetLang, payload.sourceLang, payload.provider as any, payload.customUrl);
}

// Handle sync enabled toggle (from settings UI)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_SYNC_ENABLED') {
    setSyncEnabled(message.payload as boolean).then(() => sendResponse({ success: true }));
    return true;
  }
});

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

console.log('The Panel: Background service worker initialized');

// Setup context menu for image search
async function setupImageSearchMenu() {
  // Remove existing menus first
  await chrome.contextMenus.removeAll();

  // Get config
  const result = await chrome.storage.local.get(['thecircle_data']);
  const config = result.thecircle_data?.config?.imageSearch || {
    google: true,
    yandex: true,
    bing: true,
    tineye: true,
  };

  // Check if any engine is enabled
  const enabledEngines = Object.entries(config).filter(([_, enabled]) => enabled);
  if (enabledEngines.length === 0) return;

  // Create parent menu
  chrome.contextMenus.create({
    id: 'image-search-parent',
    title: '搜图',
    contexts: ['image'],
  });

  // Create search engine sub-menus based on config
  const searchEngines = [
    { id: 'google', title: 'Google 搜图', enabled: config.google },
    { id: 'yandex', title: 'Yandex 搜图', enabled: config.yandex },
    { id: 'bing', title: 'Bing 搜图', enabled: config.bing },
    { id: 'tineye', title: 'TinEye 搜图', enabled: config.tineye },
  ];

  for (const engine of searchEngines) {
    if (engine.enabled) {
      chrome.contextMenus.create({
        id: `image-search-${engine.id}`,
        parentId: 'image-search-parent',
        title: engine.title,
        contexts: ['image'],
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupImageSearchMenu();
});

// Listen for config changes to update context menu
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.thecircle_data) {
    const oldConfig = changes.thecircle_data.oldValue?.config?.imageSearch;
    const newConfig = changes.thecircle_data.newValue?.config?.imageSearch;
    // Only rebuild menu if imageSearch config changed
    if (JSON.stringify(oldConfig) !== JSON.stringify(newConfig)) {
      setupImageSearchMenu();
    }
  }
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, _tab) => {
  if (!info.srcUrl) return;

  const imageUrl = encodeURIComponent(info.srcUrl);
  let searchUrl = '';

  switch (info.menuItemId) {
    case 'image-search-google':
      searchUrl = `https://lens.google.com/uploadbyurl?url=${imageUrl}`;
      break;
    case 'image-search-yandex':
      searchUrl = `https://yandex.com/images/search?source=collections&rpt=imageview&url=${imageUrl}`;
      break;
    case 'image-search-bing':
      searchUrl = `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${imageUrl}`;
      break;
    case 'image-search-tineye':
      searchUrl = `https://tineye.com/search?url=${imageUrl}`;
      break;
  }

  if (searchUrl) {
    chrome.tabs.create({ url: searchUrl });
  }
});

// Setup auto-sync for cloud data
setupAutoSync();
