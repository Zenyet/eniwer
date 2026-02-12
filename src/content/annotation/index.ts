// Annotation module entry point
// Initializes the annotation system and exports components

import { AnnotationManager } from './AnnotationManager';
import { NotePopup } from './NotePopup';
import { Annotation, AnnotationColor, AnnotationAIResult } from '../../types/annotation';
import { getAnnotation } from './storage';

export { AnnotationManager } from './AnnotationManager';
export { NotePopup } from './NotePopup';
export { PositionResolver } from './PositionResolver';
export * from './storage';

export interface AnnotationSystemCallbacks {
  onToast?: (message: string) => void;
}

/**
 * AnnotationSystem - coordinates AnnotationManager and NotePopup
 */
export class AnnotationSystem {
  private manager: AnnotationManager;
  private notePopup: NotePopup;
  private callbacks: AnnotationSystemCallbacks = {};

  constructor() {
    this.manager = new AnnotationManager();
    this.notePopup = new NotePopup();

    // Wire up manager callbacks
    this.manager.setCallbacks({
      onHighlightClick: (annotation, element) => {
        this.showNotePopup(annotation, element);
      },
    });
  }

  /**
   * Set system callbacks
   */
  setCallbacks(callbacks: AnnotationSystemCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Initialize the annotation system
   * Call this after DOM is ready
   */
  async init(): Promise<void> {
    // Restore highlights for current page
    await this.manager.restoreHighlights();
  }

  /**
   * Create a highlight from current selection
   */
  async createHighlight(color: AnnotationColor): Promise<Annotation | null> {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.callbacks.onToast?.('请先选择文本');
      return null;
    }

    const annotation = await this.manager.createAnnotation(selection, color);
    if (annotation) {
      this.callbacks.onToast?.('已添加标注');
    }
    return annotation;
  }

  /**
   * Create a highlight with AI result
   */
  async createHighlightWithAI(
    color: AnnotationColor,
    aiResult: AnnotationAIResult
  ): Promise<Annotation | null> {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.callbacks.onToast?.('请先选择文本');
      return null;
    }

    const annotation = await this.manager.createAnnotation(selection, color, undefined, aiResult);
    if (annotation) {
      this.callbacks.onToast?.('已保存到批注');
    }
    return annotation;
  }

  /**
   * Add AI result to an existing annotation
   */
  async addAIResultToAnnotation(
    annotationId: string,
    aiResult: AnnotationAIResult
  ): Promise<Annotation | null> {
    const updated = await this.manager.updateAnnotation(annotationId, { aiResult });
    if (updated) {
      this.callbacks.onToast?.('AI 结果已添加到批注');
    }
    return updated;
  }

  /**
   * Create a highlight with note popup
   */
  async createHighlightWithNote(): Promise<void> {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.callbacks.onToast?.('请先选择文本');
      return;
    }

    // Create highlight with default color
    const annotation = await this.manager.createAnnotation(selection, 'yellow');
    if (!annotation) return;

    // Show note popup
    const element = this.manager.getAnnotationElement(annotation.id);
    if (element) {
      // Delay to let the highlight render
      setTimeout(() => {
        this.showNotePopup(annotation, element);
      }, 50);
    }
  }

  /**
   * Show note popup for an annotation
   */
  private async showNotePopup(annotation: Annotation, element: HTMLElement): Promise<void> {
    // Refresh annotation from storage in case it was updated
    const freshAnnotation = await getAnnotation(annotation.id);
    if (!freshAnnotation) return;

    this.notePopup.show(freshAnnotation, element, {
      onSave: async (id, note, color) => {
        await this.manager.updateAnnotation(id, { note, color });
        this.callbacks.onToast?.('批注已保存');
      },
      onDelete: async (id) => {
        await this.manager.deleteAnnotation(id);
        this.callbacks.onToast?.('标注已删除');
      },
      onClose: () => {
        // Cleanup if needed
      },
    });
  }

  /**
   * Hide note popup
   */
  hideNotePopup(): void {
    this.notePopup.hide();
  }

  /**
   * Check if note popup is visible
   */
  isNotePopupVisible(): boolean {
    return this.notePopup.isVisible();
  }

  /**
   * Get all annotations for current page
   */
  async getPageAnnotations(): Promise<Annotation[]> {
    return this.manager.getPageAnnotations();
  }

  /**
   * Scroll to and highlight an annotation on the current page
   */
  scrollToAnnotation(id: string): boolean {
    return this.manager.scrollToAnnotation(id);
  }
}
