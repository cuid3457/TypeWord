import { LANGUAGES, STUDY_LANGUAGES, isStudyLang, findLanguage } from '../languages';

describe('LANGUAGES', () => {
  it('has 16 languages', () => {
    expect(LANGUAGES).toHaveLength(16);
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
  it('excludes nativeOnly languages', () => {
    const nativeOnly = LANGUAGES.filter((l) => l.nativeOnly);
    for (const lang of nativeOnly) {
      expect(STUDY_LANGUAGES.find((s) => s.code === lang.code)).toBeUndefined();
    }
  });

  it('includes en, ko, ja, zh, es, fr, de, it, pt, ru', () => {
    const codes = STUDY_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ko');
    expect(codes).toContain('ja');
    expect(codes).toContain('zh');
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

  it('returns false for nativeOnly languages', () => {
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
});

describe('findLanguage', () => {
  it('finds existing languages', () => {
    const en = findLanguage('en');
    expect(en).toBeDefined();
    expect(en!.name).toBe('English');
    expect(en!.flag).toBe('🇺🇸');
  });

  it('finds nativeOnly languages', () => {
    const vi = findLanguage('vi');
    expect(vi).toBeDefined();
    expect(vi!.nativeName).toBe('Tiếng Việt');
  });

  it('returns undefined for unknown code', () => {
    expect(findLanguage('xx')).toBeUndefined();
    expect(findLanguage('')).toBeUndefined();
  });
});
