/**
 * Extended linter for curated wordlists.
 * Catches issues that the basic semantic-audit doesn't:
 *   1. TARGET_LANG_LEAK — en→en or en→ko entry whose right-side has Spanish/French content
 *   2. ELISION_VIOLATION — French source: Le/La/De/Je/Ne/Que/Ce/Se/Me/Te + vowel-initial word
 *   3. KO_SOV_VIOLATION — Korean translation: marker contains verb-ending, then more Korean follows
 *   4. SYN_OPPOSITE — synonym list contains a known opposite of the headword
 *   5. SYN_LANG_MIX — English word in French syn list, etc.
 *   6. MARKER_HAS_PARTICLE — Korean ** marker ends with a postposition (은/는/이/가/을/를/의 etc.)
 *   7. SELF_SYN_PAREN — synonym is a parenthesized variant of the headword (e.g. "mensuel(le)")
 *   8. FALSE_FRIEND — known false-friend with the wrong target meaning
 *   9. HEADWORD_NOT_IN_SENTENCE — Latin-source sentence's bold marker doesn't share a stem with the headword
 *
 * Output: console summary + lint-curated-report.json with full per-entry detail.
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFKD').replace(/\p{M}/gu, '');

// ─── 1. TARGET LANGUAGE LEAK ───────────────────────────────────────────────
// Common Spanish/French function words. We only flag if MULTIPLE markers appear,
// to avoid false-positives on a single loanword.
const SPANISH_DIACRITICS = /[ñ¿¡]/;
const SPANISH_WORDS = /\b(que|el|la|los|las|es|son|para|con|por|muy|más|así|también|pero|cuando|donde|aunque|tu|nosotros|ellos|este|esta|años|día|niño|niña|hombre|mujer|haber|hacer|estar|tener|porque|aunque)\b/gi;
const FRENCH_DIACRITICS = /[œçàâèêëîïôûœÿñ]/;
const FRENCH_WORDS = /\b(le|la|les|du|des|au|aux|avec|pour|dans|sur|sous|comme|quand|où|qui|que|cela|aussi|mais|leur|leurs|cette|cet|ses|nous|vous|elles|était|étaient|sera|seront|avoir|être|faire|aller|venir|dire|voir|savoir)\b/gi;

function detectTargetLangLeak(text, expectedLang) {
  if (!text || expectedLang !== 'en') return null;
  let spScore = 0;
  let frScore = 0;
  if (SPANISH_DIACRITICS.test(text)) spScore += 2;
  if (FRENCH_DIACRITICS.test(text)) frScore += 2;
  spScore += (text.match(SPANISH_WORDS) || []).length;
  frScore += (text.match(FRENCH_WORDS) || []).length;
  // Common English/French overlap (le, la, les) — discount if no diacritics
  if (frScore >= 3) return 'TARGET_LANG_LEAK_FR';
  if (spScore >= 3) return 'TARGET_LANG_LEAK_ES';
  return null;
}

// ─── 2. FRENCH ELISION ─────────────────────────────────────────────────────
// Aspirated h words don't elide; below is a curated list of the common ones.
const ASPIRATED_H = new Set([
  'haricot','haricots','hérisson','hérissons','hibou','hiboux','haine','hasard',
  'hauteur','héros','hâte','halte','hangar','hampe','harpe','haut','haute','hauts',
  'hautes','honte','honteux','honteuse','hache','haches','hâle','hall','hamac',
  'hamster','handicap','hanche','hanches','harceler','hargne','hennir','heurter',
  'hibou','hibiscus','hiérarchie','hochet','hockey','hold-up','hollande','homard','hongrie','hoquet',
  'hors','hotte','houle','housse','hublot','huit','hurler','huppe',
]);
function detectElisionViolation(text) {
  if (!text) return null;
  // Strip ** markers so they don't break word boundaries
  const clean = text.replace(/\*\*/g, '');
  const re = /\b(Le|La|De|Je|Ne|Que|Ce|Se|Me|Te)\s+([aeiouhAEIOUHàâäèêëéîïôöùûü][a-zàâäèêëéîïôöùûüç']*)/g;
  const issues = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    const next = m[2].toLowerCase();
    // Skip aspirated h
    if (next.startsWith('h') && ASPIRATED_H.has(next)) continue;
    issues.push(`${m[1]} ${m[2]}`);
  }
  return issues.length > 0 ? 'ELISION_VIOLATION:' + issues.slice(0, 3).join(';') : null;
}

