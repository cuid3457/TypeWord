import { Platform } from 'react-native';

import { getStreak, getPreferredNotificationHour } from './streakService';
import { getReviewableCount, getRecentBookName, getWeeklyStudyCount, getBooksForNotifications } from '@src/db/queries';
import { captureError } from './sentry';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Android 8+ requires a notification channel for any notification to display.
  // Without this, scheduled alarms fire but expo-notifications silently drops
  // them (no banner). Create a default channel at module load.
  if (Platform.OS === 'android' && Notifications) {
    // HIGH importance ensures heads-up banner + sound on lock screen.
    Notifications
      .setNotificationChannelAsync('study-reminders', {
        name: 'Study Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
}

export async function rescheduleNotifications(tr: NotificationTranslations): Promise<void> {
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const hour = await getPreferredNotificationHour();
    const dueCount = await getReviewableCount();
    const { current: streak, todayDone } = await getStreak();
    const bookName = await getRecentBookName();
    const weeklyCount = await getWeeklyStudyCount();

    // Per-wordlist daily reminders (for books with notif_enabled = true).
    // If any per-list reminders are configured, the user has opted into
    // per-book control — we skip the generic global daily reminder to
    // avoid duplicate "study today" pings. Re-engagement and weekly
    // summary still fire (different purpose).
    const notifBooks = await getBooksForNotifications(hour);

    if (notifBooks.length === 0) {
      // Today's reminder (fires only if notification hour hasn't passed yet)
      if (!todayDone) {
        const content = getDailyContent(tr, dueCount, streak, bookName);
        await scheduleAtDay(0, hour, content.title, content.body);
      }

      // Daily reminders for the next 3 days
      for (const day of [1, 2, 3]) {
        const content = getDailyContent(tr, dueCount, streak, bookName);
        await scheduleAtDay(day, hour, content.title, content.body);
      }
    }

    // Re-engagement: 7, 10, 21, then every 30 days
    for (const day of [7, 10, 21, 51, 81]) {
      const content = getReengagementContent(tr, day, dueCount);
      await scheduleAtDay(day, hour, content.title, content.body);
    }

    // Weekly summary (next Sunday)
    await scheduleWeeklySummary(tr, hour, weeklyCount);

    for (const book of notifBooks) {
      if (book.days === 0) continue; // user deselected all weekdays — skip
      const title = tr.perListTitle.replace('{{title}}', book.title);
      // Schedule for next 7 days, only on days where the bitmask bit is set.
      // Bit 0 = Sunday, ..., Bit 6 = Saturday (matches JS Date.getDay()).
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const target = new Date();
        target.setDate(target.getDate() + dayOffset);
        const dayOfWeek = target.getDay();
        if (!(book.days & (1 << dayOfWeek))) continue;

        // Rotate body across 3 variants by absolute date so the same day
        // always uses the same variant (predictable yet varied).
        const variantIdx = target.getDate() % 3;
        const body = pickPerListBody(tr, book.reviewableCount, streak, variantIdx);

        await scheduleAtDay(dayOffset, book.hour, title, body, book.minute);
      }
    }
  } catch (e) {
    captureError(e, { service: 'notificationService', fn: 'rescheduleNotifications' });
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    captureError(e, { service: 'notificationService', fn: 'cancelAllNotifications' });
  }
}
