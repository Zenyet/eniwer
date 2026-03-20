// SelectionPopoverPlugin — manages the floating text-selection popover

import { SelectionPopover, PopoverPosition, SelectionPopoverOptions, SEARCH_ENGINES } from '../../content/SelectionPopover';
import { t } from '../../i18n';
import { icons } from '../../icons';
import type { Plugin, SettingsContributor, PluginContext } from '../types';
import type { MenuConfig } from '../../types';

export class SelectionPopoverPlugin implements Plugin, SettingsContributor {
  readonly id = 'selectionPopover';
  readonly name = 'Selection Popover';
  readonly description = 'plugin.selectionPopover.description';
  readonly icon = icons.textCursorInput;

  private ctx!: PluginContext;
  private popover = new SelectionPopover();
  private mouseupHandler: ((e: MouseEvent) => void) | null = null;
  private mousedownHandler: ((e: MouseEvent) => void) | null = null;
  private selectionTimeout: number | null = null;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
    this.setupSelectionListener();
  }

  deactivate(): void {
    if (this.mouseupHandler) document.removeEventListener('mouseup', this.mouseupHandler);
    if (this.mousedownHandler) document.removeEventListener('mousedown', this.mousedownHandler);
    this.mouseupHandler = null;
    this.mousedownHandler = null;
    this.popover.hide();
  }

  // ---- Selection listener (migrated from index.ts setupSelectionListener) ----

  private isOurUI(e: MouseEvent): boolean {
    const path = e.composedPath() as HTMLElement[];
    for (const el of path) {
      if (el instanceof HTMLElement) {
        if (el.classList?.contains('thecircle-selection-popover') ||
            el.classList?.contains('thecircle-result-panel') ||
            el.classList?.contains('thecircle-palette') ||
            el.classList?.contains('thecircle-toast') ||
            el.classList?.contains('thecircle-note-popup') ||
            el.classList?.contains('thecircle-highlight')) {
          return true;
        }
      }
    }
    return false;
  }

  private setupSelectionListener(): void {
    this.mouseupHandler = (e: MouseEvent) => {
      if (this.isOurUI(e)) return;

      if (this.selectionTimeout) clearTimeout(this.selectionTimeout);

      this.selectionTimeout = window.setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() || '';

        if (selectedText && selection && selection.rangeCount > 0) {
          const config = this.ctx.getConfig();

          // Master toggle
          if (config.showSelectionPopover === false) return;

          // Build options based on other plugins' states
          const opts = this.buildPopoverOptions();

          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position: PopoverPosition = config.popoverPosition || 'above';

          this.popover.show(rect, {
            onTranslate: () => {
              this.popover.hide();
              this.ctx.plugins.handleCommand('translate', selectedText);
            },
            onHighlight: (color: string) => {
              // Emit event for annotation system
              (this.ctx.getCommandPalette() as any).pluginManager?.emit('annotation:highlight', { color });
            },
            onNote: () => {
              (this.ctx.getCommandPalette() as any).pluginManager?.emit('annotation:note', {
                defaultColor: config.annotation?.defaultColor,
              });
            },
            onMore: () => {
              this.popover.hide();
              this.ctx.ui.show();
            },
            onQuote: (text: string) => {
              this.popover.hide();
              // Emit event for ContextChatPlugin to handle
              (this.ctx.getCommandPalette() as any).pluginManager?.emit('contextChat:quote', { text });
            },
            onQuoteAsk: (text: string) => {
              this.popover.hide();
              // Emit event for ContextChatPlugin to handle
              (this.ctx.getCommandPalette() as any).pluginManager?.emit('contextChat:quoteAsk', { text });
            },
          }, position, opts);
        } else {
          this.popover.hide();
        }
      }, 10);
    };

    this.mousedownHandler = (e: MouseEvent) => {
      if (this.isOurUI(e)) return;
      if (!window.getSelection()?.toString().trim()) {
        this.popover.hide();
      }
    };

    document.addEventListener('mouseup', this.mouseupHandler);
    document.addEventListener('mousedown', this.mousedownHandler);
  }

  private buildPopoverOptions(): SelectionPopoverOptions {
    const config = this.ctx.getConfig();
    const btnConfig = config.popoverButtons;
    const showSearch = btnConfig?.search !== false;
    const showHighlight = this.ctx.plugins.isEnabled('annotations');
    const showTranslate = this.ctx.plugins.isEnabled('translate') && (btnConfig?.translate !== false);
    const showQuote = this.ctx.plugins.isEnabled('contextChat') && (btnConfig?.quote !== false);
    const showQuoteAsk = this.ctx.plugins.isEnabled('contextChat') && (btnConfig?.quoteAsk !== false);
    // Filter search engines based on config
    const engineConfig = config.popoverSearchEngines;
    const searchEngines = engineConfig
      ? SEARCH_ENGINES.filter(e => engineConfig[e.id] !== false).map(e => e.id)
      : undefined;
    return { showSearch, showHighlight, showTranslate, showQuote, showQuoteAsk, searchEngines };
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    const btnConfig = config.popoverButtons || {};
    const isSearch = btnConfig.search !== false;
    const isTranslate = btnConfig.translate !== false;
    const isQuote = btnConfig.quote !== false;
    const isQuoteAsk = btnConfig.quoteAsk !== false;

    // Per-engine toggles — icon-based row
    const engineConfig = config.popoverSearchEngines || {};
    const engineIcons = SEARCH_ENGINES.map(engine => {
      const checked = engineConfig[engine.id] !== false;
      return `<button class="glass-popover-engine-icon${checked ? ' active' : ''}" data-engine="${engine.id}" title="${engine.label}" type="button">${engine.icon}</button>`;
    }).join('');

    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.selectionPopover')}</div>
        <div class="glass-form-group glass-form-toggle">
          <label class="glass-form-label">${t('settings.selectionPopover')}</label>
          <label class="glass-toggle">
            <input type="checkbox" id="show-popover-toggle" ${config.showSelectionPopover !== false ? 'checked' : ''}>
            <span class="glass-toggle-slider"></span>
          </label>
        </div>
        <div class="glass-form-group" id="popover-position-group"${config.showSelectionPopover === false ? ' style="display: none"' : ''}>
          <label class="glass-form-label">${t('settings.popoverPosition')}</label>
          <select class="glass-select" id="popover-position-select">
            <option value="above"${config.popoverPosition === 'above' ? ' selected' : ''}>${t('settings.popoverAbove')}</option>
            <option value="below"${config.popoverPosition === 'below' ? ' selected' : ''}>${t('settings.popoverBelow')}</option>
          </select>
        </div>
        <div id="popover-buttons-group"${config.showSelectionPopover === false ? ' style="display: none"' : ''}>
          <div class="glass-settings-section-title" style="margin-top:8px;">${t('settings.popoverButtons')}</div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.popoverBtnSearch')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="popover-btn-search" ${isSearch ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div id="popover-engines-group" class="glass-popover-engines-row" style="${isSearch ? '' : 'display:none;'}">
            ${engineIcons}
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.popoverBtnTranslate')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="popover-btn-translate" ${isTranslate ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.popoverBtnQuote')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="popover-btn-quote" ${isQuote ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.popoverBtnQuoteAsk')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="popover-btn-quoteAsk" ${isQuoteAsk ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
      <style>
        .glass-popover-engines-row {
          display: flex;
          gap: 6px;
          padding: 4px 16px 8px;
          flex-wrap: wrap;
        }
        .glass-popover-engine-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1.5px solid var(--glass-border);
          background: transparent;
          cursor: pointer;
          opacity: 0.35;
          transition: all var(--duration-fast);
          padding: 0;
        }
        .glass-popover-engine-icon.active {
          opacity: 1;
          border-color: var(--glass-border-strong);
          background: var(--glass-bg-hover);
        }
        .glass-popover-engine-icon:hover {
          opacity: 0.85;
          background: var(--glass-bg-hover);
        }
      </style>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const positionSelect = shadowRoot.querySelector('#popover-position-select') as HTMLSelectElement | null;
    positionSelect?.addEventListener('change', () => {
      tempConfig.popoverPosition = positionSelect.value as 'above' | 'below';
      onChange();
    });

    const popoverPositionGroup = shadowRoot.querySelector('#popover-position-group') as HTMLElement | null;
    const popoverButtonsGroup = shadowRoot.querySelector('#popover-buttons-group') as HTMLElement | null;
    const toggle = shadowRoot.querySelector('#show-popover-toggle') as HTMLInputElement | null;
    toggle?.addEventListener('change', () => {
      tempConfig.showSelectionPopover = toggle.checked;
      if (popoverPositionGroup) popoverPositionGroup.style.display = toggle.checked ? 'flex' : 'none';
      if (popoverButtonsGroup) popoverButtonsGroup.style.display = toggle.checked ? '' : 'none';
      onChange();
    });

    // Button toggles
    const ensurePopoverButtons = () => {
      if (!tempConfig.popoverButtons) tempConfig.popoverButtons = {};
      return tempConfig.popoverButtons;
    };

    // Search toggle — show/hide engines group
    const searchToggle = shadowRoot.querySelector('#popover-btn-search') as HTMLInputElement | null;
    const enginesGroup = shadowRoot.querySelector('#popover-engines-group') as HTMLElement | null;
    searchToggle?.addEventListener('change', () => {
      const btns = ensurePopoverButtons();
      btns.search = searchToggle.checked;
      if (enginesGroup) enginesGroup.style.display = searchToggle.checked ? '' : 'none';
      onChange();
    });

    // Per-engine icon toggles
    const engineBtns = shadowRoot.querySelectorAll('.glass-popover-engine-icon') as NodeListOf<HTMLElement>;
    engineBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const engineId = btn.dataset.engine!;
        const isActive = btn.classList.toggle('active');
        if (!tempConfig.popoverSearchEngines) tempConfig.popoverSearchEngines = {};
        tempConfig.popoverSearchEngines[engineId] = isActive;
        onChange();
      });
    });

    const btnIds: Array<[string, keyof NonNullable<MenuConfig['popoverButtons']>]> = [
      ['popover-btn-translate', 'translate'],
      ['popover-btn-quote', 'quote'],
      ['popover-btn-quoteAsk', 'quoteAsk'],
    ];

    for (const [id, key] of btnIds) {
      const el = shadowRoot.querySelector(`#${id}`) as HTMLInputElement | null;
      el?.addEventListener('change', () => {
        const btns = ensurePopoverButtons();
        btns[key] = el.checked;
        onChange();
      });
    }
  }
}
