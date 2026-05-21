// Curated keyword blocklist for community-uploaded titles + descriptions.
//
// This is a defense-in-depth layer below OpenAI Moderation — it catches
// obvious vulgarity instantly without an API round trip and acts as a
// fallback when moderation is degraded. Lists are intentionally short:
// only words that are *clearly* offensive in nearly all contexts. Borderline
// terms (e.g. medical/anatomical, mild slang) are left to OpenAI Moderation
// to judge in context.
//
// Match strategy:
//   • Latin / Cyrillic alphabets → word-boundary match (\b…\b) to avoid
//     false positives like "pass" matching "ass".
//   • CJK (Korean / Japanese / Chinese) → substring match because there
//     are no word boundaries; the curated terms are specific enough that
//     in-word collisions are extremely rare.
//
// To extend: add to the appropriate language array. Test before deploy.

const KO_KEYWORDS: string[] = [
  // 비속어
  "시발", "씨발", "쓰발", "ㅅㅂ", "씨팔", "시팔",
  "좆", "좆같", "병신", "ㅄ", "ㅂㅅ",
  "개새끼", "개새", "개년", "개놈",
  "지랄", "미친놈", "미친년",
  // 성적 표현
  "보지", "자지", "ㅈㅈ", "성기", "음경", "사정",
  "섹스", "야동", "야사", "야설", "야짤", "야한", "야썰",
  "음란", "포르노", "에로", "19금",
  "자위", "변태", "페티시", "음담",
  "오르가즘", "성행위", "성관계", "원나잇",
  // 커뮤니티 / 정치 슬러 — 출처 무관하게 모욕적 의도로만 쓰이는 표현
  "일베", "일베충", "메갈", "메갈리아", "워마드",
  "김치녀", "김치남", "한남충", "한녀충", "페미충", "펨창",
  "노알라", "토착왜구",
  "빨갱이", "좌빨", "우빨", "수꼴",
  // 인종 / 민족 슬러
  "짱깨", "짱꼴라", "떼국", "쪽바리", "쪽발이", "왜놈",
  "깜둥이", "흑형이", "튀기",
  // 종교 모욕어
  "개독", "개슬람", "무슬림충", "예수쟁이", "교회충",
  // 문화 / 직업 / 집단 모욕어 (-충 접미사 슬러)
  "한녀충", "지균충", "급식충", "맘충", "꼰대충",
];

const EN_KEYWORDS: string[] = [
  // Strong profanity
  "fuck", "fucking", "fucker", "motherfucker",
  "shit", "shitty", "bullshit",
  "cunt", "cocksucker", "asshole",
  "bitch", "dick", "pussy",
  "slut", "whore", "skank", "hooker", "tramp",
  "bastard", "prick", "twat", "wanker", "douchebag",
  "scoundrel", "harlot",
  // Slurs — racial / ethnic / religious
  "nigger", "nigga", "kike",
  "spic", "chink", "gook",
  "wetback", "towelhead", "sandnigger",
  "raghead", "camel jockey", "mohammedan",
  "papist", "dothead", "pajeet",
  "heeb", "yid",
  // Slurs — LGBT / disability
  "faggot", "tranny", "dyke",
  "retard", "retarded",
  // Online community slurs
  "incel",
  // Sexual
  "sex", "sexy", "sexual",
  "porn", "porno", "pornography", "xxx", "hentai",
  "nude", "nudes", "naked",
  "erotic", "erotica", "fetish", "kink", "kinky",
  "orgasm", "masturbate", "masturbation",
  "boobs", "tits", "horny", "blowjob", "handjob",
];

const JA_KEYWORDS: string[] = [
  // 罵倒語
  "ファック", "クソ野郎", "ばか野郎", "ろくでなし",
  // 性的
  "セックス", "アダルト", "エロビデオ", "ポルノ",
  "ちんこ", "まんこ", "ちんぽ", "ヤリマン", "売女",
  "売春婦", "娼婦", "売春", "売女",
  // 差別 / 蔑称
  "ジャップ", "チョン", "ガイジ",
  "ネトウヨ", "パヨク",
  "チャンコロ", "キムチ野郎",
];

