// Annotation types for page highlighting and notes

export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export type AIResultType = 'translate' | 'explain' | 'summarize' | 'rewrite';

export interface AnnotationAIResult {
  type: AIResultType;
  content: string;
  thinking?: string;
  targetLanguage?: string;  // For translate
  createdAt: number;
}

export interface AnnotationPosition {
  xpath: string;          // XPath to the container node
  startOffset: number;    // Start offset within the text node
  endOffset: number;      // End offset within the text node
  textContent: string;    // The highlighted text (for text search fallback)
  textBefore: string;     // 50 characters before (for context matching)
  textAfter: string;      // 50 characters after (for context matching)
}

export interface Annotation {
  id: string;
  url: string;            // Normalized URL (without hash/query params for matching)
  pageTitle: string;

  // Position information for restoration
  position: AnnotationPosition;

  // Annotation content
  highlightText: string;  // The text that was highlighted
  note?: string;          // Optional user note
  color: AnnotationColor;

  // AI result (optional)
  aiResult?: AnnotationAIResult;

  // Metadata
  createdAt: number;
  updatedAt: number;
}

// Storage structure
export interface AnnotationStorage {
  annotations: Annotation[];
}

// Color configuration for UI
export const ANNOTATION_COLORS: Record<AnnotationColor, { bg: string; border: string; label: string }> = {
  yellow: { bg: 'rgba(250, 204, 21, 0.4)', border: 'rgba(250, 204, 21, 0.8)', label: '黄色' },
  green: { bg: 'rgba(34, 197, 94, 0.4)', border: 'rgba(34, 197, 94, 0.8)', label: '绿色' },
  blue: { bg: 'rgba(59, 130, 246, 0.4)', border: 'rgba(59, 130, 246, 0.8)', label: '蓝色' },
  pink: { bg: 'rgba(236, 72, 153, 0.4)', border: 'rgba(236, 72, 153, 0.8)', label: '粉色' },
  purple: { bg: 'rgba(168, 85, 247, 0.4)', border: 'rgba(168, 85, 247, 0.8)', label: '紫色' },
};
