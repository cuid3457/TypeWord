/**
 * Dispute / sensitivity guardrails.
 *
 * Two responsibilities:
 *
 * 1. Output rewriter — replace forbidden naming in any AI-generated text
 *    BEFORE it reaches the user or the cache. The product is published
 *    from the Republic of Korea; for any topic where Korea is a party to
 *    the dispute (East Sea/Sea of Japan, Dokdo/Takeshima, comfort women,
 *    forced labor) Korean naming is the operating-jurisdiction baseline,
 *    not a stylistic choice. Server-side rewrite is the deterministic
 *    backstop for when the AI doesn't follow prompt instructions (audit
 *    confirmed it sometimes leaks "일본해" into Korean output).
 *
 * 2. Input blacklist — for inputs that name iconic figures of mass
 *    atrocity / contemporary authoritarian leaders, refuse the lookup
 *    upfront. Generating any examples for these names risks producing
 *    something the press could screenshot. Refusal returns the same
 *    empty-meanings shape the AI uses for non_word inputs.
 *
 *    Borderline / common-noun-overlapping names (Franco, Lula, Castro,
 *    Bolsonaro, …) are NOT blacklisted; the AI's general sensitive-content
 *    rule already neutralizes them in practice (verified in audit).
 */

// ── Output rewriter ─────────────────────────────────────────────────────

// Per-output-language regex replacement rules. Keyed by language family
// ("zh" covers zh-CN/zh-TW; everything else is exact-match).
//
// Rules apply to: definition strings, example translations, anywhere user-
// visible Korean (or other target-language) text appears. They DO NOT
// apply to source-language sentence strings — when a user looks up "日本海"
// in Japanese, the Japanese sentence containing "日本海" is intentionally
// preserved (it's the lookup word). Only the Korean rendering of the
// definition / translation is rewritten.
const REWRITES_BY_LANG: Record<string, Array<[RegExp, string]>> = {
  ko: [
    // East Sea (always 동해 in Korean text — never "일본해")
    [/일본해/g, "동해"],
    // 다케시마 / 다께시마 → 독도 (Korean spelling of 竹島)
    [/다(?:케|께)시마/g, "독도"],
    // Mt. Paektu — Korean position is 백두산. 장백산 (Korean spelling of
    // Chinese 长白山) and 창바이산 (Korean Romanization of Chángbáishān)
    // both reference the same peak; both rewrite to 백두산.
    [/장백산/g, "백두산"],
    [/창바이산/g, "백두산"],
    // 센카쿠 (Korean spelling of 尖閣) — keep as-is in *Korean* text since
    // Korea isn't a party to that dispute, but strip any "일본 영토" assertion.
    // Handled at prompt level, not rewriter (substring is hard to match safely).
  ],
  // The lookbehind `[…(]` and lookahead `[…)]` exclude already-wrapped
  // forms — without this, "East Sea (Sea of Japan)" gets re-matched on
  // subsequent rewriter passes (delta stream + normalize + example
  // translation) and grows into "East Sea (East Sea (Sea of Japan))".
  en: [
    [/(?<![A-Za-z(])Sea of Japan(?![A-Za-z)])/g, "East Sea (Sea of Japan)"],
  ],
  ja: [
    // Hangul / kana are not Han chars, so the negative lookarounds need to
    // also exclude the parenthetical wrapper to stay idempotent.
    [/(?<![一-鿿(（])日本海(?![一-鿿)）])/g, "東海(日本海)"],
    [/(?<![一-鿿(（])長白山脈(?![一-鿿)）])/g, "白頭山脈(長白山脈)"],
    [/(?<![一-鿿(（])長白山(?![一-鿿)）])/g, "白頭山(長白山)"],
  ],
  zh: [
    [/(?<![一-鿿(（])日本海(?![一-鿿)）])/g, "东海(日本海)"],
    [/(?<![一-鿿(（])长白山脉(?![一-鿿)）])/g, "白头山脉(长白山脉)"],
    [/(?<![一-鿿(（])长白山(?![一-鿿)）])/g, "白头山(长白山)"],
    [/(?<![一-鿿(（])長白山脈(?![一-鿿)）])/g, "白頭山脈(長白山脈)"],
    [/(?<![一-鿿(（])長白山(?![一-鿿)）])/g, "白頭山(長白山)"],
  ],
  fr: [
    [/(?<![A-Za-zÀ-ÿ(])Mer du Japon(?![A-Za-zÀ-ÿ)])/g, "Mer de l'Est (mer du Japon)"],
  ],
  de: [
    [/(?<![A-Za-zÄÖÜäöüß(])Japanisches Meer(?![A-Za-zÄÖÜäöüß)])/g, "Ostmeer (Japanisches Meer)"],
  ],
  es: [
    [/(?<![A-Za-zÁÉÍÓÚÜÑáéíóúüñ(])Mar de Japón(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ)])/g, "Mar del Este (Mar de Japón)"],
  ],
  it: [
    [/(?<![A-Za-zÀ-ÿ(])Mare del Giappone(?![A-Za-zÀ-ÿ)])/g, "Mare dell'Est (Mare del Giappone)"],
  ],
  pt: [
    [/(?<![A-Za-zÀ-ÿ(])Mar do Japão(?![A-Za-zÀ-ÿ)])/g, "Mar do Leste (Mar do Japão)"],
  ],
  ru: [
    [/(?<![А-Яа-яЁё(])Японское море(?![А-Яа-яЁё)])/g, "Восточное море (Японское море)"],
  ],
};

function getRewritesForLang(lang: string): Array<[RegExp, string]> {
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return REWRITES_BY_LANG.zh;
  return REWRITES_BY_LANG[lower] ?? [];
}

/**
 * Apply Korean-position / dispute rewrites to a piece of text in the given
 * output language. Returns the text unchanged when no rules apply.
 *
 * Use this on definitions and example translations. Do NOT use on source-
 * language sentence text — sentences must contain the lookup word verbatim.
 */
export function applyDisputeRewrites(text: string, lang: string): string {
  if (!text) return text;
  const rules = getRewritesForLang(lang);
  if (rules.length === 0) return text;
  let out = text;
  for (const [re, rep] of rules) out = out.replace(re, rep);
  return out;
}

// Korea-China cultural disputes are token-pair-specific: 泡菜 IS a legitimate
// Chinese word for pickled vegetables (so we can't blindly replace it), but
// when the lookup target is Korean kimchi, the Chinese rendering MUST be 辛奇.
// We resolve this by passing the lookup word into a contextual rewriter that
// only fires when the (lookup word, output language) pair signals one of
// these scoped disputes.
function isKimchiLookup(s: string): boolean {
  const n = s.normalize("NFKC").toLowerCase().trim();
  return n === "김치" || n === "kimchi" || n === "辛奇";
}
function isPaocaiLookup(s: string): boolean {
  const n = s.normalize("NFKC").trim();
  return n === "泡菜" || n === "paocai";
}
function isHanbokLookup(s: string): boolean {
  const n = s.normalize("NFKC").toLowerCase().trim();
  return n === "한복" || n === "hanbok" || n === "韩服" || n === "韓服";
}

/**
 * Contextual rewrites that depend on which word is being looked up. Run
 * AFTER applyDisputeRewrites. Currently scoped to Korea-China cultural
 * disputes where token-pair semantics matter (see comment above).
 */
export function applyContextualDisputeRewrites(
  text: string,
  targetLang: string,
  lookupWord: string,
): string {
  if (!text) return text;
  const lower = targetLang.toLowerCase();
  let out = text;

  // 김치 lookup with Chinese target: force 辛奇 over 泡菜.
  if (lower.startsWith("zh") && isKimchiLookup(lookupWord)) {
    out = out.replace(/泡菜/g, "辛奇");
  }

  // 泡菜 lookup with Korean target: must NOT define as 김치 (different food).
  // Replace bare "김치" tokens with the dictionary-correct "중국식 절임채소".
  // The rewrite is narrow (exact 김치 token), so it doesn't affect compounds
  // that legitimately reference Korean kimchi in unrelated contexts.
  if (lower === "ko" && isPaocaiLookup(lookupWord)) {
    out = out.replace(/(?<![가-힣])김치(?![가-힣])/g, "중국식 절임채소");
  }

  // 한복 lookup with Chinese target: force 韩服 over 朝鲜服 / 朝鲜族服装.
  if (lower.startsWith("zh") && isHanbokLookup(lookupWord)) {
    out = out.replace(/朝鲜族?\s*服(?:装|裝)?/g, "韩服");
  }

  return out;
}

// ── Input redirects ─────────────────────────────────────────────────────

// Inputs that should be SILENTLY redirected to the Korean-position canonical
// form before any cache lookup or AI call. Result: headword renders as the
// canonical form from the very first frame, and all variants share one
// cache entry.
//
// Silent input redirects were REMOVED on 2026-05-12 in favor of the
// "define-with-framing" approach (similar to how Naver / Oxford handle
// disputed exonyms): the user's typed term is preserved, the dictionary
// defines it with a clear Korean-position framing in the definition
// itself, and example sentences are forced to metalinguistic templates
// by `isSensitiveLookup` + the SENSITIVE_LOOKUPS_BY_LANG table.
//
// This means a user typing "일본해" or "takeshima" or "Japanisches Meer"
// now SEES THAT TERM ON SCREEN with a definition like "동해의 일본식
// 명칭" — instead of the silently-rewritten 동해 entry which made
// users wonder why their input vanished. The Korea-position WORD_ANALYZE
// prompt rules ensure the definition references the canonical name.
//
// ── V1 ORIGINAL state (restored in this archive copy) ──
const INPUT_REDIRECTS: Record<string, Array<{ from: RegExp; to: string }>> = {
  en: [
    { from: /^takeshima$/i, to: "Dokdo" },
    { from: /^sea of japan$/i, to: "East Sea (Sea of Japan)" },
  ],
  ko: [
    { from: /^일본해$/, to: "동해" },
    { from: /^다(?:케|께)시마$/, to: "독도" },
    { from: /^(?:장백산|창바이산)$/, to: "백두산" },
  ],
  fr: [
    { from: /^mer du japon$/i, to: "Mer de l'Est (mer du Japon)" },
    { from: /^takeshima$/i, to: "Dokdo" },
  ],
  de: [
    { from: /^japanisches meer$/i, to: "Ostmeer (Japanisches Meer)" },
    { from: /^takeshima$/i, to: "Dokdo" },
  ],
  es: [
    { from: /^mar de japón$/i, to: "Mar del Este (Mar de Japón)" },
    { from: /^takeshima$/i, to: "Dokdo" },
  ],
  it: [
    { from: /^mare del giappone$/i, to: "Mare dell'Est (Mare del Giappone)" },
    { from: /^takeshima$/i, to: "Dokdo" },
  ],
  pt: [
    { from: /^mar do japão$/i, to: "Mar do Leste (Mar do Japão)" },
    { from: /^takeshima$/i, to: "Dokdo" },
  ],
  ru: [
    { from: /^японское море$/i, to: "Восточное море (Японское море)" },
    { from: /^такэсима$/i, to: "Токто" },
  ],
};

