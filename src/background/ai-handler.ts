// AI API handler - runs in background script only
import { MenuConfig, ScreenshotConfig } from '../types';

// Provider configurations
interface ProviderConfig {
  apiUrl: string;
  model: string;
  thinkingModel?: string;
  visionModel?: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  groq: {
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    visionModel: 'llama-3.2-90b-vision-preview',
  },
  openai: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1-mini',
    thinkingModel: 'o4-mini',
    visionModel: 'gpt-4.1-mini',
  },
  anthropic: {
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-5-20250929',
    thinkingModel: 'claude-sonnet-4-5-20250929',
    visionModel: 'claude-sonnet-4-5-20250929',
  },
  gemini: {
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    thinkingModel: 'gemini-2.5-flash',
    visionModel: 'gemini-2.5-flash',
  },
};

export interface AIResponse {
  success: boolean;
  result?: string;
  thinking?: string;
  error?: string;
}

export type OnChunkCallback = (chunk: string, fullText: string, thinking?: string) => void;

// Main text AI call
export async function callAI(
  prompt: string,
  systemPrompt: string,
  config: MenuConfig,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const provider = config.apiProvider;
  const useStreaming = config.useStreaming && !!onChunk;

  // Validate API key requirement
  if (provider !== 'groq' && !config.apiKey) {
    return { success: false, error: `请配置 ${provider.toUpperCase()} API Key` };
  }

  // For custom provider, validate URL and model
  if (provider === 'custom') {
    if (!config.customApiUrl || !config.customModel) {
      return { success: false, error: '请配置自定义 API URL 和模型名称' };
    }
  }

  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropicAPI(prompt, systemPrompt, config, useStreaming, onChunk, signal);
      case 'gemini':
        return await callGeminiAPI(prompt, systemPrompt, config, useStreaming, onChunk, signal);
      case 'groq':
      case 'openai':
      case 'custom':
      default:
        return await callOpenAICompatibleAPI(prompt, systemPrompt, config, useStreaming, onChunk, signal);
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { success: false, error: '请求已取消' };
    }
    return { success: false, error: `请求失败: ${error}` };
  }
}

