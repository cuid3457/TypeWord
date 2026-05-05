import * as SQLite from 'expo-sqlite';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11, SCHEMA_V12, SCHEMA_V13, SCHEMA_V14, SCHEMA_V15, SCHEMA_VERSION } from './schema';

const DB_NAME = 'typeword.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await runMigrations(db);
      return db;
    })();
  }
  return dbPromise;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const current = row?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(SCHEMA_V1);
    await db.execAsync('PRAGMA user_version = 1');
  }

  if (current < 2) {
    try { await db.execAsync(SCHEMA_V2); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 2');
  }

  if (current < 3) {
    try { await db.execAsync(SCHEMA_V3); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 3');
  }

  if (current < 4) {
    try { await db.execAsync(SCHEMA_V4); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 4');
  }

  if (current < 5) {
    try { await db.execAsync(SCHEMA_V5); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 5');
  }

  if (current < 6) {
    try { await db.execAsync(SCHEMA_V6); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 6');
  }

  if (current < 7) {
    await db.execAsync(SCHEMA_V7);
    await db.execAsync('PRAGMA user_version = 7');
  }

  if (current < 8) {
    try { await db.execAsync(SCHEMA_V8); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 8');
  }

  if (current < 9) {
    await db.execAsync(SCHEMA_V9);
    await db.execAsync('PRAGMA user_version = 9');
  }

  if (current < 10) {
    try { await db.execAsync(SCHEMA_V10); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 10');
  }

  if (current < 11) {
    try { await db.execAsync(SCHEMA_V11); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 11');
  }

  if (current < 12) {
    try { await db.execAsync(SCHEMA_V12); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 12');
  }

  if (current < 13) {
    try { await db.execAsync(SCHEMA_V13); } catch { /* column may already exist */ }
    await db.execAsync('PRAGMA user_version = 13');
  }

  if (current < 14) {
    // V14 has 3 statements: ADD COLUMN, DROP INDEX, CREATE UNIQUE INDEX. Run
    // each independently so a half-applied state from an earlier failed boot
    // (e.g. column added but index swap not done) is recoverable.
    try {
      await db.execAsync(`ALTER TABLE user_words ADD COLUMN reading_key TEXT NOT NULL DEFAULT '';`);
    } catch { /* column already exists */ }
    try {
      await db.execAsync(`DROP INDEX IF EXISTS idx_user_words_unique;`);
    } catch { /* not present */ }
    try {
      await db.execAsync(
        `CREATE UNIQUE INDEX idx_user_words_unique ` +
        `ON user_words(COALESCE(book_id, ''), word, reading_key);`,
      );
    } catch { /* index may already exist with new shape */ }
    await db.execAsync('PRAGMA user_version = 14');
  }

  if (current < 15) {
    // Defensive re-application: some devices reached user_version=14 with the
    // old (book_id, word) index still active because the multi-statement V14
    // string aborted mid-run. Force-recreate the index in the new shape.
    try {
      await db.execAsync(SCHEMA_V15);
    } catch (err) {
      console.warn('SCHEMA_V15 failed:', err);
    }
    await db.execAsync('PRAGMA user_version = 15');
  }
}

export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM pending_deletes; DELETE FROM pending_reports; DELETE FROM user_words; DELETE FROM books;');
  await AsyncStorage.removeItem('typeword.lastSync');
  // Wipe local TTS audio files so a voice swap on the server takes effect
  // immediately. Without this, persistent mp3s recorded with the old voice
  // would still be played for words the user had previously saved.
  try {
    const { clearAllTtsFiles } = await import('@src/services/ttsCache');
    clearAllTtsFiles();
  } catch (err) {
    console.warn('TTS file cleanup during reset failed:', err);
  }
}

/** Test helper: drop and re-create everything. Do NOT call in production flows. */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DROP TABLE IF EXISTS user_words;
    DROP TABLE IF EXISTS books;
    PRAGMA user_version = 0;
  `);
  dbPromise = null;
}
