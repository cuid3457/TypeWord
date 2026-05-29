import { LANGUAGES } from '@src/constants/languages';

import de from './de';
import en from './en';
import es from './es';
import fr from './fr';
import it from './it';
import ja from './ja';
import ko from './ko';
import zhCN from './zh-CN';
import type { TipBlock, TipLang } from './types';

export type { TipLang } from './types';

// MOA_TIPS[displayLang][subjectLang] -> short facts about `subjectLang`,
// written in `displayLang`. Display = user's native/app language;
// subject = the language being studied.
const MOA_TIPS: Record<TipLang, TipBlock> = {
  en,
  ko,
  ja,
  'zh-CN': zhCN,
  es,
  fr,
  de,
  it,
};

const CODES = new Set(LANGUAGES.map((l) => l.code));

function normLang(code?: string | null): TipLang {
  if (!code) return 'en';
  if (code === 'zh' || code === 'zh-TW' || code.startsWith('zh')) return 'zh-CN';
  if (CODES.has(code)) return code as TipLang;
  const base = code.split('-')[0];
  if (CODES.has(base)) return base as TipLang;
  return 'en';
}

/**
 * Tips about `subjectLang` (the studied language), written in `displayLang`
 * (the user's native/app language). Falls back to English-display if a
 * locale block is somehow missing. Returns [] when neither resolves.
 */
export function getTips(displayLang?: string | null, subjectLang?: string | null): string[] {
  const d = normLang(displayLang);
  const s = normLang(subjectLang);
  return MOA_TIPS[d]?.[s] ?? MOA_TIPS.en[s] ?? [];
}

/** Convenience: one random tip, or null when none are available. */
export function getRandomTip(displayLang?: string | null, subjectLang?: string | null): string | null {
  const tips = getTips(displayLang, subjectLang);
  if (tips.length === 0) return null;
  return tips[Math.floor(Math.random() * tips.length)];
}
