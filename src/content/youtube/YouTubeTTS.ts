import { TTSConfig, MenuConfig, DEFAULT_TTS_CONFIG } from '../../types';

export class YouTubeTTS {
  private config: TTSConfig;
  private menuConfig: MenuConfig;
  private playing = false;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private audioCache = new Map<string, string>();
  private videoMutedByUs = false;

  constructor(config: TTSConfig, menuConfig: MenuConfig) {
    this.config = config;
    this.menuConfig = menuConfig;
  }

  updateConfig(config: TTSConfig, menuConfig: MenuConfig): void {
    this.config = config;
    this.menuConfig = menuConfig;
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return;

    this.playing = true;
    this.applyMute(true);
    try {
      if (this.config.engine === 'cloud') {
        await this.speakCloud(text);
      } else if (this.config.engine === 'edge') {
        await this.speakEdge(text);
      } else {
        await this.speakNative(text);
      }
    } finally {
      this.playing = false;
      this.applyMute(false);
    }
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.currentUtterance) {
      speechSynthesis.cancel();
      this.currentUtterance = null;
    }
    this.playing = false;
    this.applyMute(false);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getConfig(): TTSConfig {
    return this.config;
  }

  private applyMute(speaking: boolean): void {
    if (!this.config.muteOriginal) {
      // If mute was previously set by us, restore
      if (this.videoMutedByUs) {
        const video = document.querySelector('.html5-video-player video') as HTMLVideoElement | null;
        if (video) video.muted = false;
        this.videoMutedByUs = false;
      }
      return;
    }

    const video = document.querySelector('.html5-video-player video') as HTMLVideoElement | null;
    if (!video) return;

    if (speaking) {
      if (!video.muted) {
        video.muted = true;
        this.videoMutedByUs = true;
      }
    } else {
      if (this.videoMutedByUs) {
        video.muted = false;
        this.videoMutedByUs = false;
      }
    }
  }

  private speakNative(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      const targetLang = this.menuConfig.youtubeSubtitle?.targetLanguage || 'zh-CN';
      utterance.lang = targetLang;
      utterance.rate = this.config.rate || 1.0;

      if (this.config.voice) {
        const voices = speechSynthesis.getVoices();
        const match = voices.find(v =>
          v.name.toLowerCase().includes(this.config.voice.toLowerCase())
        );
        if (match) utterance.voice = match;
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        this.playing = false;
        resolve();
      };

      utterance.onerror = (e) => {
        this.currentUtterance = null;
        this.playing = false;
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${e.error}`));
        }
      };

      speechSynthesis.speak(utterance);
    });
  }

  private async speakCloud(text: string): Promise<void> {
    const dataUrl = await this.fetchOrCacheAudio(text, async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'TTS_SPEAK',
        payload: {
          text,
          config: this.menuConfig,
        },
      });

      if (!response.success || !response.audioBase64) {
        throw new Error(response.error || 'TTS failed');
      }

      return `data:audio/mp3;base64,${response.audioBase64}`;
    });

    await this.playAudioUrl(dataUrl);
  }

  private async speakEdge(text: string): Promise<void> {
    const dataUrl = await this.fetchOrCacheAudio(text, async () => {
      const voice = this.config.voice || 'zh-CN-XiaoxiaoNeural';
      const response = await chrome.runtime.sendMessage({
        type: 'TTS_EDGE',
        payload: {
          text,
          voice,
          rate: this.config.rate || 1.0,
        },
      });

      if (!response.success || !response.audioBase64) {
        throw new Error(response.error || 'Edge TTS failed');
      }

      return `data:audio/mp3;base64,${response.audioBase64}`;
    });

    await this.playAudioUrl(dataUrl);
  }

  private async fetchOrCacheAudio(text: string, fetchFn: () => Promise<string>): Promise<string> {
    const cacheKey = `${this.config.engine}:${text}`;
    const cached = this.audioCache.get(cacheKey);
    if (cached) return cached;

    const dataUrl = await fetchFn();
    this.audioCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  private playAudioUrl(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(dataUrl);
      this.currentAudio = audio;
      audio.playbackRate = this.config.rate || 1.0;

      audio.onended = () => {
        this.currentAudio = null;
        this.playing = false;
        resolve();
      };

      audio.onerror = () => {
        this.currentAudio = null;
        this.playing = false;
        reject(new Error('Audio playback error'));
      };

      audio.play().catch((e) => {
        this.currentAudio = null;
        this.playing = false;
        reject(e);
      });
    });
  }
}
