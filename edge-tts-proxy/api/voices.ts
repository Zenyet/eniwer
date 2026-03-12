import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVoices } from '../src/shared/voices';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (_req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const voices = await getVoices();
    return res.status(200).json({ success: true, voices });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const upstreamStatus = message.match(/^Upstream (\d{3})$/)?.[1];
    return res.status(upstreamStatus ? Number(upstreamStatus) : 500).json({ success: false, error: message });
  }
}
