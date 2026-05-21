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
 * Fetch all dates that qualify as "studied" within a range. Primary source is
 * the persistent `study_dates` table (records survive wordlist deletion).
 * Falls back to live user_words computation as a safety net so any newly-
 * crossed threshold during the current session is reflected before it gets
 * recorded, but the live computation is union-ed with the persistent set.
 */
async function getQualifiedDates(startMs: number, endMs: number): Promise<Set<string>> {
  const db = await getDb();

  const startDate = new Date(startMs - DAY_BOUNDARY_HOUR * 3600_000).toISOString().slice(0, 10);
  const endDate = new Date(endMs - DAY_BOUNDARY_HOUR * 3600_000).toISOString().slice(0, 10);

  const persisted = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM study_dates WHERE date >= ? AND date <= ?`,
    [startDate, endDate],
  );

  // Streak qualification: 20+ distinct words reviewed OR 10+ manual word
  // adds in the day. Asymmetric thresholds because new-word entry costs
  // more cognitively than review. Curated bulk imports stay excluded.
  const reviewRows = await db.getAllAsync<{ d: string, cnt: number }>(
    `SELECT date(datetime(updated_at / 1000, 'unixepoch', 'localtime', '-${DAY_BOUNDARY_HOUR} hours')) as d,
            COUNT(*) as cnt
     FROM user_words
     WHERE review_count > 0 AND updated_at >= ? AND updated_at < ?
     GROUP BY d
     HAVING cnt >= 20`,
    [startMs, endMs],
  );

  // Add path excludes bulk-curated imports (source = 'curated') so that
  // tapping "add HSK 1 to my library" doesn't satisfy the streak by itself.
  const addedRows = await db.getAllAsync<{ d: string, cnt: number }>(
    `SELECT date(datetime(created_at / 1000, 'unixepoch', 'localtime', '-${DAY_BOUNDARY_HOUR} hours')) as d,
            COUNT(*) as cnt
     FROM user_words
     WHERE source = 'manual' AND created_at >= ? AND created_at < ?
     GROUP BY d
     HAVING cnt >= 10`,
    [startMs, endMs],
  );

  const qualified = new Set<string>();
  for (const r of persisted) qualified.add(r.date);
  for (const r of reviewRows) qualified.add(r.d);
  for (const r of addedRows) qualified.add(r.d);
  return qualified;
}

/**
 * Persist today's streak-date if the current state qualifies. Called from save
 * and review flows so a one-time qualification survives later wordlist/word
 * deletion. Idempotent (INSERT OR IGNORE).
 */
export async function recordStudyDateIfQualified(): Promise<boolean> {
  const today = getTodayStreakDate();
  const todayStart = new Date(today);
  todayStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayStartMs + DAY_MS;
  const qualified = await getQualifiedDates(todayStartMs, todayEndMs);
  if (!qualified.has(today)) return false;
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO study_dates (date, qualified_at) VALUES (?, ?)`,
    [today, Date.now()],
  );
  return true;
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
  // Freezes only protect the *current* unfinished segment of missed days.
  // We snapshot the live inventory once and decrement locally as we walk.
  let freezesAvailable = 0;
  try {
    const { getInventory } = require('./pointsService');
    freezesAvailable = getInventory().streakFreezes ?? 0;
  } catch { /* pointsService unavailable — proceed without freezes */ }

  for (const done of pastDays) {
    if (done) {
      streak++;
      // Refill one heart per qualifying day, capped at MAX_HEARTS. Every
      // miss costs a heart; every "good day" refunds one.
      if (hearts < MAX_HEARTS) hearts++;
    } else if (hearts > 0) {
      hearts--;
    } else if (freezesAvailable > 0) {
      // Store-bought safety net kicks in after hearts deplete. The actual
      // server-side decrement happens via consumeStreakFreeze(), triggered
      // from the streak-check entry points.
      freezesAvailable--;
    } else {
      streak = 0;
      hearts = MAX_HEARTS;
    }
  }

  if (todayDone) {
    streak++;
    if (hearts < MAX_HEARTS) hearts++;
  }

  return { current: streak, todayDone, hearts };
}

