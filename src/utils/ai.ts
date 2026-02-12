// AI API wrapper for content scripts
// All requests are routed through background script for security
import { MenuConfig, ScreenshotConfig, Message } from '../types';

interface AIResponse {
  success: boolean;
  result?: string;
  thinking?: string;
  error?: string;
}

export type OnChunkCallback = (chunk: string, fullText: string, thinking?: string) => void;

// Active request tracking for cancellation
interface ActiveRequest {
  port: chrome.runtime.Port;
  requestId: string;
}

const activeRequests = new Map<string, ActiveRequest>();

// Generate unique request ID
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Abort a specific request
export function abortRequest(requestId: string): void {
  const request = activeRequests.get(requestId);
  if (request) {
    try {
      request.port.disconnect();
    } catch {
      // Port may already be disconnected
    }
    activeRequests.delete(requestId);
  }
}

// Abort all active requests
export function abortAllRequests(): void {
  for (const [requestId, request] of activeRequests) {
    try {
      request.port.disconnect();
    } catch {
      // Port may already be disconnected
    }
    activeRequests.delete(requestId);
  }
}

// Text AI call - routes to background
export async function callAI(
  prompt: string,
  systemPrompt: string,
  config: MenuConfig,
  onChunk?: OnChunkCallback
): Promise<AIResponse & { requestId?: string }> {
  const useStreaming = config.useStreaming && !!onChunk;

  if (useStreaming) {
    return callStreamingAI('AI_REQUEST', {
      action: 'custom',
      text: prompt,
      systemPrompt,
      config,
    }, onChunk);
  }

  // Non-streaming: use simple message
  const response = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: {
      action: 'custom',
      text: prompt,
      systemPrompt,
      config,
    },
  } as Message);

  return response as AIResponse;
}

// Vision AI call - routes to background
export async function callVisionAI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  onChunk?: OnChunkCallback
): Promise<AIResponse & { requestId?: string }> {
  const useStreaming = config.useStreaming && !!onChunk;

  if (useStreaming) {
    return callStreamingVisionAI(imageDataUrl, prompt, config, onChunk);
  }

  // Non-streaming: use simple message
  const response = await chrome.runtime.sendMessage({
    type: 'AI_VISION_REQUEST',
    payload: {
      imageDataUrl,
      prompt,
      config,
    },
  } as Message);

  return response as AIResponse;
}

// Image generation - routes to background
export async function generateImage(
  prompt: string,
  config: MenuConfig,
  screenshotConfig: ScreenshotConfig
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const response = await chrome.runtime.sendMessage({
    type: 'AI_IMAGE_GEN_REQUEST',
    payload: {
      prompt,
      config,
      screenshotConfig,
    },
  } as Message);

  return response as { success: boolean; imageUrl?: string; error?: string };
}

// Streaming AI request using port connection
async function callStreamingAI(
  type: string,
  payload: { action: string; text: string; systemPrompt?: string; config: MenuConfig },
  onChunk: OnChunkCallback
): Promise<AIResponse & { requestId: string }> {
  return new Promise((resolve) => {
    const requestId = generateRequestId();
    const port = chrome.runtime.connect({ name: 'ai-stream' });

    // Track active request
    activeRequests.set(requestId, { port, requestId });

    const cleanup = () => {
      activeRequests.delete(requestId);
      try {
        port.onMessage.removeListener(messageHandler);
      } catch {
        // Listener may already be removed
      }
    };

    const messageHandler = (message: { type: string; payload: { requestId: string; chunk?: string; fullText?: string; thinking?: string; success?: boolean; result?: string; error?: string } }) => {
      if (message.payload?.requestId !== requestId) return;

      if (message.type === 'AI_STREAM_CHUNK') {
        onChunk(message.payload.chunk || '', message.payload.fullText || '', message.payload.thinking);
      } else if (message.type === 'AI_STREAM_END') {
        cleanup();
        port.disconnect();
        resolve({
          success: message.payload.success || false,
          result: message.payload.result,
          thinking: message.payload.thinking,
          error: message.payload.error,
          requestId,
        });
      } else if (message.type === 'AI_STREAM_ERROR') {
        cleanup();
        port.disconnect();
        resolve({
          success: false,
          error: message.payload.error || 'Unknown error',
          requestId,
        });
      }
    };

    // Handle port disconnect (abort)
    port.onDisconnect.addListener(() => {
      cleanup();
      resolve({
        success: false,
        error: '请求已取消',
        requestId,
      });
    });

    port.onMessage.addListener(messageHandler);

    port.postMessage({
      type,
      payload: {
        ...payload,
        requestId,
      },
    });
  });
}

