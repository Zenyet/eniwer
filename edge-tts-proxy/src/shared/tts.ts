import { createHash, randomBytes } from 'crypto';
import WebSocket from 'ws';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const WIN_EPOCH_DIFF = 11644473600;
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`;

export type TtsInput = {
  durationMs?: number;
  rate?: number;
  text: string;
  voice?: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateUUID(): string {
  return randomBytes(16).toString('hex');
}

function generateSecMsGec(): string {
  let winTs = Math.floor(Date.now() / 1000) + WIN_EPOCH_DIFF;
  winTs = winTs - (winTs % 300);
  const ticks = BigInt(winTs) * BigInt(10_000_000);
  const toHash = `${ticks}${TRUSTED_CLIENT_TOKEN}`;
  return createHash('sha256').update(toHash, 'ascii').digest('hex').toUpperCase();
}

function generateMUID(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

function calcRateStr(text: string, targetDurationMs?: number, fallbackRate?: number): string {
  if (targetDurationMs && targetDurationMs > 0) {
    const cjkRe = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
    const cjkCount = (text.match(cjkRe) || []).length;
    const otherCount = text.length - cjkCount;
    const estimatedMs = cjkCount * 200 + otherCount * 60 + 300;
    const rate = Math.max(0.5, Math.min(2.0, estimatedMs / targetDurationMs));
    const pct = Math.round((rate - 1.0) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  const rate = fallbackRate ?? 1.0;
  const pct = Math.round((rate - 1.0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

async function synthesize(text: string, voice: string, rateStr: string): Promise<Buffer> {
  const secMsGec = generateSecMsGec();
  const connectionId = generateUUID();
  const requestId = generateUUID();
  const muid = generateMUID();

  const wsUrl = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rateStr}' pitch='+0Hz' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Cookie: `muid=${muid};`,
        Origin: EDGE_ORIGIN,
        Pragma: 'no-cache',
        'User-Agent': EDGE_UA,
      },
    });

    const audioChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout (25s)'));
    }, 25000);

    ws.on('open', () => {
      ws.send(
        'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'true',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          })
      );

      ws.send(
        `X-RequestId:${requestId}\r\n` +
          'Content-Type:application/ssml+xml\r\n' +
          'Path:ssml\r\n\r\n' +
          ssml
      );
    });

    ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      if (!isBinary) {
        if (data.toString().includes('Path:turn.end')) {
          clearTimeout(timeout);
          ws.close();
          resolve(Buffer.concat(audioChunks));
        }
        return;
      }

      const buffer = data as Buffer;
      if (buffer.length <= 2) {
        return;
      }

      const headerLen = buffer.readUInt16BE(0);
      const audioData = buffer.subarray(2 + headerLen);
      if (audioData.length > 0) {
        audioChunks.push(audioData);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', (code) => {
      clearTimeout(timeout);
      if (audioChunks.length === 0) {
        reject(new Error(`WebSocket closed unexpectedly (code: ${code})`));
      }
    });
  });
}

export async function synthesizeSpeech(input: TtsInput): Promise<Buffer> {
  const { durationMs, rate, text, voice } = input;

  if (!text || typeof text !== 'string') {
    throw new Error('Missing "text" field');
  }

  const voiceName = voice || 'zh-CN-XiaoxiaoNeural';
  const rateStr = calcRateStr(text, durationMs, rate);
  return synthesize(text, voiceName, rateStr);
}