// ─── 3. KOREAN SOV ─────────────────────────────────────────────────────────
// Pattern: ** marker contains a verb-ending, then non-trivial Korean follows.
// We're conservative: marker must end in a clear verb-ending AND ≥2 Korean
// chars must follow before the next punctuation.
const KO_VERB_ENDINGS = /(다|어요|아요|예요|이에요|니다|습니다|었어요|았어요|었다|았다|는다|한다|된다|간다|온다|있다|없다|갈|올|할|될)$/;
function detectKoreanSOV(translation) {
  if (!translation) return null;
  const matches = [...translation.matchAll(/\*\*([^*]+)\*\*([^*]*)/g)];
  for (const m of matches) {
    const marker = m[1].trim();
    const after = m[2].split(/[.!?。]/)[0].trim();
    if (!KO_VERB_ENDINGS.test(marker)) continue;
    // The text after must have actual Korean content words (≥2 hangul chars in a row)
    if (!/[가-힣]{2,}/.test(after)) continue;
    // Skip comma-/period-followed continuations — these are independent clauses,
    // not SOV violations. ("죄송합니다, 제가 늦었어요" / "왔어요. 파티를 시작합시다")
    if (/^\s*[,.;:]/.test(m[2])) continue;
    // Allow conjunctive / quotative trailers (these are valid Korean compounds).
    if (/^\s*(그리고|그래서|그러나|그런데|또한|또|즉|왜냐하면|라고|이라고|하지만|그래도|아니면|혹은|만약|만일|비록|예를|만큼|때문|덕분|밖에|이라는|라는|하면)/.test(after)) continue;
    // Allow future/auxiliary trailers — "할 거예요", "갈 것입니다" are natural Korean
    // where the bold marker happens to wrap only the modifier (할/갈) but the
    // overall word order is correct.
    if (/^\s*(거예요|거에요|것이다|것입니다|거다|것이야|거야|것이었다|거였다|것입니까|것이었어요|건가요|거란다|것이니까|거 같다|것 같다)/.test(after)) continue;
    return 'KO_SOV:' + marker + '«' + after.slice(0, 25);
  }
  return null;
}

// ─── 4. KNOWN OPPOSITES IN SYN ─────────────────────────────────────────────
const OPPOSITE_PAIRS = {
  tutoyer: ['vouvoyer'],
  vouvoyer: ['tutoyer'],
  raccrocher: ['décrocher'],
  décrocher: ['raccrocher'],
  partout: ['partiellement', 'nulle part'],
  monter: ['descendre'],
  descendre: ['monter'],
  acheter: ['vendre'],
  vendre: ['acheter'],
  ouvrir: ['fermer'],
  fermer: ['ouvrir'],
  arriver: ['partir'],
  commencer: ['terminer', 'finir'],
  finir: ['commencer'],
  accepter: ['refuser'],
  refuser: ['accepter'],
};
function detectOppositeSyns(headword, syns) {
  const opp = OPPOSITE_PAIRS[norm(headword)];
  if (!opp) return null;
  const found = (syns || []).filter((s) => opp.includes(norm(s)));
  return found.length > 0 ? 'SYN_OPPOSITE:' + found.join(',') : null;
}

