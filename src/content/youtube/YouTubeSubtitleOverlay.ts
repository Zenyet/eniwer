// YouTube Subtitle Overlay
// Displays bilingual subtitles overlaid on the YouTube video player

import { YouTubeSubtitleConfig, DEFAULT_YOUTUBE_SUBTITLE_CONFIG } from '../../types';
import { TranslatedSegment } from './YouTubeSubtitleTranslator';
import { t } from '../../i18n';

const PREFIX = 'eniwer-yt-subtitle';

export class YouTubeSubtitleOverlay {
  private overlay: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private segments: TranslatedSegment[] = [];
  private config: YouTubeSubtitleConfig;
  private timeUpdateHandler: (() => void) | null = null;
  private video: HTMLVideoElement | null = null;
  private visible = true;
  private statusText = '';

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

    this.segments = [];
    this.statusText = '';
  }

  private createToggleButton(player: HTMLElement): void {
    const rightControls = player.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = `ytp-button ${PREFIX}-toggle`;
    this.toggleBtn.title = t('youtube.toggleSubtitle');
    this.toggleBtn.innerHTML = `<svg height="100%" viewBox="0 0 24 24" width="100%" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/>
    </svg>`;

    Object.assign(this.toggleBtn.style, {
      opacity: this.visible ? '1' : '0.5',
      cursor: 'pointer',
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
    const isBilingual = this.config.displayMode === 'bilingual';

    if (isBilingual) {
      this.overlay.innerHTML = this.createSubtitleHTML(seg.text, seg.translatedText);
    } else {
      this.overlay.innerHTML = this.createSubtitleHTML(seg.translatedText || seg.text, '');
    }
  }

  private createSubtitleHTML(primary: string, secondary: string): string {
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
      <div style="${bgStyle} color: rgba(255, 255, 255, 1); font-size: ${fontSize}px;">
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
