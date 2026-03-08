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
import { initI18n, setLocale, t } from '../i18n';

// Initialize i18n on background startup
initI18n();

// Listen for language changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.thecircle_data?.newValue?.config?.uiLanguage) {
    setLocale(changes.thecircle_data.newValue.config.uiLanguage);
    // Rebuild context menus with new language
    setupImageSearchMenu();
  }
});

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

async function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
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

    case 'FETCH_URL':
      return handleFetchUrl(message.payload as { url: string });

    case 'FETCH_YOUTUBE_CAPTIONS':
      return handleFetchYouTubeCaptions(message.payload as { videoId: string; lang: string });

    case 'EXTRACT_YT_PLAYER_DATA':
      return handleExtractYtPlayerData(sender);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// Proxy fetch from background (bypasses page Service Worker, includes cookies)
async function handleFetchUrl(payload: { url: string }): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    // Extract domain from URL for cookies
    const urlObj = new URL(payload.url);
    const cookies = await chrome.cookies.getAll({ domain: urlObj.hostname });
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const response = await fetch(payload.url, {
      headers: {
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
        'Referer': `${urlObj.origin}/`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.text();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Fetch YouTube captions via InnerTube API (bypasses PO Token requirement)
async function handleFetchYouTubeCaptions(
  payload: { videoId: string; lang: string }
): Promise<{ success: boolean; segments?: { startMs: number; durationMs: number; text: string }[]; tracks?: { languageCode: string; languageName: string; isAutoGenerated: boolean }[]; error?: string }> {
  const { videoId, lang } = payload;
  const ANDROID_UA = 'com.google.android.youtube/19.02.39 (Linux; U; Android 14)';

  // Clients to try in order: ANDROID (usually no POT needed), then WEB
  const clients = [
    {
      name: 'ANDROID',
      body: {
        context: { client: { clientName: 'ANDROID', clientVersion: '19.02.39', hl: 'en' } },
        videoId,
      },
      ua: ANDROID_UA,
    },
    {
      name: 'WEB',
      body: {
        context: { client: { clientName: 'WEB', clientVersion: '2.20241120.01.00', hl: 'en' } },
        videoId,
      },
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  ];

  for (const client of clients) {
    try {
      // Step 1: Get player response via InnerTube
      const playerResp = await fetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': client.ua },
          body: JSON.stringify(client.body),
        }
      );
      if (!playerResp.ok) continue;

      const playerData = await playerResp.json();
      const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(captionTracks) || captionTracks.length === 0) continue;

      const tracksMeta = captionTracks.map((t: any) => ({
        languageCode: t.languageCode || '',
        languageName: t.name?.simpleText || t.languageCode || '',
        isAutoGenerated: t.kind === 'asr',
      }));

      // Step 2: Select track
      let track = captionTracks.find((t: any) => t.languageCode === lang);
      if (!track) track = captionTracks.find((t: any) => t.languageCode?.startsWith(lang.split('-')[0]));
      if (!track) track = captionTracks.find((t: any) => t.kind !== 'asr') || captionTracks[0];
      if (!track?.baseUrl) continue;

      // Step 3: Fetch subtitle data from baseUrl
      const subtitleUrl = track.baseUrl + '&fmt=json3';
      const subResp = await fetch(subtitleUrl, {
        headers: { 'User-Agent': client.ua },
      });
      if (!subResp.ok) continue;

      const subText = await subResp.text();
      if (!subText || subText.length < 10) continue;

      // Step 4: Parse
      let segments: { startMs: number; durationMs: number; text: string }[] = [];

      // Try JSON3
      try {
        const json = JSON.parse(subText);
        if (Array.isArray(json.events)) {
          for (const event of json.events) {
            if (!event.segs) continue;
            const text = event.segs.map((s: any) => s.utf8 || '').join('').trim();
            if (!text || text === '\n') continue;
            segments.push({
              startMs: event.tStartMs || 0,
              durationMs: event.dDurationMs || 0,
              text: text.replace(/\n/g, ' '),
            });
          }
        }
      } catch {
        // Try XML
        // (service worker doesn't have DOMParser, use regex)
        const matches = [...subText.matchAll(/<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g)];
        for (const m of matches) {
          const content = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
          if (!content) continue;
          segments.push({
            startMs: parseFloat(m[1]) * 1000,
            durationMs: parseFloat(m[2]) * 1000,
            text: content.replace(/\n/g, ' '),
          });
        }
      }

      if (segments.length > 0) {
        return { success: true, segments, tracks: tracksMeta };
      }
    } catch {
      continue;
    }
  }

  return { success: false, error: 'All InnerTube clients failed' };
}

// Extract YouTube player data by running code in page's MAIN world (bypasses CSP)
async function handleExtractYtPlayerData(
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; data?: any; error?: string }> {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        // This runs in the page's MAIN world with access to YouTube's JS objects
        try {
          const playerEl = document.querySelector('.html5-video-player') as any;
          if (!playerEl) {
            return { _debug: 'no .html5-video-player element', captionTracks: [] };
          }
          if (typeof playerEl.getPlayerResponse !== 'function') {
            // List available methods for debug
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(playerEl))
              .filter(k => typeof playerEl[k] === 'function')
              .filter(k => k.toLowerCase().includes('player') || k.toLowerCase().includes('caption') || k.toLowerCase().includes('audio') || k.toLowerCase().includes('track'))
              .slice(0, 20);
            return { _debug: `getPlayerResponse not a function. Related methods: ${methods.join(',')}`, captionTracks: [] };
          }

          const resp = playerEl.getPlayerResponse();
          if (!resp) {
            return { _debug: 'getPlayerResponse() returned null/undefined', captionTracks: [] };
          }

          const hasCaptions = !!resp.captions;
          const hasRenderer = !!resp.captions?.playerCaptionsTracklistRenderer;
          const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

          if (tracks.length === 0) {
            return { _debug: `hasCaptions=${hasCaptions}, hasRenderer=${hasRenderer}, tracks=0`, captionTracks: [] };
          }

          const captionTracks = tracks
            .filter((t: any) => t.baseUrl)
            .map((t: any) => ({
              languageCode: t.languageCode || '',
              languageName: t.name?.simpleText || t.languageCode || '',
              baseUrl: t.baseUrl,
              isAutoGenerated: t.kind === 'asr',
              vssId: t.vssId || '',
            }));

          // Get audio caption tracks (their URLs contain PO tokens)
          let audioCaptionTracks: any[] = [];
          let audioDebug = '';
          try {
            const audioTrack = playerEl.getAudioTrack?.();
            audioDebug = `audioTrack=${!!audioTrack}, keys=${audioTrack ? Object.keys(audioTrack).join(',') : 'N/A'}`;
            const raw = audioTrack?.captionsData || audioTrack?.captionTracks || [];
            audioCaptionTracks = raw.map((t: any) => ({
              url: t.url || '',
              vssId: t.vssId || '',
              languageCode: t.languageCode || '',
              kind: t.kind || '',
            }));
          } catch (e) {
            audioDebug = `audio error: ${e}`;
          }

          let clientVersion = '';
          try {
            clientVersion = playerEl.getWebPlayerContextConfig?.()?.innertubeContextClientVersion || '';
          } catch { /* ignore */ }

          let device = null;
          try {
            device = (window as any).ytcfg?.get?.('DEVICE') || null;
          } catch { /* ignore */ }

          return {
            captionTracks,
            audioCaptionTracks,
            clientVersion,
            device,
            _debug: `OK tracks=${captionTracks.length} audio=${audioCaptionTracks.length} ${audioDebug}`,
          };
        } catch (e) {
          return { _debug: `exception: ${e}`, captionTracks: [] };
        }
      },
    });

    const data = results?.[0]?.result;
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
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
        port.postMessage({ type: 'AI_STREAM_ERROR', payload: { requestId, error: result.error || t('contextMenu.translationFailed') } });
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
    title: t('contextMenu.imageSearch'),
    contexts: ['image'],
  });

  // Create search engine sub-menus based on config
  const searchEngines = [
    { id: 'google', title: t('contextMenu.googleImageSearch'), enabled: config.google },
    { id: 'yandex', title: t('contextMenu.yandexImageSearch'), enabled: config.yandex },
    { id: 'bing', title: t('contextMenu.bingImageSearch'), enabled: config.bing },
    { id: 'tineye', title: t('contextMenu.tineyeImageSearch'), enabled: config.tineye },
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
