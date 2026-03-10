import { MenuConfig, DEFAULT_TTS_CONFIG } from '../types';

// ===== Shared helpers =====

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ===== Cloud TTS (OpenAI / custom) =====

export async function handleTTSSpeak(payload: {
  text: string;
  config: MenuConfig;
}): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const ttsConfig = payload.config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG;
  const apiKey = ttsConfig.cloudApiKey || payload.config.apiKey;

  if (!apiKey) {
    return { success: false, error: 'No API key configured for TTS' };
  }

  let apiUrl: string;
  if (ttsConfig.cloudProvider === 'custom' && ttsConfig.cloudApiUrl) {
    apiUrl = ttsConfig.cloudApiUrl;
  } else {
    apiUrl = 'https://api.openai.com/v1/audio/speech';
  }

  const model = ttsConfig.cloudModel || 'tts-1';
  const voice = ttsConfig.voice || 'alloy';
  const speed = ttsConfig.rate || 1.0;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: payload.text,
        voice,
        speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { success: false, error: `TTS API error: ${response.status} ${errorText}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = arrayBufferToBase64(arrayBuffer);
    return { success: true, audioBase64 };
  } catch (e) {
    return { success: false, error: `TTS request failed: ${String(e)}` };
  }
}

// ===== Edge TTS (via server-side proxy) =====
// Browser WebSocket cannot set Origin header required by Edge TTS.
// Deploy edge-tts-proxy/ to Vercel, then set the URL below.

const EDGE_TTS_PROXY = 'https://edge-tts-proxy-one.vercel.app';

export async function handleTTSEdge(payload: {
  text: string;
  voice: string;
  rate: number;
  durationMs?: number;
}): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const voice = payload.voice || 'zh-CN-XiaoxiaoNeural';

  console.log('[EdgeTTS] proxy request:', { text: payload.text.slice(0, 50), voice, durationMs: payload.durationMs });

  try {
    const response = await fetch(`${EDGE_TTS_PROXY}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: payload.text,
        voice,
        rate: payload.rate || 1.0,
        durationMs: payload.durationMs,
      }),
    });

    if (!response.ok) {
      // Error responses are still JSON
      const errBody = await response.json().catch(() => ({}));
      console.error('[EdgeTTS] proxy error:', errBody);
      return { success: false, error: (errBody as any).error || `Proxy error: ${response.status}` };
    }

    // Response is raw MP3 binary
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { success: false, error: 'Empty audio from proxy' };
    }

    console.log('[EdgeTTS] proxy success, mp3 bytes:', arrayBuffer.byteLength);
    return { success: true, audioBase64: arrayBufferToBase64(arrayBuffer) };
  } catch (e) {
    console.error('[EdgeTTS] proxy exception:', e);
    return { success: false, error: `Edge TTS proxy failed: ${String(e)}` };
  }
}

// ===== Edge TTS Voice List =====

let voiceListCache: { data: any[]; timestamp: number } | null = null;
const VOICE_LIST_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function handleEdgeTTSVoiceList(): Promise<{ success: boolean; voices?: any[]; error?: string }> {
  if (voiceListCache && (Date.now() - voiceListCache.timestamp) < VOICE_LIST_CACHE_TTL) {
    return { success: true, voices: voiceListCache.data };
  }

  try {
    const response = await fetch(`${EDGE_TTS_PROXY}/api/voices`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || `Voice list error: ${response.status}` };
    }

    voiceListCache = { data: result.voices, timestamp: Date.now() };
    return { success: true, voices: result.voices };
  } catch (e) {
    return { success: false, error: `Voice list fetch error: ${String(e)}` };
  }
}
