// In-DB Wiktionary (kaikki.org wiktextract) client for en/es/fr/de/it.
// Replaces the live freedictionaryapi.com call (freedict.ts) for languages
// whose data has been imported into wiktionary_entries. Same DictEntry shape
// as freedict so word-lookup-v4 downstream (judge/group/examples) is unchanged.
//
// Rows are one per (word, lang, pos, etymology). The headword is stored
// lowercased, so we lowercase the query. Each row maps to one DictEntry.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type { DictEntry, DictSense } from "./types.ts";

interface WiktRow {
  pos: string | null;
  ipa: string | null;
  etymology_number: number | null;
  senses: Array<{ gloss: string; examples?: string[]; tags?: string[] }>;
}

// Sense-level register tags meaning "general learners won't meet this in
// everyday life." Drop deterministically before the LLM — same policy as
// JMdict's archaic filter ([[feedback_filter_by_learning_value_not_pos]]).
// Wiktionary tags are mostly grammatical (countable/uncountable/transitive)
// but a small share are real register markers; filtering them shrinks the
// SELECT input + output. We do NOT filter "literary / colloquial / informal /
// slang / vulgar / humorous / derogatory" — those can still be everyday.
const WIKT_ARCHAIC_TAGS = new Set([
  "archaic",
  "obsolete",
  "obsolete-form",
  "obsolete-typography",
  "historical",
  "dated",
  "dialectal",
  "regional",
  "rare",
  "proscribed",
  "uncommon",
]);
function isArchaicSense(tags: string[] = []): boolean {
  return tags.some((t) => WIKT_ARCHAIC_TAGS.has(t));
}

// A "form-of" sense is wiktionary's redirect for an inflected/alternative form
// (e.g. ran = past tense of run; colour = alt-of color). They are not real
// meanings — drop so SELECT doesn't see them. If every sense of an entry is
// form-of (the "ran" case), the entry collapses to 0 senses and is dropped
// downstream (→ dict-miss → LLM fallback handles inflection cards).
function isFormOf(tags: string[] = []): boolean {
  return tags.includes("form-of") || tags.includes("alt-of");
}

// Wiktionary sense tags map to canonical gender / register signals shown on
// the learner card. Tags appear inline among grammatical ones; pick the first
// match. Latin gender is grammatically essential for de/fr/es/it nouns.
const GENDER_BY_TAG: Record<string, "m" | "f" | "n" | "mf"> = {
  masculine: "m",
  feminine: "f",
  neuter: "n",
  "common-gender": "mf",
  epicene: "mf",
};
const REGISTER_BY_TAG: Record<string, string> = {
  colloquial: "colloquial",
  informal: "informal",
  slang: "slang",
  vulgar: "vulgar",
  humorous: "humorous",
  derogatory: "derogatory",
  offensive: "derogatory",
  literary: "literary",
  poetic: "poetic",
  euphemistic: "euphemistic",
  honorific: "honorific",
  humble: "humble",
  childish: "childish",
};
function extractGender(tags: string[] = []): "m" | "f" | "n" | "mf" | undefined {
  for (const t of tags) if (GENDER_BY_TAG[t]) return GENDER_BY_TAG[t];
  return undefined;
}
function extractRegister(tags: string[] = []): string | undefined {
  for (const t of tags) if (REGISTER_BY_TAG[t]) return REGISTER_BY_TAG[t];
  return undefined;
}

export async function wiktionarySearch(
  supabase: SupabaseClient,
  word: string,
  lang: "en" | "es" | "fr" | "de" | "it",
): Promise<DictEntry[]> {
  const { data, error } = await supabase
    .from("wiktionary_entries")
    .select("pos, ipa, etymology_number, senses")
    .eq("word", word.trim().toLowerCase())
    .eq("lang", lang)
    .limit(20);
  if (error) {
    console.warn(`[wiktionary] query failed: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as WiktRow[];
  if (rows.length === 0) return [];

  const entries: DictEntry[] = [];
  rows.forEach((row, entIdx) => {
    const senses: DictSense[] = (row.senses ?? [])
      .filter((s) => !isArchaicSense(s.tags) && !isFormOf(s.tags))
      .map((s, sIdx) => {
      // sense_id prefix (before ':') is the "entry key" that
      // groupByEntryThenTranslation Layer-1 collapses to a single
      // representative. In Wiktionary each gloss is a genuinely distinct
      // meaning (power: ability / authority / force / electricity / …), so
      // every sense must be its OWN entry — otherwise all senses of one POS
      // get merged into one. Make the prefix unique per sense; Layer-2 still
      // merges senses that share the same target translation (e.g. several
      // "ability" glosses → one 능력).
      const tags = s.tags ?? [];
      const sense: DictSense = {
        sense_id: `${entIdx}_${sIdx}:0`,
        source_def: s.gloss,
        // For en→X lookups the gloss IS the English definition; for the other
        // Latin langs the gloss is in the source language and the AI judge
        // produces the English/target gloss downstream (same as freedict.ts).
        en_translation: lang === "en" ? s.gloss : undefined,
        pos: row.pos ?? undefined,
        misc_tags: tags,
        homograph_index: String(row.etymology_number ?? entIdx),
        gender: extractGender(tags),
        register: extractRegister(tags),
      };
      const exs = (s.examples ?? []).filter(Boolean).map((text) => ({ text }));
      if (exs.length > 0) sense.examples = exs;
      return sense;
    });
    // Entry whose every sense was archaic-tagged — drop entirely.
    if (senses.length === 0) return;
    entries.push({
      headword: word,
      reading: row.ipa ?? undefined,
      senses,
      source: "wiktionary",
    });
  });
  return entries;
}
