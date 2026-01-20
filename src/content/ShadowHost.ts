// Shadow DOM host for style isolation
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let stylesLoaded = false;

// Get or create the shadow root
export function getShadowRoot(): ShadowRoot {
  if (!shadowRoot) {
    createShadowHost();
  }
  return shadowRoot!;
}

// Get the shadow host element
export function getShadowHost(): HTMLElement {
  if (!shadowHost) {
    createShadowHost();
  }
  return shadowHost!;
}

// Create the shadow host and root
function createShadowHost(): void {
  // Create host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'thecircle-shadow-host';
  shadowHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;

  document.body.appendChild(shadowHost);

  // Create shadow root
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Create a container for UI elements that needs pointer events
  const container = document.createElement('div');
  container.id = 'thecircle-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
  `;
  shadowRoot.appendChild(container);
}

// Load styles into shadow DOM
export function loadStyles(cssText: string): void {
  if (stylesLoaded || !shadowRoot) return;

  const style = document.createElement('style');
  style.textContent = cssText;
  shadowRoot.insertBefore(style, shadowRoot.firstChild);
  stylesLoaded = true;
}

// Create an element inside the shadow DOM
export function createShadowElement(tagName: string, className?: string): HTMLElement {
  const root = getShadowRoot();
  const container = root.getElementById('thecircle-container') || root;

  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  // Enable pointer events for this element
  element.style.pointerEvents = 'auto';
  container.appendChild(element);

  return element;
}

// Append element to shadow DOM container
export function appendToShadow(element: HTMLElement): void {
  const root = getShadowRoot();
  const container = root.getElementById('thecircle-container') || root;
  element.style.pointerEvents = 'auto';
  container.appendChild(element);
}

// Remove element from shadow DOM
export function removeFromShadow(element: HTMLElement): void {
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

// Clean up shadow DOM
export function destroyShadowHost(): void {
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
    stylesLoaded = false;
  }
}