/**
 * Walk the recent miss history vs the server-held freeze count and call
 * consume_streak_freeze() for each freeze used since the last check. Idempotent
 * at the *consumption* level: the server already returns false when there's
 * nothing to consume, so over-calls are harmless. Best-effort.
 */
export async function reconcileStreakFreezeConsumption(): Promise<void> {
  try {
    const today = getTodayStreakDate();
    const todayStart = new Date(today);
    todayStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayStartMs + DAY_MS;

    const lookbackDays = 60;
    const rangeStartMs = todayStartMs - lookbackDays * DAY_MS;
    const qualified = await getQualifiedDates(rangeStartMs, todayEndMs);

    let hearts = MAX_HEARTS;
    let freezesToConsume = 0;
    const checkDate = new Date(today);
    for (let i = 0; i < lookbackDays; i++) {
      checkDate.setDate(checkDate.getDate() - 1);
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (qualified.has(dateStr)) {
        if (hearts < MAX_HEARTS) hearts++;
      } else if (hearts > 0) {
        hearts--;
      } else {
        freezesToConsume++;
      }
    }

    if (freezesToConsume <= 0) return;
    const { consumeStreakFreeze, getInventory } = await import('./pointsService');
    let remaining = getInventory().streakFreezes ?? 0;
    while (freezesToConsume > 0 && remaining > 0) {
      const ok = await consumeStreakFreeze();
      if (!ok) break;
      remaining--;
      freezesToConsume--;
    }
  } catch { /* best-effort */ }
}

/**
 * Returns the set of YYYY-MM-DD streak dates within the last `daysBack`
 * days where a streak freeze was consumed (user missed but streak survived
 * thanks to a freeze item). Derived by replaying the same forward
 * simulation that computeStreak() uses — no freeze_consumption_log table
 * exists, so this is the authoritative source for "frozen" days.
 *
 * Display contract: callers (dashboard calendar) render these with the
 * red border to differentiate from plain studied (mint fill) and plain
 * non-studied (no marker).
 */
export async function getFrozenDates(daysBack: number): Promise<Set<string>> {
  const today = getTodayStreakDate();
  const todayStart = new Date(today);
  todayStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayStartMs + DAY_MS;
  const rangeStartMs = todayStartMs - daysBack * DAY_MS;
  const qualified = await getQualifiedDates(rangeStartMs, todayEndMs);

  // Walk back collecting dates within the active streak window. Mirror
  // computeStreak()'s early-exit: 4+ consecutive misses end the window.
  const pastDates: { date: string; done: boolean }[] = [];
  const cd = new Date(today);
  let consecutiveMisses = 0;
  for (let i = 0; i < daysBack; i++) {
    cd.setDate(cd.getDate() - 1);
    const dateStr = cd.toISOString().slice(0, 10);
    const done = qualified.has(dateStr);
    pastDates.push({ date: dateStr, done });
    if (!done) {
      consecutiveMisses++;
      if (consecutiveMisses > MAX_HEARTS) break;
    } else {
      consecutiveMisses = 0;
    }
  }
  pastDates.reverse(); // chronological, oldest first

  let hearts = MAX_HEARTS;
  let freezesAvailable = 0;
  try {
    const { getInventory } = require('./pointsService');
    freezesAvailable = getInventory().streakFreezes ?? 0;
  } catch { /* pointsService unavailable */ }

  const frozen = new Set<string>();
  for (const { date, done } of pastDates) {
    if (done) {
      if (hearts < MAX_HEARTS) hearts++;
    } else if (hearts > 0) {
      hearts--;
    } else if (freezesAvailable > 0) {
      freezesAvailable--;
      frozen.add(date);
    } else {
      break; // streak would have reset; nothing further is in the active window
    }
  }
  return frozen;
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