// Lexicon-style hints injected at the user-prompt layer (separate from
// REWRITES_BY_LANG which acts on output text). When the lookup word matches,
// we add a sentence to the user prompt explaining the canonical Korean
// position so the AI knows what to output. This is a backstop for cases
// where the bare prompt rules aren't picking up — e.g. 辛奇 (zh-CN) which
// the model reads character-by-character as a personal name unless told
// it's the official ROK Chinese rendering of kimchi.
const LOOKUP_HINTS: Array<{ langs: string[]; match: RegExp; hint: string }> = [
  {
    langs: ["zh-cn", "zh-tw"],
    match: /^辛奇$/,
    hint: "DISPUTE HINT — 辛奇 is the official Republic of Korea government translation (since 2021) of the Korean food 김치 (kimchi) into Chinese. Define as Korean kimchi; do NOT interpret character-by-character as a personal name or generic compound.",
  },
  {
    langs: ["ko"],
    match: /^한복$/,
    hint: "DISPUTE HINT — 한복 is Korean traditional clothing. ALWAYS provide a real definition; never return meanings=[]. In Chinese targets, render as 韩服. Frame as Korean in origin (not as Chinese minority dress / 朝鲜族服装).",
  },
  {
    langs: ["ko"],
    match: /^김치$/,
    hint: "DISPUTE HINT — 김치 is Korean traditional food (kimchi). ALWAYS provide a real definition; never return meanings=[]. In Chinese targets, render as 辛奇 (the official ROK government translation since 2021), NEVER 泡菜.",
  },
  {
    langs: ["ko"],
    match: /^단오$/,
    hint: "DISPUTE HINT — 단오 is the Korean Dano festival (UNESCO Intangible Cultural Heritage of Korea, 2008). ALWAYS provide a real definition. Distinct from Chinese 端午节 despite shared historical origin.",
  },
  {
    langs: ["ko"],
    match: /^(?:고구려|발해)$/,
    hint: "DISPUTE HINT — Korean historical kingdom. ALWAYS provide a real definition. Frame as part of Korean historical lineage. In Chinese: 高句丽 / 渤海. Reject the PRC 东北工程 thesis classifying it as a Chinese regional regime.",
  },
  {
    langs: ["ko"],
    match: /^백두산$/,
    hint: "DISPUTE HINT — 백두산 is the Korean sacred mountain on the Korea-China border. ALWAYS provide a real definition. The Korean-position Chinese rendering is 白头山 (bái-tóu-shān, agreed to by PRC and DPRK in 1962); never 长白山 (the broader Chinese mountain range name). Frame as Korean cultural / historical landmark.",
  },
  {
    langs: ["zh-cn", "zh-tw"],
    match: /^(?:长白山|長白山)$/,
    hint: "DISPUTE HINT — When defining 长白山 / 長白山 for a Korean-language target, the Korean-position rendering is 백두산 (Mt. Paektu), the sacred mountain in Korean culture and DPRK national symbol. Define the peak as 백두산 in Korean output, not 창바이산 / 장백산.",
  },
  // — Korea-Japan critical items —
  {
    langs: ["ko"],
    match: /^욱일기$/,
    hint: "DISPUTE HINT — 욱일기 (Rising Sun Flag) is the Imperial Japanese militarist war flag. Define as such; never as a neutral 'naval ensign' or 'traditional design'.",
  },
  {
    langs: ["ko"],
    match: /^(?:임진왜란|정유재란)$/,
    hint: "DISPUTE HINT — Japanese invasion of Korea by Toyotomi Hideyoshi (임진왜란 1592–1598; 정유재란 1597). In Japanese targets, render as 壬辰倭乱 / 丁酉再乱 (the Korean naming) or as the modern Japanese 文禄・慶長の役 ONLY if balanced with Korean naming. Do not frame as a generic war.",
  },
  {
    langs: ["ko"],
    match: /^(?:사도광산|군함도|하시마)$/,
    hint: "DISPUTE HINT — UNESCO heritage sites where Korean forced labor occurred under Japanese colonial rule. ALWAYS mention 강제동원 (forced mobilization) in the definition.",
  },
  {
    langs: ["ko"],
    match: /^후쿠시마\s*오염수$/,
    hint: "DISPUTE HINT — Use 오염수 ('contaminated water') in Korean output; do not adopt the Japanese government PR term 처리수 ('treated water').",
  },
  {
    langs: ["ko"],
    match: /^관동대학살$/,
    hint: "DISPUTE HINT — 1923 mass killing of ethnic Koreans during the Great Kanto earthquake. Always define as a massacre; do not refer to the period as the earthquake alone.",
  },
  {
    langs: ["ko"],
    match: /^(?:임나일본부설|정한론)$/,
    hint: "DISPUTE HINT — Rejected colonial-era Japanese theory / doctrine. ALWAYS frame as discredited / condemned.",
  },
  // — Korea-China critical items —
  {
    langs: ["ko"],
    match: /^(?:단군|단군조선|고조선|부여)$/,
    hint: "DISPUTE HINT — Korean founder myth / ancient kingdoms. ALWAYS define as part of Korean historical lineage. Reject the Chinese 기자조선 / 中国少数民族 framing.",
  },
  {
    langs: ["ko"],
    match: /^(?:한글|훈민정음)$/,
    hint: "DISPUTE HINT — Independently invented by King Sejong in 1443. ALWAYS frame as Korean invention; reject any Phags-pa / Chinese-derivation theory.",
  },
  {
    langs: ["ko"],
    match: /^세종대왕$/,
    hint: "DISPUTE HINT — Korean monarch (조선 4대 임금). NEVER label as 朝鲜族 (Chinese-Korean minority) — that is contemporary Chinese revisionism rejected by ROK.",
  },
  {
    langs: ["ko"],
    match: /^(?:이순신|안중근|윤동주|김구|강감찬|광개토대왕|이황|이이|정약용)$/,
    hint: "DISPUTE HINT — Korean historical figure. NEVER label as 中国朝鲜族 / Chinese-Korean ethnic minority — that's Chinese revisionist framing rejected by ROK.",
  },
  {
    langs: ["ko"],
    match: /^이어도$/,
    hint: "DISPUTE HINT — Submerged reef in Korea's EEZ where Korea operates an ocean research station. Korean position; reject Chinese 苏岩礁 territorial claim. Always define as Korean.",
  },
  {
    langs: ["ko"],
    match: /^(?:갓|부채춤|사물놀이|농악|윷놀이|씨름|한지|한옥|태권도|판소리|아리랑|고려청자|조선백자|동의보감|직지심체요절|거북선)$/,
    hint: "DISPUTE HINT — Korean traditional cultural item. ALWAYS frame as Korean in origin. Reject Chinese minority-culture (朝鲜族文化) framing.",
  },
  {
    langs: ["ko"],
    match: /^대한해협$/,
    hint: "DISPUTE HINT — Korean Strait. In Japanese output prefer the Korean naming 大韓海峡 / 대한해협 over the Japanese blanket 對馬海峡.",
  },
];

export function getLookupHint(sourceLang: string, input: string): string | null {
  const trimmed = input.normalize("NFKC").trim();
  const lang = sourceLang.toLowerCase();
  for (const { langs, match, hint } of LOOKUP_HINTS) {
    if (!langs.includes(lang)) continue;
    if (match.test(trimmed)) return hint;
  }
  return null;
}

// ── Hardcoded fallbacks ─────────────────────────────────────────────────
// Last-resort canonical answers for Korea-position disputes where the model
// keeps refusing despite prompt instructions + hints (observed primarily on
// zh-CN targets for Korean cultural items — likely due to RLHF caution on
// PRC-sensitive cultural narratives). When the AI returns an empty meanings
// list for one of these inputs, the lookup pipeline substitutes the entry
// below so the user never sees a blank refusal for legitimate Korean
// vocabulary. Keys: `${sourceLang}|${normalizedInput}|${targetLang}`.

interface FallbackMeaning {
  definition: string;
  partOfSpeech: string;
}