const ZH_KEYWORDS: string[] = [
  // 脏话
  "傻逼", "操你妈", "他妈的", "草你妈", "肏",
  // 性
  "屌", "鸡巴", "阴茎", "阴道", "性交", "做爱",
  "黄片", "色情", "成人片",
  // 歧视 / 蔑称
  "棒子", "高丽棒子", "鬼子", "日本鬼子",
  "黑鬼", "娘炮", "死娘炮",
  "五毛",
];

const ES_KEYWORDS: string[] = [
  "joder", "mierda", "coño", "cojones",
  "puta", "putas", "cabrón", "cabron", "hijoputa",
  "pendejo", "follar", "follando",
  "porno", "porn",
  // Slurs
  "maricón", "maricon", "marica", "bollera",
  "sudaca", "naco",
];

const FR_KEYWORDS: string[] = [
  "merde", "putain", "salope",
  "connard", "connasse", "enculé", "encule",
  "pute", "couilles", "branler",
  "porno", "porn",
  // Insultes raciales / homophobes
  "nègre", "negre", "bougnoule", "bicot",
  "pédé", "pede", "gouine",
  "boche", "rital",
];

const DE_KEYWORDS: string[] = [
  "scheiße", "scheisse", "scheissdreck",
  "ficken", "fick", "fotze",
  "arschloch", "schwanz", "möse", "moese",
  "nutte", "hure", "schlampe",
  "porno", "porn",
  // Rassistische / homophobe / ableistische Beleidigungen
  "neger", "polacke", "itaker", "tschusch",
  "schwuchtel", "kanake",
  "mongo",
];

const IT_KEYWORDS: string[] = [
  "cazzo", "merda", "vaffanculo",
  "stronzo", "troia", "puttana",
  "figa", "fica", "scopare",
  "porno", "porn",
  // Insulti razziali / regionali / omofobi
  "crucco", "terrone", "polentone",
  "frocio", "zingaro",
];

const PT_KEYWORDS: string[] = [
  "caralho", "foder", "fodase", "fodido",
  "porra", "merda", "puta",
  "cabrão", "cabrao", "buceta", "piroca",
  "porno", "porn",
  // Insultos homofóbicos
  "viado", "bicha", "sapatão", "sapatao",
];

const RU_KEYWORDS: string[] = [
  // мат (Russian profanity is very specific — these are core)
  "хуй", "пизда", "пиздец", "ебать", "ебал", "ебаный",
  "блядь", "блять", "сука",
  "мудак", "пидор", "пидорас",
  "порно", "ебля",
  // Расовые / гомофобные / общинные оскорбления
  "чурка", "хач", "жид",
  "лесбуха",
  "хохол", "кацап",
  "ватник", "либераст",
];

// Latin / Cyrillic alphabets — needs word-boundary regex.
const BOUNDARY_LANGS = ["en", "es", "fr", "de", "it", "pt", "ru"] as const;
// CJK — substring match (no concept of word boundaries).
const SUBSTRING_LANGS = ["ko", "ja", "zh"] as const;

const KEYWORDS: Record<string, string[]> = {
  ko: KO_KEYWORDS,
  en: EN_KEYWORDS,
  ja: JA_KEYWORDS,
  zh: ZH_KEYWORDS, // covers zh-CN, zh-TW, etc.
  es: ES_KEYWORDS,
  fr: FR_KEYWORDS,
  de: DE_KEYWORDS,
  it: IT_KEYWORDS,
  pt: PT_KEYWORDS,
  ru: RU_KEYWORDS,
};

// Pre-compile boundary regexes for fast match. Build per-language
// alternation: \b(word1|word2|...)\b with the i flag.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BOUNDARY_REGEX: Record<string, RegExp> = {};
for (const lang of BOUNDARY_LANGS) {
  const list = KEYWORDS[lang];
  if (list && list.length > 0) {
    const alt = list.map(escapeRegex).join("|");
    BOUNDARY_REGEX[lang] = new RegExp(`\\b(?:${alt})\\b`, "iu");
  }
}

export type BlocklistVerdict =
  | { ok: true }
  | { ok: false; matched: string; lang: string };

