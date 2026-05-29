export type TipLang = 'en' | 'ko' | 'ja' | 'zh-CN' | 'es' | 'fr' | 'de' | 'it';

export const TIP_LANGS: TipLang[] = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'];

/**
 * One display language's view of every study language's tips.
 * Keyed by the *subject* language (the language being studied); the values
 * are short facts/TMI about that language, written in the *display* language
 * this block belongs to.
 */
export type TipBlock = Record<TipLang, string[]>;
