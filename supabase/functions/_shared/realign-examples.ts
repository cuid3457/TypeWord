// Re-route each example to the meaning slot whose translated definition
// tokens best match the example's translation. Catches the case where the
// per-meaning prompt anchor told the LLM to write for sense A but it emitted
// a sentence demonstrating sense B (or for v2-era data that was never
// realigned at generation time).
//
// Originally lived in stitch.ts as part of the v2/v3 pipeline; extracted
// here so v4 server-side and the client-side curated-wordlist add path can
// share the same logic. Pure TS, no Deno/Node specifics — safe to import
// from edge functions and React Native.
//
// Procedure mirrors the v3 implementation:
//   1. Tokenize each meaning's definition (in target_lang).
//   2. Discriminating tokens per meaning = tokens unique to that meaning.
//   3. Score each example against each unused meaning slot by counting
//      discriminating-token matches in the example's translation.
//   4. Assign the example to the highest-scoring free slot.
//   5. Fall back to the example's original meaningIndex when no slot
//      discriminates; drop if that slot is already taken (mismatch worse
//      than missing).
//
// No-op when meanings.length < 2 (single-sense headwords can't misalign)
// or targetLang is empty (no translation to score against).
import type { WordExample, WordMeaning } from "./types.ts";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "at", "by", "for", "with", "as", "from",
  "my", "your", "his", "her", "its", "our", "their",
  "and", "or", "but", "so", "if", "then", "than",
  "this", "that", "these", "those", "it", "i", "we", "they", "you",
  "do", "did", "does", "have", "has", "had",
]);

// Korean particles attached to nouns/verbs that we need to strip so token
// matching works. ko/ja agglutination glues these to content words ("능력이",
// "능력을", "능력에서는") and exact-match scoring would miss them. We strip
// trailing particle clusters from each whitespace-split token.
//   ko 격조사: 이/가/을/를/은/는/의/에/에서/에게/한테/께/으로/로/와/과/도/만
//             보다/처럼/까지/부터/조차/마저/이라도/이며/이고
//   ko 종결어미: 다/요/네/구나/까/지/세요/습니다/ㅂ니다  (붙어있을 때 컷)
const KO_PARTICLE_RE =
  /(?:으로서|에게서|에서는|에서도|에서|에게|한테|께서|이라도|까지|부터|조차|마저|처럼|보다|으로|와|과|이며|이고|이라|이다|입니다|이요|이|가|을|를|은|는|의|도|만|와|로|랑|이랑|뿐|이나|나|네|니|냐|군요|네요|군|구나|지요|지)$/;
function stripKoreanParticle(t: string): string {
  // Only fire on tokens with Hangul; latin tokens pass through.
  if (!/[가-힯]/.test(t)) return t;
  // Single stripping pass — particles can chain but one strip captures the
  // most common 1- or 2-syllable suffix and gets us to the lemma.
  const stripped = t.replace(KO_PARTICLE_RE, "");
  return stripped.length >= 1 ? stripped : t;
}

function tokenize(s: string): Set<string> {
  const raw = (s || "")
    .toLowerCase()
    .replace(/[(),.;:!?'"`“”、。!?]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  return new Set(raw.map(stripKoreanParticle).filter((t) => t.length >= 1));
}

export function realignExamplesByTranslation(
  meanings: WordMeaning[],
  examples: WordExample[],
  targetLang: string,
): WordExample[] {
  if (!targetLang) return examples;
  if (meanings.length < 2 || examples.length === 0) return examples;

  const meaningTokenSets = meanings.map((m) => tokenize(m.definition || ""));
  const tokenFreq: Record<string, number> = {};
  for (const set of meaningTokenSets) {
    for (const t of set) tokenFreq[t] = (tokenFreq[t] ?? 0) + 1;
  }
  const discrim = meaningTokenSets.map((set) => {
    const out = new Set<string>();
    for (const t of set) if (tokenFreq[t] === 1) out.add(t);
    return out;
  });

  const out: WordExample[] = [];
  const usedSlots = new Set<number>();

  for (const ex of examples) {
    const exTokens = tokenize(ex.translation || "");
    if (exTokens.size === 0) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < meanings.length; i++) {
      if (usedSlots.has(i)) continue;
      let score = 0;
      for (const t of discrim[i]) {
        if (STOP_WORDS.has(t)) continue;
        if (exTokens.has(t)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestScore > 0 && bestIdx >= 0) {
      out.push({ ...ex, meaningIndex: bestIdx });
      usedSlots.add(bestIdx);
      continue;
    }

    // No discriminating-token match. Trust the LLM's original meaningIndex
    // first; if that slot is taken, fall to the next free slot so we don't
    // leave a meaning with zero examples. Dropping is worse for the learner
    // than a tentatively-assigned example.
    const orig = ex.meaningIndex ?? 0;
    if (orig >= 0 && orig < meanings.length && !usedSlots.has(orig)) {
      out.push(ex);
      usedSlots.add(orig);
      continue;
    }
    for (let i = 0; i < meanings.length; i++) {
      if (!usedSlots.has(i)) {
        out.push({ ...ex, meaningIndex: i });
        usedSlots.add(i);
        break;
      }
    }
  }

  out.sort((a, b) => (a.meaningIndex ?? 0) - (b.meaningIndex ?? 0));
  return out;
}
