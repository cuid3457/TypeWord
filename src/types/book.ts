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
  createdAt: string;
  updatedAt: string;
}

export interface UserWord {
  id: string;
  userId: string;
  bookId: string | null;
  word: string;
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
