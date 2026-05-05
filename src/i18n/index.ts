import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en';
import { migrateNativeLang } from '@src/constants/languages';

function resolveDeviceLang(): string {
  const primary = getLocales()[0];
  if (!primary?.languageCode) return 'en';
  const code = primary.languageCode;
  if (code !== 'zh') return migrateNativeLang(code);
  // Chinese: disambiguate Simplified vs Traditional from tag/region.
  const tag = primary.languageTag ?? '';
  const region = primary.regionCode ?? '';
  if (tag.includes('Hant') || ['TW', 'HK', 'MO'].includes(region)) return 'zh-TW';
  return 'zh-CN';
}

export const deviceLang = resolveDeviceLang();

function loadLocale(code: string) {
  switch (code) {
    case 'ko': return require('./locales/ko').default;
    case 'ja': return require('./locales/ja').default;
    case 'zh':
    case 'zh-CN': return require('./locales/zh-CN').default;
    case 'zh-TW': return require('./locales/zh-TW').default;
    case 'es': return require('./locales/es').default;
    case 'fr': return require('./locales/fr').default;
    case 'de': return require('./locales/de').default;
    case 'it': return require('./locales/it').default;
    case 'pt': return require('./locales/pt').default;
    case 'ru': return require('./locales/ru').default;
    default: return en;
  }
}

const resources: Record<string, { translation: any }> = {
  en: { translation: en },
};

if (deviceLang !== 'en') {
  resources[deviceLang] = { translation: loadLocale(deviceLang) };
}

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function ensureLanguageLoaded(code: string) {
  if (i18n.hasResourceBundle(code, 'translation')) return;
  i18n.addResourceBundle(code, 'translation', loadLocale(code));
}

export default i18n;