/**
 * Check `text` against all languages' blocklists. Returns the first match
 * found. Title can be in any language so we don't trust the user-declared
 * source/target lang — match against everything.
 */
export function checkBlocklist(text: string): BlocklistVerdict {
  if (!text) return { ok: true };
  const normalized = text.normalize("NFC").toLowerCase();

  // Boundary-matched languages (Latin / Cyrillic).
  for (const lang of BOUNDARY_LANGS) {
    const re = BOUNDARY_REGEX[lang];
    if (!re) continue;
    const m = re.exec(normalized);
    if (m) return { ok: false, matched: m[0], lang };
  }

  // Substring-matched languages (CJK).
  for (const lang of SUBSTRING_LANGS) {
    const list = KEYWORDS[lang];
    if (!list) continue;
    for (const kw of list) {
      if (normalized.includes(kw.toLowerCase())) {
        return { ok: false, matched: kw, lang };
      }
    }
  }

  return { ok: true };
}

// ── Word-level exact-match refusal (for word-lookup-v2 input layer) ──
//
// TypeWord/MoaVoca is positioned as a LANGUAGE LEARNING tool, not a reference
// dictionary. Vulgar / profane / slang / slur tokens must refuse with note=
// "non_word" BEFORE the AI lookup. This is a deterministic safety net — the
// prompt rules also encourage refusal but the model occasionally returns
// register-tagged "vocabulary entries" anyway. Hardcoded refusal is reliable.
//
// Match: NFKC + lowercase + trim, then exact equality against the source
// lang's keyword set (and a few cross-lang sets for unambiguous inputs like
// Russian profanity typed in Korean session).

const EXACT_REFUSAL_BY_LANG: Record<string, Set<string>> = {};
for (const lang of Object.keys(KEYWORDS)) {
  EXACT_REFUSAL_BY_LANG[lang] = new Set(
    (KEYWORDS[lang] ?? []).map((w) => w.normalize("NFKC").toLowerCase().trim()),
  );
}

// Register keywords that signal a slang/vulgar/derogatory sense inside a
// meaning's definition. If any of these appears in a definition, the meaning
// is dropped from the output (and its corresponding example slot too).
// Covers English + Romance language register markers.
const REGISTER_KEYWORD_RE = /\b(slang|vulgar(?:ity)?|profan\w*|swear\w*|derogat\w*|pejorat\w*|offensive|taboo|crude|obscen\w+|slur|insult\w*|curse|expletive|epithet|vulg(?:aire|are|ar|aer)|grossier\w*|injur\w*|insulto|palabrota|volgare|volgarismo|dispregiat\w*|obsceno|grosería|vol\w+r|vulg\w+)\b/i;
// German-specific register markers (separate to avoid umlaut handling complications).
const DE_REGISTER_RE = /\b(derb\w*|vulg[aä]r\w*|abwert\w*|beleidig\w*|schimpf\w*|grob\w*|obszön\w*|obszoen\w*|gemein|anstößig|anstoessig|geschlechts\w*)\b/i;

// Korean / Japanese / Chinese register markers (these don't have word
// boundaries; use substring match).
//
// 2026-05-19: Removed broad "속어" (KO) / "俗語" (JA) — those cover the
// generic INFORMAL register too, which collided with the new
// register-tagged idiom translations ("죽다(속어)" for "kick the bucket"
// etc.). The remaining entries are vulgar / derogatory / discriminatory
// signals where dropping the meaning IS the correct learning-tool
// behavior.
const CJK_REGISTER_MARKERS = [
  // Korean
  "비속어", "욕설", "비하", "모욕", "차별어", "혐오 표현", "음란",
  // Japanese
  "下品", "蔑称", "差別語", "侮辱", "卑語", "ののしり",
  // Chinese
  "粗话", "脏话", "蔑称", "辱骂", "侮辱", "粗俗", "下流",
];

/**
 * Returns true if a definition text contains a register-marker keyword
 * indicating the sense is slang/vulgar/derogatory. Such senses are dropped
 * from output entries per learning-tool positioning.
 */
