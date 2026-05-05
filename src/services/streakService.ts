import { getDb } from '@src/db';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DAY_BOUNDARY_HOUR = 4; // 새벽 4시 기준

const MAX_HEARTS = 2;

export function getStreakDate(timestamp: number): string {
  const d = new Date(timestamp - DAY_BOUNDARY_HOUR * HOUR_MS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayStreakDate(): string {
  return getStreakDate(Date.now());
}

export interface StreakInfo {
  current: number;
  todayDone: boolean;
  hearts: number;
}

/**
 * Fetch all dates that qualify as "studied" within a range, using only 2 queries.
 * Returns a Set of streak-date strings (YYYY-MM-DD).
 */
async function getQualifiedDates(startMs: number, endMs: number): Promise<Set<string>> {
  const db = await getDb();

  const reviewRows = await db.getAllAsync<{ d: string }>(
    `SELECT DISTINCT date(datetime(updated_at / 1000, 'unixepoch', 'localtime', '-${DAY_BOUNDARY_HOUR} hours')) as d
     FROM user_words
     WHERE review_count > 0 AND updated_at >= ? AND updated_at < ?`,
    [startMs, endMs],
  );

  const addedRows = await db.getAllAsync<{ d: string, cnt: number }>(
    `SELECT date(datetime(created_at / 1000, 'unixepoch', 'localtime', '-${DAY_BOUNDARY_HOUR} hours')) as d,
            COUNT(*) as cnt
     FROM user_words
     WHERE created_at >= ? AND created_at < ?
     GROUP BY d
     HAVING cnt >= 5`,
    [startMs, endMs],
  );

  const qualified = new Set<string>();
  for (const r of reviewRows) qualified.add(r.d);
  for (const r of addedRows) qualified.add(r.d);
  return qualified;
}

export async function getStreak(): Promise<StreakInfo> {
  const today = getTodayStreakDate();

  const todayStart = new Date(today);
  todayStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayStartMs + DAY_MS;

  const lookbackDays = 730;
  const rangeStartMs = todayStartMs - lookbackDays * DAY_MS;

  const qualified = await getQualifiedDates(rangeStartMs, todayEndMs);
  const todayDone = qualified.has(today);

  // Walk backwards from yesterday, build pastDays array
  const pastDays: boolean[] = [];
  let checkDate = new Date(today);
  let consecutiveMisses = 0;

  for (let i = 0; i < lookbackDays; i++) {
    checkDate.setDate(checkDate.getDate() - 1);
    const dateStr = checkDate.toISOString().slice(0, 10);
    const done = qualified.has(dateStr);
    pastDays.push(done);

    if (!done) {
      consecutiveMisses++;
      if (consecutiveMisses > MAX_HEARTS) break;
    } else {
      consecutiveMisses = 0;
    }
  }

  // Reverse to chronological order and simulate forward
  pastDays.reverse();

  let streak = 0;
  let hearts = MAX_HEARTS;

  for (const done of pastDays) {
    if (done) {
      streak++;
    } else if (hearts > 0) {
      hearts--;
    } else {
      streak = 0;
      hearts = MAX_HEARTS;
    }
  }

  if (todayDone) streak++;

  return { current: streak, todayDone, hearts };
}

/**
 * Returns the set of YYYY-MM-DD streak dates (in user's local time, with the
 * 4 AM day boundary) where the user qualified as "studied" within the last
 * `daysBack` days. Used by the dashboard calendar heatmap to render activity.
 */
export async function getStudiedDates(daysBack: number): Promise<Set<string>> {
  const today = getTodayStreakDate();
  const todayStart = new Date(today);
  todayStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayStartMs + DAY_MS;
  const rangeStartMs = todayStartMs - daysBack * DAY_MS;
  return getQualifiedDates(rangeStartMs, todayEndMs);
}

export async function getPreferredNotificationHour(): Promise<number> {
  const db = await getDb();
  const twoWeeksAgo = Date.now() - 14 * DAY_MS;

  const rows = await db.getAllAsync<{ ts: number }>(
    `SELECT MIN(ts) as ts FROM (
       SELECT updated_at as ts, date(datetime(updated_at / 1000, 'unixepoch', 'localtime', '-4 hours')) as d
       FROM user_words WHERE review_count > 0 AND updated_at >= ?
       UNION ALL
       SELECT created_at as ts, date(datetime(created_at / 1000, 'unixepoch', 'localtime', '-4 hours')) as d
       FROM user_words WHERE created_at >= ?
     ) GROUP BY d`,
    [twoWeeksAgo, twoWeeksAgo],
  );

  if (rows.length < 3) return 21;

  const hours = rows.map((r) => new Date(r.ts).getHours());
  const sum = hours.reduce((a, b) => a + b, 0);
  const avgStudyHour = Math.round(sum / hours.length);
  let notifHour = avgStudyHour + 1;
  if (notifHour >= 24) notifHour -= 24;

  return notifHour;
}
