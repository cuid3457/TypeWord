// Unified push sender that routes by platform tag and clears tokens that
// the upstream service reports as unregistered. Edge functions read
// recipient { push_token, push_platform } from profiles and call this.

import { sendApnsPush } from './apns.ts';
import { sendFcmPush } from './fcm.ts';

type Admin = {
  from: (table: string) => {
    update: (data: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<unknown>;
    };
  };
};

export interface DeliverArgs {
  admin: Admin;
  recipientUserId: string;
  pushToken: string;
  pushPlatform: 'android' | 'ios-sandbox' | 'ios-production';
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android channel id; falls back to the app's default 'study-reminders'. */
  channelId?: string;
  /**
   * App icon badge count. Both APNs (iOS) and FCM (Android via Samsung/Pixel
   * launcher) need the absolute post-delivery total — the OS does not auto
   * increment. Without this, the badge sticks at the first push's count.
   */
  badge?: number;
  /**
   * FCM notification tag for Android — passing the same tag for repeat
   * notifications from the same sender collapses them into a single
   * tray entry (Samsung-friendly badge behavior). Ignored on iOS.
   */
  tag?: string;
}

export interface DeliverResult {
  delivered: boolean;
  reason?: string;
}

export async function deliverPush(args: DeliverArgs): Promise<DeliverResult> {
  const result = args.pushPlatform === 'android'
    ? await sendFcmPush({
        fcmToken: args.pushToken,
        title: args.title,
        body: args.body,
        data: args.data,
        channelId: args.channelId ?? 'study-reminders',
        badge: args.badge,
        tag: args.tag,
      })
    : await sendApnsPush({
        deviceToken: args.pushToken,
        environment: args.pushPlatform,
        title: args.title,
        body: args.body,
        data: args.data,
        badge: args.badge,
      });

  if (result.ok) return { delivered: true };

  if (result.unregistered) {
    // Token is dead — clear it so we stop trying.
    await args.admin
      .from('profiles')
      .update({ push_token: null, push_platform: null })
      .eq('user_id', args.recipientUserId);
  }
  return { delivered: false, reason: result.reason };
}
