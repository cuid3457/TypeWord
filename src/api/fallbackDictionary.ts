/**
 * Free Dictionary API fallback for when the Edge Function / OpenAI fails or is
 * budget-exhausted. Currently supports English only. Called directly from the
 * client (no Edge Function indirection), so no cost / rate-limit concerns.
 */
import type { WordLookupResult } from '@src/types/word';

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries';

interface RawMeaning {
  partOfSpeech?: string;
  definitions?: { definition?: string; example?: string }[];
  synonyms?: string[];
  antonyms?: string[];
}

interface RawEntry {
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: RawMeaning[];
}

export async function fetchFromFallbackDictionary(
  word: string,
  sourceLang: string,
): Promise<WordLookupResult | null> {
  if (sourceLang !== 'en') return null;

  try {
    const res = await fetch(
      `${ENDPOINT}/${sourceLang}/${encodeURIComponent(word.trim().toLowerCase())}`,
    );
    if (!res.ok) return null;
    const entries = (await res.json()) as RawEntry[];
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const first = entries[0];

    const meanings = (first.meanings ?? []).flatMap((m) =>
      (m.definitions ?? []).slice(0, 2).map((d) => ({
        definition: d.definition ?? '',
        partOfSpeech: m.partOfSpeech ?? '',
        relevanceScore: 50,
      })),
    );

    const synonyms = Array.from(
      new Set((first.meanings ?? []).flatMap((m) => m.synonyms ?? [])),
    ).slice(0, 10);

    const antonyms = Array.from(
      new Set((first.meanings ?? []).flatMap((m) => m.antonyms ?? [])),
    ).slice(0, 10);

    const examples = (first.meanings ?? [])
      .flatMap((m) => (m.definitions ?? []).filter((d) => d.example))
      .slice(0, 2)
      .map((d) => ({ sentence: d.example ?? '', translation: '' }));

    return {
      meanings,
      synonyms,
      antonyms,
      examples,
    };
  } catch {
    return null;
  }
}