// ─── 5. SYN LANGUAGE MIX ───────────────────────────────────────────────────
// English-only words that often leak into French syn lists
const ENGLISH_WORDS_IN_SYN = /\b(booking|comic|fumetti|strip|masterpiece|ugliness|round-trip|rom-com|telecommuting|sponsoring|loan|flyer|community|committee|grudge|laptop)\b/i;
// Headword-form parenthesized variants are caught separately
function detectSynLangMix(syns, sourceLang) {
  if (sourceLang !== 'fr') return null;
  const issues = [];
  for (const s of syns || []) {
    if (ENGLISH_WORDS_IN_SYN.test(s)) issues.push(s);
  }
  return issues.length > 0 ? 'SYN_LANG_MIX:' + issues.slice(0, 3).join(',') : null;
}

// ─── 6. MARKER HAS KOREAN PARTICLE ─────────────────────────────────────────
// We catch CONTENT-WORD headwords whose Korean translation marker wraps a
// noun + object/topic/oblique particle that should be outside the marker.
// Skipped to reduce false-positives:
//   • 의 endings — too many native words/expressions end in 의 (동의, 거의,
//     약간의, 각각의, 자기만의…). Distinguishing "noun-internal 의" from
//     genitive 의 requires lexical knowledge we don't have here.
//   • Function-word headwords — prompt explicitly allows particle markers
//     for prepositions, articles, possessives, demonstratives, etc.
//   • Verb future / nominalizer endings (X을 / X를 where X is a verb stem
//     ending in ㄹ).
//   • Adverbial -으로 attached to 한자어 부사 (영화적으로, 결론적으로).
const FUNC_WORD_HEADWORDS = new Set([
  // French articles, possessives, demonstratives, prepositions, conjunctions
  'le','la','les','un','une','des','du','de',"d'",
  'mon','ton','son','ma','ta','sa','mes','tes','ses','notre','votre','leur','nos','vos','leurs',
  'ce','cet','cette','ces',
  'à','en','sur','sous','dans','pour','avec','sans','vers','chez','par','depuis','pendant','avant','après','entre','derrière','devant','contre','près','loin','jusque',
  'qui','que','quoi','dont','où','quand','comment','pourquoi',
  'et','ou','mais','donc','car','ni','si',
  'me','te','se','nous','vous','lui','y',
  'au','aux',
  // Comparison / adverbial particles whose Korean equivalent IS the particle
  'comme',
  // Chinese function words
  '的','了','着','过','和','或','也','都','是','在','于','对','把','被','到','从','向','与','及','或者',
]);
const KO_PARTICLE_MULTI = /(으로|에서|에게|한테|보다|처럼|밖에|마저)$/;
const KO_PARTICLE_OBJ = /[가-힣](을|를)$/; // direct-object particle only (의 too noisy)
function detectMarkerHasParticle(text, headword) {
  if (!text) return null;
  // Function-word headwords are exempt from this check.
  if (headword && FUNC_WORD_HEADWORDS.has(headword.trim().toLowerCase())) return null;
  const matches = [...text.matchAll(/\*\*([^*]+)\*\*/g)];
  const issues = [];
  for (const m of matches) {
    const inner = m[1];
    if (!/[가-힣]/.test(inner)) continue;
    const hangulCount = (inner.match(/[가-힣]/g) || []).length;
    if (hangulCount < 2) continue;
    // Hanja-derived adverb in 적으로 form is a single phonological unit; skip.
    if (/적으로$/.test(inner)) continue;
    // Verb future-relative form: short verb stem + ㄹ로 끝나는 음절 (가질, 닫을, 머무를 etc.)
    // Heuristic: marker is short (≤4) and ends in -ㄹ + 을/를 looks like verb future,
    // unless it's a clear noun + object (e.g. 친구를 — 친구 is a known noun stem of length 2).
    // We can't verify lexically, so we keep the check simple: only fire on
    // multi-syllable nouns where ㄹ-future is implausible (≥3 hangul before 을/를).
    if (KO_PARTICLE_OBJ.test(inner)) {
      const stem = inner.slice(0, -1);
      const stemHangul = (stem.match(/[가-힣]/g) || []).length;
      if (stemHangul < 2) continue; // too short — likely verb future
    }
    if (KO_PARTICLE_MULTI.test(inner) || KO_PARTICLE_OBJ.test(inner)) {
      issues.push(inner);
    }
  }
  return issues.length > 0 ? 'MARKER_HAS_PARTICLE:' + issues.slice(0, 2).join(',') : null;
}

