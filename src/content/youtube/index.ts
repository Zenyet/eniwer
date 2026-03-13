// YouTube Subtitle Manager
// Coordinates extractor, translator, and overlay lifecycle

import { MenuConfig, YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG, DEFAULT_TTS_CONFIG } from '../../types';
import { t } from '../../i18n';
import { YouTubeSubtitleExtractor, SubtitleSegment } from './YouTubeSubtitleExtractor';
import { YouTubeSubtitleTranslator } from './YouTubeSubtitleTranslator';
import { YouTubeSubtitleOverlay } from './YouTubeSubtitleOverlay';
import { YouTubeTTS } from './YouTubeTTS';

const LOG = '[Eniwer YT字幕]';
const TTS_PREFETCH_AHEAD = 3; // prefetch N groups ahead of current
const TTS_INITIAL_PREFETCH = 5; // prefetch first N groups before resuming video
const FIRST_CHUNK_READY_COUNT = 20; // match translator's FIRST_CHUNK_SIZE
const SENTENCE_END_RE = /[.!?。！？]$/;
const GROUP_GAP_THRESHOLD_MS = 500;

interface TTSGroup {
  startIdx: number;    // first segment index (inclusive)
  endIdx: number;      // last segment index (inclusive)
  totalDurationMs: number; // from first seg startMs to last seg endMs
}

export class YouTubeSubtitleManager {
  private extractor: YouTubeSubtitleExtractor;
  private translator: YouTubeSubtitleTranslator;
  private overlay: YouTubeSubtitleOverlay;
  private subtitleConfig: YouTubeSubtitleConfig;
  private initialized = false;
  private currentVideoId: string | null = null;
  private activeVideoChangeId = 0;
  private videoElement: HTMLVideoElement | null = null;
  private seekedHandler: (() => void) | null = null;
  private timeUpdateHandler: (() => void) | null = null;
  private tts: YouTubeTTS;
  private ttsEnabled = false;
  private lastSpokenGroupIdx = -1;
  /** Segments fetched but waiting for user to activate */
  private pendingSegments: SubtitleSegment[] | null = null;
  /** Timer for proactive TTS scheduling */
  private ttsScheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseHandler: (() => void) | null = null;
  private playHandler: (() => void) | null = null;
  /** TTS groups: merged sentence fragments for natural TTS */
  private ttsGroups: TTSGroup[] = [];
  /** Maps segIndex → groupIndex */
  private segToGroupIdx: number[] = [];
  /** Prevents tryPlayCurrentSegment during seek handling */
  private seekPending = false;
  /** Counter to prevent overlapping seek handlers */
  private seekId = 0;

  constructor(config: MenuConfig) {
    this.subtitleConfig = config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG;
    this.extractor = new YouTubeSubtitleExtractor();
    this.translator = new YouTubeSubtitleTranslator(config);
    this.overlay = new YouTubeSubtitleOverlay(this.subtitleConfig);
    this.tts = new YouTubeTTS(
      config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG,
      config,
    );
  }

  init(): void {
    if (this.initialized) return;
    if (!this.isYouTubeHost()) return;

    console.log(LOG, 'Manager init');
    this.initialized = true;
    this.extractor.init();

    this.extractor.setOnVideoChange((videoId) => {
      if (this.subtitleConfig.enabled) {
        this.handleVideoChange(videoId);
      }
    });

    if (this.subtitleConfig.enabled && YouTubeSubtitleExtractor.isYouTubePage()) {
      const videoId = YouTubeSubtitleExtractor.getVideoId();
      if (videoId) {
        this.handleVideoChange(videoId);
      }
    }
  }

  private isYouTubeHost(): boolean {
    return window.location.hostname === 'www.youtube.com';
  }

  destroy(): void {
    this.activeVideoChangeId++;
    this.translator.abort();
    this.tts.stop();
    this.ttsEnabled = false;
    this.lastSpokenGroupIdx = -1;
    this.pendingSegments = null;
    this.ttsGroups = [];
    this.segToGroupIdx = [];
    this.seekPending = false;
    this.seekId = 0;
    this.clearTTSSchedule();
    this.removeVideoListeners();
    this.overlay.unmount();
    this.currentVideoId = null;
  }

