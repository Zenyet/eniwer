// ChatTOC Plugin — AI conversation timeline/table of contents
// Injects a floating sidebar on AI chat sites (ChatGPT, Claude, Gemini)
// that extracts user messages as navigation anchors.

import { icons } from '../../icons';
import { t } from '../../i18n';
import type { Plugin, SettingsContributor, PluginContext } from '../types';
import type { MenuConfig } from '../../types';

interface SiteConfig {
  host: string;
  messageSelector: string;
  textExtractor: (el: Element) => string;
  scrollContainerSelector?: string;
}

const SITES: SiteConfig[] = [
  {
    host: 'chatgpt.com',
    messageSelector: '.user-message-bubble-color',
    textExtractor: (el) => el.querySelector('div')?.textContent?.trim() || '',
    scrollContainerSelector: 'main',
  },
  {
    host: 'claude.ai',
    messageSelector: '[data-testid="user-message"]',
    textExtractor: (el) => el.querySelector('p')?.textContent?.trim() || '',
  },
  {
    host: 'gemini.google.com',
    messageSelector: 'user-query',
    textExtractor: (el) => el.textContent?.trim() || '',
  },
];

const STYLE_ID = 'eniwer-chat-toc-styles';
const SIDEBAR_ID = 'eniwer-chat-toc';
const MAX_TEXT_LEN = 60;
const DEBOUNCE_MS = 300;