// ─── 7. SELF-SYN PARENTHESIZED ─────────────────────────────────────────────
function detectSelfSynParen(headword, syns) {
  const hw = norm(headword);
  const issues = [];
  for (const s of syns || []) {
    if (typeof s !== 'string') continue;
    if (!/\(.+?\)/.test(s)) continue;
    // base outside paren
    const base = norm(s.replace(/\s*\([^)]+\)/, '').trim());
    if (!base) continue;
    if (base === hw || hw.startsWith(base) || base.startsWith(hw)) {
      issues.push(s);
    }
  }
  return issues.length > 0 ? 'SELF_SYN_PAREN:' + issues.join(',') : null;
}

// ─── 8. FALSE FRIEND DICTIONARY ────────────────────────────────────────────
// Each entry: when src=src AND tl=tl AND headword matches AND meaning contains
// `forbidden` → flag.
const FALSE_FRIENDS = [
  { word: 'lecture',     src: 'fr', tl: 'ko', forbidden: '강의',     correct: '읽기' },
  { word: 'cookie',      src: 'fr', tl: 'ko', forbidden: '쿠키',     correct: '브라우저 쿠키 (this entry is in tech/security context)' },
  { word: 'marbre',      src: 'fr', tl: 'ko', forbidden: '근육',     correct: '대리석' },
  { word: 'coutume',     src: 'fr', tl: 'ko', forbidden: '세관',     correct: '관습' },
  { word: 'cop',         src: 'fr', tl: 'ko', forbidden: '프랑',     correct: '당사국 총회' },
  { word: 'bon marché',  src: 'fr', tl: 'ko', forbidden: '시장',     correct: '저렴한' },
  { word: 'tube',        src: 'fr', tl: 'ko', forbidden: '텔레비전', correct: '관/튜브' },
  { word: 'gratuit',     src: 'fr', tl: 'ko', forbidden: '불필요',   correct: '무료의' },
  { word: 'sensible',    src: 'fr', tl: 'ko', forbidden: '현명',     correct: '민감한 (English false-friend; FR sensible≠wise)' },
  { word: 'cave',        src: 'fr', tl: 'ko', forbidden: '경고',     correct: '지하실' },
  { word: 'post',        src: 'fr', tl: 'ko', forbidden_word_in_sent: 'poteau', correct: '게시물 (social media)' },
];
function detectFalseFriend(headword, meanings, examples, sourceLang, targetLang) {
  const hw = norm(headword);
  const issues = [];
  for (const ff of FALSE_FRIENDS) {
    if (ff.src !== sourceLang || ff.tl !== targetLang) continue;
    if (norm(ff.word) !== hw) continue;
    if (ff.forbidden) {
      const allDefs = (meanings || []).map((m) => m.definition || '').join(' | ');
      if (allDefs.includes(ff.forbidden)) {
        issues.push(`FALSE_FRIEND:${ff.word} has forbidden meaning "${ff.forbidden}" (correct: ${ff.correct})`);
      }
    }
    if (ff.forbidden_word_in_sent) {
      for (const ex of examples || []) {
        if (ex.sentence && ex.sentence.includes(ff.forbidden_word_in_sent)) {
          issues.push(`FALSE_FRIEND:${ff.word} sentence uses wrong word "${ff.forbidden_word_in_sent}"`);
          break;
        }
      }
    }
  }
  return issues.length > 0 ? issues.join(' | ') : null;
}

