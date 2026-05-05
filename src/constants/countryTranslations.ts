// Bundled country-name translations from `i18n-iso-countries`. Provides
// reliable translations for all supported UI locales without depending on
// Hermes's (sometimes spotty) Intl.DisplayNames implementation.
//
// Metro's static analyzer can't resolve dynamic require paths, so each
// locale pack must be imported with a literal string.

/* eslint-disable @typescript-eslint/no-require-imports */
const countries = require('i18n-iso-countries');

countries.registerLocale(require('i18n-iso-countries/langs/en.json'));
countries.registerLocale(require('i18n-iso-countries/langs/ko.json'));
countries.registerLocale(require('i18n-iso-countries/langs/ja.json'));
countries.registerLocale(require('i18n-iso-countries/langs/zh.json'));
countries.registerLocale(require('i18n-iso-countries/langs/es.json'));
countries.registerLocale(require('i18n-iso-countries/langs/fr.json'));
countries.registerLocale(require('i18n-iso-countries/langs/de.json'));
countries.registerLocale(require('i18n-iso-countries/langs/it.json'));
countries.registerLocale(require('i18n-iso-countries/langs/pt.json'));
countries.registerLocale(require('i18n-iso-countries/langs/ru.json'));
countries.registerLocale(require('i18n-iso-countries/langs/vi.json'));
countries.registerLocale(require('i18n-iso-countries/langs/id.json'));
countries.registerLocale(require('i18n-iso-countries/langs/th.json'));
countries.registerLocale(require('i18n-iso-countries/langs/ar.json'));
countries.registerLocale(require('i18n-iso-countries/langs/hi.json'));
countries.registerLocale(require('i18n-iso-countries/langs/tr.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

function normalizeLangForLookup(lang: string): string {
  // zh-CN → zh, zh-TW → zh (package has no separate TW)
  if (lang.startsWith('zh')) return 'zh';
  // Use only the primary subtag for anything else (e.g. en-US → en)
  const dash = lang.indexOf('-');
  return dash > 0 ? lang.slice(0, dash) : lang;
}

export function getCountryNameFromLib(code: string, lang: string): string | undefined {
  const normalized = normalizeLangForLookup(lang);
  try {
    const name: string | undefined = countries.getName(code, normalized);
    return name && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}
