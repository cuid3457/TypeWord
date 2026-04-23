/**
 * Canonical shape of an AI-generated word entry.
 * This is the JSON contract between the Edge Function (AI output)
 * and the client (display + storage).
 * Keep in sync with `supabase/functions/_shared/types.ts`.
 */
export interface WordMeaning {
  definition: string;
  partOfSpeech: string;
  relevanceScore: number;
}

export interface WordExample {
  sentence: string;
  translation: string;
  meaningIndex?: number;
}

/**
 * Quick lookup returns only what's shown on the search screen.
 * Enrich lookup adds examples / synonyms / antonyms — generated on save.
 */
export type WordLookupMode = "quick" | "enrich";

export interface WordLookupResult {
  headword?: string;
  reading?: string | string[];
  meanings: WordMeaning[];
  synonyms?: string[];
  antonyms?: string[];
  examples?: WordExample[];
}

export interface WordLookupRequest {
  word: string;
  bookId?: string;
  sourceLang: string;
  targetLang: string;
  mode?: WordLookupMode;
}