// ─── 9. HEADWORD MISSING IN SENTENCE ───────────────────────────────────────
// For Latin-script source langs only. Marker should share a stem with the
// headword. Verb conjugations (aller→va, être→est) often share <3 chars, so
// we skip the check for short markers (likely conjugated forms).
const LATIN_LANGS = new Set(['en', 'fr', 'es', 'de', 'it', 'pt']);
// Known irregular verb conjugations that don't share start with infinitive.
// Curated to known verbs that show up in DELF wordlists.
const KNOWN_INFLECTIONS = {
  aller: ['va', 'vais', 'vas', 'allons', 'allez', 'vont', 'allé', 'allée', 'allés', 'irai', 'iras', 'ira', 'irons', 'irez', 'iront'],
  être: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'étais', 'était', 'étaient', 'sera', 'seront', 'été'],
  avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont', 'eu', 'eus', 'aurai', 'auras', 'aura'],
  faire: ['fais', 'fait', 'faisons', 'faites', 'font', 'ferai', 'feras', 'fera', 'feront'],
  dire: ['dis', 'dit', 'disons', 'disent', 'dira'],
  voir: ['vois', 'voit', 'voyons', 'voient', 'vu', 'verra'],
  vouloir: ['veux', 'veut', 'voulons', 'voulez', 'veulent', 'voulu', 'voudra'],
  pouvoir: ['peux', 'peut', 'pouvons', 'pouvez', 'peuvent', 'pu', 'pourra'],
  savoir: ['sais', 'sait', 'savons', 'savent', 'su', 'saura'],
  prendre: ['prends', 'prend', 'prenons', 'prennent', 'pris'],
  venir: ['viens', 'vient', 'venons', 'viennent', 'venu', 'viendra'],
  tenir: ['tiens', 'tient', 'tenons', 'tiennent', 'tenu'],
  mettre: ['mets', 'met', 'mettons', 'mettent', 'mis'],
  boire: ['bois', 'boit', 'buvons', 'boivent', 'bu'],
  croire: ['crois', 'croit', 'croyons', 'croient', 'cru'],
  recevoir: ['reçois', 'reçoit', 'recevons', 'reçoivent', 'reçu'],
  devoir: ['dois', 'doit', 'devons', 'doivent', 'dû'],
  "s'asseoir": ["m'assieds", "t'assieds", "s'assied", "nous asseyons", "s'asseyent", 'assis'],
};
const ALL_INFLECTIONS = new Set();
for (const [, forms] of Object.entries(KNOWN_INFLECTIONS)) {
  for (const f of forms) ALL_INFLECTIONS.add(norm(f).replace(/\s+/g, ''));
}