const FALLBACK_MEANINGS: Record<string, FallbackMeaning[]> = {
  // 한복 — Korean traditional clothing (multi-source fallbacks)
  "ko|한복|zh-CN": [{ definition: "韩服, 韩国传统服装", partOfSpeech: "名词" }],
  "ko|한복|zh-TW": [{ definition: "韓服, 韓國傳統服裝", partOfSpeech: "名詞" }],
  "ko|한복|en": [{ definition: "Hanbok, Korean traditional clothing", partOfSpeech: "proper noun" }],
  "ko|한복|ja": [{ definition: "韓服 (ハンボク), 韓国の伝統衣装", partOfSpeech: "名詞" }],
  "en|hanbok|zh-CN": [{ definition: "韩服, 韩国传统服装", partOfSpeech: "名词" }],
  "en|hanbok|zh-TW": [{ definition: "韓服, 韓國傳統服裝", partOfSpeech: "名詞" }],
  "en|hanbok|ja": [{ definition: "韓服 (ハンボク), 韓国の伝統衣装", partOfSpeech: "名詞" }],
  "en|hanbok|fr": [{ definition: "Hanbok, vêtement traditionnel coréen", partOfSpeech: "nom propre" }],
  "en|hanbok|de": [{ definition: "Hanbok, traditionelle koreanische Kleidung", partOfSpeech: "Eigenname" }],
  "en|Hanbok|zh-CN": [{ definition: "韩服, 韩国传统服装", partOfSpeech: "名词" }],
  "en|Hanbok|ja": [{ definition: "韓服 (ハンボク), 韓国の伝統衣装", partOfSpeech: "名詞" }],
  "ja|韓服|zh-CN": [{ definition: "韩服, 韩国传统服装", partOfSpeech: "名词" }],
  "zh-CN|韩服|ja": [{ definition: "韓服 (ハンボク), 韓国の伝統衣装", partOfSpeech: "名詞" }],
  "zh-TW|韓服|ja": [{ definition: "韓服 (ハンボク), 韓国の伝統衣装", partOfSpeech: "名詞" }],
  // 김치 — Korean traditional food (multi-source fallbacks)
  "en|kimchi|zh-CN": [{ definition: "辛奇, 韩国传统发酵食品", partOfSpeech: "名词" }],
  "en|kimchi|zh-TW": [{ definition: "辛奇, 韓國傳統發酵食品", partOfSpeech: "名詞" }],
  "en|Kimchi|zh-CN": [{ definition: "辛奇, 韩国传统发酵食品", partOfSpeech: "名词" }],
  // 백두산 / Mt. Paektu (additional source pairs)
  "en|Baekdusan|zh-CN": [{ definition: "白头山, 朝鲜半岛圣山", partOfSpeech: "名词" }],
  "en|Mount Paektu|zh-CN": [{ definition: "白头山, 朝鲜半岛圣山", partOfSpeech: "名词" }],
  "en|Mt. Paektu|zh-CN": [{ definition: "白头山, 朝鲜半岛圣山", partOfSpeech: "名词" }],
  // Korean traditional cultural items — most common cross-language pairs
  "en|taekwondo|zh-CN": [{ definition: "跆拳道, 起源于韩国的武术", partOfSpeech: "名词" }],
  "en|Taekwondo|zh-CN": [{ definition: "跆拳道, 起源于韩国的武术", partOfSpeech: "名词" }],
  "en|gimbap|zh-CN": [{ definition: "紫菜包饭 (韩国传统饭卷), 韩国饭菜", partOfSpeech: "名词" }],
  "en|bibimbap|zh-CN": [{ definition: "拌饭, 韩国传统拌饭料理", partOfSpeech: "名词" }],
  "en|bulgogi|zh-CN": [{ definition: "韩式烤牛肉, 韩国传统烤肉料理", partOfSpeech: "名词" }],
  "en|samgyetang|zh-CN": [{ definition: "参鸡汤, 韩国传统鸡肉补汤", partOfSpeech: "名词" }],
  "en|tteok|zh-CN": [{ definition: "年糕, 韩国传统米糕", partOfSpeech: "名词" }],
  "en|makgeolli|zh-CN": [{ definition: "马格利酒, 韩国传统米酒", partOfSpeech: "名词" }],
  "en|hanok|zh-CN": [{ definition: "韩屋, 韩国传统住宅", partOfSpeech: "名词" }],
  "en|hanji|zh-CN": [{ definition: "韩纸, 韩国传统手工纸", partOfSpeech: "名词" }],
  // 김치 — Korean traditional food
  "ko|김치|zh-CN": [{ definition: "辛奇, 韩国传统发酵食品", partOfSpeech: "名词" }],
  "ko|김치|zh-TW": [{ definition: "辛奇, 韓國傳統發酵食品", partOfSpeech: "名詞" }],
  // 단오 — Korean Dano festival
  "ko|단오|zh-CN": [{ definition: "韩国端午, 韩国传统节日", partOfSpeech: "名词" }],
  "ko|단오|zh-TW": [{ definition: "韓國端午, 韓國傳統節日", partOfSpeech: "名詞" }],
  // 고구려 — Korean ancient kingdom
  "ko|고구려|zh-CN": [{ definition: "高句丽, 朝鲜半岛古代王国", partOfSpeech: "名词" }],
  "ko|고구려|zh-TW": [{ definition: "高句麗, 朝鮮半島古代王國", partOfSpeech: "名詞" }],
  // 발해 — Korean ancient kingdom
  "ko|발해|zh-CN": [{ definition: "渤海, 朝鲜半岛古代王国", partOfSpeech: "名词" }],
  "ko|발해|zh-TW": [{ definition: "渤海, 朝鮮半島古代王國", partOfSpeech: "名詞" }],
  // 아리랑 — Korean traditional folk song
  "ko|아리랑|zh-CN": [{ definition: "阿里郎, 韩国传统民谣", partOfSpeech: "名词" }],
  "ko|아리랑|zh-TW": [{ definition: "阿里郎, 韓國傳統民謠", partOfSpeech: "名詞" }],
  // 백두산 — Korean sacred mountain on the China–Korea border
  "ko|백두산|zh-CN": [{ definition: "白头山, 朝鲜半岛圣山", partOfSpeech: "名词" }],
  "ko|백두산|zh-TW": [{ definition: "白頭山, 朝鮮半島聖山", partOfSpeech: "名詞" }],
  "ko|백두산|en": [{ definition: "Mount Paektu, sacred mountain in Korean tradition", partOfSpeech: "proper noun" }],
  "ko|백두산|ja": [{ definition: "白頭山, 朝鮮半島の霊山", partOfSpeech: "名詞" }],
  // 长白山 / 長白山 (Chinese name) → Korean rendering should be 백두산
  "zh-CN|长白山|ko": [{ definition: "백두산", partOfSpeech: "고유명사" }],
  "zh-TW|長白山|ko": [{ definition: "백두산", partOfSpeech: "고유명사" }],
  // — Korea-Japan critical items —
  "ko|욱일기|zh-CN": [{ definition: "旭日旗, 日本帝国主义军旗", partOfSpeech: "名词" }],
  "ko|욱일기|ja": [{ definition: "旭日旗, 日本帝国主義の軍旗", partOfSpeech: "名詞" }],
  "ko|욱일기|en": [{ definition: "Rising Sun Flag, Imperial Japanese militarist war flag", partOfSpeech: "noun" }],
  "ko|임진왜란|zh-CN": [{ definition: "壬辰倭乱, 1592–1598年丰臣秀吉侵略朝鲜战争", partOfSpeech: "名词" }],
  "ko|임진왜란|ja": [{ definition: "壬辰倭乱, 豊臣秀吉による朝鮮侵略 (1592–1598)", partOfSpeech: "名詞" }],
  "ko|임진왜란|en": [{ definition: "Imjin War, Toyotomi Hideyoshi's invasion of Korea (1592–1598)", partOfSpeech: "noun" }],
  "ko|군함도|zh-CN": [{ definition: "军舰岛 (端岛), 朝鲜人强制动员强迫劳动地", partOfSpeech: "名词" }],
  "ko|군함도|ja": [{ definition: "軍艦島 (端島), 朝鮮人強制動員の強制労働地", partOfSpeech: "名詞" }],
  "ko|사도광산|zh-CN": [{ definition: "佐渡金山, 朝鲜人强制动员强迫劳动地", partOfSpeech: "名词" }],
  "ko|사도광산|ja": [{ definition: "佐渡金山, 朝鮮人強制動員の強制労働地", partOfSpeech: "名詞" }],
  // — Korea-China critical items —
  "ko|단군|zh-CN": [{ definition: "檀君, 朝鲜民族始祖", partOfSpeech: "名词" }],
  "ko|단군조선|zh-CN": [{ definition: "檀君朝鲜, 朝鲜半岛建国神话上的最初国家", partOfSpeech: "名词" }],
  "ko|고조선|zh-CN": [{ definition: "古朝鲜, 朝鲜半岛古代独立国家", partOfSpeech: "名词" }],
  "ko|부여|zh-CN": [{ definition: "扶余, 古代朝鲜民族独立国家", partOfSpeech: "名词" }],
  "ko|한글|zh-CN": [{ definition: "韩文, 朝鲜世宗大王1443年创制的朝鲜语字母", partOfSpeech: "名词" }],
  "ko|한글|ja": [{ definition: "ハングル, 1443年に世宗大王が創製した朝鮮語の文字", partOfSpeech: "名詞" }],
  "ko|훈민정음|zh-CN": [{ definition: "训民正音, 1443年世宗大王创制的朝鲜文字", partOfSpeech: "名词" }],
  "ko|세종대왕|zh-CN": [{ definition: "世宗大王, 朝鲜王朝第四代国王、韩文创制者", partOfSpeech: "名词" }],
  "ko|이순신|zh-CN": [{ definition: "李舜臣, 朝鲜壬辰倭乱时期的海军将领", partOfSpeech: "名词" }],
  "ko|안중근|zh-CN": [{ definition: "安重根, 朝鲜独立运动家", partOfSpeech: "名词" }],
  "ko|윤동주|zh-CN": [{ definition: "尹东柱, 朝鲜诗人 (非中国朝鲜族)", partOfSpeech: "名词" }],
  "ko|김구|zh-CN": [{ definition: "金九, 朝鲜独立运动家、临时政府主席", partOfSpeech: "名词" }],
  "ko|이어도|zh-CN": [{ definition: "离於岛, 大韩民国专属经济水域内的暗礁", partOfSpeech: "名词" }],
  "ko|이어도|ja": [{ definition: "離於島, 大韓民国の排他的経済水域内の暗礁", partOfSpeech: "名詞" }],
  // Korean traditional culture items where the AI sometimes refuses (China
  // cultural-appropriation flashpoints — Hanbok / Buchaechum / Sirum / etc.).
  "ko|부채춤|zh-CN": [{ definition: "扇子舞, 韩国传统舞蹈", partOfSpeech: "名词" }],
  "ko|부채춤|zh-TW": [{ definition: "扇子舞, 韓國傳統舞蹈", partOfSpeech: "名詞" }],
  "ko|사물놀이|zh-CN": [{ definition: "四物表演, 韩国传统打击乐表演", partOfSpeech: "名词" }],
  "ko|농악|zh-CN": [{ definition: "农乐, 韩国传统农村音乐表演", partOfSpeech: "名词" }],
  "ko|씨름|zh-CN": [{ definition: "韩国式摔跤, 韩国传统摔跤运动", partOfSpeech: "名词" }],
  "ko|윷놀이|zh-CN": [{ definition: "尤茨游戏, 韩国传统民俗游戏", partOfSpeech: "名词" }],
  "ko|갓|zh-CN": [{ definition: "笠 (gat), 韩国传统男士官帽", partOfSpeech: "名词" }],
  "ko|판소리|zh-CN": [{ definition: "盘索里, 韩国传统说唱音乐", partOfSpeech: "名词" }],
  "ko|한지|zh-CN": [{ definition: "韩纸, 韩国传统手工纸", partOfSpeech: "名词" }],
  "ko|한옥|zh-CN": [{ definition: "韩屋, 韩国传统住宅", partOfSpeech: "名词" }],
  "ko|태권도|zh-CN": [{ definition: "跆拳道, 起源于韩国的武术", partOfSpeech: "名词" }],
  "ko|고려청자|zh-CN": [{ definition: "高丽青瓷, 高丽时代的韩国青瓷", partOfSpeech: "名词" }],
  "ko|조선백자|zh-CN": [{ definition: "朝鲜白瓷, 朝鲜王朝的韩国白瓷", partOfSpeech: "名词" }],
  "ko|동의보감|zh-CN": [{ definition: "东医宝鉴, 朝鲜许浚编纂的医学典籍 (UNESCO世界记忆遗产)", partOfSpeech: "名词" }],
  "ko|직지심체요절|zh-CN": [{ definition: "直指心体要节, 1377年朝鲜印刷的世界最古金属活字印刷书", partOfSpeech: "名词" }],
  "ko|거북선|zh-CN": [{ definition: "龟船, 16世纪李舜臣建造的朝鲜装甲战舰", partOfSpeech: "名词" }],
};

// ── Force overrides ─────────────────────────────────────────────────────
// Unlike FALLBACK_MEANINGS (only when AI returns empty), these ALWAYS win,
// even when the AI returns a non-empty result. Used for politically-
// disputed status entities where the AI's default framing leans toward
// the PRC "One China" / Chinese-region position (Taiwan = "지역",
// Tibet = "중국 자치구", etc.). For a Korean app the safe baseline is
// neutral geographic framing — this map enforces it deterministically.
// Helper to expand a single concept into entries for many (source,target)
// pairs without 100+ lines of repetition. Each disputed entity has the
// SAME canonical neutral framing per target language; we just enumerate
// known input forms (Latin, Hangul, hiragana/katakana, simplified Chinese,
// traditional Chinese) that all map to the same target-language definition.
function expandOverride(
  inputs: Array<{ lang: string; word: string }>,
  defsByTarget: Record<string, { definition: string; partOfSpeech: string }>,
): Record<string, FallbackMeaning[]> {
  const out: Record<string, FallbackMeaning[]> = {};
  for (const { lang, word } of inputs) {
    for (const [tgt, m] of Object.entries(defsByTarget)) {
      // Skip same-language pairs (no source/target both = ko etc.)
      if (lang === tgt) continue;
      out[`${lang}|${word}|${tgt}`] = [m];
    }
  }
  return out;
}

