export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  sourceLang: string;
  targetLang: string | null;
  bidirectional: boolean;
  studyLang: string | null;
  isbn: string | null;
  coverUrl: string | null;
  notifEnabled: boolean;
  notifHour: number | null;
  notifMinute: number;
  notifDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserWord {
  id: string;
  userId: string;
  bookId: string | null;
  word: string;
  /** Polysemy disambiguator. '' for normal entries; e.g. 'chang' / 'zhang' for
   * the two readings of 长. Two entries with same `word` + different
   * `readingKey` represent distinct senses with separate meanings/TTS. */
  readingKey: string;
  cacheKey: string | null;
  userNote: string | null;
  sourceSentence: string | null;
  easeFactor: number;
  intervalDays: number;
  nextReview: string | null;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}