const CSS = `
/* ============================
   Time Machine–style TOC
   Collapsed: right-edge tick marks (like macOS Time Machine)
   Expanded: Liquid Glass panel
   ============================ */
#${SIDEBAR_ID} {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  max-height: 80vh;
  z-index: 2147483646;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
}

/* === Time Machine timeline (collapsed) === */
.eniwer-toc-timeline {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 8px 0;
  width: 36px;
  flex-shrink: 0;
  transition: opacity 0.2s ease;
}
#${SIDEBAR_ID}:hover .eniwer-toc-timeline {
  opacity: 0;
  pointer-events: none;
  width: 0;
  overflow: hidden;
}

/* Tick marks — right-aligned horizontal lines, like Time Machine */
.eniwer-toc-tick {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  padding: 4px 0;
  cursor: pointer;
  transform-origin: right center;
  transition: transform 0.15s ease-out;
}
.eniwer-toc-tick-line {
  height: 2px;
  border-radius: 1px;
  transition: width 0.15s ease-out, height 0.15s ease-out, background 0.15s ease-out, box-shadow 0.15s ease-out;
}
/* Default: dim tick */
.eniwer-toc-tick-line {
  width: 18px;
  background: rgba(120,120,128,0.3);
}
/* CSS hover fallback */
.eniwer-toc-tick:hover .eniwer-toc-tick-line {
  width: 28px;
  background: rgba(120,120,128,0.5);
}
/* Active tick: bright pink like Time Machine red */
.eniwer-toc-tick.active .eniwer-toc-tick-line {
  width: 32px;
  height: 3px;
  background: #e85d75;
  box-shadow: 0 0 10px rgba(232,93,117,0.5);
}
/* Non-active ticks: dimmed red */
.eniwer-toc-tick:not(.active) .eniwer-toc-tick-line {
  background: rgba(232,93,117,0.3);
}
.eniwer-toc-tick:not(.active):hover .eniwer-toc-tick-line {
  background: rgba(232,93,117,0.6);
}

/* === Expanded glass panel === */
.eniwer-toc-panel {
  display: none;
  flex-direction: column;
  width: 268px;
  max-height: 70vh;
  margin-right: 4px;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(255,255,255,0.58) 0%,
    rgba(255,255,255,0.32) 50%,
    rgba(255,255,255,0.48) 100%
  );
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  border: 0.5px solid rgba(255,255,255,0.6);
  box-shadow:
    0 12px 48px rgba(0,0,0,0.1),
    0 4px 16px rgba(0,0,0,0.05),
    inset 0 1px 0 rgba(255,255,255,0.75),
    inset 0 -1px 0 rgba(255,255,255,0.2);
  overflow: hidden;
}
#${SIDEBAR_ID}:hover .eniwer-toc-panel {
  display: flex;
}

/* Header */
.eniwer-toc-header {
  padding: 12px 16px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: rgba(0,0,0,0.3);
  flex-shrink: 0;
}

/* List */
.eniwer-toc-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 2px 0 6px;
  scrollbar-width: none;
}
.eniwer-toc-list::-webkit-scrollbar { display: none; }

/* Item */
.eniwer-toc-item {
  position: relative;
  padding: 7px 14px 7px 12px;
  margin: 1px 6px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(0,0,0,0.6);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
}
.eniwer-toc-item:hover {
  background: rgba(0,0,0,0.04);
}
.eniwer-toc-item.active {
  color: #e85d75;
  background: rgba(232,93,117,0.08);
  font-weight: 500;
}
.eniwer-toc-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #e85d75;
}
.eniwer-toc-index {
  color: rgba(0,0,0,0.25);
  margin-right: 6px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* === Dark mode === */
@media (prefers-color-scheme: dark) {
  .eniwer-toc-tick-line {
    background: rgba(255,255,255,0.18) !important;
  }
  .eniwer-toc-tick:hover .eniwer-toc-tick-line {
    background: rgba(255,255,255,0.35) !important;
  }
  .eniwer-toc-tick.active .eniwer-toc-tick-line {
    background: #f27a8f !important;
    box-shadow: 0 0 8px rgba(242,122,143,0.45) !important;
  }
  .eniwer-toc-tick:not(.active) .eniwer-toc-tick-line {
    background: rgba(242,122,143,0.2) !important;
  }
  .eniwer-toc-tick:not(.active):hover .eniwer-toc-tick-line {
    background: rgba(242,122,143,0.5) !important;
  }
  .eniwer-toc-panel {
    background: linear-gradient(
      135deg,
      rgba(60,60,67,0.5) 0%,
      rgba(40,40,45,0.35) 50%,
      rgba(55,55,60,0.45) 100%
    ) !important;
    border-color: rgba(255,255,255,0.1) !important;
    box-shadow:
      0 12px 48px rgba(0,0,0,0.35),
      0 4px 16px rgba(0,0,0,0.2),
      inset 0 1px 0 rgba(255,255,255,0.1),
      inset 0 -1px 0 rgba(255,255,255,0.04) !important;
  }
  .eniwer-toc-header { color: rgba(255,255,255,0.35) !important; }
  .eniwer-toc-item { color: rgba(255,255,255,0.7) !important; }
  .eniwer-toc-item:hover { background: rgba(255,255,255,0.06) !important; }
  .eniwer-toc-item.active {
    color: #f27a8f !important;
    background: rgba(242,122,143,0.1) !important;
  }
  .eniwer-toc-item.active::before { background: #f27a8f !important; }
  .eniwer-toc-index { color: rgba(255,255,255,0.3) !important; }
}
`;

export class ChatTOCPlugin implements Plugin, SettingsContributor {
  readonly id = 'chatTOC';
  readonly name = 'Chat TOC';
  readonly description = 'plugin.chatTOC.description';
  readonly icon = icons.chatTOC;

  private ctx!: PluginContext;
  private site: SiteConfig | null = null;
  private sidebar: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private observer: MutationObserver | null = null;
  private scrollHandler: (() => void) | null = null;
  private scrollContainer: Element | Document | null = null;
  private messageElements: Element[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private fisheyeHandler: ((e: MouseEvent) => void) | null = null;
  private fisheyeLeaveHandler: (() => void) | null = null;
  private enabled = true;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
    this.enabled = (ctx.getConfig() as MenuConfig & { chatTOCEnabled?: boolean }).chatTOCEnabled !== false;

    ctx.onConfigChange((config: MenuConfig) => {
      const newEnabled = (config as MenuConfig & { chatTOCEnabled?: boolean }).chatTOCEnabled !== false;
      if (newEnabled !== this.enabled) {
        this.enabled = newEnabled;
        if (this.enabled && this.site) {
          this.mount();
        } else if (!this.enabled) {
          this.unmount();
        }
      }
    });

    // Detect site
    const hostname = location.hostname;
    this.site = SITES.find((s) => hostname.includes(s.host)) || null;

    console.log(`[ChatTOC] activate: hostname=${hostname}, matched=${this.site?.host || 'none'}, enabled=${this.enabled}`);

    if (this.site && this.enabled) {
      this.mount();
    }
  }

