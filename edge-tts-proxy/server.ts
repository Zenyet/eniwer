import { createServer } from 'http';
import { readJsonBody, sendJson, setCorsHeaders } from './src/shared/http';
import { synthesizeSpeech } from './src/shared/tts';
import { getVoices } from './src/shared/voices';

const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (!req.url || !req.method) {
    return sendJson(res, 400, { error: 'Bad request' });
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && req.url === '/api/voices') {
    try {
      const voices = await getVoices();
      return sendJson(res, 200, { success: true, voices });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendJson(res, 500, { success: false, error: message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/tts') {
    try {
      const body = await readJsonBody(req);
      const audioBuffer = await synthesizeSpeech(body);

      if (audioBuffer.length === 0) {
        return sendJson(res, 500, { error: 'Empty audio response' });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      return res.end(audioBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message === 'Missing "text" field' ? 400 : 500;
      if (statusCode === 500) {
        console.error('[edge-tts-proxy]', error);
      }
      return sendJson(res, statusCode, { error: message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`edge-tts-proxy listening on :${port}`);
});
