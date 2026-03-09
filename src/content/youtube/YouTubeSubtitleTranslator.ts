// YouTube Subtitle Translator
// One-shot translation: translates all subtitles in a single pass (chunked if >200 segments)

import { MenuConfig } from '../../types';
import { resolveLanguageName } from '../../utils/ai';
import { SubtitleSegment } from './YouTubeSubtitleExtractor';

export interface TranslatedSegment extends SubtitleSegment {
  translatedText: string;
}

const MAX_RETRIES = 2;
const CHUNK_SIZE = 200;

export class YouTubeSubtitleTranslator {
  private cache: Map<string, string> = new Map();
  private config: MenuConfig;
  private aborted = false;

  private segments: TranslatedSegment[] = [];
  private videoId = '';
  private targetLang = '';
  private translating = false;
  private onSegmentReady?: (index: number, translated: string) => void;
  private onProgress?: (translated: number, total: number) => void;
  /** Track how many times each segment index has failed translation */
  private retryCount: Map<number, number> = new Map();

  constructor(config: MenuConfig) {
    this.config = config;
  }

  updateConfig(config: MenuConfig): void {
    this.config = config;
  }

  clearCache(): void {
    this.cache.clear();
  }

  abort(): void {
    this.aborted = true;
  }

  isTranslating(): boolean {
    return this.translating;
  }

