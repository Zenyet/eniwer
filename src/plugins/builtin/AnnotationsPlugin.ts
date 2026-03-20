// Annotations Plugin — manages annotation list view

import { Annotation } from '../../types/annotation';
import { getAnnotationColorConfig } from '../../types/annotation';
import { DEFAULT_ANNOTATION_CONFIG, MenuConfig } from '../../types';
import { getAllAnnotations, deleteAnnotation as deleteAnnotationFromStorage } from '../../content/annotation/storage';
import { normalizeUrlForAnnotation } from '../../content/CommandPalette/views';
import { icons } from '../../icons';
import {
  getAnnotationsViewHTML as getAnnotationsViewHTMLFromController,
  renderAnnotationsContent,
  bindAnnotationsEvents as bindAnnotationsEventsFromController,
  updateAnnotationsFooter as updateAnnotationsFooterFromController,
} from '../../content/CommandPalette/controllers';
import { t } from '../../i18n';
import type { Plugin, CommandContributor, ViewContributor, SettingsContributor, PluginContext } from '../../plugins';
import type { MenuItem } from '../../types';

export class AnnotationsPlugin implements Plugin, CommandContributor, ViewContributor, SettingsContributor {
  readonly id = 'annotations';
  readonly name = 'Annotations';
  readonly description = 'plugin.annotations.description';
  readonly icon = icons.highlighter;
  readonly viewType = 'annotations';

  private ctx!: PluginContext;

  // State (moved from CommandPalette)
  private annotationsList: Annotation[] = [];
  private annotationsSearch = '';
  private annotationsFilter: 'all' | 'current' = 'all';

