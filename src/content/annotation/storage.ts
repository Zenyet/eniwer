// Storage operations for annotations using chrome.storage.local

import { Annotation, AnnotationStorage, AnnotationAIResult } from '../../types/annotation';

const ANNOTATION_STORAGE_KEY = 'thecircle_annotations';

/**
 * Get all annotations from storage
 */
export async function getAllAnnotations(): Promise<Annotation[]> {
  const result = await chrome.storage.local.get(ANNOTATION_STORAGE_KEY);
  const data = result[ANNOTATION_STORAGE_KEY] as AnnotationStorage | undefined;
  return data?.annotations || [];
}

/**
 * Get annotations for a specific URL
 */
export async function getAnnotationsForUrl(url: string): Promise<Annotation[]> {
  const normalizedUrl = normalizeUrl(url);
  const annotations = await getAllAnnotations();
  return annotations.filter(a => a.url === normalizedUrl);
}

/**
 * Save a new annotation
 */
export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const annotations = await getAllAnnotations();
  annotations.push(annotation);
  await chrome.storage.local.set({
    [ANNOTATION_STORAGE_KEY]: { annotations } as AnnotationStorage,
  });
}

/**
 * Update an existing annotation
 */
export async function updateAnnotation(
  id: string,
  updates: Partial<Pick<Annotation, 'note' | 'color' | 'aiResult'>>
): Promise<Annotation | null> {
  const annotations = await getAllAnnotations();
  const index = annotations.findIndex(a => a.id === id);

  if (index === -1) return null;

  annotations[index] = {
    ...annotations[index],
    ...updates,
    updatedAt: Date.now(),
  };

  await chrome.storage.local.set({
    [ANNOTATION_STORAGE_KEY]: { annotations } as AnnotationStorage,
  });

  return annotations[index];
}

/**
 * Delete an annotation by ID
 */
export async function deleteAnnotation(id: string): Promise<boolean> {
  const annotations = await getAllAnnotations();
  const index = annotations.findIndex(a => a.id === id);

  if (index === -1) return false;

  annotations.splice(index, 1);
  await chrome.storage.local.set({
    [ANNOTATION_STORAGE_KEY]: { annotations } as AnnotationStorage,
  });

  return true;
}

/**
 * Get a single annotation by ID
 */
export async function getAnnotation(id: string): Promise<Annotation | null> {
  const annotations = await getAllAnnotations();
  return annotations.find(a => a.id === id) || null;
}

/**
 * Normalize URL for consistent matching
 * Removes hash and query params, keeps path
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep origin and pathname, remove hash and search
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Generate a unique ID for annotations
 */
export function generateAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