  updateConfig(config: MenuConfig): void {
    const oldEnabled = this.subtitleConfig.enabled;
    this.subtitleConfig = config.youtubeSubtitle || DEFAULT_YOUTUBE_SUBTITLE_CONFIG;

    this.translator.updateConfig(config);
    this.overlay.updateConfig(this.subtitleConfig);
    this.tts.updateConfig(
      config.youtubeSubtitleTTS || DEFAULT_TTS_CONFIG,
      config,
    );

    if (!this.isYouTubeHost()) return;

    if (!this.initialized) {
      this.init();
      return;
    }

    if (!YouTubeSubtitleExtractor.isYouTubePage()) return;

    if (!oldEnabled && this.subtitleConfig.enabled) {
      const videoId = YouTubeSubtitleExtractor.getVideoId();
      if (videoId) {
        this.handleVideoChange(videoId);
      }
    } else if (oldEnabled && !this.subtitleConfig.enabled) {
      this.destroy();
    } else if (this.subtitleConfig.enabled && this.currentVideoId) {
      this.handleVideoChange(this.currentVideoId);
    }
  }

  /**
   * handleVideoChange: mount overlay + logo button, fetch subtitles,
   * but do NOT translate or play TTS until user clicks the logo.
   */
  private async handleVideoChange(videoId: string): Promise<void> {
    const changeId = ++this.activeVideoChangeId;
    this.currentVideoId = videoId;
    this.translator.abort();
    this.translator.clearCache();
    this.tts.stop();
    this.ttsEnabled = false;
    this.lastSpokenGroupIdx = -1;
    this.pendingSegments = null;
    this.ttsGroups = [];
    this.segToGroupIdx = [];
    this.overlay.unmount();
    this.overlay.setSegments([]);

    console.log(LOG, '=== 开始处理视频 ===', videoId);

    const playerReady = await this.waitForPlayer(8000);
    if (changeId !== this.activeVideoChangeId) return;
    if (!playerReady) { console.warn(LOG, '播放器超时'); return; }

    if (!this.overlay.mount()) {
      await new Promise(r => setTimeout(r, 1500));
      if (changeId !== this.activeVideoChangeId) return;
      if (!this.overlay.mount()) return;
    }

    // Set up the logo-click callback — this triggers translation + TTS
    this.overlay.setActivateCallback((active) => {
      if (active) {
        this.startSubtitleAndTTS(changeId);
      } else {
        this.translator.abort();
        this.tts.stop();
        this.ttsEnabled = false;
        this.lastSpokenGroupIdx = -1;
        this.ttsGroups = [];
        this.segToGroupIdx = [];
        this.seekPending = false;
        this.seekId = 0;
        this.clearTTSSchedule();
        this.overlay.setStatus('');
        this.overlay.setSegments([]);
      }
    });

    // Pre-fetch subtitle tracks (fast, just metadata) so activation is instant
    await this.prefetchSubtitles(changeId);
  }

