import { zhCN } from './locales/zh-CN';
import { en } from './locales/en';

type LocaleMessages = Record<string, string>;

const locales: Record<string, LocaleMessages> = {
  'zh-CN': zhCN,
  'en': en,
};

let currentLocale = 'zh-CN';

/**
 * Get translated text by key, with optional parameter interpolation.
 * Fallback chain: currentLocale -> zh-CN -> raw key
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = locales[currentLocale]?.[key]
    ?? locales['zh-CN']?.[key]
    ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}

/**
 * Set the current locale and persist to chrome.storage
 */
export function setLocale(lang: string): void {
  if (locales[lang]) {
    currentLocale = lang;
  }
}

/**
 * Get the current locale
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Detect locale from browser language.
 * Maps browser language to a supported locale, defaults to 'en'.
 */
function detectLocale(): string {
  try {
    const browserLang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.())
      || navigator.language
      || 'en';
    if (browserLang.startsWith('zh')) return 'zh-CN';
    return 'en';
  } catch {
    return 'en';
  }
}

/**
 * Initialize i18n by reading uiLanguage from chrome.storage.
 * If not set, auto-detect from browser language.
 * Call this at app startup (content script, popup, background).
 */
export async function initI18n(lang?: string): Promise<void> {
  if (lang) {
    setLocale(lang);
    return;
  }
  try {
    const result = await chrome.storage.local.get('thecircle_data');
    const data = result.thecircle_data;
    if (data?.config?.uiLanguage) {
      setLocale(data.config.uiLanguage);
    } else {
      setLocale(detectLocale());
    }
  } catch {
    setLocale(detectLocale());
  }
}
