/**
 * SQLite local schema. Mirrors the server-side user-owned tables so the app
 * can work fully offline. api_calls / review_logs are server-only (for now).
 *
 * Schema changes: bump SCHEMA_VERSION and add a migration block to runMigrations().
 */

export const SCHEMA_VERSION = 19;

export const SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
  id            TEXT PRIMARY KEY NOT NULL,
  title         TEXT NOT NULL,
  author        TEXT,
  source_lang   TEXT NOT NULL,
  isbn          TEXT,
  cover_url     TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  synced_at     INTEGER
);

CREATE TABLE IF NOT EXISTS user_words (
  id               TEXT PRIMARY KEY NOT NULL,
  book_id          TEXT,
  word             TEXT NOT NULL,
  result_json      TEXT NOT NULL,
  user_note        TEXT,
  source_sentence  TEXT,
  ease_factor      REAL NOT NULL DEFAULT 2.5,
  interval_days    INTEGER NOT NULL DEFAULT 0,
  next_review      INTEGER,
  review_count     INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  synced_at        INTEGER,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_words_book ON user_words(book_id);
CREATE INDEX IF NOT EXISTS idx_user_words_review ON user_words(next_review);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_words_unique
  ON user_words(COALESCE(book_id, ''), word);
`;

export const SCHEMA_V2 = `
ALTER TABLE books ADD COLUMN target_lang TEXT;
`;

export const SCHEMA_V3 = `
ALTER TABLE books ADD COLUMN bidirectional INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V4 = `
ALTER TABLE books ADD COLUMN study_lang TEXT;
`;

export const SCHEMA_V5 = `
ALTER TABLE books ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V6 = `
ALTER TABLE books ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V7 = `
CREATE TABLE IF NOT EXISTS pending_deletes (
  record_id  TEXT NOT NULL,
  table_name TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);
`;

export const SCHEMA_V8 = `
ALTER TABLE user_words ADD COLUMN learning_step INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V9 = `
CREATE TABLE IF NOT EXISTS pending_reports (
  id          TEXT PRIMARY KEY NOT NULL,
  word        TEXT NOT NULL,
  word_id     TEXT,
  reason      TEXT NOT NULL,
  description TEXT,
  context     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
`;

export const SCHEMA_V10 = `
ALTER TABLE user_words ADD COLUMN cache_synced_at INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V11 = `
ALTER TABLE books ADD COLUMN notif_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN notif_hour INTEGER;
`;

export const SCHEMA_V12 = `
ALTER TABLE books ADD COLUMN notif_minute INTEGER NOT NULL DEFAULT 0;
`;

export const SCHEMA_V13 = `
ALTER TABLE books ADD COLUMN notif_days INTEGER NOT NULL DEFAULT 127;
`;

// V14: polysemy split. reading_key disambiguates same-word entries with
// different readings (e.g. 长 cháng vs zhǎng). '' = no reading distinction.
// The unique index moves from (book_id, word) to (book_id, word, reading_key)
// so users can keep both readings as separate cards in the same wordlist.
export const SCHEMA_V14 = `
ALTER TABLE user_words ADD COLUMN reading_key TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS idx_user_words_unique;
CREATE UNIQUE INDEX idx_user_words_unique
  ON user_words(COALESCE(book_id, ''), word, reading_key);
`;

// V15: defensive re-application of V14 index. Some devices got stuck with the
// old (book_id, word) UNIQUE index after the V14 migration partially failed —
// resulting in polysemous entries (长 cháng / zhǎng) collapsing back to a
// single row when added from a curated wordlist. Force-recreate the index here
// so all devices end up on the new (book_id, word, reading_key) shape.
export const SCHEMA_V15 = `
DROP INDEX IF EXISTS idx_user_words_unique;
CREATE UNIQUE INDEX idx_user_words_unique
  ON user_words(COALESCE(book_id, ''), word, reading_key);
`;

// V16: persistent study-date table. Streak qualification used to be derived
// from user_words on the fly, which meant deleting wordlists wiped past
// activity from the calendar. study_dates stores qualified streak-dates
// independently so calendar/streak survive any wordlist deletion.
export const SCHEMA_V16 = `
CREATE TABLE IF NOT EXISTS study_dates (
  date          TEXT PRIMARY KEY NOT NULL,
  qualified_at  INTEGER NOT NULL
);
`;

// V17: distinguish manually-typed vs bulk-curated word adds for streak.
// Bulk import of a curated wordlist (e.g. tapping "add HSK 1 to my library")
// creates many rows at once with a single button press — counting those
// toward the streak's add path makes the streak trivially gameable. The
// `source` column is set to 'curated' for those imports so the streak query
// can exclude them. Default 'manual' preserves prior behavior for existing
// rows.
export const SCHEMA_V17 = `
ALTER TABLE user_words ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
`;

// V18: curated wordlist sync state. Track which curated wordlist a book
// originated from (curated_wordlist_id) plus the last content_version we
// pulled (content_version) and the server timestamp of the newest row we
// applied (last_synced_at). Together these let the launch-time sync ask
// "anything new for this list since I last looked?" and pull only the
// diff. NULL curated_wordlist_id = manual book (never synced from curated).
export const SCHEMA_V18 = `
ALTER TABLE books ADD COLUMN curated_wordlist_id TEXT;
ALTER TABLE books ADD COLUMN content_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN last_synced_at INTEGER NOT NULL DEFAULT 0;
`;

// V19: report context for Phase 8 (AI judge + auto-fix loop). source_lang
// and target_lang let the server group reports by lang pair and pass that
// context to the judge prompt.
export const SCHEMA_V19 = `
ALTER TABLE pending_reports ADD COLUMN source_lang TEXT;
ALTER TABLE pending_reports ADD COLUMN target_lang TEXT;
`;