function hasRegisterMarker(definition: string): boolean {
  if (!definition) return false;
  if (REGISTER_KEYWORD_RE.test(definition)) return true;
  if (DE_REGISTER_RE.test(definition)) return true;
  for (const m of CJK_REGISTER_MARKERS) {
    if (definition.includes(m)) return true;
  }
  return false;
}

/**
 * Returns true if a definition text contains a vulgar word from the
 * target_lang's keyword blocklist (slut/asshole/bitch/etc.). Such senses
 * are dropped because including them by their bare vulgar equivalent
 * normalizes the term, which violates the learning-tool positioning.
 */
function containsBlocklistedWord(definition: string, targetLang: string): boolean {
  if (!definition) return false;
  const def = definition.normalize("NFKC").toLowerCase();
  const base = targetLang.toLowerCase().split("-")[0];
  const list = KEYWORDS[base] ?? KEYWORDS[targetLang.toLowerCase()];
  if (!list) return false;
  for (const kw of list) {
    const lk = kw.toLowerCase();
    // Boundary check for Latin/Cyrillic, substring for CJK
    if (BOUNDARY_LANGS.includes(base as typeof BOUNDARY_LANGS[number])) {
      const re = new RegExp(`\\b${lk.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i");
      if (re.test(def)) return true;
    } else {
      if (def.includes(lk)) return true;
    }
  }
  return false;
}

export interface WordResultLike {
  meanings?: Array<{ definition: string; partOfSpeech?: string }>;
  examples?: Array<{ sentence: string; meaning_index?: number; translation?: string }>;
  [key: string]: unknown;
}

/**
 * Post-process a per-target-lang result: drop meanings whose definitions
 * carry register markers OR contain blocklisted vulgar words. Also drop
 * the corresponding examples and renumber meaning_index in survivors.
 *
 * Pure function; does not mutate input.
 */
export function filterVulgarMeanings<T extends WordResultLike>(result: T, targetLang: string): T {
  if (!result || !Array.isArray(result.meanings) || result.meanings.length === 0) return result;
  const meanings = result.meanings;
  const dropSet = new Set<number>();
  for (let i = 0; i < meanings.length; i++) {
    const def = meanings[i].definition || "";
    if (hasRegisterMarker(def) || containsBlocklistedWord(def, targetLang)) {
      dropSet.add(i);
    }
  }
  if (dropSet.size === 0) return result;

  // Build old-index → new-index map for the kept meanings.
  const indexMap = new Map<number, number>();
  const newMeanings: typeof meanings = [];
  for (let i = 0; i < meanings.length; i++) {
    if (!dropSet.has(i)) {
      indexMap.set(i, newMeanings.length);
      newMeanings.push(meanings[i]);
    }
  }

  const newExamples = Array.isArray(result.examples)
    ? result.examples
        .filter((ex) => {
          const mi = typeof ex.meaning_index === "number" ? ex.meaning_index : 0;
          return !dropSet.has(mi);
        })
        .map((ex) => {
          const mi = typeof ex.meaning_index === "number" ? ex.meaning_index : 0;
          return { ...ex, meaning_index: indexMap.get(mi) ?? mi };
        })
    : result.examples;

  return { ...result, meanings: newMeanings, examples: newExamples };
}

/**
 * Returns true if the bare input word should refuse with note="non_word"
 * (vulgar / profanity / slur / sexually-explicit term). Matches against the
 * source language's keyword list with exact normalized equality.
 */
export function isVocabRefusal(sourceLang: string, word: string): boolean {
  if (!word) return false;
  const normalized = word.normalize("NFKC").toLowerCase().trim();
  const base = sourceLang.toLowerCase().split("-")[0];
  const set = EXACT_REFUSAL_BY_LANG[base] ?? EXACT_REFUSAL_BY_LANG[sourceLang.toLowerCase()];
  if (set?.has(normalized)) return true;
  // Cross-script fallback: if the input is in Hangul, also check Korean set
  // regardless of declared source (handles edge cases where user passes wrong
  // sourceLang). Mirrors for Han/Kana/Cyrillic could be added later.
  if (/\p{Script=Hangul}/u.test(normalized) && base !== "ko") {
    if (EXACT_REFUSAL_BY_LANG.ko?.has(normalized)) return true;
  }
  return false;
}
