import type { VercelRequest, VercelResponse } from '@vercel/node';
import { synthesizeSpeech } from '../src/shared/tts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const audioBuffer = await synthesizeSpeech(req.body || {});

    if (audioBuffer.length === 0) {
      return res.status(500).json({ error: 'Empty audio response' });
    }

    // Return raw MP3 binary
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.status(200).send(audioBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message === 'Missing "text" field' ? 400 : 500;
    if (statusCode === 500) {
      console.error('[edge-tts-proxy]', error);
    }
    return res.status(statusCode).json({ error: message });
  }
}
