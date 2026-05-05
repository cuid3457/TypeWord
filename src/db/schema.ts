/**
 * SQLite local schema. Mirrors the server-side user-owned tables so the app
 * can work fully offline. api_calls / review_logs are server-only (for now).
 *
 * Schema changes: bump SCHEMA_VERSION and add a migration block to runMigrations().
 */

export const SCHEMA_VERSION = 15;

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
