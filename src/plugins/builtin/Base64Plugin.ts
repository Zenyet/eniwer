// Base64 Plugin — standalone view for Base64 encode/decode

import { icons } from '../../icons';
import { t } from '../../i18n';
import type { Plugin, CommandContributor, ViewContributor, PluginContext } from '../types';
import type { MenuItem } from '../../types';

// Encode icon (text → base64): arrow pointing right
const encodeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
// Decode icon (base64 → text): arrow pointing left
const decodeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

export class Base64Plugin implements Plugin, CommandContributor, ViewContributor {
  readonly id = 'base64';
  readonly name = 'Base64';
  readonly description = 'plugin.base64.description';
  readonly icon = icons.base64;
  readonly viewType = 'base64';

  private ctx!: PluginContext;
  private mode: 'encode' | 'decode' = 'encode';

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.mode = 'encode';
  }

  // ---- CommandContributor ----

  getCommands(): MenuItem[] {
    return [
      {
        id: 'base64',
        icon: icons.base64,
        label: t('menu.base64'),
        action: 'base64',
        enabled: true,
        order: 100,
        _fromPlugin: true,
      },
    ];
  }

  handleCommand(action: string): boolean {
    if (action !== 'base64') return false;
    this.show();
    return true;
  }

  // ---- ViewContributor ----

  private getModeLabel(): string {
    return this.mode === 'encode' ? t('base64.encode') : t('base64.decode');
  }

  getViewHTML(): string {
    const modeIcon = this.mode === 'encode' ? encodeIcon : decodeIcon;
    const placeholder = this.mode === 'encode'
      ? t('base64.encodePlaceholder')
      : t('base64.decodePlaceholder');

    return `
      <div class="glass-search glass-draggable">
        <div class="glass-command-tag" data-action="base64">
          <span class="glass-command-tag-icon">${icons.base64}</span>
          <span class="glass-command-tag-label">Base64</span>
          <button class="glass-command-tag-close">&times;</button>
        </div>
        <button class="glass-base64-mode-btn" id="base64-mode-toggle" title="${t('base64.toggleMode')}">
          <span class="glass-base64-mode-icon">${modeIcon}</span>
          <span class="glass-base64-mode-label">${this.getModeLabel()}</span>
        </button>
        <input
          type="text"
          class="glass-input"
          id="base64-input"
          placeholder="${placeholder}"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="glass-kbd">ESC</kbd>
      </div>
      <div class="glass-divider"></div>
      <div class="glass-body" style="overflow-y:auto;">
        <div id="base64-result" class="glass-base64-result"></div>
      </div>
      <div class="glass-footer">
        <div class="glass-chat-footer-actions" style="flex:1;">
          <button class="glass-footer-btn" id="base64-copy" title="${t('common.copy')}" style="display:none;">
            ${icons.copy}
          </button>
          <button class="glass-footer-btn" id="base64-swap" title="${t('base64.swap')}" style="display:none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
          </button>
        </div>
        <div class="glass-brand">
          <span class="glass-logo">${icons.logo}</span>
        </div>
      </div>
      <style>
        .glass-base64-mode-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border: 0.5px solid var(--glass-border-strong);
          border-radius: 6px;
          background: var(--glass-bg-elevated);
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--duration-fast);
          flex-shrink: 0;
        }
        .glass-base64-mode-btn:hover {
          background: var(--glass-bg-hover);
          color: var(--text-primary);
        }
        .glass-base64-mode-icon {
          display: flex;
          align-items: center;
        }
        .glass-base64-mode-icon svg {
          width: 12px;
          height: 12px;
        }
        .glass-base64-result {
          padding: 12px;
          min-height: 40px;
        }
        .glass-base64-result:empty::before {
          content: attr(data-hint);
          color: var(--text-tertiary);
          font-size: 13px;
        }
        .glass-base64-result-text {
          font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-primary);
          white-space: pre-wrap;
          word-break: break-all;
          user-select: text;
        }
        .glass-base64-result-error {
          color: #ff6b6b;
          font-size: 13px;
        }
      </style>
    `;
  }

  bindEvents(shadowRoot: ShadowRoot): void {
    const sr = this.ctx.getShadowRoot() || shadowRoot;

    // Drag
    const header = sr.querySelector('.glass-search.glass-draggable') as HTMLElement;
    header?.addEventListener('mousedown', (e) => {
      this.ctx.getHandleDragStart()(e);
    });

    // Close
    sr.querySelector('.glass-command-tag-close')?.addEventListener('click', () => {
      this.ctx.ui.navigateToView('commands');
    });

    const inputEl = sr.querySelector('#base64-input') as HTMLInputElement;
    const resultEl = sr.querySelector('#base64-result') as HTMLElement;
    const copyBtn = sr.querySelector('#base64-copy') as HTMLElement;
    const swapBtn = sr.querySelector('#base64-swap') as HTMLElement;

    // Set hint
    resultEl.setAttribute('data-hint', t('base64.hint'));

    // Mode toggle
    const modeBtn = sr.querySelector('#base64-mode-toggle') as HTMLElement;
    modeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.mode = this.mode === 'encode' ? 'decode' : 'encode';
      // Update button visuals
      const iconSpan = modeBtn.querySelector('.glass-base64-mode-icon');
      const labelSpan = modeBtn.querySelector('.glass-base64-mode-label');
      if (iconSpan) iconSpan.innerHTML = this.mode === 'encode' ? encodeIcon : decodeIcon;
      if (labelSpan) labelSpan.textContent = this.getModeLabel();
      // Update input placeholder
      if (inputEl) {
        inputEl.placeholder = this.mode === 'encode'
          ? t('base64.encodePlaceholder')
          : t('base64.decodePlaceholder');
      }
      inputEl?.focus();
    });

    // Enter to execute
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = inputEl.value;
        if (!text) return;

        try {
          let result: string;
          if (this.mode === 'encode') {
            result = btoa(unescape(encodeURIComponent(text)));
          } else {
            result = decodeURIComponent(escape(atob(text)));
          }
          resultEl.innerHTML = `<div class="glass-base64-result-text">${this.escapeHtml(result)}</div>`;
          copyBtn.style.display = 'flex';
          swapBtn.style.display = 'flex';
        } catch {
          const errMsg = this.mode === 'encode' ? t('base64.encodeError') : t('base64.decodeError');
          resultEl.innerHTML = `<div class="glass-base64-result-error">${errMsg}</div>`;
          copyBtn.style.display = 'none';
          swapBtn.style.display = 'none';
        }
      }
    });

    // Copy result
    copyBtn?.addEventListener('click', () => {
      const textEl = resultEl.querySelector('.glass-base64-result-text');
      if (!textEl?.textContent) return;
      navigator.clipboard.writeText(textEl.textContent).then(() => {
        this.ctx.showToast(t('validate.copiedToClipboard'));
      });
    });

    // Swap: put result into input, flip mode, clear result
    swapBtn?.addEventListener('click', () => {
      const textEl = resultEl.querySelector('.glass-base64-result-text');
      if (!textEl?.textContent || !inputEl) return;
      inputEl.value = textEl.textContent;
      this.mode = this.mode === 'encode' ? 'decode' : 'encode';
      const iconSpan = modeBtn?.querySelector('.glass-base64-mode-icon');
      const labelSpan = modeBtn?.querySelector('.glass-base64-mode-label');
      if (iconSpan) iconSpan.innerHTML = this.mode === 'encode' ? encodeIcon : decodeIcon;
      if (labelSpan) labelSpan.textContent = this.getModeLabel();
      if (inputEl) {
        inputEl.placeholder = this.mode === 'encode'
          ? t('base64.encodePlaceholder')
          : t('base64.decodePlaceholder');
      }
      resultEl.innerHTML = '';
      copyBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      inputEl.focus();
    });

    // Focus input
    requestAnimationFrame(() => inputEl?.focus());
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- Internal ----

  private show(): void {
    this.ctx.ui.setActiveCommand({
      id: 'base64',
      action: 'base64',
      label: t('menu.base64'),
      icon: icons.base64,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('base64');
  }
}
