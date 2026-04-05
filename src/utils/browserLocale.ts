/**
 * 用于提示词：浏览器 / 扩展界面首选语言（BCP 47，如 zh-CN）。
 * 优先 chrome.i18n.getUILanguage()，其次 navigator.language。
 */
export function getBrowserPreferredLocale(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      return chrome.i18n.getUILanguage().replace(/_/g, '-');
    }
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}

/** 在英文 system prompt 中描述该 locale，便于模型理解默认输出语种 */
export function formatLocaleForPrompt(bcp47: string): string {
  const tag = bcp47.replace(/_/g, '-');
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    if (name) return `${name} (${tag})`;
  } catch {
    // ignore
  }
  return tag;
}