  /** Fetch subtitle segments in advance so they're ready when user clicks. */
  private async prefetchSubtitles(changeId: number): Promise<void> {
    let segments: SubtitleSegment[] = [];
    try {
      console.log(LOG, '步骤1: 通过 InnerTube 预取字幕...');
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_YOUTUBE_CAPTIONS',
        payload: {
          videoId: this.currentVideoId,
          lang: this.subtitleConfig.sourceLanguage,
        },
      });
      if (response.success && Array.isArray(response.segments) && response.segments.length > 0) {
        segments = response.segments;
        console.log(LOG, 'InnerTube 预取字幕:', segments.length, '条');
      }
    } catch (e) {
      console.warn(LOG, 'InnerTube 字幕请求异常:', e);
    }

    if (changeId !== this.activeVideoChangeId) return;

    if (segments.length === 0) {
      console.log(LOG, 'InnerTube 未取到字幕，回退到播放器接口...');
      const playerData = await this.extractor.extractViaPlayerAPI();
      if (changeId !== this.activeVideoChangeId) return;

      if (!playerData || playerData.captionTracks.length === 0) {
        console.warn(LOG, '未找到字幕轨道');
        this.pendingSegments = null;
        return;
      }

      this.extractor.setCaptionTracks(playerData.captionTracks);
      console.log(LOG, '找到', playerData.captionTracks.length, '个字幕轨道');

      const track = this.extractor.selectTrack(this.subtitleConfig.sourceLanguage);
      if (!track) {
        this.pendingSegments = null;
        return;
      }

      const potToken = this.extractor.extractPotToken(track, playerData.audioCaptionTracks);
      const subtitleUrl = this.extractor.buildSubtitleUrl(
        track, potToken, playerData.clientVersion, playerData.device
      );

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_URL',
          payload: { url: subtitleUrl },
        });
        if (response.success && response.data && response.data.length > 10) {
          segments = this.parseJson3(response.data);
          console.log(LOG, '播放器接口预取字幕:', segments.length, '条');
        }
      } catch (e) {
        console.warn(LOG, '播放器字幕请求异常:', e);
      }

      if (changeId !== this.activeVideoChangeId) return;

      // Fallback without PO Token
      if (segments.length === 0 && potToken.pot) {
        const fallbackUrl = track.baseUrl + '&fmt=json3';
        try {
          const resp = await chrome.runtime.sendMessage({
            type: 'FETCH_URL',
            payload: { url: fallbackUrl },
          });
          if (resp.success && resp.data && resp.data.length > 10) {
            segments = this.parseJson3(resp.data);
            console.log(LOG, '无 PO Token 兜底预取字幕:', segments.length, '条');
          }
        } catch { /* ignore */ }
      }
    }

    if (changeId !== this.activeVideoChangeId) return;

    this.pendingSegments = segments.length > 0 ? segments : null;
    console.log(LOG, '字幕预取完成,', segments.length, '条, 等待用户点击 logo 激活');
  }

  /** Called when user clicks the logo — pause video, start translation + TTS, resume when ready. */
  private async startSubtitleAndTTS(changeId: number): Promise<void> {
    const videoId = this.currentVideoId;
    if (!videoId) return;

    const segments = this.pendingSegments;
    if (!segments || segments.length === 0) {
      this.overlay.setStatus(t('youtube.noSubtitlesAvailable'));
      return;
    }

    console.log(LOG, '=== 用户激活, 开始翻译 + TTS ===');

    // Pause video while preparing
    const video = document.querySelector('.html5-video-player video') as HTMLVideoElement | null;
    if (video) video.pause();

    // Start translation and wait for first chunk
    this.overlay.setStatus(t('youtube.translating'));

    let resolveFirstChunk: () => void;
    let firstChunkResolved = false;
    const firstChunkReady = new Promise<void>(r => { resolveFirstChunk = r; });

    // Fire-and-forget full translation (don't await — it runs to completion)
    this.translator.translateWindow(
      segments,
      videoId,
      this.subtitleConfig.targetLanguage,
      (_index, _translated) => {
        if (changeId !== this.activeVideoChangeId) return;
        this.overlay.setSegments(this.translator.getSegments());
      },
      (translated, total) => {
        if (changeId !== this.activeVideoChangeId) return;
        if (translated < total) {
          this.overlay.setStatus(`${t('youtube.translating')} ${translated}/${total}`);
        } else {
          this.overlay.setStatus('');
        }
        // Resolve when first chunk is done
        if (!firstChunkResolved && translated >= Math.min(FIRST_CHUNK_READY_COUNT, total)) {
          firstChunkResolved = true;
          resolveFirstChunk();
        }
      },
    );

    this.overlay.setSegments(this.translator.getSegments());

    // Wait for first chunk of translations
    await firstChunkReady;
    if (changeId !== this.activeVideoChangeId) return;

    console.log(LOG, '第一批翻译完成, 预取 TTS 音频...');

    // Pre-fetch TTS for first N translated groups
    const ttsConf = this.tts.getConfig();
    if (ttsConf.enabled) {
      this.ttsEnabled = true;
      this.buildTTSGroups(segments);
      const segs = this.translator.getSegments();
      const prefetchPromises: Promise<void>[] = [];
      for (let gi = 0; gi < Math.min(TTS_INITIAL_PREFETCH, this.ttsGroups.length); gi++) {
        const group = this.ttsGroups[gi];
        const mergedText = this.getMergedGroupText(segs, group);
        if (mergedText) {
          prefetchPromises.push(this.tts.prefetchAsync(mergedText, group.totalDurationMs));
        }
      }
      if (prefetchPromises.length > 0) {
        await Promise.all(prefetchPromises);
      }
    }

    if (changeId !== this.activeVideoChangeId) return;

    // Attach listeners for TTS scheduling
    this.attachVideoListeners(changeId);

    // Resume video playback
    if (video) {
      console.log(LOG, '准备就绪, 恢复视频播放');
      video.play().catch(() => {});
    }

    console.log(LOG, '=== 翻译 + TTS 已启动 ===');
  }

  private attachVideoListeners(changeId: number): void {
    this.removeVideoListeners();
    const video = document.querySelector('.html5-video-player video') as HTMLVideoElement | null;
    if (!video) return;

    this.videoElement = video;

    this.timeUpdateHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      if (!this.ttsEnabled) return;
      this.tryPlayCurrentSegment(changeId);
    };

    this.seekedHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      this.tts.stop();
      this.clearTTSSchedule();
      if (!this.ttsEnabled) {
        this.lastSpokenGroupIdx = -1;
        return;
      }
      this.seekPending = true;
      this.handleSeekTTS(changeId);
    };

    this.pauseHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      this.tts.pause();
      this.clearTTSSchedule();
    };

    this.playHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      this.tts.resume();
    };

    video.addEventListener('timeupdate', this.timeUpdateHandler);
    video.addEventListener('seeked', this.seekedHandler);
    video.addEventListener('pause', this.pauseHandler);
    video.addEventListener('play', this.playHandler);
  }

  /** Try to play TTS for the current subtitle segment's group (called from timeupdate + proactive scheduler). */
  private tryPlayCurrentSegment(changeId: number): void {
    if (changeId !== this.activeVideoChangeId) return;
    if (!this.ttsEnabled || !this.videoElement) return;
    if (this.seekPending) return;
    if (this.tts.isPlaying()) return;

    const currentTimeMs = this.videoElement.currentTime * 1000;
    const segIndex = this.overlay.getCurrentSegmentIndex(currentTimeMs);
    if (segIndex < 0) return;

    const groupIdx = this.segToGroupIdx[segIndex] ?? -1;
    if (groupIdx < 0) return;

    // Prefetch upcoming groups' audio
    const segs = this.translator.getSegments();
    for (let ahead = 1; ahead <= TTS_PREFETCH_AHEAD; ahead++) {
      const futureGroup = this.ttsGroups[groupIdx + ahead];
      if (futureGroup) {
        const mergedText = this.getMergedGroupText(segs, futureGroup);
        if (mergedText) {
          this.tts.prefetch(mergedText, futureGroup.totalDurationMs);
        }
      }
    }

    if (groupIdx === this.lastSpokenGroupIdx) return;

    const group = this.ttsGroups[groupIdx];
    // Only start TTS if current seg is the first in the group
    if (segIndex !== group.startIdx) return;

    const mergedText = this.getMergedGroupText(segs, group);
    if (!mergedText) return;

    this.lastSpokenGroupIdx = groupIdx;
    this.tts.speak(mergedText, group.totalDurationMs)
      .then(() => this.onTTSGroupFinished(changeId, groupIdx))
      .catch(() => this.onTTSGroupFinished(changeId, groupIdx));
  }

  /**
   * Proactive TTS scheduling: after a group finishes, calculate when the
   * next group starts and schedule playback precisely with setTimeout.
   */
  private onTTSGroupFinished(changeId: number, finishedGroupIdx: number): void {
    if (changeId !== this.activeVideoChangeId) return;
    if (!this.ttsEnabled || !this.videoElement) return;

    const nextGIdx = finishedGroupIdx + 1;
    const nextGroup = this.ttsGroups[nextGIdx];
    if (!nextGroup) return;

    const segs = this.translator.getSegments();
    const nextMergedText = this.getMergedGroupText(segs, nextGroup);
    if (!nextMergedText) return;

    // Prefetch further ahead
    for (let ahead = 1; ahead <= TTS_PREFETCH_AHEAD; ahead++) {
      const futureGroup = this.ttsGroups[nextGIdx + ahead];
      if (futureGroup) {
        const mergedText = this.getMergedGroupText(segs, futureGroup);
        if (mergedText) {
          this.tts.prefetch(mergedText, futureGroup.totalDurationMs);
        }
      }
    }

    const nextStartSeg = this.overlay.getSegment(nextGroup.startIdx);
    if (!nextStartSeg) return;

    const currentTimeMs = this.videoElement.currentTime * 1000;
    const delayMs = nextStartSeg.startMs - currentTimeMs;

    if (delayMs <= 100) {
      // Already in or past the next group — play immediately
      this.lastSpokenGroupIdx = nextGIdx;
      this.tts.speak(nextMergedText, nextGroup.totalDurationMs)
        .then(() => this.onTTSGroupFinished(changeId, nextGIdx))
        .catch(() => this.onTTSGroupFinished(changeId, nextGIdx));
    } else if (delayMs <= 5000) {
      // Schedule playback precisely at next group's start time
      this.clearTTSSchedule();
      this.ttsScheduleTimer = setTimeout(() => {
        this.ttsScheduleTimer = null;
        this.tryPlayCurrentSegment(changeId);
      }, delayMs);
    }
    // If delayMs > 5000, let timeupdate handle it naturally
  }

  private clearTTSSchedule(): void {
    if (this.ttsScheduleTimer) {
      clearTimeout(this.ttsScheduleTimer);
      this.ttsScheduleTimer = null;
    }
  }

  /**
   * Handle TTS after a seek: pause video, prefetch the target group's audio,
   * then play from the correct offset and resume video.
   */
  private async handleSeekTTS(changeId: number): Promise<void> {
    const mySeekId = ++this.seekId;
    const video = this.videoElement;
    if (!video) {
      this.seekPending = false;
      return;
    }

    video.pause();

    const currentTimeMs = video.currentTime * 1000;
    const segIndex = this.overlay.getCurrentSegmentIndex(currentTimeMs);

    // Not in any subtitle segment — resume video, no TTS
    if (segIndex < 0) {
      this.lastSpokenGroupIdx = -1;
      this.seekPending = false;
      video.play().catch(() => {});
      return;
    }

    const groupIdx = this.segToGroupIdx[segIndex] ?? -1;
    if (groupIdx < 0) {
      this.lastSpokenGroupIdx = -1;
      this.seekPending = false;
      video.play().catch(() => {});
      return;
    }

    const group = this.ttsGroups[groupIdx];
    const segs = this.translator.getSegments();
    const mergedText = this.getMergedGroupText(segs, group);

    if (!mergedText) {
      this.lastSpokenGroupIdx = -1;
      this.seekPending = false;
      video.play().catch(() => {});
      return;
    }

    // Prefetch current group + next N groups
    const prefetchPromises: Promise<void>[] = [];
    prefetchPromises.push(this.tts.prefetchAsync(mergedText, group.totalDurationMs));
    for (let ahead = 1; ahead <= TTS_PREFETCH_AHEAD; ahead++) {
      const futureGroup = this.ttsGroups[groupIdx + ahead];
      if (futureGroup) {
        const futureText = this.getMergedGroupText(segs, futureGroup);
        if (futureText) {
          prefetchPromises.push(this.tts.prefetchAsync(futureText, futureGroup.totalDurationMs));
        }
      }
    }

    await Promise.all(prefetchPromises);

    // Guard against rapid consecutive seeks
    if (mySeekId !== this.seekId || changeId !== this.activeVideoChangeId) {
      return; // A newer seek superseded this one
    }

    // Calculate offset within the group
    const groupStartSeg = this.overlay.getSegment(group.startIdx);
    const groupStartMs = groupStartSeg ? groupStartSeg.startMs : 0;
    const offsetMs = Math.max(0, currentTimeMs - groupStartMs);

    this.lastSpokenGroupIdx = groupIdx;
    this.seekPending = false;

    // Start TTS from offset (don't await — let it chain via onTTSGroupFinished)
    this.tts.speak(mergedText, group.totalDurationMs, offsetMs)
      .then(() => this.onTTSGroupFinished(changeId, groupIdx))
      .catch(() => this.onTTSGroupFinished(changeId, groupIdx));

    // Resume video
    video.play().catch(() => {});
  }

  private removeVideoListeners(): void {
    this.clearTTSSchedule();
    if (this.videoElement) {
      if (this.timeUpdateHandler) {
        this.videoElement.removeEventListener('timeupdate', this.timeUpdateHandler);
      }
      if (this.seekedHandler) {
        this.videoElement.removeEventListener('seeked', this.seekedHandler);
      }
      if (this.pauseHandler) {
        this.videoElement.removeEventListener('pause', this.pauseHandler);
      }
      if (this.playHandler) {
        this.videoElement.removeEventListener('play', this.playHandler);
      }
    }
    this.videoElement = null;
    this.timeUpdateHandler = null;
    this.seekedHandler = null;
    this.pauseHandler = null;
    this.playHandler = null;
  }

  /**
   * Build TTS groups by merging adjacent segments that belong to the same sentence.
   * Segments are merged when the current text does NOT end with sentence-ending
   * punctuation and the gap to the next segment is < 500ms.
   */
  private buildTTSGroups(segments: SubtitleSegment[]): void {
    this.ttsGroups = [];
    this.segToGroupIdx = [];
    if (segments.length === 0) return;

    let groupStart = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = seg.text.trim();
      const endsSentence = SENTENCE_END_RE.test(text);
      const isLast = i === segments.length - 1;

      let shouldSplit = endsSentence || isLast;
      if (!shouldSplit && i + 1 < segments.length) {
        const nextSeg = segments[i + 1];
        const segEndMs = seg.startMs + seg.durationMs;
        const gap = nextSeg.startMs - segEndMs;
        if (gap >= GROUP_GAP_THRESHOLD_MS) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        const first = segments[groupStart];
        const last = segments[i];
        this.ttsGroups.push({
          startIdx: groupStart,
          endIdx: i,
          totalDurationMs: (last.startMs + last.durationMs) - first.startMs,
        });
        const groupIdx = this.ttsGroups.length - 1;
        for (let j = groupStart; j <= i; j++) {
          this.segToGroupIdx[j] = groupIdx;
        }
        groupStart = i + 1;
      }
    }

    console.log(LOG, 'TTS groups built:', this.ttsGroups.length, 'groups from', segments.length, 'segments');
  }

  /** Get merged translated text for a TTS group. */
  private getMergedGroupText(segs: SubtitleSegment[], group: TTSGroup): string {
    const parts: string[] = [];
    for (let i = group.startIdx; i <= group.endIdx; i++) {
      const t = segs[i]?.translatedText;
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  private parseJson3(text: string): SubtitleSegment[] {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.events)) return [];

      const segments: SubtitleSegment[] = [];
      for (const event of data.events) {
        if (!event.segs) continue;
        const segText = event.segs.map((s: any) => s.utf8 || '').join('').trim();
        if (!segText || segText === '\n') continue;
        segments.push({
          startMs: event.tStartMs || 0,
          durationMs: event.dDurationMs || 0,
          text: segText.replace(/\n/g, ' '),
        });
      }
      return segments;
    } catch {
      return [];
    }
  }

  private waitForPlayer(timeout = 8000): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (document.querySelector('.html5-video-player video')) {
          resolve(true);
        } else if (Date.now() - start > timeout) {
          resolve(false);
        } else {
          setTimeout(check, 400);
        }
      };
      setTimeout(check, 500);
    });
  }
}

export { YouTubeSubtitleExtractor } from './YouTubeSubtitleExtractor';
export { YouTubeSubtitleTranslator } from './YouTubeSubtitleTranslator';
export { YouTubeSubtitleOverlay } from './YouTubeSubtitleOverlay';
