// YouTube Subtitle Overlay
// Displays bilingual subtitles overlaid on the YouTube video player

import { YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG } from '../../types';
import { TranslatedSegment } from './YouTubeSubtitleTranslator';
import { t } from '../../i18n';
import { icons } from '../../icons';

const PREFIX = 'eniwer-yt-subtitle';

export class YouTubeSubtitleOverlay {
  private overlay: HTMLElement | null = null;
  private logoBtn: HTMLElement | null = null;
  private segments: TranslatedSegment[] = [];
  private config: YouTubeSubtitleConfig;
  private timeUpdateHandler: (() => void) | null = null;
  private video: HTMLVideoElement | null = null;
  private active = false;
  private statusText = '';
  private onActivate: ((active: boolean) => void) | null = null;

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
    this.updateDisplay(-1);
  }

  /** Register callback for when user clicks the logo to activate/deactivate. */
  setActivateCallback(cb: (active: boolean) => void): void {
    this.onActivate = cb;
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (this.logoBtn) {
      this.logoBtn.style.opacity = active ? '1' : '0.5';
    }
    if (this.overlay) {
      this.overlay.style.display = active ? 'flex' : 'none';
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

    // Create overlay container (hidden until activated)
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = `${PREFIX}-overlay`;
      this.applyOverlayStyles();
      this.overlay.style.display = 'none'; // hidden by default
      player.appendChild(this.overlay);
    }

    // Create single logo button in player controls
    if (!this.logoBtn) {
      this.createLogoButton(player);
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

    if (this.logoBtn) {
      this.logoBtn.remove();
      this.logoBtn = null;
    }

    this.segments = [];
    this.statusText = '';
    this.active = false;
  }

  private createLogoButton(player: HTMLElement): void {
    const rightControls = player.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    this.logoBtn = document.createElement('button');
    this.logoBtn.className = `ytp-button ${PREFIX}-activate`;
    this.logoBtn.title = t('youtube.toggleSubtitle');
    this.logoBtn.innerHTML = icons.logo;

    Object.assign(this.logoBtn.style, {
      opacity: this.active ? '1' : '0.5',
      cursor: 'pointer',
      width: '36px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      background: 'none',
      padding: '6px',
    });

    this.logoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.active = !this.active;
      this.setActive(this.active);
      this.onActivate?.(this.active);
    });

    rightControls.insertBefore(this.logoBtn, rightControls.firstChild);
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
      display: this.active ? 'flex' : 'none',
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
    if (!this.video || !this.overlay || !this.active) return;
    const currentTimeMs = this.video.currentTime * 1000;
    const segIndex = this.findSegmentIndex(currentTimeMs);
    this.updateDisplay(segIndex);
  }

  private findSegmentIndex(timeMs: number): number {
    if (this.segments.length === 0) return -1;

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
