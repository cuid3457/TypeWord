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
];

const EN_KEYWORDS: string[] = [
  // Strong profanity
  "fuck", "fucking", "fucker", "motherfucker",
  "shit", "shitty", "bullshit",
  "cunt", "cocksucker", "asshole",
  "bitch", "dick", "pussy",
  // Slurs — racial / ethnic / religious
  "nigger", "nigga", "kike",
  "spic", "chink", "gook",
  "wetback", "towelhead", "sandnigger",
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
  "ファック", "クソ野郎",
  // 性的
  "セックス", "アダルト", "エロビデオ", "ポルノ",
  "ちんこ", "まんこ", "ちんぽ", "ヤリマン", "売女",
  // 差別 / 蔑称
  "ジャップ", "チョン", "ガイジ",
  "ネトウヨ", "パヨク",
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
