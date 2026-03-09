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

// ===== Edge TTS (free, Microsoft Translator approach) =====

const TRANSLATOR_SECRET = 'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==';
const TRANSLATOR_APP_ID = 'MSTranslatorAndroidApp';

let cachedToken: { token: string; region: string; expiresAt: number } | null = null;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function hmacSHA256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const encoder = new TextEncoder();
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getEdgeTTSToken(): Promise<{ token: string; region: string }> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { token: cachedToken.token, region: cachedToken.region };
  }

  const uuid = generateUUID();
  const urlPath = '/apps/endpoint?api-version=1.0';
  const encodedPath = encodeURIComponent(urlPath);
  const date = new Date().toUTCString().toLowerCase();
  const stringToSign = `${TRANSLATOR_APP_ID}${encodedPath}${date}${uuid}`.toLowerCase();

  const keyBuffer = base64ToBuffer(TRANSLATOR_SECRET);
  const sigBuffer = await hmacSHA256(keyBuffer, stringToSign);
  const signature = bufferToBase64(sigBuffer);
  const authHeader = `${TRANSLATOR_APP_ID}::${signature}::${date}::${uuid}`;

  const response = await fetch(`https://dev.microsofttranslator.com${urlPath}`, {
    method: 'POST',
    headers: {
      'X-MT-Signature': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data = await response.json();
  const token = data.t as string;
  const region = data.r as string;

  // Parse JWT to get expiry (basic base64url decode of payload)
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(payloadB64));
      if (payload.exp) {
        // Cache with 60s safety margin
        cachedToken = { token, region, expiresAt: (payload.exp - 60) * 1000 };
      }
    }
  } catch {
    // If JWT parse fails, cache for 5 minutes
    cachedToken = { token, region, expiresAt: Date.now() + 5 * 60 * 1000 };
  }

  return { token, region };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSSML(text: string, voice: string, rate: number, pitch: number): string {
  // Rate: 1.0 → 0%, 0.5 → -50%, 2.0 → +100%
  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  const pitchStr = pitch >= 0 ? `+${pitch}%` : `${pitch}%`;

  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
  <voice name="${voice}">
    <mstts:express-as style="general">
      <prosody rate="${rateStr}" pitch="${pitchStr}" volume="50">
        ${escapeXml(text)}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
}

export async function handleTTSEdge(payload: {
  text: string;
  voice: string;
  rate: number;
}): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const voice = payload.voice || 'zh-CN-XiaoxiaoNeural';
  const rate = payload.rate || 1.0;

  try {
    const { token, region } = await getEdgeTTSToken();

    const ssml = buildSSML(payload.text, voice, rate, 0);
    const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!response.ok) {
      // Token might be expired, clear cache and let next call retry
      cachedToken = null;
      const errorText = await response.text().catch(() => '');
      return { success: false, error: `Edge TTS error: ${response.status} ${errorText}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { success: false, error: 'Edge TTS returned empty audio' };
    }

    const audioBase64 = arrayBufferToBase64(arrayBuffer);
    return { success: true, audioBase64 };
  } catch (e) {
    cachedToken = null;
    return { success: false, error: `Edge TTS failed: ${String(e)}` };
  }
}
