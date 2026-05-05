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
// What gets redirected:
//   - Romanized non-Japanese forms (Latin script): takeshima → Dokdo,
//     "sea of japan" → "East Sea"
//   - Non-canonical forms in Korean / French / German / etc.: 일본해 → 동해,
//     "Mer du Japon" → "Mer de l'Est"
//
// What does NOT get redirected:
//   - Native-script Japanese / Chinese inputs (竹島, 日本海) — these are
//     legitimate vocabulary items in those languages. The lookup proceeds
//     with the original input; the rewriter handles the target-language
//     output (definition / translation) so the user sees Korean naming.
//
// Match is exact after NFKC + trim. Latin scripts use case-insensitive flag.
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
