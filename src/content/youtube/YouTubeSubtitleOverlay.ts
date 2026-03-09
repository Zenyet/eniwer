// YouTube Subtitle Overlay
// Displays bilingual subtitles overlaid on the YouTube video player

import { YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG } from '../../types';
import { TranslatedSegment } from './YouTubeSubtitleTranslator';
import { t } from '../../i18n';

const PREFIX = 'eniwer-yt-subtitle';

export class YouTubeSubtitleOverlay {
  private overlay: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private ttsBtn: HTMLElement | null = null;
  private segments: TranslatedSegment[] = [];
  private config: YouTubeSubtitleConfig;
  private timeUpdateHandler: (() => void) | null = null;
  private video: HTMLVideoElement | null = null;
  private visible = true;
  private statusText = '';
  private ttsActive = false;
  private onTTSToggle: ((enabled: boolean) => void) | null = null;

  constructor(config?: YouTubeSubtitleConfig) {
    this.config = config || DEFAULT_YOUTUBE_SUBTITLE_CONFIG;
  }

  updateConfig(config: YouTubeSubtitleConfig): void {
    this.config = config;
    this.applyStyles();
  }

  setSegments(segments: TranslatedSegment[]): void {
    this.segments = segments;
  }

  setStatus(text: string): void {
    this.statusText = text;
    this.updateDisplay(-1); // force show status
  }

  setTTSCallback(cb: (enabled: boolean) => void): void {
    this.onTTSToggle = cb;
  }

  updateTTSState(active: boolean): void {
    this.ttsActive = active;
    if (this.ttsBtn) {
      this.ttsBtn.style.opacity = active ? '1' : '0.5';
    }
  }

  getCurrentSegmentIndex(timeMs: number): number {
    return this.findSegmentIndex(timeMs);
  }

  getSegment(index: number): TranslatedSegment | null {
    return this.segments[index] || null;
  }

  mount(): boolean {
    const player = document.querySelector('.html5-video-player') as HTMLElement;
    if (!player) return false;

    this.video = player.querySelector('video');
    if (!this.video) return false;

    // Create overlay container
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = `${PREFIX}-overlay`;
      this.applyOverlayStyles();
      player.appendChild(this.overlay);
    }

    // Create toggle button in player controls
    if (!this.toggleBtn) {
      this.createToggleButton(player);
    }

    // Create TTS button in player controls
    if (!this.ttsBtn) {
      this.createTTSButton(player);
    }

    // Listen for timeupdate
    this.timeUpdateHandler = () => this.onTimeUpdate();
    this.video.addEventListener('timeupdate', this.timeUpdateHandler);