// Streaming vision AI request using port connection
async function callStreamingVisionAI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  onChunk: OnChunkCallback
): Promise<AIResponse & { requestId: string }> {
  return new Promise((resolve) => {
    const requestId = generateRequestId();
    const port = chrome.runtime.connect({ name: 'ai-stream' });

    // Track active request
    activeRequests.set(requestId, { port, requestId });

    const cleanup = () => {
      activeRequests.delete(requestId);
      try {
        port.onMessage.removeListener(messageHandler);
      } catch {
        // Listener may already be removed
      }
    };

    const messageHandler = (message: { type: string; payload: { requestId: string; chunk?: string; fullText?: string; thinking?: string; success?: boolean; result?: string; error?: string } }) => {
      if (message.payload?.requestId !== requestId) return;

      if (message.type === 'AI_STREAM_CHUNK') {
        onChunk(message.payload.chunk || '', message.payload.fullText || '', message.payload.thinking);
      } else if (message.type === 'AI_STREAM_END') {
        cleanup();
        port.disconnect();
        resolve({
          success: message.payload.success || false,
          result: message.payload.result,
          thinking: message.payload.thinking,
          error: message.payload.error,
          requestId,
        });
      } else if (message.type === 'AI_STREAM_ERROR') {
        cleanup();
        port.disconnect();
        resolve({
          success: false,
          error: message.payload.error || 'Unknown error',
          requestId,
        });
      }
    };

    // Handle port disconnect (abort)
    port.onDisconnect.addListener(() => {
      cleanup();
      resolve({
        success: false,
        error: '请求已取消',
        requestId,
      });
    });

    port.onMessage.addListener(messageHandler);

    port.postMessage({
      type: 'AI_VISION_REQUEST',
      payload: {
        imageDataUrl,
        prompt,
        config,
        requestId,
      },
    });
  });
}

// Prompt helpers - kept here for content script usage
export function getTranslatePrompt(targetLang: string): string {
  return `You are a professional translator. Translate the following text to ${targetLang}. Only output the translation, nothing else.`;
}

function resolveLanguageName(lang: string): string {
  const normalized = lang.trim();
  if (!normalized) return lang;
  const map: Record<string, string> = {
    'auto': 'the same language as the input',
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    'en': 'English',
    'ja': 'Japanese',
    'ko': 'Korean',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
  };
  return map[normalized] || normalized;
}

export function getSummarizePrompt(outputLang: string = 'auto'): string {
  if (outputLang === 'auto') {
    return `You are a summarization expert. Summarize the following text in a concise manner, keeping the key points. Use bullet points if appropriate. Output in the same language as the input.`;
  }
  const langName = resolveLanguageName(outputLang);
  return `You are a summarization expert. Summarize the following text in a concise manner, keeping the key points. Use bullet points if appropriate. Output in ${langName}.`;
}

export function getExplainPrompt(): string {
  return `You are a helpful teacher. Explain the following text in simple terms that anyone can understand. Output in the same language as the input.`;
}

export function getRewritePrompt(): string {
  return `You are a professional editor. Rewrite the following text to make it clearer, more engaging, and well-structured. Keep the same meaning. Output in the same language as the input.`;
}

export function getCodeExplainPrompt(): string {
  return `You are a senior software engineer. Explain the following code in detail, including what it does, how it works, and any important concepts. Output in the same language as the input text (if any) or in English.`;
}

export function getSummarizePagePrompt(outputLang: string = 'auto'): string {
  if (outputLang === 'auto') {
    return `You are a summarization expert. Summarize the following webpage content in a comprehensive but concise manner. Include the main topic, key points, and any important details. Use bullet points for clarity. Output in the same language as the content.`;
  }
  const langName = resolveLanguageName(outputLang);
  return `You are a summarization expert. Summarize the following webpage content in a comprehensive but concise manner. Include the main topic, key points, and any important details. Use bullet points for clarity. Output in ${langName}.`;
}

export function getDescribeImagePrompt(): string {
  return `请详细描述这张图片的内容，包括：
1. 主要元素和对象
2. 场景和环境
3. 颜色和视觉特征
4. 任何文字或标识
5. 整体氛围和主题

请用中文回答。`;
}

export function getAskImagePrompt(question: string): string {
  return `请根据这张图片回答以下问题：

${question}

请用中文回答，尽量详细和准确。`;
}
