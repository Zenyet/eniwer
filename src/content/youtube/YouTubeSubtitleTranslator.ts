// YouTube Subtitle Translator
// Sliding-window translation: prioritizes subtitles near the current playback position

import { MenuConfig } from '../../types';
import { resolveLanguageName } from '../../utils/ai';
import { SubtitleSegment } from './YouTubeSubtitleExtractor';

export interface TranslatedSegment extends SubtitleSegment {
  translatedText: string;
}

// Window parameters (milliseconds)
const BUFFER_BEHIND = 5_000;
const BUFFER_AHEAD = 60_000;
const PREFETCH_AHEAD = 120_000;
const LOOP_INTERVAL = 500;

const MAX_RETRIES = 2;

export class YouTubeSubtitleTranslator {
  private cache: Map<string, string> = new Map();
  private config: MenuConfig;
  private aborted = false;

  // Sliding-window state
  private segments: TranslatedSegment[] = [];
  private videoId = '';
  private targetLang = '';
  private currentTimeMs = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private translatingBatch = false;
  private onSegmentReady?: (index: number, translated: string) => void;
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
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  isTranslating(): boolean {
    return this.loopTimer !== null || this.translatingBatch;
  }

  /** Called by manager whenever playback position changes or user seeks */
  updateCurrentTime(timeMs: number): void {
    const jumped = Math.abs(timeMs - this.currentTimeMs) > 3000;
    this.currentTimeMs = timeMs;

    // On seek: restart the translation loop immediately to prioritize new position
    if (jumped && !this.translatingBatch) {
      if (this.loopTimer !== null) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
      this.runTranslationLoop();
    }
  }

  /**
   * Start sliding-window translation.
   * Stores segments internally and begins a loop that translates around currentTimeMs.
   */
  translateWindow(
    segments: SubtitleSegment[],
    videoId: string,
    targetLang: string,
    currentTimeMs: number,
    onSegmentReady?: (index: number, translated: string) => void,
  ): void {
    this.abort(); // stop any previous loop

    this.segments = segments.map(seg => ({
      ...seg,
      translatedText: '',
    }));
    this.videoId = videoId;
    this.targetLang = targetLang;
    this.currentTimeMs = currentTimeMs;
    this.aborted = false;
    this.onSegmentReady = onSegmentReady;
    this.retryCount.clear();

    // Restore from cache
    for (let i = 0; i < this.segments.length; i++) {
      const cacheKey = `${videoId}:${i}:${this.segments[i].text}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.segments[i].translatedText = cached;
      }
    }

    this.runTranslationLoop();
  }

  /** Returns the internal translated segments array (shared reference). */
  getSegments(): TranslatedSegment[] {
    return this.segments;
  }

  // --------------- internal ---------------

  private async runTranslationLoop(): Promise<void> {
    if (this.aborted) return;

    // Find next window of untranslated segments
    const range = this.findWindowRange(this.currentTimeMs);
    if (range) {
      await this.translateRange(range.start, range.end);
    }

    if (this.aborted) return;

    // Check if there is still work to do anywhere
    const hasUntranslated = this.segments.some((s, i) =>
      !s.translatedText && (this.retryCount.get(i) || 0) < MAX_RETRIES
    );
    if (hasUntranslated) {
      this.loopTimer = setTimeout(() => this.runTranslationLoop(), LOOP_INTERVAL);
    } else {
      this.loopTimer = null;
    }
  }

  /**
   * Finds a range of untranslated segment indices near currentTimeMs.
   * Priority: BUFFER_BEHIND..BUFFER_AHEAD first, then up to PREFETCH_AHEAD.
   * Returns null if everything in the window is already translated.
   */
  private findWindowRange(timeMs: number): { start: number; end: number } | null {
    const windowStart = timeMs - BUFFER_BEHIND;
    const windowEnd = timeMs + PREFETCH_AHEAD;

    // Collect untranslated indices within the window, prioritising near segments
    const nearEnd = timeMs + BUFFER_AHEAD;

    // First pass: near window (behind 5s ~ ahead 60s)
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.translatedText || (this.retryCount.get(i) || 0) >= MAX_RETRIES) continue;
      const segEnd = seg.startMs + seg.durationMs;
      if (segEnd >= windowStart && seg.startMs <= nearEnd) {
        // Found first untranslated in near window — build a batch from here
        return this.buildBatchFrom(i, windowEnd);
      }
    }

    // Second pass: prefetch window (60s ~ 120s ahead)
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.translatedText || (this.retryCount.get(i) || 0) >= MAX_RETRIES) continue;
      const segEnd = seg.startMs + seg.durationMs;
      if (segEnd >= nearEnd && seg.startMs <= windowEnd) {
        return this.buildBatchFrom(i, windowEnd);
      }
    }

    // Third pass: anything remaining outside the window (translate rest eventually)
    for (let i = 0; i < this.segments.length; i++) {
      if (!this.segments[i].translatedText && (this.retryCount.get(i) || 0) < MAX_RETRIES) {
        return this.buildBatchFrom(i, Infinity);
      }
    }

    return null;
  }

  private buildBatchFrom(startIdx: number, windowEndMs: number): { start: number; end: number } {
    const BATCH_SIZE = 20;
    const MAX_CHARS = 2000;
    let end = startIdx;
    let chars = 0;
    let count = 0;

    while (end < this.segments.length && count < BATCH_SIZE) {
      const seg = this.segments[end];
      // skip already translated or retry-exhausted
      if (seg.translatedText || (this.retryCount.get(end) || 0) >= MAX_RETRIES) { end++; continue; }
      if (windowEndMs !== Infinity && seg.startMs > windowEndMs) break;
      chars += seg.text.length;
      if (chars > MAX_CHARS && count > 0) break;
      count++;
      end++;
    }

    return { start: startIdx, end };
  }

  private async translateRange(start: number, end: number): Promise<void> {
    // Collect untranslated items in [start, end)
    const items: { index: number; text: string }[] = [];
    for (let i = start; i < end; i++) {
      if (!this.segments[i].translatedText) {
        items.push({ index: i, text: this.segments[i].text });
      }
    }
    if (items.length === 0) return;

    this.translatingBatch = true;
    try {
      const translations = await this.translateBatch(
        items.map(it => it.text),
        this.targetLang,
      );

      for (let i = 0; i < items.length; i++) {
        if (this.aborted) break;
        const translation = translations[i];
        if (!translation) continue; // skip empty — will be retried
        const segIndex = items[i].index;
        this.segments[segIndex].translatedText = translation;

        const cacheKey = `${this.videoId}:${segIndex}:${this.segments[segIndex].text}`;
        this.cache.set(cacheKey, translation);

        this.onSegmentReady?.(segIndex, translation);
      }
    } catch {
      // Increment retry count for each item so we don't loop forever
      for (const item of items) {
        this.retryCount.set(item.index, (this.retryCount.get(item.index) || 0) + 1);
      }
    } finally {
      this.translatingBatch = false;
    }
  }

  private async translateBatch(texts: string[], targetLang: string): Promise<string[]> {
    const translationProvider = this.config.translation?.provider || 'ai';

    if (translationProvider !== 'ai') {
      return this.translateViaFreeService(texts, targetLang, translationProvider);
    }

    return this.translateViaAI(texts, targetLang);
  }

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