  deactivate(): void {
    this.unmount();
    this.site = null;
  }

  // --- Lifecycle ---

  private mount(): void {
    if (this.sidebar) return; // already mounted
    this.injectStyles();
    this.createSidebar();
    this.startObserver();
    this.updateTOC();
    this.setupScrollSpy();
  }

  private unmount(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.scrollHandler && this.scrollContainer) {
      const target = this.scrollContainer === document
        ? document
        : this.scrollContainer;
      target.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
      this.scrollContainer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.fisheyeHandler = null;
    this.fisheyeLeaveHandler = null;
    if (this.sidebar) {
      this.sidebar.remove();
      this.sidebar = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    this.messageElements = [];
    this.activeIndex = -1;
  }

  // --- Core ---

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    this.styleEl = document.createElement('style');
    this.styleEl.id = STYLE_ID;
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);
  }

  private createSidebar(): void {
    this.sidebar = document.createElement('div');
    this.sidebar.id = SIDEBAR_ID;
    this.sidebar.innerHTML = `
      <div class="eniwer-toc-timeline"></div>
      <div class="eniwer-toc-panel">
        <div class="eniwer-toc-header">Timeline</div>
        <div class="eniwer-toc-list"></div>
      </div>
    `;
    document.body.appendChild(this.sidebar);

    const timeline = this.sidebar.querySelector('.eniwer-toc-timeline')!;

    // Tick click (event delegation)
    timeline.addEventListener('click', (e) => {
      const tick = (e.target as HTMLElement).closest('.eniwer-toc-tick') as HTMLElement | null;
      if (!tick) return;
      this.scrollToMessage(Number(tick.dataset.idx));
    });

    // Fisheye magnification on mousemove (like Time Machine)
    this.fisheyeHandler = (e: MouseEvent) => {
      const ticks = timeline.querySelectorAll('.eniwer-toc-tick') as NodeListOf<HTMLElement>;
      const mouseY = e.clientY;
      const RADIUS = 60; // px radius of fisheye influence
      const MAX_SCALE = 1.8;

      for (const tick of ticks) {
        const rect = tick.getBoundingClientRect();
        const tickCenterY = rect.top + rect.height / 2;
        const dist = Math.abs(mouseY - tickCenterY);

        if (dist < RADIUS) {
          const ratio = 1 - dist / RADIUS;
          const scale = 1 + (MAX_SCALE - 1) * (0.5 + 0.5 * Math.cos(Math.PI * (1 - ratio)));
          const line = tick.querySelector('.eniwer-toc-tick-line') as HTMLElement;
          if (line) {
            const baseWidth = tick.classList.contains('active') ? 32 : 18;
            line.style.width = `${baseWidth * scale}px`;
          }
        } else {
          const line = tick.querySelector('.eniwer-toc-tick-line') as HTMLElement;
          if (line) line.style.width = '';
        }
      }
    };

    this.fisheyeLeaveHandler = () => {
      const lines = timeline.querySelectorAll('.eniwer-toc-tick-line') as NodeListOf<HTMLElement>;
      for (const line of lines) {
        line.style.width = '';
      }
    };

    timeline.addEventListener('mousemove', this.fisheyeHandler);
    timeline.addEventListener('mouseleave', this.fisheyeLeaveHandler);

    // List item click (event delegation)
    this.sidebar.querySelector('.eniwer-toc-list')!.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.eniwer-toc-item') as HTMLElement | null;
      if (!item) return;
      this.scrollToMessage(Number(item.dataset.idx));
    });
  }

  private startObserver(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.updateTOC();
      }, DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private updateTOC(): void {
    if (!this.site || !this.sidebar) return;

    const elements = Array.from(document.querySelectorAll(this.site.messageSelector));
    const texts = elements.map((el) => this.site!.textExtractor(el));

    const entries: { el: Element; text: string }[] = [];
    for (let i = 0; i < elements.length; i++) {
      if (texts[i]) entries.push({ el: elements[i], text: texts[i] });
    }

    console.log(`[ChatTOC] updateTOC: selector="${this.site.messageSelector}", rawElements=${elements.length}, withText=${entries.length}`);

    this.messageElements = entries.map((e) => e.el);

    const timeline = this.sidebar.querySelector('.eniwer-toc-timeline') as HTMLElement;
    const listContainer = this.sidebar.querySelector('.eniwer-toc-list') as HTMLElement;
    if (!timeline || !listContainer) return;

    if (entries.length === 0) {
      this.sidebar.style.display = 'none';
      return;
    }
    this.sidebar.style.display = 'flex';

    // Pause observer to avoid infinite loop
    this.observer?.disconnect();

    // Build Time Machine tick marks with inner <span> for the line
    timeline.innerHTML = entries
      .map((_, i) => `<div class="eniwer-toc-tick" data-idx="${i}"><span class="eniwer-toc-tick-line"></span></div>`)
      .join('');

    // Build list items
    listContainer.innerHTML = entries
      .map((e, i) => {
        const truncated = e.text.length > MAX_TEXT_LEN
          ? e.text.slice(0, MAX_TEXT_LEN) + '...'
          : e.text;
        const escaped = this.escapeHtml(truncated);
        return `<div class="eniwer-toc-item" data-idx="${i}" title="${this.escapeAttr(e.text)}"><span class="eniwer-toc-index">${i + 1}</span>${escaped}</div>`;
      })
      .join('');

    // Resume observer
    this.observer?.observe(document.body, { childList: true, subtree: true });

    this.highlightActive(this.activeIndex);
  }

  private setupScrollSpy(): void {
    const site = this.site!;
    let scrollTarget: Element | Document;

    if (site.scrollContainerSelector) {
      const el = document.querySelector(site.scrollContainerSelector);
      scrollTarget = el || document;
    } else {
      scrollTarget = document;
    }

    this.scrollContainer = scrollTarget;
    let ticking = false;

    this.scrollHandler = () => {
      if (ticking) return;
      ticking = true;
      this.rafId = requestAnimationFrame(() => {
        ticking = false;
        this.computeActive();
      });
    };

    scrollTarget.addEventListener('scroll', this.scrollHandler, { passive: true });
    // Initial compute
    this.computeActive();
  }

  private computeActive(): void {
    if (this.messageElements.length === 0) return;

    const viewportMid = window.innerHeight / 2;
    let closest = 0;
    let closestDist = Infinity;

    for (let i = 0; i < this.messageElements.length; i++) {
      const rect = this.messageElements[i].getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportMid);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }

    if (closest !== this.activeIndex) {
      this.activeIndex = closest;
      this.highlightActive(closest);
    }
  }

  private highlightActive(index: number): void {
    if (!this.sidebar) return;

    const ticks = this.sidebar.querySelectorAll('.eniwer-toc-tick');
    const items = this.sidebar.querySelectorAll('.eniwer-toc-item');

    ticks.forEach((t, i) => t.classList.toggle('active', i === index));
    items.forEach((item, i) => {
      item.classList.toggle('active', i === index);
      if (i === index) {
        item.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }

  private scrollToMessage(index: number): void {
    const el = this.messageElements[index];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- SettingsContributor ---

  getSettingsHTML(config: MenuConfig): string {
    const enabled = (config as MenuConfig & { chatTOCEnabled?: boolean }).chatTOCEnabled !== false;
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('plugin.chatTOC.description')}</div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('plugin.chatTOC.enabled')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="chat-toc-enabled" ${enabled ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const input = shadowRoot.querySelector('#chat-toc-enabled') as HTMLInputElement | null;
    input?.addEventListener('change', () => {
      (tempConfig as MenuConfig & { chatTOCEnabled?: boolean }).chatTOCEnabled = input.checked;
      onChange();
    });
  }
}
