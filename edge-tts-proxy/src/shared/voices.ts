const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICE_LIST_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';
const CACHE_TTL = 3600_000;

let cache: { data: unknown; ts: number } | null = null;

export async function getVoices() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  const response = await fetch(`${VOICE_LIST_URL}?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream ${response.status}`);
  }

  const voices = await response.json();
  cache = { data: voices, ts: Date.now() };
  return voices;
}
