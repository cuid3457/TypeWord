import { getCountryNameFromLib } from './countryTranslations';

export interface Country {
  code: string;
  name: string;
  flag: string;
  timezone: string;
}

export const COUNTRIES: Country[] = [
  { code: 'AD', name: 'Andorra', flag: '🇦🇩', timezone: 'Europe/Andorra' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', timezone: 'Asia/Dubai' },
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', timezone: 'Asia/Kabul' },
  { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬', timezone: 'America/Antigua' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱', timezone: 'Europe/Tirane' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲', timezone: 'Asia/Yerevan' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴', timezone: 'Africa/Luanda' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', timezone: 'Europe/Vienna' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', timezone: 'Australia/Sydney' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', timezone: 'Asia/Baku' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', timezone: 'Europe/Sarajevo' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧', timezone: 'America/Barbados' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', timezone: 'Asia/Dhaka' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', timezone: 'Europe/Brussels' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', timezone: 'Africa/Ouagadougou' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', timezone: 'Europe/Sofia' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', timezone: 'Asia/Bahrain' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮', timezone: 'Africa/Bujumbura' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', timezone: 'Africa/Porto-Novo' },
  { code: 'BN', name: 'Brunei', flag: '🇧🇳', timezone: 'Asia/Brunei' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', timezone: 'America/La_Paz' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', timezone: 'America/Sao_Paulo' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸', timezone: 'America/Nassau' },
  { code: 'BT', name: 'Bhutan', flag: '🇧🇹', timezone: 'Asia/Thimphu' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼', timezone: 'Africa/Gaborone' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾', timezone: 'Europe/Minsk' },
  { code: 'BZ', name: 'Belize', flag: '🇧🇿', timezone: 'America/Belize' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', timezone: 'America/Toronto' },
  { code: 'CD', name: 'DR Congo', flag: '🇨🇩', timezone: 'Africa/Kinshasa' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', timezone: 'Africa/Bangui' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', timezone: 'Africa/Brazzaville' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', timezone: 'Europe/Zurich' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', timezone: 'Africa/Abidjan' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', timezone: 'America/Santiago' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', timezone: 'Africa/Douala' },
  { code: 'CN', name: 'China', flag: '🇨🇳', timezone: 'Asia/Shanghai' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', timezone: 'America/Bogota' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', timezone: 'America/Costa_Rica' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', timezone: 'America/Havana' },
  { code: 'CV', name: 'Cape Verde', flag: '🇨🇻', timezone: 'Atlantic/Cape_Verde' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾', timezone: 'Asia/Nicosia' },
  { code: 'CZ', name: 'Czechia', flag: '🇨🇿', timezone: 'Europe/Prague' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', timezone: 'Europe/Berlin' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', timezone: 'Africa/Djibouti' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', timezone: 'Europe/Copenhagen' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲', timezone: 'America/Dominica' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', timezone: 'America/Santo_Domingo' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', timezone: 'Africa/Algiers' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', timezone: 'America/Guayaquil' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', timezone: 'Europe/Tallinn' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', timezone: 'Africa/Cairo' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷', timezone: 'Africa/Asmara' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', timezone: 'Europe/Madrid' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', timezone: 'Africa/Addis_Ababa' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', timezone: 'Europe/Helsinki' },
  { code: 'FJ', name: 'Fiji', flag: '🇫🇯', timezone: 'Pacific/Fiji' },
  { code: 'FR', name: 'France', flag: '🇫🇷', timezone: 'Europe/Paris' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', timezone: 'Africa/Libreville' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', timezone: 'Europe/London' },
  { code: 'GD', name: 'Grenada', flag: '🇬🇩', timezone: 'America/Grenada' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪', timezone: 'Asia/Tbilisi' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', timezone: 'Africa/Accra' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲', timezone: 'Africa/Banjul' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', timezone: 'Africa/Conakry' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', timezone: 'Africa/Malabo' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', timezone: 'Europe/Athens' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', timezone: 'America/Guatemala' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', timezone: 'Africa/Bissau' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾', timezone: 'America/Guyana' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', timezone: 'Asia/Hong_Kong' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳', timezone: 'America/Tegucigalpa' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷', timezone: 'Europe/Zagreb' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹', timezone: 'America/Port-au-Prince' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺', timezone: 'Europe/Budapest' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', timezone: 'Asia/Jakarta' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', timezone: 'Europe/Dublin' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', timezone: 'Asia/Jerusalem' },
  { code: 'IN', name: 'India', flag: '🇮🇳', timezone: 'Asia/Kolkata' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶', timezone: 'Asia/Baghdad' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷', timezone: 'Asia/Tehran' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸', timezone: 'Atlantic/Reykjavik' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', timezone: 'Europe/Rome' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', timezone: 'America/Jamaica' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴', timezone: 'Asia/Amman' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', timezone: 'Asia/Tokyo' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', timezone: 'Africa/Nairobi' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', timezone: 'Asia/Bishkek' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭', timezone: 'Asia/Phnom_Penh' },
  { code: 'KP', name: 'North Korea', flag: '🇰🇵', timezone: 'Asia/Pyongyang' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', timezone: 'Asia/Seoul' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', timezone: 'Asia/Kuwait' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', timezone: 'Asia/Almaty' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦', timezone: 'Asia/Vientiane' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧', timezone: 'Asia/Beirut' },
  { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', timezone: 'America/St_Lucia' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', timezone: 'Europe/Vaduz' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', timezone: 'Asia/Colombo' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷', timezone: 'Africa/Monrovia' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸', timezone: 'Africa/Maseru' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹', timezone: 'Europe/Vilnius' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', timezone: 'Europe/Luxembourg' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻', timezone: 'Europe/Riga' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾', timezone: 'Africa/Tripoli' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', timezone: 'Africa/Casablanca' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', timezone: 'Europe/Monaco' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩', timezone: 'Europe/Chisinau' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪', timezone: 'Europe/Podgorica' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬', timezone: 'Indian/Antananarivo' },
  { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', timezone: 'Europe/Skopje' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', timezone: 'Africa/Bamako' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲', timezone: 'Asia/Yangon' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳', timezone: 'Asia/Ulaanbaatar' },
  { code: 'MO', name: 'Macao', flag: '🇲🇴', timezone: 'Asia/Macau' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷', timezone: 'Africa/Nouakchott' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', timezone: 'Europe/Malta' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺', timezone: 'Indian/Mauritius' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻', timezone: 'Indian/Maldives' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼', timezone: 'Africa/Blantyre' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', timezone: 'America/Mexico_City' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', timezone: 'Africa/Maputo' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦', timezone: 'Africa/Windhoek' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', timezone: 'Africa/Niamey' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', timezone: 'Africa/Lagos' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', timezone: 'America/Managua' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', timezone: 'Europe/Amsterdam' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', timezone: 'Europe/Oslo' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', timezone: 'Asia/Kathmandu' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', timezone: 'Pacific/Auckland' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', timezone: 'Asia/Muscat' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦', timezone: 'America/Panama' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', timezone: 'America/Lima' },
  { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', timezone: 'Pacific/Port_Moresby' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', timezone: 'Asia/Manila' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', timezone: 'Asia/Karachi' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', timezone: 'Europe/Warsaw' },
  { code: 'PS', name: 'Palestine', flag: '🇵🇸', timezone: 'Asia/Gaza' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', timezone: 'Europe/Lisbon' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', timezone: 'America/Asuncion' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', timezone: 'Asia/Qatar' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', timezone: 'Europe/Bucharest' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', timezone: 'Europe/Belgrade' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', timezone: 'Europe/Moscow' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', timezone: 'Africa/Kigali' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', timezone: 'Asia/Riyadh' },
  { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', timezone: 'Pacific/Guadalcanal' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨', timezone: 'Indian/Mahe' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩', timezone: 'Africa/Khartoum' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', timezone: 'Europe/Stockholm' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', timezone: 'Asia/Singapore' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', timezone: 'Europe/Ljubljana' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰', timezone: 'Europe/Bratislava' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', timezone: 'Africa/Freetown' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', timezone: 'Africa/Dakar' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴', timezone: 'Africa/Mogadishu' },
  { code: 'SR', name: 'Suriname', flag: '🇸🇷', timezone: 'America/Paramaribo' },
  { code: 'SS', name: 'South Sudan', flag: '🇸🇸', timezone: 'Africa/Juba' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻', timezone: 'America/El_Salvador' },
  { code: 'SY', name: 'Syria', flag: '🇸🇾', timezone: 'Asia/Damascus' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', timezone: 'Africa/Mbabane' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩', timezone: 'Africa/Ndjamena' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', timezone: 'Africa/Lome' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', timezone: 'Asia/Bangkok' },
  { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', timezone: 'Asia/Dushanbe' },
  { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', timezone: 'Asia/Ashgabat' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', timezone: 'Africa/Tunis' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', timezone: 'Europe/Istanbul' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', timezone: 'America/Port_of_Spain' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', timezone: 'Asia/Taipei' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', timezone: 'Africa/Dar_es_Salaam' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', timezone: 'Europe/Kyiv' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', timezone: 'Africa/Kampala' },
  { code: 'US', name: 'United States', flag: '🇺🇸', timezone: 'America/New_York' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', timezone: 'America/Montevideo' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', timezone: 'Asia/Tashkent' },
  { code: 'VA', name: 'Vatican City', flag: '🇻🇦', timezone: 'Europe/Vatican' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪', timezone: 'America/Caracas' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', timezone: 'Asia/Ho_Chi_Minh' },
  { code: 'XK', name: 'Kosovo', flag: '🇽🇰', timezone: 'Europe/Belgrade' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪', timezone: 'Asia/Aden' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', timezone: 'Africa/Johannesburg' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', timezone: 'Africa/Lusaka' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', timezone: 'Africa/Harare' },
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function findCountry(code: string | null | undefined): Country | undefined {
  return code ? COUNTRY_BY_CODE.get(code) : undefined;
}

const TZ_TO_COUNTRY = new Map<string, Country>();
for (const c of COUNTRIES) {
  if (!TZ_TO_COUNTRY.has(c.timezone)) TZ_TO_COUNTRY.set(c.timezone, c);
}

export function guessCountryFromTimezone(tz: string | null | undefined): Country | undefined {
  return tz ? TZ_TO_COUNTRY.get(tz) : undefined;
}

/**
 * Cache of Intl.DisplayNames instances per language. Creating a new instance per
 * call is expensive (~10ms × 170 countries = noticeable lag on route transitions).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DN_CACHE = new Map<string, any>();
// `null` in cache = tried and unsupported (Hermes older than RN 0.73 / some runtimes).
function getDisplayNames(lang: string): { of: (code: string) => string | undefined } | null {
  if (DN_CACHE.has(lang)) return DN_CACHE.get(lang);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DN = (Intl as any).DisplayNames;
    if (!DN) {
      DN_CACHE.set(lang, null);
      return null;
    }
    const inst = new DN([lang], { type: 'region' });
    DN_CACHE.set(lang, inst);
    return inst;
  } catch {
    DN_CACHE.set(lang, null);
    return null;
  }
}

/**
 * Resolve a country's display name in the given language.
 * Lookup order:
 *   1. Explicit i18n translation (t('countries.XX')) — curated official names per locale.
 *   2. `i18n-iso-countries` bundled translations — reliable, works without Hermes Intl.
 *   3. Intl.DisplayNames — runtime CLDR translation (may be unavailable on Hermes).
 *   4. English fallback name from COUNTRIES.
 */
export function localizedCountryName(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  code: string,
  lang: string,
  fallback: string,
): string {
  const key = `countries.${code}`;
  const translated = t(key, { defaultValue: '' });
  if (translated && translated !== key) return translated;

  const libName = getCountryNameFromLib(code, lang);
  if (libName) return libName;

  const dn = getDisplayNames(lang);
  if (dn) {
    try {
      const name = dn.of(code);
      if (name) return name;
    } catch {
      // Intl.DisplayNames threw at call time — fall through.
    }
  }

  return fallback;
}

export interface EnrichedCountry extends Country {
  displayName: string;
}

/**
 * Module-level cache for the translated + alphabetically sorted country list,
 * keyed by locale. Avoids redoing the 170+ translate + localeCompare sort every
 * time the country picker mounts.
 */
const SORTED_CACHE = new Map<string, EnrichedCountry[]>();

export function getSortedCountries(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  lang: string,
): EnrichedCountry[] {
  const cached = SORTED_CACHE.get(lang);
  if (cached) return cached;
  const enriched: EnrichedCountry[] = COUNTRIES.map((c) => ({
    ...c,
    displayName: localizedCountryName(t, c.code, lang, c.name),
  }));
  enriched.sort((a, b) => a.displayName.localeCompare(b.displayName, lang));
  SORTED_CACHE.set(lang, enriched);
  return enriched;
}
