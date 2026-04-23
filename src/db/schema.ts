/**
 * SQLite local schema. Mirrors the server-side user-owned tables so the app
 * can work fully offline. api_calls / review_logs are server-only (for now).
 *
 * Schema changes: bump SCHEMA_VERSION and add a migration block to runMigrations().
 */

export const SCHEMA_VERSION = 10;

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
