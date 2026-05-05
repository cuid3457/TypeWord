import { LANGUAGES, STUDY_LANGUAGES, isStudyLang, findLanguage, migrateNativeLang } from '../languages';

describe('LANGUAGES', () => {
  it('has 11 supported languages', () => {
    expect(LANGUAGES).toHaveLength(11);
  });

  it('each language has required fields', () => {
    for (const lang of LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
      expect(lang.flag).toBeTruthy();
    }
  });

  it('has no duplicate codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('STUDY_LANGUAGES', () => {
  it('includes en, ko, ja, zh-CN, zh-TW, es, fr, de, it, pt, ru', () => {
    const codes = STUDY_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ko');
    expect(codes).toContain('ja');
    expect(codes).toContain('zh-CN');
    expect(codes).toContain('zh-TW');
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('it');
    expect(codes).toContain('pt');
    expect(codes).toContain('ru');
  });
});

describe('isStudyLang', () => {
  it('returns true for study languages', () => {
    expect(isStudyLang('en')).toBe(true);
    expect(isStudyLang('ko')).toBe(true);
    expect(isStudyLang('ja')).toBe(true);
  });

  it('returns false for removed legacy native-only codes', () => {
    expect(isStudyLang('vi')).toBe(false);
    expect(isStudyLang('th')).toBe(false);
    expect(isStudyLang('ar')).toBe(false);
    expect(isStudyLang('hi')).toBe(false);
    expect(isStudyLang('tr')).toBe(false);
    expect(isStudyLang('id')).toBe(false);
  });

  it('returns false for unknown codes', () => {
    expect(isStudyLang('xx')).toBe(false);
    expect(isStudyLang('')).toBe(false);
  });

  it('treats legacy zh as a study language', () => {
    expect(isStudyLang('zh')).toBe(true);
  });
});

describe('findLanguage', () => {
  it('finds existing languages', () => {
    const en = findLanguage('en');
    expect(en).toBeDefined();
    expect(en!.name).toBe('English');
    expect(en!.flag).toBe('🇺🇸');
  });

  it('returns undefined for removed native-only codes', () => {
    expect(findLanguage('vi')).toBeUndefined();
    expect(findLanguage('th')).toBeUndefined();
  });

  it('returns undefined for unknown code', () => {
    expect(findLanguage('xx')).toBeUndefined();
    expect(findLanguage('')).toBeUndefined();
  });

  it('maps legacy zh to zh-CN', () => {
    const zh = findLanguage('zh');
    expect(zh).toBeDefined();
    expect(zh!.code).toBe('zh-CN');
  });
});

describe('migrateNativeLang', () => {
  it('passes through supported codes unchanged', () => {
    expect(migrateNativeLang('en')).toBe('en');
    expect(migrateNativeLang('ko')).toBe('ko');
    expect(migrateNativeLang('zh-CN')).toBe('zh-CN');
  });

  it('migrates removed codes to en', () => {
    expect(migrateNativeLang('vi')).toBe('en');
    expect(migrateNativeLang('id')).toBe('en');
    expect(migrateNativeLang('th')).toBe('en');
    expect(migrateNativeLang('ar')).toBe('en');
    expect(migrateNativeLang('hi')).toBe('en');
    expect(migrateNativeLang('tr')).toBe('en');
  });

  it('falls back to en for null/undefined', () => {
    expect(migrateNativeLang(null)).toBe('en');
    expect(migrateNativeLang(undefined)).toBe('en');
  });
});
