// Chinese single-character polyphones (多音字) commonly encountered in
// Korean-based vocabulary learning contexts (HSK / TOCFL / typical input).
// The LLM occasionally returns only ONE reading for these — this table
// enforces the canonical list at stitch time so display + TTS pick the
// right pronunciation per meaning.
//
// Order: most-common reading first (matches m0 semantics typically),
// secondary after. Where 3+ readings exist (e.g. 着 zhe/zháo/zhuó), list
// up to 3.
//
// To extend: add (single_char, [readings_in_order]). Multi-character
// compounds (e.g. 正在) use a single joined pinyin string in word_entries
// and don't go here — only true single-char polyphones.
export const ZH_POLYPHONES: Record<string, string[]> = {
  // Length / growing
  "长": ["cháng", "zhǎng"],
  // Line / walk
  "行": ["xíng", "háng"],
  // Capital / all
  "都": ["dōu", "dū"],
  // Divide / portion
  "分": ["fēn", "fèn"],
  // Adjust / transfer
  "调": ["tiáo", "diào"],
  // Court / morning
  "朝": ["cháo", "zhāo"],
  // Heavy / again
  "重": ["zhòng", "chóng"],
  // Happy / music
  "乐": ["lè", "yuè"],
  // Teach / teaching
  "教": ["jiāo", "jiào"],
  // Still / return
  "还": ["hái", "huán"],
  // Middle / hit
  "中": ["zhōng", "zhòng"],
  // Count / number
  "数": ["shǔ", "shù"],
  // Hard / disaster
  "难": ["nán", "nàn"],
  // Turn (different senses)
  "转": ["zhuǎn", "zhuàn"],
  // Between / gap
  "间": ["jiān", "jiàn"],
  // Aspect marker / touch / wear
  "着": ["zhe", "zháo", "zhuó"],
  // With / take part
  "与": ["yǔ", "yù"],
  // Fake / vacation
  "假": ["jiǎ", "jià"],
  // Do / for
  "为": ["wéi", "wèi"],
  // Good / like
  "好": ["hǎo", "hào"],
  // Look / guard
  "看": ["kàn", "kān"],
  // Few / young
  "少": ["shǎo", "shào"],
  // Only / item
  "只": ["zhǐ", "zhī"],
  // Place / handle
  "处": ["chù", "chǔ"],
  // Kind / plant
  "种": ["zhǒng", "zhòng"],
  // Long / strong
  "强": ["qiáng", "qiǎng"],
  // Hair / send
  "发": ["fā", "fà"],
  // Will / general
  "将": ["jiāng", "jiàng"],
  // Lead / lead
  "率": ["shuài", "lǜ"],
  // Behind / queen
  "后": ["hòu"],
  // Round / circle
  "圆": ["yuán"],
  // Each
  "每": ["měi"],
};

/** Returns the canonical reading array for a single-character Chinese
 * polyphone, or null if the word is not in the table or is multi-char. */
export function getZhPolyphoneReadings(word: string): string[] | null {
  if (!word || word.length !== 1) return null;
  const entry = ZH_POLYPHONES[word];
  if (!entry || entry.length < 2) return null;
  return [...entry];
}
