// YouTube Subtitle Manager
// Coordinates extractor, translator, and overlay lifecycle

import { MenuConfig, YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG, DEFAULT_TTS_CONFIG } from '../../types';
import { t } from '../../i18n';
import { YouTubeSubtitleExtractor, SubtitleSegment } from './YouTubeSubtitleExtractor';
import { YouTubeSubtitleTranslator } from './YouTubeSubtitleTranslator';
import { YouTubeSubtitleOverlay } from './YouTubeSubtitleOverlay';
import { YouTubeTTS } from './YouTubeTTS';

const LOG = '[Eniwer YT字幕]';
const TTS_PREFETCH_AHEAD = 3; // prefetch N segments ahead of current
const TTS_INITIAL_PREFETCH = 5; // prefetch first N segments before resuming video
const FIRST_CHUNK_READY_COUNT = 20; // match translator's FIRST_CHUNK_SIZE

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
  private lastSpokenSegIndex = -1;
  /** Segments fetched but waiting for user to activate */
  private pendingSegments: SubtitleSegment[] | null = null;
  /** Timer for proactive TTS scheduling */
  private ttsScheduleTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.lastSpokenSegIndex = -1;
    this.pendingSegments = null;
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
    this.lastSpokenSegIndex = -1;
    this.pendingSegments = null;
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
        this.lastSpokenSegIndex = -1;
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
    console.log(LOG, '步骤1: 注入主世界获取播放器数据...');
    const playerData = await this.extractor.extractViaPlayerAPI();
    if (changeId !== this.activeVideoChangeId) return;

    if (!playerData || playerData.captionTracks.length === 0) {
      console.warn(LOG, '未找到字幕轨道');
      return;
    }

    this.extractor.setCaptionTracks(playerData.captionTracks);
    console.log(LOG, '找到', playerData.captionTracks.length, '个字幕轨道');

    const track = this.extractor.selectTrack(this.subtitleConfig.sourceLanguage);
    if (!track) return;

    const potToken = this.extractor.extractPotToken(track, playerData.audioCaptionTracks);
    const subtitleUrl = this.extractor.buildSubtitleUrl(
      track, potToken, playerData.clientVersion, playerData.device
    );

    let segments: SubtitleSegment[] = [];
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_URL',
        payload: { url: subtitleUrl },
      });
      if (response.success && response.data && response.data.length > 10) {
        segments = this.parseJson3(response.data);
        console.log(LOG, '预取字幕:', segments.length, '条');
      }
    } catch (e) {
      console.warn(LOG, '字幕请求异常:', e);
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
        }
      } catch { /* ignore */ }
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

    // Pre-fetch TTS for first N translated segments
    const ttsConf = this.tts.getConfig();
    if (ttsConf.enabled) {
      this.ttsEnabled = true;
      const segs = this.translator.getSegments();
      const prefetchPromises: Promise<void>[] = [];
      for (let i = 0; i < Math.min(TTS_INITIAL_PREFETCH, segs.length); i++) {
        if (segs[i]?.translatedText) {
          prefetchPromises.push(this.tts.prefetchAsync(segs[i].translatedText, segs[i].durationMs));
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
      this.lastSpokenSegIndex = -1;
      this.clearTTSSchedule();
    };

    video.addEventListener('timeupdate', this.timeUpdateHandler);
    video.addEventListener('seeked', this.seekedHandler);
  }

  /** Try to play TTS for the current subtitle segment (called from timeupdate + proactive scheduler). */
  private tryPlayCurrentSegment(changeId: number): void {
    if (changeId !== this.activeVideoChangeId) return;
    if (!this.ttsEnabled || !this.videoElement) return;
    if (this.tts.isPlaying()) return;

    const currentTimeMs = this.videoElement.currentTime * 1000;
    const segIndex = this.overlay.getCurrentSegmentIndex(currentTimeMs);
    if (segIndex < 0) return;

    // Prefetch upcoming segments' audio
    for (let ahead = 1; ahead <= TTS_PREFETCH_AHEAD; ahead++) {
      const futureSeg = this.overlay.getSegment(segIndex + ahead);
      if (futureSeg?.translatedText) {
        this.tts.prefetch(futureSeg.translatedText, futureSeg.durationMs);
      }
    }

    if (segIndex === this.lastSpokenSegIndex) return;

    const seg = this.overlay.getSegment(segIndex);
    if (!seg?.translatedText) return;

    this.lastSpokenSegIndex = segIndex;
    this.tts.speak(seg.translatedText, seg.durationMs)
      .then(() => this.onTTSSegmentFinished(changeId, segIndex))
      .catch(() => this.onTTSSegmentFinished(changeId, segIndex));
  }

  /**
   * Proactive TTS scheduling: after a segment finishes, calculate when the
   * next segment starts and schedule playback precisely with setTimeout.
   * This avoids the ~250ms latency of relying solely on timeupdate events.
   */
  private onTTSSegmentFinished(changeId: number, finishedSegIndex: number): void {
    if (changeId !== this.activeVideoChangeId) return;
    if (!this.ttsEnabled || !this.videoElement) return;

    const nextIdx = finishedSegIndex + 1;
    const nextSeg = this.overlay.getSegment(nextIdx);
    if (!nextSeg?.translatedText) return;

    // Prefetch further ahead
    for (let ahead = 1; ahead <= TTS_PREFETCH_AHEAD; ahead++) {
      const futureSeg = this.overlay.getSegment(nextIdx + ahead);
      if (futureSeg?.translatedText) {
        this.tts.prefetch(futureSeg.translatedText, futureSeg.durationMs);
      }
    }

    const currentTimeMs = this.videoElement.currentTime * 1000;
    const delayMs = nextSeg.startMs - currentTimeMs;

    if (delayMs <= 100) {
      // Already in or past the next segment — play immediately
      this.lastSpokenSegIndex = nextIdx;
      this.tts.speak(nextSeg.translatedText, nextSeg.durationMs)
        .then(() => this.onTTSSegmentFinished(changeId, nextIdx))
        .catch(() => this.onTTSSegmentFinished(changeId, nextIdx));
    } else if (delayMs <= 5000) {
      // Schedule playback precisely at next segment's start time
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

  private removeVideoListeners(): void {
    this.clearTTSSchedule();
    if (this.videoElement) {
      if (this.timeUpdateHandler) {
        this.videoElement.removeEventListener('timeupdate', this.timeUpdateHandler);
      }
      if (this.seekedHandler) {
        this.videoElement.removeEventListener('seeked', this.seekedHandler);
      }
    }
    this.videoElement = null;
    this.timeUpdateHandler = null;
    this.seekedHandler = null;
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
