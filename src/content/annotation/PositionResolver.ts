// Position resolver for annotation text location
// Uses XPath for primary location, with text search fallback

import { AnnotationPosition } from '../../types/annotation';

const CONTEXT_LENGTH = 50; // Characters to capture before/after

export class PositionResolver {
  /**
   * Create a position from the current selection
   */
  static fromSelection(selection: Selection): AnnotationPosition | null {
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return null;

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    // We need text nodes for accurate positioning
    if (startContainer.nodeType !== Node.TEXT_NODE) return null;

    const xpath = this.getXPath(startContainer);
    if (!xpath) return null;

    const textContent = selection.toString();
    const { textBefore, textAfter } = this.getTextContext(range);

    return {
      xpath,
      startOffset: range.startOffset,
      endOffset: startContainer === endContainer ? range.endOffset : (startContainer.textContent?.length || 0),
      textContent,
      textBefore,
      textAfter,
    };
  }

  /**
   * Restore a Range from a saved position
   * Tries XPath first, falls back to text search
   */
  static toRange(position: AnnotationPosition): Range | null {
    // Try XPath resolution first
    const xpathRange = this.resolveByXPath(position);
    if (xpathRange) return xpathRange;

    // Fall back to text search
    return this.resolveByTextSearch(position);
  }

  /**
   * Generate XPath for a node
   */
  private static getXPath(node: Node): string {
    const parts: string[] = [];
    let current: Node | null = node;

    while (current && current !== document.body) {
      if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentNode;
        if (parent) {
          const textNodes = Array.from(parent.childNodes).filter(
            n => n.nodeType === Node.TEXT_NODE
          );
          const index = textNodes.indexOf(current as ChildNode) + 1;
          parts.unshift(`text()[${index}]`);
          current = parent;
          continue;
        }
      }

      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element;
        const tagName = element.tagName.toLowerCase();

        // Use id if available for more stable path
        if (element.id) {
          parts.unshift(`//*[@id="${element.id}"]`);
          break;
        }

        // Otherwise use tag with index
        const parent = element.parentNode;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            el => el.tagName.toLowerCase() === tagName
          );
          const index = siblings.indexOf(element) + 1;
          parts.unshift(`${tagName}[${index}]`);
        }
      }

      current = current.parentNode;
    }

    if (parts.length === 0) return '';

    // If first part is an id selector, use it directly
    if (parts[0].startsWith('//*[@id=')) {
      return parts.join('/');
    }

    return '//' + parts.join('/');
  }

  /**
   * Get text context around the selection
   */
  private static getTextContext(range: Range): { textBefore: string; textAfter: string } {
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || '';

    // For simple text node selections
    if (container.nodeType === Node.TEXT_NODE) {
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      const textBefore = fullText.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset);
      const textAfter = fullText.slice(endOffset, endOffset + CONTEXT_LENGTH);

      return { textBefore, textAfter };
    }

    // For element containers, get surrounding text
    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let beforeText = '';
    let afterText = '';
    let foundStart = false;
    let foundEnd = false;

    while (treeWalker.nextNode()) {
      const textNode = treeWalker.currentNode;

      if (textNode === range.startContainer) {
        foundStart = true;
        const prefix = textNode.textContent?.slice(0, range.startOffset) || '';
        beforeText = (beforeText + prefix).slice(-CONTEXT_LENGTH);
      } else if (!foundStart) {
        beforeText = (beforeText + (textNode.textContent || '')).slice(-CONTEXT_LENGTH);
      }

      if (textNode === range.endContainer) {
        foundEnd = true;
        afterText = textNode.textContent?.slice(range.endOffset) || '';
      } else if (foundEnd && afterText.length < CONTEXT_LENGTH) {
        afterText += textNode.textContent || '';
      }

      if (foundEnd && afterText.length >= CONTEXT_LENGTH) break;
    }

    return {
      textBefore: beforeText.slice(-CONTEXT_LENGTH),
      textAfter: afterText.slice(0, CONTEXT_LENGTH),
    };
  }

  /**
   * Resolve position by XPath
   */
  private static resolveByXPath(position: AnnotationPosition): Range | null {
    try {
      const result = document.evaluate(
        position.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );

      const node = result.singleNodeValue;
      if (!node) return null;

      // Verify the text matches
      const textContent = node.textContent || '';
      if (!textContent.includes(position.textContent)) {
        return null;
      }

      const range = document.createRange();

      // If it's a text node, use offsets directly
      if (node.nodeType === Node.TEXT_NODE) {
        const startOffset = Math.min(position.startOffset, textContent.length);
        const endOffset = Math.min(position.endOffset, textContent.length);

        // Verify the text at these offsets
        const extractedText = textContent.slice(startOffset, endOffset);
        if (extractedText !== position.textContent) {
          // Offsets don't match, try to find the text within
          const textIndex = textContent.indexOf(position.textContent);
          if (textIndex !== -1) {
            range.setStart(node, textIndex);
            range.setEnd(node, textIndex + position.textContent.length);
            return range;
          }
          return null;
        }

        range.setStart(node, startOffset);
        range.setEnd(node, endOffset);
        return range;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve position by searching for the text with context
   */
  private static resolveByTextSearch(position: AnnotationPosition): Range | null {
    const searchPattern = position.textBefore + position.textContent + position.textAfter;
    const bodyText = document.body.innerText;

    // Find the pattern in the page text
    const patternIndex = bodyText.indexOf(searchPattern);
    if (patternIndex === -1) {
      // Try with just the text content
      return this.findTextInDocument(position.textContent);
    }

    // Calculate the actual text position
    const textStartIndex = patternIndex + position.textBefore.length;

    // Now find this position in the DOM
    return this.findTextAtIndex(textStartIndex, position.textContent.length);
  }

  /**
   * Find text anywhere in the document
   */
  private static findTextInDocument(text: string): Range | null {
    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    while (treeWalker.nextNode()) {
      const textNode = treeWalker.currentNode;
      const content = textNode.textContent || '';
      const index = content.indexOf(text);

      if (index !== -1) {
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + text.length);
        return range;
      }
    }

    return null;
  }

  /**
   * Find text at a specific character index in the document
   */
  private static findTextAtIndex(targetIndex: number, length: number): Range | null {
    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentIndex = 0;

    while (treeWalker.nextNode()) {
      const textNode = treeWalker.currentNode;
      const content = textNode.textContent || '';
      const nodeLength = content.length;

      if (currentIndex + nodeLength > targetIndex) {
        const startOffset = targetIndex - currentIndex;
        const endOffset = Math.min(startOffset + length, nodeLength);

        const range = document.createRange();
        range.setStart(textNode, startOffset);

        // Handle cross-node selection
        if (startOffset + length <= nodeLength) {
          range.setEnd(textNode, endOffset);
        } else {
          // Need to extend to next nodes
          let remaining = length - (nodeLength - startOffset);
          let endNode = textNode;
          let endNodeOffset = nodeLength;

          while (remaining > 0 && treeWalker.nextNode()) {
            endNode = treeWalker.currentNode;
            const endContent = endNode.textContent || '';
            if (remaining <= endContent.length) {
              endNodeOffset = remaining;
              remaining = 0;
            } else {
              remaining -= endContent.length;
            }
          }

          range.setEnd(endNode, endNodeOffset);
        }

        return range;
      }

      currentIndex += nodeLength;
    }

    return null;
  }
}