// OpenAI compatible API (for Groq, OpenAI, and custom providers)
async function callOpenAICompatibleAPI(
  prompt: string,
  systemPrompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const provider = config.apiProvider;
  let apiUrl: string;
  let model: string;
  let apiKey = config.apiKey;
  const useThinking = config.useThinkingModel && provider === 'openai';

  if (provider === 'custom') {
    apiUrl = config.customApiUrl!;
    model = config.customModel!;
  } else {
    const providerConfig = PROVIDER_CONFIGS[provider];
    apiUrl = providerConfig.apiUrl;
    // Use user-selected model if set, otherwise provider default
    const baseModel = config.customModel || providerConfig.model;
    // Use thinking model if enabled and available (only override if user hasn't selected a model)
    model = useThinking && !config.customModel && providerConfig.thinkingModel
      ? providerConfig.thinkingModel
      : baseModel;
  }

  // Check if using OpenAI o1/o3 thinking models
  const isOpenAIThinkingModel = useThinking && (model.startsWith('o1') || model.startsWith('o3'));

  // Check for DeepSeek reasoner model (custom provider)
  const isDeepSeekReasoner = provider === 'custom' && config.customModel?.includes('deepseek-reasoner');

  // Build request body based on model type
  let requestBody: Record<string, unknown>;

  if (isOpenAIThinkingModel) {
    // OpenAI o1/o3 models: no system prompt, no temperature, use max_completion_tokens, no streaming
    requestBody = {
      model,
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n${prompt}` },
      ],
      max_completion_tokens: 16384,
    };
  } else if (isDeepSeekReasoner) {
    // DeepSeek reasoner: no temperature/top_p/presence_penalty/frequency_penalty
    requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 32768,
      stream: useStreaming,
    };
  } else {
    requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: useStreaming,
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  // OpenAI thinking models don't support streaming
  if (isOpenAIThinkingModel) {
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (result) {
      return { success: true, result };
    }
    return { success: false, error: 'AI 无响应' };
  }

  if (useStreaming && onChunk) {
    return await processOpenAIStream(response, onChunk, signal, isDeepSeekReasoner);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  // Handle DeepSeek reasoner response
  if (isDeepSeekReasoner) {
    const reasoning = data.choices?.[0]?.message?.reasoning_content;
    if (result) {
      return { success: true, result, thinking: reasoning };
    }
  }

  if (result) {
    return { success: true, result };
  }

  return { success: false, error: 'AI 无响应' };
}

async function processOpenAIStream(
  response: Response,
  onChunk: OnChunkCallback,
  signal?: AbortSignal,
  isDeepSeekReasoner?: boolean
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: '无法读取流' };
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let thinkingText = '';

  try {
    while (true) {
      // Check if aborted
      if (signal?.aborted) {
        reader.cancel();
        return { success: false, error: '请求已取消' };
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            // Handle DeepSeek reasoner's reasoning_content in streaming
            if (isDeepSeekReasoner) {
              const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;
              if (reasoning) {
                thinkingText += reasoning;
                // Stream thinking content in real-time
                onChunk('', fullText, thinkingText);
              }
            }
            if (content) {
              fullText += content;
              onChunk(content, fullText, thinkingText || undefined);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    if (fullText) {
      return { success: true, result: fullText, thinking: thinkingText || undefined };
    }
    return { success: false, error: 'AI 无响应' };
  } finally {
    reader.releaseLock();
  }
}

// Anthropic API
async function callAnthropicAPI(
  prompt: string,
  systemPrompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const providerConfig = PROVIDER_CONFIGS.anthropic;
  const useThinking = config.useThinkingModel;

  // Build request body
  const requestBody: Record<string, unknown> = {
    model: config.customModel || providerConfig.model,
    max_tokens: useThinking ? 16384 : 2048,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt },
    ],
    stream: useStreaming,
  };

  // Add thinking parameter for extended thinking
  if (useThinking) {
    requestBody.thinking = {
      type: 'enabled',
      budget_tokens: 10000,
    };
  }

  const response = await fetch(providerConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': useThinking ? '2025-01-01' : '2023-06-01',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  if (useStreaming && onChunk) {
    return await processAnthropicStream(response, onChunk, signal, useThinking);
  }

  const data = await response.json();

  // Handle extended thinking response
  if (useThinking) {
    let result = '';
    let thinking = '';
    for (const block of data.content || []) {
      if (block.type === 'thinking') {
        thinking = block.thinking;
      } else if (block.type === 'text') {
        result = block.text;
      }
    }
    if (result) {
      return { success: true, result, thinking: thinking || undefined };
    }
  } else {
    const result = data.content?.[0]?.text;
    if (result) {
      return { success: true, result };
    }
  }

  return { success: false, error: 'AI 无响应' };
}

async function processAnthropicStream(
  response: Response,
  onChunk: OnChunkCallback,
  signal?: AbortSignal,
  useThinking?: boolean
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: '无法读取流' };
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let thinkingText = '';
  let currentBlockType = '';

  try {
    while (true) {
      // Check if aborted
      if (signal?.aborted) {
        reader.cancel();
        return { success: false, error: '请求已取消' };
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);

            // Track content block type for thinking mode
            if (useThinking && parsed.type === 'content_block_start') {
              currentBlockType = parsed.content_block?.type || '';
            }

            if (parsed.type === 'content_block_delta') {
              if (useThinking && currentBlockType === 'thinking' && parsed.delta?.thinking) {
                thinkingText += parsed.delta.thinking;
                // Stream thinking content in real-time
                onChunk('', fullText, thinkingText);
              } else if (parsed.delta?.text) {
                const content = parsed.delta.text;
                fullText += content;
                onChunk(content, fullText, thinkingText || undefined);
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    if (fullText) {
      return { success: true, result: fullText, thinking: thinkingText || undefined };
    }
    return { success: false, error: 'AI 无响应' };
  } finally {
    reader.releaseLock();
  }
}

// Gemini API
async function callGeminiAPI(
  prompt: string,
  systemPrompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const providerConfig = PROVIDER_CONFIGS.gemini;
  const useThinking = config.useThinkingModel;
  const model = useThinking && providerConfig.thinkingModel
    ? providerConfig.thinkingModel
    : providerConfig.model;
  const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';
  const apiUrl = `${providerConfig.apiUrl}/${model}:${endpoint}?key=${config.apiKey}${useStreaming ? '&alt=sse' : ''}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${prompt}` },
          ],
        },
      ],
      generationConfig: {
        temperature: useThinking ? undefined : 0.7,
        maxOutputTokens: useThinking ? 16384 : 2048,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  if (useStreaming && onChunk) {
    return await processGeminiStream(response, onChunk, signal, useThinking);
  }

  const data = await response.json();

  // Handle thinking model response (may contain thought parts)
  if (useThinking) {
    const parts = data.candidates?.[0]?.content?.parts || [];
    let result = '';
    let thinking = '';
    for (const part of parts) {
      if (part.thought) {
        thinking = part.text || '';
      } else if (part.text) {
        result = part.text;
      }
    }
    if (result) {
      return { success: true, result, thinking: thinking || undefined };
    }
  } else {
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (result) {
      return { success: true, result };
    }
  }

  return { success: false, error: 'AI 无响应' };
}

async function processGeminiStream(
  response: Response,
  onChunk: OnChunkCallback,
  signal?: AbortSignal,
  useThinking?: boolean
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: '无法读取流' };
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let thinkingText = '';

  try {
    while (true) {
      // Check if aborted
      if (signal?.aborted) {
        reader.cancel();
        return { success: false, error: '请求已取消' };
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            const parts = parsed.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
              if (useThinking && part.thought) {
                // This is a thought part
                if (part.text) {
                  thinkingText += part.text;
                  // Stream thinking content in real-time
                  onChunk('', fullText, thinkingText);
                }
              } else if (part.text) {
                const content = part.text;
                fullText += content;
                onChunk(content, fullText, thinkingText || undefined);
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    if (fullText) {
      return { success: true, result: fullText, thinking: thinkingText || undefined };
    }
    return { success: false, error: 'AI 无响应' };
  } finally {
    reader.releaseLock();
  }
}

// Vision API for image analysis
export async function callVisionAI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const provider = config.apiProvider;
  const useStreaming = config.useStreaming && !!onChunk;

  // Validate API key requirement
  if (provider !== 'groq' && !config.apiKey) {
    return { success: false, error: `请配置 ${provider.toUpperCase()} API Key` };
  }

  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropicVisionAPI(imageDataUrl, prompt, config, useStreaming, onChunk, signal);
      case 'gemini':
        return await callGeminiVisionAPI(imageDataUrl, prompt, config, useStreaming, onChunk, signal);
      case 'groq':
      case 'openai':
      default:
        return await callOpenAIVisionAPI(imageDataUrl, prompt, config, useStreaming, onChunk, signal);
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { success: false, error: '请求已取消' };
    }
    return { success: false, error: `请求失败: ${error}` };
  }
}

// OpenAI compatible Vision API
async function callOpenAIVisionAPI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const provider = config.apiProvider;
  let apiUrl: string;
  let model: string;
  const apiKey = config.apiKey;

  if (provider === 'custom') {
    apiUrl = config.customApiUrl!;
    model = config.customModel!;
  } else {
    const providerConfig = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.openai;
    apiUrl = providerConfig.apiUrl;
    model = config.customModel || providerConfig.visionModel || providerConfig.model;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 2048,
      stream: useStreaming,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  if (useStreaming && onChunk) {
    return await processOpenAIStream(response, onChunk, signal);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  if (result) {
    return { success: true, result };
  }

  return { success: false, error: 'AI 无响应' };
}

// Anthropic Vision API
async function callAnthropicVisionAPI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const providerConfig = PROVIDER_CONFIGS.anthropic;

  // Extract base64 data and media type from data URL
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { success: false, error: '无效的图片数据格式' };
  }
  const [, mediaType, base64Data] = match;

  const response = await fetch(providerConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.customModel || providerConfig.visionModel || providerConfig.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      stream: useStreaming,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  if (useStreaming && onChunk) {
    return await processAnthropicStream(response, onChunk, signal);
  }

  const data = await response.json();
  const result = data.content?.[0]?.text;

  if (result) {
    return { success: true, result };
  }

  return { success: false, error: 'AI 无响应' };
}

// Gemini Vision API
async function callGeminiVisionAPI(
  imageDataUrl: string,
  prompt: string,
  config: MenuConfig,
  useStreaming: boolean,
  onChunk?: OnChunkCallback,
  signal?: AbortSignal
): Promise<AIResponse> {
  const providerConfig = PROVIDER_CONFIGS.gemini;
  const model = providerConfig.visionModel || providerConfig.model;
  const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';
  const apiUrl = `${providerConfig.apiUrl}/${model}:${endpoint}?key=${config.apiKey}${useStreaming ? '&alt=sse' : ''}`;

  // Extract base64 data and media type from data URL
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { success: false, error: '无效的图片数据格式' };
  }
  const [, mimeType, base64Data] = match;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `API 错误: ${error}` };
  }

  if (useStreaming && onChunk) {
    return await processGeminiStream(response, onChunk, signal);
  }

  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (result) {
    return { success: true, result };
  }

  return { success: false, error: 'AI 无响应' };
}

// Image generation API
export async function generateImage(
  prompt: string,
  config: MenuConfig,
  screenshotConfig: ScreenshotConfig
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const provider = screenshotConfig.imageGenProvider;

  if (provider === 'openai') {
    return await callOpenAIImageGeneration(prompt, config, screenshotConfig);
  } else if (provider === 'custom' && screenshotConfig.customImageGenUrl) {
    return await callCustomImageGeneration(prompt, screenshotConfig);
  }

  return { success: false, error: '请配置图像生成服务' };
}

// OpenAI DALL-E image generation
async function callOpenAIImageGeneration(
  prompt: string,
  config: MenuConfig,
  screenshotConfig: ScreenshotConfig
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!config.apiKey) {
    return { success: false, error: '请配置 OpenAI API Key' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: screenshotConfig.imageSize,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API 错误: ${error}` };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (imageUrl) {
      return { success: true, imageUrl };
    }

    return { success: false, error: '图像生成失败' };
  } catch (error) {
    return { success: false, error: `请求失败: ${error}` };
  }
}

// Custom image generation API
async function callCustomImageGeneration(
  prompt: string,
  screenshotConfig: ScreenshotConfig
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!screenshotConfig.customImageGenUrl) {
    return { success: false, error: '请配置自定义图像生成 API URL' };
  }

  try {
    const response = await fetch(screenshotConfig.customImageGenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        size: screenshotConfig.imageSize,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API 错误: ${error}` };
    }

    const data = await response.json();
    // Try common response formats
    const imageUrl = data.data?.[0]?.url || data.url || data.image_url || data.result;

    if (imageUrl) {
      return { success: true, imageUrl };
    }

    return { success: false, error: '图像生成失败' };
  } catch (error) {
    return { success: false, error: `请求失败: ${error}` };
  }
}

// Prompt helpers
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