function detectHeadwordNotInSentence(headword, examples, sourceLang) {
  if (!LATIN_LANGS.has(sourceLang)) return null;
  const hwRaw = norm(headword).replace(/\s+/g, '');
  if (hwRaw.length < 3) return null;
  // Strip leading reflexive pronoun (s'/se/m'/te/...) from headword to get the verb stem.
  // We compare against this stripped form so reflexive variants (me lave, nous lavons) match.
  const hwStem = hwRaw.replace(/^(se|s['']|m['']|t[''])/, '');
  const issues = [];
  for (let i = 0; i < (examples || []).length; i++) {
    const ex = examples[i];
    const sm = ex.sentence?.match(/\*\*([^*]+)\*\*/);
    if (!sm) continue;
    const markerRaw = norm(sm[1]).replace(/^\s+|\s+$/g, '');
    if (!markerRaw) continue;
    // Strip leading reflexive pronoun from marker too (me/te/se/nous/vous/s'/m'/t')
    const markerStripped = markerRaw
      .replace(/^(je|tu|il|elle|nous|vous|ils|elles|on)\s+/, '')
      .replace(/^(me|te|se|nous|vous)\s+/, '')
      .replace(/^(j|l|d|t|m|s|n|qu)['']/, '')
      .replace(/\s+/g, '');
    // Skip very short markers — almost always conjugated forms or function words
    if (markerStripped.length <= 3) continue;
    if (ALL_INFLECTIONS.has(markerStripped)) continue;

    // Try matching against hwStem (without reflexive prefix) first, then hwRaw.
    const candidates = [hwStem, hwRaw].filter((c) => c.length >= 3);
    let matched = false;
    for (const c of candidates) {
      // ≥3 shared starting chars
      let shared = 0;
      for (let j = 0; j < Math.min(markerStripped.length, c.length); j++) {
        if (markerStripped[j] === c[j]) shared++; else break;
      }
      if (shared >= 3) { matched = true; break; }
      if (markerStripped.includes(c) || c.includes(markerStripped)) { matched = true; break; }
    }
    if (!matched) {
      issues.push(`e${i + 1}:"${sm[1]}"≠${headword}`);
    }
  }
  return issues.length > 0 ? 'HEADWORD_OFF:' + issues.join(';') : null;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const { data: lists, error: e1 } = await admin
    .from('curated_wordlists')
    .select('id, slug, source_lang')
    .eq('is_active', true)
    .order('display_order');
  if (e1) throw e1;

  const flags = [];
  let total = 0;
  let scanned = 0;

  for (const list of lists) {
    const { data: rows } = await admin
      .from('curated_words')
      .select('word, results_by_target_lang')
      .eq('curated_wordlist_id', list.id);
    for (const row of rows || []) {
      const targets = Object.keys(row.results_by_target_lang || {});
      for (const tl of targets) {
        total++;
        const r = row.results_by_target_lang[tl];
        const issues = [];

        // Per-example scans
        for (const ex of r.examples || []) {
          const v1 = detectTargetLangLeak(ex.translation, tl);
          if (v1) issues.push(v1 + ':in_ex_translation');
          if (list.source_lang === 'fr') {
            const v2 = detectElisionViolation(ex.sentence);
            if (v2) issues.push(v2);
          }
          if (tl === 'ko') {
            const v3 = detectKoreanSOV(ex.translation);
            if (v3) issues.push(v3);
            const v4 = detectMarkerHasParticle(ex.translation, row.word);
            if (v4) issues.push(v4);
          }
        }
        // Per-meaning scans
        for (const m of r.meanings || []) {
          const v1 = detectTargetLangLeak(m.definition, tl);
          if (v1) issues.push(v1 + ':in_def');
        }
        // Per-entry scans
        const v5 = detectOppositeSyns(row.word, r.synonyms);
        if (v5) issues.push(v5);
        const v6 = detectSynLangMix(r.synonyms, list.source_lang);
        if (v6) issues.push(v6);
        const v7 = detectSelfSynParen(row.word, r.synonyms);
        if (v7) issues.push(v7);
        const v8 = detectFalseFriend(row.word, r.meanings, r.examples, list.source_lang, tl);
        if (v8) issues.push(v8);
        const v9 = detectHeadwordNotInSentence(row.word, r.examples, list.source_lang);
        if (v9) issues.push(v9);

        scanned++;
        if (issues.length) flags.push({ slug: list.slug, word: row.word, lang: tl, issues });
      }
    }
  }

  console.log('=== EXTENDED LINT ===');
  console.log('Total entries scanned:', scanned, '/', total);
  console.log('Flagged:', flags.length, '(' + (100 * flags.length / total).toFixed(2) + '%)');

  const byType = {};
  for (const f of flags) {
    for (const i of f.issues) {
      const k = i.split(':')[0];
      byType[k] = (byType[k] ?? 0) + 1;
    }
  }
  console.log('\n=== ISSUE COUNTS BY TYPE ===');
  console.table(byType);

  console.log('\n=== SAMPLE FLAGS (first 60) ===');
  flags.slice(0, 60).forEach((f) => {
    console.log(`  [${f.slug}] ${f.word} (${f.lang})`);
    f.issues.forEach((i) => console.log('    →', i));
  });

  fs.writeFileSync(
    path.resolve(__dirname, 'lint-curated-report.json'),
    JSON.stringify({ totalEntries: total, scanned, flagsCount: flags.length, byType, flags }, null, 2),
  );
  console.log('\nFull report saved → scripts/curation/lint-curated-report.json');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
