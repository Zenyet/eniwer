// AnnotationManager - handles highlight creation, removal, and restoration

import { Annotation, AnnotationColor, AnnotationAIResult, getAnnotationColorConfig } from '../../types/annotation';
import { PositionResolver } from './PositionResolver';
import {
  getAnnotationsForUrl,
  saveAnnotation,
  updateAnnotation,
  deleteAnnotation,
  generateAnnotationId,
  normalizeUrl,
} from './storage';

const HIGHLIGHT_CLASS = 'thecircle-highlight';
const HIGHLIGHT_DATA_ATTR = 'data-annotation-id';

export interface AnnotationManagerCallbacks {
  onHighlightClick?: (annotation: Annotation, element: HTMLElement) => void;
}

export class AnnotationManager {
  private callbacks: AnnotationManagerCallbacks = {};
  private highlightElements: Map<string, HTMLElement[]> = new Map();

  constructor() {}

  /**
   * Set callbacks for annotation events
   */
  setCallbacks(callbacks: AnnotationManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Create a new annotation from current selection
   */
  async createAnnotation(
    selection: Selection,
    color: AnnotationColor,
    note?: string,
    aiResult?: AnnotationAIResult
  ): Promise<Annotation | null> {
    const position = PositionResolver.fromSelection(selection);
    if (!position) return null;

    const annotation: Annotation = {
      id: generateAnnotationId(),
      url: normalizeUrl(window.location.href),
      pageTitle: document.title,
      position,
      highlightText: selection.toString(),
      note,
      color,
      aiResult,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save to storage
    await saveAnnotation(annotation);

    // Render the highlight
    const range = selection.getRangeAt(0);
    this.renderHighlight(range, annotation);

    // Clear selection
    selection.removeAllRanges();

    return annotation;
  }

  /**
   * Update an annotation's note, color, or aiResult
   */
  async updateAnnotation(
    id: string,
    updates: { note?: string; color?: AnnotationColor; aiResult?: AnnotationAIResult }
  ): Promise<Annotation | null> {
    const updated = await updateAnnotation(id, updates);

    if (updated && updates.color) {
      // Update highlight color
      const elements = this.highlightElements.get(id);
      if (elements) {
        const colorConfig = getAnnotationColorConfig(updates.color);
        elements.forEach(el => {
          el.style.backgroundColor = colorConfig.bg;
          el.style.borderBottomColor = colorConfig.border;
        });
      }
    }

    return updated;
  }

  /**
   * Delete an annotation
   */
  async deleteAnnotation(id: string): Promise<boolean> {
    const success = await deleteAnnotation(id);

    if (success) {
      this.removeHighlight(id);
    }

    return success;
  }

  /**
   * Restore all highlights for current page
   */
  async restoreHighlights(): Promise<void> {
    const annotations = await getAnnotationsForUrl(window.location.href);

    for (const annotation of annotations) {
      const range = PositionResolver.toRange(annotation.position);
      if (range) {
        this.renderHighlight(range, annotation);
      }
    }
  }

  /**
   * Get all annotations for current page
   */
  async getPageAnnotations(): Promise<Annotation[]> {
    return getAnnotationsForUrl(window.location.href);
  }

  /**
   * Render highlight for a range
   */
  private renderHighlight(range: Range, annotation: Annotation): void {
    const elements = this.wrapRange(range, annotation);
    this.highlightElements.set(annotation.id, elements);
  }

  /**
   * Remove highlight elements
   */
  private removeHighlight(id: string): void {
    const elements = this.highlightElements.get(id);
    if (!elements) return;

    elements.forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;

      // Replace mark with its text content
      const textNode = document.createTextNode(el.textContent || '');
      parent.replaceChild(textNode, el);

      // Normalize to merge adjacent text nodes
      parent.normalize();
    });

    this.highlightElements.delete(id);
  }

  /**
   * Wrap a range with highlight marks
   * Handles cross-node selections by wrapping each text node segment
   */
  private wrapRange(range: Range, annotation: Annotation): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const colorConfig = getAnnotationColorConfig(annotation.color);

    // For simple single-node selection
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      const mark = this.createMark(annotation, colorConfig);
      range.surroundContents(mark);
      elements.push(mark);
      return elements;
    }

    // For cross-node selection, we need to handle each text node
    const textNodes = this.getTextNodesInRange(range);

    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      const nodeRange = document.createRange();

      if (i === 0) {
        // First node: from startOffset to end
        nodeRange.setStart(textNode, range.startOffset);
        nodeRange.setEnd(textNode, textNode.textContent?.length || 0);
      } else if (i === textNodes.length - 1) {
        // Last node: from start to endOffset
        nodeRange.setStart(textNode, 0);
        nodeRange.setEnd(textNode, range.endOffset);
      } else {
        // Middle nodes: wrap entirely
        nodeRange.selectNodeContents(textNode);
      }

      if (!nodeRange.collapsed) {
        const mark = this.createMark(annotation, colorConfig);
        try {
          nodeRange.surroundContents(mark);
          elements.push(mark);
        } catch {
          // surroundContents can fail for partial selections
          // Fall back to extracting and wrapping
          const fragment = nodeRange.extractContents();
          mark.appendChild(fragment);
          nodeRange.insertNode(mark);
          elements.push(mark);
        }
      }
    }

    return elements;
  }

  /**
   * Create a highlight mark element
   */
  private createMark(
    annotation: Annotation,
    colorConfig: { bg: string; border: string }
  ): HTMLElement {
    const mark = document.createElement('mark');
    mark.className = HIGHLIGHT_CLASS;
    mark.setAttribute(HIGHLIGHT_DATA_ATTR, annotation.id);
    mark.style.backgroundColor = colorConfig.bg;
    mark.style.borderBottom = `2px solid ${colorConfig.border}`;
    mark.style.padding = '0 2px';
    mark.style.borderRadius = '2px';
    mark.style.cursor = 'pointer';

    // Add click handler
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onHighlightClick?.(annotation, mark);
    });

    return mark;
  }

  /**
   * Get all text nodes within a range
   */
  private getTextNodesInRange(range: Range): Text[] {
    const textNodes: Text[] = [];
    const treeWalker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);

          // Check if node intersects with our range
          if (
            range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
          ) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    while (treeWalker.nextNode()) {
      textNodes.push(treeWalker.currentNode as Text);
    }

    return textNodes;
  }

  /**
   * Find annotation by ID in current elements
   */
  getAnnotationElement(id: string): HTMLElement | null {
    const elements = this.highlightElements.get(id);
    return elements?.[0] || null;
  }

  /**
   * Scroll to and briefly highlight an annotation
   */
  scrollToAnnotation(id: string): boolean {
    const element = this.getAnnotationElement(id);
    if (!element) return false;

    // Scroll into view with smooth animation
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add a brief pulse animation to draw attention
    const originalBoxShadow = element.style.boxShadow;
    element.style.transition = 'box-shadow 0.3s ease';
    element.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.5)';

    setTimeout(() => {
      element.style.boxShadow = originalBoxShadow;
    }, 1500);

    return true;
  }
}
