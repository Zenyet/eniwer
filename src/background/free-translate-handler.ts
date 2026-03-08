// Translation handler supporting multiple providers

import { TranslationProvider } from '../types';
import { t } from '../i18n';

interface TranslateResult {
  success: boolean;
  result?: string;
  provider?: string;
  error?: string;
}

// Language code mapping
const LANG_CODE_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'ru': 'ru',
  'pt': 'pt',
  'it': 'it',
  'ar': 'ar',
  'hi': 'hi',
  'th': 'th',
  'vi': 'vi',
};

// Microsoft Translator language code mapping
const MS_LANG_CODE_MAP: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'ru': 'ru',
  'pt': 'pt',
  'it': 'it',
  'ar': 'ar',
  'hi': 'hi',
  'th': 'th',
  'vi': 'vi',
};

/**
 * Translate using the specified provider
 */
export async function freeTranslate(
  text: string,
  targetLang: string,
  sourceLang?: string,
  provider?: TranslationProvider,
  customUrlOrKey?: string
): Promise<TranslateResult> {
  const p = provider || 'google';

  switch (p) {
    case 'google':
      return googleTranslate(text, targetLang, sourceLang);
    case 'microsoft':
      return microsoftTranslate(text, targetLang, sourceLang);
    case 'deeplx':
      return deeplxTranslate(text, targetLang, sourceLang, customUrlOrKey);
    case 'custom':
      if (!customUrlOrKey) {
        return { success: false, error: t('translate.customUrlNotConfigured') };
      }
      return customTranslate(text, targetLang, sourceLang, customUrlOrKey);
    default:
      return googleTranslate(text, targetLang, sourceLang);
  }
}

/**
 * Google Translate (unofficial API)
 */
async function googleTranslate(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResult> {
  const tl = LANG_CODE_MAP[targetLang] || targetLang;
  const sl = sourceLang === 'auto' ? 'auto' : (LANG_CODE_MAP[sourceLang] || sourceLang);

  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sl);
  url.searchParams.set('tl', tl);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { success: false, error: t('translate.rateLimited') };
      }
      return { success: false, error: t('translate.serviceError', { status: String(response.status) }) };
    }

    const data = await response.json();

    if (Array.isArray(data) && Array.isArray(data[0])) {
      let translatedText = '';
      for (const item of data[0]) {
        if (Array.isArray(item) && item[0]) {
          translatedText += item[0];
        }
      }
      if (translatedText) {
        return { success: true, result: translatedText, provider: 'google' };
      }
    }

    return { success: false, error: t('translate.cannotParseResult') };
  } catch (error) {
    return { success: false, error: t('translate.googleFailed', { error: String(error) }) };
  }
}

/**
 * Microsoft Translator (unofficial API via Bing)
 */
async function microsoftTranslate(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResult> {
  const tl = MS_LANG_CODE_MAP[targetLang] || targetLang;
  const sl = sourceLang === 'auto' ? '' : (MS_LANG_CODE_MAP[sourceLang] || sourceLang);

  try {
    const url = 'https://api-edge.cognitive.microsofttranslator.com/translate' +
      `?to=${tl}${sl ? `&from=${sl}` : ''}&api-version=3.0`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify([{ Text: text }]),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { success: false, error: t('translate.rateLimited') };
      }
      return { success: false, error: t('translate.microsoftError', { status: String(response.status) }) };
    }

    const data = await response.json();

    if (Array.isArray(data) && data[0]?.translations?.[0]?.text) {
      return {
        success: true,
        result: data[0].translations[0].text,
        provider: 'microsoft',
      };
    }

    return { success: false, error: t('translate.cannotParseResult') };
  } catch (error) {
    return { success: false, error: t('translate.microsoftFailed', { error: String(error) }) };
  }
}

/**
 * DeepLX translation
 * API format: https://api.deeplx.org/<api-key>/translate
 */
async function deeplxTranslate(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
  apiKey?: string
): Promise<TranslateResult> {
  if (!apiKey) {
    return { success: false, error: t('translate.configureDeeplxApiKey') };
  }

  // DeepL language codes
  const langMap: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'zh',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'ru': 'ru',
    'pt': 'pt',
    'it': 'it',
  };

  const tl = langMap[targetLang] || targetLang.toLowerCase();
  const sl = sourceLang === 'auto' ? 'auto' : (langMap[sourceLang] || sourceLang.toLowerCase());

  try {
    const response = await fetch(`https://api.deeplx.org/${apiKey}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_lang: sl,
        target_lang: tl,
      }),
    });

    if (!response.ok) {
      return { success: false, error: t('translate.deeplxError', { status: String(response.status) }) };
    }

    const data = await response.json();

    if (data.data) {
      return { success: true, result: data.data, provider: 'deeplx' };
    }

    return { success: false, error: data.message || t('translate.cannotParseResult') };
  } catch (error) {
    return { success: false, error: t('translate.deeplxFailed', { error: String(error) }) };
  }
}

/**
 * Custom translation endpoint
 * Expects the endpoint to accept POST with JSON body: { text, source_lang, target_lang }
 * And return JSON with: { data: "translated text" } or { result: "translated text" }
 */
async function customTranslate(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
  customUrl: string
): Promise<TranslateResult> {
  try {
    const response = await fetch(customUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
    });

    if (!response.ok) {
      return { success: false, error: t('translate.customError', { status: String(response.status) }) };
    }

    const data = await response.json();
    const result = data.data || data.result || data.text || data.translation;

    if (result) {
      return { success: true, result, provider: 'custom' };
    }

    return { success: false, error: t('translate.cannotParseResult') };
  } catch (error) {
    return { success: false, error: t('translate.customFailed', { error: String(error) }) };
  }
}

/**
 * Check if free translation should be used based on config
 */
export function shouldUseFreeTranslate(
  apiProvider: string,
  apiKey: string | undefined,
  fallbackEnabled: boolean | undefined
): boolean {
  if (fallbackEnabled === false) {
    return false;
  }
  if (!apiKey) {
    return true;
  }
  return fallbackEnabled === true;
}
