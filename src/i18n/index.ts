import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

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

// Web SSG concern: expo-localization's getLocales() returns the build
// machine's locale at static-export time (CF Pages = 'en') but the
// browser's locale at runtime ('ko' for KR users, etc.). If i18n boots
// in the browser's locale on first client render, every translated
// <Text> renders different content than the English SSG HTML → React
// #418 hydration mismatch on every page load.
//
// Fix: on web, boot i18n in English to match the SSG HTML. The root
// layout's existing useEffect (settings load) then swaps to the user's
// actual locale via i18n.changeLanguage *after* hydration completes.
// Brief English flash on first paint is the trade-off for clean
// hydration. Native (iOS/Android) has no SSG so it keeps booting in
// the device's locale directly.
const initLng = Platform.OS === 'web' ? 'en' : deviceLang;

const resources: Record<string, { translation: any }> = {
  en: { translation: en },
};

if (initLng !== 'en') {
  resources[initLng] = { translation: loadLocale(initLng) };
}

i18n.use(initReactI18next).init({
  resources,
  lng: initLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function ensureLanguageLoaded(code: string) {
  if (i18n.hasResourceBundle(code, 'translation')) return;
  i18n.addResourceBundle(code, 'translation', loadLocale(code));
}

export default i18n;
