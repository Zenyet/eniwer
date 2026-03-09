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

// ===== Edge TTS (free, via Bing Speech HTTP endpoint) =====

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '1-143.0.3650.75';
const EDGE_TTS_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const WIN_EPOCH_DIFF = 11644473600;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Generate Sec-MS-GEC DRM token (same algorithm as edge-tts drm.py). */
async function generateSecMsGec(): Promise<string> {
  let winTs = Math.floor(Date.now() / 1000) + WIN_EPOCH_DIFF;
  winTs = winTs - (winTs % 300);
  const ticks = BigInt(winTs) * BigInt(10_000_000);
  const toHash = `${ticks}${TRUSTED_CLIENT_TOKEN}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(toHash));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Ensure MUID cookie exists for speech.platform.bing.com. */
async function ensureMuidCookie(): Promise<void> {
  try {
    const existing = await chrome.cookies.get({
      url: 'https://speech.platform.bing.com',
      name: 'muid',
    });
    if (existing) return;

    const muid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    await chrome.cookies.set({
      url: 'https://speech.platform.bing.com',
      name: 'muid',
      value: muid,
      path: '/',
      secure: true,
      sameSite: 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 86400 * 365,
    });
    console.log('[EdgeTTS] Set MUID cookie:', muid);
  } catch (e) {
    console.warn('[EdgeTTS] Failed to set MUID cookie:', e);
  }
}

export async function handleTTSEdge(payload: {
  text: string;
  voice: string;
  rate: number;
}): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const voice = payload.voice || 'zh-CN-XiaoxiaoNeural';
  const rate = payload.rate || 1.0;
  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  console.log('[EdgeTTS] handleTTSEdge called:', { text: payload.text.slice(0, 50), voice, rate });

  try {
    const [secMsGec] = await Promise.all([generateSecMsGec(), ensureMuidCookie()]);

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${rateStr}' pitch='+0Hz' volume='+0%'>${escapeXml(payload.text)}</prosody></voice></speak>`;

    const url = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
    console.log('[EdgeTTS] POST', url.slice(0, 80) + '...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    });

    console.log('[EdgeTTS] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[EdgeTTS] Error:', response.status, errorText);
      return { success: false, error: `Edge TTS error: ${response.status} ${errorText}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log('[EdgeTTS] Audio size:', arrayBuffer.byteLength, 'bytes');

    if (arrayBuffer.byteLength === 0) {
      return { success: false, error: 'Edge TTS returned empty audio' };
    }

    return { success: true, audioBase64: arrayBufferToBase64(arrayBuffer) };
  } catch (e) {
    console.error('[EdgeTTS] Exception:', e);
    return { success: false, error: `Edge TTS failed: ${String(e)}` };
  }
}
