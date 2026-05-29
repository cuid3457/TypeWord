import { Platform } from 'react-native';

import { getStreak, getPreferredNotificationHour } from './streakService';
import { getReviewableCount, getRecentBookName, getWeeklyStudyCount, getBooksForNotifications } from '@src/db/queries';
import { captureError } from './sentry';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');

  Notifications!.setNotificationHandler({
    handleNotification: async (notification) => {
      // Foreground path: mirror the badge from the FCM data sidecar — iOS
      // only. Android's launcher badge is disabled by channel showBadge:
      // false, so calling setBadgeCountAsync here would do nothing useful.
      if (Platform.OS !== 'android') {
        try {
          const raw = notification?.request?.content?.data?.badge_count;
          if (raw !== undefined && raw !== null) {
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            if (Number.isFinite(n) && n >= 0) {
              Notifications!.setBadgeCountAsync(n).catch(() => {});
            }
          }
        } catch { /* silent */ }
      }
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  // Android 8+ requires a notification channel for any notification to display.
  // Without this, scheduled alarms fire but expo-notifications silently drops
  // them (no banner). Create a default channel at module load.
  if (Platform.OS === 'android' && Notifications) {
    // HIGH importance ensures heads-up banner + sound on lock screen.
    // showBadge: false — Samsung One UI's launcher badge can't be kept in
    // sync reliably across sequential pushes (FCM notification_count and
    // setBadgeCountAsync are both partially ignored). Rather than showing
    // a stale "1" when the actual count is higher, we disable the launcher
    // badge entirely on Android. Notifications still appear normally.
    Notifications
      .setNotificationChannelAsync('study-reminders', {
        name: 'Study Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      })
      .catch(() => {
        // Channel creation can fail if permissions denied — non-blocking.
      });
  }
} catch {
  Notifications = null;
}

export function isNotificationAvailable(): boolean {
  return Notifications !== null;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export type PushPlatform = 'android' | 'ios-sandbox' | 'ios-production';

export interface DevicePushToken {
  token: string;
  platform: PushPlatform;
}

/**
 * Returns the raw device push token (FCM on Android, APNs on iOS) along
 * with a platform tag the edge functions use to pick the delivery route.
 * iOS distinguishes sandbox vs production because the APNs endpoints
 * differ; we infer from __DEV__, which is true for debug builds (expo
 * run:ios) and false for Release/TestFlight/App Store builds.
 */
export async function getDevicePushToken(): Promise<DevicePushToken | null> {
  if (!Notifications) return null;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData?.data;
    if (!token) return null;
    const platform: PushPlatform = Platform.OS === 'ios'
      ? (__DEV__ ? 'ios-sandbox' : 'ios-production')
      : 'android';
    return { token, platform };
  } catch (e) {
    captureError(e as Error);
    return null;
  }
}

export interface NotificationTranslations {
  reviewTitle: string;
  reviewBody: string;
  addTitle: string;
  addBody: string;
  streakSuffix: string;
  return7dTitle: string;
  return7dBody: string;
  return10dTitle: string;
  return10dBody: string;
  return14dTitle: string;
  return14dBody: string;
  weeklyTitle: string;
  weeklyBody: string;
  perListTitle: string;
  perListBodyDue: string;
  perListBodyDue2: string;
  perListBodyDueStreak: string;
  perListBodyEmpty: string;
  perListBodyEmpty2: string;
  perListBodyEmptyStreak: string;
}

export function getNotificationTranslations(t: (key: string) => string): NotificationTranslations {
  return {
    reviewTitle: t('notification.review_title'),
    reviewBody: t('notification.review_body'),
    addTitle: t('notification.add_title'),
    addBody: t('notification.add_body'),
    streakSuffix: t('notification.streak_suffix'),
    return7dTitle: t('notification.return_7d_title'),
    return7dBody: t('notification.return_7d_body'),
    return10dTitle: t('notification.return_10d_title'),
    return10dBody: t('notification.return_10d_body'),
    return14dTitle: t('notification.return_14d_title'),
    return14dBody: t('notification.return_14d_body'),
    weeklyTitle: t('notification.weekly_title'),
    weeklyBody: t('notification.weekly_body'),
    perListTitle: t('notification.per_list_title'),
    perListBodyDue: t('notification.per_list_body_due'),
    perListBodyDue2: t('notification.per_list_body_due_2'),
    perListBodyDueStreak: t('notification.per_list_body_due_streak'),
    perListBodyEmpty: t('notification.per_list_body_empty'),
    perListBodyEmpty2: t('notification.per_list_body_empty_2'),
    perListBodyEmptyStreak: t('notification.per_list_body_empty_streak'),
  };
}

export function stripBookName(s: string): string {
  return s.replace(/['']?\{\{bookName\}\}['']?[^{}\w]*/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function getDailyContent(
  tr: NotificationTranslations,
  dueCount: number,
  streak: number,
  bookName: string | null,
): { title: string; body: string } {
  const useReviewType = dueCount > 0 && Math.random() < 0.7;
  let title: string;
  let body: string;

  if (useReviewType) {
    title = tr.reviewTitle;
    const raw = bookName
      ? tr.reviewBody.replace('{{bookName}}', bookName)
      : stripBookName(tr.reviewBody);
    body = raw.replace('{{count}}', String(dueCount));
  } else {
    title = bookName
      ? tr.addTitle.replace('{{bookName}}', bookName)
      : stripBookName(tr.addTitle);
    body = tr.addBody;
  }

  if (streak > 0) {
    body += ` ${tr.streakSuffix.replace('{{count}}', String(streak))}`;
  }
  return { title, body };
}

export function getReengagementContent(
  tr: NotificationTranslations,
  daysFromNow: number,
  dueCount: number,
): { title: string; body: string } {
  if (daysFromNow <= 7) {
    return { title: tr.return7dTitle, body: tr.return7dBody };
  }
  if (daysFromNow <= 10) {
    return { title: tr.return10dTitle, body: tr.return10dBody };
  }
  return {
    title: tr.return14dTitle,
    body: tr.return14dBody.replace('{{count}}', String(dueCount)),
  };
}

/**
 * Pick one of three body variants for a per-list notification.
 * Variant 2 is the streak variant — falls back to variant 0 when streak is 0
 * (so we never show "0-day streak" copy).
 */
function pickPerListBody(
  tr: NotificationTranslations,
  reviewableCount: number,
  streak: number,
  variantIdx: number,
): string {
  const isDue = reviewableCount > 0;
  const useStreak = variantIdx === 2 && streak > 0;

  if (isDue) {
    if (useStreak) {
      return tr.perListBodyDueStreak
        .replace('{{count}}', String(reviewableCount))
        .replace('{{streak}}', String(streak));
    }
    const template = variantIdx === 1 ? tr.perListBodyDue2 : tr.perListBodyDue;
    return template.replace('{{count}}', String(reviewableCount));
  }
  if (useStreak) {
    return tr.perListBodyEmptyStreak.replace('{{streak}}', String(streak));
  }
  return variantIdx === 1 ? tr.perListBodyEmpty2 : tr.perListBodyEmpty;
}

async function scheduleAtDay(
  daysFromNow: number,
  hour: number,
  title: string,
  body: string,
  minute = 0,
): Promise<void> {
  if (!Notifications) return;
  const target = new Date();
  target.setDate(target.getDate() + daysFromNow);
  target.setHours(hour, minute, 0, 0);
  const seconds = Math.floor((target.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      vibrate: [0, 250, 250, 250],
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      ...(Platform.OS === 'android' ? { channelId: 'study-reminders' } : {}),
    },
  });
}

async function scheduleWeeklySummary(
  tr: NotificationTranslations,
  hour: number,
  weeklyCount: number,
  claimedDays: Set<number>,
): Promise<void> {
  if (!Notifications || weeklyCount <= 0) return;

  const now = new Date();
  const dayOfWeek = now.getDay();
  let daysUntilSunday = (7 - dayOfWeek) % 7;
  if (daysUntilSunday === 0) {
    const sundayTarget = new Date(now);
    sundayTarget.setHours(hour, 0, 0, 0);
    if (sundayTarget <= now) daysUntilSunday = 7;
  }
  if (claimedDays.has(daysUntilSunday)) return;

  const target = new Date(now);
  target.setDate(target.getDate() + daysUntilSunday);
  target.setHours(hour, 0, 0, 0);

  const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: tr.weeklyTitle,
      body: tr.weeklyBody.replace('{{count}}', String(weeklyCount)),
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      vibrate: [0, 250, 250, 250],
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      ...(Platform.OS === 'android' ? { channelId: 'study-reminders' } : {}),
    },
  });
  claimedDays.add(daysUntilSunday);
}

async function doReschedule(tr: NotificationTranslations): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hour = await getPreferredNotificationHour();
  const dueCount = await getReviewableCount();
  const { current: streak, todayDone } = await getStreak();
  const bookName = await getRecentBookName();
  const weeklyCount = await getWeeklyStudyCount();
  const notifBooks = await getBooksForNotifications(hour);

  // Hard cap: at most one learning ping per day across all sources
  // (per-list / daily / re-engagement / weekly). Higher-priority source
  // claims the day first; later sources skip claimed days.
  const claimedDays = new Set<number>();

  // Per-list reminders (highest priority — user explicitly opted into a book).
  // Bit 0 = Sunday, ..., Bit 6 = Saturday (matches JS Date.getDay()).
  // If two books fall on the same weekday, only the first book wins that day.
  for (const book of notifBooks) {
    if (book.days === 0) continue;
    const title = tr.perListTitle.replace('{{title}}', book.title);
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      if (claimedDays.has(dayOffset)) continue;
      const target = new Date();
      target.setDate(target.getDate() + dayOffset);
      const dayOfWeek = target.getDay();
      if (!(book.days & (1 << dayOfWeek))) continue;
      const variantIdx = target.getDate() % 3;
      const body = pickPerListBody(tr, book.reviewableCount, streak, variantIdx);
      await scheduleAtDay(dayOffset, book.hour, title, body, book.minute);
      claimedDays.add(dayOffset);
    }
  }

  // Generic daily (only when no per-list books are configured).
  if (notifBooks.length === 0) {
    if (!todayDone && !claimedDays.has(0)) {
      const content = getDailyContent(tr, dueCount, streak, bookName);
      await scheduleAtDay(0, hour, content.title, content.body);
      claimedDays.add(0);
    }
    for (const day of [1, 2, 3]) {
      if (claimedDays.has(day)) continue;
      const content = getDailyContent(tr, dueCount, streak, bookName);
      await scheduleAtDay(day, hour, content.title, content.body);
      claimedDays.add(day);
    }
  }

  // Re-engagement: gradually lengthening cadence so a long-lapsed user
  // doesn't get bombarded — 7d, 10d, 21d, then ~monthly.
  for (const day of [7, 10, 21, 51, 81]) {
    if (claimedDays.has(day)) continue;
    const content = getReengagementContent(tr, day, dueCount);
    await scheduleAtDay(day, hour, content.title, content.body);
    claimedDays.add(day);
  }

  await scheduleWeeklySummary(tr, hour, weeklyCount, claimedDays);
}

// Serialize concurrent reschedule calls. Without this, two callers running
// in parallel (e.g. home-tab focus + ReviewComplete, or a language change
// mid-flight) interleave their cancelAll + schedule sequences, leaving the
// queue with mixed-language items or duplicates at the same time slot.
let inFlightReschedule: Promise<void> | null = null;
let queuedReschedule: NotificationTranslations | null = null;

export async function rescheduleNotifications(tr: NotificationTranslations): Promise<void> {
  if (inFlightReschedule) {
    queuedReschedule = tr;
    return inFlightReschedule;
  }
  inFlightReschedule = (async () => {
    try {
      await doReschedule(tr);
      // Drain any reschedule requests that arrived during this run.
      // Only the most recent tr matters — older ones would just be overwritten.
      while (queuedReschedule) {
        const next = queuedReschedule;
        queuedReschedule = null;
        await doReschedule(next);
      }
    } catch (e) {
      captureError(e, { service: 'notificationService', fn: 'rescheduleNotifications' });
    } finally {
      inFlightReschedule = null;
    }
  })();
  return inFlightReschedule;
}

export async function cancelAllNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    captureError(e, { service: 'notificationService', fn: 'cancelAllNotifications' });
  }
}
