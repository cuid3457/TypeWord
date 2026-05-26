// Web variant of countryTranslations. The default i18n-iso-countries
// entry (entry-node.js) does a dynamic `require("./langs/" + locale + ".json")`
// loop that Metro's static analyzer can't bundle for web. The browser
// build of the same package (`index.js`) ships the static registry only,
// so we register locales explicitly here — same approach as the native
// file but bypassing the unresolvable Node entry.

/* eslint-disable @typescript-eslint/no-require-imports */
const countries = require('i18n-iso-countries/index');

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
  if (lang.startsWith('zh')) return 'zh';
  const dash = lang.indexOf('-');
  return dash > 0 ? lang.slice(0, dash) : lang;
}

export function getCountryNameFromLib(code: string, lang: string): string | undefined {
  const normalized = normalizeLangForLookup(lang);
  try {
    const name: string | undefined = countries.getName(code, normalized);
    return name;
  } catch {
    return undefined;
  }
}
