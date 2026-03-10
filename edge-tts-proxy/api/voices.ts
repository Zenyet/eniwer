import type { VercelRequest, VercelResponse } from '@vercel/node';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICE_LIST_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';

// In-memory cache (per cold start instance)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 3600_000; // 1 hour

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return cached
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json({ success: true, voices: cache.data });
  }

  try {
    const resp = await fetch(
      `${VOICE_LIST_URL}?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: `Upstream ${resp.status}` });
    }

    const voices = await resp.json();
    cache = { data: voices, ts: Date.now() };
    return res.status(200).json({ success: true, voices });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
}
