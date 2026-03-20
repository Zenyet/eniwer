/**
 * Extract clean, meaningful text content from a webpage.
 * Uses TreeWalker to traverse the live DOM without cloning,
 * skipping noise elements and collecting visible text only.
 */

/** Tags whose entire subtree should be skipped */
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
  'NAV', 'FOOTER', 'HEADER', 'ASIDE',
]);

/** Roles to skip */
const SKIP_ROLES = new Set([
  'banner', 'navigation', 'contentinfo',
]);

/** Class substrings that indicate noise */
const NOISE_CLASS_PATTERNS = [
  'cookie-banner', 'cookie-consent',
  'advertisement',
  'sidebar',
  'popup', 'modal',
];

/**
 * Check if an element should be skipped (noise).
 */
function isNoiseElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;

  const role = el.getAttribute('role');
  if (role && SKIP_ROLES.has(role)) return true;

  const cls = el.className;
  if (typeof cls === 'string' && cls) {
    const lc = cls.toLowerCase();
    for (const pattern of NOISE_CLASS_PATTERNS) {
      if (lc.includes(pattern)) return true;
    }
  }

  return false;
}

/**
 * Try to locate the main content container.
 * Uses textContent.length (no reflow) for a quick size check.
 */
function getMainContentRoot(): HTMLElement {
  const candidates = [
    'article',
    'main',
    '[role="main"]',
    '#content',
    '#main-content',
    '.main-content',
    '.post-content',
    '.article-content',
    '.entry-content',
  ];

  for (const selector of candidates) {
    const el = document.querySelector<HTMLElement>(selector);
    // Use textContent (no reflow) for quick length check
    if (el && (el.textContent?.length ?? 0) > 200) {
      return el;
    }
  }

  return document.body;
}

/**
 * Extract clean page text via TreeWalker — no DOM cloning, no reflow.
 * @param maxLength Maximum character length of the returned text (default 10000)
 */
export function extractPageContent(maxLength = 10000): string {
  const root = getMainContentRoot();
  const chunks: string[] = [];
  let totalLen = 0;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isNoiseElement(node as Element)) {
            return NodeFilter.FILTER_REJECT; // skip entire subtree
          }
          return NodeFilter.FILTER_SKIP; // process children
        }
        // Text node — accept if non-empty
        const text = node.textContent;
        if (!text || !text.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  // Collect text with early exit once we have enough
  const overflowBuffer = 500; // collect a bit extra for clean truncation
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (!text) continue;
    chunks.push(text);
    totalLen += text.length + 1; // +1 for space/newline
    if (totalLen > maxLength + overflowBuffer) break;
  }

  // Join and compress whitespace
  let result = chunks.join('\n');

  // Collapse 3+ consecutive newlines into 2
  result = result.replace(/\n{3,}/g, '\n\n');
  // Collapse runs of spaces/tabs into single space
  result = result.replace(/[^\S\n]+/g, ' ');
  // Remove empty lines
  result = result.replace(/\n\s*\n/g, '\n\n');

  return result.slice(0, maxLength).trimEnd();
}