  /**
   * Translate all segments in one shot.
   * For AI provider: sends all segments at once (chunked if >CHUNK_SIZE).
   * For free providers: translates one-by-one as before.
   */
  async translateWindow(
    segments: SubtitleSegment[],
    videoId: string,
    targetLang: string,
    onSegmentReady?: (index: number, translated: string) => void,
    onProgress?: (translated: number, total: number) => void,
  ): Promise<void> {
    this.abort(); // stop any previous work

    this.segments = segments.map(seg => ({
      ...seg,
      translatedText: '',
    }));
    this.videoId = videoId;
    this.targetLang = targetLang;
    this.aborted = false;
    this.translating = true;
    this.onSegmentReady = onSegmentReady;
    this.onProgress = onProgress;
    this.retryCount.clear();

    // Restore from cache
    let cachedCount = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const cacheKey = `${videoId}:${i}:${this.segments[i].text}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.segments[i].translatedText = cached;
        cachedCount++;
      }
    }

    // Collect untranslated indices
    const untranslated = this.segments
      .map((seg, i) => (!seg.translatedText ? i : -1))
      .filter(i => i >= 0);

    if (untranslated.length === 0) {
      this.translating = false;
      this.onProgress?.(this.segments.length, this.segments.length);
      return;
    }

    const total = untranslated.length;
    let translated = 0;
    this.onProgress?.(cachedCount, this.segments.length);

    try {
      const translationProvider = this.config.translation?.provider || 'ai';

      if (translationProvider !== 'ai') {
        // Free translation: one by one
        for (const idx of untranslated) {
          if (this.aborted) break;
          const texts = [this.segments[idx].text];
          try {
            const results = await this.translateViaFreeService(texts, targetLang, translationProvider);
            if (results[0]) {
              this.segments[idx].translatedText = results[0];
              const cacheKey = `${videoId}:${idx}:${this.segments[idx].text}`;
              this.cache.set(cacheKey, results[0]);
              this.onSegmentReady?.(idx, results[0]);
            }
          } catch {
            this.retryCount.set(idx, (this.retryCount.get(idx) || 0) + 1);
          }
          translated++;
          this.onProgress?.(cachedCount + translated, this.segments.length);
        }
      } else {
        // AI translation: chunk if needed
        for (let chunkStart = 0; chunkStart < untranslated.length; chunkStart += CHUNK_SIZE) {
          if (this.aborted) break;

          const chunkIndices = untranslated.slice(chunkStart, chunkStart + CHUNK_SIZE);
          const chunkTexts = chunkIndices.map(i => this.segments[i].text);

          try {
            const results = await this.translateViaAI(chunkTexts, targetLang);

            for (let j = 0; j < chunkIndices.length; j++) {
              if (this.aborted) break;
              const segIndex = chunkIndices[j];
              const translation = results[j];
              if (!translation) continue;

              this.segments[segIndex].translatedText = translation;
              const cacheKey = `${videoId}:${segIndex}:${this.segments[segIndex].text}`;
              this.cache.set(cacheKey, translation);
              this.onSegmentReady?.(segIndex, translation);
            }
          } catch {
            for (const idx of chunkIndices) {
              this.retryCount.set(idx, (this.retryCount.get(idx) || 0) + 1);
            }
          }

          translated += chunkIndices.length;
          this.onProgress?.(cachedCount + translated, this.segments.length);
        }

        // Retry failed segments (up to MAX_RETRIES)
        if (!this.aborted) {
          const failed = untranslated.filter(i =>
            !this.segments[i].translatedText && (this.retryCount.get(i) || 0) < MAX_RETRIES
          );
          if (failed.length > 0) {
            const failedTexts = failed.map(i => this.segments[i].text);
            try {
              const retryResults = await this.translateViaAI(failedTexts, targetLang);
              for (let j = 0; j < failed.length; j++) {
                if (this.aborted) break;
                const segIndex = failed[j];
                const translation = retryResults[j];
                if (!translation) {
                  this.retryCount.set(segIndex, (this.retryCount.get(segIndex) || 0) + 1);
                  continue;
                }
                this.segments[segIndex].translatedText = translation;
                const cacheKey = `${videoId}:${segIndex}:${this.segments[segIndex].text}`;
                this.cache.set(cacheKey, translation);
                this.onSegmentReady?.(segIndex, translation);
              }
            } catch {
              // exhausted retries
            }
          }
        }
      }
    } finally {
      this.translating = false;
      this.onProgress?.(this.segments.length, this.segments.length);
    }
  }

  /** Returns the internal translated segments array (shared reference). */
  getSegments(): TranslatedSegment[] {
    return this.segments;
  }

  // --------------- internal ---------------

  private async translateViaFreeService(
    texts: string[],
    targetLang: string,
    provider: string
  ): Promise<string[]> {
    const results: string[] = [];

    for (const text of texts) {
      if (this.aborted) {
        results.push('');
        continue;
      }

      try {
        const customValue = provider === 'deeplx'
          ? this.config.translation?.deeplxApiKey
          : this.config.translation?.customUrl;

        const response = await chrome.runtime.sendMessage({
          type: 'FREE_TRANSLATE',
          payload: {
            text,
            targetLang,
            provider,
            customUrl: customValue,
          },
        });

        if (response.success && response.result) {
          results.push(response.result);
        } else {
          results.push('');
        }
      } catch {
        results.push('');
      }
    }

    return results;
  }

  /**
   * AI translation using numbered line format for reliable parsing.
   * Sends:   [1] Hello\n[2] World
   * Expects: [1] 你好\n[2] 世界
   */
  private async translateViaAI(texts: string[], targetLang: string): Promise<string[]> {
    const langName = resolveLanguageName(targetLang);

    // Build numbered input
    const numberedLines = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');

    const systemPrompt =
      `You are a subtitle translator. Translate the following numbered subtitle lines to ${langName}.\n` +
      `Output each translation with the SAME number prefix [N].\n` +
      `Do NOT add or remove lines. Do NOT output anything else.\n` +
      `Keep translations concise for subtitle display.`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_REQUEST',
        payload: {
          action: 'custom',
          text: numberedLines,
          systemPrompt,
          config: this.config,
        },
      });

      if (response.success && response.result) {
        return this.parseNumberedResponse(response.result, texts);
      }
    } catch {
      // fallback below
    }

    return new Array<string>(texts.length).fill(''); // return empty on failure
  }

  /**
   * Parse AI response in numbered format: [1] translated text
   * Falls back to line-by-line split if regex doesn't match.
   */
  private parseNumberedResponse(raw: string, originals: string[]): string[] {
    const result = new Array<string>(originals.length).fill('');

    // Try regex parse
    const regex = /\[(\d+)\]\s*(.+)/g;
    let match: RegExpExecArray | null;
    let matchCount = 0;

    while ((match = regex.exec(raw)) !== null) {
      const idx = parseInt(match[1], 10) - 1; // 1-based to 0-based
      if (idx >= 0 && idx < originals.length) {
        result[idx] = match[2].trim();
        matchCount++;
      }
    }

    // If regex matched enough lines, use those results
    if (matchCount >= originals.length * 0.5) {
      // Leave missing slots empty — they will be retried
      return result;
    }

    // Fallback: split by newlines and assign sequentially
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < originals.length; i++) {
      result[i] = lines[i] || '';
    }
    return result;
  }
}
