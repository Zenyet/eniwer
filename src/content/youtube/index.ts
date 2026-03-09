// YouTube Subtitle Manager
// Coordinates extractor, translator, and overlay lifecycle

import { MenuConfig, YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG, DEFAULT_TTS_CONFIG } from '../../types';
import { t } from '../../i18n';
import { YouTubeSubtitleExtractor, SubtitleSegment } from './YouTubeSubtitleExtractor';
import { YouTubeSubtitleTranslator } from './YouTubeSubtitleTranslator';
import { YouTubeSubtitleOverlay } from './YouTubeSubtitleOverlay';
import { YouTubeTTS } from './YouTubeTTS';

const LOG = '[Eniwer YT字幕]';

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
      // Late-check: re-enable if config says enabled (handles SPA navigation to /watch)
      if (this.subtitleConfig.enabled) {
        this.handleVideoChange(videoId);
      }
    });

    // Only start processing immediately if already on a /watch page
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
    this.removeVideoListeners();
    this.overlay.unmount();
    this.currentVideoId = null;
    // Note: do NOT destroy extractor or reset initialized — keep yt-navigate-finish listener alive
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

    // Ensure init is called (registers yt-navigate-finish listener)
    if (!this.initialized) {
      this.init();
      return;
    }

    if (!YouTubeSubtitleExtractor.isYouTubePage()) return;

    if (!oldEnabled && this.subtitleConfig.enabled) {
      // Already initialized (listener registered), just start processing
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

  private async handleVideoChange(videoId: string): Promise<void> {
    const changeId = ++this.activeVideoChangeId;
    this.currentVideoId = videoId;
    this.translator.abort();
    this.translator.clearCache();
    this.overlay.unmount();
    this.overlay.setSegments([]);

    console.log(LOG, '=== 开始处理视频 ===', videoId);

    // Wait for player
    const playerReady = await this.waitForPlayer(8000);
    if (changeId !== this.activeVideoChangeId) return;
    if (!playerReady) { console.warn(LOG, '播放器超时'); return; }

    if (!this.overlay.mount()) {
      await new Promise(r => setTimeout(r, 1500));
      if (changeId !== this.activeVideoChangeId) return;
      if (!this.overlay.mount()) return;
    }
    this.overlay.setStatus(t('youtube.translating'));

    // Step 1: Extract player data via main world injection
    console.log(LOG, '步骤1: 注入主世界获取播放器数据...');
    const playerData = await this.extractor.extractViaPlayerAPI();
    if (changeId !== this.activeVideoChangeId) return;

    if (!playerData || playerData.captionTracks.length === 0) {
      console.warn(LOG, '未找到字幕轨道, playerData =', playerData);
      this.overlay.setStatus(t('youtube.noSubtitlesAvailable'));
      return;
    }

    this.extractor.setCaptionTracks(playerData.captionTracks);
    console.log(LOG, '找到', playerData.captionTracks.length, '个字幕轨道:',
      playerData.captionTracks.map(t => `${t.languageCode}(${t.isAutoGenerated ? 'ASR' : '手动'})`));
    console.log(LOG, '音频字幕轨道:', playerData.audioCaptionTracks.length, '个');
    console.log(LOG, 'clientVersion:', playerData.clientVersion);

    // Step 2: Select track
    const track = this.extractor.selectTrack(this.subtitleConfig.sourceLanguage);
    if (!track) {
      this.overlay.setStatus(t('youtube.noSubtitlesAvailable'));
      return;
    }
    console.log(LOG, '步骤2: 选中轨道:', track.languageCode, track.vssId);

    // Step 3: Extract PO Token
    const potToken = this.extractor.extractPotToken(track, playerData.audioCaptionTracks);
    console.log(LOG, '步骤3: PO Token:', potToken.pot ? `有 (${potToken.pot.substring(0, 20)}...)` : '无');

    // Step 4: Build URL and fetch via background
    const subtitleUrl = this.extractor.buildSubtitleUrl(
      track, potToken, playerData.clientVersion, playerData.device
    );
    console.log(LOG, '步骤4: 获取字幕, URL长度 =', subtitleUrl.length);

    let segments: SubtitleSegment[] = [];
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_URL',
        payload: { url: subtitleUrl },
      });

      if (response.success && response.data && response.data.length > 10) {
        console.log(LOG, '响应长度:', response.data.length, ', 前80字符:', response.data.substring(0, 80));
        segments = this.parseJson3(response.data);
        console.log(LOG, 'JSON3解析:', segments.length, '条字幕');
      } else {
        console.warn(LOG, '字幕响应为空或失败:', response.error || `长度=${response.data?.length}`);
      }
    } catch (e) {
      console.warn(LOG, '字幕请求异常:', e);
    }

    if (changeId !== this.activeVideoChangeId) return;

    // Fallback: try without PO Token (might work for some videos)
    if (segments.length === 0 && potToken.pot) {
      console.log(LOG, '回退: 尝试不带PO Token...');
      const fallbackUrl = track.baseUrl + '&fmt=json3';
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'FETCH_URL',
          payload: { url: fallbackUrl },
        });
        if (resp.success && resp.data && resp.data.length > 10) {
          segments = this.parseJson3(resp.data);
          console.log(LOG, '回退结果:', segments.length, '条字幕');
        }
      } catch { /* ignore */ }
    }

    if (changeId !== this.activeVideoChangeId) return;

    if (segments.length === 0) {
      console.warn(LOG, '>>> 字幕获取失败 <<<');
      this.overlay.setStatus(t('youtube.subtitleError'));
      return;
    }

    // Step 5: Translate all subtitles in one shot
    console.log(LOG, '步骤5: 翻译', segments.length, '条字幕 (一次性模式)');

    // Set overlay segments immediately (with empty translations) so overlay can show originals
    this.overlay.setStatus(t('youtube.translating'));

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
      },
    );

    // Show segments right away so overlay can display originals while translating
    this.overlay.setSegments(this.translator.getSegments());

    // Set up TTS button callback
    this.overlay.setTTSCallback((enabled) => {
      this.ttsEnabled = enabled;
      if (!enabled) {
        this.tts.stop();
      }
      this.overlay.updateTTSState(enabled);
    });

    // Auto-enable TTS if autoPlay is configured
    const ttsConf = this.tts.getConfig();
    if (ttsConf.autoPlay && ttsConf.enabled) {
      this.ttsEnabled = true;
      this.overlay.updateTTSState(true);
    }

    // Attach video event listeners for time tracking
    this.attachVideoListeners(changeId);

    console.log(LOG, '=== 翻译已启动 ===');
  }

  private attachVideoListeners(changeId: number): void {
    this.removeVideoListeners();
    const video = document.querySelector('.html5-video-player video') as HTMLVideoElement | null;
    if (!video) return;

    this.videoElement = video;

    this.timeUpdateHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      const currentTimeMs = video.currentTime * 1000;

      // TTS scheduling: only trigger when not already playing
      if (this.ttsEnabled && !this.tts.isPlaying()) {
        const segIndex = this.overlay.getCurrentSegmentIndex(currentTimeMs);
        if (segIndex >= 0 && segIndex !== this.lastSpokenSegIndex) {
          const seg = this.overlay.getSegment(segIndex);
          if (seg?.translatedText) {
            this.lastSpokenSegIndex = segIndex;
            this.tts.speak(seg.translatedText, seg.durationMs).catch(() => {});
          }
        }
      }
    };

    this.seekedHandler = () => {
      if (changeId !== this.activeVideoChangeId) return;
      this.tts.stop();
      this.lastSpokenSegIndex = -1;
    };

    video.addEventListener('timeupdate', this.timeUpdateHandler);
    video.addEventListener('seeked', this.seekedHandler);
  }

  private removeVideoListeners(): void {
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
