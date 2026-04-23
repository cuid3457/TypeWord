// Mirror of src/types/word.ts — keep in sync.

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

export type WordLookupMode = "quick" | "enrich";

export interface WordLookupResult {
  reading?: string | string[];
  meanings: WordMeaning[];
  synonyms?: string[];
  antonyms?: string[];
  examples?: WordExample[];
}

export interface WordLookupRequest {
  word: string;
  sourceLang: string;
  targetLang: string;
  mode?: WordLookupMode;
}
