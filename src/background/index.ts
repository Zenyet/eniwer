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

// Non-streaming AI request handler
async function handleAIRequest(payload: AIRequestPayload): Promise<{ success: boolean; result?: string; error?: string }> {
  const { action, text, config, systemPrompt: customPrompt } = payload;

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
    const result = await callAI(text, systemPrompt, config, (chunk, fullText) => {
      if (!signal.aborted) {
        port.postMessage({ type: 'AI_STREAM_CHUNK', payload: { requestId, chunk, fullText } });
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
    const result = await callVisionAI(imageDataUrl, prompt, config, (chunk, fullText) => {
      if (!signal.aborted) {
        port.postMessage({ type: 'AI_STREAM_CHUNK', payload: { requestId, chunk, fullText } });
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
