import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en';

export const deviceLang = getLocales()[0]?.languageCode ?? 'en';

function loadLocale(code: string) {
  switch (code) {
    case 'ko': return require('./locales/ko').default;
    case 'ja': return require('./locales/ja').default;
    case 'zh': return require('./locales/zh').default;
    case 'es': return require('./locales/es').default;
    case 'fr': return require('./locales/fr').default;
    case 'de': return require('./locales/de').default;
    case 'it': return require('./locales/it').default;
    case 'pt': return require('./locales/pt').default;
    case 'ru': return require('./locales/ru').default;
    case 'vi': return require('./locales/vi').default;
    case 'id': return require('./locales/id').default;
    case 'th': return require('./locales/th').default;
    case 'ar': return require('./locales/ar').default;
    case 'hi': return require('./locales/hi').default;
    case 'tr': return require('./locales/tr').default;
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
