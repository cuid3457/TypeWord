// Mirror of src/types/word.ts — keep in sync.

export interface WordMeaning {
  definition: string;
  partOfSpeech: string;
  relevanceScore: number;
  /** Grammatical gender for nouns in gendered languages (de/fr/es/it/pt/ru).
   * `m` masculine, `f` feminine, `n` neuter, `mf` common/epicene. Omitted otherwise. */
  gender?: "m" | "f" | "n" | "mf";
}

export interface WordExample {
  sentence: string;
  translation: string;
  meaningIndex?: number;
}

export type WordLookupMode = "quick" | "enrich";

/**
 * Reasons the AI returned an empty/low-confidence result.
 * - "sentence": input was a full sentence/question, not a word.
 * - "non_word": gibberish or unrecognized string with no plausible correction.
 * - "wrong_language": input is clearly a word in a different language.
 * - "phrase_too_long": valid phrase but exceeds the per-language length cap.
 */
export type WordLookupNote = "sentence" | "non_word" | "wrong_language" | "phrase_too_long";

export interface WordLookupResult {
  /** Correctly spelled form in source language (capitalization/diacritics restored). */
  headword?: string;
  reading?: string | string[];
  meanings: WordMeaning[];
  synonyms?: string[];
  antonyms?: string[];
  examples?: WordExample[];

  /** AI confidence the lookup is useful (0–100). */
  confidence?: number;
  /** Echo of the raw user input. */
  originalInput?: string;
  /** Set when the AI silently corrected a typo — the corrected form. */
  correctedHeadword?: string;
  /** Reason code paired with empty meanings. */
  note?: WordLookupNote;
}

export interface WordLookupRequest {
  word: string;
  sourceLang: string;
  targetLang: string;
  mode?: WordLookupMode;
  /** Polysemy disambiguation: free-text hint naming the specific reading/sense
   * to focus on (e.g. "cháng — long, length"). Used by curation. */
  readingHint?: string;
}
