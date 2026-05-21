/**
 * Cardinal-numeral dual-form overrides.
 *
 * Korean has two parallel cardinal systems for 1–99 (native counting form
 * and Sino-derived form) that serve different contexts. Both are essential
 * for a learner. The model is non-deterministic at producing both — some
 * runs return only one form, some mix systems across consecutive lookups.
 *
 * For small cardinals the canonical answer is fixed and well-known, so we
 * deterministically inject the dual-form pair after the OpenAI call rather
 * than depending on the model to enumerate them consistently.
 */
import type { WordLookupResult } from "./types.ts";

interface DualNumeral {
  native: string;
  sino: string;
}

// English → Korean cardinal dual forms (1–10). Higher numbers are not
// covered here because: (a) above 10 the native form falls out of everyday
// use beyond a few specific positions (스물, 서른, …) and the canonical
// answer becomes context-dependent, (b) the model handles them more
// reliably without intervention.
const EN_KO_CARDINAL_DUAL: Record<string, DualNumeral> = {
  one:   { native: "하나",   sino: "일" },
  two:   { native: "둘",     sino: "이" },
  three: { native: "셋",     sino: "삼" },
  four:  { native: "넷",     sino: "사" },
  five:  { native: "다섯",   sino: "오" },
  six:   { native: "여섯",   sino: "육" },
  seven: { native: "일곱",   sino: "칠" },
  eight: { native: "여덟",   sino: "팔" },
  nine:  { native: "아홉",   sino: "구" },
  ten:   { native: "열",     sino: "십" },
};

/**
 * If the input is a covered cardinal in the en→ko direction, return the
 * canonical pair to inject as the meanings field. Caller decides whether
 * to replace or merge with the model's output. Returns null if the input
 * is out of scope.
 */
export function getDualNumeralOverride(
  sourceLang: string,
  targetLang: string,
  word: string,
): WordLookupResult["meanings"] | null {
  if (sourceLang !== "en" || targetLang !== "ko") return null;
  const norm = word.trim().toLowerCase();
  const dual = EN_KO_CARDINAL_DUAL[norm];
  if (!dual) return null;
  return [
    { definition: dual.native, partOfSpeech: "고유 수사", relevanceScore: 100 },
    { definition: dual.sino,   partOfSpeech: "한자어 수사", relevanceScore: 95 },
  ];
}
