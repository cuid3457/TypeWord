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

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[(),.;:!?'"`“”]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),  // drop 1-char noise
  );
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

    // No discriminating-token match. Keep original index if free; drop if
    // already taken — a confidently-wrong example is worse than no example.
    const orig = ex.meaningIndex ?? 0;
    if (orig >= 0 && orig < meanings.length && !usedSlots.has(orig)) {
      out.push(ex);
      usedSlots.add(orig);
    }
  }

  out.sort((a, b) => (a.meaningIndex ?? 0) - (b.meaningIndex ?? 0));
  return out;
}