  // Callback for scrolling to annotation on current page
  private onScrollToAnnotation: ((id: string) => boolean) | null = null;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.annotationsList = [];
    this.annotationsSearch = '';
    this.annotationsFilter = 'all';
    this.onScrollToAnnotation = null;
  }

  // ---- CommandContributor ----

  getCommands(): MenuItem[] {
    return [];
  }

  handleCommand(action: string): boolean {
    if (action !== 'annotations') return false;
    void this.show();
    return true;
  }

  // ---- ViewContributor ----

  getViewHTML(): string {
    return getAnnotationsViewHTMLFromController({
      annotations: this.annotationsList,
      currentUrl: window.location.href,
      filter: this.annotationsFilter,
      search: this.annotationsSearch,
    });
  }

  bindEvents(shadowRoot: ShadowRoot): void {
    const rerenderAnnotations = () => {
      renderAnnotationsContent(shadowRoot, {
        annotations: this.annotationsList,
        currentUrl: window.location.href,
        filter: this.annotationsFilter,
        search: this.annotationsSearch,
      });
      bindAnnotationsEventsFromController({
        handleDragStart: this.ctx.getHandleDragStart(),
        onClose: () => {
          this.ctx.ui.navigateToView('commands');
        },
        onDeleteAnnotation: async (id) => {
          if (!confirm(t('confirm.deleteAnnotation'))) return;
          await deleteAnnotationFromStorage(id);
          this.annotationsList = this.annotationsList.filter((annotation) => annotation.id !== id);
          rerenderAnnotations();
          updateAnnotationsFooterFromController(shadowRoot, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        onFilterChange: (filter) => {
          this.annotationsFilter = filter;
          rerenderAnnotations();
          updateAnnotationsFooterFromController(shadowRoot, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        onOpenAnnotation: (id, url) => {
          const currentUrl = normalizeUrlForAnnotation(window.location.href);
          if (url === currentUrl) {
            this.ctx.ui.hide();
            if (id && this.onScrollToAnnotation) {
              setTimeout(() => {
                this.onScrollToAnnotation?.(id);
              }, 300);
            }
          } else {
            window.location.href = url;
          }
        },
        onSearch: (query) => {
          this.annotationsSearch = query;
          rerenderAnnotations();
          updateAnnotationsFooterFromController(shadowRoot, {
            annotations: this.annotationsList,
            currentUrl: window.location.href,
            filter: this.annotationsFilter,
            search: this.annotationsSearch,
          });
        },
        shadowRoot,
      });
      updateAnnotationsFooterFromController(shadowRoot, {
        annotations: this.annotationsList,
        currentUrl: window.location.href,
        filter: this.annotationsFilter,
        search: this.annotationsSearch,
      });
    };

    rerenderAnnotations();
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    const dc = config.annotation?.defaultColor || 'yellow';
    const isCustom = !['yellow', 'green', 'blue', 'pink', 'purple'].includes(dc);
    const customValue = isCustom ? dc : '#ff6600';
    const customConfig = isCustom ? getAnnotationColorConfig(dc) : null;
    const customColorHTML = `<div class="glass-color-option glass-color-option-custom ${isCustom ? 'active' : ''}" title="${t('settings.customColor')}" style="${isCustom ? `--color: ${customConfig!.bg}; --color-border: ${customConfig!.border};` : ''}">
                  <input type="color" id="annotation-custom-color" value="${customValue}">
                </div>`;

    return `
        <!-- 批注 -->
        <div class="glass-settings-section">
          <div class="glass-settings-section-title">${t('settings.annotationSection')}</div>
          <div class="glass-form-group">
            <label class="glass-form-label">${t('settings.defaultHighlightColor')}</label>
            <div class="glass-color-picker" id="annotation-color-picker">
              <button class="glass-color-option ${(config.annotation?.defaultColor || 'yellow') === 'yellow' ? 'active' : ''}" data-color="yellow" style="--color: #fef08a; --color-border: #fbbf24;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'green' ? 'active' : ''}" data-color="green" style="--color: #bbf7d0; --color-border: #4ade80;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'blue' ? 'active' : ''}" data-color="blue" style="--color: #bfdbfe; --color-border: #60a5fa;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'pink' ? 'active' : ''}" data-color="pink" style="--color: #fbcfe8; --color-border: #f472b6;"></button>
              <button class="glass-color-option ${config.annotation?.defaultColor === 'purple' ? 'active' : ''}" data-color="purple" style="--color: #ddd6fe; --color-border: #a78bfa;"></button>
              ${customColorHTML}
            </div>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.autoSaveAIResult')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-auto-save" ${config.annotation?.autoSaveAIResult ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
            <span class="glass-form-hint">${t('settings.autoSaveAIHint')}</span>
          </div>
          <div class="glass-form-group glass-form-toggle">
            <label class="glass-form-label">${t('settings.defaultShowCurrentPage')}</label>
            <label class="glass-toggle">
              <input type="checkbox" id="annotation-page-filter" ${config.annotation?.showPageFilter ? 'checked' : ''}>
              <span class="glass-toggle-slider"></span>
            </label>
          </div>
        </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    const annotationConfig = tempConfig.annotation || { ...DEFAULT_ANNOTATION_CONFIG };

    const colorPicker = shadowRoot.querySelector('#annotation-color-picker');
    colorPicker?.querySelectorAll('.glass-color-option:not(.glass-color-option-custom)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = (btn as HTMLElement).dataset.color as string;
        annotationConfig.defaultColor = color;
        tempConfig.annotation = annotationConfig;
        colorPicker.querySelectorAll('.glass-color-option').forEach((node) => node.classList.remove('active'));
        btn.classList.add('active');
        onChange();
      });
    });

    const customColorDiv = colorPicker?.querySelector('.glass-color-option-custom') as HTMLElement | null;
    const customColorInput = shadowRoot.querySelector('#annotation-custom-color') as HTMLInputElement | null;
    customColorInput?.addEventListener('input', () => {
      const hex = customColorInput.value;
      annotationConfig.defaultColor = hex;
      tempConfig.annotation = annotationConfig;
      colorPicker?.querySelectorAll('.glass-color-option').forEach((node) => node.classList.remove('active'));
      if (customColorDiv) {
        customColorDiv.classList.add('active');
        customColorDiv.style.setProperty('--color', `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.4)`);
        customColorDiv.style.setProperty('--color-border', `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.8)`);
      }
      onChange();
    });

    const autoSaveToggle = shadowRoot.querySelector('#annotation-auto-save') as HTMLInputElement | null;
    autoSaveToggle?.addEventListener('change', () => {
      annotationConfig.autoSaveAIResult = autoSaveToggle.checked;
      tempConfig.annotation = annotationConfig;
      onChange();
    });

    const pageFilterToggle = shadowRoot.querySelector('#annotation-page-filter') as HTMLInputElement | null;
    pageFilterToggle?.addEventListener('change', () => {
      annotationConfig.showPageFilter = pageFilterToggle.checked;
      tempConfig.annotation = annotationConfig;
      onChange();
    });
  }

  // ---- Public API (called from TheCircle) ----

  /** Set the scroll-to-annotation callback (provided by TheCircle which owns the AnnotationSystem) */
  setScrollToAnnotationCallback(cb: (id: string) => boolean): void {
    this.onScrollToAnnotation = cb;
  }

  // ---- Internal ----

  private async show(): Promise<void> {
    this.annotationsList = await getAllAnnotations();
    this.annotationsSearch = '';
    this.ctx.ui.navigateToView('annotations');
  }
}
