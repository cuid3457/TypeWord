// Web stub for notificationService. The pure-function helpers
// (getNotificationTranslations / getDailyContent / getReengagementContent
// / stripBookName) are copied verbatim — they only manipulate strings and
// are used by both push-scheduling and UI label rendering. Native-only
// entry points (request/get/cancel/reschedule) become no-ops.

export function isNotificationAvailable(): boolean {
  return false;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export type PushPlatform = 'android' | 'ios-sandbox' | 'ios-production';

export interface DevicePushToken {
  token: string;
  platform: PushPlatform;
}

export async function getDevicePushToken(): Promise<DevicePushToken | null> {
  return null;
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

export async function rescheduleNotifications(_tr: NotificationTranslations): Promise<void> {
  // no-op on web
}

export async function cancelAllNotifications(): Promise<void> {
  // no-op on web
}
