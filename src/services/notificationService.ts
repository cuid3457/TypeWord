import { getStreak, getPreferredNotificationHour } from './streakService';
import { getReviewableCount, getRecentBookName, getWeeklyStudyCount } from '@src/db/queries';
import { captureError } from './sentry';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
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

async function scheduleAtDay(
  daysFromNow: number,
  hour: number,
  title: string,
  body: string,
): Promise<void> {
  if (!Notifications) return;
  const target = new Date();
  target.setDate(target.getDate() + daysFromNow);
  target.setHours(hour, 0, 0, 0);
  const seconds = Math.floor((target.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
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
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
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

    // Re-engagement: 7, 10, 21, then every 30 days
    for (const day of [7, 10, 21, 51, 81]) {
      const content = getReengagementContent(tr, day, dueCount);
      await scheduleAtDay(day, hour, content.title, content.body);
    }

    // Weekly summary (next Sunday)
    await scheduleWeeklySummary(tr, hour, weeklyCount);
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
