// NotePopup - popup for viewing and editing annotation notes

import { Annotation, AnnotationAIResult, PRESET_COLORS, getAnnotationColorConfig } from '../../types/annotation';
import { appendToShadow, removeFromShadow } from '../ShadowHost';

export interface NotePopupCallbacks {
  onSave: (id: string, note: string, color: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const AI_TYPE_LABELS: Record<string, string> = {
  translate: '翻译',
  explain: '解释',
  summarize: '总结',
  rewrite: '改写',
};

export class NotePopup {
  private popup: HTMLElement | null = null;
  private currentAnnotation: Annotation | null = null;
  private callbacks: NotePopupCallbacks | null = null;

  constructor() {}

  /**
   * Show the popup for an annotation
   */
  show(
    annotation: Annotation,
    anchorElement: HTMLElement,
    callbacks: NotePopupCallbacks
  ): void {
    this.hide();
    this.currentAnnotation = annotation;
    this.callbacks = callbacks;

    this.createPopup(annotation, anchorElement);
  }

  /**
   * Hide the popup
   */
  hide(): void {
    if (this.popup) {
      this.popup.classList.add('thecircle-note-popup-exit');
      const popupRef = this.popup;
      setTimeout(() => {
        removeFromShadow(popupRef);
      }, 150);
      this.popup = null;
    }
    this.currentAnnotation = null;
    this.callbacks = null;
  }

  /**
   * Check if popup is visible
   */
  isVisible(): boolean {
    return this.popup !== null;
  }

  private createPopup(annotation: Annotation, anchor: HTMLElement): void {
    this.popup = document.createElement('div');
    this.popup.className = 'thecircle-note-popup';

    const rect = anchor.getBoundingClientRect();
    const { left, top } = this.calculatePosition(rect, !!annotation.aiResult);

    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;

    this.popup.innerHTML = `
      <div class="thecircle-note-popup-container ${annotation.aiResult ? 'has-ai-result' : ''}">
        <div class="thecircle-note-popup-quote">
          "${this.escapeHtml(annotation.highlightText.slice(0, 100))}${annotation.highlightText.length > 100 ? '...' : ''}"
        </div>
        ${this.renderAIResult(annotation.aiResult)}
        <div class="thecircle-note-popup-colors">
          ${this.renderColorButtons(annotation.color)}
        </div>
        <textarea
          class="thecircle-note-popup-input"
          placeholder="添加批注..."
          rows="3"
        >${this.escapeHtml(annotation.note || '')}</textarea>
        <div class="thecircle-note-popup-actions">
          <button class="thecircle-note-popup-btn thecircle-note-popup-btn-delete" data-action="delete">
            删除
          </button>
          <button class="thecircle-note-popup-btn thecircle-note-popup-btn-save" data-action="save">
            保存
          </button>
        </div>
      </div>
    `;

    appendToShadow(this.popup);

    // Setup event listeners
    this.setupEventListeners();

    // Focus the textarea
    const textarea = this.popup.querySelector('textarea');
    textarea?.focus();

    // Show with animation
    requestAnimationFrame(() => {
      if (this.popup) {
        this.popup.style.opacity = '1';
        this.popup.style.transform = 'translateY(0)';
      }
    });
  }

  private renderAIResult(aiResult?: AnnotationAIResult): string {
    if (!aiResult) return '';

    const typeLabel = AI_TYPE_LABELS[aiResult.type] || aiResult.type;
    const thinkingSection = aiResult.thinking ? `
      <div class="thecircle-note-popup-ai-thinking">
        <div class="thecircle-note-popup-ai-thinking-header" data-action="toggle-thinking">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>思考过程</span>
          <svg class="thecircle-note-popup-ai-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="thecircle-note-popup-ai-thinking-content collapsed">
          ${this.escapeHtml(aiResult.thinking)}
        </div>
      </div>
    ` : '';

    return `
      <div class="thecircle-note-popup-ai-result">
        <div class="thecircle-note-popup-ai-header">
          <span class="thecircle-note-popup-ai-badge">${typeLabel}</span>
          ${aiResult.targetLanguage ? `<span class="thecircle-note-popup-ai-lang">${aiResult.targetLanguage}</span>` : ''}
        </div>
        ${thinkingSection}
        <div class="thecircle-note-popup-ai-content">
          ${this.escapeHtml(aiResult.content)}
        </div>
      </div>
    `;
  }

  private renderColorButtons(currentColor: string): string {
    const isCustomColor = !PRESET_COLORS.includes(currentColor);

    const presetButtons = PRESET_COLORS
      .map(color => {
        const config = getAnnotationColorConfig(color);
        const isActive = color === currentColor;
        return `
          <button
            class="thecircle-note-popup-color-btn ${isActive ? 'active' : ''}"
            data-color="${color}"
            style="background-color: ${config.bg}; border-color: ${config.border}"
            title="${config.label}"
          ></button>
        `;
      })
      .join('');

    const customColorValue = isCustomColor ? currentColor : '#ff6600';

    return `${presetButtons}
      <div
        class="thecircle-note-popup-color-btn thecircle-note-popup-color-custom ${isCustomColor ? 'active' : ''}"
        title="自定义颜色"
        style="${isCustomColor ? `background: ${getAnnotationColorConfig(currentColor).bg}; border-color: ${getAnnotationColorConfig(currentColor).border};` : ''}"
      >
        <input type="color" class="thecircle-note-popup-color-input" value="${customColorValue}">
      </div>
    `;
  }

  private setupEventListeners(): void {
    if (!this.popup) return;

    // Color buttons
    const colorBtns = this.popup.querySelectorAll('.thecircle-note-popup-color-btn:not(.thecircle-note-popup-color-custom)');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = (btn as HTMLElement).dataset.color as string;
        this.selectColor(color);
      });
    });

    // Custom color input
    const customColorInput = this.popup.querySelector('.thecircle-note-popup-color-input') as HTMLInputElement;
    const customColorDiv = this.popup.querySelector('.thecircle-note-popup-color-custom') as HTMLElement;
    customColorInput?.addEventListener('input', (e) => {
      e.stopPropagation();
      const hex = customColorInput.value;
      this.selectColor(hex);
      if (customColorDiv) {
        const config = getAnnotationColorConfig(hex);
        customColorDiv.style.background = config.bg;
        customColorDiv.style.borderColor = config.border;
      }
    });

    // Thinking toggle
    const thinkingHeader = this.popup.querySelector('[data-action="toggle-thinking"]');
    thinkingHeader?.addEventListener('click', (e) => {
      e.stopPropagation();
      const thinkingContent = this.popup?.querySelector('.thecircle-note-popup-ai-thinking-content');
      const chevron = this.popup?.querySelector('.thecircle-note-popup-ai-chevron');
      if (thinkingContent) {
        thinkingContent.classList.toggle('collapsed');
        chevron?.classList.toggle('expanded');
      }
    });

    // Save button
    const saveBtn = this.popup.querySelector('[data-action="save"]');
    saveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.save();
    });

    // Delete button
    const deleteBtn = this.popup.querySelector('[data-action="delete"]');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.delete();
    });

    // Prevent click propagation on the popup
    this.popup.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    this.popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Handle Escape key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        this.callbacks?.onClose();
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        this.save();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      // Use composedPath to correctly detect clicks inside Shadow DOM
      const path = e.composedPath();
      const clickedInsidePopup = this.popup && path.includes(this.popup);

      if (!clickedInsidePopup) {
        this.hide();
        this.callbacks?.onClose();
        document.removeEventListener('click', handleClickOutside);
      }
    };
    // Delay to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);
  }

  private selectColor(color: string): void {
    if (!this.popup) return;

    // Update active state for preset buttons
    const colorBtns = this.popup.querySelectorAll('.thecircle-note-popup-color-btn:not(.thecircle-note-popup-color-custom)');
    colorBtns.forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.color === color);
    });

    // Update custom button active state
    const customBtn = this.popup.querySelector('.thecircle-note-popup-color-custom');
    const isCustom = !PRESET_COLORS.includes(color);
    customBtn?.classList.toggle('active', isCustom);

    // Update current annotation color (will be saved when save is clicked)
    if (this.currentAnnotation) {
      this.currentAnnotation = { ...this.currentAnnotation, color };
    }
  }

  private save(): void {
    if (!this.popup || !this.currentAnnotation) return;

    const textarea = this.popup.querySelector('textarea');
    const note = textarea?.value.trim() || '';
    const color = this.currentAnnotation.color;

    this.callbacks?.onSave(this.currentAnnotation.id, note, color);
    this.hide();
  }

  private delete(): void {
    if (!this.currentAnnotation) return;

    this.callbacks?.onDelete(this.currentAnnotation.id);
    this.hide();
  }

  private calculatePosition(rect: DOMRect, hasAIResult: boolean = false): { left: number; top: number } {
    const popupWidth = hasAIResult ? 340 : 280;
    const popupHeight = hasAIResult ? 350 : 200;
    const gap = 8;

    let left = rect.left + rect.width / 2 - popupWidth / 2;
    let top = rect.bottom + gap;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + popupWidth > window.innerWidth - 10) {
      left = window.innerWidth - popupWidth - 10;
    }

    // If not enough space below, show above
    if (top + popupHeight > window.innerHeight - 10) {
      top = rect.top - popupHeight - gap;
    }

    return { left, top };
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
