// Split a marker span (`**...**` contents) into the headword head and a
// trailing grammatical-particle tail, so the renderer can highlight ONLY
// the headword and leave the particle as plain text.
//
// Why this exists:
//   The example-generator prompt instructs the LLM to wrap host + particle
//   together (`**책은**`, `**学校に**`, `**好的**`) because a bare particle
//   alone is awkward in natural prose. For learner cards we still want the
//   visual emphasis on the headword only. Splitting at render time keeps the
//   stored data untouched and is reversible per language.
//
// Strategy: headword-anchored whitelist match.
//   - Verify the marker starts with the headword (prevents false positives
//     where a particle-shaped character is genuinely part of a noun, e.g.
//     "가나" / "차나"). If the marker doesn't start with the headword we
//     leave the marker as-is.
//   - Then check if the trailing remainder is in the particle whitelist
//     (longest-match first). If yes → split.
//   - Otherwise → leave alone.
//
// POS gate:
//   - ko / ja: only NOUN-like POS. Korean / Japanese verbs and adjectives
//     have inflected endings that look like particles but aren't ("**먹었다**"
//     ends in 다, which is a verb ending, not the particle 다). Stripping
//     them would butcher the surface form.
//   - zh-CN: 助词 (的/了/吗/呢/着/过) attach to verbs as well as nouns, so
//     no POS gate is needed. We still require headword-anchored prefix
//     match for safety.

// ──────────────────────────────────────────────────────────────────────
// Whitelists — longest-match first per language.
// Keep lists conservative; expand only when a real example demands it.
// ──────────────────────────────────────────────────────────────────────

// 한국어 조사 (격조사 + 보조사 + 접속조사). 빈도 높은 것만, 2자 우선.
const KO_PARTICLES = [
  // 3 chars
  '이라도', '이라고', '에게서', '한테서', '으로서', '으로써',
  // 2 chars
  '에서', '에게', '한테', '으로', '까지', '부터', '마저', '조차', '마다',
  '처럼', '보다', '라도', '라고', '이며', '이나', '이랑', '이라',
  // 1 char
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '와', '과',
  '로', '랑', '며', '나', '야', '아',
];

// 日本語 助詞. Common ones.
const JA_PARTICLES = [
  // 3+ chars
  'ばかり', 'までに',
  // 2 chars
  'から', 'まで', 'より', 'ので', 'のに', 'けど', 'でも', 'だけ', 'しか',
  'さえ', 'など', 'とか', 'ずつ', 'ても', 'では', 'には', 'とは', 'って',
  // 1 char
  'は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'や', 'か', 'よ', 'ね',
  'の', 'な',
];

// 中文 助词 (structural / aspectual / modal). Single-char.
const ZH_PARTICLES = [
  '的', '了', '吗', '呢', '着', '过', '啊', '吧', '嘛', '哦', '呀', '哇', '罢',
];

const PARTICLES_BY_LANG: Record<string, readonly string[]> = {
  ko: KO_PARTICLES,
  ja: JA_PARTICLES,
  zh: ZH_PARTICLES,
  'zh-CN': ZH_PARTICLES,
  'zh-TW': ZH_PARTICLES,
};

// ──────────────────────────────────────────────────────────────────────
// POS gate
// ──────────────────────────────────────────────────────────────────────

// Accept English POS strings from v4 + localized POS strings from v2/v3.
// POS comes from the LLM and is not strictly normalized — we accept any
// label that contains "noun" or its CJK equivalents.
function isNounLike(pos: string | undefined): boolean {
  if (!pos) return false;
  const s = pos.toLowerCase().trim();
  return (
    s.includes('noun') ||
    s.includes('pronoun') ||
    s.includes('numeral') ||
    s === '명사' || s.includes('명사') ||
    s === '대명사' || s.includes('대명사') ||
    s === '수사' ||
    s === '名詞' || s.includes('名詞') ||
    s === '代名詞' ||
    s === '名词' || s.includes('名词') ||
    s === '代词'
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────────────────────────────

export interface SplitResult {
  /** Substring that should be highlighted as the headword. */
  head: string;
  /** Substring that should be displayed as plain text after the head.
   * Empty when no particle was split. */
  tail: string;
}

/**
 * Split a marker span into highlighted head + plain particle tail.
 *
 * @param marked   Text from inside `**...**` (no asterisks).
 * @param headword The dictionary form being taught (`current.word` or
 *                 `current.result.headword`). Used as the prefix anchor.
 * @param sourceLang BCP-47-ish lang code: 'ko' | 'ja' | 'zh-CN' | etc.
 * @param pos      Part of speech string from the matching WordMeaning, or
 *                 undefined if not known. Required for ko/ja gating.
 */
export function splitMarkerParticle(
  marked: string,
  headword: string,
  sourceLang: string,
  pos?: string,
): SplitResult {
  const noOp: SplitResult = { head: marked, tail: '' };
  if (!marked || !headword) return noOp;

  const list = PARTICLES_BY_LANG[sourceLang];
  if (!list || list.length === 0) return noOp;

  // POS gate for ko/ja. zh attaches 助词 to verbs too, so skip the gate.
  const needsNounGate = sourceLang === 'ko' || sourceLang === 'ja';
  if (needsNounGate && !isNounLike(pos)) return noOp;

  // Headword-anchored prefix match. The wrapped span must literally start
  // with the headword for us to feel safe stripping a tail.
  if (!marked.startsWith(headword)) return noOp;
  const suffix = marked.slice(headword.length);
  if (!suffix) return noOp;

  // Longest-match: whitelists are sorted longest-first, so the first hit
  // wins. We only accept exact suffix match (suffix === particle); a
  // partial match in the middle is rejected because that would imply the
  // tail is "particle + something else", which we can't safely classify
  // without a real morphological analyzer.
  for (const p of list) {
    if (suffix === p) {
      return { head: headword, tail: p };
    }
  }

  return noOp;
}
