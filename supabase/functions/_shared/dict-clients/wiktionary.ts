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

  return rows.map((row, entIdx) => {
    const senses: DictSense[] = (row.senses ?? []).map((s, sIdx) => {
      // sense_id prefix (before ':') is the "entry key" that
      // groupByEntryThenTranslation Layer-1 collapses to a single
      // representative. In Wiktionary each gloss is a genuinely distinct
      // meaning (power: ability / authority / force / electricity / …), so
      // every sense must be its OWN entry — otherwise all senses of one POS
      // get merged into one. Make the prefix unique per sense; Layer-2 still
      // merges senses that share the same target translation (e.g. several
      // "ability" glosses → one 능력).
      const sense: DictSense = {
        sense_id: `${entIdx}_${sIdx}:0`,
        source_def: s.gloss,
        // For en→X lookups the gloss IS the English definition; for the other
        // Latin langs the gloss is in the source language and the AI judge
        // produces the English/target gloss downstream (same as freedict.ts).
        en_translation: lang === "en" ? s.gloss : undefined,
        pos: row.pos ?? undefined,
        misc_tags: s.tags ?? [],
        homograph_index: String(row.etymology_number ?? entIdx),
      };
      const exs = (s.examples ?? []).filter(Boolean).map((text) => ({ text }));
      if (exs.length > 0) sense.examples = exs;
      return sense;
    });
    return {
      headword: word,
      reading: row.ipa ?? undefined,
      senses,
      source: "wiktionary",
    };
  });
}
