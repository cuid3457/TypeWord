import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en';
import { migrateNativeLang } from '@src/constants/languages';

function resolveDeviceLang(): string {
  const primary = getLocales()[0];
  if (!primary?.languageCode) return 'en';
  const code = primary.languageCode;
  // All Chinese variants (Simplified, Traditional, regional) collapse to
  // zh-CN for the interface. Traditional was removed from the language
  // picker, so providing a zh-TW interface would leave Taiwan/HK/Macau
  // users with an interface they can't manually re-select after switching.
  if (code === 'zh') return 'zh-CN';
  return migrateNativeLang(code);
}

export const deviceLang = resolveDeviceLang();

function loadLocale(code: string) {
  switch (code) {
    case 'ko': return require('./locales/ko').default;
    case 'ja': return require('./locales/ja').default;
    case 'zh':
    case 'zh-CN':
    case 'zh-TW': return require('./locales/zh-CN').default; // legacy zh-TW → zh-CN
    case 'es': return require('./locales/es').default;
    case 'fr': return require('./locales/fr').default;
    case 'de': return require('./locales/de').default;
    case 'it': return require('./locales/it').default;
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
