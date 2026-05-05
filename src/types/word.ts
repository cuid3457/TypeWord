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
  /** Grammatical gender for nouns in gendered languages (de, fr, es, it, pt, ru).
   * `m` masculine, `f` feminine, `n` neuter, `mf` common/epicene (one surface
   * form used for both genders, e.g. French élève, médecin, enfant). Omitted
   * for non-nouns and for languages without grammatical gender. Displayed
   * alongside partOfSpeech. */
  gender?: 'm' | 'f' | 'n' | 'mf';
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
export type WordLookupMode = 'quick' | 'enrich';

/**
 * Reasons the AI returned an empty/low-confidence result.
 * - 'sentence': input was a full sentence/question, not a word.
 * - 'non_word': gibberish or unrecognized string with no plausible correction.
 * - 'wrong_language': input is clearly a word in a different language.
 * - 'phrase_too_long': valid phrase but exceeds the per-language length cap.
 */
export type WordLookupNote = 'sentence' | 'non_word' | 'wrong_language' | 'phrase_too_long';

export interface WordLookupResult {
  headword?: string;
  reading?: string | string[];
  /** IPA phonetic transcription. Only set for European-language single
   *  words/proper nouns (espeak-ng generated). Empty for CJK and expressions. */
  ipa?: string;
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
  bookId?: string;
  sourceLang: string;
  targetLang: string;
  mode?: WordLookupMode;
}
