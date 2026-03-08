// YouTube Subtitle Translator
// Batches and translates subtitle segments using existing translation infrastructure

import { MenuConfig } from '../../types';
import { SubtitleSegment } from './YouTubeSubtitleExtractor';

export interface TranslatedSegment extends SubtitleSegment {
  translatedText: string;
}

export class YouTubeSubtitleTranslator {
  private cache: Map<string, string> = new Map();
  private config: MenuConfig;
  private translating = false;
  private aborted = false;

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

  async translateSegments(
    segments: SubtitleSegment[],
    videoId: string,
    targetLang: string,
    onProgress?: (translated: TranslatedSegment[]) => void
  ): Promise<TranslatedSegment[]> {
    this.translating = true;
    this.aborted = false;

    const result: TranslatedSegment[] = segments.map(seg => ({
      ...seg,
      translatedText: '',
    }));

    // Check cache first
    const untranslated: { index: number; text: string }[] = [];
    for (let i = 0; i < segments.length; i++) {
      const cacheKey = `${videoId}:${i}:${segments[i].text}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        result[i].translatedText = cached;
      } else {
        untranslated.push({ index: i, text: segments[i].text });
      }
    }

    if (untranslated.length === 0) {
      this.translating = false;
      return result;
    }

    // Batch translate
    const BATCH_SIZE = 20;
    const MAX_CHARS = 2000;

    const batches: { index: number; text: string }[][] = [];
    let currentBatch: { index: number; text: string }[] = [];
    let currentChars = 0;

    for (const item of untranslated) {
      if (currentBatch.length >= BATCH_SIZE || (currentChars + item.text.length > MAX_CHARS && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }
      currentBatch.push(item);
      currentChars += item.text.length;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    for (const batch of batches) {
      if (this.aborted) break;

      try {
        const translations = await this.translateBatch(
          batch.map(b => b.text),
          targetLang
        );

        for (let i = 0; i < batch.length; i++) {
          const translation = translations[i] || batch[i].text;
          const segIndex = batch[i].index;
          result[segIndex].translatedText = translation;

          const cacheKey = `${videoId}:${segIndex}:${segments[segIndex].text}`;
          this.cache.set(cacheKey, translation);
        }

        onProgress?.(result);
      } catch {
        // On error, keep original text
        for (const item of batch) {
          result[item.index].translatedText = item.text;
        }
      }
    }

    this.translating = false;
    return result;
  }

  private async translateBatch(texts: string[], targetLang: string): Promise<string[]> {
    const translationProvider = this.config.translation?.provider || 'ai';

    // Join texts with a numbered separator for batch translation
    const separator = '\n[SEP]\n';
    const joined = texts.join(separator);

    if (translationProvider !== 'ai') {
      // Use free translation service
      return this.translateViaFreeService(texts, targetLang, translationProvider);
    }

    // Use AI translation
    return this.translateViaAI(joined, texts.length, targetLang, separator);
  }

  private async translateViaFreeService(
    texts: string[],
    targetLang: string,
    provider: string
  ): Promise<string[]> {
    // Translate each text individually via FREE_TRANSLATE
    // (free services don't support batch well with separators)
    const results: string[] = [];

    for (const text of texts) {
      if (this.aborted) {
        results.push(text);
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
          results.push(text);
        }
      } catch {
        results.push(text);
      }
    }

    return results;
  }

  private async translateViaAI(
    joinedText: string,
    count: number,
    targetLang: string,
    separator: string
  ): Promise<string[]> {
    const systemPrompt = `You are a subtitle translator. Translate the following subtitle lines to ${targetLang}. The lines are separated by "[SEP]". Keep the same number of lines and separators. Output ONLY the translated lines separated by "[SEP]", nothing else. Preserve the original meaning and keep translations concise for subtitle display.`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_REQUEST',
        payload: {
          action: 'custom',
          text: joinedText,
          systemPrompt,
          config: this.config,
        },
      });

      if (response.success && response.result) {
        const translated = response.result.split(separator).map((s: string) => s.trim());
        // Pad or trim to match expected count
        while (translated.length < count) translated.push('');
        return translated.slice(0, count);
      }
    } catch {
      // fallback
    }

    return joinedText.split(separator).map((s: string) => s.trim());
  }
}