    return true;
  }

  unmount(): void {
    if (this.video && this.timeUpdateHandler) {
      this.video.removeEventListener('timeupdate', this.timeUpdateHandler);
      this.timeUpdateHandler = null;
    }
    this.video = null;

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    if (this.toggleBtn) {
      this.toggleBtn.remove();
      this.toggleBtn = null;
    }

    if (this.ttsBtn) {
      this.ttsBtn.remove();
      this.ttsBtn = null;
    }

    this.segments = [];
    this.statusText = '';
    this.ttsActive = false;
  }

  private createToggleButton(player: HTMLElement): void {
    const rightControls = player.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = `ytp-button ${PREFIX}-toggle`;
    this.toggleBtn.title = t('youtube.toggleSubtitle');
    this.toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
    </svg>`;

    Object.assign(this.toggleBtn.style, {
      opacity: this.visible ? '1' : '0.5',
      cursor: 'pointer',
      width: '48px',
      height: '48px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      background: 'none',
      padding: '0',
    });

    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.visible = !this.visible;
      if (this.overlay) {
        this.overlay.style.display = this.visible ? 'flex' : 'none';
      }
      if (this.toggleBtn) {
        this.toggleBtn.style.opacity = this.visible ? '1' : '0.5';
      }
    });

    // Insert before the first child of right controls
    rightControls.insertBefore(this.toggleBtn, rightControls.firstChild);
  }

  private createTTSButton(player: HTMLElement): void {
    const rightControls = player.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    this.ttsBtn = document.createElement('button');
    this.ttsBtn.className = `ytp-button ${PREFIX}-tts`;
    this.ttsBtn.title = t('youtube.ttsToggle');
    this.ttsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;

    Object.assign(this.ttsBtn.style, {
      opacity: this.ttsActive ? '1' : '0.5',
      cursor: 'pointer',
      width: '48px',
      height: '48px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      background: 'none',
      padding: '0',
    });

    this.ttsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ttsActive = !this.ttsActive;
      if (this.ttsBtn) {
        this.ttsBtn.style.opacity = this.ttsActive ? '1' : '0.5';
      }
      this.onTTSToggle?.(this.ttsActive);
    });

    // Insert after the toggle button (second position)
    if (this.toggleBtn && this.toggleBtn.nextSibling) {
      rightControls.insertBefore(this.ttsBtn, this.toggleBtn.nextSibling);
    } else {
      rightControls.insertBefore(this.ttsBtn, rightControls.firstChild);
    }
  }

  private applyOverlayStyles(): void {
    if (!this.overlay) return;

    const fontSize = this.getFontSize();

    Object.assign(this.overlay.style, {
      position: 'absolute',
      bottom: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '60',
      display: this.visible ? 'flex' : 'none',
      flexDirection: 'column',
      alignItems: 'center',
      maxWidth: '80%',
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease',
      fontSize: `${fontSize}px`,
    });
  }

  private applyStyles(): void {
    this.applyOverlayStyles();
    // Force re-render current subtitle
    if (this.video) {
      this.onTimeUpdate();
    }
  }

  private getFontSize(): number {
    switch (this.config.fontSize) {
      case 'small': return 14;
      case 'large': return 22;
      default: return 18;
    }
  }

  private onTimeUpdate(): void {
    if (!this.video || !this.overlay) return;
    const currentTimeMs = this.video.currentTime * 1000;
    const segIndex = this.findSegmentIndex(currentTimeMs);
    this.updateDisplay(segIndex);
  }

  private findSegmentIndex(timeMs: number): number {
    if (this.segments.length === 0) return -1;

    // Binary search
    let lo = 0;
    let hi = this.segments.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const seg = this.segments[mid];
      if (timeMs >= seg.startMs && timeMs < seg.startMs + seg.durationMs) {
        return mid;
      }
      if (timeMs < seg.startMs) {
        hi = mid - 1;
      } else {
        result = mid;
        lo = mid + 1;
      }
    }

    // Check if result segment is still active
    if (result >= 0) {
      const seg = this.segments[result];
      if (timeMs < seg.startMs + seg.durationMs) {
        return result;
      }
    }

    return -1;
  }

  private updateDisplay(segIndex: number): void {
    if (!this.overlay) return;

    // Show status text if set and no active segment
    if (segIndex < 0 && this.statusText) {
      this.overlay.innerHTML = this.createSubtitleHTML(this.statusText, '');
      return;
    }

    if (segIndex < 0) {
      this.overlay.innerHTML = '';
      return;
    }

    const seg = this.segments[segIndex];
    const hasTranslation = !!seg.translatedText;

    // Never show raw original text as if it were a translation
    if (!hasTranslation) {
      this.overlay.innerHTML = '';
      return;
    }

    const isBilingual = this.config.displayMode === 'bilingual';
    if (isBilingual) {
      this.overlay.innerHTML = this.createSubtitleHTML(seg.text, seg.translatedText);
    } else {
      this.overlay.innerHTML = this.createSubtitleHTML(seg.translatedText, '');
    }
  }

  private createSubtitleHTML(primary: string, secondary: string, opacity = 1): string {
    const fontSize = this.getFontSize();
    const bgStyle = 'background: rgba(0, 0, 0, 0.75); border-radius: 4px; padding: 4px 12px; margin: 2px 0; text-align: center; line-height: 1.4;';

    if (secondary) {
      // Bilingual: original on top (smaller/dimmer), translation below (larger/brighter)
      return `
        <div style="${bgStyle} color: rgba(255, 255, 255, 0.7); font-size: ${fontSize * 0.85}px;">
          ${this.escapeHTML(primary)}
        </div>
        <div style="${bgStyle} color: rgba(255, 255, 255, 1); font-size: ${fontSize}px; font-weight: 500;">
          ${this.escapeHTML(secondary)}
        </div>
      `;
    }

    return `
      <div style="${bgStyle} color: rgba(255, 255, 255, ${opacity}); font-size: ${fontSize}px;">
        ${this.escapeHTML(primary)}
      </div>
    `;
  }

  private escapeHTML(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