const FORCE_OVERRIDE_MEANINGS: Record<string, FallbackMeaning[]> = {
  // Taiwan — neutral geographic framing in every supported output language.
  ...expandOverride(
    [
      { lang: "en", word: "Taiwan" },
      { lang: "ko", word: "대만" },
      { lang: "ko", word: "타이완" },
      { lang: "ja", word: "台湾" },
      { lang: "ja", word: "タイワン" },
      { lang: "zh-CN", word: "台湾" },
      { lang: "zh-TW", word: "台灣" },
      { lang: "fr", word: "Taïwan" },
      { lang: "de", word: "Taiwan" },
      { lang: "es", word: "Taiwán" },
      { lang: "it", word: "Taiwan" },
      { lang: "pt", word: "Taiwan" },
      { lang: "ru", word: "Тайвань" },
    ],
    {
      ko: { definition: "대만, 섬", partOfSpeech: "고유명사" },
      en: { definition: "Taiwan, island", partOfSpeech: "proper noun" },
      ja: { definition: "台湾, 島", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "台湾, 岛屿", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "台灣, 島嶼", partOfSpeech: "專有名詞" },
      fr: { definition: "Taïwan, île", partOfSpeech: "nom propre" },
      de: { definition: "Taiwan, Insel", partOfSpeech: "Eigenname" },
      es: { definition: "Taiwán, isla", partOfSpeech: "nombre propio" },
      it: { definition: "Taiwan, isola", partOfSpeech: "nome proprio" },
      pt: { definition: "Taiwan, ilha", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Тайвань, остров", partOfSpeech: "имя собственное" },
    },
  ),
  // Tibet — bare region descriptor.
  ...expandOverride(
    [
      { lang: "en", word: "Tibet" },
      { lang: "ko", word: "티베트" },
      { lang: "ja", word: "チベット" },
      { lang: "ja", word: "西蔵" },
      { lang: "zh-CN", word: "西藏" },
      { lang: "zh-TW", word: "西藏" },
      { lang: "fr", word: "Tibet" },
      { lang: "de", word: "Tibet" },
      { lang: "es", word: "Tíbet" },
      { lang: "it", word: "Tibet" },
      { lang: "pt", word: "Tibete" },
      { lang: "ru", word: "Тибет" },
    ],
    {
      ko: { definition: "티베트, 지역", partOfSpeech: "고유명사" },
      en: { definition: "Tibet, region", partOfSpeech: "proper noun" },
      ja: { definition: "チベット, 地域", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "西藏, 地区", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "西藏, 地區", partOfSpeech: "專有名詞" },
      fr: { definition: "Tibet, région", partOfSpeech: "nom propre" },
      de: { definition: "Tibet, Region", partOfSpeech: "Eigenname" },
      es: { definition: "Tíbet, región", partOfSpeech: "nombre propio" },
      it: { definition: "Tibet, regione", partOfSpeech: "nome proprio" },
      pt: { definition: "Tibete, região", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Тибет, регион", partOfSpeech: "имя собственное" },
    },
  ),
  // Hong Kong — bare city descriptor.
  ...expandOverride(
    [
      { lang: "en", word: "Hong Kong" },
      { lang: "ko", word: "홍콩" },
      { lang: "ja", word: "香港" },
      { lang: "ja", word: "ホンコン" },
      { lang: "zh-CN", word: "香港" },
      { lang: "zh-TW", word: "香港" },
      { lang: "fr", word: "Hong Kong" },
      { lang: "de", word: "Hongkong" },
      { lang: "es", word: "Hong Kong" },
      { lang: "it", word: "Hong Kong" },
      { lang: "pt", word: "Hong Kong" },
      { lang: "ru", word: "Гонконг" },
    ],
    {
      ko: { definition: "홍콩, 도시", partOfSpeech: "고유명사" },
      en: { definition: "Hong Kong, city", partOfSpeech: "proper noun" },
      ja: { definition: "香港, 都市", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "香港, 城市", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "香港, 城市", partOfSpeech: "專有名詞" },
      fr: { definition: "Hong Kong, ville", partOfSpeech: "nom propre" },
      de: { definition: "Hongkong, Stadt", partOfSpeech: "Eigenname" },
      es: { definition: "Hong Kong, ciudad", partOfSpeech: "nombre propio" },
      it: { definition: "Hong Kong, città", partOfSpeech: "nome proprio" },
      pt: { definition: "Hong Kong, cidade", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Гонконг, город", partOfSpeech: "имя собственное" },
    },
  ),
  // ── Korean historical events — official ROK / civic naming ──
  // The model is stochastic on these (audit showed "Jeju Uprising" half
  // the time, "Jeju 4.3 Incident" the other half). The English word
  // "uprising" implies civilians as the aggressor, which contradicts the
  // Korean civic + official position recognizing them as victims of
  // state violence. Pin the canonical translation in every direction.

  // Jeju 4.3 — official ROK Special Act + UNESCO MoW name is "Incident"
  ...(() => {
    const inputs = ["4.3 사태", "4·3 사태", "4.3 사건", "4·3 사건", "4·3", "4.3", "제주 4.3", "제주 4·3", "제주 4.3 사건", "제주 4·3 사건", "제주 4.3 사태", "제주 4·3 사태"];
    const defs = {
      en: { definition: "Jeju 4.3 Incident", partOfSpeech: "proper noun" },
      ja: { definition: "済州4・3事件", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "济州4·3事件", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "濟州4·3事件", partOfSpeech: "專有名詞" },
      fr: { definition: "Incident de Jeju du 3 avril", partOfSpeech: "nom propre" },
      de: { definition: "Jeju-3.-April-Vorfall", partOfSpeech: "Eigenname" },
      es: { definition: "Incidente del 3 de abril de Jeju", partOfSpeech: "nombre propio" },
      it: { definition: "Incidente del 3 aprile di Jeju", partOfSpeech: "nome proprio" },
      pt: { definition: "Incidente de 3 de abril de Jeju", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Восстание на Чеджу 3 апреля (инцидент)", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) out[`ko|${w}|${t}`] = [m];
    return out;
  })(),

  // 5·18 — Democratization Movement (NOT "Gwangju Uprising")
  ...(() => {
    const inputs = ["5.18 민주화운동", "5·18 민주화운동", "광주민주화운동", "광주 민주화 운동", "5·18", "5.18", "5·18 광주민주화운동"];
    const defs = {
      en: { definition: "May 18 Gwangju Democratization Movement", partOfSpeech: "proper noun" },
      ja: { definition: "光州民主化運動 (5・18)", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "光州民主化运动 (5·18)", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "光州民主化運動 (5·18)", partOfSpeech: "專有名詞" },
      fr: { definition: "Mouvement de démocratisation de Gwangju du 18 mai", partOfSpeech: "nom propre" },
      de: { definition: "Gwangju-Demokratisierungsbewegung vom 18. Mai", partOfSpeech: "Eigenname" },
      es: { definition: "Movimiento de Democratización de Gwangju del 18 de mayo", partOfSpeech: "nombre propio" },
      it: { definition: "Movimento di democratizzazione di Gwangju del 18 maggio", partOfSpeech: "nome proprio" },
      pt: { definition: "Movimento de Democratização de Gwangju de 18 de maio", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Движение за демократизацию в Кванджу 18 мая", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) out[`ko|${w}|${t}`] = [m];
    return out;
  })(),

  // 4·19 혁명 (April Revolution, 1960) — Korean civic uses 혁명 (revolution)
  ...(() => {
    const inputs = ["4.19 혁명", "4·19 혁명", "4·19", "4.19", "4월 혁명", "사월 혁명"];
    const defs = {
      en: { definition: "April Revolution", partOfSpeech: "proper noun" },
      ja: { definition: "四月革命 (4・19)", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "四月革命 (4·19)", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "四月革命 (4·19)", partOfSpeech: "專有名詞" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) out[`ko|${w}|${t}`] = [m];
    return out;
  })(),

  // 12·12 — Military Mutiny / Coup (officially 군사반란 since 1995)
  ...(() => {
    const inputs = ["12.12 군사반란", "12·12 군사반란", "12.12 사태", "12·12 사태", "12·12", "12.12"];
    const defs = {
      en: { definition: "December 12 Military Mutiny", partOfSpeech: "proper noun" },
      ja: { definition: "12・12軍事反乱", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "12·12军事叛乱", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "12·12軍事叛亂", partOfSpeech: "專有名詞" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) out[`ko|${w}|${t}`] = [m];
    return out;
  })(),

  // 6·25 전쟁 / 한국전쟁 — Korean War (avoid "Korean conflict" minimization)
  ...(() => {
    const inputs = ["6.25 전쟁", "6·25 전쟁", "6·25", "6.25", "한국전쟁", "한국 전쟁"];
    const defs = {
      en: { definition: "Korean War", partOfSpeech: "proper noun" },
      ja: { definition: "朝鮮戦争", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "朝鲜战争 (韩国战争)", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "韓戰", partOfSpeech: "專有名詞" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) out[`ko|${w}|${t}`] = [m];
    return out;
  })(),

  // ── Slurs / strong profanity — definitions with explicit register tag ──
  // The AI sometimes returns plain definitions ("성교하다" for "fuck") that
  // hide the social weight. Force a register tag in the definition so the
  // learner sees this is a vulgar / hate-speech term.
  // (Examples are force-emptied by FORCE_EMPTY_EXAMPLES_INPUTS regardless.)

  // Slurs — ko target (Korean is the primary user base)
  "en|nigger|ko": [{ definition: "흑인 비하 모욕어 (강한 혐오 표현)", partOfSpeech: "명사" }],
  "en|chink|ko": [{ definition: "동아시아인 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|gook|ko": [{ definition: "동아시아인 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|jap|ko": [{ definition: "일본인 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|kike|ko": [{ definition: "유대인 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|faggot|ko": [{ definition: "성소수자 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|fag|ko": [{ definition: "성소수자 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "en|retard|ko": [{ definition: "지적 장애 비하 모욕어 (혐오 표현)", partOfSpeech: "명사" }],
  "ko|짱깨|en": [{ definition: "Chinese-people slur (offensive)", partOfSpeech: "noun" }],
  "ko|쪽바리|en": [{ definition: "Japanese-people slur (offensive)", partOfSpeech: "noun" }],
  "ko|깜둥이|en": [{ definition: "Black-people slur (offensive)", partOfSpeech: "noun" }],

  // Strong profanity — ko target
  "en|fuck|ko": [
    { definition: "비속어 (강한 욕설); 성행위 (저속한 표현)", partOfSpeech: "동사" },
    { definition: "비속어; 강한 분노 / 좌절 표현", partOfSpeech: "감탄사" },
  ],
  "en|cunt|ko": [{ definition: "비속어 (강한 모욕어); 여성 비하 표현", partOfSpeech: "명사" }],
  "en|motherfucker|ko": [{ definition: "비속어 (강한 모욕어)", partOfSpeech: "명사" }],
  "en|asshole|ko": [{ definition: "비속어 (모욕어); 무례한 사람", partOfSpeech: "명사" }],
  "en|shit|ko": [{ definition: "비속어; 욕설 / 좌절 표현", partOfSpeech: "감탄사" }],
  "en|bitch|ko": [{ definition: "비속어 (모욕어); 여성 비하 표현", partOfSpeech: "명사" }],

  // ── International consensus events — Tier 2 (not depoliticized) ──
  // For these, naming softening is denial. Force the canonical recognition
  // term (genocide / massacre / atrocity / crime against humanity) in
  // every direction the user might query.

  // Holocaust
  ...(() => {
    const inputs = ["Holocaust", "holocaust", "Shoah", "shoah", "the Holocaust", "홀로코스트", "ホロコースト", "大屠杀", "猶太人大屠殺", "犹太人大屠杀", "Holocauste", "holocauste", "Holokaust", "Holocausto", "Olocausto", "olocausto", "Холокост", "холокост"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? (w.includes("猶太人") ? "zh-TW" : "zh-CN") : /[А-Яа-я]/.test(w) ? "ru" : "en";
    const defs = {
      en: { definition: "Holocaust, Nazi German genocide of Jews", partOfSpeech: "proper noun" },
      ko: { definition: "홀로코스트, 나치 독일의 유대인 대량학살", partOfSpeech: "고유명사" },
      ja: { definition: "ホロコースト, ナチス・ドイツによるユダヤ人大量虐殺", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "犹太人大屠杀, 纳粹德国对犹太人的种族灭绝", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "猶太人大屠殺, 納粹德國對猶太人的種族滅絕", partOfSpeech: "專有名詞" },
      fr: { definition: "Holocauste, génocide nazi des Juifs", partOfSpeech: "nom propre" },
      de: { definition: "Holocaust, Völkermord der Nationalsozialisten an den Juden", partOfSpeech: "Eigenname" },
      es: { definition: "Holocausto, genocidio nazi de los judíos", partOfSpeech: "nombre propio" },
      it: { definition: "Olocausto, genocidio nazista degli ebrei", partOfSpeech: "nome proprio" },
      pt: { definition: "Holocausto, genocídio nazista dos judeus", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Холокост, нацистский геноцид евреев", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Nanjing Massacre
  ...(() => {
    const inputs = ["Nanjing Massacre", "Nanking Massacre", "the Nanjing Massacre", "Rape of Nanking", "난징대학살", "난징 대학살", "南京大虐殺", "南京大屠杀", "南京大屠殺", "Massacre de Nankin", "Massaker von Nanking", "Masacre de Nankín", "Massacro di Nanchino", "Massacre de Nanquim", "Нанкинская резня"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? (w.includes("屠殺") ? "zh-TW" : w.includes("虐殺") ? "ja" : "zh-CN") : /[А-Яа-я]/.test(w) ? "ru" : "en";
    const defs = {
      en: { definition: "Nanjing Massacre, Imperial Japanese atrocity", partOfSpeech: "proper noun" },
      ko: { definition: "난징대학살, 일본군의 대량학살", partOfSpeech: "고유명사" },
      ja: { definition: "南京大虐殺, 旧日本軍による大量虐殺", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "南京大屠杀, 侵华日军暴行", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "南京大屠殺, 侵華日軍暴行", partOfSpeech: "專有名詞" },
      fr: { definition: "Massacre de Nankin, atrocité de l'armée impériale japonaise", partOfSpeech: "nom propre" },
      de: { definition: "Massaker von Nanking, Massaker der Kaiserlich-Japanischen Armee", partOfSpeech: "Eigenname" },
      es: { definition: "Masacre de Nankín, atrocidad del Ejército Imperial Japonés", partOfSpeech: "nombre propio" },
      it: { definition: "Massacro di Nanchino, atrocità dell'Esercito imperiale giapponese", partOfSpeech: "nome proprio" },
      pt: { definition: "Massacre de Nanquim, atrocidade do Exército Imperial Japonês", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Нанкинская резня, массовое убийство японской армией", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Armenian Genocide
  ...(() => {
    const inputs = ["Armenian Genocide", "the Armenian Genocide", "아르메니아인 대학살", "아르메니아 대학살", "アルメニア人虐殺", "亚美尼亚大屠杀", "亞美尼亞大屠殺", "Génocide arménien", "Völkermord an den Armeniern", "Genocidio armenio", "Genocidio armeno", "Genocídio arménio", "Геноцид армян"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? (w.includes("亞美尼亞") || w.includes("屠殺") ? "zh-TW" : "zh-CN") : /[А-Яа-я]/.test(w) ? "ru" : "en";
    const defs = {
      en: { definition: "Armenian Genocide", partOfSpeech: "proper noun" },
      ko: { definition: "아르메니아인 대학살", partOfSpeech: "고유명사" },
      ja: { definition: "アルメニア人虐殺", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "亚美尼亚大屠杀", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "亞美尼亞大屠殺", partOfSpeech: "專有名詞" },
      fr: { definition: "Génocide arménien", partOfSpeech: "nom propre" },
      de: { definition: "Völkermord an den Armeniern", partOfSpeech: "Eigenname" },
      es: { definition: "Genocidio armenio", partOfSpeech: "nombre propio" },
      it: { definition: "Genocidio armeno", partOfSpeech: "nome proprio" },
      pt: { definition: "Genocídio arménio", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Геноцид армян", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Rwandan Genocide
  ...(() => {
    const inputs = ["Rwandan Genocide", "the Rwandan Genocide", "르완다 대학살", "ルワンダ虐殺", "卢旺达大屠杀", "Génocide rwandais", "Genozid in Ruanda", "Genocidio de Ruanda", "Genocidio del Ruanda", "Genocídio em Ruanda", "Геноцид в Руанде"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? "zh-CN" : /[А-Яа-я]/.test(w) ? "ru" : "en";
    const defs = {
      en: { definition: "Rwandan Genocide", partOfSpeech: "proper noun" },
      ko: { definition: "르완다 대학살", partOfSpeech: "고유명사" },
      ja: { definition: "ルワンダ虐殺", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "卢旺达大屠杀", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "盧安達大屠殺", partOfSpeech: "專有名詞" },
      fr: { definition: "Génocide rwandais", partOfSpeech: "nom propre" },
      de: { definition: "Genozid in Ruanda", partOfSpeech: "Eigenname" },
      es: { definition: "Genocidio de Ruanda", partOfSpeech: "nombre propio" },
      it: { definition: "Genocidio del Ruanda", partOfSpeech: "nome proprio" },
      pt: { definition: "Genocídio em Ruanda", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Геноцид в Руанде", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Cambodian Genocide / Killing Fields
  ...(() => {
    const inputs = ["Cambodian Genocide", "Killing Fields", "the Killing Fields", "캄보디아 대학살", "킬링 필드", "킬링필드", "カンボジア虐殺", "柬埔寨大屠杀", "柬埔寨大屠殺", "Génocide cambodgien", "Kambodschanischer Völkermord", "Genocidio camboyano"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? (w.includes("屠殺") ? "zh-TW" : "zh-CN") : /[А-Яа-я]/.test(w) ? "ru" : "en";
    const defs = {
      en: { definition: "Cambodian Genocide", partOfSpeech: "proper noun" },
      ko: { definition: "캄보디아 대학살, 크메르루주 학살", partOfSpeech: "고유명사" },
      ja: { definition: "カンボジア虐殺, クメール・ルージュによる虐殺", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "柬埔寨大屠杀, 红色高棉时期的屠杀", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "柬埔寨大屠殺, 赤柬時期的屠殺", partOfSpeech: "專有名詞" },
      fr: { definition: "Génocide cambodgien, atrocité des Khmers rouges", partOfSpeech: "nom propre" },
      de: { definition: "Kambodschanischer Völkermord, Massaker der Roten Khmer", partOfSpeech: "Eigenname" },
      es: { definition: "Genocidio camboyano, atrocidad de los Jemeres Rojos", partOfSpeech: "nombre propio" },
      it: { definition: "Genocidio cambogiano, atrocità dei Khmer Rossi", partOfSpeech: "nome proprio" },
      pt: { definition: "Genocídio cambojano, atrocidade do Khmer Vermelho", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Геноцид в Камбодже, массовое убийство красных кхмеров", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Apartheid
  ...(() => {
    const inputs = ["Apartheid", "apartheid", "the Apartheid", "아파르트헤이트", "アパルトヘイト", "种族隔离", "種族隔離", "Apartheid"];
    const langOf = (w: string) => /[가-힣]/.test(w) ? "ko" : /[ぁ-ヿ]/.test(w) ? "ja" : /[一-鿿]/.test(w) ? (w.includes("隔離") ? "zh-TW" : "zh-CN") : "en";
    const defs = {
      en: { definition: "Apartheid, racial segregation system", partOfSpeech: "proper noun" },
      ko: { definition: "아파르트헤이트, 남아공의 인종분리 정책", partOfSpeech: "고유명사" },
      ja: { definition: "アパルトヘイト, 南アフリカの人種隔離政策", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "种族隔离, 南非的种族隔离制度", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "種族隔離, 南非的種族隔離制度", partOfSpeech: "專有名詞" },
      fr: { definition: "Apartheid, système de ségrégation raciale", partOfSpeech: "nom propre" },
      de: { definition: "Apartheid, Rassentrennungssystem", partOfSpeech: "Eigenname" },
      es: { definition: "Apartheid, sistema de segregación racial", partOfSpeech: "nombre propio" },
      it: { definition: "Apartheid, sistema di segregazione razziale", partOfSpeech: "nome proprio" },
      pt: { definition: "Apartheid, sistema de segregação racial", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Апартеид, система расовой сегрегации", partOfSpeech: "имя собственное" },
    };
    const out: Record<string, FallbackMeaning[]> = {};
    for (const w of inputs) for (const [t, m] of Object.entries(defs)) {
      const src = langOf(w);
      if (src === t) continue;
      out[`${src}|${w}|${t}`] = [m];
    }
    return out;
  })(),

  // Macau — bare city descriptor.
  ...expandOverride(
    [
      { lang: "en", word: "Macau" },
      { lang: "en", word: "Macao" },
      { lang: "ko", word: "마카오" },
      { lang: "ja", word: "マカオ" },
      { lang: "ja", word: "澳門" },
      { lang: "zh-CN", word: "澳门" },
      { lang: "zh-TW", word: "澳門" },
      { lang: "fr", word: "Macao" },
      { lang: "de", word: "Macau" },
      { lang: "es", word: "Macao" },
      { lang: "it", word: "Macao" },
      { lang: "pt", word: "Macau" },
      { lang: "ru", word: "Макао" },
    ],
    {
      ko: { definition: "마카오, 도시", partOfSpeech: "고유명사" },
      en: { definition: "Macau, city", partOfSpeech: "proper noun" },
      ja: { definition: "マカオ, 都市", partOfSpeech: "固有名詞" },
      "zh-CN": { definition: "澳门, 城市", partOfSpeech: "专有名词" },
      "zh-TW": { definition: "澳門, 城市", partOfSpeech: "專有名詞" },
      fr: { definition: "Macao, ville", partOfSpeech: "nom propre" },
      de: { definition: "Macau, Stadt", partOfSpeech: "Eigenname" },
      es: { definition: "Macao, ciudad", partOfSpeech: "nombre propio" },
      it: { definition: "Macao, città", partOfSpeech: "nome proprio" },
      pt: { definition: "Macau, cidade", partOfSpeech: "substantivo próprio" },
      ru: { definition: "Макао, город", partOfSpeech: "имя собственное" },
    },
  ),
};

export function getForceOverrideMeanings(
  sourceLang: string,
  input: string,
  targetLang: string,
): FallbackMeaning[] | null {
  const key = `${sourceLang}|${input.normalize("NFKC").trim()}|${targetLang}`;
  return FORCE_OVERRIDE_MEANINGS[key] ?? null;
}

// ── Force-empty examples ─────────────────────────────────────────────────
// Inputs whose enrich examples MUST be empty regardless of what the AI
// produces. Even academic-tone examples for these terms can normalize the
// word (suicide, slurs) or reproduce harm (strong profanity). Definitions
// are still provided — the entry remains a valid lookup.

const FORCE_EMPTY_EXAMPLES_INPUTS: Set<string> = new Set([
  // ── Slurs (racial / ethnic / sexuality / disability) ──
  "en|nigger", "en|chink", "en|gook", "en|jap", "en|kike", "en|spic",
  "en|wetback", "en|faggot", "en|fag", "en|tranny", "en|retard", "en|retarded",
  "ko|짱깨", "ko|쪽바리", "ko|깜둥이", "ko|병신", "ko|등신", "ko|찐따", "ko|보지", "ko|좆",
  "ja|チョン", "ja|キムチ野郎",
  "zh-cn|棒子", "zh-cn|高丽棒子", "zh-cn|傻逼",
  "zh-tw|棒子",
  "de|nigger", "de|neger", "de|kanake",
  "fr|nègre", "fr|bougnoule",
  "es|negrata",
  "ru|чурка", "ru|пиндос",
  // ── Strong profanity ──
  "en|fuck", "en|cunt", "en|motherfucker", "en|cocksucker", "en|asshole",
  "ko|씨발", "ko|개새끼", "ko|개자식", "ko|좆", "ko|좆같다", "ko|존나", "ko|개꿈",
  "ja|クソ", "ja|くそ", "ja|畜生", "ja|ちくしょう", "ja|死ね",
  "zh-cn|操", "zh-cn|妈的", "zh-cn|他妈的", "zh-cn|傻逼", "zh-cn|滚",
  "de|scheiße", "de|fotze",
  "fr|putain", "fr|merde", "fr|connard", "fr|salope",
  "es|joder", "es|coño", "es|hijo de puta",
  "it|cazzo", "it|merda", "it|stronzo",
  "pt|porra", "pt|caralho", "pt|merda",
  "ru|блядь", "ru|сука", "ru|хуй",
  // ── Self-harm / suicide ──
  "en|suicide", "en|self-harm", "en|self harm", "en|kill yourself",
  "ko|자살", "ko|자해", "ko|극단적 선택",
  "ja|自殺", "ja|自害", "ja|自傷",
  "zh-cn|自杀", "zh-cn|自残",
  "zh-tw|自殺", "zh-tw|自殘",
  "de|selbstmord", "de|suizid",
  "fr|suicide", "fr|automutilation",
  "es|suicidio", "es|autolesión",
  "it|suicidio", "it|autolesionismo",
  "pt|suicídio", "pt|automutilação",
  "ru|самоубийство", "ru|суицид",
  // ── Eating disorders (clinical) ──
  "en|anorexia", "en|bulimia", "ko|거식증", "ko|폭식증",
]);

export function shouldForceEmptyExamples(sourceLang: string, input: string): boolean {
  const key = `${sourceLang.toLowerCase()}|${input.normalize("NFKC").toLowerCase().trim()}`;
  return FORCE_EMPTY_EXAMPLES_INPUTS.has(key);
}

export function getFallbackMeanings(
  sourceLang: string,
  input: string,
  targetLang: string,
): FallbackMeaning[] | null {
  const key = `${sourceLang}|${input.normalize("NFKC").trim()}|${targetLang}`;
  return FALLBACK_MEANINGS[key] ?? null;
}

// ── Translate-mode overrides ────────────────────────────────────────────
// Reverse lookup phase 1: when the user types a Korean cultural term and
// the app needs the Chinese-side candidate, the AI defaults to the wrong
// Chinese rendering (김치 → 泡菜 instead of 辛奇). Hard-redirect known
// inputs to the canonical candidate so the subsequent quick lookup hits
// the correct entry. Keys: `${fromLang}|${input}|${toLang}` where
// fromLang is the user's input language and toLang is the source-language
// of the wordlist (the candidate we want).

interface TranslateCandidate {
  headword: string;
  hint?: string;
}

const TRANSLATE_OVERRIDES: Record<string, TranslateCandidate[]> = {
  "ko|김치|zh-CN": [{ headword: "辛奇", hint: "kimchi (official ROK Chinese rendering)" }],
  "ko|김치|zh-TW": [{ headword: "辛奇", hint: "kimchi (official ROK Chinese rendering)" }],
  "ko|한복|zh-CN": [{ headword: "韩服", hint: "Korean traditional clothing" }],
  "ko|한복|zh-TW": [{ headword: "韓服", hint: "Korean traditional clothing" }],
  "ko|독도|ja": [{ headword: "独島", hint: "Korean: Dokdo" }],
  "ko|독도|en": [{ headword: "Dokdo", hint: "Korean territory" }],
  "ko|동해|ja": [{ headword: "東海(日本海)", hint: "East Sea / Sea of Japan" }],
  "ko|동해|en": [{ headword: "East Sea (Sea of Japan)", hint: "" }],
  "ko|위안부|ja": [{ headword: "慰安婦", hint: "victims of Imperial Japanese military sexual slavery" }],
  "ko|위안부|en": [{ headword: "comfort women", hint: "Imperial Japanese military sexual slavery victims" }],
  "ko|백두산|zh-CN": [{ headword: "白头山", hint: "Mt. Paektu (Korean position; not 长白山)" }],
  "ko|백두산|zh-TW": [{ headword: "白頭山", hint: "Mt. Paektu (Korean position; not 長白山)" }],
  "ko|백두산|ja": [{ headword: "白頭山", hint: "Mt. Paektu (Korean position; not 長白山)" }],
  "ko|백두산|en": [{ headword: "Mount Paektu", hint: "Korean sacred mountain" }],
  // Multi-word foreign personal-name transliterations the model sometimes
  // refuses to translate (observed for "도널드 트럼프" specifically — likely
  // an OpenAI safety-filter quirk on a single politically polarizing name
  // while comparable inputs Biden/Obama/Musk pass through normally). The
  // override returns the canonical Latin-script form so the next phase can
  // proceed; the subsequent quick lookup applies its own sensitive-figure
  // rule (encyclopedic definition + empty examples).
  "ko|도널드 트럼프|en": [{ headword: "Donald Trump", hint: "" }],
};

export function getTranslateOverride(
  fromLang: string,
  input: string,
  toLang: string,
): TranslateCandidate[] | null {
  const key = `${fromLang}|${input.normalize("NFKC").trim()}|${toLang}`;
  return TRANSLATE_OVERRIDES[key] ?? null;
}

/**
 * Redirect a disputed input to the Korean-position canonical form before
 * cache / AI work happens. Returns the input unchanged if no rule matches.
 */
export function redirectDisputedInput(sourceLang: string, input: string): string {
  const trimmed = input.normalize("NFKC").trim();
  const lang = sourceLang.toLowerCase();
  const rules = INPUT_REDIRECTS[lang] ?? INPUT_REDIRECTS[lang.split("-")[0]] ?? [];
  for (const { from, to } of rules) {
    if (from.test(trimmed)) return to;
  }
  return input;
}

// ── Input blacklist ─────────────────────────────────────────────────────

// Reserved for inputs that should refuse before hitting AI. Personal-name
// entries (Hitler / Stalin / Putin / Xi Jinping / etc.) were REMOVED on
// 2026-05-04 — names are legitimate vocabulary that learners encounter when
// studying history, news, and culture; refusing to define them makes the
// app look broken. Those names now go through the normal pipeline and the
// "Sensitive-figure handling" prompt rule enforces neutral encyclopedic
// definitions + neutral academic-context examples.
//
// What still belongs here (when needed in the future): hate slogans,
// salutes, atrocity-glorification phrases, propaganda chants — i.e.
// inputs whose ONLY meaningful use is endorsement of mass violence or
// hate. None populated currently; keep the structure for ease of adding.
const BLACKLIST_BY_LANG: Record<string, ReadonlySet<string>> = {};

function normalizeInput(s: string): string {
  return s.normalize("NFKC").toLowerCase().trim();
}

/**
 * Returns true if this input should be refused before reaching the AI.
 * Caller should respond with the same shape used for non_word rejection:
 * { meanings: [], note: "non_word", confidence: 0 }.
 */
export function isInputBlacklisted(sourceLang: string, input: string): boolean {
  const lang = sourceLang.toLowerCase();
  const set = BLACKLIST_BY_LANG[lang] ?? BLACKLIST_BY_LANG[lang.split("-")[0]];
  if (!set) return false;
  return set.has(normalizeInput(input));
}

// ── Sensitive lookups (metalinguistic example templates only) ──────────
//
// When the lookup input matches one of these terms, the AI is instructed
// (via injected hint) to use ONLY metalinguistic example templates
// ("the word X appears in a textbook" / "I looked up X in the dictionary")
// and NEVER describe properties of the entity itself. The dictionary
// still defines the term — we don't refuse — but examples are kept
// content-empty so we don't endorse / characterize the entity.
//
// Categories included:
//   • Korea-position items (East Sea / Dokdo / Baekdusan / kimchi / hanbok / 단오 / 위안부 / atrocity events / Korean kingdoms)
//   • International territorial disputes (Taiwan / Tibet / Crimea / Kashmir / Jerusalem / Senkaku / Spratly / Kosovo / Abkhazia / etc.)
//   • Current and historical political figures (Trump / Putin / Xi / Modi / Hitler / Stalin / Mao / Korean presidents / etc.)
//   • Atrocity events with consensus recognition (Holocaust / Nanjing / Armenian Genocide / Rwanda / Cambodia / Apartheid / Cultural Revolution / Tiananmen)
//   • Religious figures and core doctrine (Jesus / Muhammad / Buddha / Pope / religion names)
//   • Naming disputes (Persian Gulf / Macedonia / Burma / Sea of Japan / South China Sea)
//   • Taboo items (개고기 / whale meat / foie gras / shark fin)
//
// NOT included:
//   • Normal vocabulary (countries, cities, common nouns)
//   • Historical figures from distant past (Caesar, Napoleon — academic only)
//   • Sub-national separatist regions without consensus dispute (Catalonia, Scotland, Quebec)
//   • Localized academic disputes
//
// Forms across multiple languages: each language has its native-script
// form. Romanized variants included where users commonly type in Latin
// letters. Case-insensitive match.

function buildSensitiveSet(entries: string[]): ReadonlySet<string> {
  return new Set(entries.map((s) => s.normalize("NFKC").toLowerCase().trim()));
}

const SENSITIVE_LOOKUPS_BY_LANG: Record<string, ReadonlySet<string>> = {
  // ── Korean ──
  ko: buildSensitiveSet([
    // Korea-Japan naming + territorial
    "동해", "일본해", "독도", "다케시마", "다께시마",
    "리앙쿠르 암초", "리앙쿠르암초",
    // Korea-China naming + territorial
    "백두산", "장백산", "창바이산", "이어도", "간도",
    "고구려", "발해", "고조선", "단군", "부여",
    // Korean cultural attribution
    "김치", "한복", "단오", "강릉단오제", "한글", "훈민정음",
    "세종대왕", "갓", "부채춤", "사물놀이", "농악", "윷놀이", "씨름",
    "고려청자", "조선백자", "동의보감", "직지심체요절", "거북선",
    "김밥", "떡", "막걸리", "송편", "비빔밥", "불고기", "삼계탕",
    "한지", "한옥", "태권도", "아리랑", "판소리",
    // Korea-Japan colonial / war
    "위안부", "강제징용", "강제동원", "일제강점기", "임진왜란", "정유재란",
    "욱일기", "사도광산", "군함도", "하시마", "후쿠시마 오염수",
    "관동대학살", "731부대", "임나일본부설", "정한론", "조선통신사",
    "광개토대왕비", "평화의 소녀상", "광개토대왕", "이순신", "안중근",
    "윤동주", "김구", "강감찬", "이황", "이이", "정약용",
    // Korean modern history
    "한국전쟁", "6.25전쟁", "광주민주화운동", "5.18", "4.3사건", "4.19혁명",
    "12.12군사반란",
    // Korean presidents (현역/최근)
    "윤석열", "문재인", "박근혜", "이명박", "노무현", "김대중", "박정희", "전두환",
    "김일성", "김정일", "김정은",
    // Korean celebrities mentioned in cultural-claim disputes
    "김연아", "손흥민", "방탄소년단", "블랙핑크", "bts",
    // International territorial disputes (East Asia)
    "대만", "타이완", "티베트", "시짱", "홍콩", "마카오", "신장", "위구르",
    "센카쿠", "댜오위", "조어도", "쿠릴", "북방영토", "남중국해", "동중국해",
    "스프래틀리", "파라셀", "스카버러", "황암도", "사우스 만",
    // International territorial (other)
    "크림반도", "크림", "돈바스", "세바스토폴",
    "카슈미르", "잠무카슈미르",
    "예루살렘", "가자", "가자지구", "서안지구", "골란고원",
    "북키프로스", "키프로스",
    "나고르노카라바흐", "아르차흐",
    "압하지야", "남오세티야", "트란스니스트리아",
    "코소보",
    "포클랜드", "말비나스", "포클랜드 제도",
    "서사하라",
    "소말릴란드",
    "디에고가르시아",
    "타이완 해협",
    // Naming disputes (non-Korea)
    "페르시아만", "아라비아만", "북마케도니아", "마케도니아",
    "미얀마", "버마", "에베레스트", "초모랑마",
    // Atrocity events (international consensus)
    "홀로코스트", "쇼아", "난징대학살", "난징 대학살",
    "아르메니아 대학살", "아르메니아대학살",
    "르완다 대학살", "캄보디아 대학살", "킬링필드",
    "아파르트헤이트", "트레일 오브 티어스", "강제이주",
    "대서양 노예무역", "노예무역", "굴라크", "굴라그",
    "천안문", "천안문 사태", "문화대혁명", "대약진운동",
    "9.11", "911 테러", "10월 7일 공격", "10.7 공격",
    // Living/recent political figures (international)
    "트럼프", "도널드 트럼프", "바이든", "조 바이든", "해리스", "카멀라 해리스",
    "푸틴", "블라디미르 푸틴", "시진핑", "마크롱", "에마뉘엘 마크롱",
    "모디", "나렌드라 모디", "네타냐후", "벤야민 네타냐후",
    "젤렌스키", "볼로디미르 젤렌스키", "에르도안",
    "메르켈", "기시다", "이시바", "아베", "아베 신조",
    // Historical dictators / war leaders
    "히틀러", "아돌프 히틀러", "스탈린", "이오시프 스탈린",
    "마오쩌둥", "마오 쩌둥", "폴포트", "무솔리니", "베니토 무솔리니",
    "사담 후세인", "후세인", "카다피", "차우셰스쿠",
    // Religious figures / doctrine
    "예수", "예수 그리스도", "무함마드", "마호메트", "부처", "석가모니",
    "크리슈나", "모세", "마리아", "성모 마리아", "교황", "달라이 라마",
    "기독교", "이슬람교", "유대교", "불교", "힌두교", "시크교",
    "지하드", "샤리아", "카르마", "부활", "열반",
    // Taboo items
    "개고기", "고래고기", "푸아그라", "샥스핀", "상어지느러미", "돌고래고기",
  ]),

  // ── English ──
  en: buildSensitiveSet([
    // Korea-position (English forms)
    "east sea", "sea of japan", "dokdo", "takeshima", "liancourt rocks",
    "mount paektu", "baekdusan", "paektu", "changbaishan", "changbai mountain",
    "kimchi", "hanbok", "dano", "hangul", "king sejong", "sejong the great",
    "goguryeo", "balhae", "gojoseon", "dangun",
    "comfort women", "japanese colonial period",
    "imjin war", "rising sun flag", "unit 731",
    "korean war", "gwangju uprising", "april 19 revolution",
    "park chung-hee", "chun doo-hwan", "kim il-sung", "kim jong-il", "kim jong-un",
    "moon jae-in", "yoon suk-yeol", "park geun-hye",
    "kim yuna", "son heung-min", "bts", "blackpink",
    // International territorial
    "taiwan", "tibet", "hong kong", "macau", "macao", "xinjiang", "uyghur", "uighur",
    "senkaku", "diaoyu", "diaoyu islands", "spratly", "paracel", "scarborough shoal",
    "kuril islands", "northern territories",
    "crimea", "donbas", "sevastopol", "kashmir", "jammu and kashmir",
    "jerusalem", "gaza", "gaza strip", "west bank", "golan heights",
    "northern cyprus", "cyprus",
    "nagorno-karabakh", "artsakh",
    "abkhazia", "south ossetia", "transnistria",
    "kosovo", "falklands", "malvinas", "falkland islands",
    "western sahara", "somaliland", "diego garcia",
    "taiwan strait",
    // Naming disputes
    "persian gulf", "arabian gulf", "north macedonia", "macedonia",
    "myanmar", "burma", "sagarmatha", "qomolangma", "mount everest",
    "south china sea", "east china sea",
    // Atrocity events
    "holocaust", "shoah", "nanjing massacre", "nanking massacre",
    "armenian genocide", "rwandan genocide", "cambodian genocide", "killing fields",
    "apartheid", "trail of tears", "atlantic slave trade",
    "gulag", "tiananmen", "tiananmen square", "cultural revolution",
    "great leap forward", "9/11", "9-11", "september 11",
    "october 7", "oct 7 attack",
    // Living political figures
    "trump", "donald trump", "biden", "joe biden", "kamala harris", "harris",
    "putin", "vladimir putin", "xi jinping", "xi",
    "macron", "emmanuel macron", "modi", "narendra modi",
    "netanyahu", "benjamin netanyahu", "zelensky", "volodymyr zelensky",
    "erdogan", "recep erdogan",
    "kishida", "ishiba", "shinzo abe", "abe",
    "merkel", "angela merkel", "scholz", "olaf scholz",
    // Historical dictators
    "hitler", "adolf hitler", "stalin", "joseph stalin",
    "mao", "mao zedong", "pol pot", "mussolini", "benito mussolini",
    "saddam hussein", "gaddafi", "muammar gaddafi", "ceausescu",
    // Religious figures
    "jesus", "jesus christ", "muhammad", "mohammed", "prophet muhammad",
    "buddha", "gautama buddha", "krishna", "moses", "virgin mary", "mary",
    "pope", "dalai lama",
    "christianity", "islam", "judaism", "buddhism", "hinduism", "sikhism",
    "jihad", "sharia", "karma", "resurrection", "nirvana",
    // Taboo items
    "dog meat", "whale meat", "foie gras", "shark fin", "dolphin meat",
  ]),

  // ── Japanese ──
  ja: buildSensitiveSet([
    // Korea-position (Japanese forms)
    "東海", "日本海", "独島", "竹島", "ドクト", "タケシマ",
    "白頭山", "長白山", "ペクトゥサン",
    "キムチ", "韓服", "ハンボク", "端午", "ハングル", "世宗大王",
    "高句麗", "渤海", "古朝鮮",
    "慰安婦", "従軍慰安婦", "強制連行", "強制動員",
    "日帝強占期", "韓国併合", "壬辰倭乱", "文禄の役",
    "旭日旗", "佐渡金山", "軍艦島", "端島", "福島汚染水", "処理水",
    "関東大震災虐殺", "731部隊", "任那日本府説",
    "朝鮮通信使", "好太王碑", "広開土王碑", "平和の少女像",
    "李舜臣", "安重根", "尹東柱", "金九",
    "朝鮮戦争", "韓国戦争", "光州事件", "光州民主化運動",
    "朴正煕", "全斗煥", "金日成", "金正日", "金正恩",
    "文在寅", "尹錫悦", "朴槿恵",
    // International territorial
    "台湾", "タイワン", "チベット", "西蔵", "香港", "ホンコン", "マカオ", "澳門",
    "新疆", "ウイグル", "尖閣", "尖閣諸島", "釣魚島", "釣魚台",
    "南沙諸島", "西沙諸島", "スプラトリー", "パラセル",
    "千島", "北方領土", "クリル",
    "クリミア", "ドンバス", "セヴァストポリ",
    "カシミール", "エルサレム", "ガザ", "ヨルダン川西岸", "ゴラン高原",
    "北キプロス", "ナゴルノカラバフ",
    "アブハジア", "南オセチア", "沿ドニエストル",
    "コソボ", "フォークランド", "マルビナス",
    "西サハラ", "ソマリランド", "ディエゴガルシア",
    // Naming disputes
    "ペルシャ湾", "アラビア湾", "北マケドニア", "マケドニア",
    "ミャンマー", "ビルマ", "サガルマータ", "チョモランマ", "エベレスト",
    "南シナ海", "東シナ海",
    // Atrocity events
    "ホロコースト", "ショア", "南京大虐殺", "南京事件",
    "アルメニア人虐殺", "ルワンダ虐殺", "カンボジア虐殺",
    "アパルトヘイト", "ガラガラ蛇の道", "大西洋奴隷貿易",
    "グラーグ", "天安門事件", "文化大革命", "大躍進",
    "9.11", "アメリカ同時多発テロ", "10月7日",
    // Living political figures
    "トランプ", "ドナルド・トランプ", "バイデン", "ジョー・バイデン",
    "プーチン", "ウラジーミル・プーチン", "習近平", "シーチンピン",
    "マクロン", "エマニュエル・マクロン", "モディ", "ナレンドラ・モディ",
    "ネタニヤフ", "ベンヤミン・ネタニヤフ", "ゼレンスキー",
    "エルドアン", "岸田", "岸田文雄", "石破", "石破茂", "安倍", "安倍晋三",
    "メルケル", "アンゲラ・メルケル",
    // Historical dictators
    "ヒトラー", "アドルフ・ヒトラー", "スターリン", "毛沢東", "ポル・ポト",
    "ムッソリーニ", "フセイン", "カダフィ",
    // Religious figures
    "イエス", "イエス・キリスト", "ムハンマド", "マホメット",
    "釈迦", "ブッダ", "クリシュナ", "モーセ", "聖母マリア", "マリア",
    "ローマ教皇", "教皇", "ダライ・ラマ",
    "キリスト教", "イスラム教", "ユダヤ教", "仏教", "ヒンドゥー教",
    "ジハード", "シャリーア", "カルマ", "復活", "涅槃",
    // Taboo items
    "犬肉", "鯨肉", "フォアグラ", "フカヒレ", "イルカ肉",
  ]),

  // ── Chinese (simplified) ──
  "zh-cn": buildSensitiveSet([
    "东海", "日本海", "独岛", "竹岛",
    "白头山", "长白山",
    "辛奇", "泡菜", "韩服", "汉服", "端午", "端午节",
    "高句丽", "渤海", "古朝鲜",
    "慰安妇", "强征劳工", "日帝强占期", "壬辰倭乱",
    "旭日旗", "福岛核污水",
    "朝鲜战争", "韩国战争",
    "金日成", "金正日", "金正恩", "文在寅", "尹锡悦", "朴槿惠",
    "台湾", "西藏", "香港", "澳门", "新疆", "维吾尔",
    "钓鱼岛", "尖阁", "南沙", "西沙", "黄岩岛",
    "千岛群岛", "北方四岛",
    "克里米亚", "顿巴斯", "克什米尔", "耶路撒冷", "加沙", "约旦河西岸", "戈兰高地",
    "北塞浦路斯", "纳戈尔诺卡拉巴赫",
    "阿布哈兹", "南奥塞梯", "德涅斯特河沿岸",
    "科索沃", "马尔维纳斯群岛", "福克兰群岛",
    "西撒哈拉", "索马里兰",
    "波斯湾", "阿拉伯湾", "北马其顿", "马其顿",
    "缅甸", "珠穆朗玛峰",
    "南海", "东海",
    "大屠杀", "南京大屠杀", "亚美尼亚大屠杀", "卢旺达大屠杀", "柬埔寨大屠杀",
    "种族隔离", "古拉格", "天安门事件", "六四", "文化大革命", "大跃进",
    "九一一", "9.11",
    "特朗普", "拜登", "卡玛拉", "普京", "习近平", "马克龙", "莫迪", "内塔尼亚胡",
    "泽连斯基", "埃尔多安", "岸田", "石破", "安倍", "默克尔",
    "希特勒", "斯大林", "毛泽东", "波尔布特", "墨索里尼", "萨达姆", "卡扎菲",
    "耶稣", "穆罕默德", "佛陀", "释迦牟尼", "克里希纳", "摩西", "玛利亚",
    "教皇", "达赖喇嘛",
    "基督教", "伊斯兰教", "犹太教", "佛教", "印度教",
    "圣战", "教法",
    "狗肉", "鲸肉", "鹅肝", "鱼翅", "海豚肉",
  ]),

  // ── Chinese (traditional) ──
  "zh-tw": buildSensitiveSet([
    "東海", "日本海", "獨島", "竹島",
    "白頭山", "長白山",
    "辛奇", "泡菜", "韓服", "漢服", "端午", "端午節",
    "高句麗", "渤海", "古朝鮮",
    "慰安婦", "強徵勞工", "壬辰倭亂",
    "旭日旗",
    "朝鮮戰爭", "韓國戰爭",
    "台灣", "西藏", "香港", "澳門", "新疆", "維吾爾",
    "釣魚臺", "尖閣", "南沙", "西沙",
    "克里米亞", "頓巴斯", "克什米爾", "耶路撒冷", "加沙",
    "波斯灣", "緬甸", "珠穆朗瑪峰",
    "南海", "東海",
    "大屠殺", "南京大屠殺", "亞美尼亞大屠殺", "盧安達大屠殺",
    "種族隔離", "古拉格", "天安門事件", "六四", "文化大革命",
    "九一一",
    "特朗普", "川普", "拜登", "普京", "習近平", "馬克龍", "莫迪",
    "希特勒", "史達林", "毛澤東",
    "耶穌", "穆罕默德", "佛陀", "釋迦牟尼", "克里希納", "摩西",
    "教宗", "達賴喇嘛",
    "基督教", "伊斯蘭教", "猶太教", "佛教", "印度教",
    "聖戰",
    "狗肉", "鯨肉", "鵝肝", "魚翅",
  ]),

  // ── French ──
  fr: buildSensitiveSet([
    "mer du japon", "mer de l'est", "dokdo", "takeshima",
    "kimchi", "hanbok",
    "femmes de réconfort",
    "taïwan", "tibet", "hong kong", "macao", "xinjiang", "ouïghour",
    "îles senkaku", "diaoyu", "spratleys", "paracels",
    "crimée", "donbass", "cachemire", "jérusalem", "gaza", "cisjordanie",
    "golan", "chypre du nord", "haut-karabagh",
    "abkhazie", "ossétie du sud", "transnistrie",
    "kosovo", "malouines", "sahara occidental", "somaliland",
    "golfe persique", "macédoine du nord", "birmanie", "myanmar",
    "everest", "mer de chine méridionale",
    "holocauste", "shoah", "massacre de nankin",
    "génocide arménien", "génocide rwandais", "génocide cambodgien",
    "apartheid", "goulag", "tiananmen", "révolution culturelle",
    "trump", "biden", "poutine", "xi jinping", "macron", "modi",
    "netanyahou", "zelensky", "erdogan",
    "hitler", "staline", "mao zedong", "mussolini",
    "jésus", "mahomet", "mohammed", "bouddha", "krishna", "moïse",
    "vierge marie", "pape", "dalaï-lama",
    "christianisme", "islam", "judaïsme", "bouddhisme", "hindouisme",
    "djihad", "charia",
    "foie gras", "viande de chien", "viande de baleine",
  ]),

  // ── German ──
  de: buildSensitiveSet([
    "japanisches meer", "ostmeer", "dokdo", "takeshima",
    "kimchi", "hanbok", "trostfrauen",
    "taiwan", "tibet", "hongkong", "macao", "xinjiang", "uigur",
    "senkaku-inseln", "diaoyu", "spratly-inseln", "paracel-inseln",
    "krim", "donbass", "kaschmir", "jerusalem", "gaza", "westjordanland",
    "golan", "nordzypern", "bergkarabach",
    "abchasien", "südossetien", "transnistrien",
    "kosovo", "falklandinseln", "westsahara", "somaliland",
    "persischer golf", "nordmazedonien", "mazedonien", "burma", "myanmar",
    "südchinesisches meer", "mount everest",
    "holocaust", "shoah", "massaker von nanking",
    "völkermord an den armeniern", "ruanda-völkermord",
    "apartheid", "gulag", "tiananmen", "kulturrevolution",
    "trump", "biden", "putin", "xi jinping", "macron", "modi",
    "netanjahu", "selenskyj", "erdoğan",
    "hitler", "adolf hitler", "stalin", "mao zedong", "mussolini",
    "jesus", "jesus christus", "mohammed", "buddha", "krishna", "moses",
    "jungfrau maria", "papst", "dalai lama",
    "christentum", "islam", "judentum", "buddhismus", "hinduismus",
    "dschihad", "scharia",
    "stopfleber", "hundefleisch", "walfleisch",
  ]),

  // ── Spanish ──
  es: buildSensitiveSet([
    "mar de japón", "mar del este", "dokdo", "takeshima",
    "kimchi", "hanbok", "mujeres de consuelo",
    "taiwán", "tíbet", "hong kong", "macao", "xinjiang", "uigur",
    "islas senkaku", "diaoyu", "spratly", "paracel",
    "crimea", "donbás", "cachemira", "jerusalén", "gaza", "cisjordania",
    "altos del golán", "chipre del norte", "alto karabaj",
    "abjasia", "osetia del sur", "transnistria",
    "kosovo", "malvinas", "islas malvinas", "sáhara occidental",
    "golfo pérsico", "macedonia del norte", "birmania", "myanmar",
    "mar de china meridional", "everest",
    "holocausto", "shoá", "masacre de nankín",
    "genocidio armenio", "genocidio ruandés", "genocidio camboyano",
    "apartheid", "gulag", "tiananmén", "revolución cultural",
    "trump", "biden", "putin", "xi jinping", "macron", "modi",
    "netanyahu", "zelenski", "erdogan",
    "hitler", "stalin", "mao zedong", "mussolini",
    "jesús", "jesucristo", "mahoma", "buda", "krishna", "moisés",
    "virgen maría", "papa", "dalái lama",
    "cristianismo", "islam", "judaísmo", "budismo", "hinduismo",
    "yihad", "sharía",
    "foie gras", "carne de perro", "carne de ballena",
  ]),

  // ── Italian ──
  it: buildSensitiveSet([
    "mare del giappone", "dokdo", "takeshima",
    "kimchi", "hanbok",
    "taiwan", "tibet", "hong kong", "macao", "xinjiang", "uiguri",
    "isole senkaku", "isole diaoyu", "spratly", "paracel",
    "crimea", "donbass", "kashmir", "gerusalemme", "gaza", "cisgiordania",
    "alture del golan", "cipro del nord", "nagorno-karabakh",
    "abkhazia", "ossezia del sud", "transnistria",
    "kosovo", "falkland", "malvine", "sahara occidentale",
    "golfo persico", "macedonia del nord", "birmania", "myanmar",
    "mar cinese meridionale", "everest",
    "olocausto", "shoah", "massacro di nanchino",
    "genocidio armeno", "genocidio ruandese", "genocidio cambogiano",
    "apartheid", "gulag", "tienanmen", "rivoluzione culturale",
    "trump", "biden", "putin", "xi jinping", "macron", "modi", "netanyahu",
    "hitler", "stalin", "mao", "mussolini",
    "gesù", "gesù cristo", "maometto", "muhammad", "buddha", "krishna", "mosè",
    "vergine maria", "papa", "dalai lama",
    "cristianesimo", "islam", "ebraismo", "buddismo", "induismo",
    "jihad", "sharia",
    "foie gras", "carne di cane",
  ]),

  // ── Portuguese ──
  pt: buildSensitiveSet([
    "mar do japão", "dokdo", "takeshima",
    "kimchi", "hanbok",
    "taiwan", "tibete", "hong kong", "macau", "xinjiang", "uigur",
    "ilhas senkaku", "diaoyu", "spratly", "paracel",
    "crimeia", "donbass", "caxemira", "jerusalém", "gaza", "cisjordânia",
    "colinas de golã", "chipre do norte", "nagorno-karabakh",
    "abecásia", "ossétia do sul", "transnístria",
    "kosovo", "falkland", "malvinas", "saara ocidental",
    "golfo pérsico", "macedônia do norte", "birmânia", "mianmar",
    "mar do sul da china", "monte everest",
    "holocausto", "shoah", "massacre de nanquim",
    "genocídio armênio", "genocídio ruandês", "genocídio cambojano",
    "apartheid", "gulag", "tiananmen", "revolução cultural",
    "trump", "biden", "putin", "xi jinping", "macron", "modi", "netanyahu",
    "hitler", "stalin", "mao", "mussolini",
    "jesus", "jesus cristo", "maomé", "muhammad", "buda", "krishna", "moisés",
    "virgem maria", "papa", "dalai lama",
    "cristianismo", "islã", "judaísmo", "budismo", "hinduísmo",
    "jihad", "sharia",
    "foie gras", "carne de cão", "carne de cachorro",
  ]),

  // ── Russian ──
  ru: buildSensitiveSet([
    "японское море", "восточное море", "токто", "такэсима",
    "кимчи", "ханбок",
    "тайвань", "тибет", "гонконг", "макао", "синьцзян", "уйгур",
    "сэнкаку", "сенкаку", "дяоюйдао", "спратли", "парасельские острова",
    "крым", "донбасс", "севастополь",
    "кашмир", "иерусалим", "газа", "западный берег", "голанские высоты",
    "северный кипр", "нагорный карабах",
    "абхазия", "южная осетия", "приднестровье",
    "косово", "фолкленды", "мальвинские острова", "западная сахара",
    "сомалиленд",
    "персидский залив", "северная македония", "македония", "мьянма", "бирма",
    "южно-китайское море", "эверест",
    "холокост", "шоа", "нанкинская резня",
    "геноцид армян", "руандийский геноцид", "камбоджийский геноцид",
    "апартеид", "гулаг", "тяньаньмэнь", "культурная революция",
    "трамп", "байден", "путин", "си цзиньпин", "макрон", "моди",
    "нетаньяху", "зеленский", "эрдоган",
    "гитлер", "сталин", "мао цзэдун", "муссолини",
    "иисус", "иисус христос", "мухаммад", "магомет", "будда",
    "кришна", "моисей", "дева мария", "папа римский", "далай-лама",
    "христианство", "ислам", "иудаизм", "буддизм", "индуизм",
    "джихад", "шариат",
    "фуа-гра", "собачье мясо", "китовое мясо",
  ]),
};

function normalizeForSensitive(input: string): string {
  return input.normalize("NFKC").toLowerCase().trim();
}

/**
 * True when the lookup input matches a curated sensitive term: territorial
 * dispute, political figure, atrocity event, religious figure/doctrine,
 * naming dispute, or culturally fraught taboo. When true, the AI should
 * be given a hint to use ONLY metalinguistic example templates ("the
 * word X appears in a textbook") and the example count may be capped
 * lower than usual.
 *
 * Falls back across zh-CN / zh-TW so a lookup typed in either Chinese
 * variant hits the appropriate set.
 */
export function isSensitiveLookup(sourceLang: string, input: string): boolean {
  const lang = sourceLang.toLowerCase();
  const norm = normalizeForSensitive(input);
  if (SENSITIVE_LOOKUPS_BY_LANG[lang]?.has(norm)) return true;
  // zh fallback: try both variants
  if (lang === "zh") {
    if (SENSITIVE_LOOKUPS_BY_LANG["zh-cn"]?.has(norm)) return true;
    if (SENSITIVE_LOOKUPS_BY_LANG["zh-tw"]?.has(norm)) return true;
  }
  return false;
}

/**
 * Hint text injected into the AI prompt when isSensitiveLookup returns
 * true. Asks the AI to use ONLY metalinguistic example templates and
 * never describe properties of the entity itself. Returned as a
 * lexiconHint-style suffix.
 */
export function getSensitiveLookupHint(): string {
  return "SENSITIVE LOOKUP: This input is a known disputed/sensitive term (territorial dispute, political figure, atrocity event, religious figure, or naming controversy). It IS a valid vocabulary item — DEFINE IT normally (do NOT refuse with note=\"sentence\" / \"non_word\"). Apply the Korea-position framing rules to the definition where relevant. For example sentences, use ONLY metalinguistic templates — e.g. \"The word X appears in a textbook\" / \"I looked up X in the dictionary\" / \"The teacher explained X in class\" / \"X is mentioned in the article\". NEVER describe properties of the entity (its history, beauty, location, sovereignty, importance, etc.). Provide AT MOST 1 example; if no fitting metalinguistic template emerges, drop the example slot entirely (examples=[]).";
}
