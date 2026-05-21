/**
 * Build a free-text proficiency hint for the word-lookup edge function from
 * curated_wordlists row metadata (exam_type + level). The enrich-mode prompt
 * treats it as a hard constraint on example length and supporting-vocab tier.
 *
 * Coverage: HSK 1-3, JLPT N5/N4, TOPIK 1, DELF A1/A2 — the elementary tiers
 * where the model otherwise drifts toward grown-up sentence length. Higher
 * levels (HSK 4+, B1+, AWL) get no hint and use the prompt's general rules.
 */
function deriveProficiencyHint({ exam_type, level } = {}) {
  const exam = (exam_type || '').toUpperCase();
  const lvl = String(level ?? '').toUpperCase();
  if (exam === 'HSK') {
    if (lvl === '1') return 'HSK Level 1 — the 150 most basic Chinese words (absolute beginner). Examples must use ONLY HSK 1 vocab. Cap: ≤8 CJK chars per sentence.';
    if (lvl === '2') return 'HSK Level 2 — among the 300 most basic Chinese words (early beginner). Examples must use ONLY HSK 1-2 vocab. Cap: ≤10 CJK chars per sentence.';
    if (lvl === '3') return 'HSK Level 3 — among the 600 most basic Chinese words (late beginner). Examples must use ONLY HSK 1-3 vocab. Cap: ≤12 CJK chars per sentence.';
  }
  if (exam === 'JLPT') {
    if (lvl === 'N5') return 'JLPT N5 — the most basic Japanese vocabulary (absolute beginner). Examples must use ONLY N5-tier vocab and basic kana/kanji. Cap: ≤10 CJK chars per sentence.';
    if (lvl === 'N4') return 'JLPT N4 — basic Japanese vocabulary (early beginner). Examples must use ONLY N5-N4 vocab. Cap: ≤12 CJK chars per sentence.';
  }
  if (exam === 'TOPIK') {
    if (lvl === '1') return 'TOPIK I — basic Korean vocabulary (beginner level 1-2). Examples must use ONLY TOPIK I vocab and basic Hangul forms. Cap: ≤7 eojeol (어절) per sentence.';
  }
  if (exam === 'DELF') {
    if (lvl === 'A1') return 'DELF A1 — absolute beginner French (CEFR A1). Examples must use ONLY A1 vocab and the simplest grammar (présent, basic être/avoir). Cap: ≤7 words per sentence.';
    if (lvl === 'A2') return 'DELF A2 — elementary French (CEFR A2). Examples must use ONLY A1-A2 vocab. Cap: ≤8 words per sentence.';
    if (lvl === 'B1') return 'DELF B1 — intermediate French (CEFR B1). Examples must use ONLY A1-B1 vocab and standard intermediate grammar (passé composé, imparfait, futur simple, basic subjonctif). Cap: ≤10 words per sentence.';
  }
  return undefined;
}

module.exports = { deriveProficiencyHint };
